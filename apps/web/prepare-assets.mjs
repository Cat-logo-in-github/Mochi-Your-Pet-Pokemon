import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const appRoot = fileURLToPath(new URL('.', import.meta.url));
export async function prepareAssets() {
  const source = path.resolve(appRoot, '../../packages/pet-assets/public/mochi');
  const destination = path.resolve(appRoot, 'public/mochi');
  const allowedRoot = path.resolve(appRoot, 'public') + path.sep;
  if (!destination.startsWith(allowedRoot) || path.basename(destination) !== 'mochi')
    throw new Error('Refused unsafe generated asset destination.');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error(
      'Shared Mochi sprite assets are missing. Restore packages/pet-assets/public/mochi from the project ZIP or run the offline sprite builder.',
    );
  }
  if (manifest.version !== 2 || manifest.render !== 'sprite-sheet-2d')
    throw new Error('Shared sprite asset manifest is incompatible.');
  await mkdir(path.dirname(destination), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
  console.log('Shared sprite assets prepared for the website.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await prepareAssets();
