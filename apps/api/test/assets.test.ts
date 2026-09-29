import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { validCandidate } from './fixtures/publish-candidates.js';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(name), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}

function validPng(): Uint8Array {
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, 1);
  new DataView(header.buffer).setUint32(4, 1);
  header.set([8, 2, 0, 0, 0], 8);
  const chunks = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(new Uint8Array(4))), pngChunk('IEND', new Uint8Array())];
  return Buffer.concat(chunks);
}

function imageConfig(fetchImpl: typeof fetch) {
  return { baseUrl: 'https://model.example/v1', endpointUrl: 'https://model.example/v1/images/generations', model: 'qwen-image-2.0',
    apiKey: 'test-only', mode: 'openai-images' as const, timeoutMs: 1000, allowedResultHosts: [], fetchImpl };
}

const draft = { id: 'draft-assets', pageId: validCandidate.pageDsl.pageId, status: 'draft' as const,
  pageDsl: validCandidate.pageDsl, entityFields: validCandidate.entityFields,
  semanticQuestions: validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question })) };
const headers = { authorization: 'Bearer workspace-secret' };

describe('image assets API', () => {
  it('validates upload scopes, normalizes local images, and rejects stale drafts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-upload-'));
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets') });
    const imageDataUrl = `data:image/png;base64,${Buffer.from(validPng()).toString('base64')}`;
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: draft });
      const invalid = await app.inject({ method: 'POST', url: '/api/assets/upload', headers, payload: { pageId: 'bad page', imageDataUrl } });
      const missingDraft = await app.inject({ method: 'POST', url: '/api/assets/upload', headers, payload: {
        pageId: draft.pageId, draftId: 'missing-draft', expectedRevision: '1', imageDataUrl
      } });
      const invalidRevision = await app.inject({ method: 'POST', url: '/api/assets/upload', headers, payload: {
        pageId: draft.pageId, draftId: draft.id, expectedRevision: 'stale', imageDataUrl
      } });
      const invalidImage = await app.inject({ method: 'POST', url: '/api/assets/upload', headers, payload: {
        pageId: draft.pageId, imageDataUrl: 'data:text/plain;base64,SGVsbG8='
      } });
      expect(invalid.statusCode).toBe(400);
      expect(missingDraft.statusCode).toBe(404);
      expect(invalidRevision.statusCode).toBe(409);
      expect(invalidImage.statusCode).toBe(400);

      const uploaded = await app.inject({ method: 'POST', url: '/api/assets/upload', headers, payload: {
        pageId: draft.pageId, imageDataUrl
      } });
      expect(uploaded.statusCode, uploaded.body).toBe(201);
      expect(uploaded.json().data).toMatchObject({ pageId: draft.pageId, mimeType: 'image/png', width: 1, height: 1 });
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('generates one PNG for an authenticated page target and returns its bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-'));
    const bytes = validPng();
    const provider = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe('https://model.example/v1/images/generations');
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'qwen-image-2.0', n: 1 });
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] }), { headers: { 'content-type': 'application/json' } });
    });
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'), imageConfig: imageConfig(provider as typeof fetch) });
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: draft });
      const generated = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: {
        pageId: draft.pageId, draftId: draft.id,
        imagePlan: { prompt: '蓝色渐变的企业服务首页主视觉', targetNodeId: 'header', placement: 'inline' }
      } });
      expect(generated.statusCode, generated.body).toBe(201);
      const asset = generated.json().data;
      expect(asset).toMatchObject({ pageId: draft.pageId, draftId: draft.id, mimeType: 'image/png', byteLength: bytes.length, width: 1, height: 1, sha256: expect.any(String) });
      expect(asset.assetId).toMatch(/^asset-[A-Za-z0-9_-]+$/);
      expect(provider).toHaveBeenCalledOnce();
      const fetched = await app.inject({ method: 'GET', url: `/api/assets/${asset.assetId}`, headers });
      expect(fetched.statusCode).toBe(200);
      expect(fetched.headers['content-type']).toContain('image/png');
      expect(fetched.body).toBe(Buffer.from(bytes).toString());
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('requires workspace authentication for generation and reads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-auth-'));
    const provider = vi.fn();
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'), imageConfig: imageConfig(provider as typeof fetch) });
    try {
      const generated = await app.inject({ method: 'POST', url: '/api/assets/generate', payload: { pageId: draft.pageId, imagePlan: { prompt: 'landscape', placement: 'inline' } } });
      const read = await app.inject({ method: 'GET', url: '/api/assets/asset-abc' });
      expect(generated.statusCode).toBe(401);
      expect(read.statusCode).toBe(401);
      expect(provider).not.toHaveBeenCalled();
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects invalid target nodes and draft/page mismatches before calling the provider', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-target-'));
    const provider = vi.fn();
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'), imageConfig: imageConfig(provider as typeof fetch) });
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: draft });
      const missingNode = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: { pageId: draft.pageId, draftId: draft.id,
        imagePlan: { prompt: 'A hero image', targetNodeId: 'missing', placement: 'background' } } });
      const wrongPage = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: { pageId: 'different-page', draftId: draft.id,
        imagePlan: { prompt: 'A hero image', placement: 'inline' } } });
      expect(missingNode.statusCode).toBe(400);
      expect(wrongPage.statusCode).toBe(404);
      expect(provider).not.toHaveBeenCalled();
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects dynamic asset references that are unknown or owned by another page', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-owner-'));
    const bytes = validPng();
    const provider = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] })));
    let refinementResult: unknown = {};
    const textProvider = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(refinementResult) } }] })));
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'),
      modelConfig: { baseUrl: 'https://model.example/v1', model: 'text-model', apiKey: 'test-only', timeoutMs: 1000, fetchImpl: textProvider as typeof fetch },
      imageConfig: imageConfig(provider as typeof fetch) });
    try {
      const created = await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: draft });
      expect(created.statusCode, created.body).toBe(201);
      const generated = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: {
        pageId: draft.pageId, draftId: draft.id, imagePlan: { prompt: 'A page illustration', targetNodeId: 'header', placement: 'inline' }
      } });
      expect(generated.statusCode, generated.body).toBe(201);
      const assetId = generated.json().data.assetId as string;
      const generatedNode = { id: 'generated-inline', type: 'Image', props: { assetId, alt: 'Page illustration', fit: 'cover' }, children: [], slots: [] };
      const unknownNode = { ...generatedNode, id: 'unknown-inline', props: { ...generatedNode.props, assetId: 'asset-not-registered' } };
      const samePage = { ...draft, id: 'draft-reuse', pageDsl: { ...draft.pageDsl, nodes: [...draft.pageDsl.nodes, generatedNode] } };
      const foreignPage = { ...draft, id: 'draft-other', pageId: 'other-page', pageDsl: { ...draft.pageDsl, pageId: 'other-page', nodes: [...draft.pageDsl.nodes, generatedNode] } };
      const unregisteredPage = { ...draft, id: 'draft-unknown', pageId: 'unknown-page', pageDsl: { ...draft.pageDsl, pageId: 'unknown-page', nodes: [...draft.pageDsl.nodes, unknownNode] } };
      const allowed = await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: samePage });
      refinementResult = { entityFields: samePage.entityFields, pageDsl: { ...samePage.pageDsl, pageKind: 'admin', title: '保留已登记配图' }, semanticQuestions: samePage.semanticQuestions, intent: 'page_edit' };
      const refined = await app.inject({ method: 'POST', url: '/api/drafts/refine', headers, payload: {
        instruction: '修改标题并保留现有配图', entityFields: samePage.entityFields, pageDsl: samePage.pageDsl, semanticQuestions: samePage.semanticQuestions
      } });
      const foreign = await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: foreignPage });
      const unknown = await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: unregisteredPage });
      expect(allowed.statusCode).toBe(201);
      expect(refined.statusCode).toBe(200);
      expect(refined.json().data.pageDsl.nodes.at(-1).props.assetId).toBe(assetId);
      expect(foreign.statusCode).toBe(400);
      expect(unknown.statusCode).toBe(400);
      expect(foreign.json().error.code).toBe('asset.reference_invalid');
      expect(unknown.json().error.code).toBe('asset.reference_invalid');
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects malformed and missing asset IDs without exposing filesystem paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-read-'));
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets') });
    try {
      const invalid = await app.inject({ method: 'GET', url: '/api/assets/not-an-asset', headers });
      const absent = await app.inject({ method: 'GET', url: '/api/assets/asset-missing', headers });
      expect(invalid.statusCode).toBe(400);
      expect(absent.statusCode).toBe(404);
      expect(invalid.body + absent.body).not.toContain(directory);
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects malformed image request bodies before provider access', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-input-'));
    const provider = vi.fn();
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'), imageConfig: imageConfig(provider as typeof fetch) });
    const valid = { pageId: draft.pageId, imagePlan: { prompt: 'A blue hero image', placement: 'inline' } };
    const malformed: unknown[] = [
      null, [], { ...valid, extra: true }, { ...valid, pageId: '' }, { ...valid, draftId: 'bad id' },
      { ...valid, expectedRevision: 'revision-without-draft' }, { ...valid, expectedRevision: 'x'.repeat(129), draftId: draft.id },
      { ...valid, pageDsl: draft.pageDsl }, { ...valid, entityFields: {} }, { ...valid, imagePlan: null },
      { ...valid, imagePlan: [] }, { ...valid, imagePlan: { ...valid.imagePlan, extra: true } },
      { ...valid, imagePlan: { ...valid.imagePlan, prompt: '  ' } },
      { ...valid, imagePlan: { ...valid.imagePlan, prompt: 'x'.repeat(4001) } },
      { ...valid, imagePlan: { ...valid.imagePlan, prompt: 'bad\u0001prompt' } },
      { ...valid, imagePlan: { ...valid.imagePlan, targetNodeId: 'bad id' } },
      { ...valid, imagePlan: { ...valid.imagePlan, placement: 'cover' } }
    ];
    try {
      for (const [index, payload] of malformed.entries()) {
        const response = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload, remoteAddress: `127.0.0.${index + 1}` });
        expect(response.statusCode, response.body).toBe(400);
      }
      expect(provider).not.toHaveBeenCalled();
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    ['timeout', Object.assign(new Error('timeout'), { name: 'TimeoutError' }), 'generation.timeout', 504],
    ['network', new Error('socket failed'), 'generation.network', 502]
  ])('maps %s image provider failure to a safe response', async (_label, failure, code, status) => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-provider-error-'));
    const provider = vi.fn(async () => { throw failure; });
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'), imageConfig: imageConfig(provider as typeof fetch) });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: { pageId: draft.pageId, imagePlan: { prompt: 'A blue image', placement: 'inline' } } });
      expect(response.statusCode).toBe(status);
      expect(response.json().error.code).toBe(code);
      expect(response.body).not.toContain('socket failed');
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('maps image HTTP errors, invalid responses, and missing configuration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-provider-errors-'));
    const configs = [
      imageConfig(vi.fn(async () => new Response('rejected', { status: 429 })) as typeof fetch),
      imageConfig(vi.fn(async () => new Response('not-json')) as typeof fetch),
      imageConfig(vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('not png').toString('base64') }] }))) as typeof fetch)
    ];
    const expected = [['generation.http', 502], ['generation.invalid_image', 502], ['generation.invalid_image', 502]] as const;
    try {
      for (let index = 0; index < configs.length; index += 1) {
        const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, `db-${index}.sqlite`), assetDir: join(directory, `assets-${index}`), imageConfig: configs[index] });
        try {
          const response = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: { pageId: draft.pageId, imagePlan: { prompt: 'A blue image', placement: 'inline' } } });
          expect([response.json().error.code, response.statusCode]).toEqual(expected[index]);
        } finally { await app.close(); }
      }
      const missingConfigApp = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'missing.sqlite'), assetDir: join(directory, 'missing-assets'), imageConfig: undefined });
      try {
        const response = await missingConfigApp.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: { pageId: draft.pageId, imagePlan: { prompt: 'A blue image', placement: 'inline' } } });
        expect(response.statusCode).toBe(503);
        expect(response.json().error.code).toBe('generation.config');
      } finally { await missingConfigApp.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('validates a supplied current page without requiring a saved draft', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-supplied-page-'));
    const bytes = validPng();
    const provider = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] })));
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'), imageConfig: imageConfig(provider as typeof fetch) });
    const invalidDsl = { ...draft.pageDsl, title: '' };
    try {
      const missingSuppliedPage = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: {
        pageId: draft.pageId, imagePlan: { prompt: 'A blue image', targetNodeId: 'header', placement: 'inline' }
      }, remoteAddress: '127.0.0.2' });
      const invalid = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: {
        pageId: draft.pageId, pageDsl: invalidDsl, entityFields: draft.entityFields, imagePlan: { prompt: 'A blue image', placement: 'inline' }
      }, remoteAddress: '127.0.0.3' });
      const mismatched = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: {
        pageId: 'another-page', pageDsl: draft.pageDsl, entityFields: draft.entityFields, imagePlan: { prompt: 'A blue image', placement: 'inline' }
      }, remoteAddress: '127.0.0.4' });
      const generated = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: {
        pageId: draft.pageId, pageDsl: draft.pageDsl, entityFields: draft.entityFields,
        imagePlan: { prompt: 'A blue image', targetNodeId: 'header', placement: 'inline' }
      }, remoteAddress: '127.0.0.5' });
      expect(missingSuppliedPage.statusCode).toBe(400);
      expect(invalid.statusCode).toBe(400);
      expect(mismatched.statusCode).toBe(400);
      expect(generated.statusCode, generated.body).toBe(201);
      expect(provider).toHaveBeenCalledOnce();
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('returns generated assets without applying them after the draft changes mid-request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-stale-'));
    const bytes = validPng();
    let resolveProvider: ((response: Response) => void) | undefined;
    const provider = vi.fn(() => new Promise<Response>((resolve) => { resolveProvider = resolve; }));
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'), imageConfig: imageConfig(provider as typeof fetch) });
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: draft });
      const before = await app.inject({ method: 'GET', url: `/api/drafts/${draft.id}`, headers });
      const request = app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: {
        pageId: draft.pageId, draftId: draft.id, expectedRevision: before.headers.etag?.replaceAll('"', ''),
        imagePlan: { prompt: 'A blue image', placement: 'inline' }
      } });
      while (!resolveProvider) await new Promise((resolve) => setTimeout(resolve, 0));
      const edited = { ...draft, pageDsl: { ...draft.pageDsl, title: 'Edited during generation' } };
      expect((await app.inject({ method: 'PUT', url: `/api/drafts/${draft.id}`, headers, payload: edited })).statusCode).toBe(200);
      resolveProvider(new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] })));
      const response = await request;
      expect(response.statusCode).toBe(409);
      expect(response.json().data).toMatchObject({ applied: false, asset: { pageId: draft.pageId } });
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('limits image generations to three per client IP per minute', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-rate-'));
    const bytes = validPng();
    const provider = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] })));
    const app = buildApp({ workspaceToken: 'workspace-secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'), imageConfig: imageConfig(provider as typeof fetch) });
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: draft });
      const payload = { pageId: draft.pageId, draftId: draft.id, imagePlan: { prompt: 'A hero image', placement: 'inline' } };
      const responses = [];
      for (let index = 0; index < 4; index += 1) responses.push(await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload }));
      expect(responses.map((response) => [response.statusCode, response.body])).toEqual(expect.arrayContaining([[201, expect.any(String)], [201, expect.any(String)], [201, expect.any(String)], [429, expect.any(String)]]));
      expect(provider).toHaveBeenCalledTimes(3);
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('removes the binary if metadata persistence fails', async () => {
    const { AssetStore } = await import('../src/services/asset-store.js');
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-rollback-'));
    const repository = { create: () => { throw new Error('metadata unavailable'); }, get: () => null } as never;
    const store = new AssetStore(repository, directory);
    try {
      await expect(store.savePng({ bytes: validPng(), pageId: draft.pageId })).rejects.toThrow('metadata unavailable');
      expect(await readdir(directory)).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects truncated PNGs and bad chunk checksums at the asset storage boundary', async () => {
    const { AssetStore } = await import('../src/services/asset-store.js');
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-validate-'));
    const create = vi.fn();
    const repository = { create, get: vi.fn(() => null) } as never;
    const store = new AssetStore(repository, directory);
    const truncated = validPng().slice(0, -8);
    const badChecksum = validPng();
    badChecksum[29] ^= 1;
    try {
      await expect(store.savePng({ bytes: truncated, pageId: draft.pageId })).rejects.toThrow();
      await expect(store.savePng({ bytes: badChecksum, pageId: draft.pageId })).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
      expect(await readdir(directory)).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects invalid asset ownership scopes and oversized image bytes before touching storage', async () => {
    const { AssetStore } = await import('../src/services/asset-store.js');
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-scope-'));
    const create = vi.fn();
    const store = new AssetStore({ create, get: vi.fn() } as never, directory);
    try {
      await expect(store.savePng({ bytes: validPng(), pageId: 'invalid page' })).rejects.toThrow('Invalid asset ownership scope');
      await expect(store.savePng({ bytes: validPng(), pageId: draft.pageId, draftId: 'invalid draft' })).rejects.toThrow('Invalid asset ownership scope');
      await expect(store.savePng({ bytes: new Uint8Array(20 * 1024 * 1024 + 1), pageId: draft.pageId })).rejects.toThrow('PNG asset bytes exceed limits');
      expect(create).not.toHaveBeenCalled();
      expect(await readdir(directory)).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('returns null when persisted asset bytes fail path, metadata, size, hash, or dimension checks', async () => {
    const { createHash } = await import('node:crypto');
    const { AssetStore } = await import('../src/services/asset-store.js');
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-assets-read-integrity-'));
    const bytes = validPng();
    const summary = { assetId: 'asset-valid', pageId: draft.pageId, mimeType: 'image/png' as const,
      byteLength: bytes.length, width: 1, height: 1, sha256: createHash('sha256').update(bytes).digest('hex'), createdAt: new Date().toISOString() };
    const rows = new Map([[summary.assetId, summary]]);
    const repository = { get: (id: string) => rows.get(id) ?? null } as never;
    const store = new AssetStore(repository, directory);
    try {
      expect(await store.read('../escape')).toBeNull();
      expect(await store.read('asset-unregistered')).toBeNull();
      expect(await store.read(summary.assetId)).toBeNull();

      await writeFile(join(directory, `${summary.assetId}.png`), Buffer.from([1]));
      expect(await store.read(summary.assetId)).toBeNull();

      await writeFile(join(directory, `${summary.assetId}.png`), bytes);
      rows.set(summary.assetId, { ...summary, sha256: '0'.repeat(64) });
      expect(await store.read(summary.assetId)).toBeNull();
      rows.set(summary.assetId, { ...summary, width: 2 });
      expect(await store.read(summary.assetId)).toBeNull();
      rows.set(summary.assetId, summary);
      expect((await store.read(summary.assetId))?.sha256).toBe(summary.sha256);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
