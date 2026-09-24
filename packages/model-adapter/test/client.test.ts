import { describe, expect, it, vi } from 'vitest';
import { generateDraft } from '../src/client.js';
import { loadModelConfig } from '../src/config.js';
import { ModelAdapterError } from '../src/errors.js';

const input = { sections: [{ id: 's1', heading: 'Account', text: 'Show account balance' }] };
const draft = {
  entityFields: [{ id: 'balance', key: 'balance', label: 'Balance', type: 'number', rules: [] }],
  pageDsl: { schemaVersion: 1, pageId: 'account', title: 'Account', nodes: [
    { id: 'header', type: 'PageHeader', props: { title: 'Account' }, children: [], slots: [] }
  ] },
  semanticQuestions: [{ id: 'currency', question: 'Which currency?' }]
};
const completion = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const baseConfig = { baseUrl: 'https://model.example/v1/', model: 'chosen-model', ['apiKey']: 'private-test-key', timeoutMs: 100 };

describe('generateDraft', () => {
  it('sends selected sections in JSON-object chat completion request and parses a valid result', async () => {
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(draft)));
    const result = await generateDraft(input, { ...baseConfig, fetchImpl });
    expect(result).toEqual(draft);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://model.example/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer private-test-key');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('chosen-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([
      { role: 'system', content: expect.any(String) },
      { role: 'user', content: expect.stringContaining('Show account balance') }
    ]);
  });

  it('reports timeout without exposing credentials', async () => {
    const fetchImpl = vi.fn(async () => { throw new DOMException('private-test-key', 'TimeoutError'); });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'timeout' });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.not.toThrow('private-test-key');
  });

  it('reports non-2xx response without exposing response body or credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response('private-test-key', { status: 429 }));
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'http', status: 429 });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.not.toThrow('private-test-key');
  });

  it('rejects invalid completion JSON', async () => {
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion('{') })).rejects.toMatchObject({ code: 'invalid_json' });
  });

  it('rejects schema mismatches', async () => {
    const malformed = { ...draft, entityFields: [{ ...draft.entityFields[0], type: 'function' }] };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(malformed)) })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects model supplied answers to unresolved semantic questions', async () => {
    const answered = { ...draft, semanticQuestions: [{ ...draft.semanticQuestions[0], answer: 'USD' }] };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(answered)) })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects unsupported components in otherwise shaped DSL', async () => {
    const malformed = { ...draft, pageDsl: { ...draft.pageDsl, nodes: [{ ...draft.pageDsl.nodes[0], type: 'Script' }] } };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(malformed)) })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects DSL references to fields absent from the entity draft', async () => {
    const malformed = { ...draft, pageDsl: { ...draft.pageDsl, nodes: [
      { id: 'item', type: 'FormItem', props: { fieldId: 'missing' }, children: [], slots: [] }
    ] } };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(malformed)) })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects a malformed completion envelope', async () => {
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => new Response('{}') })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('converts transport failures to safe errors', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('private-test-key'); });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'network' });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.not.toThrow('private-test-key');
  });

  it('uses an injected timeout signal factory', async () => {
    const signal = new AbortController().signal;
    const timeoutSignal = vi.fn(() => signal);
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(draft)));
    await generateDraft(input, { ...baseConfig, timeoutSignal, fetchImpl });
    expect(timeoutSignal).toHaveBeenCalledWith(100);
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(signal);
  });
});

describe('loadModelConfig', () => {
  it('reads the administrator environment and uses a finite timeout', () => {
    expect(loadModelConfig({ PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1', PULSEFLOW_MODEL_NAME: 'chosen-model', PULSEFLOW_MODEL_API_KEY: 'secret' })).toEqual({ baseUrl: 'https://model.example/v1', model: 'chosen-model', apiKey: 'secret', timeoutMs: 30000 });
  });

  it('rejects a missing endpoint', () => {
    expect(() => loadModelConfig({ PULSEFLOW_MODEL_NAME: 'chosen-model', PULSEFLOW_MODEL_API_KEY: 'private-test-key' })).toThrow(ModelAdapterError);
    expect(() => loadModelConfig({ PULSEFLOW_MODEL_NAME: 'chosen-model', PULSEFLOW_MODEL_API_KEY: 'private-test-key' })).toThrow('PULSEFLOW_MODEL_BASE_URL');
  });

  it.each([
    [{ PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1', PULSEFLOW_MODEL_API_KEY: 'secret' }, 'PULSEFLOW_MODEL_NAME'],
    [{ PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1', PULSEFLOW_MODEL_NAME: 'chosen-model' }, 'PULSEFLOW_MODEL_API_KEY']
  ])('rejects incomplete administrator config', (env, name) => {
    expect(() => loadModelConfig(env)).toThrow(name);
  });

  it('rejects unsafe endpoints and invalid timeouts without echoing the URL', async () => {
    const unsafe = { ...baseConfig, baseUrl: 'ftp://private-test-key.example' };
    await expect(generateDraft(input, unsafe)).rejects.toMatchObject({ code: 'config' });
    await expect(generateDraft(input, unsafe)).rejects.not.toThrow('private-test-key');
    await expect(generateDraft(input, { ...baseConfig, timeoutMs: 0 })).rejects.toMatchObject({ code: 'config' });
  });
});
