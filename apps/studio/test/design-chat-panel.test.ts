import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignChatPanel from '../src/features/design/DesignChatPanel.vue';

const messages = [{ id: 'm1', role: 'assistant' as const, text: '已整理页面。' }];
const mountPanel = (imageReview?: {
  status: 'generating' | 'ready' | 'failed' | 'needs_confirmation';
  imageUrl?: string; alt?: string; message?: string; canReplace?: boolean;
}) => mount(DesignChatPanel, { props: { messages, pending: false, imageReview } });

describe('DesignChatPanel image review', () => {
  it('preserves chat messages and composer submission', async () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain('已整理页面。');
    await wrapper.get('#design-chat-input').setValue('请调整布局');
    await wrapper.get('.design-chat__composer').trigger('submit');
    expect(wrapper.emitted('submit')).toEqual([['请调整布局']]);
    expect(wrapper.find('[data-testid="image-review"]').exists()).toBe(false);
  });

  it('shows generation progress and cost notice with model catalog link', () => {
    const wrapper = mountPanel({ status: 'generating' });
    expect(wrapper.get('[data-testid="image-review"]').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('[data-testid="image-review-status"]').text()).toContain('正在生成图片');
    expect(wrapper.get('[data-testid="image-cost-notice"]').text()).toContain('可能产生费用');
    expect(wrapper.get('[data-testid="image-model-catalog"]').attributes('href')).toBe('https://tokenrhythm.studio/models');
    expect(wrapper.find('button[data-image-action]').exists()).toBe(false);
  });

  it('shows the image preview and emits apply, regenerate, and remove actions', async () => {
    const wrapper = mountPanel({ status: 'ready', imageUrl: 'blob:preview', alt: '蓝色建筑', canReplace: true });
    expect(wrapper.get('[data-testid="generated-image-preview"]').attributes('src')).toBe('blob:preview');
    expect(wrapper.get('[data-testid="generated-image-preview"]').attributes('alt')).toBe('蓝色建筑');
    expect(wrapper.get('[data-image-action="apply-inline"]').text()).toContain('替换');
    await wrapper.get('[data-image-action="apply-inline"]').trigger('click');
    await wrapper.get('[data-image-action="apply-background"]').trigger('click');
    await wrapper.get('[data-image-action="regenerate"]').trigger('click');
    await wrapper.get('[data-image-action="remove"]').trigger('click');
    expect(wrapper.emitted('image-action')).toEqual([
      ['apply-inline'], ['apply-background'], ['regenerate'], ['remove']
    ]);
  });

  it('asks for explicit inline or background placement when confirmation is needed', async () => {
    const wrapper = mountPanel({ status: 'needs_confirmation', imageUrl: 'blob:preview' });
    expect(wrapper.get('[data-testid="image-placement-question"]').text()).toContain('放在页面中');
    await wrapper.get('[data-image-action="apply-background"]').trigger('click');
    expect(wrapper.emitted('image-action')).toEqual([['apply-background']]);
  });

  it('offers placement choices before generation when confirmation has no preview', async () => {
    const wrapper = mountPanel({ status: 'needs_confirmation', message: '请选择图片放置位置' });
    expect(wrapper.find('[data-testid="generated-image-preview"]').exists()).toBe(false);
    await wrapper.get('[data-image-action="apply-inline"]').trigger('click');
    await wrapper.get('[data-image-action="apply-background"]').trigger('click');
    expect(wrapper.emitted('image-action')).toEqual([['apply-inline'], ['apply-background']]);
    expect(wrapper.find('[data-image-action="regenerate"]').exists()).toBe(false);
  });

  it('shows failure detail and offers regeneration without an empty image', async () => {
    const wrapper = mountPanel({ status: 'failed', message: '图片服务暂时不可用' });
    expect(wrapper.get('[data-testid="image-review-status"]').attributes('role')).toBe('alert');
    expect(wrapper.get('[data-testid="image-review-status"]').text()).toContain('图片服务暂时不可用');
    expect(wrapper.find('[data-testid="generated-image-preview"]').exists()).toBe(false);
    await wrapper.get('[data-image-action="regenerate"]').trigger('click');
    expect(wrapper.emitted('image-action')).toEqual([['regenerate']]);
  });

  it('does not offer apply actions without a preview URL', () => {
    const wrapper = mountPanel({ status: 'ready' });
    expect(wrapper.find('[data-image-action="apply-inline"]').exists()).toBe(false);
    expect(wrapper.find('[data-image-action="apply-background"]').exists()).toBe(false);
  });
});
