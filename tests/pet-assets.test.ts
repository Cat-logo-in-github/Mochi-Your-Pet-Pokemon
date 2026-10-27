import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { decodeRgbaPng, validatePetAssets } from '../scripts/pet-asset-validation.mjs';

const text = new TextEncoder();
const join = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
function crc(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const name = text.encode(type),
    result = new Uint8Array(data.length + 12);
  new DataView(result.buffer).setUint32(0, data.length);
  result.set(name, 4);
  result.set(data, 8);
  new DataView(result.buffer).setUint32(data.length + 8, crc(join([name, data])));
  return result;
}
function png(width: number, height: number, pixels: Uint8Array) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const lines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    lines.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return join([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(lines)),
    chunk('IEND', new Uint8Array()),
  ]);
}
function fixture({ duplicates = false, opaque = false, edge = false } = {}) {
  const files: Record<string, Uint8Array> = {};
  const atlases = [];
  for (let index = 0; index < 3; index++) {
    const pixels = new Uint8Array(64 * 64 * 4);
    if (opaque) for (let at = 3; at < pixels.length; at += 4) pixels[at] = 255;
    for (let cell = 0; cell < 4; cell++) {
      const frame = duplicates ? 0 : index * 4 + cell,
        ox = (cell % 2) * 32,
        oy = Math.floor(cell / 2) * 32;
      for (let y = 9; y < 19; y++)
        for (let x = (edge ? 0 : 8) + (frame % 8); x < (edge ? 6 : 14) + (frame % 8); x++) {
          const at = ((oy + y) * 64 + ox + x) * 4;
          pixels[at] = 180;
          pixels[at + 1] = 130;
          pixels[at + 2] = 220;
          pixels[at + 3] = 255;
        }
    }
    const name = `atlases/idle_eevee_front_${index}.png`;
    files[name] = png(64, 64, pixels);
    atlases.push(name);
  }
  files['manifest.json'] = text.encode(
    JSON.stringify({
      version: 2,
      render: 'sprite-sheet-2d',
      tileSize: 32,
      columns: 2,
      rows: 2,
      framesPerAtlas: 4,
      clips: {
        idle_eevee_front: {
          action: 'idle',
          skin: 'eevee',
          direction: 'front',
          fps: 8,
          frameCount: 12,
          loop: true,
          atlases,
          duration: 1.5,
        },
      },
    }),
  );
  return files;
}

describe('2D sprite asset quality guards', () => {
  it('decodes real RGBA frames, verifies transparency and counts distinct animation frames', () => {
    const files = fixture();
    const image = decodeRgbaPng(files['atlases/idle_eevee_front_0.png']);
    expect(image.width).toBe(64);
    expect(image.pixels.length).toBe(64 * 64 * 4);
    const report = validatePetAssets(files, { complete: false });
    expect(report).toMatchObject({ clips: 1, atlases: 3, frames: 12, alphaFrames: 12 });
    expect(report.byClip.idle_eevee_front.uniqueFrames).toBe(8);
  });
  it('rejects a missing atlas and declared duration that does not match the frames', () => {
    const files = fixture();
    delete files['atlases/idle_eevee_front_1.png'];
    expect(() => validatePetAssets(files, { complete: false })).toThrow('missing or unsafe atlas');
    const bad = fixture();
    const manifest = JSON.parse(new TextDecoder().decode(bad['manifest.json']));
    manifest.clips.idle_eevee_front.duration = 8;
    bad['manifest.json'] = text.encode(JSON.stringify(manifest));
    expect(() => validatePetAssets(bad, { complete: false })).toThrow('duration does not match');
  });
  it('rejects opaque backgrounds and static walking while allowing shared source reactions', () => {
    expect(() => validatePetAssets(fixture({ opaque: true }), { complete: false })).toThrow(
      'opaque-background',
    );
    const stillWalk = fixture({ duplicates: true });
    const stillManifest = JSON.parse(new TextDecoder().decode(stillWalk['manifest.json']));
    const stillClip = stillManifest.clips.idle_eevee_front;
    stillManifest.clips = { walk_eevee_front: { ...stillClip, action: 'walk' } };
    stillWalk['manifest.json'] = text.encode(JSON.stringify(stillManifest));
    expect(() => validatePetAssets(stillWalk, { complete: false })).toThrow(
      'duplicate-frame animation',
    );
    expect(() => validatePetAssets(fixture({ edge: true }), { complete: false })).toThrow(
      'clipped frame',
    );
    const copied = fixture();
    const manifest = JSON.parse(new TextDecoder().decode(copied['manifest.json']));
    const original = manifest.clips.idle_eevee_front;
    const renamed = original.atlases.map((name: string) => {
      const other = name.replace('idle_', 'happy_');
      copied[other] = copied[name];
      return other;
    });
    manifest.clips.happy_eevee_front = { ...original, action: 'happy', atlases: renamed };
    copied['manifest.json'] = text.encode(JSON.stringify(manifest));
    expect(() => validatePetAssets(copied, { complete: false })).not.toThrow();
  });
  it('counts reused atlas files once while validating every aliased clip frame', () => {
    const files = fixture();
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    manifest.clips.happy_eevee_front = { ...manifest.clips.idle_eevee_front, action: 'happy' };
    files['manifest.json'] = text.encode(JSON.stringify(manifest));
    const report = validatePetAssets(files, { complete: false });
    expect(report).toMatchObject({ clips: 2, atlases: 3, frames: 24, alphaFrames: 24 });
    expect(report.byClip.happy_eevee_front.uniqueFrames).toBe(8);
  });
  it('preserves variable source frame holds and accepts the additional source-action catalog', () => {
    const files = fixture();
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    const original = manifest.clips.idle_eevee_front;
    const holds = Array.from({ length: 12 }, (_, index) => (index % 2 ? 200 : 100));
    manifest.clips = {
      pmd_idle_eevee_front: {
        ...original,
        action: 'pmd_idle',
        frameDurationsMs: holds,
        duration: 1.8,
        fps: 60,
      },
    };
    files['manifest.json'] = text.encode(JSON.stringify(manifest));
    expect(
      validatePetAssets(files, { complete: false }).byClip.pmd_idle_eevee_front.seconds,
    ).toBeCloseTo(1.8);
    manifest.clips.pmd_idle_eevee_front.frameDurationsMs = [100];
    files['manifest.json'] = text.encode(JSON.stringify(manifest));
    expect(() => validatePetAssets(files, { complete: false })).toThrow('invalid per-frame timing');
  });
  it('keeps a one-row source animation honest and checks only its declared available headings', () => {
    const files = fixture();
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    const clip = { ...manifest.clips.idle_eevee_front, action: 'pmd_sleep' };
    manifest.clips = { pmd_sleep_eevee_front: clip };
    manifest.sourceActionsCatalog = [
      {
        action: 'pmd_sleep',
        label: 'Sleep',
        skins: ['eevee'],
        directionsBySkin: { eevee: ['front'] },
      },
    ];
    files['manifest.json'] = text.encode(JSON.stringify(manifest));
    expect(() => validatePetAssets(files, { complete: false })).not.toThrow();
    manifest.sourceActionsCatalog[0].directionsBySkin.eevee.push('left');
    files['manifest.json'] = text.encode(JSON.stringify(manifest));
    expect(() => validatePetAssets(files, { complete: false })).toThrow(
      'missing source animation heading pmd_sleep_eevee_left',
    );
    manifest.sourceActionsCatalog[0].directionsBySkin.eevee = ['front'];
    manifest.clips.pmd_sleep_eevee_left = { ...clip, direction: 'left' };
    files['manifest.json'] = text.encode(JSON.stringify(manifest));
    expect(() => validatePetAssets(files, { complete: false })).toThrow(
      'not exposed in the animation catalog',
    );
  });
  it('requires complete action/skin/directional coverage for a production library', () => {
    expect(() => validatePetAssets(fixture())).toThrow('missing eevee walk clip');
  });
});
