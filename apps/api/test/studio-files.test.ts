import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const headers = { authorization: 'Bearer test-workspace-token' };
const page = (id: string, title: string) => ({
  id,
  pageDsl: { schemaVersion: 1, pageId: `${id}-dsl`, title, nodes: [] },
  entityFields: [],
  semanticQuestions: []
});
const file = {
  id: 'file-demo', title: '机器人官网', activePageId: 'tab-home',
  pages: [page('tab-home', '首页'), page('tab-about', '关于')]
};

describe('Studio file persistence', () => {
  it('requires workspace auth and persists the ordered page collection', async () => {
    const app = buildApp({ workspaceToken: 'test-workspace-token', dbPath: ':memory:' });
    try {
      const unauthorized = await app.inject({ method: 'GET', url: '/api/studio-files/latest' });
      expect(unauthorized.statusCode).toBe(401);

      const created = await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: file });
      expect(created.statusCode, created.body).toBe(201);
      expect(created.json().data).toMatchObject({ ...file, revision: 1 });

      const loaded = await app.inject({ method: 'GET', url: '/api/studio-files/latest', headers });
      expect(loaded.statusCode).toBe(200);
      expect(loaded.json().data.pages.map((item: { id: string }) => item.id)).toEqual(['tab-home', 'tab-about']);
      const byId = await app.inject({ method: 'GET', url: '/api/studio-files/file-demo', headers });
      expect(byId.json().data).toMatchObject(file);
    } finally { await app.close(); }
  });

  it('updates the file with optimistic revision checks and rejects invalid page DSL', async () => {
    const app = buildApp({ workspaceToken: 'test-workspace-token', dbPath: ':memory:' });
    try {
      await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: file });
      const updated = { ...file, title: 'PulseFlow Robotics', revision: 1 };
      const saved = await app.inject({ method: 'PUT', url: '/api/studio-files/file-demo', headers, payload: updated });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data).toMatchObject({ title: 'PulseFlow Robotics', revision: 2 });

      const stale = await app.inject({ method: 'PUT', url: '/api/studio-files/file-demo', headers, payload: updated });
      expect(stale.statusCode).toBe(409);

      const invalid = { ...updated, revision: 2, pages: [page('tab-home', '首页'), { ...page('tab-about', '关于'), pageDsl: { schemaVersion: 1, pageId: 'tab-home-dsl', title: '坏页面', nodes: [] } }] };
      const rejected = await app.inject({ method: 'PUT', url: '/api/studio-files/file-demo', headers, payload: invalid });
      expect(rejected.statusCode).toBe(400);
    } finally { await app.close(); }
  });

  it('returns empty reads and rejects invalid files, duplicate IDs, and invalid question data', async () => {
    const app = buildApp({ workspaceToken: 'test-workspace-token', dbPath: ':memory:' });
    try {
      expect((await app.inject({ method: 'GET', url: '/api/studio-files/latest', headers })).json().data).toBeNull();
      expect((await app.inject({ method: 'GET', url: '/api/studio-files/missing', headers })).json().data).toBeNull();

      const duplicateDslPageId = { ...page('tab-about', '关于'), pageDsl: { ...page('tab-home', '首页').pageDsl } };
      const invalidFiles = [
        null, [], { ...file, unexpected: true }, { ...file, id: 'invalid' }, { ...file, title: '  ' },
        { ...file, pages: [] }, { ...file, activePageId: 'missing' },
        { ...file, pages: [page('tab-home', '首页'), page('tab-home', '重复页')] },
        { ...file, pages: [page('tab-home', '首页'), duplicateDslPageId] },
        { ...file, pages: [{ ...page('tab-home', '首页'), semanticQuestions: [{ id: 'bad id', question: '问题' }] }] },
        { ...file, pages: [{ ...page('tab-home', '首页'), semanticQuestions: [{ id: 'q1', question: '   ' }] }] },
        { ...file, pages: [{ ...page('tab-home', '首页'), semanticQuestions: [{ id: 'q1', question: '问题', answer: 42 }] }] },
        { ...file, pages: [{ ...page('tab-home', '首页'), unexpected: true }] },
        { ...file, pages: [{ ...page('tab-home', '首页'), entityFields: Array(101).fill({ id: 'field' }) }] },
        { ...file, pages: [{ ...page('tab-home', '首页'), semanticQuestions: Array.from({ length: 51 }, (_, index) => ({ id: `q-${index}`, question: '问题' })) }] }
      ];
      for (const invalid of invalidFiles) {
        const response = await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: invalid });
        expect(response.statusCode, response.body).toBe(400);
      }

      const created = await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: file });
      expect(created.statusCode).toBe(201);
      const duplicate = await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: file });
      expect(duplicate.statusCode).toBe(409);

      const validQuestionFile = { ...file, id: 'file-questions', pages: [{
        ...page('tab-home', '首页'), semanticQuestions: [{ id: 'robot-goal', question: '访客最需要完成什么？', answer: '了解机器人产品' }]
      }] };
      const withQuestion = await app.inject({ method: 'POST', url: '/api/studio-files', headers, payload: validQuestionFile });
      expect(withQuestion.statusCode).toBe(201);
      expect(withQuestion.json().data.pages[0].semanticQuestions[0].answer).toBe('了解机器人产品');
    } finally { await app.close(); }
  });

  it('rejects malformed revision updates and reports conflicts for missing files', async () => {
    const app = buildApp({ workspaceToken: 'test-workspace-token', dbPath: ':memory:' });
    try {
      const invalidBodies = [null, [], {}, { revision: 0 }, { revision: 1.5 }];
      for (const body of invalidBodies) {
        const response = await app.inject({ method: 'PUT', url: '/api/studio-files/file-demo', headers, payload: body });
        expect(response.statusCode, response.body).toBe(400);
      }

      const mismatch = await app.inject({ method: 'PUT', url: '/api/studio-files/file-demo', headers, payload: { ...file, id: 'file-other', revision: 1 } });
      expect(mismatch.statusCode).toBe(400);
      const missing = await app.inject({ method: 'PUT', url: '/api/studio-files/file-missing', headers, payload: { ...file, id: 'file-missing', revision: 1 } });
      expect(missing.statusCode).toBe(409);
    } finally { await app.close(); }
  });
});
