import { createHash } from 'node:crypto';
import {
  assertPublicGoogleConfiguration,
  assertSafeEntries,
  validateSourceFiles,
  validateManifestFiles,
} from './release-utils.mjs';

export const DOWNLOAD_FILES = {
  windows: 'mochi-windows-companion.zip',
  browser: 'mochi-chrome-extension.zip',
  source: 'mochi-project.zip',
};
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function createDownloadManifest(version, bundles) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid download version.');
  const assets = {};
  for (const [kind, file] of Object.entries(DOWNLOAD_FILES)) {
    const bytes = bundles.get(file);
    if (bytes?.length) assets[kind] = { file, sha256: sha256(bytes), bytes: bytes.length };
  }
  return { version, assets };
}
export function validateDownloadManifest(value, version, bundles) {
  const expected = createDownloadManifest(version, bundles);
  if (JSON.stringify(value) !== JSON.stringify(expected))
    throw new Error('Download manifest does not match the actual release archives.');
}
export function composeCompleteFiles(source, windows, browser) {
  validateSourceFiles(source);
  assertPublicGoogleConfiguration(source);
  validateManifestFiles(browser);
  assertPublicGoogleConfiguration(browser);
  if (Object.keys(source).some((name) => /^(?:Run-Windows|Browser-Extension)\//.test(name)))
    throw new Error('Source already contains runtime handoff folders.');
  const exe = windows['Mochi.exe'];
  if (!exe || exe.length < 64 || exe[0] !== 0x4d || exe[1] !== 0x5a)
    throw new Error('Complete handoff requires an actual Windows executable.');
  const result = { ...source };
  for (const [prefix, files] of [
    ['Run-Windows/', windows],
    ['Browser-Extension/', browser],
  ])
    for (const [name, bytes] of Object.entries(files)) result[prefix + name] = bytes;
  assertSafeEntries(result);
  assertPublicGoogleConfiguration(result);
  return result;
}
export function validateCompleteFiles(files, source, windows, browser) {
  const expected = composeCompleteFiles(source, windows, browser);
  if (Object.keys(files).length !== Object.keys(expected).length)
    throw new Error('Complete handoff has unexpected or missing files.');
  for (const [name, bytes] of Object.entries(expected))
    if (!files[name] || sha256(files[name]) !== sha256(bytes))
      throw new Error(`Complete handoff differs from its verified release input: ${name}`);
}
