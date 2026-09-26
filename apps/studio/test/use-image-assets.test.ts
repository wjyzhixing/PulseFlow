import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { effectScope, nextTick, shallowRef } from 'vue';
import { setToken, clearToken } from '../src/features/auth/auth-store';
import { useImageAssets } from '../src/features/preview/use-image-assets';

const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const pngResponse = () => new Response(pngBytes, { headers: { 'Content-Type': 'image/png' } });

afterEach(() => { clearToken(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useImageAssets', () => {
  it('fetches a generated PNG with the workspace token and exposes its blob URL', async () => {
    setToken('workspace-secret');
    const createUrl = vi.fn<(blob: Blob) => string>(() => 'blob:https://studio.test/first');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const fetchImage = vi.fn<typeof fetch>(async () => pngResponse());
    const scope = effectScope();
    const urls = scope.run(() => useImageAssets(shallowRef(['asset-first']), fetchImage))!;

    await vi.waitFor(() => expect(urls.urls.value['asset-first']).toBe('blob:https://studio.test/first'));
    expect(urls.error.value).toBe('');
    expect(fetchImage).toHaveBeenCalledWith('/api/assets/asset-first', expect.objectContaining({
      method: 'GET', headers: { Authorization: 'Bearer workspace-secret' }
    }));
    expect(createUrl).toHaveBeenCalledOnce();
    expect(createUrl.mock.calls[0]?.[0]).toMatchObject({ size: pngBytes.length, type: 'image/png' });
    urls.dispose();
    expect(revokeUrl).toHaveBeenCalledWith('blob:https://studio.test/first');
    urls.dispose();
    scope.stop();
    expect(revokeUrl).toHaveBeenCalledOnce();
  });

  it('retains unchanged URLs and revokes removed URLs on replacement and disposal', async () => {
    setToken('workspace-secret');
    const createUrl = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const fetchImage = vi.fn(async () => pngResponse());
    const ids = shallowRef<readonly string[]>(['asset-first']);
    const scope = effectScope();
    const urls = scope.run(() => useImageAssets(ids, fetchImage))!;
    await vi.waitFor(() => expect(urls.urls.value['asset-first']).toBe('blob:first'));

    ids.value = ['asset-first', 'asset-second'];
    await vi.waitFor(() => expect(urls.urls.value['asset-second']).toBe('blob:second'));
    expect(urls.urls.value['asset-first']).toBe('blob:first');
    expect(revokeUrl).not.toHaveBeenCalled();
    expect(fetchImage).toHaveBeenCalledTimes(2);

    ids.value = ['asset-second'];
    await nextTick();
    expect(urls.urls.value['asset-first']).toBeUndefined();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:first');
    scope.stop();
    expect(revokeUrl).toHaveBeenCalledWith('blob:second');
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps failed and invalid assets unmapped while loading other valid PNGs', async () => {
    setToken('workspace-secret');
    const createUrl = vi.fn(() => 'blob:valid');
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    const fetchImage = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('asset-missing')) return new Response('missing', { status: 404 });
      if (String(input).endsWith('asset-not-png')) return new Response('fake', { headers: { 'Content-Type': 'image/png' } });
      if (String(input).endsWith('asset-broken')) throw new Error('network failed');
      return pngResponse();
    });
    const scope = effectScope();
    const urls = scope.run(() => useImageAssets(['asset-missing', 'asset-not-png', 'asset-broken', 'asset-valid', 'asset-workflow', '../escape'], fetchImage))!;

    await vi.waitFor(() => expect(urls.urls.value['asset-valid']).toBe('blob:valid'));
    expect(Object.keys(urls.urls.value)).toEqual(['asset-valid']);
    expect(urls.error.value).toBe('图片加载失败，请稍后重试');
    expect(fetchImage.mock.calls.map(([input]) => input)).toEqual([
      '/api/assets/asset-missing', '/api/assets/asset-not-png', '/api/assets/asset-broken', '/api/assets/asset-valid'
    ]);
    expect(createUrl).toHaveBeenCalledOnce();
    scope.stop();
  });

  it('skips requests when there is no workspace token', async () => {
    const fetchImage = vi.fn(async () => pngResponse());
    const scope = effectScope();
    const urls = scope.run(() => useImageAssets(['asset-private'], fetchImage))!;
    await nextTick();
    expect(fetchImage).not.toHaveBeenCalled();
    expect(urls.urls.value).toEqual({});
    scope.stop();
  });

  it('loads on login and revokes old URLs across token rotation and logout', async () => {
    const createUrl = vi.fn().mockReturnValueOnce('blob:one').mockReturnValueOnce('blob:two');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const fetchImage = vi.fn<typeof fetch>(async () => pngResponse());
    const scope = effectScope();
    const assets = scope.run(() => useImageAssets(['asset-secure'], fetchImage))!;
    expect(fetchImage).not.toHaveBeenCalled();

    setToken('first-secret');
    await vi.waitFor(() => expect(assets.urls.value['asset-secure']).toBe('blob:one'));
    expect(assets.error.value).toBe('');

    setToken('second-secret');
    await vi.waitFor(() => expect(assets.urls.value['asset-secure']).toBe('blob:two'));
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:one');
    expect(fetchImage.mock.calls.map(([, options]) => options?.headers)).toEqual([
      { Authorization: 'Bearer first-secret' }, { Authorization: 'Bearer second-secret' }
    ]);

    clearToken();
    await nextTick();
    expect(assets.urls.value).toEqual({});
    expect(revokeUrl).toHaveBeenCalledWith('blob:two');
    expect(assets.error.value).toBe('会话已过期，请重新登录');
    scope.stop();
  });

  it('ignores a stale response after its asset ID is replaced', async () => {
    setToken('workspace-secret');
    const createUrl = vi.fn(() => 'blob:current');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const finish = new Map<string, (response: Response) => void>();
    const fetchImage = vi.fn((input: string | URL | Request) => new Promise<Response>((resolve) => {
      finish.set(String(input), resolve);
    }));
    const ids = shallowRef<readonly string[]>(['asset-old']);
    const scope = effectScope();
    const urls = scope.run(() => useImageAssets(ids, fetchImage))!;

    ids.value = ['asset-current'];
    await nextTick();
    finish.get('/api/assets/asset-old')!(pngResponse());
    finish.get('/api/assets/asset-current')!(pngResponse());
    await vi.waitFor(() => expect(urls.urls.value['asset-current']).toBe('blob:current'));
    expect(urls.urls.value['asset-old']).toBeUndefined();
    expect(createUrl).toHaveBeenCalledOnce();
    scope.stop();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:current');
  });

  it('aborts in-flight requests when the token rotates or logs out', async () => {
    setToken('first-secret');
    const createUrl = vi.fn(() => 'blob:second');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const finish = new Map<string, (response: Response) => void>();
    const fetchImage = vi.fn<typeof fetch>((input, options) => new Promise<Response>((resolve) => {
      expect(input).toBe('/api/assets/asset-secure');
      finish.set(String((options?.headers as Record<string, string>).Authorization), resolve);
    }));
    const scope = effectScope();
    const assets = scope.run(() => useImageAssets(['asset-secure'], fetchImage))!;
    const firstSignal = fetchImage.mock.calls[0]?.[1]?.signal;

    setToken('second-secret');
    await nextTick();
    expect(firstSignal?.aborted).toBe(true);
    finish.get('Bearer first-secret')!(pngResponse());
    const secondSignal = fetchImage.mock.calls[1]?.[1]?.signal;

    clearToken();
    await nextTick();
    expect(secondSignal?.aborted).toBe(true);
    finish.get('Bearer second-secret')!(pngResponse());
    await flushPromises();
    expect(assets.urls.value).toEqual({});
    expect(createUrl).not.toHaveBeenCalled();
    expect(revokeUrl).not.toHaveBeenCalled();
    scope.stop();
  });
});
