import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { strFromU8, unzipSync } from 'fflate';
import StudioFileExportPanel from '../src/features/design/StudioFileExportPanel.vue';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures';

const layoutMocks = vi.hoisted(() => ({ analyze: vi.fn(), capture: vi.fn(), measure: vi.fn() }));
vi.mock('../src/features/design/layout-optimization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/features/design/layout-optimization')>();
  return { ...actual, analyzeLayoutPage: layoutMocks.analyze, captureLayoutPreview: layoutMocks.capture, measureLayoutGroupGeometries: layoutMocks.measure };
});

function readBlob(blob: Blob, mode: 'text'): Promise<string>;
function readBlob(blob: Blob, mode: 'arrayBuffer'): Promise<ArrayBuffer>;
function readBlob(blob: Blob, mode: 'text' | 'arrayBuffer'): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    if (mode === 'text') reader.readAsText(blob);
    else reader.readAsArrayBuffer(blob);
  });
}

describe('StudioFileExportPanel', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('shows a validated project preview and reports all pages', () => {
    const wrapper = mount(StudioFileExportPanel, { props: { file: {
      id: 'file-design', title: '灵犀机器人', activePageId: 'home',
      pages: [
        { id: 'home', pageDsl: validPage, entityFields: validFields, semanticQuestions: [] },
        { id: 'about', pageDsl: { ...validPage, pageId: 'about-dsl', title: '关于我们' }, entityFields: validFields, semanticQuestions: [] }
      ]
    } } });

    expect(wrapper.get('[role="status"]').text()).toContain('2 个页面');
    expect(wrapper.find('.studio-file-export__preview').text()).toContain('关于我们');
  });

  it('emits close from the project dialog', async () => {
    const wrapper = mount(StudioFileExportPanel, { props: { file: {
      id: 'file-design', title: '灵犀机器人', activePageId: 'home',
      pages: [{ id: 'home', pageDsl: validPage, entityFields: validFields, semanticQuestions: [] }]
    } } });

    await wrapper.get('[aria-label="关闭项目导出"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
  });

  it('moves focus into the modal, traps Tab, closes with Escape, and restores focus', async () => {
    const opener = document.createElement('button');
    const backgroundControl = document.createElement('button');
    const preexistingInertControl = document.createElement('button');
    const host = document.createElement('div');
    host.className = 'design-studio';
    preexistingInertControl.inert = true;
    host.append(opener, backgroundControl, preexistingInertControl);
    document.body.append(host);
    opener.focus();
    const wrapper = mount(StudioFileExportPanel, { attachTo: host, props: { file: {
      id: 'file-design', title: '灵犀机器人', activePageId: 'home',
      pages: [{ id: 'home', pageDsl: validPage, entityFields: validFields, semanticQuestions: [] }]
    } } });
    await flushPromises();

    const close = wrapper.get('[aria-label="关闭项目导出"]').element;
    expect(document.activeElement).toBe(close);
    expect(backgroundControl.inert).toBe(true);
    expect(opener.inert).toBe(true);
    expect(preexistingInertControl.inert).toBe(true);
    const download = wrapper.get('footer button:last-child').element as HTMLElement;
    download.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(close);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(wrapper.emitted('close')).toEqual([[]]);

    wrapper.unmount();
    expect(document.activeElement).toBe(opener);
    expect(Boolean(backgroundControl.inert)).toBe(false);
    expect(Boolean(opener.inert)).toBe(false);
    expect(preexistingInertControl.inert).toBe(true);
    host.remove();
  });

  it('defers Blob URL revocation until after the download is dispatched', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:project-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const wrapper = mount(StudioFileExportPanel, { props: { file: {
      id: 'file-design', title: '灵犀机器人', activePageId: 'home',
      pages: [{ id: 'home', pageDsl: validPage, entityFields: validFields, semanticQuestions: [] }]
    } } });

    await wrapper.get('footer button:last-child').trigger('click');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:project-export');
    wrapper.unmount();
  });

  it('uses a selected Flex candidate only for the runnable Vue export and keeps the Studio JSON original', async () => {
    const pageDsl = {
      ...validPage,
      nodes: [...validPage.nodes,
        { id: 'robot-nav-product', type: 'Button' as const, props: { label: '产品' }, children: [], slots: [], design: { position: { mode: 'absolute' as const, x: 24, y: 24 }, size: { width: 120, height: 40 } } },
        { id: 'robot-nav-solution', type: 'Button' as const, props: { label: '方案' }, children: [], slots: [], design: { position: { mode: 'absolute' as const, x: 164, y: 24 }, size: { width: 120, height: 40 } } }
      ]
    };
    const file = { id: 'file-robot', title: '机器人官网', activePageId: 'home', pages: [
      { id: 'home', pageDsl, entityFields: validFields, semanticQuestions: [] }
    ] };
    layoutMocks.capture.mockResolvedValue('data:image/png;base64,aGVsbG8=');
    layoutMocks.measure.mockReturnValue([
      { nodeId: 'robot-nav-product', x: 24, y: 24, width: 120, height: 40, parentTransform: { a: 1, b: 0, c: 0, d: 1 } },
      { nodeId: 'robot-nav-solution', x: 164, y: 24, width: 120, height: 40, parentTransform: { a: 1, b: 0, c: 0, d: 1 } }
    ]);
    layoutMocks.analyze.mockResolvedValue({ groups: [{ nodeIds: ['robot-nav-product', 'robot-nav-solution'] }] });
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return `blob:export-${blobs.length}`; }),
      revokeObjectURL: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const wrapper = mount(StudioFileExportPanel, {
      props: { file },
      global: { stubs: { PreviewPanel: { template: '<section class="preview-panel" />' } } }
    });

    await wrapper.get('.layout-assist__toggle input').setValue(true);
    await wrapper.get('.layout-assist__page-option input').setValue(true);
    await wrapper.get('.layout-assist__analyze').trigger('click');
    await flushPromises();
    expect(layoutMocks.analyze).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('候选 Flex 布局');
    await wrapper.findAll('.layout-review__header input[type="radio"]')[1]!.setValue(true);
    await wrapper.get('footer button:nth-of-type(2)').trigger('click');
    await wrapper.get('.studio-file-export__vue-action').trigger('click');
    await flushPromises();

    expect(blobs).toHaveLength(2);
    const studioJson = JSON.parse(await readBlob(blobs[0]!, 'text'));
    expect(studioJson.pages[0].pageDsl.nodes.at(-2).design.position.mode).toBe('absolute');
    const archive = unzipSync(new Uint8Array(await readBlob(blobs[1]!, 'arrayBuffer')));
    const generatedPage = strFromU8(archive['src/pages/home/Page.vue']!);
    expect(generatedPage).toMatch(/"display":"flex"/);
    expect(file.pages[0]!.pageDsl.nodes.at(-2)?.design?.position?.mode).toBe('absolute');
    wrapper.unmount();
  });
});
