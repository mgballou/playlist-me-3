import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@pm/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@pm/spotify': fileURLToPath(new URL('../../packages/spotify/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'web',
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
