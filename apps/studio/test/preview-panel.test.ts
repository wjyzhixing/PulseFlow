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

afterEach(() => {
  clearToken();
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(document, 'caretPositionFromPoint');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
  }, 15_000);

  it('selects rendered UI in editor mode and marks the selected node', async () => {
    const refresh = vi.fn();
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true, selectedNodeId: 'card', handlers: { refresh } } });
    expect(wrapper.get('[data-pf-node-id="card"]').attributes('data-pf-node-selected')).toBe('true');
    await wrapper.get('[data-pf-node-id="button"]').trigger('click');
    expect(wrapper.emitted('selectNode')).toEqual([['button']]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders a clean Figma artboard in editor mode and keeps the header for page preview', async () => {
    const editor = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const preview = mount(PreviewPanel, { props: { dsl: validPage } });

    expect(editor.find('.preview-panel__header').exists()).toBe(false);
    expect(preview.get('.preview-panel__header h2').text()).toBe('实时预览');
    expect(editor.classes()).toContain('preview-panel--editor');
  });

  it('uses imported root Frame dimensions as the editor artboard size', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'artboard', type: 'Frame' as const,
      props: { name: 'Figma Page', direction: 'column' as const, gap: 0, padding: 0 },
      design: { position: { mode: 'absolute' as const, x: 0, y: 0 }, size: { width: 1440, height: 900 } },
      children: [], slots: []
    }] };
    const editor = mount(PreviewPanel, { props: { dsl, editorMode: true } });
    const preview = mount(PreviewPanel, { props: { dsl } });

    expect((editor.element as HTMLElement).style.getPropertyValue('--pf-editor-artboard-width')).toBe('1440px');
    expect((editor.element as HTMLElement).style.getPropertyValue('--pf-editor-artboard-height')).toBe('900px');
    expect((preview.element as HTMLElement).style.getPropertyValue('--pf-editor-artboard-width')).toBe('');
    expect((editor.get('.pulseflow-page').element as HTMLElement).style.width).toBe('1440px');
  });

  it('renders screenshot candidates in clean artboard mode without enabling editing', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'artboard', type: 'Frame' as const,
      props: { name: 'Screenshot candidate', direction: 'column' as const, gap: 0, padding: 0 },
      design: { position: { mode: 'absolute' as const, x: 0, y: 0 }, size: { width: 1440, height: 900 } },
      children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, artboardMode: true } });

    expect(wrapper.find('.preview-panel__header').exists()).toBe(false);
    expect(wrapper.classes()).toContain('preview-panel--artboard');
    expect(wrapper.attributes('aria-label')).toBe('固定尺寸画板预览');
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--pf-editor-artboard-width')).toBe('1440px');
    expect((wrapper.get('.pulseflow-page').element as HTMLElement).style.width).toBe('1440px');
    expect(wrapper.find('[data-pf-node-selected="true"]').exists()).toBe(false);
    expect(wrapper.find('[data-pf-resize-handle]').exists()).toBe(false);
  });

  it('edits a text layer inline on double click and commits it on Enter', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'headline', type: 'Text' as const, props: { text: '旧标题' },
      design: { size: { width: 240, height: 'hug' as const } }, children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });
    const text = wrapper.get('.pf-text');

    await text.trigger('dblclick');
    expect(text.attributes('contenteditable')).toBe('true');
    (text.element as HTMLElement).textContent = '机器人研发中心';
    await text.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('updateNodeText')?.[0]?.[0]).toEqual({ nodeId: 'headline', text: '机器人研发中心' });
    expect(wrapper.get('.pf-text').attributes('contenteditable')).toBeUndefined();
  });

  it('starts inline text editing when pointer capture retargets a double click to the canvas node', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'headline', type: 'Text' as const, props: { text: '旧标题' }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });

    await wrapper.get('[data-pf-node-id="headline"]').trigger('dblclick');

    expect(wrapper.get('.pf-text').attributes('contenteditable')).toBe('true');
  });

  it('restores the original text and discards an inline edit on Escape', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'headline', type: 'Text' as const, props: { text: '原始标题' }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });
    const text = wrapper.get('.pf-text');

    await text.trigger('dblclick');
    (text.element as HTMLElement).textContent = '临时修改';
    await text.trigger('keydown', { key: 'Escape' });

    expect(wrapper.get('.pf-text').text()).toBe('原始标题');
    expect(wrapper.emitted('updateNodeText')).toBeUndefined();
  });

  it('commits inline text when focus leaves the text layer', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'headline', type: 'Text' as const, props: { text: '原始标题' }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });
    const text = wrapper.get('.pf-text');

    await text.trigger('dblclick');
    (text.element as HTMLElement).textContent = '新标题';
    await text.trigger('blur');

    expect(wrapper.emitted('updateNodeText')?.[0]?.[0]).toEqual({ nodeId: 'headline', text: '新标题' });
    expect(wrapper.get('.pf-text').attributes('contenteditable')).toBeUndefined();
  });

  it('pastes only plain text into an inline text layer', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'headline', type: 'Text' as const, props: { text: '标题' }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });
    const text = wrapper.get('.pf-text');
    await text.trigger('dblclick');
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? '纯文本' : '<img src=x onerror=alert(1)>' } });

    text.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect((text.element as HTMLElement).innerHTML).toBe('标题纯文本');
  });

  it('does not let a paste selection delete content outside the text layer', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'headline', type: 'Text' as const, props: { text: '标题' }, children: [], slots: [] },
      { id: 'outside', type: 'Text' as const, props: { text: '画布其他内容' }, children: [], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });
    const text = wrapper.get('[data-pf-node-id="headline"] .pf-text');
    const outside = wrapper.get('[data-pf-node-id="outside"] .pf-text');
    await text.trigger('dblclick');
    const range = {
      startContainer: text.element.firstChild,
      endContainer: outside.element.firstChild,
      commonAncestorContainer: wrapper.element,
      deleteContents: vi.fn(), insertNode: vi.fn(), setStartAfter: vi.fn(), collapse: vi.fn()
    };
    const selection = { rangeCount: 1, anchorNode: text.element.firstChild, getRangeAt: () => range, removeAllRanges: vi.fn(), addRange: vi.fn() };
    vi.spyOn(document, 'getSelection').mockReturnValue(selection as unknown as Selection);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => '新内容' } });

    text.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(outside.text()).toBe('画布其他内容');
    expect(text.text()).toBe('标题新内容');
  });

  it('drops only plain text into an inline text layer without triggering canvas drops', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'headline', type: 'Text' as const, props: { text: '标题' }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });
    const text = wrapper.get('.pf-text');
    await text.trigger('dblclick');
    const textNode = text.element.firstChild!;
    const oldCaret = document.createRange();
    oldCaret.setStart(textNode, 0);
    oldCaret.collapse(true);
    const selection = { rangeCount: 1, anchorNode: textNode, getRangeAt: () => oldCaret, removeAllRanges: vi.fn(), addRange: vi.fn() };
    vi.spyOn(document, 'getSelection').mockReturnValue(selection as unknown as Selection);
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: () => ({ offsetNode: textNode, offset: 2 })
    });
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { getData: (type: string) => type === 'text/plain' ? '拖入文字' : '<svg onload=alert(1)>' } });
    Object.defineProperty(event, 'clientX', { value: 120 });
    Object.defineProperty(event, 'clientY', { value: 24 });

    text.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect((text.element as HTMLElement).innerHTML).toBe('标题拖入文字');
    expect(wrapper.emitted('dropRejected')).toBeUndefined();
  });

  it('clears canvas drop highlights when text is dropped into an editing layer', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'frame', type: 'Frame' as const, props: { direction: 'column' as const }, children: [], slots: [] },
      { id: 'headline', type: 'Text' as const, props: { text: '标题' }, children: [], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    const text = wrapper.get('.pf-text');
    await text.trigger('dblclick');
    await frame.trigger('dragover', { clientY: 24, dataTransfer: { types: ['application/x-pulseflow-node'], getData: () => '', dropEffect: 'none' } });
    expect(frame.attributes('data-pf-drop-intent')).toBeDefined();
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { getData: (type: string) => type === 'text/plain' ? '新文字' : '' } });

    text.element.dispatchEvent(event);

    expect(frame.attributes('data-pf-drop-intent')).toBeUndefined();
  });

  it('rejects unsafe inline text and restores the last validated value', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'headline', type: 'Text' as const, props: { text: '安全标题' }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });
    const text = wrapper.get('.pf-text');

    await text.trigger('dblclick');
    (text.element as HTMLElement).textContent = '<script>危险内容</script>';
    await text.trigger('keydown', { key: 'Enter' });

    expect(wrapper.get('.pf-text').text()).toBe('安全标题');
    expect(wrapper.emitted('updateNodeText')).toBeUndefined();
  });

  it('does not enter inline text editing for a locked layer', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'headline', type: 'Text' as const, props: { text: '已锁定' }, design: { locked: true }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'headline' } });

    await wrapper.get('.pf-text').trigger('dblclick');

    expect(wrapper.get('.pf-text').attributes('contenteditable')).toBeUndefined();
  });

  it('converts pointer movement and resize handles into snapped DSL geometry at the current zoom', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'artboard', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 0, y: 0 }, size: { width: 1440, height: 900 } },
      children: [{
        id: 'frame', type: 'Frame' as const, props: { direction: 'column' },
        design: { position: { mode: 'absolute' as const, x: 16, y: 24 }, size: { width: 64, height: 32 } },
        children: [], slots: []
      }], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'frame', editorZoom: 200 } });
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    const originalStyle = frame.attributes('style');
    await frame.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 1, clientX: 31, clientY: 33 });
    expect((frame.element as HTMLElement).style.left).toBe('32px');
    expect((frame.element as HTMLElement).style.top).toBe('41px');
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 1, clientX: 31, clientY: 33 });
    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({ nodeId: 'frame', patch: { position: { mode: 'absolute', x: 32, y: 41 } } });
    expect(frame.attributes('style')).toBe(originalStyle);

    const west = wrapper.get('[data-pf-resize-handle="w"]');
    await west.trigger('pointerdown', { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 2, clientX: 68, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 2, clientX: 68, clientY: 100 });
    expect(wrapper.emitted('updateNodeDesign')?.[1]?.[0]).toEqual({ nodeId: 'frame', patch: { size: { width: 80, height: 32 }, position: { mode: 'absolute', x: 0, y: 24 } } });
  });

  it('duplicates a layer at its dropped position when Option or Alt is held', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'frame', type: 'Frame' as const, props: { name: '卡片' },
      design: { position: { mode: 'absolute' as const, x: 16, y: 24 }, size: { width: 64, height: 32 } },
      children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'frame' } });
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    await frame.trigger('pointerdown', { button: 0, pointerId: 21, clientX: 0, clientY: 0, altKey: true });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 21, clientX: 32, clientY: 24, altKey: true });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 21, clientX: 32, clientY: 24, altKey: true });

    expect(wrapper.emitted('duplicateNodesAt')?.[0]?.[0]).toEqual([
      { nodeId: 'frame', position: { mode: 'absolute', x: 48, y: 48 } }
    ]);
    expect(wrapper.emitted('updateNodeDesign')).toBeUndefined();
  });

  it('shows Figma alignment guides and snaps a moving layer to sibling edges', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'artboard', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 0, y: 0 }, size: { width: 1440, height: 900 } },
      children: [
        { id: 'moving', type: 'Frame' as const, props: { direction: 'column' as const }, design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 80, height: 80 } }, children: [], slots: [] },
        { id: 'sibling', type: 'Frame' as const, props: { direction: 'column' as const }, design: { position: { mode: 'absolute' as const, x: 200, y: 100 }, size: { width: 100, height: 100 } }, children: [], slots: [] }
      ], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'moving' } });
    const page = wrapper.get('.pulseflow-page');
    const moving = wrapper.get('[data-pf-node-id="moving"]');
    const sibling = wrapper.get('[data-pf-node-id="sibling"]');
    vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 720, left: 0, right: 1280, width: 1280, height: 720, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(moving.element, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 180, left: 100, right: 180, width: 80, height: 80, x: 100, y: 100, toJSON: () => ({}) });
    vi.spyOn(sibling.element, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 200, left: 200, right: 300, width: 100, height: 100, x: 200, y: 100, toJSON: () => ({}) });

    await moving.trigger('pointerdown', { button: 0, pointerId: 51, clientX: 150, clientY: 150 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 51, clientX: 270, clientY: 150 });

    expect((moving.element as HTMLElement).style.left).toBe('220px');
    expect(page.find('[data-pf-editor-guide="x"]').attributes('style')).toContain('left: 300px');
    expect(page.find('[data-pf-editor-guide="y"]').attributes('style')).toContain('top: 100px');

    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 51, clientX: 270, clientY: 150 });
    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({ nodeId: 'moving', patch: { position: { mode: 'absolute', x: 220, y: 100 } } });
    expect(page.find('[data-pf-editor-guide]').exists()).toBe(false);
  });

  it('rotates the selected canvas layer through its Figma-style rotation handle', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'frame', type: 'Frame' as const, props: { direction: 'column' },
      design: { rotation: 0, size: { width: 100, height: 80 } }, children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'frame' } });
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    vi.spyOn(frame.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 180, left: 100, right: 200, width: 100, height: 80, x: 100, y: 100, toJSON: () => ({}) });

    const rotateHandle = wrapper.get('[data-pf-rotate-handle]');
    await rotateHandle.trigger('pointerdown', { button: 0, pointerId: 41, clientX: 150, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 41, clientX: 200, clientY: 140 });
    expect((frame.element as HTMLElement).style.transform).toBe('rotate(90deg)');
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 41, clientX: 200, clientY: 140 });

    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({ nodeId: 'frame', patch: { rotation: 90 } });
  });

  it('discards a pointer-cancelled transform without writing design changes', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'frame', type: 'Frame' as const, props: { direction: 'column' }, design: { size: { width: 64, height: 32 } }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'frame' } });
    await wrapper.get('[data-pf-node-id="frame"]').trigger('pointerdown', { button: 0, pointerId: 4, clientX: 0, clientY: 0 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 4, clientX: 64, clientY: 64 });
    await wrapper.get('.preview-panel').trigger('pointercancel', { pointerId: 4 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 4, clientX: 64, clientY: 64 });
    expect(wrapper.emitted('updateNodeDesign')).toBeUndefined();
  });

  it('allows selecting a locked node but prevents its canvas transform', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'locked-frame', type: 'Frame' as const, props: { direction: 'column' },
      design: { locked: true, size: { width: 64, height: 32 } }, children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true } });
    const frame = wrapper.get('[data-pf-node-id="locked-frame"]');

    await frame.trigger('pointerdown', { button: 0, pointerId: 5, clientX: 0, clientY: 0 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 5, clientX: 80, clientY: 40 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 5, clientX: 80, clientY: 40 });

    expect(wrapper.emitted('selectNode')).toEqual([['locked-frame']]);
    expect(wrapper.emitted('updateNodeDesign')).toBeUndefined();
  });

  it('preserves hidden layer visibility and lock state in editor rendering', () => {
    const dsl = { ...validPage, nodes: [{
      id: 'hidden-frame', type: 'Frame' as const, props: { direction: 'column' },
      design: { visible: false, locked: true, size: { width: 64, height: 32 } }, children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'hidden-frame' } });
    const frame = wrapper.get('[data-pf-node-id="hidden-frame"]');

    expect(frame.attributes('style')).toContain('display: none');
    expect(frame.attributes('draggable')).toBe('false');
    expect(frame.attributes('data-pf-locked')).toBe('true');
    expect(wrapper.find('[data-pf-resize-handle]').exists()).toBe(false);
  });

  it('places a shape with snapped artboard coordinates and dragged dimensions', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true, editorZoom: 200, insertTool: 'Shape' } });
    const page = wrapper.get('.pulseflow-page');
    vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 900, left: 100, right: 1380, width: 1280, height: 700, x: 100, y: 200, toJSON: () => ({}) });

    await page.trigger('pointerdown', { button: 0, pointerId: 6, clientX: 148, clientY: 264 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 6, clientX: 188, clientY: 324 });
    expect(wrapper.find('.placement-preview').exists()).toBe(true);
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 6, clientX: 188, clientY: 324 });

    expect(wrapper.emitted('placeTool')?.[0]?.[0]).toEqual({
      type: 'Shape',
      shape: 'rectangle',
      design: { position: { mode: 'absolute', x: 24, y: 32 }, size: { width: 20, height: 30 } }
    });
  });

  it('draws a new tool inside a frame as a flow child at the pointer insertion index', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'frame', type: 'Frame' as const, props: { name: '画框', direction: 'column' as const },
      design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 200, height: 160 } },
      children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, editorZoom: 100, insertTool: 'Text' } });
    const page = wrapper.get('.pulseflow-page').element as HTMLElement;
    const frame = wrapper.get('[data-pf-node-id="frame"]').element as HTMLElement;
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({ top: 70, bottom: 790, left: 50, right: 1330, width: 1280, height: 720, x: 50, y: 70, toJSON: () => ({}) });
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ top: 170, bottom: 330, left: 150, right: 350, width: 200, height: 160, x: 150, y: 170, toJSON: () => ({}) });

    await wrapper.get('[data-pf-node-id="frame"]').trigger('pointerdown', { button: 0, pointerId: 40, clientX: 174, clientY: 202 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 40, clientX: 214, clientY: 242 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 40, clientX: 214, clientY: 242 });

    expect(wrapper.emitted('placeTool')?.[0]?.[0]).toMatchObject({
      type: 'Text', parentId: 'frame', index: 0,
      design: { position: { mode: 'flow', x: 0, y: 0 }, size: { width: 40, height: 40 } }
    });
  });

  it('uses the default tool size for a click and ignores unrelated pointer releases', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true, insertTool: 'Text' } });
    const page = wrapper.get('.pulseflow-page');
    vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 900, left: 100, right: 1380, width: 1280, height: 700, x: 100, y: 200, toJSON: () => ({}) });
    await page.trigger('pointerdown', { button: 0, pointerId: 7, clientX: 124, clientY: 232 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 8, clientX: 124, clientY: 232 });
    expect(wrapper.emitted('placeTool')).toBeUndefined();
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 7, clientX: 124, clientY: 232 });

    expect(wrapper.emitted('placeTool')?.[0]?.[0]).toEqual({
      type: 'Text',
      design: { position: { mode: 'absolute', x: 24, y: 32 }, size: { width: 240, height: 32 } }
    });
  });

  it('starts flow-object dragging from its rendered parent-local position without a jump', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'frame', type: 'Frame' as const, props: { direction: 'column' }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'frame', editorZoom: 200 } });
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    const pageElement = wrapper.get('.pulseflow-page').element;
    const frameElement = frame.element as HTMLElement;
    vi.spyOn(pageElement, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 900, left: 100, right: 1380, width: 1280, height: 700, x: 100, y: 200, toJSON: () => ({}) });
    vi.spyOn(frameElement.firstElementChild!, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 400, left: 200, right: 400, width: 200, height: 100, x: 200, y: 300, toJSON: () => ({}) });
    await frame.trigger('pointerdown', { button: 0, pointerId: 8, clientX: 200, clientY: 300 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 8, clientX: 216, clientY: 300 });
    expect(frameElement.style.left).toBe('58px');
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 8, clientX: 216, clientY: 300 });
    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({ nodeId: 'frame', patch: { position: { mode: 'absolute', x: 58, y: 50 } } });
  });

  it('uses the DSL parent wrapper as the coordinate space for nested layers', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'section', type: 'ContentSection' as const,
      props: { sectionId: 'details', title: 'Details', tone: 'default' as const },
      children: [{ id: 'frame', type: 'Frame' as const, props: { direction: 'column' }, children: [], slots: [] }], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'frame' } });
    const section = wrapper.get('[data-pf-node-id="section"]');
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    vi.spyOn(section.element, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 700, left: 100, right: 700, width: 600, height: 600, x: 100, y: 100, toJSON: () => ({}) });
    vi.spyOn(frame.element.firstElementChild!, 'getBoundingClientRect').mockReturnValue({ top: 148, bottom: 188, left: 132, right: 212, width: 80, height: 40, x: 132, y: 148, toJSON: () => ({}) });

    await frame.trigger('pointerdown', { button: 0, pointerId: 22, clientX: 132, clientY: 148 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 22, clientX: 148, clientY: 148 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 22, clientX: 148, clientY: 148 });

    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({ nodeId: 'frame', patch: { position: { mode: 'absolute', x: 48, y: 48 } } });
  });

  it('converts canvas dragging into a rotated parent frame local coordinate', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'rotated-parent', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 200, height: 200 }, rotation: 90 },
      children: [{ id: 'child', type: 'Frame' as const, props: { direction: 'column' },
        design: { position: { mode: 'absolute' as const, x: 24, y: 32 }, size: { width: 40, height: 40 } }, children: [], slots: [] }], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'child' } });
    const parent = wrapper.get('[data-pf-node-id="rotated-parent"]');
    const child = wrapper.get('[data-pf-node-id="child"]');
    (parent.element as HTMLElement).style.transform = 'matrix(0, 1, -1, 0, 0, 0)';

    await child.trigger('pointerdown', { button: 0, pointerId: 61, clientX: 100, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 61, clientX: 116, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 61, clientX: 116, clientY: 100 });

    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({
      nodeId: 'child', patch: { position: { mode: 'absolute', x: 24, y: 16 } }
    });
  });

  it('preserves a flow child layout origin when dragging inside a rotated parent frame', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'rotated-parent', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 200, height: 200 }, rotation: 90 },
      children: [{ id: 'child', type: 'Frame' as const, props: { direction: 'column' },
        design: { size: { width: 40, height: 40 } }, children: [], slots: [] }], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'child' } });
    const parent = wrapper.get('[data-pf-node-id="rotated-parent"]');
    const child = wrapper.get('[data-pf-node-id="child"]');
    (parent.element as HTMLElement).style.transform = 'matrix(0, 1, -1, 0, 0, 0)';
    Object.defineProperties(child.element, {
      offsetParent: { configurable: true, value: parent.element },
      offsetLeft: { configurable: true, value: 24 },
      offsetTop: { configurable: true, value: 32 }
    });

    await child.trigger('pointerdown', { button: 0, pointerId: 66, clientX: 100, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 66, clientX: 116, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 66, clientX: 116, clientY: 100 });

    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({
      nodeId: 'child', patch: { position: { mode: 'absolute', x: 24, y: 16 } }
    });
  });

  it('moves selected layers by the same canvas delta across differently rotated parents', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'top-level', type: 'Shape' as const, props: { shape: 'rectangle' as const },
        design: { position: { mode: 'absolute' as const, x: 24, y: 32 }, size: { width: 40, height: 40 } }, children: [], slots: [] },
      { id: 'rotated-parent', type: 'Frame' as const, props: { direction: 'column' },
        design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 200, height: 200 }, rotation: 90 },
        children: [{ id: 'child', type: 'Shape' as const, props: { shape: 'rectangle' as const },
          design: { position: { mode: 'absolute' as const, x: 24, y: 32 }, size: { width: 40, height: 40 } }, children: [], slots: [] }], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: {
      dsl, editorMode: true, selectedNodeId: 'child', selectedNodeIds: ['top-level', 'child']
    } });
    const parent = wrapper.get('[data-pf-node-id="rotated-parent"]');
    const child = wrapper.get('[data-pf-node-id="child"]');
    (parent.element as HTMLElement).style.transform = 'matrix(0, 1, -1, 0, 0, 0)';

    await child.trigger('pointerdown', { button: 0, pointerId: 62, clientX: 100, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 62, clientX: 116, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 62, clientX: 116, clientY: 100 });

    expect(wrapper.emitted('updateNodesDesign')?.[0]?.[0]).toEqual([
      { nodeId: 'top-level', patch: { position: { mode: 'absolute', x: 40, y: 32 } } },
      { nodeId: 'child', patch: { position: { mode: 'absolute', x: 24, y: 16 } } }
    ]);
  });

  it('preserves a group canvas delta across a parent rotated by a non-right angle', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'top-level', type: 'Shape' as const, props: { shape: 'rectangle' as const },
        design: { position: { mode: 'absolute' as const, x: 24, y: 32 }, size: { width: 40, height: 40 } }, children: [], slots: [] },
      { id: 'rotated-parent', type: 'Frame' as const, props: { direction: 'column' },
        design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 200, height: 200 }, rotation: 45 },
        children: [{ id: 'child', type: 'Shape' as const, props: { shape: 'rectangle' as const },
          design: { position: { mode: 'absolute' as const, x: 24, y: 32 }, size: { width: 40, height: 40 } }, children: [], slots: [] }], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: {
      dsl, editorMode: true, selectedNodeId: 'child', selectedNodeIds: ['top-level', 'child']
    } });
    const parent = wrapper.get('[data-pf-node-id="rotated-parent"]');
    const child = wrapper.get('[data-pf-node-id="child"]');
    (parent.element as HTMLElement).style.transform = `matrix(${Math.SQRT1_2}, ${Math.SQRT1_2}, ${-Math.SQRT1_2}, ${Math.SQRT1_2}, 0, 0)`;

    await child.trigger('pointerdown', { button: 0, pointerId: 65, clientX: 100, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 65, clientX: 116, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 65, clientX: 116, clientY: 100 });

    expect(wrapper.emitted('updateNodesDesign')?.[0]?.[0]).toEqual([
      { nodeId: 'top-level', patch: { position: { mode: 'absolute', x: 40, y: 32 } } },
      { nodeId: 'child', patch: { position: { mode: 'absolute', x: 35, y: 21 } } }
    ]);
  });

  it('resizes a nested layer along its local axis inside a rotated parent frame', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'rotated-parent', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 200, height: 200 }, rotation: 90 },
      children: [{ id: 'child', type: 'Frame' as const, props: { direction: 'column' },
        design: { position: { mode: 'absolute' as const, x: 24, y: 32 }, size: { width: 40, height: 40 } }, children: [], slots: [] }], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'child' } });
    (wrapper.get('[data-pf-node-id="rotated-parent"]').element as HTMLElement).style.transform = 'matrix(0, 1, -1, 0, 0, 0)';
    const eastHandle = wrapper.get('[data-pf-resize-handle="e"]');

    await eastHandle.trigger('pointerdown', { button: 0, pointerId: 63, clientX: 100, clientY: 100 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 63, clientX: 100, clientY: 116 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 63, clientX: 100, clientY: 116 });

    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({
      nodeId: 'child', patch: { size: { width: 56, height: 40 } }
    });
  });

  it('snaps a moved layer to sibling edges in canvas space inside a rotated parent', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'rotated-parent', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 200, height: 200 }, rotation: 90 },
      children: [
        { id: 'moving', type: 'Shape' as const, props: { shape: 'rectangle' as const },
          design: { position: { mode: 'absolute' as const, x: 24, y: 32 }, size: { width: 40, height: 40 } }, children: [], slots: [] },
        { id: 'sibling', type: 'Shape' as const, props: { shape: 'rectangle' as const },
          design: { position: { mode: 'absolute' as const, x: 24, y: 80 }, size: { width: 40, height: 40 } }, children: [], slots: [] }
      ], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'moving' } });
    const page = wrapper.get('.pulseflow-page');
    const parent = wrapper.get('[data-pf-node-id="rotated-parent"]');
    const moving = wrapper.get('[data-pf-node-id="moving"]');
    const sibling = wrapper.get('[data-pf-node-id="sibling"]');
    (parent.element as HTMLElement).style.transform = 'matrix(0, 1, -1, 0, 0, 0)';
    vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 720, left: 0, right: 1280, width: 1280, height: 720, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(moving.element, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 240, left: 300, right: 340, width: 40, height: 40, x: 300, y: 200, toJSON: () => ({}) });
    vi.spyOn(sibling.element, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 240, left: 321, right: 361, width: 40, height: 40, x: 321, y: 200, toJSON: () => ({}) });

    await moving.trigger('pointerdown', { button: 0, pointerId: 64, clientX: 300, clientY: 200 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 64, clientX: 316, clientY: 200 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 64, clientX: 316, clientY: 200 });

    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({
      nodeId: 'moving', patch: { position: { mode: 'absolute', x: 24, y: 11 } }
    });
  });

  it('selects an unselected object on pointer down and moves it in the same drag', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'frame', type: 'Frame' as const, props: { direction: 'column' }, design: { size: { width: 64, height: 32 } }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true } });
    const frame = wrapper.get('[data-pf-node-id="frame"]');

    await frame.trigger('pointerdown', { button: 0, pointerId: 21, clientX: 0, clientY: 0 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 21, clientX: 80, clientY: 40 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 21, clientX: 80, clientY: 40 });

    expect(wrapper.emitted('selectNode')).toEqual([['frame']]);
    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({
      nodeId: 'frame',
      patch: { position: { mode: 'absolute', x: 80, y: 40 } }
    });
  });

  it('adds a canvas object to the current selection with Shift and highlights all selected layers', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'first', type: 'Text' as const, props: { text: '一' }, design: { position: { mode: 'absolute' as const, x: 8, y: 8 } }, children: [], slots: [] },
      { id: 'second', type: 'Text' as const, props: { text: '二' }, design: { position: { mode: 'absolute' as const, x: 48, y: 8 } }, children: [], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'first', selectedNodeIds: ['first'] } });

    await wrapper.get('[data-pf-node-id="second"]').trigger('pointerdown', { button: 0, pointerId: 25, clientX: 50, clientY: 20, shiftKey: true });

    expect(wrapper.emitted('selectNode')).toEqual([['second', true]]);
    await wrapper.setProps({ selectedNodeId: 'second', selectedNodeIds: ['first', 'second'] });
    expect(wrapper.get('[data-pf-node-id="first"]').attributes('data-pf-node-selected')).toBe('true');
    expect(wrapper.get('[data-pf-node-id="second"]').attributes('data-pf-node-selected')).toBe('true');
  });

  it('selects unlocked visible layers inside a canvas drag marquee', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'first', type: 'Text' as const, props: { text: '一' }, design: { position: { mode: 'absolute' as const, x: 8, y: 8 } }, children: [], slots: [] },
      { id: 'second', type: 'Text' as const, props: { text: '二' }, design: { position: { mode: 'absolute' as const, x: 88, y: 8 } }, children: [], slots: [] },
      { id: 'locked', type: 'Text' as const, props: { text: '锁定' }, design: { locked: true, position: { mode: 'absolute' as const, x: 8, y: 48 } }, children: [], slots: [] },
      { id: 'hidden', type: 'Text' as const, props: { text: '隐藏' }, design: { visible: false, position: { mode: 'absolute' as const, x: 88, y: 48 } }, children: [], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true } });
    const rect = (left: number, top: number, width: number, height: number) => ({
      left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({})
    });
    vi.spyOn(wrapper.get('.pulseflow-page').element, 'getBoundingClientRect').mockReturnValue(rect(100, 80, 1280, 720));
    for (const [id, box] of [['first', rect(120, 100, 32, 20)], ['second', rect(200, 100, 32, 20)],
      ['locked', rect(120, 140, 32, 20)], ['hidden', rect(200, 140, 32, 20)]] as const) {
      vi.spyOn(wrapper.get(`[data-pf-node-id="${id}"]`).element, 'getBoundingClientRect').mockReturnValue(box);
    }

    await wrapper.get('.pulseflow-page').trigger('pointerdown', { button: 0, pointerId: 70, clientX: 110, clientY: 90 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 70, clientX: 170, clientY: 130 });
    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(true);
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 70, clientX: 170, clientY: 130 });

    expect(wrapper.emitted('selectNode')).toEqual([['first']]);
    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(false);
  });

  it('adds marquee hits to the current selection when Shift is held', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'first', type: 'Text' as const, props: { text: '一' }, children: [], slots: [] },
      { id: 'second', type: 'Text' as const, props: { text: '二' }, children: [], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'first', selectedNodeIds: ['first'] } });
    const rect = (left: number, top: number) => ({ left, top, right: left + 24, bottom: top + 16, width: 24, height: 16, x: left, y: top, toJSON: () => ({}) });
    for (const [id, box] of [['first', rect(120, 100)], ['second', rect(160, 100)]] as const) {
      vi.spyOn(wrapper.get(`[data-pf-node-id="${id}"]`).element, 'getBoundingClientRect').mockReturnValue(box);
    }
    const page = wrapper.get('.pulseflow-page');

    await page.trigger('pointerdown', { button: 0, pointerId: 71, clientX: 150, clientY: 90, shiftKey: true });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 71, clientX: 190, clientY: 130 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 71, clientX: 190, clientY: 130 });

    expect(wrapper.emitted('selectNode')).toEqual([['second', true]]);
  });

  it('moves selected layers when the environment has no pointer hit-testing APIs', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'first', type: 'Text' as const, props: { text: '一' }, design: { position: { mode: 'absolute' as const, x: 8, y: 16 }, size: { width: 48, height: 24 } }, children: [], slots: [] },
      { id: 'second', type: 'Text' as const, props: { text: '二' }, design: { position: { mode: 'absolute' as const, x: 40, y: 48 }, size: { width: 48, height: 24 } }, children: [], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'second', selectedNodeIds: ['first', 'second'] } });
    const first = wrapper.get('[data-pf-node-id="first"]');
    const second = wrapper.get('[data-pf-node-id="second"]');
    for (const node of [first, second]) {
      vi.spyOn(node.element, 'getBoundingClientRect').mockReturnValue({ top: 16, bottom: 40, left: 8, right: 56, width: 48, height: 24, x: 8, y: 16, toJSON: () => ({}) });
    }
    const panel = wrapper.get('.preview-panel');
    expect(typeof document.elementsFromPoint).not.toBe('function');
    expect(typeof document.elementFromPoint).not.toBe('function');

    await second.trigger('pointerdown', { button: 0, pointerId: 26, clientX: 40, clientY: 48 });
    await panel.trigger('pointermove', { pointerId: 26, clientX: 72, clientY: 72 });
    await panel.trigger('pointerup', { pointerId: 26, clientX: 72, clientY: 72 });

    expect(wrapper.emitted('updateNodesDesign')?.[0]?.[0]).toEqual([
      { nodeId: 'first', patch: { position: { mode: 'absolute', x: 40, y: 40 } } },
      { nodeId: 'second', patch: { position: { mode: 'absolute', x: 72, y: 72 } } }
    ]);
    expect(wrapper.emitted('updateNodeDesign')).toBeUndefined();
  });

  it('shows one group transform box and resizes every selected layer proportionally', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'first', type: 'Shape' as const, props: { shape: 'rectangle' as const }, design: { position: { mode: 'absolute' as const, x: 8, y: 16 }, size: { width: 48, height: 24 } }, children: [], slots: [] },
      { id: 'second', type: 'Shape' as const, props: { shape: 'rectangle' as const }, design: { position: { mode: 'absolute' as const, x: 40, y: 48 }, size: { width: 48, height: 24 } }, children: [], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'second', selectedNodeIds: ['first', 'second'] } });
    const page = wrapper.get('.pulseflow-page');
    const first = wrapper.get('[data-pf-node-id="first"]');
    const second = wrapper.get('[data-pf-node-id="second"]');
    vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 720, left: 0, right: 1280, width: 1280, height: 720, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(first.element, 'getBoundingClientRect').mockReturnValue({ top: 16, bottom: 40, left: 8, right: 56, width: 48, height: 24, x: 8, y: 16, toJSON: () => ({}) });
    vi.spyOn(second.element, 'getBoundingClientRect').mockReturnValue({ top: 48, bottom: 72, left: 40, right: 88, width: 48, height: 24, x: 40, y: 48, toJSON: () => ({}) });
    await wrapper.setProps({ selectedNodeIds: ['first'] });
    await wrapper.setProps({ selectedNodeIds: ['first', 'second'] });
    await wrapper.vm.$nextTick();

    const groupHandle = wrapper.get('[data-pf-group-resize-handle="se"]');
    await groupHandle.trigger('pointerdown', { button: 0, pointerId: 31, clientX: 88, clientY: 72 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 31, clientX: 136, clientY: 104 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 31, clientX: 136, clientY: 104 });

    expect(wrapper.emitted('updateNodesDesign')?.[0]?.[0]).toEqual([
      { nodeId: 'first', patch: { position: { mode: 'absolute', x: 8, y: 16 }, size: { width: 77, height: 38 } } },
      { nodeId: 'second', patch: { position: { mode: 'absolute', x: 59, y: 66 }, size: { width: 77, height: 38 } } }
    ]);
  });

  it('resizes selected layers inside a rotated parent using parent-local coordinates', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'rotated-parent', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 100, y: 100 }, size: { width: 200, height: 200 }, rotation: 90 },
      children: [
        { id: 'first', type: 'Shape' as const, props: { shape: 'rectangle' as const },
          design: { position: { mode: 'absolute' as const, x: 20, y: 20 }, size: { width: 20, height: 20 } }, children: [], slots: [] },
        { id: 'second', type: 'Shape' as const, props: { shape: 'rectangle' as const },
          design: { position: { mode: 'absolute' as const, x: 60, y: 60 }, size: { width: 20, height: 20 } }, children: [], slots: [] }
      ], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'second', selectedNodeIds: ['first', 'second'] } });
    const parent = wrapper.get('[data-pf-node-id="rotated-parent"]');
    const first = wrapper.get('[data-pf-node-id="first"]');
    const second = wrapper.get('[data-pf-node-id="second"]');
    vi.spyOn(parent.element, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 300, left: 100, right: 300, width: 200, height: 200, x: 100, y: 100, toJSON: () => ({}) });
    vi.spyOn(first.element, 'getBoundingClientRect').mockReturnValue({ top: 120, bottom: 140, left: 260, right: 280, width: 20, height: 20, x: 260, y: 120, toJSON: () => ({}) });
    vi.spyOn(second.element, 'getBoundingClientRect').mockReturnValue({ top: 160, bottom: 180, left: 220, right: 240, width: 20, height: 20, x: 220, y: 160, toJSON: () => ({}) });
    await wrapper.setProps({ selectedNodeIds: ['first'] });
    await wrapper.setProps({ selectedNodeIds: ['first', 'second'] });
    await wrapper.vm.$nextTick();
    (parent.element as HTMLElement).style.transform = 'matrix(0, 1, -1, 0, 0, 0)';

    const groupHandle = wrapper.get('[data-pf-group-resize-handle="se"]');
    await groupHandle.trigger('pointerdown', { button: 0, pointerId: 32, clientX: 280, clientY: 180 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 32, clientX: 340, clientY: 180 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 32, clientX: 340, clientY: 180 });

    expect(wrapper.emitted('updateNodesDesign')?.[0]?.[0]).toEqual([
      { nodeId: 'first', patch: { position: { mode: 'absolute', x: 20, y: -40 }, size: { width: 20, height: 40 } } },
      { nodeId: 'second', patch: { position: { mode: 'absolute', x: 60, y: 40 }, size: { width: 20, height: 40 } } }
    ]);
  });

  it('scales rotated selected layers along their own local axes', async () => {
    const dsl = { ...validPage, nodes: [
      { id: 'rotated', type: 'Shape' as const, props: { shape: 'rectangle' as const },
        design: { position: { mode: 'absolute' as const, x: 20, y: 20 }, size: { width: 40, height: 20 }, rotation: 90 }, children: [], slots: [] },
      { id: 'plain', type: 'Shape' as const, props: { shape: 'rectangle' as const },
        design: { position: { mode: 'absolute' as const, x: 80, y: 20 }, size: { width: 20, height: 20 } }, children: [], slots: [] }
    ] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'plain', selectedNodeIds: ['rotated', 'plain'] } });
    const page = wrapper.get('.pulseflow-page');
    const rotated = wrapper.get('[data-pf-node-id="rotated"]');
    const plain = wrapper.get('[data-pf-node-id="plain"]');
    vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 720, left: 0, right: 1280, width: 1280, height: 720, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(rotated.element, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 50, left: 30, right: 50, width: 20, height: 40, x: 30, y: 10, toJSON: () => ({}) });
    vi.spyOn(plain.element, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 40, left: 80, right: 100, width: 20, height: 20, x: 80, y: 20, toJSON: () => ({}) });
    await wrapper.setProps({ selectedNodeIds: ['rotated'] });
    await wrapper.setProps({ selectedNodeIds: ['rotated', 'plain'] });
    await wrapper.vm.$nextTick();

    const eastHandle = wrapper.get('[data-pf-group-resize-handle="e"]');
    await eastHandle.trigger('pointerdown', { button: 0, pointerId: 33, clientX: 100, clientY: 30 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 33, clientX: 170, clientY: 30 });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 33, clientX: 170, clientY: 30 });

    expect(wrapper.emitted('updateNodesDesign')?.[0]?.[0]).toEqual([
      { nodeId: 'rotated', patch: { position: { mode: 'absolute', x: 30, y: 10 }, size: { width: 40, height: 40 } } },
      { nodeId: 'plain', patch: { position: { mode: 'absolute', x: 130, y: 20 }, size: { width: 40, height: 20 } } }
    ]);
  });

  it('cancels native browser drag once direct canvas movement starts', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'frame', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 16, y: 24 }, size: { width: 64, height: 32 } },
      children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true } });
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    await frame.trigger('pointerdown', { button: 0, pointerId: 31, clientX: 0, clientY: 0 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 31, clientX: 40, clientY: 24 });

    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true }) as DragEvent;
    const transfer = { setData: vi.fn(), effectAllowed: '' };
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    (frame.element as HTMLElement).dispatchEvent(dragStart);
    await wrapper.vm.$nextTick();

    expect(dragStart.defaultPrevented).toBe(true);
    expect(transfer.setData).not.toHaveBeenCalled();
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 31, clientX: 40, clientY: 24 });
    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toMatchObject({ nodeId: 'frame', patch: { position: { mode: 'absolute' } } });
  });

  it('snaps dragged layers to sibling edges and centers and renders temporary guides', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'artboard', type: 'Frame' as const, props: { direction: 'column' },
      design: { position: { mode: 'absolute' as const, x: 0, y: 0 }, size: { width: 1440, height: 900 } },
      children: [
        { id: 'moving', type: 'Frame' as const, props: { direction: 'column' }, design: { position: { mode: 'absolute' as const, x: 80, y: 80 }, size: { width: 80, height: 50 } }, children: [], slots: [] },
        { id: 'sibling', type: 'Frame' as const, props: { direction: 'column' }, design: { position: { mode: 'absolute' as const, x: 200, y: 80 }, size: { width: 100, height: 50 } }, children: [], slots: [] }
      ], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'moving' } });
    const page = wrapper.get('.pulseflow-page');
    const moving = wrapper.get('[data-pf-node-id="moving"]');
    const sibling = wrapper.get('[data-pf-node-id="sibling"]');
    vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 720, left: 0, right: 1280, width: 1280, height: 720, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(moving.element, 'getBoundingClientRect').mockReturnValue({ top: 80, bottom: 130, left: 80, right: 160, width: 80, height: 50, x: 80, y: 80, toJSON: () => ({}) });
    vi.spyOn(sibling.element, 'getBoundingClientRect').mockReturnValue({ top: 80, bottom: 130, left: 200, right: 300, width: 100, height: 50, x: 200, y: 80, toJSON: () => ({}) });
    await moving.trigger('pointerdown', { button: 0, pointerId: 9, clientX: 0, clientY: 0 });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 9, clientX: 128, clientY: 0 });
    expect((moving.element as HTMLElement).style.left).toBe('210px');
    expect(wrapper.get('[data-pf-editor-guide="x"]').element.getAttribute('style')).toContain('left: 250px');
    expect(wrapper.get('[data-pf-editor-guide="y"]').element.getAttribute('style')).toContain('top: 105px');
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 9, clientX: 128, clientY: 0 });
    expect(wrapper.emitted('updateNodeDesign')?.[0]?.[0]).toEqual({ nodeId: 'moving', patch: { position: { mode: 'absolute', x: 210, y: 80 } } });
  });

  it('drags a rendered object to a validated sibling position on the canvas', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key) ?? '',
      effectAllowed: 'all',
      dropEffect: 'none'
    };
    const source = wrapper.get('[data-pf-node-id="button"]');
    const destination = wrapper.get('[data-pf-node-id="table"]');
    vi.spyOn(source.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(destination.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    await source.trigger('dragstart', { dataTransfer });
    await destination.trigger('drop', { dataTransfer, clientY: 10 });
    expect(wrapper.emitted('moveNode')).toEqual([[{ nodeId: 'button', parentId: null, index: 2 }]]);
  });

  it('explains invalid canvas drops instead of producing invalid DSL', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key) ?? '',
      effectAllowed: 'all',
      dropEffect: 'none'
    };
    const source = wrapper.get('[data-pf-node-id="row"]');
    const destination = wrapper.get('[data-pf-node-id="col"]');
    vi.spyOn(source.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(destination.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    await source.trigger('dragstart', { dataTransfer });
    await destination.trigger('drop', { dataTransfer, clientY: 50 });
    expect(wrapper.emitted('moveNode')).toBeUndefined();
    expect(wrapper.emitted('dropRejected')?.[0]?.[0]).toContain('不能把图层放进自身');
  });

  it('adds a palette component before the canvas object under the drop position', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const dataTransfer = {
      getData: (key: string) => key === 'application/x-pulseflow-component' ? 'Button' : '',
      types: ['application/x-pulseflow-component'],
      dropEffect: 'none'
    };
    const destination = wrapper.get('[data-pf-node-id="table"]');
    vi.spyOn(destination.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    await destination.trigger('drop', { dataTransfer, clientY: 10 });
    expect(wrapper.emitted('insertComponent')).toEqual([[{ type: 'Button', parentId: null, index: 2 }]]);
  });

  it('drops a palette component into the center of a supported container', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const dataTransfer = {
      getData: (key: string) => key === 'application/x-pulseflow-component' ? 'FeatureCard' : '',
      types: ['application/x-pulseflow-component'],
      dropEffect: 'none'
    };
    const destination = wrapper.get('[data-pf-node-id="card"]');
    vi.spyOn(destination.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    await destination.trigger('drop', { dataTransfer, clientY: 50 });
    expect(wrapper.emitted('insertComponent')).toEqual([[{ type: 'FeatureCard', parentId: 'card', index: 1 }]]);
  });

  it('drops a library image into a frame at snapped frame-local coordinates', async () => {
    const dsl = { ...validPage, nodes: [{
      id: 'frame', type: 'Frame' as const, props: { name: 'Hero' },
      design: { position: { mode: 'absolute' as const, x: 0, y: 0 }, size: { width: 400, height: 240 } },
      children: [], slots: []
    }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, editorZoom: 100 } });
    const page = wrapper.get('.pulseflow-page');
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(frame.element, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, right: 500, bottom: 290, width: 400, height: 240, x: 100, y: 50, toJSON: () => ({}) });
    const dataTransfer = {
      types: ['application/x-pulseflow-image-asset'],
      getData: (type: string) => type === 'application/x-pulseflow-image-asset' ? 'asset-robot' : '',
      dropEffect: 'none'
    };

    await frame.trigger('dragover', { dataTransfer, clientY: 86 });
    expect(frame.attributes('data-pf-drop-intent')).toBe('inside');
    await frame.trigger('drop', { dataTransfer, clientX: 148, clientY: 86 });

    expect(frame.attributes('data-pf-drop-intent')).toBeUndefined();
    expect(wrapper.emitted('dropImageAsset')?.[0]?.[0]).toEqual({
      assetId: 'asset-robot', target: { parentId: 'frame', index: 0 }, position: { mode: 'absolute', x: 48, y: 36 }
    });
  });

  it('appends a palette component when dropped into the blank artboard area', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const dataTransfer = {
      getData: (key: string) => key === 'application/x-pulseflow-component' ? 'Image' : '',
      types: ['application/x-pulseflow-component'],
      dropEffect: 'none'
    };
    await wrapper.get('.pulseflow-preview').trigger('drop', { dataTransfer, clientY: 50 });
    expect(wrapper.emitted('insertComponent')).toEqual([[{ type: 'Image', parentId: null, index: validPage.nodes.length }]]);
  });

  it('adds status components to the PageHeader slot instead of its child list', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const dataTransfer = {
      getData: (key: string) => key === 'application/x-pulseflow-component' ? 'Tag' : '',
      types: ['application/x-pulseflow-component'], dropEffect: 'none'
    };
    const header = wrapper.get('[data-pf-node-id="header"]');
    vi.spyOn(header.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    await header.trigger('drop', { dataTransfer, clientY: 50 });
    expect(wrapper.emitted('insertComponent')).toEqual([[{ type: 'Tag', parentId: 'header', slotName: 'tags', index: 1 }]]);
  });

  it('shows an inside drop intent for palette components that can enter a container', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const dataTransfer = {
      getData: (key: string) => key === 'application/x-pulseflow-component' ? 'FeatureCard' : '',
      types: ['application/x-pulseflow-component'], dropEffect: 'none'
    };
    const destination = wrapper.get('[data-pf-node-id="card"]');
    vi.spyOn(destination.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });

    await destination.trigger('dragover', { dataTransfer, clientY: 50 });
    expect(destination.attributes('data-pf-drop-intent')).toBe('inside');
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('sets copy or move feedback over the canvas background from the drag payload', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const panel = wrapper.get('.preview-panel');
    const componentTransfer = { types: ['application/x-pulseflow-component'], dropEffect: 'none', getData: () => '' };
    await panel.trigger('dragover', { dataTransfer: componentTransfer });
    expect(componentTransfer.dropEffect).toBe('copy');

    const nodeTransfer = { types: ['application/x-pulseflow-node'], dropEffect: 'none', getData: () => '' };
    await panel.trigger('dragover', { dataTransfer: nodeTransfer });
    expect(nodeTransfer.dropEffect).toBe('move');
  });

  it('places a non-status component next to a PageHeader instead of in its tags slot', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const dataTransfer = {
      getData: (key: string) => key === 'application/x-pulseflow-component' ? 'Button' : '',
      types: ['application/x-pulseflow-component'], dropEffect: 'none'
    };
    const header = wrapper.get('[data-pf-node-id="header"]');
    vi.spyOn(header.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });

    await header.trigger('drop', { dataTransfer, clientY: 50 });
    expect(wrapper.emitted('insertComponent')).toEqual([[{ type: 'Button', parentId: null, index: 1 }]]);
  });

  it('exports a selected layer drag payload and marks then clears valid drop targets', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => key === 'application/x-pulseflow-node' ? 'button' : '',
      types: ['application/x-pulseflow-node'], effectAllowed: 'all', dropEffect: 'none'
    };
    const source = wrapper.get('[data-pf-node-id="button"]');
    const target = wrapper.get('[data-pf-node-id="table"]');
    vi.spyOn(target.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    await source.trigger('dragstart', { dataTransfer });
    expect(data.get('application/x-pulseflow-node')).toBe('button');
    await target.trigger('dragover', { dataTransfer, clientY: 0 });
    expect(target.attributes('data-pf-drop-intent')).toBe('before');
    expect(dataTransfer.dropEffect).toBe('move');
    await target.trigger('dragleave');
    expect(target.attributes('data-pf-drop-intent')).toBeUndefined();
    await target.trigger('drop', { dataTransfer, clientY: 0 });
    expect(wrapper.emitted('moveNode')).toEqual([[{ nodeId: 'button', parentId: null, index: 2 }]]);
  });

  it('prevents a locked canvas layer from starting native drag reordering', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'locked', type: 'Frame' as const, props: { direction: 'column' }, design: { locked: true }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true } });
    const writes = vi.fn();
    const dataTransfer = { setData: writes, effectAllowed: 'all' };
    await wrapper.get('[data-pf-node-id="locked"]').trigger('dragstart', { dataTransfer });
    expect(writes).not.toHaveBeenCalled();
  });

  it('moves an existing layer to the end of the artboard when dropped on blank canvas', async () => {
    const wrapper = mount(PreviewPanel, { props: { dsl: validPage, editorMode: true } });
    const dataTransfer = {
      getData: (key: string) => key === 'application/x-pulseflow-node' ? 'button' : '',
      setData: () => undefined, effectAllowed: 'all'
    };

    await wrapper.get('[data-pf-node-id="button"]').trigger('dragstart', { dataTransfer });
    await wrapper.get('.pulseflow-preview').trigger('drop', { dataTransfer, clientY: 50 });

    expect(wrapper.emitted('moveNode')).toEqual([[{ nodeId: 'button', parentId: null, index: validPage.nodes.length }]]);
  });

  it('ignores sub-threshold pointer movement and cancels active transforms on Escape', async () => {
    const dsl = { ...validPage, nodes: [{ id: 'frame', type: 'Frame' as const, props: { direction: 'column' }, design: { size: { width: 64, height: 32 } }, children: [], slots: [] }] };
    const wrapper = mount(PreviewPanel, { props: { dsl, editorMode: true, selectedNodeId: 'frame' } });
    const frame = wrapper.get('[data-pf-node-id="frame"]');
    const panel = wrapper.get('.preview-panel');
    await frame.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    await panel.trigger('pointermove', { pointerId: 1, clientX: 2, clientY: 2 });
    await panel.trigger('pointerup', { pointerId: 1, clientX: 2, clientY: 2 });
    expect(wrapper.emitted('updateNodeDesign')).toBeUndefined();

    await frame.trigger('pointerdown', { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    await panel.trigger('pointermove', { pointerId: 2, clientX: 40, clientY: 40 });
    await panel.trigger('keydown', { key: 'Escape' });
    await panel.trigger('pointerup', { pointerId: 2, clientX: 40, clientY: 40 });
    expect(wrapper.emitted('updateNodeDesign')).toBeUndefined();
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
