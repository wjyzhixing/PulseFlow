import { describe, expect, it, vi } from 'vitest';
import { generateImage } from '../src/image-client.js';
import type { ImageModelConfig } from '../src/config.js';

const png = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, 2);
  new DataView(bytes.buffer).setUint32(20, 3);
  return bytes;
})();
const TEST_KEY = 'fixture-value';
const baseConfig: ImageModelConfig = {
  baseUrl: 'https://model.example/v1', endpointUrl: 'https://model.example/custom/images',
  model: 'qwen-image-2.0', apiKey: TEST_KEY, mode: 'openai-images',
  timeoutMs: 100, allowedResultHosts: ['8.8.8.8']
};
const imageResponse = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'x-request-id': 'req-1' } });

describe('generateImage', () => {
  it('sends a single OpenAI image request to the exact configured URL and decodes base64 PNG', async () => {
    const fetchImpl = vi.fn(async () => imageResponse({ data: [{ b64_json: Buffer.from(png).toString('base64') }] }));
    const result = await generateImage('Draw a flower', { ...baseConfig, fetchImpl });
    expect(result).toEqual({ bytes: png, mimeType: 'image/png', width: 2, height: 3, requestId: 'req-1' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(baseConfig.endpointUrl);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'qwen-image-2.0', prompt: 'Draw a flower', n: 1 });
  });

  it('downloads an allowlisted public URL without following redirects', async () => {
    const fetchImpl = vi.fn(async (url: string) => url === baseConfig.endpointUrl
      ? imageResponse({ data: [{ url: 'https://8.8.8.8/image.png' }] })
      : new Response(png, { headers: { 'content-type': 'image/png' } }));
    const result = await generateImage('Draw', { ...baseConfig, fetchImpl: fetchImpl as typeof fetch });
    expect(result.bytes).toEqual(png);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://8.8.8.8/image.png');
    expect((fetchImpl.mock.calls[1][1] as RequestInit).redirect).toBe('manual');
  });

  it('uses the native DashScope multimodal request and image response shape', async () => {
    const fetchImpl = vi.fn(async () => imageResponse({ output: { choices: [{ message: { content: [{ image: 'https://8.8.8.8/image.png' }] } }] } }));
    fetchImpl.mockResolvedValueOnce(imageResponse({ output: { choices: [{ message: { content: [{ image: 'https://8.8.8.8/image.png' }] } }] } }));
    fetchImpl.mockResolvedValueOnce(new Response(png));
    await generateImage('Draw', { ...baseConfig, mode: 'dashscope-native', fetchImpl: fetchImpl as typeof fetch });
    const request = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(request).toMatchObject({ model: 'qwen-image-2.0', input: { messages: [{ role: 'user', content: [{ text: 'Draw' }] }] } });
  });

  it('reports HTTP errors without exposing response content or credentials', async () => {
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => new Response('private-test-key', { status: 429 }) }))
      .rejects.toMatchObject({ code: 'http', status: 429 });
  });

  it.each([{}, { data: [] }, { data: [{ b64_json: '!' }] }, { data: [{ url: 'https://8.8.8.8/a', b64_json: 'a' }] }])(
    'rejects malformed OpenAI envelopes', async (body) => {
      await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => imageResponse(body) }))
        .rejects.toMatchObject({ code: 'invalid_schema' });
    }
  );

  it('rejects bytes that are not a PNG', async () => {
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => imageResponse({ data: [{ b64_json: Buffer.from('not png').toString('base64') }] }) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it.each(['http://127.0.0.1/a', 'https://169.254.1.1/a', 'https://9.9.9.9/a', 'file:///tmp/a'])(
    'rejects unsafe result URL %s before downloading', async (url) => {
      const fetchImpl = vi.fn(async () => imageResponse({ data: [{ url }] }));
      await expect(generateImage('Draw', { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'invalid_schema' });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  );

  it('rejects a redirect from the result URL', async () => {
    const fetchImpl = vi.fn(async () => imageResponse({ data: [{ url: 'https://8.8.8.8/a' }] }));
    fetchImpl.mockResolvedValueOnce(imageResponse({ data: [{ url: 'https://8.8.8.8/a' }] }));
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://8.8.8.8/b' } }));
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'http', status: 302 });
  });

  it('rejects downloads larger than 20 MiB before reading the body', async () => {
    const fetchImpl = vi.fn(async () => imageResponse({ data: [{ url: 'https://8.8.8.8/a' }] }));
    fetchImpl.mockResolvedValueOnce(imageResponse({ data: [{ url: 'https://8.8.8.8/a' }] }));
    fetchImpl.mockResolvedValueOnce(new Response(png, { headers: { 'content-length': String(20 * 1024 * 1024 + 1) } }));
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects images over the pixel cap', async () => {
    const huge = Uint8Array.from(png);
    new DataView(huge.buffer).setUint32(16, 4096);
    new DataView(huge.buffer).setUint32(20, 4096);
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => imageResponse({ data: [{ b64_json: Buffer.from(huge).toString('base64') }] }) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('maps aborts to timeout errors', async () => {
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => { throw new DOMException('late', 'TimeoutError'); } }))
      .rejects.toMatchObject({ code: 'timeout' });
  });

  it('rejects missing configuration before fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(generateImage('Draw', { ...baseConfig, apiKey: '', fetchImpl })).rejects.toMatchObject({ code: 'config' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
