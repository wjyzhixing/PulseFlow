import { dirname, resolve, join } from 'node:path';

export interface ApiConfig { workspaceToken: string; dbPath: string; assetDir: string }

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const dbPath = env.PULSEFLOW_DB_PATH ?? './data/pulseflow.sqlite';
  return {
    workspaceToken: env.PULSEFLOW_WORKSPACE_TOKEN ?? '',
    dbPath,
    assetDir: env.PULSEFLOW_ASSET_DIR ?? join(dirname(resolve(dbPath === ':memory:' ? './data/pulseflow.sqlite' : dbPath)), 'assets')
  };
}
