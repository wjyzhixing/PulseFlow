import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { Draft } from '@pulseflow/contracts';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { DraftRepository, InvalidDraftError } from '../src/db/draft-repository.js';
import { PublicationRepository } from '../src/db/publication-repository.js';
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
  view.setUint32(0, data.length); bytes.set(new TextEncoder().encode(name), 4); bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
function tinyPng(): Uint8Array {
  const header = new Uint8Array(13); new DataView(header.buffer).setUint32(0, 1); new DataView(header.buffer).setUint32(4, 1); header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(new Uint8Array(4))), pngChunk('IEND', new Uint8Array())]);
}

const original: Draft = {
  id: 'draft-1', pageId: 'page-1', status: 'draft', entityFields: [], semanticQuestions: [],
  pageDsl: { schemaVersion: 1, pageId: 'page-1', title: 'First', nodes: [] }
};

describe('draft persistence', () => {
  it('validates drafts at the repository boundary and tracks publication records', () => {
    const db = openDatabase(':memory:');
    try {
      const repository = new DraftRepository(db);
      const publications = new PublicationRepository(db);
      expect(publications.isPublished(original.id)).toBe(false);
      expect(repository.create(original)).toEqual(original);
      expect(repository.get(original.id)).toEqual(original);
      expect(() => repository.update({ ...original, pageDsl: { ...original.pageDsl, nodes: [{ id: 'bad', type: 'Script', props: {}, children: [], slots: [] }] } } as Draft)).toThrow(InvalidDraftError);
      expect(repository.get(original.id)).toEqual(original);
      db.prepare('INSERT INTO publications (id, draftId, publishedAt) VALUES (?, ?, ?)').run('pub-1', original.id, new Date().toISOString());
      expect(publications.isPublished(original.id)).toBe(true);
    } finally { db.close(); }
  });
  it('rejects unrecognized semantic question fields before storing a draft', () => {
    const db = openDatabase(':memory:');
    try {
      const repository = new DraftRepository(db);
      const withRawInput = {
        ...original,
        semanticQuestions: [{ id: 'question-1', question: 'Who approves?', rawRequirement: 'private source text' }]
      } as unknown as Draft;
      expect(() => repository.create(withRawInput)).toThrow(InvalidDraftError);
      expect(repository.get(original.id)).toBeNull();
    } finally { db.close(); }
  });
  it('creates, reads and updates a draft in SQLite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-drafts-'));
    const dbPath = join(directory, 'drafts.sqlite');
    const app = buildApp({ workspaceToken: 'secret', dbPath });
    const headers = { authorization: 'Bearer secret' };
    try {
      const created = await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: { ...original, rawRequirement: 'private source text', sourcePath: '/private/requirements.docx' } });
      expect(created.statusCode, created.body).toBe(201);
      expect(created.json()).toEqual({ ok: true, data: original });
      const updated = { ...original, status: 'confirmed' as const, pageDsl: { ...original.pageDsl, title: 'Revised' } };
      const put = await app.inject({ method: 'PUT', url: '/api/drafts/draft-1', headers, payload: updated });
      expect(put.statusCode).toBe(200);
      const read = await app.inject({ method: 'GET', url: '/api/drafts/draft-1', headers });
      expect(read.json()).toEqual({ ok: true, data: updated });
      const db = openDatabase(dbPath);
      try {
        expect(db.prepare('PRAGMA table_info(drafts)').all().map((column) => (column as { name: string }).name)).toEqual([
          'id', 'pageId', 'pageDslJson', 'entityFieldsJson', 'semanticQuestionsJson', 'status', 'updatedAt'
        ]);
      } finally { db.close(); }
      const bytes = await readFile(dbPath);
      expect(bytes.includes(Buffer.from('private source text'))).toBe(false);
      expect(bytes.includes(Buffer.from('/private/requirements.docx'))).toBe(false);
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects invalid DSL and preserves the previous draft', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-drafts-'));
    const app = buildApp({ workspaceToken: 'secret', dbPath: join(directory, 'drafts.sqlite') });
    const headers = { authorization: 'Bearer secret' };
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: original });
      const invalid = await app.inject({ method: 'PUT', url: '/api/drafts/draft-1', headers, payload: { ...original, pageDsl: { ...original.pageDsl, nodes: [{ id: 'bad', type: 'Script', props: {}, children: [], slots: [] }] } } });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ ok: false, error: { code: 'draft.invalid' } });
      const read = await app.inject({ method: 'GET', url: '/api/drafts/draft-1', headers });
      expect(read.json()).toEqual({ ok: true, data: original });
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('does not change a stored draft when generation fails', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: '', timeoutMs: 1000 } });
    const headers = { authorization: 'Bearer secret' };
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: original });
      const generated = await app.inject({ method: 'POST', url: '/api/drafts/generate', headers, payload: { sections: [{ id: 'one', heading: null, text: 'Need a form' }] } });
      expect(generated.statusCode).toBe(503);
      expect(generated.json()).toEqual({ ok: false, error: { code: 'generation.config', message: 'Model service is not configured. Ask an administrator to configure it.' } });
      const read = await app.inject({ method: 'GET', url: '/api/drafts/draft-1', headers });
      expect(read.json()).toEqual({ ok: true, data: original });
    } finally { await app.close(); }
  });

  it('returns actionable, safe errors for model timeouts and invalid output', async () => {
    const headers = { authorization: 'Bearer secret' };
    const sections = [{ id: 'one', heading: null, text: 'Need a form' }];
    const modelConfig = { baseUrl: 'https://model.example', model: 'test', apiKey: ['test', 'only'].join('-'), timeoutMs: 1000 };
    for (const [fetchImpl, status, code, message] of [
      [async () => { throw new DOMException('private transport detail', 'TimeoutError'); }, 504, 'generation.timeout', 'Model request timed out. Try again.'],
      [async () => new Response('not-json', { status: 200 }), 502, 'generation.invalid', 'Model returned invalid JSON'],
      [async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({}) } }] }), { status: 200 }), 502, 'generation.invalid', 'Generated draft has an invalid field at entityFields.']
    ] as const) {
      const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', modelConfig: { ...modelConfig, fetchImpl: fetchImpl as typeof fetch } });
      try {
        const response = await app.inject({ method: 'POST', url: '/api/drafts/generate', headers, payload: { sections } });
        expect(response.statusCode).toBe(status);
        expect(response.json()).toEqual({ ok: false, error: { code, message } });
        expect(response.body).not.toContain('private transport detail');
      } finally { await app.close(); }
    }
  });

  it('rejects malformed requirement sections with a client error envelope', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:' });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/drafts/generate', headers: { authorization: 'Bearer secret' },
        payload: { sections: [null] }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ ok: false, error: { code: 'input.invalid' } });
    } finally { await app.close(); }
  });

  it('returns a generated DTO without persisting it', async () => {
    const result = {
      pageDsl: validCandidate.pageDsl,
      entityFields: validCandidate.entityFields,
      semanticQuestions: validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }))
    };
    const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: ['test', 'only'].join('-'), timeoutMs: 1000, fetchImpl: fetchImpl as typeof fetch } });
    const headers = { authorization: 'Bearer secret' };
    try {
      const generated = await app.inject({ method: 'POST', url: '/api/drafts/generate', headers, payload: { sections: [{ id: 'one', heading: null, text: 'Need a form' }] } });
      expect(generated.statusCode).toBe(200);
      expect(generated.json()).toEqual({ ok: true, data: result });
      const absent = await app.inject({ method: 'GET', url: '/api/drafts/draft-1', headers });
      expect(absent.statusCode).toBe(404);
    } finally { await app.close(); }
  });

  it('refines the supplied current page without persisting it', async () => {
    const currentPage = validCandidate.pageDsl;
    const refined = { ...currentPage, title: '企业账户总览', pageKind: 'admin' as const };
    const entityFields = validCandidate.entityFields;
    const semanticQuestions = validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }));
    const modelResult = { entityFields, pageDsl: refined, semanticQuestions, intent: 'page_edit' };
    const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelResult) } }] }), { status: 200 });
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: 'test-only', timeoutMs: 1000, fetchImpl } });
    const headers = { authorization: 'Bearer secret' };
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/drafts/refine', headers,
        payload: { instruction: '标题改成企业账户总览', entityFields, pageDsl: currentPage, semanticQuestions }
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({ ok: true, data: modelResult });
      expect((await app.inject({ method: 'GET', url: '/api/drafts/draft-1', headers })).statusCode).toBe(404);
    } finally { await app.close(); }
  });

  it('does not call image generation for a page-only refinement', async () => {
    const entityFields = validCandidate.entityFields;
    const semanticQuestions = validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }));
    const result = { entityFields, pageDsl: { ...validCandidate.pageDsl, pageKind: 'admin' as const }, semanticQuestions, intent: 'page_edit' };
    const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
    const imageFetch = vi.fn();
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:',
      modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: 'test-only', timeoutMs: 1000, fetchImpl },
      imageConfig: { baseUrl: 'https://model.example/v1', endpointUrl: 'https://model.example/v1/images/generations', model: 'qwen-image-2.0', apiKey: 'test-only', mode: 'openai-images', timeoutMs: 1000, allowedResultHosts: [], fetchImpl: imageFetch }
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/drafts/refine', headers: { authorization: 'Bearer secret' },
        payload: { instruction: '把标题改短', entityFields, pageDsl: validCandidate.pageDsl, semanticQuestions }
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.intent).toBe('page_edit');
      expect(imageFetch).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('returns needs_confirmation for ambiguous image intent without calling image provider', async () => {
    const entityFields = validCandidate.entityFields;
    const semanticQuestions = validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }));
    const result = { entityFields, pageDsl: { ...validCandidate.pageDsl, pageKind: 'admin' as const }, semanticQuestions, intent: 'needs_confirmation', imagePlan: { prompt: '生成企业服务配图', targetNodeId: validCandidate.pageDsl.nodes[0]!.id, placement: 'inline' } };
    const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
    const imageFetch = vi.fn();
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: 'test-only', timeoutMs: 1000, fetchImpl },
      imageConfig: { baseUrl: 'https://model.example/v1', endpointUrl: 'https://model.example/v1/images/generations', model: 'qwen-image-2.0', apiKey: 'test-only', mode: 'openai-images', timeoutMs: 1000, allowedResultHosts: [], fetchImpl: imageFetch }
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/drafts/refine', headers: { authorization: 'Bearer secret' }, payload: {
        instruction: '让首页更好看一些', entityFields, pageDsl: validCandidate.pageDsl, semanticQuestions
      } });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.intent).toBe('needs_confirmation');
      expect(response.json().data.imagePlan.prompt).toBe('生成企业服务配图');
      expect(imageFetch).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('keeps a valid page edit when combined image generation fails', async () => {
    const entityFields = validCandidate.entityFields;
    const semanticQuestions = validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }));
    const result = { entityFields, pageDsl: { ...validCandidate.pageDsl, title: '服务首页新版', pageKind: 'admin' as const }, semanticQuestions, intent: 'page_edit_and_image',
      imagePlan: { prompt: '明亮的企业服务图片', targetNodeId: validCandidate.pageDsl.nodes[0]!.id, placement: 'inline' } };
    const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
    const imageFetch = async () => new Response('upstream unavailable', { status: 503 });
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: 'test-only', timeoutMs: 1000, fetchImpl },
      imageConfig: { baseUrl: 'https://model.example/v1', endpointUrl: 'https://model.example/v1/images/generations', model: 'qwen-image-2.0', apiKey: 'test-only', mode: 'openai-images', timeoutMs: 1000, allowedResultHosts: [], fetchImpl: imageFetch }
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/drafts/refine', headers: { authorization: 'Bearer secret' }, payload: {
        instruction: '更新标题并生成横幅图', entityFields, pageDsl: validCandidate.pageDsl, semanticQuestions
      } });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.pageDsl.title).toBe('服务首页新版');
      expect(response.json().data.imageGeneration).toMatchObject({ status: 'failed', error: {
        code: 'generation.image_provider', message: 'Image service rejected the request (HTTP 503). Try again later or contact an administrator. Your page edits are ready.'
      } });
      expect(JSON.stringify(response.json().data.pageDsl)).not.toContain('asset-');
    } finally { await app.close(); }
  });

  it('applies one generated inline image to the refined page when explicit image intent succeeds', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-refine-image-'));
    const entityFields = validCandidate.entityFields;
    const semanticQuestions = validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }));
    const result = { entityFields, pageDsl: { ...validCandidate.pageDsl, pageKind: 'admin' as const }, semanticQuestions, intent: 'page_edit_and_image',
      imagePlan: { prompt: '清晰克制的企业管理产品配图', targetNodeId: 'header', placement: 'inline' } };
    const textFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
    const bytes = tinyPng();
    const imageFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] })));
    const app = buildApp({ workspaceToken: 'secret', dbPath: join(directory, 'db.sqlite'), assetDir: join(directory, 'assets'),
      modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: 'test-only', timeoutMs: 1000, fetchImpl: textFetch },
      imageConfig: { baseUrl: 'https://model.example/v1', endpointUrl: 'https://model.example/v1/images/generations', model: 'qwen-image-2.0', apiKey: 'test-only', mode: 'openai-images', timeoutMs: 1000, allowedResultHosts: [], fetchImpl: imageFetch }
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/drafts/refine', headers: { authorization: 'Bearer secret' }, payload: {
        instruction: '修改页面并在标题下方生成配图', entityFields, pageDsl: validCandidate.pageDsl, semanticQuestions
      } });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data).toMatchObject({ intent: 'page_edit_and_image', imageGeneration: { status: 'generated', applied: true }, generatedAssets: [{ mimeType: 'image/png' }] });
      expect(response.json().data.pageDsl.nodes[1]).toMatchObject({ type: 'Image', props: { assetId: response.json().data.generatedAssets[0].assetId } });
      expect(imageFetch).toHaveBeenCalledOnce();
      expect(JSON.parse(String((imageFetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ n: 1, model: 'qwen-image-2.0' });
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('rechecks saved draft revision after image generation and retains a late asset without applying edits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-refine-revision-'));
    const dbPath = join(directory, 'db.sqlite');
    const entityFields = validCandidate.entityFields;
    const semanticQuestions = validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }));
    const saved = { id: 'draft-revision', pageId: validCandidate.pageDsl.pageId, status: 'draft' as const, pageDsl: validCandidate.pageDsl, entityFields, semanticQuestions };
    const result = { entityFields, pageDsl: { ...validCandidate.pageDsl, title: '模型修改' }, semanticQuestions, intent: 'page_edit_and_image',
      imagePlan: { prompt: '管理系统配图', targetNodeId: 'header', placement: 'inline' } };
    const textFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
    const bytes = tinyPng();
    const imageFetch = vi.fn(async () => {
      const concurrentDb = openDatabase(dbPath);
      try { new DraftRepository(concurrentDb).update({ ...saved, pageDsl: { ...saved.pageDsl, title: '设计人员同期编辑' } }); }
      finally { concurrentDb.close(); }
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] }));
    });
    const app = buildApp({ workspaceToken: 'secret', dbPath, assetDir: join(directory, 'assets'),
      modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: 'test-only', timeoutMs: 1000, fetchImpl: textFetch },
      imageConfig: { baseUrl: 'https://model.example/v1', endpointUrl: 'https://model.example/v1/images/generations', model: 'qwen-image-2.0', apiKey: 'test-only', mode: 'openai-images', timeoutMs: 1000, allowedResultHosts: [], fetchImpl: imageFetch }
    });
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers: { authorization: 'Bearer secret' }, payload: saved });
      const initial = await app.inject({ method: 'GET', url: `/api/drafts/${saved.id}`, headers: { authorization: 'Bearer secret' } });
      const expectedRevision = initial.headers.etag?.replaceAll('"', '');
      const response = await app.inject({ method: 'POST', url: '/api/drafts/refine', headers: { authorization: 'Bearer secret' }, payload: {
        instruction: '更新标题并生成配图', draftId: saved.id, expectedRevision, entityFields, pageDsl: validCandidate.pageDsl, semanticQuestions
      } });
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ ok: false, error: { code: 'draft.revision_conflict' }, data: { applyPageEdit: false, generatedAssets: [{ mimeType: 'image/png' }] } });
      expect(imageFetch).toHaveBeenCalledOnce();
      const latest = await app.inject({ method: 'GET', url: `/api/drafts/${saved.id}`, headers: { authorization: 'Bearer secret' } });
      expect(latest.json().data.pageDsl.title).toBe('设计人员同期编辑');
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects an oversized refinement request before calling the model', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', modelConfig: { baseUrl: 'https://model.example', model: 'test', apiKey: 'test-only', timeoutMs: 1000, fetchImpl } });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/drafts/refine', headers: { authorization: 'Bearer secret' },
        payload: { instruction: '继续调整', entityFields: [], pageDsl: { ...original.pageDsl, title: 'x'.repeat(64_000) }, semanticQuestions: [] }
      });
      expect(response.statusCode).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('uses safe envelopes for duplicate, missing and malformed drafts', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:' });
    const headers = { authorization: 'Bearer secret' };
    try {
      const absent = await app.inject({ method: 'GET', url: '/api/drafts/missing', headers });
      expect(absent.statusCode).toBe(404);
      const invalid = await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: {} });
      expect(invalid.statusCode).toBe(400);
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: original });
      const duplicate = await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: original });
      expect(duplicate.statusCode).toBe(409);
      const missing = await app.inject({ method: 'PUT', url: '/api/drafts/missing', headers, payload: { ...original, id: 'missing' } });
      expect(missing.statusCode).toBe(404);
      const mismatch = await app.inject({ method: 'PUT', url: '/api/drafts/draft-1', headers, payload: { ...original, id: 'other' } });
      expect(mismatch.statusCode).toBe(400);
    } finally { await app.close(); }
  });
});
