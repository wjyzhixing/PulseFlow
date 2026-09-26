import { getImageAsset } from '@pulseflow/ui-dsl';
import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { getToken } from '../auth/auth-store';

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const generatedAssetId = /^asset-[A-Za-z0-9_-]+$/;
const imageLoadError = '图片加载失败，请稍后重试';
const sessionError = '会话已过期，请重新登录';

export interface ImageAssets {
  urls: Readonly<Ref<Record<string, string>>>;
  error: Readonly<Ref<string>>;
  dispose(): void;
}

function isGeneratedAssetId(value: unknown): value is string {
  return typeof value === 'string' && generatedAssetId.test(value) && !getImageAsset(value);
}

async function isPng(blob: Blob): Promise<boolean> {
  if (blob.size < pngSignature.length) return false;
  const header = new Uint8Array(await blob.slice(0, pngSignature.length).arrayBuffer());
  return pngSignature.every((byte, index) => header[index] === byte);
}

export function useImageAssets(
  assetIds: MaybeRefOrGetter<readonly string[]>,
  fetchImage: typeof fetch = fetch
): ImageAssets {
  const urls = shallowRef<Record<string, string>>({});
  const error = shallowRef('');
  let activeToken: string | null = null;
  let disposed = false;

  const stop = watch(() => ({ requested: [...toValue(assetIds)], token: getToken() }), ({ requested, token }, _previous, onCleanup) => {
    const ids = new Set(requested.filter(isGeneratedAssetId));
    const tokenChanged = token !== activeToken;
    activeToken = token;
    const retained: Record<string, string> = {};
    for (const [id, url] of Object.entries(urls.value)) {
      if (!tokenChanged && ids.has(id)) retained[id] = url;
      else URL.revokeObjectURL(url);
    }
    urls.value = retained;
    error.value = token || ids.size === 0 ? '' : sessionError;

    const pending: AbortController[] = [];
    onCleanup(() => pending.forEach((controller) => controller.abort()));
    if (!token) return;

    for (const id of ids) {
      if (Object.hasOwn(retained, id)) continue;
      const controller = new AbortController();
      pending.push(controller);
      void (async () => {
        try {
          const response = await fetchImage(`/api/assets/${id}`, {
            method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal
          });
          if (!response.ok || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'image/png') {
            if (!controller.signal.aborted) error.value = imageLoadError;
            return;
          }
          const blob = await response.blob();
          if (!await isPng(blob)) {
            if (!controller.signal.aborted) error.value = imageLoadError;
            return;
          }
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          urls.value = { ...urls.value, [id]: url };
        } catch {
          if (!controller.signal.aborted) error.value = imageLoadError;
        }
      })();
    }
  }, { immediate: true });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stop();
    for (const url of Object.values(urls.value)) URL.revokeObjectURL(url);
    urls.value = {};
    error.value = '';
  }

  onScopeDispose(dispose);
  return { urls, error, dispose };
}
