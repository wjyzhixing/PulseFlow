import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { PageDsl } from '@pulseflow/ui-dsl';
import DesignCanvas from '../src/features/design/DesignCanvas.vue';
import type { ReadonlyDesignNode } from '../src/features/design/design-store';

enableAutoUnmount(afterEach);

const PreviewStub = defineComponent({
  props: { dsl: { type: Object, required: true }, selectedNodeId: { type: String, default: null } },
  emits: ['selectNode'],
  setup(_props, { emit }) { return () => h('button', { 'data-preview-select': '', onClick: () => emit('selectNode', 'node-a') }, '选择画布元素'); }
});

const page: PageDsl = { schemaVersion: 1, pageId: 'canvas-test', title: '画布测试', nodes: [] };

function mountCanvas() {
  return mount(DesignCanvas, {
    props: { nodes: [], dsl: page, previewData: {}, selectedNodeId: null, canUndo: true, canRedo: false },
    global: { stubs: { PreviewPanel: PreviewStub } }
  });
}

describe('DesignCanvas', () => {
  it('renders an actual page artboard and changes its width for device presets', async () => {
    const wrapper = mountCanvas();
    expect(wrapper.get('.canvas-stage').attributes('style')).toContain('width: 1280px');
    await wrapper.get('[data-device="mobile"]').trigger('click');
    expect(wrapper.get('.canvas-stage').attributes('style')).toContain('width: 390px');
  });

  it('sizes the infinite canvas around an imported fixed-width root Frame', () => {
    const artboard: PageDsl['nodes'][number] = {
      id: 'imported-artboard', type: 'Frame',
      props: { name: 'Imported', direction: 'column', gap: 0, padding: 0 },
      design: { position: { mode: 'absolute', x: 0, y: 0 }, size: { width: 1440, height: 900 } },
      children: [], slots: []
    };
    const dsl = { ...page, nodes: [artboard] };
    const wrapper = mount(DesignCanvas, {
      props: { nodes: dsl.nodes as unknown as readonly ReadonlyDesignNode[], dsl, previewData: {}, selectedNodeId: null, canUndo: true, canRedo: false },
      global: { stubs: { PreviewPanel: PreviewStub } }
    });

    expect(wrapper.get('.canvas-artboard-shell').attributes('style')).toContain('width: 1440px');
    expect(wrapper.get('.canvas-stage').attributes('style')).toContain('width: 1440px');
  });

  it('zooms the artboard without changing page content and forwards direct selection', async () => {
    const wrapper = mountCanvas();
    await wrapper.get('[aria-label="放大画布"]').trigger('click');
    expect(wrapper.get('[data-testid="canvas-zoom"]').text()).toBe('110%');
    expect(wrapper.get('.canvas-stage').attributes('style')).toContain('scale(1.1)');
    await wrapper.get('[data-preview-select]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['node-a']]);
    expect(page.nodes).toEqual([]);
  });

  it('zooms around the pointer position like an infinite design canvas', async () => {
    const wrapper = mountCanvas();
    const workspace = wrapper.get('.canvas-workspace');
    Object.defineProperty(workspace.element, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(workspace.element, 'clientHeight', { configurable: true, value: 600 });
    vi.spyOn(workspace.element, 'getBoundingClientRect').mockReturnValue({ top: 50, bottom: 650, left: 100, right: 900, width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}) });
    vi.spyOn(wrapper.get('.canvas-artboard-shell').element, 'getBoundingClientRect').mockReturnValue({ top: 82, bottom: 682, left: 100, right: 1_380, width: 1_280, height: 600, x: 100, y: 82, toJSON: () => ({}) });

    workspace.element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100, clientX: 300, clientY: 250 }));
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.canvas-stage').attributes('style')).toContain('translate(-20px, -16.8px) scale(1.1)');
  });

  it('fits the current device frame to the available canvas width', async () => {
    const wrapper = mountCanvas();
    Object.defineProperty(wrapper.get('.canvas-workspace').element, 'clientWidth', { configurable: true, value: 832 });
    await wrapper.get('.fit-button').trigger('click');
    expect(Number(wrapper.get('[data-testid="canvas-zoom"]').text().replace('%', ''))).toBe(63);
  });

  it('shows history actions with stateful disabled controls and forwards requests', async () => {
    const wrapper = mountCanvas();
    expect(wrapper.get('[aria-label="撤销"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[aria-label="重做"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[aria-label="撤销"]').trigger('click');
    expect(wrapper.emitted('undo')).toEqual([[]]);
  });

  it('pans with space plus drag and ignores regular pointer drags', async () => {
    const wrapper = mountCanvas();
    const workspace = wrapper.get('.canvas-workspace');
    await workspace.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 20 });
    expect(workspace.classes()).not.toContain('canvas-workspace--panning');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    await workspace.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 20 });
    await workspace.trigger('pointermove', { button: 0, pointerId: 1, clientX: 36, clientY: 45 });
    expect(workspace.classes()).toContain('canvas-workspace--panning');
    expect(wrapper.get('.canvas-stage').attributes('style')).toContain('translate(26px, 25px)');
    await workspace.trigger('pointerup', { button: 0, pointerId: 1 });
    expect(workspace.classes()).not.toContain('canvas-workspace--panning');
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
  });

  it('pans the Figma canvas with a middle mouse drag', async () => {
    const wrapper = mountCanvas();
    const workspace = wrapper.get('.canvas-workspace');

    await workspace.trigger('pointerdown', { button: 1, pointerId: 4, clientX: 12, clientY: 16 });
    await workspace.trigger('pointermove', { button: 1, pointerId: 4, clientX: 40, clientY: 51 });

    expect(workspace.classes()).toContain('canvas-workspace--panning');
    expect(wrapper.get('.canvas-stage').attributes('style')).toContain('translate(28px, 35px)');
    await workspace.trigger('pointerup', { button: 1, pointerId: 4 });
    expect(workspace.classes()).not.toContain('canvas-workspace--panning');
  });

  it('ignores tool shortcuts while an editable field has focus', async () => {
    const wrapper = mountCanvas();
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[aria-label="选择工具"]').attributes('aria-pressed')).toBe('true');
    input.remove();
  });

  it('does not capture the space key while a text input or toolbar control is focused', async () => {
    const wrapper = mountCanvas();
    const workspace = wrapper.get('.canvas-workspace');
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    await workspace.trigger('pointerdown', { button: 0, pointerId: 2, clientX: 10, clientY: 10 });
    expect(workspace.classes()).not.toContain('canvas-workspace--panning');
    input.remove();

    wrapper.get('[data-device="desktop"]').element.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    await workspace.trigger('pointerdown', { button: 0, pointerId: 3, clientX: 10, clientY: 10 });
    expect(workspace.classes()).not.toContain('canvas-workspace--panning');
  });

  it('selects drawing tools from Figma keyboard shortcuts and exits with Escape', async () => {
    const wrapper = mountCanvas();
    const toolbar = wrapper.get('[role="toolbar"]');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="添加画框"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('.canvas-empty-hint').text()).toContain('Frame 工具已选中');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="添加形状"]').attributes('aria-pressed')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="添加文字"]').attributes('aria-pressed')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="添加图片"]').attributes('aria-pressed')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="选择工具"]').attributes('aria-pressed')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="选择工具"]').attributes('aria-pressed')).toBe('true');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
    toolbar.get('[aria-label="放大画布"]').element.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="添加画框"]').attributes('aria-pressed')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-label="选择工具"]').attributes('aria-pressed')).toBe('true');
  });
});
