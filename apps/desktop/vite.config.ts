import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  clearScreen: false,
  publicDir: fileURLToPath(new URL('../../packages/pet-assets/public', import.meta.url)),
  resolve: {
    alias: {
      '@mochi/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: { target: ['chrome120', 'safari15'], sourcemap: false },
});
