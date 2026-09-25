import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ModelConfig } from '@pulseflow/model-adapter';
import type { Draft } from '@pulseflow/contracts';
import { buildApp } from '../src/app.js';
import { validCandidate } from './fixtures/publish-candidates.js';

const privateInput = 'Synthetic private requirement sentence used only by the demo flow test.';
const allPassed = ['dsl', 'preview-compile', 'typecheck', 'template-build', 'eslint'].map((id) => ({
  id: id as 'dsl' | 'preview-compile' | 'typecheck' | 'template-build' | 'eslint',
  status: 'passed' as const,
  blocking: id !== 'eslint',
  diagnostics: []
}));

function deterministicModel(): ModelConfig {
  return {
    baseUrl: 'http://fake-model.test/v1', model: 'deterministic-demo', apiKey: 'fake-key', timeoutMs: 1000,
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        entityFields: validCandidate.entityFields,
        pageDsl: validCandidate.pageDsl,
        semanticQuestions: validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }))
      }) } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  };
}

describe('API demo flow', () => {
  it('parses, generates, confirms, edits, validates, and publishes without persisting requirement text', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-demo-'));
    const dbPath = join(directory, 'demo.sqlite');
    const app = buildApp({
      workspaceToken: 'demo-token', dbPath, modelConfig: deterministicModel(),
      releaseGateRunner: async () => allPassed
    });
    const headers = { authorization: 'Bearer demo-token' };
    let closed = false;
    try {
      const parsed = await app.inject({ method: 'POST', url: '/api/requirements/parse', headers, payload: { text: privateInput } });
      expect(parsed.statusCode).toBe(200);
      const sections = parsed.json().data.sections;
      expect(sections).toHaveLength(1);
      expect(sections[0].text).toBe(privateInput);

      const generated = await app.inject({ method: 'POST', url: '/api/drafts/generate', headers, payload: { sections } });
      expect(generated.statusCode).toBe(200);
      expect(generated.json().data.pageDsl).toEqual(validCandidate.pageDsl);

      const initialDraft: Draft = {
        id: 'demo-draft', pageId: generated.json().data.pageDsl.pageId,
        pageDsl: generated.json().data.pageDsl, entityFields: generated.json().data.entityFields,
        semanticQuestions: generated.json().data.semanticQuestions, status: 'draft'
      };
      expect((await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: initialDraft })).statusCode).toBe(201);

      const editedDraft: Draft = { ...initialDraft, status: 'confirmed', pageDsl: { ...initialDraft.pageDsl, title: 'Edited deterministic demo' } };
      const confirmed = await app.inject({ method: 'PUT', url: `/api/drafts/${initialDraft.id}`, headers, payload: editedDraft });
      expect(confirmed.statusCode).toBe(200);
      expect(confirmed.json().data.pageDsl.title).toBe('Edited deterministic demo');

      const published = await app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: initialDraft.id } });
      expect(published.statusCode).toBe(201);
      expect(published.json().data.gates.filter((gate: { blocking: boolean }) => gate.blocking)).toHaveLength(4);
      const latest = await app.inject({ method: 'GET', url: `/api/cli/pages/${initialDraft.pageId}/latest`, headers });
      expect(latest.statusCode).toBe(200);
      const generatedManifest = latest.json().data.files.find((file: { path: string }) => file.path === 'src/generated/manifest.json');
      expect(JSON.parse(generatedManifest.content).title).toBe('Edited deterministic demo');

      await app.close();
      closed = true;
      const persistedBytes = await readFile(dbPath);
      expect(persistedBytes.includes(Buffer.from(privateInput))).toBe(false);
    } finally {
      if (!closed) await app.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
