import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { generateImage } from '../src/image-client.js';
import type { ImageModelConfig } from '../src/config.js';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}

function makePng(width = 2, height = 3, compressed = deflateSync(new Uint8Array((width * 3 + 1) * height))): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { png.set(part, offset); offset += part.length; }
  return png;
}

function corruptChunkCrc(bytes: Uint8Array, chunkType: string): Uint8Array {
  const corrupted = bytes.slice();
  for (let offset = 8; offset + 12 <= corrupted.length;) {
    const length = new DataView(corrupted.buffer).getUint32(offset);
    const type = new TextDecoder().decode(corrupted.subarray(offset + 4, offset + 8));
    if (type === chunkType) {
      corrupted[offset + 8 + length] ^= 1;
      return corrupted;
    }
    offset += 12 + length;
  }
  throw new Error(`Missing PNG ${chunkType} chunk`);
}

const png = makePng();
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

  it('keeps generic fetch on provider POST and gives the pinned downloader the validated target', async () => {
    const resultUrl = 'https://images.example/image.png';
    const fetchImpl = vi.fn(async () => imageResponse({ data: [{ url: resultUrl }] }));
    const downloadPinnedResult = vi.fn(async () => new Response(png, { headers: { 'content-type': 'image/png' } }));
    const resolveImpl = vi.fn(async () => [{ address: '8.8.8.8', family: 4 as const }]);
    const result = await generateImage('Draw', { ...baseConfig, allowedResultHosts: ['images.example'], fetchImpl: fetchImpl as typeof fetch }, {
      resolveResultHost: resolveImpl as never,
      downloadPinnedResult
    });
    expect(result.bytes).toEqual(png);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe(baseConfig.endpointUrl);
    expect(downloadPinnedResult).toHaveBeenCalledOnce();
    expect(downloadPinnedResult).toHaveBeenCalledWith({ url: resultUrl, address: '8.8.8.8', servername: 'images.example' }, expect.any(AbortSignal));
    expect(resolveImpl).toHaveBeenCalledWith('images.example', { all: true });
  });

  it.each(['', '   ', 'x'.repeat(4001)])('rejects empty or overlong image prompts', async (prompt) => {
    const fetchImpl = vi.fn();
    await expect(generateImage(prompt, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'invalid_schema' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the native DashScope multimodal request and image response shape', async () => {
    const fetchImpl = vi.fn(async () => imageResponse({ output: { choices: [{ message: { content: [{ image: 'https://8.8.8.8/image.png' }] } }] } }));
    const downloadPinnedResult = vi.fn(async () => new Response(png));
    await generateImage('Draw', { ...baseConfig, mode: 'dashscope-native', fetchImpl: fetchImpl as typeof fetch }, { downloadPinnedResult });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(downloadPinnedResult).toHaveBeenCalledWith({ url: 'https://8.8.8.8/image.png', address: '8.8.8.8' }, expect.any(AbortSignal));
    const request = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(request).toMatchObject({ model: 'qwen-image-2.0', input: { messages: [{ role: 'user', content: [{ text: 'Draw' }] }] } });
  });

  it.each([{}, { output: { choices: [{ message: { content: [] } }] } }])(
    'rejects malformed DashScope response envelopes', async (body) => {
      await expect(generateImage('Draw', {
        ...baseConfig, mode: 'dashscope-native', fetchImpl: async () => imageResponse(body)
      })).rejects.toMatchObject({ code: 'invalid_schema' });
    }
  );

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

  it.each([
    (valid: Uint8Array) => valid.slice(0, -1),
    (valid: Uint8Array) => { const bad = valid.slice(); bad[valid.length - 1] ^= 1; return bad; },
    (valid: Uint8Array) => corruptChunkCrc(valid, 'IDAT'),
    (valid: Uint8Array) => { const bad = valid.slice(); bad[valid.length - 5] = 1; return bad; },
    () => makePng(2, 3, new Uint8Array([1, 2, 3])),
    () => makePng(2, 3, Buffer.concat([deflateSync(new Uint8Array(21)), Buffer.from([0])]))
  ])('rejects truncated or malformed PNG chunks and image data', async (mutate) => {
    const invalidPng = mutate(png);
    await expect(generateImage('Draw', {
      ...baseConfig,
      fetchImpl: async () => imageResponse({ data: [{ b64_json: Buffer.from(invalidPng).toString('base64') }] })
    })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects inflated image data that does not match the declared pixel bounds', async () => {
    const oversizedData = makePng(2, 3, deflateSync(new Uint8Array(1024 * 1024)));
    await expect(generateImage('Draw', {
      ...baseConfig,
      fetchImpl: async () => imageResponse({ data: [{ b64_json: Buffer.from(oversizedData).toString('base64') }] })
    })).rejects.toMatchObject({ code: 'invalid_schema' });
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
    const downloadPinnedResult = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://8.8.8.8/b' } }));
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl }, { downloadPinnedResult }))
      .rejects.toMatchObject({ code: 'http', status: 302 });
  });

  it('rejects downloads larger than 20 MiB before reading the body', async () => {
    const fetchImpl = vi.fn(async () => imageResponse({ data: [{ url: 'https://8.8.8.8/a' }] }));
    const downloadPinnedResult = vi.fn(async () => new Response(png, { headers: { 'content-length': String(20 * 1024 * 1024 + 1) } }));
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl }, { downloadPinnedResult }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects images over the pixel cap', async () => {
    const huge = makePng(4096, 4096, deflateSync(new Uint8Array([0])));
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => imageResponse({ data: [{ b64_json: Buffer.from(huge).toString('base64') }] }) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('maps aborts to timeout errors', async () => {
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => { throw new DOMException('late', 'TimeoutError'); } }))
      .rejects.toMatchObject({ code: 'timeout' });
  });

  it('maps ordinary transport failures to network errors', async () => {
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => { throw new TypeError('offline'); } }))
      .rejects.toMatchObject({ code: 'network' });
  });

  it.each([
    { ...baseConfig, mode: 'unknown' },
    { ...baseConfig, timeoutMs: Number.NaN },
    { ...baseConfig, allowedResultHosts: null },
    { ...baseConfig, endpointUrl: 'ftp://model.example/images' }
  ])('rejects invalid image endpoint configuration before fetch', async (config) => {
    const fetchImpl = vi.fn();
    await expect(generateImage('Draw', { ...config, fetchImpl } as unknown as ImageModelConfig))
      .rejects.toMatchObject({ code: 'config' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an empty response body and omits an absent request ID from a valid result', async () => {
    await expect(generateImage('Draw', { ...baseConfig, fetchImpl: async () => new Response(null) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
    const withoutRequestId = await generateImage('Draw', { ...baseConfig, fetchImpl: async () => new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from(png).toString('base64') }]
    })) });
    expect(withoutRequestId).not.toHaveProperty('requestId');
  });

  it('pins a resolved allowlisted hostname and rejects private DNS answers', async () => {
    const fetchImpl = vi.fn(async () => imageResponse({ data: [{ url: 'https://images.example/image.png' }] }));
    const downloadPinnedResult = vi.fn(async () => new Response(png));
    const resolveResultHost = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]);
    const result = await generateImage('Draw', {
      ...baseConfig, allowedResultHosts: ['images.example'], fetchImpl: fetchImpl as typeof fetch
    }, { resolveResultHost: resolveResultHost as never, downloadPinnedResult });
    expect(result.bytes).toEqual(png);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(resolveResultHost).toHaveBeenCalledWith('images.example', { all: true });
    expect(downloadPinnedResult).toHaveBeenCalledWith({
      url: 'https://images.example/image.png', address: '8.8.8.8', servername: 'images.example'
    }, expect.any(AbortSignal));

    await expect(generateImage('Draw', {
      ...baseConfig, allowedResultHosts: ['images.example'],
      fetchImpl: async () => imageResponse({ data: [{ url: 'https://images.example/image.png' }] })
    }, { resolveResultHost: async () => [{ address: '10.0.0.2', family: 4 }] as never }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects empty or failed DNS resolution for an allowlisted result host', async () => {
    const fetchImpl = async () => imageResponse({ data: [{ url: 'https://images.example/image.png' }] });
    await expect(generateImage('Draw', {
      ...baseConfig, allowedResultHosts: ['images.example'], fetchImpl
    }, { resolveResultHost: async () => [] as never })).rejects.toMatchObject({ code: 'invalid_schema' });
    await expect(generateImage('Draw', {
      ...baseConfig, allowedResultHosts: ['images.example'], fetchImpl
    }, { resolveResultHost: (async () => { throw new Error('DNS unavailable'); }) as never }))
      .rejects.toMatchObject({ code: 'network' });
  });

  it('rejects missing configuration before fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(generateImage('Draw', { ...baseConfig, apiKey: '', fetchImpl })).rejects.toMatchObject({ code: 'config' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
