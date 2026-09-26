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

export interface ImageModelConfig {
  baseUrl: string;
  endpointUrl: string;
  model: string;
  apiKey: string;
  mode: 'openai-images' | 'dashscope-native' | 'openai-chat-completions' | 'volcengine-ark-images';
  timeoutMs: number;
  allowedResultHosts: readonly string[];
  fetchImpl?: typeof fetch;
}

function imageEndpoint(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid URL');
    return url.toString();
  } catch {
    throw new ModelAdapterError('config', 'PULSEFLOW_IMAGE_API_URL must be an HTTPS endpoint without credentials, query, or fragment');
  }
}

export function loadImageModelConfig(env: ModelEnvironment = process.env): ImageModelConfig {
  const baseUrl = env.PULSEFLOW_MODEL_BASE_URL?.trim();
  const apiKey = env.PULSEFLOW_IMAGE_API_KEY?.trim() || env.PULSEFLOW_MODEL_API_KEY?.trim();
  if (!baseUrl) throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_BASE_URL is required');
  if (!apiKey) throw new ModelAdapterError('config', 'PULSEFLOW_MODEL_API_KEY is required');
  const base = imageEndpoint(baseUrl);
  const mode = env.PULSEFLOW_IMAGE_API_MODE?.trim() || 'openai-chat-completions';
  if (mode !== 'openai-images' && mode !== 'dashscope-native' && mode !== 'openai-chat-completions' && mode !== 'volcengine-ark-images') {
    throw new ModelAdapterError('config', 'PULSEFLOW_IMAGE_API_MODE is invalid');
  }
  const timeoutText = env.PULSEFLOW_IMAGE_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutText === undefined ? 120_000 : Number(timeoutText);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ModelAdapterError('config', 'PULSEFLOW_IMAGE_TIMEOUT_MS must be positive');
  }
  const defaultResultHosts = mode === 'volcengine-ark-images' ? 'ark-acg-cn-beijing.tos-cn-beijing.volces.com' : '';
  const allowedResultHosts = (env.PULSEFLOW_IMAGE_RESULT_HOSTS ?? defaultResultHosts).split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (allowedResultHosts.some((host) => !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.'))) {
    throw new ModelAdapterError('config', 'PULSEFLOW_IMAGE_RESULT_HOSTS is invalid');
  }
  return {
    baseUrl, endpointUrl: imageEndpoint(env.PULSEFLOW_IMAGE_API_URL?.trim() || `${base.replace(/\/$/, '')}/${mode === 'openai-chat-completions' ? 'chat/completions' : 'images/generations'}`),
    model: env.PULSEFLOW_IMAGE_MODEL_NAME?.trim() || (mode === 'volcengine-ark-images' ? 'doubao-seedream-5.0-lite' : 'qwen-image-2.0'), apiKey, mode, timeoutMs, allowedResultHosts
  };
}
