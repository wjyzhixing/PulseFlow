import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Draft } from '@pulseflow/contracts';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { DraftRepository, InvalidDraftError } from '../src/db/draft-repository.js';
import { PublicationRepository } from '../src/db/publication-repository.js';

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
      expect(created.statusCode).toBe(201);
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
      [async () => new Response('not-json', { status: 200 }), 502, 'generation.invalid', 'Model returned an invalid draft. Try again.']
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
    const result = { pageDsl: original.pageDsl, entityFields: [], semanticQuestions: [] };
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
