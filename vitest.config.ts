import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.js'],
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['lib/ai/verify/**', 'lib/research/**', 'lib/presentations/**', 'lib/exports/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
