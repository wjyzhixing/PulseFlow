import { describe, expect, it } from 'vitest';
import { loadImageModelConfig, loadVisionModelConfig } from '../src/config.js';

describe('loadVisionModelConfig', () => {
  it('defaults to the configured text endpoint and key while allowing a separate vision model', () => {
    expect(loadVisionModelConfig({ PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1', PULSEFLOW_MODEL_NAME: 'text-model', PULSEFLOW_MODEL_API_KEY: 'text-key', PULSEFLOW_VISION_MODEL_NAME: 'vision-model' }))
      .toEqual({ baseUrl: 'https://model.example/v1', model: 'vision-model', apiKey: 'text-key', timeoutMs: 90_000 });
  });
  it('supports separate endpoint credentials and timeout', () => {
    expect(loadVisionModelConfig({ PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1', PULSEFLOW_MODEL_NAME: 'text-model', PULSEFLOW_MODEL_API_KEY: 'text-key',
      PULSEFLOW_VISION_API_URL: 'https://vision.example/v1', PULSEFLOW_VISION_MODEL_NAME: 'vision', PULSEFLOW_VISION_API_KEY: 'vision-key', PULSEFLOW_VISION_TIMEOUT_MS: '60000' }))
      .toEqual({ baseUrl: 'https://vision.example/v1', model: 'vision', apiKey: 'vision-key', timeoutMs: 60_000 });
  });
  it('rejects missing credentials and invalid timeouts', () => {
    expect(() => loadVisionModelConfig({})).toThrow('PULSEFLOW_VISION_API_URL');
    expect(() => loadVisionModelConfig({ PULSEFLOW_MODEL_BASE_URL: 'https://model.example', PULSEFLOW_MODEL_NAME: 'text', PULSEFLOW_MODEL_API_KEY: 'key', PULSEFLOW_VISION_TIMEOUT_MS: '10' }))
      .toThrow('PULSEFLOW_VISION_TIMEOUT_MS');
  });
});

describe('loadImageModelConfig', () => {
  const env = { PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1/', PULSEFLOW_MODEL_API_KEY: 'secret' };
  it('loads image defaults independently of the text model name', () => {
    expect(loadImageModelConfig(env)).toEqual({
      baseUrl: 'https://model.example/v1/', endpointUrl: 'https://model.example/v1/chat/completions',
      model: 'qwen-image-2.0', apiKey: 'secret', mode: 'openai-chat-completions',
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
  it('loads the confirmed Volcengine Ark Seedream endpoint and model', () => {
    expect(loadImageModelConfig({ ...env, PULSEFLOW_MODEL_BASE_URL: 'https://ark.cn-beijing.volces.com/api/plan/v3',
      PULSEFLOW_IMAGE_API_URL: 'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations',
      PULSEFLOW_IMAGE_API_MODE: 'volcengine-ark-images'
    })).toMatchObject({
      endpointUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations',
      model: 'doubao-seedream-5.0-lite', mode: 'volcengine-ark-images',
      allowedResultHosts: ['ark-acg-cn-beijing.tos-cn-beijing.volces.com']
    });
  });
  it.each([
    [{ PULSEFLOW_MODEL_API_KEY: 'secret' }, 'PULSEFLOW_MODEL_BASE_URL'],
    [{ PULSEFLOW_MODEL_BASE_URL: 'https://model.example' }, 'PULSEFLOW_MODEL_API_KEY'],
    [{ PULSEFLOW_MODEL_BASE_URL: 'http://model.example', PULSEFLOW_MODEL_API_KEY: 'secret' }, 'PULSEFLOW_IMAGE_API_URL'],
    [{ ...env, PULSEFLOW_IMAGE_API_MODE: 'auto' }, 'PULSEFLOW_IMAGE_API_MODE'],
    [{ ...env, PULSEFLOW_IMAGE_TIMEOUT_MS: '0' }, 'PULSEFLOW_IMAGE_TIMEOUT_MS']
  ])('rejects missing or invalid image configuration', (input, field) => {
    expect(() => loadImageModelConfig(input)).toThrow(field);
  });
});
