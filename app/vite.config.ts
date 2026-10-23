import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  // relative base so the build works from any sub path (GitHub Pages, file shares, Tauri)
  base: './',
  plugins: [react()],
  // shown in Help > About
  define: { __APP_VERSION__: JSON.stringify(version) },
  // the lazily loaded Three.js chunk is ~600 kB on its own
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts', 'src/core/testing.ts', 'src/core/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
