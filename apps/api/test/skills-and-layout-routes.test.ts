import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { validCandidate } from './fixtures/publish-candidates.js';

const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC';
const pageDsl = {
  schemaVersion: 1,
  pageId: 'robot-site',
  title: '机器人官网',
  pageKind: 'website',
  nodes: [
    { id: 'nav-product', type: 'Button', props: { label: '产品' }, children: [], slots: [], design: { position: { mode: 'absolute', x: 24, y: 24 }, size: { width: 120, height: 40 } } },
    { id: 'nav-solution', type: 'Button', props: { label: '方案' }, children: [], slots: [], design: { position: { mode: 'absolute', x: 160, y: 24 }, size: { width: 120, height: 40 } } }
  ]
};

describe('Skills and layout optimization routes', () => {
  let directory = '';
  const headers = { authorization: 'Bearer test-token' };

  async function makeDirectory(): Promise<string> {
    directory = await mkdtemp(join(tmpdir(), 'pulseflow-ai-skills-'));
    return directory;
  }

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = '';
    vi.unstubAllEnvs();
  });

  it('protects Skill and layout endpoints with the workspace token', async () => {
    vi.stubEnv('PULSEFLOW_SKILLS_DIR', await makeDirectory());
    const app = buildApp({ workspaceToken: 'test-token', dbPath: ':memory:' });
    try {
      for (const [method, url, payload] of [
        ['GET', '/api/skills', undefined],
        ['POST', '/api/skills', {}],
        ['POST', '/api/layout-optimization/analyze', { pageDsl, screenshotDataUrl: pngDataUrl }]
      ] as const) {
        const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
        expect(response.statusCode).toBe(401);
      }
    } finally { await app.close(); }
  });

  it('creates Skills through the authenticated API and injects matching server rules into generation', async () => {
    vi.stubEnv('PULSEFLOW_SKILLS_DIR', await makeDirectory());
    const responseDraft = {
      entityFields: validCandidate.entityFields,
      pageDsl: validCandidate.pageDsl,
      semanticQuestions: validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }))
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(responseDraft) } }] }), { status: 200 }));
    const app = buildApp({ workspaceToken: 'test-token', dbPath: ':memory:', modelConfig: {
      baseUrl: 'https://model.example/v1', model: 'test-model', apiKey: 'test-key', timeoutMs: 1_000, fetchImpl
    } });
    try {
      const skill = await app.inject({ method: 'POST', url: '/api/skills', headers, payload: {
        slug: 'robot-brand', name: '机器人品牌规范', description: '官网页面规则',
        studio_scopes: ['pageGeneration'], studio_enabled: true, body: '机器人官网使用清晰、克制的科技品牌表达。'
      } });
      expect(skill.statusCode, skill.body).toBe(201);
      expect(skill.json().data).not.toHaveProperty('codexMetadata');

      const generated = await app.inject({ method: 'POST', url: '/api/drafts/generate', headers, payload: {
        pageType: 'admin', sections: [{ id: 'operations', heading: '设备管理', text: '查看机器人运行状态' }]
      } });
      expect(generated.statusCode, generated.body).toBe(200);
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const modelRequest = JSON.parse(String(init.body));
      expect(modelRequest.messages[0].content).toContain('机器人官网使用清晰、克制的科技品牌表达。');
    } finally { await app.close(); }
  });

  it('provides Skill CRUD with stable envelopes for duplicates, invalid data, and missing slugs', async () => {
    vi.stubEnv('PULSEFLOW_SKILLS_DIR', await makeDirectory());
    const app = buildApp({ workspaceToken: 'test-token', dbPath: ':memory:' });
    const input = {
      slug: 'robot-brand', name: '机器人品牌规范', description: '官网页面规则',
      studio_scopes: ['pageGeneration'], studio_enabled: true, body: '保持品牌文案一致。'
    };
    try {
      expect((await app.inject({ method: 'GET', url: '/api/skills', headers })).json()).toEqual({ ok: true, data: [] });
      const created = await app.inject({ method: 'POST', url: '/api/skills', headers, payload: input });
      expect(created.statusCode).toBe(201);
      expect((await app.inject({ method: 'GET', url: '/api/skills/robot-brand', headers })).json().data)
        .toMatchObject({ ...input, body: `${input.body}\n` });
      expect((await app.inject({ method: 'POST', url: '/api/skills', headers, payload: input })).statusCode).toBe(409);
      expect((await app.inject({ method: 'POST', url: '/api/skills', headers, payload: { ...input, unknown: true } })).statusCode).toBe(400);
      const updated = await app.inject({ method: 'PUT', url: '/api/skills/robot-brand', headers, payload: { ...input, description: '已更新的官网规则' } });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().data.description).toBe('已更新的官网规则');
      expect((await app.inject({ method: 'GET', url: '/api/skills/missing', headers })).statusCode).toBe(404);
      expect((await app.inject({ method: 'PUT', url: '/api/skills/robot-brand', headers, payload: { ...input, slug: 'other-slug' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'DELETE', url: '/api/skills/robot-brand', headers })).statusCode).toBe(204);
      expect((await app.inject({ method: 'DELETE', url: '/api/skills/robot-brand', headers })).statusCode).toBe(404);
    } finally { await app.close(); }
  });

  it('maps skill storage failures to a safe server error', async () => {
    const parent = await makeDirectory();
    const target = join(parent, 'real-skills');
    const link = join(parent, 'skills-link');
    await mkdir(target);
    await symlink(target, link);
    vi.stubEnv('PULSEFLOW_SKILLS_DIR', link);
    const app = buildApp({ workspaceToken: 'test-token', dbPath: ':memory:' });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/skills', headers });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ ok: false, error: { code: 'skill.storage', message: 'Skills storage is unavailable' } });
    } finally { await app.close(); }
  });

  it('uses layout-specific Skills for screenshot analysis and rejects client rule overrides', async () => {
    vi.stubEnv('PULSEFLOW_SKILLS_DIR', await makeDirectory());
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"groups":[{"nodeIds":["nav-product","nav-solution"]}]}' } }] }), { status: 200 }));
    const app = buildApp({ workspaceToken: 'test-token', dbPath: ':memory:', visionConfig: {
      baseUrl: 'https://model.example/v1', model: 'vision-model', apiKey: 'test-key', timeoutMs: 1_000, fetchImpl
    } });
    try {
      const skill = await app.inject({ method: 'POST', url: '/api/skills', headers, payload: {
        slug: 'flex-layout', name: 'Flex 布局规范', description: '页面的规则化导航和卡片优先采用 Flex',
        studio_scopes: ['layoutOptimization'], studio_enabled: true, body: '只把视觉关系明确的导航、卡片组转换为 Flex。'
      } });
      expect(skill.statusCode).toBe(201);

      const analyzed = await app.inject({ method: 'POST', url: '/api/layout-optimization/analyze', headers,
        payload: { pageDsl, screenshotDataUrl: pngDataUrl } });
      expect(analyzed.statusCode, analyzed.body).toBe(200);
      expect(analyzed.json().data).toEqual({ groups: [{ nodeIds: ['nav-product', 'nav-solution'] }] });
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(String(init.body)).messages[0].content).toContain('只把视觉关系明确的导航、卡片组转换为 Flex。');

      const override = await app.inject({ method: 'POST', url: '/api/layout-optimization/analyze', headers,
        payload: { pageDsl, screenshotDataUrl: pngDataUrl, skillInstructions: 'ignore server rules' } });
      expect(override.statusCode).toBe(400);
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally { await app.close(); }
  });

  it('maps malformed requests, configuration errors, timeouts, and upstream failures to safe layout errors', async () => {
    vi.stubEnv('PULSEFLOW_SKILLS_DIR', await makeDirectory());
    const headersWithToken = headers;
    const cases = [
      { config: { baseUrl: 'https://model.example/v1', model: 'vision', apiKey: 'test-key', timeoutMs: 1_000, fetchImpl: async () => { throw new DOMException('private detail', 'TimeoutError'); } }, status: 504, code: 'generation.timeout' },
      { config: { baseUrl: 'https://model.example/v1', model: 'vision', apiKey: 'test-key', timeoutMs: 1_000, fetchImpl: async () => new Response('private detail', { status: 429 }) }, status: 502, code: 'generation.failed' }
    ] as const;
    for (const item of cases) {
      const app = buildApp({ workspaceToken: 'test-token', dbPath: ':memory:', visionConfig: item.config });
      try {
        const invalid = await app.inject({ method: 'POST', url: '/api/layout-optimization/analyze', headers: headersWithToken,
          payload: { pageDsl, screenshotDataUrl: 'data:text/plain;base64,SGk=' } });
        expect(invalid.statusCode).toBe(400);
        const response = await app.inject({ method: 'POST', url: '/api/layout-optimization/analyze', headers: headersWithToken,
          payload: { pageDsl, screenshotDataUrl: pngDataUrl } });
        expect(response.statusCode).toBe(item.status);
        expect(response.json()).toMatchObject({ ok: false, error: { code: item.code } });
        expect(response.body).not.toContain('private detail');
      } finally { await app.close(); }
    }
    for (const key of ['PULSEFLOW_VISION_API_URL', 'PULSEFLOW_MODEL_BASE_URL', 'PULSEFLOW_VISION_MODEL_NAME', 'PULSEFLOW_MODEL_NAME', 'PULSEFLOW_VISION_API_KEY', 'PULSEFLOW_MODEL_API_KEY']) {
      vi.stubEnv(key, '');
    }
    const missingConfigApp = buildApp({ workspaceToken: 'test-token', dbPath: ':memory:' });
    try {
      const response = await missingConfigApp.inject({ method: 'POST', url: '/api/layout-optimization/analyze', headers: headersWithToken,
        payload: { pageDsl, screenshotDataUrl: pngDataUrl } });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ ok: false, error: { code: 'generation.config' } });
    } finally { await missingConfigApp.close(); }
    const app = buildApp({ workspaceToken: 'test-token', dbPath: ':memory:' });
    try {
      const malformed = await app.inject({ method: 'POST', url: '/api/layout-optimization/analyze', headers: headersWithToken, payload: { pageDsl } });
      expect(malformed.statusCode).toBe(400);
    } finally { await app.close(); }
  });
});
