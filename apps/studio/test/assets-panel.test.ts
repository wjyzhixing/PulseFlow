import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AssetsPanel, { type StudioImageAsset } from '../src/features/design/AssetsPanel.vue';

const assets: StudioImageAsset[] = [
  { id: 'used', name: '机器人主视觉.png', url: '/robot.png', used: true },
  { id: 'pending', name: '正在生成.png', used: false }
];

describe('AssetsPanel', () => {
  it('shows the empty state and forwards an uploaded image', async () => {
    const wrapper = mount(AssetsPanel, { props: { assets: [], actionLabel: '应用' } });
    expect(wrapper.get('[role="status"]').text()).toContain('还没有图片素材');
    const file = new File(['image'], 'robot.png', { type: 'image/png' });
    Object.defineProperty(wrapper.get('input').element, 'files', { configurable: true, value: [file] });
    await wrapper.get('input').trigger('change');
    expect(wrapper.emitted('upload')?.[0]).toEqual([file]);
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('');
  });

  it('renders used and loading assets, applies ready images, and disables unavailable actions', async () => {
    const wrapper = mount(AssetsPanel, { props: { assets, actionLabel: '设为主视觉' } });
    expect(wrapper.get('.assets-count').text()).toBe('2');
    expect(wrapper.get('.asset-used').text()).toBe('已使用');
    expect(wrapper.get('.asset-preview-empty').text()).toBe('正在载入');
    expect(wrapper.get('img').attributes('alt')).toBe('机器人主视觉.png');
    expect(wrapper.get('[aria-label="设为主视觉机器人主视觉.png"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[aria-label="设为主视觉正在生成.png"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[aria-label="设为主视觉机器人主视觉.png"]').trigger('click');
    expect(wrapper.emitted('apply')?.[0]).toEqual(['used']);
  });

  it('starts a copy drag for a ready image with its safe asset identifier', async () => {
    const wrapper = mount(AssetsPanel, { props: { assets, actionLabel: '应用' } });
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    await wrapper.get('[data-testid="asset-card-used"]').trigger('dragstart', { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-pulseflow-image-asset', 'used');
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(wrapper.get('[data-testid="asset-card-pending"]').attributes('draggable')).toBe('false');
  });

  it('shows upload errors and disables upload controls while busy or disabled', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    const wrapper = mount(AssetsPanel, {
      props: { assets, actionLabel: '应用', uploadError: '图片上传失败', uploading: true }
    });
    expect(wrapper.get('[role="alert"]').text()).toBe('图片上传失败');
    expect(wrapper.get('.asset-upload-button').text()).toBe('上传中…');
    expect(wrapper.get('.asset-upload-button').attributes('disabled')).toBeDefined();
    await wrapper.get('.asset-upload-button').trigger('click');
    expect(click).not.toHaveBeenCalled();

    await wrapper.setProps({ uploading: false, disabled: true });
    expect(wrapper.get('.asset-upload-button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.asset-apply').attributes('disabled')).toBeDefined();
  });
});
