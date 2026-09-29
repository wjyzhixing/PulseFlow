import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures.js';
import DslExportPanel from '../src/features/design/DslExportPanel.vue';

describe('DslExportPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a validated page preview and copies DSL text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const wrapper = mount(DslExportPanel, { props: { dsl: validPage, entityFields: validFields, assetIds: [] } });

    expect(wrapper.text()).toContain('页面和资源引用校验通过');
    await wrapper.get('[data-testid="copy-dsl"]').trigger('click');
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(validPage, null, 2));
    expect(wrapper.text()).toContain('UI-DSL 已复制到剪贴板');
  });

  it('reports a clipboard permission failure without losing the export preview', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    const wrapper = mount(DslExportPanel, { props: { dsl: validPage, entityFields: validFields, assetIds: [] } });

    await wrapper.get('[data-testid="copy-dsl"]').trigger('click');
    expect(wrapper.text()).toContain('复制失败');
    expect(wrapper.find('.dsl-export__preview').exists()).toBe(true);
  });

  it('downloads the validated JSON and closes on request', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const wrapper = mount(DslExportPanel, { props: { dsl: validPage, entityFields: validFields, assetIds: [] } });

    await wrapper.get('[data-testid="download-dsl"]').trigger('click');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(wrapper.text()).toContain('已开始下载');
    await wrapper.get('[aria-label="关闭导出面板"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
  });

  it('blocks copy and download when an image reference is dangling', () => {
    const imagePage = { ...validPage, nodes: [{ id: 'cover', type: 'Image', props: { assetId: 'asset-missing', alt: '封面', fit: 'cover', aspectRatio: '16:9' }, children: [], slots: [] }] };
    const wrapper = mount(DslExportPanel, { props: { dsl: imagePage, entityFields: validFields, assetIds: [] } });

    expect(wrapper.get('[role="alert"]').text()).toContain('nodes[0].props.assetId');
    expect(wrapper.get('[data-testid="copy-dsl"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="download-dsl"]').attributes('disabled')).toBeDefined();
  });
});
