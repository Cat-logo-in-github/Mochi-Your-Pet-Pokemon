import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { prepareAssets } from './prepare-assets.mjs';
await prepareAssets();
await build({ root: fileURLToPath(new URL('.', import.meta.url)) });
