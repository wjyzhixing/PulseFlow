import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['apps/**/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['apps/api/src/**/*.ts'],
      exclude: ['apps/api/src/server.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
});
