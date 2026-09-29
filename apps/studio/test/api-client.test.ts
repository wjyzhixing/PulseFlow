import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearToken, setToken } from '../src/features/auth/auth-store';
import { read, request } from '../src/shared/api/client';

afterEach(() => {
  clearToken();
  vi.unstubAllGlobals();
});

describe('Studio API client response validation', () => {
  it('sends JSON and the workspace bearer token for authenticated writes', async () => {
    setToken('test-token');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: 'saved' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/api/test', { title: 'saved' }, true, 'PUT')).resolves.toEqual({ id: 'saved' });
    expect(fetchMock).toHaveBeenCalledWith('/api/test', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }, body: '{"title":"saved"}'
    });
  });

  it('does not send a content type or bearer token for an unauthenticated multipart upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, data: 'uploaded' }));
    vi.stubGlobal('fetch', fetchMock);
    const body = new FormData();
    body.set('file', new Blob(['page']));

    await expect(request('/api/upload', body, false)).resolves.toBe('uploaded');
    expect(fetchMock).toHaveBeenCalledWith('/api/upload', { method: 'POST', headers: {}, body });
  });

  it('rejects authenticated reads and writes when no workspace token is set', async () => {
    await expect(request('/api/test', {})).rejects.toThrow('会话已过期，请重新登录');
    await expect(read('/api/test')).rejects.toThrow('会话已过期，请重新登录');
  });

  it('maps network failures to a friendly error for reads and writes', async () => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(request('/api/test', {})).rejects.toThrow('网络连接失败，请稍后重试');
    await expect(read('/api/test')).rejects.toThrow('网络连接失败，请稍后重试');
  });

  it('returns a clear invalid-response error when a request receives malformed JSON', async () => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{')));

    await expect(request('/api/test', {})).rejects.toThrow('服务响应无效，请稍后重试');
  });

  it('returns a clear invalid-response error when a read receives malformed JSON', async () => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{')));

    await expect(read('/api/test')).rejects.toThrow('服务响应无效，请稍后重试');
  });

  it('rejects a JSON response without a valid success or error envelope', async () => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ unexpected: true })));

    await expect(request('/api/test', {})).rejects.toThrow('服务响应无效，请稍后重试');
    await expect(read('/api/test')).rejects.toThrow('服务响应无效，请稍后重试');
  });

  it('uses the server message from a valid failure envelope', async () => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: false, error: { code: 'draft.conflict', message: '页面已更新' } }, { status: 409 }))));

    await expect(request('/api/test', {})).rejects.toThrow('页面已更新');
    await expect(read('/api/test')).rejects.toThrow('页面已更新');
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing error code', { ok: false, error: { message: 'bad' } }],
    ['a non-string error message', { ok: false, error: { code: 'bad', message: 3 } }],
    ['a success without data', { ok: true }]
  ])('rejects %s as an invalid API envelope', async (_label, payload) => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));

    await expect(request('/api/test', {})).rejects.toThrow('服务响应无效，请稍后重试');
    await expect(read('/api/test')).rejects.toThrow('服务响应无效，请稍后重试');
  });

  it('uses a generic error when a success envelope accompanies a failed HTTP status', async () => {
    setToken('test-token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true, data: null }, { status: 500 }))));

    await expect(request('/api/test', {})).rejects.toThrow('请求失败，请稍后重试');
    await expect(read('/api/test')).rejects.toThrow('请求失败，请稍后重试');
  });
});
