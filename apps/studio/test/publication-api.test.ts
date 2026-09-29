import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearToken, setToken } from '../src/features/auth/auth-store';
import { PublicationGateError, PublicationProjectGateError, publishDraft, publishStudioProject } from '../src/features/publish/publication-api';

afterEach(() => { clearToken(); vi.unstubAllGlobals(); });

describe('publishStudioProject', () => {
  it('sends the persisted file id and revision to the project release endpoint', async () => {
    setToken('workspace-token');
    const publication = { pageId: 'home', versionId: 'home-v1', createdAt: 'now', manifest: {}, files: [], gates: [] };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: {
      fileId: 'file-demo', title: '机器人官网', publications: [publication]
    } }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);

    await expect(publishStudioProject('file-demo', 3)).resolves.toMatchObject({
      fileId: 'file-demo', publications: [publication]
    });
    expect(fetch).toHaveBeenCalledWith('/api/publications/projects', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ fileId: 'file-demo', revision: 3 }),
      headers: expect.objectContaining({ Authorization: 'Bearer workspace-token' })
    }));
  });

  it('preserves page-level gate failures for the Studio panel', async () => {
    setToken('workspace-token');
    const pages = [{ pageId: 'about', status: 'failed' as const, gates: [{
      id: 'template-build' as const, status: 'failed' as const, blocking: true,
      diagnostics: [{ code: 'build.failed', path: 'Page.vue', message: '构建失败' }]
    }] }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false,
      error: { message: '一页未通过检查' }, pages }), { status: 422, headers: { 'Content-Type': 'application/json' } })));

    await expect(publishStudioProject('file-demo', 1)).rejects.toMatchObject({
      constructor: PublicationProjectGateError, pages
    });
  });

  it('handles session, transport, response, service, and project gate failures', async () => {
    await expect(publishStudioProject('file-demo', 1)).rejects.toThrow('会话已过期');
    await expect(publishDraft('draft-demo')).rejects.toThrow('会话已过期');
    setToken('workspace-token');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(publishStudioProject('file-demo', 1)).rejects.toThrow('网络连接失败');
    await expect(publishDraft('draft-demo')).rejects.toThrow('网络连接失败');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{')));
    await expect(publishStudioProject('file-demo', 1)).rejects.toThrow('服务响应无效');
    await expect(publishDraft('draft-demo')).rejects.toThrow('服务响应无效');

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: false, error: { message: '服务暂停' } }), { status: 503 })));
    await expect(publishStudioProject('file-demo', 1)).rejects.toThrow('服务暂停');
    await expect(publishDraft('draft-demo')).rejects.toThrow('服务暂停');

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(publishStudioProject('file-demo', 1)).rejects.toThrow('发布失败');
    await expect(publishDraft('draft-demo')).rejects.toThrow('发布失败');

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: false }), { status: 422 })));
    await expect(publishStudioProject('file-demo', 1)).rejects.toThrow('发布失败');
    await expect(publishDraft('draft-demo')).rejects.toThrow('发布失败');

    const pages = [{ pageId: 'home', status: 'failed' as const, gates: [] }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: false, pages }), { status: 422 })));
    await expect(publishStudioProject('file-demo', 1)).rejects.toMatchObject({ constructor: PublicationProjectGateError, pages });
  });

  it('publishes a draft and preserves gate failures and fallback service errors', async () => {
    setToken('workspace-token');
    const publication = { pageId: 'home', versionId: 'v1', createdAt: 'now', manifest: {}, files: [], gates: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: publication }), { status: 201 })));
    await expect(publishDraft('draft-demo')).resolves.toMatchObject(publication);

    const gates = [{ id: 'dsl' as const, status: 'failed' as const, blocking: true, diagnostics: [] }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: false, gates }), { status: 422 })));
    await expect(publishDraft('draft-demo')).rejects.toMatchObject({ constructor: PublicationGateError, gates });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: false }), { status: 500 })));
    await expect(publishDraft('draft-demo')).rejects.toThrow('发布失败');
  });
});
