import { pathToFileURL } from 'node:url';
import path from 'node:path';
export function chooseReleaseTag(version, sourceSha, existingSha, runNumber) {
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sourceSha) ||
    (existingSha && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(existingSha)) ||
    !/^[1-9]\d*$/.test(String(runNumber))
  )
    throw new Error('Invalid release version, source revision, or run number.');
  const base = `v${version}`;
  return existingSha && existingSha.toLowerCase() !== sourceSha.toLowerCase()
    ? `${base}-build.${runNumber}`
    : base;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(chooseReleaseTag(...process.argv.slice(2)));
