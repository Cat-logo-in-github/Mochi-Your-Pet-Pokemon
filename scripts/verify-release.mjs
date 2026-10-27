import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import {
  assertFile,
  assertSafeEntries,
  assertPublicGoogleConfiguration,
  repositoryRoot,
  validateManifestFiles,
  validateWebsiteFiles,
  validateWindowsFiles,
} from './release-utils.mjs';
import { validateProjectFiles } from './package-project.mjs';
import { validateCompleteFiles, validateDownloadManifest, sha256 } from './release-handoff.mjs';
const output = path.join(repositoryRoot, 'dist');
const checksumText = await readFile(await assertFile(output, 'SHA256SUMS.txt'), 'utf8');
const checksums = new Map(
  checksumText
    .trim()
    .split('\n')
    .map((line) => {
      const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9.-]+\.zip)$/.exec(line.trim());
      if (!match) throw new Error('Invalid release checksum line.');
      return [match[2], match[1]];
    }),
);
const native = checksums.has('mochi-windows-companion.zip');
const version = JSON.parse(
  await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
).version;
const completeName = `mochi-complete-${version}.zip`;
const downloadable = [
  'mochi-project.zip',
  'mochi-chrome-extension.zip',
  ...(native ? ['mochi-windows-companion.zip'] : []),
];
const archives = [...downloadable, 'mochi-website.zip', ...(native ? [completeName] : [])];
if (checksums.size !== archives.length || archives.some((name) => !checksums.has(name)))
  throw new Error('Checksum list must name exactly the expected release archives.');
const archiveBytes = new Map();
const archiveFiles = new Map();
let canonicalAssets = new Map();
function matchRuntimeAssets(files, prefix) {
  for (const [name, digest] of canonicalAssets) {
    const bytes = files[prefix + name];
    if (!bytes || sha256(bytes) !== digest)
      throw new Error(`Stale or missing shared sprite runtime asset: ${prefix}${name}`);
  }
  if (Object.keys(files).filter((name) => name.startsWith(prefix)).length !== canonicalAssets.size)
    throw new Error(`Unexpected shared sprite runtime assets: ${prefix}`);
}
for (const name of archives) {
  const archive = new Uint8Array(await readFile(await assertFile(output, name)));
  const digest = sha256(archive);
  if (checksums.get(name) !== digest) throw new Error(`Checksum mismatch for ${name}`);
  archiveBytes.set(name, archive);
  if (downloadable.includes(name))
    for (const directory of ['apps/web/public/downloads', 'apps/web/dist/downloads']) {
      const download = await readFile(await assertFile(path.join(repositoryRoot, directory), name));
      if (sha256(download) !== digest)
        throw new Error(`Stale website download: ${directory}/${name}`);
    }
  const files = unzipSync(archive);
  archiveFiles.set(name, files);
  assertSafeEntries(files);
  assertPublicGoogleConfiguration(files);
  if (name === 'mochi-project.zip') {
    validateProjectFiles(files);
    if (JSON.parse(new TextDecoder().decode(files['package.json'])).version !== version)
      throw new Error('Source archive release version differs.');
    const prefix = 'packages/pet-assets/public/mochi/';
    canonicalAssets = new Map(
      Object.entries(files)
        .filter(([file]) => file.startsWith(prefix))
        .map(([file, bytes]) => [file.slice(prefix.length), sha256(bytes)]),
    );
  } else if (name === 'mochi-chrome-extension.zip') {
    const manifest = validateManifestFiles(files);
    if (manifest.version !== version) throw new Error('Browser archive release version differs.');
    matchRuntimeAssets(files, 'mochi/');
  } else if (name === 'mochi-windows-companion.zip') {
    validateWindowsFiles(files);
    matchRuntimeAssets(files, 'assets/mochi/');
  } else if (name === completeName) {
    validateCompleteFiles(
      files,
      archiveFiles.get('mochi-project.zip'),
      archiveFiles.get('mochi-windows-companion.zip'),
      archiveFiles.get('mochi-chrome-extension.zip'),
    );
  } else {
    validateWebsiteFiles(files);
    matchRuntimeAssets(files, 'mochi/');
  }
  console.log(`Verified ${name}: ${Object.keys(files).length} safe files, matching SHA-256.`);
}
for (const directory of ['apps/web/public/downloads', 'apps/web/dist/downloads']) {
  const manifest = JSON.parse(
    await readFile(await assertFile(path.join(repositoryRoot, directory), 'manifest.json'), 'utf8'),
  );
  validateDownloadManifest(manifest, version, archiveBytes);
}
console.log(
  native
    ? `Release verification passed. Complete handoff: ${completeName}.`
    : 'Source/browser release verification passed.',
);
