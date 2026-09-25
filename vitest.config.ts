import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageName = process.env.npm_package_name;
const coverageTarget = packageName === '@pulseflow/ui-dsl' ? 'packages/ui-dsl'
  : packageName === '@pulseflow/contracts' ? 'packages/contracts'
    : packageName === '@pulseflow/requirement-import' ? 'packages/requirement-import'
      : packageName === '@pulseflow/model-adapter' ? 'packages/model-adapter'
        : packageName === '@pulseflow/page-generator' ? 'packages/page-generator' : 'apps/api';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['{apps,packages}/**/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [`${coverageTarget}/src/**/*.ts`],
      exclude: coverageTarget === 'apps/api' ? ['apps/api/src/server.ts'] : [],
      reportsDirectory: fileURLToPath(new URL(`./coverage/${coverageTarget.replace('/', '-')}/`, import.meta.url)),
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
});
