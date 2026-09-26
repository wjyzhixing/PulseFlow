import { describe, expect, it } from 'vitest';
import { loadImageModelConfig } from '../src/config.js';

describe('loadImageModelConfig', () => {
  const env = { PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1/', PULSEFLOW_MODEL_API_KEY: 'secret' };
  it('loads image defaults independently of the text model name', () => {
    expect(loadImageModelConfig(env)).toEqual({
      baseUrl: 'https://model.example/v1/', endpointUrl: 'https://model.example/v1/images/generations',
      model: 'qwen-image-2.0', apiKey: 'secret', mode: 'openai-images',
      timeoutMs: 120_000, allowedResultHosts: []
    });
  });
  it('loads image overrides and result host allowlist', () => {
    expect(loadImageModelConfig({ ...env, PULSEFLOW_IMAGE_MODEL_NAME: 'custom', PULSEFLOW_IMAGE_API_KEY: 'image-key',
      PULSEFLOW_IMAGE_API_URL: 'https://images.example/generate', PULSEFLOW_IMAGE_API_MODE: 'dashscope-native',
      PULSEFLOW_IMAGE_TIMEOUT_MS: '90000', PULSEFLOW_IMAGE_RESULT_HOSTS: 'cdn.example, media.example' }))
      .toMatchObject({ model: 'custom', apiKey: 'image-key', endpointUrl: 'https://images.example/generate',
        mode: 'dashscope-native', timeoutMs: 90_000, allowedResultHosts: ['cdn.example', 'media.example'] });
  });
  it.each([
    [{ PULSEFLOW_MODEL_API_KEY: 'secret' }, 'PULSEFLOW_MODEL_BASE_URL'],
    [{ PULSEFLOW_MODEL_BASE_URL: 'https://model.example' }, 'PULSEFLOW_MODEL_API_KEY'],
    [{ ...env, PULSEFLOW_IMAGE_API_MODE: 'auto' }, 'PULSEFLOW_IMAGE_API_MODE'],
    [{ ...env, PULSEFLOW_IMAGE_TIMEOUT_MS: '0' }, 'PULSEFLOW_IMAGE_TIMEOUT_MS']
  ])('rejects missing or invalid image configuration', (input, field) => {
    expect(() => loadImageModelConfig(input)).toThrow(field);
  });
});
