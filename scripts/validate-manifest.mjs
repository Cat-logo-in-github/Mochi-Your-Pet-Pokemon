import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readTree,
  repositoryRoot,
  validateManifestFiles,
  assertSafeEntries,
} from './release-utils.mjs';

export async function validateManifest(
  directory = path.join(repositoryRoot, 'apps/extension/dist'),
) {
  const files = await readTree(directory);
  assertSafeEntries(files);
  const manifest = validateManifestFiles(files);
  console.log(
    `Manifest valid: ${manifest.name} ${manifest.version}; ${Object.keys(files).length} files; ${manifest.permissions.join(', ')}`,
  );
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await validateManifest(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
}
