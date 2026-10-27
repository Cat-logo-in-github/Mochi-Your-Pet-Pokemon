import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@mochi/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    maxWorkers: 2,
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
  },
});
