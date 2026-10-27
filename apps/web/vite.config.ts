import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { normalizeRepository } from './src/downloads';
import { defineConfig } from 'vite';

const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default defineConfig({
  define: {
    __MOCHI_REPOSITORY__: JSON.stringify(
      normalizeRepository(process.env.MOCHI_REPOSITORY || process.env.GITHUB_REPOSITORY) || '',
    ),
    __MOCHI_BUILD_VERSION__: JSON.stringify(String(packageInfo.version)),
  },
  base: process.env.MOCHI_BASE_PATH || './',
  resolve: {
    alias: {
      '@mochi/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  build: { sourcemap: false, target: 'es2022' },
});
