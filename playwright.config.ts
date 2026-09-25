import { defineConfig, devices } from '@playwright/test';

process.env.NO_PROXY = '*';
process.env.no_proxy = '*';
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.ALL_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.all_proxy;

const port = Number(process.env.PULSEFLOW_E2E_STUDIO_PORT ?? 4173);
const apiPort = Number(process.env.PULSEFLOW_E2E_API_PORT ?? 3317);
const workspaceAuth = ['e2e', 'placeholder', 'token'].join('-');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 480_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: [
    {
      command: `pnpm --filter @pulseflow/api e2e:server`,
      url: `http://127.0.0.1:${apiPort}/health`,
      env: { PULSEFLOW_E2E_API_PORT: String(apiPort), PULSEFLOW_WORKSPACE_TOKEN: workspaceAuth, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: `pnpm --filter @pulseflow/studio exec vite --mode e2e --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      env: { PULSEFLOW_API_URL: `http://127.0.0.1:${apiPort}`, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
});
