import path from 'node:path';
import { readTree, repositoryRoot } from './release-utils.mjs';
import { validatePetAssets } from './pet-asset-validation.mjs';
const assets = await readTree(path.join(repositoryRoot, 'packages/pet-assets/public/mochi'));
const report = validatePetAssets(assets);
console.log(
  `2D sprite assets verified: ${report.clips} clips, ${report.atlases} atlases, ${report.frames} real RGBA frames; ${report.shortestSeconds.toFixed(2)}-${report.longestSeconds.toFixed(2)} seconds.`,
);
