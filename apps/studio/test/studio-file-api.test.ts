import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearToken, setToken } from '../src/features/auth/auth-store';
import { cloneStudioFilePage, createStudioFile, loadLatestStudioFile, loadStudioFile, updateStudioFile } from '../src/features/design/studio-file-api';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures';

afterEach(() => { clearToken(); vi.unstubAllGlobals(); });

describe('Studio file API', () => {
  it('loads, creates, and updates project files with authenticated requests', async () => {
    setToken('workspace-token');
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, data: { id: 'file-demo' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await expect(loadLatestStudioFile()).resolves.toMatchObject({ id: 'file-demo' });
    await expect(loadStudioFile('file/a')).resolves.toMatchObject({ id: 'file-demo' });
    const input = { id: 'file-demo', title: '机器人官网', activePageId: 'home', pages: [] };
    await createStudioFile(input);
    await updateStudioFile(input, 4);

    expect(fetch.mock.calls.map(([url, init]) => [url, (init as RequestInit).method])).toEqual([
      ['/api/studio-files/latest', 'GET'], ['/api/studio-files/file%2Fa', 'GET'],
      ['/api/studio-files', 'POST'], ['/api/studio-files/file-demo', 'PUT']
    ]);
  });

  it('clones nested page data without sharing mutable rules, DSL, or questions', () => {
    const source = {
      id: 'home', pageDsl: structuredClone(validPage), entityFields: structuredClone(validFields),
      semanticQuestions: [{ id: 'goal', question: '访问者目标？', answer: '了解产品' }]
    };
    const copy = cloneStudioFilePage(source);

    expect(copy).toEqual(source);
    expect(copy.pageDsl).not.toBe(source.pageDsl);
    expect(copy.semanticQuestions[0]).not.toBe(source.semanticQuestions[0]);
    if (source.entityFields[0]?.rules[0]?.kind === 'enum' && copy.entityFields[0]?.rules[0]?.kind === 'enum') {
      expect(copy.entityFields[0].rules[0].values).not.toBe(source.entityFields[0].rules[0].values);
    }
  });
});
