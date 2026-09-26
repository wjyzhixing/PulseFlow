import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { inflateSync } from 'node:zlib';
import type { ImageModelConfig } from './config.js';
import { ModelAdapterError } from './errors.js';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 4_194_304;
const MAX_PROMPT_CHARS = 4_000;
const MAX_INFLATED_BYTES = MAX_PIXELS * 9 + 4_194_304;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ADAM7_PASSES = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] as const;
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

async function safeFetch(fetchImpl: typeof fetch, url: string, init: RequestInit, pin?: { address: string; servername?: string }): Promise<Response> {
  try {
    return pin
      ? await (fetchImpl as unknown as (input: string, requestInit: RequestInit, target: typeof pin) => Promise<Response>)(url, init, pin)
      : await fetchImpl(url, init);
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

type PinnedTarget = { url: string; address: string; servername?: string };

async function validateResultUrl(value: string, allowedHosts: readonly string[], resolveResultHost: typeof lookup): Promise<PinnedTarget> {
  let url: URL;
  try { url = new URL(value); } catch { return invalid('Image result URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
      !allowedHosts.includes(url.hostname.toLowerCase())) invalid('Image result URL is not allowed');
  try {
    const addresses = isIP(url.hostname) ? [url.hostname] : (await resolveResultHost(url.hostname, { all: true })).map((item) => item.address);
    if (addresses.length === 0 || addresses.some((address) => !isPublicIp(address))) invalid('Image result address is not public');
    return { url: url.toString(), address: addresses[0], ...(isIP(url.hostname) ? {} : { servername: url.hostname }) };
  } catch (error) {
    if (error instanceof ModelAdapterError) throw error;
    throw new ModelAdapterError('network', 'Image result host could not be resolved');
  }
}

async function pinnedHttpFetch(target: PinnedTarget, signal: AbortSignal): Promise<Response> {
  const url = new URL(target.url);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const lookupPinned = (_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
    callback(null, target.address, isIP(target.address));
  };
  return await new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET', signal, servername: target.servername,
      lookup: lookupPinned as never
    }, (res) => {
      const parts: Uint8Array[] = [];
      let total = 0;
      const declaredLength = Number(res.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
        req.destroy();
        reject(new ModelAdapterError('invalid_schema', 'Image response exceeds size limit'));
        return;
      }
      res.on('data', (chunk: Uint8Array) => {
        total += chunk.byteLength;
        if (total > MAX_BYTES) {
          req.destroy();
          reject(new ModelAdapterError('invalid_schema', 'Image response exceeds size limit'));
          return;
        }
        parts.push(chunk);
      });
      res.on('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
          else if (value !== undefined) headers.set(name, value);
        }
        resolve(new Response(Buffer.concat(parts), { status: res.statusCode ?? 500, headers }));
      });
      res.on('error', reject);
    });
    req.on('error', (error) => {
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) reject(new ModelAdapterError('timeout', 'Image request timed out'));
      else reject(new ModelAdapterError('network', 'Image request failed'));
    });
    req.end();
  });
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function expectedInflatedSize(width: number, height: number, bitDepth: number, colorType: number, interlace: number): number {
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bitsPerPixel = channels[colorType] * bitDepth;
  const passes: readonly (readonly number[])[] = interlace === 0 ? [[0, 0, 1, 1]] : ADAM7_PASSES;
  let total = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const passWidth = width <= x0 ? 0 : Math.ceil((width - x0) / dx);
    const passHeight = height <= y0 ? 0 : Math.ceil((height - y0) / dy);
    if (passWidth && passHeight) total += passHeight * (1 + Math.ceil(passWidth * bitsPerPixel / 8));
  }
  return total;
}

function validatePng(bytes: Uint8Array, requestId?: string): ImageResult {
  if (bytes.length < 45 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) invalid('Image is not a valid PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let seenHeader = false;
  let seenPalette = false;
  let seenData = false;
  let endedData = false;
  let seenEnd = false;
  const dataParts: Uint8Array[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) invalid('Image is not a valid PNG');
    const length = view.getUint32(offset);
    if (length > MAX_BYTES || offset + 12 + length > bytes.length) invalid('Image is not a valid PNG');
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)) invalid('Image PNG checksum is invalid');
    if (!/^[A-Za-z]{4}$/.test(type) || (typeBytes[2] & 32) !== 0) invalid('Image is not a valid PNG');
    if (!seenHeader && type !== 'IHDR') invalid('Image is not a valid PNG');
    if (type === 'IHDR') {
      if (seenHeader || length !== 13) invalid('Image is not a valid PNG');
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      const validDepth: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || width * height > MAX_PIXELS || !validDepth[colorType]?.includes(bitDepth) || data[10] !== 0 || data[11] !== 0 || interlace > 1) invalid('Image dimensions or format exceed limit');
      seenHeader = true;
    } else if (type === 'PLTE') {
      if (seenData || seenPalette || !length || length > 768 || length % 3 !== 0 || colorType === 0 || colorType === 4 || (colorType === 3 && length / 3 > 2 ** bitDepth)) invalid('Image is not a valid PNG');
      seenPalette = true;
    } else if (type === 'IDAT') {
      if (endedData || (colorType === 3 && !seenPalette)) invalid('Image is not a valid PNG');
      seenData = true;
      dataParts.push(data);
    } else {
      if (seenData) endedData = true;
      if (type === 'IEND') {
        if (length !== 0 || !seenData) invalid('Image is not a valid PNG');
        seenEnd = true;
        offset += 12 + length;
        if (offset !== bytes.length) invalid('Image is not a valid PNG');
        break;
      }
      if ((type.charCodeAt(0) & 32) === 0) invalid('Image PNG has an unknown critical chunk');
    }
    offset += 12 + length;
  }
  if (!seenHeader || !seenData || !seenEnd) invalid('Image is not a valid PNG');
  try {
    const compressed = Buffer.concat(dataParts.map((part) => Buffer.from(part)));
    const inflatedResult = inflateSync(compressed, { maxOutputLength: MAX_INFLATED_BYTES, info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    if (inflatedResult.engine.bytesWritten !== compressed.length) invalid('Image compressed data has trailing bytes');
    const inflated = inflatedResult.buffer;
    const expected = expectedInflatedSize(width, height, bitDepth, colorType, interlace);
    if (inflated.length !== expected) invalid('Image pixel data is invalid');
    // Each PNG scanline starts with a filter byte in the range 0..4.
    let cursor = 0;
    const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    const bitsPerPixel = channels[colorType] * bitDepth;
    const passes = interlace === 0 ? [[0, 0, 1, 1]] : ADAM7_PASSES;
    for (const [x0, y0, dx, dy] of passes) {
      const passWidth = width <= x0 ? 0 : Math.ceil((width - x0) / dx);
      const passHeight = height <= y0 ? 0 : Math.ceil((height - y0) / dy);
      const rowBytes = Math.ceil(passWidth * bitsPerPixel / 8);
      for (let row = 0; row < passHeight; row += 1) {
        if (inflated[cursor] > 4) invalid('Image pixel filter is invalid');
        cursor += rowBytes + 1;
      }
    }
  } catch (error) {
    if (error instanceof ModelAdapterError) throw error;
    return invalid('Image pixel data is invalid');
  }
  return { bytes, mimeType: 'image/png', width, height, ...(requestId ? { requestId } : {}) };
}

export async function generateImage(
  prompt: string,
  config: ImageModelConfig,
  dependencies: { resolveResultHost?: typeof lookup } = {}
): Promise<ImageResult> {
  const url = endpoint(config);
  if (!prompt?.trim() || prompt.length > MAX_PROMPT_CHARS) invalid('Image prompt is required and must be at most 4000 characters');
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
    const target = await validateResultUrl(source.value, config.allowedResultHosts, dependencies.resolveResultHost ?? lookup);
    const downloaded = config.fetchImpl
      ? await safeFetch(fetchImpl, target.url, { method: 'GET', redirect: 'manual', signal }, { address: target.address, servername: target.servername })
      : await pinnedHttpFetch(target, signal);
    if (!downloaded.ok || downloaded.status >= 300) throw new ModelAdapterError('http', `Image download failed with HTTP ${downloaded.status}`, downloaded.status);
    bytes = await readLimited(downloaded, MAX_BYTES);
  }
  return validatePng(bytes, requestId);
}
