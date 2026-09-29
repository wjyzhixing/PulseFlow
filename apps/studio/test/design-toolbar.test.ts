import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignToolbar from '../src/features/design/DesignToolbar.vue';

describe('DesignToolbar', () => {
  it('emits Figma-style insert, history, device, zoom, and fit operations', async () => {
    const wrapper = mount(DesignToolbar, { props: { device: 'desktop', zoom: 100, canUndo: true, canRedo: true } });
    for (const label of ['选择工具', '添加画框', '添加形状', '添加文字', '添加图片', '撤销', '重做']) {
      expect(wrapper.find(`[aria-label="${label}"] svg[aria-hidden="true"]`).exists()).toBe(true);
    }
    await wrapper.get('[aria-label="添加画框"]').trigger('click');
    await wrapper.get('[aria-label="添加形状"]').trigger('click');
    await wrapper.get('[aria-label="添加文字"]').trigger('click');
    await wrapper.get('[aria-label="添加图片"]').trigger('click');
    await wrapper.get('[aria-label="撤销"]').trigger('click');
    await wrapper.get('[aria-label="重做"]').trigger('click');
    await wrapper.get('[data-device="tablet"]').trigger('click');
    await wrapper.get('[data-device="mobile"]').trigger('click');
    await wrapper.get('[aria-label="缩小画布"]').trigger('click');
    await wrapper.get('[aria-label="放大画布"]').trigger('click');
    await wrapper.get('.fit-button').trigger('click');

    expect(wrapper.emitted('addTool')?.map(([value]) => value)).toEqual(['Frame', 'Shape', 'Text', 'Image']);
    expect(wrapper.emitted('undo')).toEqual([[]]);
    expect(wrapper.emitted('redo')).toEqual([[]]);
    expect(wrapper.emitted('setDevice')?.map(([value]) => value)).toEqual(['tablet', 'mobile']);
    expect(wrapper.emitted('zoomBy')?.map(([value]) => value)).toEqual([-10, 10]);
    expect(wrapper.emitted('fit')).toEqual([[]]);
  });

  it('disables history and zoom controls at their bounds', () => {
    const wrapper = mount(DesignToolbar, { props: { device: 'mobile', zoom: 400, canUndo: false, canRedo: false } });
    expect(wrapper.get('[aria-label="撤销"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="重做"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="放大画布"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-device="mobile"]').attributes('aria-pressed')).toBe('true');
    const minimumZoom = mount(DesignToolbar, { props: { device: 'mobile', zoom: 10, canUndo: false, canRedo: false } });
    expect(minimumZoom.get('[aria-label="缩小画布"]').attributes('disabled')).toBeDefined();
  });

  it('emits copy, paste and duplicate actions with selection-aware button states', async () => {
    const wrapper = mount(DesignToolbar, {
      props: { device: 'desktop', zoom: 100, canUndo: true, canRedo: true, hasSelection: true, canPaste: false }
    });
    expect(wrapper.get('[aria-label="复制图层"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[aria-label="粘贴图层"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="重复图层"]').attributes('disabled')).toBeUndefined();

    await wrapper.get('[aria-label="复制图层"]').trigger('click');
    await wrapper.setProps({ canPaste: true });
    await wrapper.get('[aria-label="粘贴图层"]').trigger('click');
    await wrapper.get('[aria-label="重复图层"]').trigger('click');

    expect(wrapper.emitted('copySelection')).toEqual([[]]);
    expect(wrapper.emitted('pasteSelection')).toEqual([[]]);
    expect(wrapper.emitted('duplicateSelection')).toEqual([[]]);
  });
});
