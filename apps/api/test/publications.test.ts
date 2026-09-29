import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Draft } from '@pulseflow/contracts';
import type { GateResult } from '../src/services/release-gates.js';
import { buildApp } from '../src/app.js';
import { createApiClient } from '../../../packages/cli/src/api-client.js';
import { validCandidate } from './fixtures/publish-candidates.js';

const headers = { authorization: 'Bearer secret' };
const confirmed: Draft = {
  id: 'draft-1', pageId: validCandidate.pageDsl.pageId, status: 'confirmed',
  pageDsl: validCandidate.pageDsl, entityFields: validCandidate.entityFields,
  semanticQuestions: validCandidate.semanticQuestions
};
const allPassed: GateResult[] = (['dsl', 'preview-compile', 'template-build'] as const)
  .map((id) => ({ id, status: 'passed', blocking: true, diagnostics: [] }));

describe('publication API', () => {
  it('does not publish any page in a Studio project when a later page fails a release gate', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', releaseGateRunner: async (candidate) =>
      candidate.pageDsl.pageId === 'about-dsl'
        ? [{ id: 'template-build', status: 'failed', blocking: true, diagnostics: [{ code: 'template.failed', path: 'src/generated/Page.vue', message: 'Build failed' }] }]
        : allPassed
    });
    const project = {
      id: 'file-demo', title: '机器人官网', activePageId: 'home',
      pages: [
        { id: 'home', pageDsl: { schemaVersion: 1, pageId: 'home-dsl', title: '首页', nodes: [] }, entityFields: [], semanticQuestions: [] },
        { id: 'about', pageDsl: { schemaVersion: 1, pageId: 'about-dsl', title: '关于', nodes: [] }, entityFields: [], semanticQuestions: [] }
      ]
    };
    try {
      await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: project });
      const response = await app.inject({ method: 'POST', url: '/api/publications/projects', headers, payload: { fileId: project.id, revision: 1 } });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ ok: false, error: { code: 'publication.gate_failed' }, pages: [
        { pageId: 'home-dsl', status: 'passed' },
        { pageId: 'about-dsl', status: 'failed', gates: [{ id: 'template-build', status: 'failed' }] }
      ] });
      expect((await app.inject({ method: 'GET', url: '/api/cli/pages/home-dsl/latest', headers })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/api/cli/pages/about-dsl/latest', headers })).statusCode).toBe(404);
    } finally { await app.close(); }
  });

  it('publishes every saved Studio page as one project release after all page gates pass', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', releaseGateRunner: async () => allPassed });
    const project = {
      id: 'file-demo', title: '机器人官网', activePageId: 'home',
      pages: [
        { id: 'home', pageDsl: { schemaVersion: 1, pageId: 'home-dsl', title: '首页', nodes: [] }, entityFields: [], semanticQuestions: [] },
        { id: 'about', pageDsl: { schemaVersion: 1, pageId: 'about-dsl', title: '关于', nodes: [] }, entityFields: [], semanticQuestions: [] }
      ]
    };
    try {
      await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: project });
      const response = await app.inject({ method: 'POST', url: '/api/publications/projects', headers, payload: { fileId: project.id, revision: 1 } });
      expect(response.statusCode).toBe(201);
      expect(response.json().data).toMatchObject({ fileId: project.id, title: project.title, publications: [
        { pageId: 'home-dsl', gates: allPassed },
        { pageId: 'about-dsl', gates: allPassed }
      ] });
      expect((await app.inject({ method: 'GET', url: '/api/cli/pages/home-dsl/latest', headers })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/cli/pages/about-dsl/latest', headers })).statusCode).toBe(200);
    } finally { await app.close(); }
  });

  it('rejects a project release when the saved Studio file changes while its gates are running', async () => {
    let signalGate: () => void = () => undefined;
    let releaseGate: () => void = () => undefined;
    const gateStarted = new Promise<void>((resolve) => { signalGate = resolve; });
    const gateHold = new Promise<void>((resolve) => { releaseGate = resolve; });
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', releaseGateRunner: async () => {
      signalGate();
      await gateHold;
      return allPassed;
    } });
    const project = {
      id: 'file-demo', title: '机器人官网', activePageId: 'home',
      pages: [
        { id: 'home', pageDsl: { schemaVersion: 1, pageId: 'home-dsl', title: '首页', nodes: [] }, entityFields: [], semanticQuestions: [] },
        { id: 'about', pageDsl: { schemaVersion: 1, pageId: 'about-dsl', title: '关于', nodes: [] }, entityFields: [], semanticQuestions: [] }
      ]
    };
    try {
      await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: project });
      const publishing = app.inject({ method: 'POST', url: '/api/publications/projects', headers, payload: { fileId: project.id, revision: 1 } });
      await gateStarted;
      const changed = await app.inject({ method: 'PUT', url: `/api/studio-files/${project.id}`, headers, payload: { ...project, title: '已修改官网', revision: 1 } });
      expect(changed.statusCode).toBe(200);
      releaseGate();
      expect((await publishing).statusCode).toBe(409);
      expect((await app.inject({ method: 'GET', url: '/api/cli/pages/home-dsl/latest', headers })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/api/cli/pages/about-dsl/latest', headers })).statusCode).toBe(404);
    } finally { releaseGate(); await app.close(); }
  });

  it('does not publish an obsolete snapshot when a draft changes during release gates', async () => {
    let signalGate: () => void = () => undefined;
    let releaseGate: () => void = () => undefined;
    const gateStarted = new Promise<void>((resolve) => { signalGate = resolve; });
    const gateHold = new Promise<void>((resolve) => { releaseGate = resolve; });
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', releaseGateRunner: async () => {
      signalGate();
      await gateHold;
      return allPassed;
    } });
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: confirmed });
      const publishing = app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: confirmed.id } });
      await gateStarted;
      const changed = { ...confirmed, pageDsl: { ...confirmed.pageDsl, title: 'Changed during gates' } };
      expect((await app.inject({ method: 'PUT', url: `/api/drafts/${confirmed.id}`, headers, payload: changed })).statusCode).toBe(200);
      releaseGate();
      expect((await publishing).statusCode).toBe(409);
      expect((await app.inject({ method: 'GET', url: `/api/cli/pages/${confirmed.pageId}/latest`, headers })).statusCode).toBe(404);
      expect((await app.inject({ method: 'PUT', url: `/api/drafts/${confirmed.id}`, headers, payload: confirmed })).statusCode).toBe(200);
    } finally { releaseGate(); await app.close(); }
  });
  it('requires authorization and a confirmed draft', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', releaseGateRunner: async () => allPassed });
    try {
      expect((await app.inject({ method: 'POST', url: '/api/publications', payload: { draftId: 'draft-1' } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: 'missing' } })).statusCode).toBe(404);
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: { ...confirmed, status: 'draft' } });
      expect((await app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: 'draft-1' } })).statusCode).toBe(409);
    } finally { await app.close(); }
  });

  it('blocks publication after any failed hard gate and preserves diagnostics', async () => {
    for (const gate of ['dsl', 'preview-compile', 'template-build'] as const) {
      const results = [...allPassed.slice(0, allPassed.findIndex((item) => item.id === gate)),
        { id: gate, status: 'failed' as const, blocking: true, diagnostics: [{ code: 'gate.failed', path: 'src/generated/Page.vue', message: 'Failed' }] }];
      const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:', releaseGateRunner: async () => results });
      try {
        await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: confirmed });
        const response = await app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: 'draft-1' } });
        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({ ok: false, error: { code: 'publication.gate_failed' }, gates: results });
        expect((await app.inject({ method: 'GET', url: `/api/cli/pages/${confirmed.pageId}/latest`, headers })).statusCode).toBe(404);
      } finally { await app.close(); }
    }
  });

  it('publishes with page-focused gates; keeps versions immutable and downloads only latest published', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-publications-'));
    const dbPath = join(directory, 'database.sqlite');
    const app = buildApp({ workspaceToken: 'secret', dbPath, releaseGateRunner: async () => allPassed });
    try {
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: confirmed });
      const firstResponse = await app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: confirmed.id, sourceText: 'PRIVATE REQUIREMENT BODY' } });
      expect(firstResponse.statusCode).toBe(201);
      const first = firstResponse.json().data;
      expect(first).toMatchObject({ pageId: confirmed.pageId, gates: allPassed });
      expect(first.versionId).toEqual(expect.any(String));
      expect(first.manifest.entry).toBe('src/generated/Page.vue');
      expect(first.files).toContainEqual(expect.objectContaining({ path: 'src/generated/Page.vue' }));
      expect((await app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: confirmed.id } })).statusCode).toBe(409);
      expect((await app.inject({ method: 'PUT', url: `/api/drafts/${confirmed.id}`, headers, payload: { ...confirmed, pageDsl: { ...confirmed.pageDsl, title: 'Modified' } } })).statusCode).toBe(409);
      expect((await app.inject({ method: 'PUT', url: `/api/publications/${first.versionId}`, headers, payload: {} })).statusCode).toBe(404);

      const nextDraft = { ...confirmed, id: 'draft-2', pageDsl: { ...confirmed.pageDsl, title: 'Modified' } };
      await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: nextDraft });
      const secondResponse = await app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: nextDraft.id } });
      expect(secondResponse.statusCode).toBe(201);
      const second = secondResponse.json().data;
      expect(second.versionId).not.toBe(first.versionId);
      const latest = (await app.inject({ method: 'GET', url: `/api/cli/pages/${confirmed.pageId}/latest`, headers })).json().data;
      expect(latest).toMatchObject({ versionId: second.versionId, pageId: confirmed.pageId });
      expect(latest.files.every((file: { content: string; sha256: string }) =>
        file.sha256 === createHash('sha256').update(file.content, 'utf8').digest('hex'))).toBe(true);
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address() as AddressInfo;
      const pulled = await createApiClient(`http://127.0.0.1:${address.port}`).fetchLatest(confirmed.pageId, 'secret');
      expect(pulled.files.every((file) => file.path.startsWith(`src/views/${confirmed.pageId}/`))).toBe(true);
      const localGeneratedManifest = pulled.files.find((file) => file.path === `src/views/${confirmed.pageId}/manifest.json`);
      expect(JSON.parse(localGeneratedManifest!.content)).toMatchObject({
        entry: `src/views/${confirmed.pageId}/Page.vue`,
        files: expect.arrayContaining([`src/views/${confirmed.pageId}/Page.vue`])
      });
      expect((await app.inject({ method: 'GET', url: `/api/publications/${first.versionId}`, headers })).json().data)
        .toMatchObject({ versionId: first.versionId, manifest: first.manifest });
      const bytes = await readFile(dbPath);
      expect(bytes.includes(Buffer.from('PRIVATE REQUIREMENT BODY'))).toBe(false);
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });
});
