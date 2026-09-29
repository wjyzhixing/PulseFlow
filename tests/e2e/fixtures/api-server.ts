import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../../../apps/api/src/app.js';
import { createDeterministicModelFetch } from './demo-model.js';

const directory = await mkdtemp(join(tmpdir(), 'pulseflow-e2e-api-'));
const modelCredential = ['e2e', 'placeholder', 'key'].join('-');
const app = buildApp({
  workspaceToken: process.env.PULSEFLOW_WORKSPACE_TOKEN ?? ['e2e', 'placeholder', 'token'].join('-'),
  dbPath: join(directory, 'e2e.sqlite'),
  sessionRateLimit: { max: 50, timeWindow: '1 minute' },
  modelConfig: {
    baseUrl: 'http://deterministic-model.invalid/v1', model: 'pulseflow-e2e-fake',
    apiKey: modelCredential, timeoutMs: 1000, fetchImpl: createDeterministicModelFetch()
  }
});

const port = Number(process.env.PULSEFLOW_E2E_API_PORT ?? 3317);
await app.listen({ port, host: '127.0.0.1' });

async function shutdown() {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
