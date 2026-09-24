import { ModelAdapterError } from './errors.js';

export interface ModelConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  timeoutSignal?: (milliseconds: number) => AbortSignal;
}

type ModelEnvironment = Record<string, string | undefined>;

export function loadModelConfig(env: ModelEnvironment = process.env): ModelConfig {
  const baseUrl = env.PULSEFLOW_MODEL_BASE_URL?.trim();
  const model = env.PULSEFLOW_MODEL_NAME?.trim();
  const apiKey = env.PULSEFLOW_MODEL_API_KEY?.trim();
  if (!baseUrl) throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_BASE_URL is required');
  if (!model) throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_NAME is required');
  if (!apiKey) throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_API_KEY is required');
  return { baseUrl, model, apiKey, timeoutMs: 30_000 };
}

export function completionEndpoint(config: ModelConfig): string {
  if (!config.baseUrl?.trim()) throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_BASE_URL is required');
  if (!config.model?.trim()) throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_NAME is required');
  if (!config.apiKey?.trim()) throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_API_KEY is required');
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new ModelAdapterError('config', 'Model timeout must be positive');
  }
  try {
    const url = new URL(config.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Unsupported endpoint');
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
    return url.toString();
  } catch {
    throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_BASE_URL must be an HTTP endpoint');
  }
}
