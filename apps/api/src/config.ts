export interface ApiConfig { workspaceToken: string; dbPath: string }

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    workspaceToken: env.PULSEFLOW_WORKSPACE_TOKEN ?? '',
    dbPath: env.PULSEFLOW_DB_PATH ?? './data/pulseflow.sqlite'
  };
}
