import { createHash } from 'node:crypto';
import { unzlibSync } from 'fflate';

const ACTIONS = [
  'idle',
  'walk',
  'run',
  'turn',
  'stretch',
  'groom',
  'pounce',
  'play',
  'feed',
  'happy',
  'sleep',
  'alert',
  'carry',
];
const SKINS = [
  'eevee',
  'vaporeon',
  'jolteon',
  'flareon',
  'espeon',
  'umbreon',
  'leafeon',
  'glaceon',
  'sylveon',
];
const DIRECTIONS = [
  'front',
  'front-right',
  'right',
  'back-right',
  'back',
  'back-left',
  'left',
  'front-left',
];
const decoder = new TextDecoder();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const u32 = (bytes, offset) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
const fail = (message) => {
  throw new Error(`Pet asset validation: ${message}`);
};

export function pngDimensions(bytes) {
  if (
    !bytes ||
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  )
    fail('expected a PNG file.');
  if (decoder.decode(bytes.subarray(12, 16)) !== 'IHDR') fail('PNG has no IHDR.');
  const width = u32(bytes, 16),
    height = u32(bytes, 20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 32 * 1024 * 1024)
    fail('PNG dimensions exceed the runtime budget.');
  return { width, height, bitDepth: bytes[24], colorType: bytes[25], interlace: bytes[28] };
}

export function decodeRgbaPng(bytes) {
  const info = pngDimensions(bytes);
  if (info.bitDepth !== 8 || info.colorType !== 6 || info.interlace !== 0)
    fail('atlases must use non-interlaced 8-bit RGBA PNGs.');
  const chunks = [];
  let ended = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = u32(bytes, offset);
    if (length > bytes.length - offset - 12) fail('truncated PNG chunk.');
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') {
      ended = true;
      break;
    }
    offset += length + 12;
  }
  if (!ended || !chunks.length) fail('PNG image data is incomplete.');
  const compressed = new Uint8Array(chunks.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of chunks) {
    compressed.set(part, cursor);
    cursor += part.length;
  }
  const stride = info.width * 4;
  const expected = info.height * (stride + 1);
  const scanlines = unzlibSync(compressed, { out: new Uint8Array(expected) });
  if (scanlines.length !== expected) fail('PNG pixel-data size does not match IHDR.');
  const pixels = new Uint8Array(info.height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < info.height; y++) {
    const filter = scanlines[y * (stride + 1)];
    if (filter > 4) fail('unsupported PNG filter.');
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x,
        raw = scanlines[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[at - 4] : 0,
        up = y ? pixels[at - stride] : 0,
        upperLeft = y && x >= 4 ? pixels[at - stride - 4] : 0;
      pixels[at] =
        (raw +
          (filter === 0
            ? 0
            : filter === 1
              ? left
              : filter === 2
                ? up
                : filter === 3
                  ? Math.floor((left + up) / 2)
                  : paeth(left, up, upperLeft))) &
        255;
    }
  }
  return { ...info, pixels };
}

export function parsePetManifest(bytes) {
  let manifest;
  try {
    manifest = JSON.parse(decoder.decode(bytes).replace(/^\uFEFF/, ''));
  } catch {
    fail('manifest.json is missing or invalid JSON.');
  }
  if (manifest.version !== 2 || manifest.render !== 'sprite-sheet-2d')
    fail('a version 2 sprite-sheet-2d manifest is required.');
  for (const key of ['tileSize', 'columns', 'rows', 'framesPerAtlas'])
    if (!Number.isInteger(manifest[key]) || manifest[key] < 1) fail(`invalid ${key}.`);
  if (
    manifest.tileSize < 32 ||
    manifest.tileSize > 512 ||
    manifest.columns > 16 ||
    manifest.rows > 16 ||
    manifest.framesPerAtlas !== manifest.columns * manifest.rows
  )
    fail('invalid atlas grid or tile budget.');
  if (!manifest.clips || typeof manifest.clips !== 'object' || Array.isArray(manifest.clips))
    fail('clip dictionary is missing.');
  return manifest;
}

export function validatePetAssets(files, { quality = true, complete = true } = {}) {
  const manifest = parsePetManifest(files['manifest.json']);
  const clipEntries = Object.entries(manifest.clips);
  if (!clipEntries.length || clipEntries.length > 4096)
    fail('clip count is outside the bounded budget.');
  const report = {
    render: manifest.render,
    clips: clipEntries.length,
    atlases: 0,
    frames: 0,
    longestSeconds: 0,
    shortestSeconds: Infinity,
    alphaFrames: 0,
    byClip: {},
  };
  const seenAtlases = new Set();
  const checkedFrameHashes = new Map();
  for (const [key, clip] of clipEntries) {
    if (
      (!ACTIONS.includes(clip.action) && !/^pmd_[a-z0-9][a-z0-9_]{0,63}$/.test(clip.action)) ||
      !SKINS.includes(clip.skin) ||
      !DIRECTIONS.includes(clip.direction)
    )
      fail(`unknown clip identity ${key}.`);
    if (key !== `${clip.action}_${clip.skin}_${clip.direction}`)
      fail(`clip key does not match its identity: ${key}.`);
    if (
      !Number.isInteger(clip.frameCount) ||
      clip.frameCount < 1 ||
      clip.frameCount > 1800 ||
      !Number.isFinite(clip.fps) ||
      clip.fps < 0.5 ||
      clip.fps > 60 ||
      typeof clip.loop !== 'boolean'
    )
      fail(`invalid animation timing for ${key}.`);
    if (
      clip.frameDurationsMs !== undefined &&
      (!Array.isArray(clip.frameDurationsMs) ||
        clip.frameDurationsMs.length !== clip.frameCount ||
        clip.frameDurationsMs.some(
          (value) => !Number.isFinite(value) || value <= 0 || value > 60_000,
        ))
    )
      fail(`invalid per-frame timing for ${key}.`);
    const seconds = clip.frameDurationsMs
      ? clip.frameDurationsMs.reduce((sum, value) => sum + value, 0) / 1000
      : clip.frameCount / clip.fps;
    if (!Number.isFinite(clip.duration) || Math.abs(clip.duration - seconds) > 0.06 || seconds > 60)
      fail(`duration does not match real frames for ${key}.`);
    if (
      !Array.isArray(clip.atlases) ||
      clip.atlases.length !== Math.ceil(clip.frameCount / manifest.framesPerAtlas)
    )
      fail(`atlas count does not cover every frame in ${key}.`);
    const frameHashes = [];
    for (let atlasIndex = 0; atlasIndex < clip.atlases.length; atlasIndex++) {
      const name = clip.atlases[atlasIndex];
      if (
        typeof name !== 'string' ||
        !/^atlases\/[a-z0-9_-]+\.png$/.test(name) ||
        !files[name]?.length
      )
        fail(`missing or unsafe atlas ${String(name)} for ${key}.`);
      const info = pngDimensions(files[name]);
      if (
        info.width !== manifest.tileSize * manifest.columns ||
        info.height !== manifest.tileSize * manifest.rows ||
        info.colorType !== 6 ||
        info.bitDepth !== 8
      )
        fail(`atlas dimensions/alpha do not match the grid: ${name}.`);
      if (!seenAtlases.has(name)) {
        report.atlases++;
        seenAtlases.add(name);
      }
      if (!quality) continue;
      const used = Math.min(
        manifest.framesPerAtlas,
        clip.frameCount - atlasIndex * manifest.framesPerAtlas,
      );
      const checked = checkedFrameHashes.get(name);
      if (checked && checked.length >= used) {
        frameHashes.push(...checked.slice(0, used));
        report.alphaFrames += used;
        continue;
      }
      const { pixels, width } = decodeRgbaPng(files[name]);
      const atlasHashes = [];
      for (let cell = 0; cell < used; cell++) {
        const tile = manifest.tileSize,
          frame = new Uint8Array(tile * tile * 4);
        const ox = (cell % manifest.columns) * tile,
          oy = Math.floor(cell / manifest.columns) * tile;
        let nonzero = 0,
          transparent = 0,
          opaque = 0,
          edgeHits = 0;
        for (let y = 0; y < tile; y++) {
          const source = ((oy + y) * width + ox) * 4;
          frame.set(pixels.subarray(source, source + tile * 4), y * tile * 4);
        }
        for (let offset = 0; offset < frame.length; offset += 4) {
          const alpha = frame[offset + 3];
          if (alpha > 2) nonzero++;
          else {
            transparent++;
            frame[offset] = frame[offset + 1] = frame[offset + 2] = 0;
          }
          if (alpha >= 200) opaque++;
          if (alpha > 20) {
            const pixel = offset / 4,
              x = pixel % tile,
              y = Math.floor(pixel / tile);
            if (x < 2 || y < 2 || x >= tile - 2 || y >= tile - 2) edgeHits++;
          }
        }
        if (nonzero < 8 || opaque < 4 || transparent < tile * tile * 0.05)
          fail(
            `empty, opaque-background, or invisible frame ${atlasIndex * manifest.framesPerAtlas + cell} in ${key}.`,
          );
        if (edgeHits) fail(`clipped frame or insufficient canvas margin in ${key}.`);
        report.alphaFrames++;
        const frameHash = hash(frame);
        frameHashes.push(frameHash);
        atlasHashes.push(frameHash);
      }
      checkedFrameHashes.set(name, atlasHashes);
    }
    const uniqueFrames = new Set(frameHashes).size;
    // Pixel art holds frames on purpose and may map several pet reactions to one source
    // animation. Locomotion must still have at least two genuinely different poses.
    if (quality && ['walk', 'run'].includes(clip.action) && uniqueFrames < 2)
      fail(
        `${key} has no distinct locomotion poses; duplicate-frame animation is not a valid walking clip.`,
      );
    report.frames += clip.frameCount;
    report.longestSeconds = Math.max(report.longestSeconds, seconds);
    report.shortestSeconds = Math.min(report.shortestSeconds, seconds);
    report.byClip[key] = { frames: clip.frameCount, seconds, uniqueFrames };
  }
  if (complete) {
    for (const skin of SKINS)
      for (const action of ACTIONS) {
        if (!manifest.clips[`${action}_${skin}_front`]) fail(`missing ${skin} ${action} clip.`);
      }
    for (const skin of SKINS)
      for (const action of ['walk', 'run'])
        for (const direction of DIRECTIONS) {
          if (!manifest.clips[`${action}_${skin}_${direction}`])
            fail(`missing directional locomotion ${action}_${skin}_${direction}.`);
        }
  }
  if (complete || manifest.sourceActionsCatalog !== undefined) {
    if (!Array.isArray(manifest.sourceActionsCatalog) || !manifest.sourceActionsCatalog.length)
      fail('complete source animation catalog is missing.');
    const available = new Set();
    const seenActions = new Set();
    for (const entry of manifest.sourceActionsCatalog) {
      if (
        !entry ||
        !/^pmd_[a-z0-9][a-z0-9_]{0,63}$/.test(entry.action) ||
        seenActions.has(entry.action) ||
        typeof entry.label !== 'string' ||
        !entry.label.trim() ||
        !Array.isArray(entry.skins) ||
        !entry.skins.length ||
        entry.skins.some((skin) => !SKINS.includes(skin))
      )
        fail('invalid source animation catalog entry.');
      seenActions.add(entry.action);
      for (const skin of entry.skins) {
        available.add(skin);
        const directions = entry.directionsBySkin?.[skin] || ['front'];
        if (
          !Array.isArray(directions) ||
          !directions.includes('front') ||
          new Set(directions).size !== directions.length ||
          directions.some((direction) => !DIRECTIONS.includes(direction))
        )
          fail(`invalid available source directions for ${entry.action}_${skin}.`);
        for (const direction of directions)
          if (!manifest.clips[`${entry.action}_${skin}_${direction}`])
            fail(`missing source animation heading ${entry.action}_${skin}_${direction}.`);
      }
    }
    if (complete)
      for (const skin of SKINS)
        if (!available.has(skin)) fail(`source animation catalog omits ${skin}.`);
    for (const clip of Object.values(manifest.clips))
      if (
        clip.action.startsWith('pmd_') &&
        !manifest.sourceActionsCatalog.some(
          (entry) =>
            entry.action === clip.action &&
            entry.skins.includes(clip.skin) &&
            (!entry.directionsBySkin?.[clip.skin] ||
              entry.directionsBySkin[clip.skin].includes(clip.direction)),
        )
      )
        fail(`source clip is not exposed in the animation catalog: ${clip.action}_${clip.skin}.`);
  }
  if (complete) {
    for (const skin of SKINS) {
      const name = `posters/${skin}.png`;
      if (!files[name]?.length) fail(`missing static companion poster ${name}.`);
      const poster = pngDimensions(files[name]);
      if (
        poster.width !== manifest.tileSize ||
        poster.height !== manifest.tileSize ||
        poster.colorType !== 6 ||
        poster.bitDepth !== 8
      )
        fail(`poster dimensions/alpha do not match its tile: ${name}.`);
    }
  }
  if (complete) {
    for (const name of ['CREDITS.md', 'LICENSE-SpriteCollab.md', 'SOURCE.json'])
      if (!files[name]?.length) fail(`missing runtime attribution/provenance ${name}.`);
  }
  return report;
}
