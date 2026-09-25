import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: ['test/setup.ts'], include: ['test/**/*.test.ts'], coverage: { provider: 'v8', include: ['src/**/*.{ts,vue}'], thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } } }
});
