import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { ImageModelConfig } from './config.js';
import { ModelAdapterError } from './errors.js';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 4_194_304;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
type ImageResult = { bytes: Uint8Array; mimeType: 'image/png'; width: number; height: number; requestId?: string };
type ImageSource = { kind: 'base64' | 'url'; value: string };

function invalid(message = 'Image response structure is invalid'): never {
  throw new ModelAdapterError('invalid_schema', message);
}

function endpoint(config: ImageModelConfig): string {
  if (!config.apiKey?.trim() || !config.model?.trim() || !config.baseUrl?.trim()) {
    throw new ModelAdapterError('config', 'Image model configuration is incomplete');
  }
  if (config.mode !== 'openai-images' && config.mode !== 'dashscope-native') {
    throw new ModelAdapterError('config', 'Image model mode is invalid');
  }
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0 || !Array.isArray(config.allowedResultHosts)) {
    throw new ModelAdapterError('config', 'Image model timeout or result hosts are invalid');
  }
  try {
    const url = new URL(config.endpointUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
    return url.toString();
  } catch {
    throw new ModelAdapterError('config', 'Image model endpoint is invalid');
  }
}

async function safeFetch(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      throw new ModelAdapterError('timeout', 'Image request timed out');
    }
    throw new ModelAdapterError('network', 'Image request failed');
  }
}

async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) invalid('Image response exceeds size limit');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) invalid('Image response exceeds size limit');
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ModelAdapterError) throw error;
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      throw new ModelAdapterError('timeout', 'Image request timed out');
    }
    throw new ModelAdapterError('network', 'Image response could not be read');
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function parseSource(envelope: unknown, mode: ImageModelConfig['mode']): ImageSource {
  if (!envelope || typeof envelope !== 'object') return invalid();
  let value: unknown;
  if (mode === 'openai-images') {
    const data = (envelope as { data?: unknown }).data;
    if (!Array.isArray(data) || data.length !== 1) return invalid();
    value = data[0];
    if (!value || typeof value !== 'object') return invalid();
    const item = value as Record<string, unknown>;
    const hasBase64 = typeof item.b64_json === 'string' && item.b64_json.length > 0;
    const hasUrl = typeof item.url === 'string' && item.url.length > 0;
    if (hasBase64 === hasUrl) return invalid();
    return hasBase64 ? { kind: 'base64', value: item.b64_json as string } : { kind: 'url', value: item.url as string };
  }
  const output = (envelope as { output?: { choices?: unknown } }).output;
  const choices = output?.choices;
  if (!Array.isArray(choices) || choices.length !== 1) return invalid();
  const content = choices[0]?.message?.content;
  if (!Array.isArray(content) || content.length !== 1 || typeof content[0]?.image !== 'string' || !content[0].image) return invalid();
  return { kind: 'url', value: content[0].image };
}

function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19)));
  }
  // IPv6 destinations are refused until the transport can pin the checked address.
  return false;
}

async function validateResultUrl(value: string, allowedHosts: readonly string[]): Promise<string> {
  let url: URL;
  try { url = new URL(value); } catch { return invalid('Image result URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
      !allowedHosts.includes(url.hostname.toLowerCase())) invalid('Image result URL is not allowed');
  try {
    const addresses = isIP(url.hostname) ? [url.hostname] : (await lookup(url.hostname, { all: true })).map((item) => item.address);
    if (addresses.length === 0 || addresses.some((address) => !isPublicIp(address))) invalid('Image result address is not public');
  } catch (error) {
    if (error instanceof ModelAdapterError) throw error;
    throw new ModelAdapterError('network', 'Image result host could not be resolved');
  }
  return url.toString();
}

function validatePng(bytes: Uint8Array, requestId?: string): ImageResult {
  if (bytes.length < 33 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte) ||
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8) !== 13 ||
      String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') invalid('Image is not a valid PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width * height > MAX_PIXELS) invalid('Image dimensions exceed limit');
  return { bytes, mimeType: 'image/png', width, height, ...(requestId ? { requestId } : {}) };
}

export async function generateImage(prompt: string, config: ImageModelConfig): Promise<ImageResult> {
  const url = endpoint(config);
  if (!prompt?.trim()) invalid('Image prompt is required');
  const signal = AbortSignal.timeout(config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? fetch;
  const body = config.mode === 'openai-images'
    ? { model: config.model, prompt, n: 1, response_format: 'b64_json' }
    : { model: config.model, input: { messages: [{ role: 'user', content: [{ text: prompt }] }] }, parameters: { size: '1024*1024', n: 1 } };
  const response = await safeFetch(fetchImpl, url, {
    method: 'POST', headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal, redirect: 'manual'
  });
  if (!response.ok) throw new ModelAdapterError('http', `Image request failed with HTTP ${response.status}`, response.status);
  const requestId = response.headers.get('x-request-id') ?? undefined;
  let envelope: unknown;
  try { envelope = JSON.parse(new TextDecoder().decode(await readLimited(response, 28 * 1024 * 1024))); }
  catch (error) { if (error instanceof ModelAdapterError) throw error; return invalid(); }
  const source = parseSource(envelope, config.mode);
  let bytes: Uint8Array;
  if (source.kind === 'base64') {
    if (source.value.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(source.value)) return invalid();
    bytes = Uint8Array.from(Buffer.from(source.value, 'base64'));
    if (bytes.length > MAX_BYTES) invalid('Image exceeds size limit');
  } else {
    const resultUrl = await validateResultUrl(source.value, config.allowedResultHosts);
    const downloaded = await safeFetch(fetchImpl, resultUrl, { method: 'GET', redirect: 'manual', signal });
    if (!downloaded.ok || downloaded.status >= 300) throw new ModelAdapterError('http', `Image download failed with HTTP ${downloaded.status}`, downloaded.status);
    bytes = await readLimited(downloaded, MAX_BYTES);
  }
  return validatePng(bytes, requestId);
}
