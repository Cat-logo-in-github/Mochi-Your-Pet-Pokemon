import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import {
  readTree,
  repositoryRoot,
  assertSafeEntries,
  assertPublicGoogleConfiguration,
  validateManifestFiles,
  assertFile,
  deterministicArchive,
  validateWebsiteFiles,
  validateWindowsFiles,
} from './release-utils.mjs';
import { packageProject } from './package-project.mjs';
import { createDownloadManifest, composeCompleteFiles, sha256 } from './release-handoff.mjs';

const output = path.join(repositoryRoot, 'dist');
const builtExtension = path.join(repositoryRoot, 'apps/extension/dist');
const builtWeb = path.join(repositoryRoot, 'apps/web/dist');
await assertFile(builtExtension, 'manifest.json');
await assertFile(builtWeb, 'index.html');
await mkdir(output, { recursive: true });
const extension = await readTree(builtExtension, (name) => !name.endsWith('.map'));
assertSafeEntries(extension);
assertPublicGoogleConfiguration(extension);
validateManifestFiles(extension);
const project = await packageProject();
const version = JSON.parse(new TextDecoder().decode(project.files['package.json'])).version;
const extensionVersion = JSON.parse(new TextDecoder().decode(extension['manifest.json'])).version;
if (extensionVersion !== version) throw new Error('Source and extension release versions differ.');
const bundles = new Map([
  ['mochi-project.zip', project.bytes],
  ['mochi-chrome-extension.zip', deterministicArchive(extension)],
]);
let nativeFiles;
try {
  const nativeArchive = new Uint8Array(
    await readFile(path.join(output, 'mochi-windows-companion.zip')),
  );
  nativeFiles = unzipSync(nativeArchive);
  assertSafeEntries(nativeFiles);
  validateWindowsFiles(nativeFiles);
  bundles.set('mochi-windows-companion.zip', nativeArchive);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const downloadManifest = createDownloadManifest(version, bundles);
for (const directory of [
  path.join(repositoryRoot, 'apps/web/public/downloads'),
  path.join(builtWeb, 'downloads'),
]) {
  await mkdir(directory, { recursive: true });
  for (const obsolete of [
    'mochi-source.zip',
    'mochi-website.zip',
    'mochi-windows-companion.zip',
    'mochi-project.zip',
    'mochi-chrome-extension.zip',
    'manifest.json',
  ])
    await rm(path.join(directory, obsolete), { force: true });
  for (const [name, bytes] of bundles) await writeFile(path.join(directory, name), bytes);
  await writeFile(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(downloadManifest, null, 2)}\n`,
  );
}
// Keep this archive lean; Pages deploys the complete dist tree with downloads.
const website = await readTree(builtWeb, (name) => !name.startsWith('downloads/'));
assertSafeEntries(website);
validateWebsiteFiles(website);
bundles.set('mochi-website.zip', deterministicArchive(website));
if (nativeFiles) {
  const complete = composeCompleteFiles(project.files, nativeFiles, extension);
  bundles.set(`mochi-complete-${version}.zip`, deterministicArchive(complete));
}
for (const [name, bytes] of bundles) {
  await writeFile(path.join(output, name), bytes);
  console.log(`Created dist/${name} (${bytes.length.toLocaleString('en')} bytes)`);
}
const checksums =
  [...bundles].map(([name, bytes]) => `${sha256(bytes)}  ${name}`).join('\n') + '\n';
await writeFile(path.join(output, 'SHA256SUMS.txt'), checksums);
console.log(
  nativeFiles
    ? `Complete handoff: dist/mochi-complete-${version}.zip; source is at root, with Run-Windows and Browser-Extension ready to use.`
    : 'Source and browser packages created. Build Windows to include the complete runnable handoff.',
);
