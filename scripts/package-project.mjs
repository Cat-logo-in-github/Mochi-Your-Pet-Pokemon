import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  readTree,
  repositoryRoot,
  sourceIncludes,
  assertSafeEntries,
  assertPublicGoogleConfiguration,
  validateSourceFiles,
  deterministicArchive,
} from './release-utils.mjs';
import { validatePetAssets } from './pet-asset-validation.mjs';

export function validateSpriteSourceReceipt(files) {
  let receipt;
  try {
    receipt = JSON.parse(new TextDecoder().decode(files['SOURCE.json']));
  } catch {
    throw new Error('Sprite source receipt is missing or invalid.');
  }
  if (
    receipt.repository !== 'https://github.com/PMDCollab/SpriteCollab' ||
    !/^[a-f0-9]{40}$/.test(receipt.revision) ||
    !Array.isArray(receipt.files) ||
    !receipt.files.length ||
    receipt.files.length > 20_000
  )
    throw new Error('Sprite source receipt must use a pinned SpriteCollab revision.');
  const seen = new Set();
  for (const record of receipt.files) {
    const name = record.path;
    if (
      typeof name !== 'string' ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.split('/').includes('..') ||
      seen.has(name)
    )
      throw new Error('Sprite source receipt has an unsafe or duplicate path.');
    seen.add(name);
    if (
      typeof record.url !== 'string' ||
      !record.url.startsWith(
        `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${receipt.revision}/`,
      )
    )
      throw new Error(`Sprite source URL is not pinned: ${name}`);
    const bytes = files[name];
    if (
      !bytes?.length ||
      bytes.length !== record.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== record.sha256
    )
      throw new Error(`Sprite source receipt hash/size mismatch: ${name}`);
  }
  return { revision: receipt.revision, files: seen.size };
}

export function validateProjectFiles(files, { quality = true } = {}) {
  validateSourceFiles(files);
  assertPublicGoogleConfiguration(files);
  for (const name of [
    'START-HERE.md',
    'docs/art-production.md',
    'docs/windows-companion.md',
    'packages/pet-assets/CONTRACT.md',
    'packages/pet-assets/public/mochi/manifest.json',
    'packages/pet-assets/source/SOURCE.json',
    'packages/pet-assets/source/LICENSE-SpriteCollab.md',
    'packages/pet-assets/tools/fetch_sprites.py',
    'packages/pet-assets/tools/build_sprites.py',
    'packages/pet-assets/public/mochi/CREDITS.md',
    'packages/pet-assets/public/mochi/SOURCE.json',
    'packages/pet-assets/public/mochi/LICENSE-SpriteCollab.md',
    'apps/windows-companion/Mochi.cs',
    'scripts/build-windows.ps1',
    '.github/workflows/deploy-pages.yml',
    '.github/workflows/release.yml',
  ]) {
    if (!files[name]?.length) throw new Error(`Unified project ZIP missing ${name}`);
  }
  for (const name of ['SOURCE.json', 'LICENSE-SpriteCollab.md']) {
    const source = files[`packages/pet-assets/source/${name}`];
    const runtime = files[`packages/pet-assets/public/mochi/${name}`];
    if (
      source.length !== runtime.length ||
      !source.every((value, index) => value === runtime[index])
    )
      throw new Error(`Source/runtime provenance records differ: ${name}`);
  }
  const sourcePrefix = 'packages/pet-assets/source/';
  validateSpriteSourceReceipt(
    Object.fromEntries(
      Object.entries(files)
        .filter(([name]) => name.startsWith(sourcePrefix))
        .map(([name, bytes]) => [name.slice(sourcePrefix.length), bytes]),
    ),
  );
  const names = Object.keys(files);
  for (const species of [
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
    const prefix = `packages/pet-assets/source/spritecollab/${species}/`;
    for (const name of ['AnimData.xml', 'credits.txt'])
      if (!files[prefix + name]?.length)
        throw new Error(`Unified project ZIP missing source timing/credits: ${prefix}${name}`);
    if (!names.some((name) => name.startsWith(prefix) && /\.png$/i.test(name)))
      throw new Error(`Unified project ZIP needs source PNG sheets for ${species}.`);
  }
  if (names.some((name) => /\.(?:blend\d*|glb|gltf|fbx|obj)$/i.test(name)))
    throw new Error('Unified project ZIP must exclude abandoned 3D prototypes.');
  const prefix = 'packages/pet-assets/public/mochi/';
  const assets = Object.fromEntries(
    Object.entries(files)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, bytes]) => [name.slice(prefix.length), bytes]),
  );
  return validatePetAssets(assets, { quality });
}

export async function packageProject() {
  const files = await readTree(repositoryRoot, sourceIncludes);
  assertSafeEntries(files);
  const report = validateProjectFiles(files);
  const bytes = deterministicArchive(files);
  await mkdir(path.join(repositoryRoot, 'dist'), { recursive: true });
  const output = path.join(repositoryRoot, 'dist/mochi-project.zip');
  await writeFile(output, bytes);
  console.log(
    `Created unified project: ${output} (${bytes.length.toLocaleString('en')} bytes; ${Object.keys(files).length} source/assets files).`,
  );
  console.log(
    `Included verified sprite library: ${report.clips} clips, ${report.frames} real frames, source sprite sheets/timing plus native/browser/web applications.`,
  );
  return { bytes, files, report, output };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await packageProject();
