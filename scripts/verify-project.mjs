import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { repositoryRoot, assertSafeEntries } from './release-utils.mjs';
import { validateProjectFiles } from './package-project.mjs';
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repositoryRoot, 'dist/mochi-project.zip');
const files = unzipSync(new Uint8Array(await readFile(target)));
assertSafeEntries(files);
const report = validateProjectFiles(files);
console.log(
  `Unified project verified: ${Object.keys(files).length} files, ${report.clips} sprite clips, ${report.frames} real frames; START-HERE.md and all app/art/build sources present.`,
);
