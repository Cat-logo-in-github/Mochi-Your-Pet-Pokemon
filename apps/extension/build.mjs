import { build, loadEnv } from 'vite';
import { cp, mkdir, readFile, writeFile, open, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { googleBuildSettings } from './google-build-config.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const output = path.join(root, 'dist');
const environment = { ...loadEnv('production', path.resolve(root, '../..'), ''), ...process.env };
await build({
  root,
  resolve: { alias: { '@mochi/shared': path.resolve(root, '../../packages/shared/src/index.ts') } },
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  base: './',
  build: {
    outDir: output,
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    rolldownOptions: {
      input: { popup: path.join(root, 'popup.html'), options: path.join(root, 'options.html') },
    },
  },
});
await build({
  root,
  resolve: { alias: { '@mochi/shared': path.resolve(root, '../../packages/shared/src/index.ts') } },
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: output,
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: path.join(root, 'src/background.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
await build({
  root,
  resolve: { alias: { '@mochi/shared': path.resolve(root, '../../packages/shared/src/index.ts') } },
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: output,
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: path.join(root, 'src/content.tsx'),
      name: 'MochiContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: output,
    emptyOutDir: false,
    target: 'chrome120',
    minify: true,
    lib: {
      entry: path.join(root, 'src/mediaBridge.ts'),
      name: 'MochiMediaBridge',
      formats: ['iife'],
      fileName: () => 'media-bridge.js',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
  resolve: { alias: { '@mochi/shared': path.resolve(root, '../../packages/shared/src/index.ts') } },
});
const manifest = JSON.parse(
  (await readFile(path.join(root, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''),
);
const googlePublic = JSON.parse(await readFile(path.join(root, 'google-public.json'), 'utf8'));
const personalGoogle = process.argv.includes('--personal-google');
const googleSettings = googleBuildSettings(googlePublic, environment, personalGoogle);
delete manifest.oauth2;
Object.assign(manifest, googleSettings);
const clientId = googleSettings.oauth2?.client_id;
await mkdir(path.join(output, 'icons'), { recursive: true });
await cp(path.join(root, 'icons'), path.join(output, 'icons'), { recursive: true });
const petAssets = path.resolve(root, '../../packages/pet-assets/public/mochi');
const petManifest = JSON.parse(await readFile(path.join(petAssets, 'manifest.json'), 'utf8'));
if (
  petManifest.version !== 2 ||
  petManifest.render !== 'sprite-sheet-2d' ||
  petManifest.tileSize !== 256 ||
  petManifest.columns !== 8 ||
  petManifest.rows !== 4 ||
  petManifest.framesPerAtlas !== 32
)
  throw new Error(
    'Build the actual shared version2 2D sprite artwork before packaging the extension.',
  );
const actions = [
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
const directions = [
  'front',
  'front-right',
  'right',
  'back-right',
  'back',
  'back-left',
  'left',
  'front-left',
];
for (const skin of [
  'eevee',
  'vaporeon',
  'jolteon',
  'flareon',
  'espeon',
  'umbreon',
  'leafeon',
  'glaceon',
  'sylveon',
]) {
  for (const action of actions)
    if (!petManifest.clips?.[`${action}_${skin}_front`])
      throw new Error(`Missing sprite action ${action} for ${skin}.`);
  for (const action of ['walk', 'run'])
    for (const direction of directions)
      if (!petManifest.clips?.[`${action}_${skin}_${direction}`])
        throw new Error(`Missing drawn sprite heading ${action}_${skin}_${direction}.`);
  if (!(await stat(path.join(petAssets, 'posters', `${skin}.png`))).isFile())
    throw new Error(`Missing sprite poster for ${skin}.`);
}
const atlasPaths = new Set();
for (const clip of Object.values(petManifest.clips)) {
  if (
    !Number.isInteger(clip.frameCount) ||
    clip.frameCount < 1 ||
    !Number.isFinite(clip.fps) ||
    clip.fps < 0.5 ||
    clip.fps > 60 ||
    !Array.isArray(clip.atlases) ||
    clip.atlases.length !== Math.ceil(clip.frameCount / 32)
  )
    throw new Error('Invalid sprite clip frame timing or atlas count.');
  if (
    clip.frameDurationsMs !== undefined &&
    (!Array.isArray(clip.frameDurationsMs) ||
      clip.frameDurationsMs.length !== clip.frameCount ||
      !clip.frameDurationsMs.every((ms) => Number.isFinite(ms) && ms >= 16 && ms <= 120000) ||
      clip.frameDurationsMs.reduce((sum, ms) => sum + ms, 0) > 600000)
  )
    throw new Error('Invalid sprite frame holds.');
  for (const relative of clip.atlases) {
    if (!/^atlases\/[a-zA-Z0-9_/-]+\.png$/u.test(relative) || relative.split('/').includes('..'))
      throw new Error('Unsafe sprite atlas path.');
    atlasPaths.add(relative);
  }
}
await Promise.all(
  [...atlasPaths].map(async (relative) => {
    const file = await open(path.join(petAssets, relative), 'r');
    try {
      const header = Buffer.alloc(26);
      const { bytesRead } = await file.read(header, 0, 26, 0);
      if (
        bytesRead !== 26 ||
        header.readUInt32BE(0) !== 0x89504e47 ||
        header.readUInt32BE(16) !== 2048 ||
        header.readUInt32BE(20) !== 1024 ||
        header[24] !== 8 ||
        header[25] !== 6
      )
        throw new Error(`Sprite atlas ${relative} must be a 2048x1024 RGBA8 PNG.`);
    } finally {
      await file.close();
    }
  }),
);
await cp(petAssets, path.join(output, 'mochi'), { recursive: true });
await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Mochi extension built. Google OAuth ${clientId ? 'PERSONAL user-owned project only; do not redistribute this build' : 'not configured; local features remain available'}.`,
);

for (const name of ['content.js', 'background.js', 'media-bridge.js']) {
  const code = await readFile(path.join(output, name), 'utf8');
  if (
    /\bprocess\.(?:env|cwd|platform)\b|\beval\s*\(|\bnew\s+Function\s*\(|(?:import|require)\s*\(\s*["']https?:/u.test(
      code,
    )
  )
    throw new Error(`${name} contains an unsupported Node global or dynamic remote code.`);
}
console.log(
  'Browser bundle smoke guards passed: no Node process globals, eval, or remote imports.',
);
