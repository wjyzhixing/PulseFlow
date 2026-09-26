import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { imageAssetNode, validPage } from '../../../packages/ui-dsl/test/fixtures.js';
import PreviewPanel from '../src/features/preview/PreviewPanel.vue';
import { createMockData } from '../src/features/preview/mock-handlers';
import { validFields } from '../../../packages/ui-dsl/test/fixtures.js';
import { clearToken, setToken } from '../src/features/auth/auth-store';

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

function pageWithImageAssets(backgroundAssetId: string, inlineAssetId: string, nestedBackgroundAssetId: string) {
  return { ...validPage, nodes: [
    { id: 'hero', type: 'Hero' as const, props: { title: 'Welcome', subtitle: 'Intro', backgroundAssetId }, children: [], slots: [] },
    { id: 'details', type: 'ContentSection' as const, props: { sectionId: 'details', title: 'Details', tone: 'default', backgroundAssetId: nestedBackgroundAssetId }, children: [
      imageAssetNode('nested-image', inlineAssetId)
    ], slots: [] }
  ] };
}

afterEach(() => { clearToken(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PreviewPanel', () => {
  it('shows the validated page and dispatches a mock event', async () => {
    const refresh = vi.fn();
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, data: { records: [{ 'status-field': 'active' }] }, handlers: { refresh } } });
    expect(wrapper.text()).toContain('Dedicated line');
    expect(wrapper.text()).toContain('Active');
    const refreshButton = wrapper.findAll('button').find((button) => button.text().includes('Refresh'));
    expect(refreshButton).toBeDefined();
    await refreshButton!.trigger('click');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not render invalid DSL', () => {
    const invalid = { ...validPage, nodes: [{ ...validPage.nodes[0], type: 'script' }] };
    const wrapper = mount(PreviewPanel, { props: { dsl: invalid } });
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.text()).toContain('component.unsupported');
  });

  it('reports default mock events and derives typed in-memory field samples', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage } });
    const refreshButton = wrapper.findAll('button').find((button) => button.text().includes('Refresh'));
    await refreshButton!.trigger('click');
    expect(wrapper.get('[role="status"]').text()).toContain('模拟事件：refresh');
    const data = createMockData(validPage, [
      ...validFields,
      { id: 'count', key: 'count', label: 'Count', type: 'number', rules: [{ kind: 'enum', values: ['3'] }] },
      { id: 'enabled', key: 'enabled', label: 'Enabled', type: 'boolean', rules: [{ kind: 'enum', values: ['true'] }] }
    ]);
    expect(data.fields).toMatchObject({ count: 3, enabled: true, 'status-field': 'active' });
  });

  it('loads authenticated nested image and background PNGs, updates references, and revokes removed URLs', async () => {
    setToken('workspace-secret');
    const createObjectUrl = vi.fn((blob: Blob) => `blob:${blob.size}`);
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl }));
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const assetId = String(input).split('/').at(-1) ?? '';
      const bytes = Uint8Array.from([...pngSignature, ...new TextEncoder().encode(assetId)]);
      return new Response(bytes, { headers: { 'content-type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = pageWithImageAssets('asset-hero-a', 'asset-inline-b', 'asset-section-bg');
    const wrapper = mount(PreviewPanel, { props: { dsl: first } });
    const blobUrl = (assetId: string) => `blob:${pngSignature.length + new TextEncoder().encode(assetId).length}`;

    await vi.waitFor(() => expect(wrapper.find('img').attributes('src')).toBe(blobUrl('asset-inline-b')));
    expect((wrapper.find('.pf-hero').element as HTMLElement).style.backgroundImage).toContain(blobUrl('asset-hero-a'));
    expect((wrapper.find('.pf-section').element as HTMLElement).style.backgroundImage).toContain(blobUrl('asset-section-bg'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => String(input)).sort()).toEqual([
      '/api/assets/asset-hero-a', '/api/assets/asset-inline-b', '/api/assets/asset-section-bg'
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => new Headers(init?.headers).get('authorization') === 'Bearer workspace-secret')).toBe(true);

    const second = pageWithImageAssets('asset-hero-updated', 'asset-inline-updated', 'asset-section-updated');
    await wrapper.setProps({ dsl: second });
    await vi.waitFor(() => expect(wrapper.find('img').attributes('src')).toBe(blobUrl('asset-inline-updated')));
    expect((wrapper.find('.pf-hero').element as HTMLElement).style.backgroundImage).toContain(blobUrl('asset-hero-updated'));
    expect((wrapper.find('.pf-section').element as HTMLElement).style.backgroundImage).toContain(blobUrl('asset-section-updated'));
    expect(revokeObjectUrl).toHaveBeenCalledWith(blobUrl('asset-hero-a'));
    expect(revokeObjectUrl).toHaveBeenCalledWith(blobUrl('asset-inline-b'));
    expect(revokeObjectUrl).toHaveBeenCalledWith(blobUrl('asset-section-bg'));

    wrapper.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith(blobUrl('asset-hero-updated'));
    expect(revokeObjectUrl).toHaveBeenCalledWith(blobUrl('asset-inline-updated'));
    expect(revokeObjectUrl).toHaveBeenCalledWith(blobUrl('asset-section-updated'));
  });

  it('keeps bundled SVG artwork inline without requesting it from the authenticated asset route', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const page = { ...validPage, nodes: [imageAssetNode('built-in', 'asset-workflow')] };
    const wrapper = mount(PreviewPanel, { props: { dsl: page } });
    expect(wrapper.find('img').attributes('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('announces failed authenticated image loads through an accessible status', async () => {
    setToken('workspace-secret');
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('missing asset', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const page = pageWithImageAssets('asset-missing-background', 'asset-missing-inline', 'asset-missing-section');
    const wrapper = mount(PreviewPanel, { props: { dsl: page } });

    await vi.waitFor(() => expect(wrapper.find('[role="status"]').text()).toBe('图片加载失败，请稍后重试'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
