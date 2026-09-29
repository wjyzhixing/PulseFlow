import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PagesPanel from '../src/features/design/PagesPanel.vue';

const pages = [
  { id: 'page-home', title: '首页' },
  { id: 'page-about', title: '关于我们' }
];

describe('PagesPanel', () => {
  it('lists pages and routes selection and creation to the workspace', async () => {
    const wrapper = mount(PagesPanel, { props: { pages, activePageId: 'page-home' } });

    await wrapper.get('[data-page-id="page-about"]').trigger('click');
    await wrapper.get('[aria-label="添加页面"]').trigger('click');

    expect(wrapper.text()).toContain('首页');
    expect(wrapper.get('[data-page-id="page-home"]').attributes('aria-current')).toBe('page');
    expect(wrapper.emitted('selectPage')).toEqual([['page-about']]);
    expect(wrapper.emitted('addPage')).toEqual([[]]);
  });

  it('filters page names from the search field', async () => {
    const wrapper = mount(PagesPanel, { props: { pages, activePageId: 'page-home' } });

    await wrapper.get('[aria-label="搜索页面"]').trigger('click');
    await wrapper.get('[aria-label="搜索页面名称"]').setValue('关于');

    expect(wrapper.find('[data-page-id="page-home"]').exists()).toBe(false);
    expect(wrapper.find('[data-page-id="page-about"]').exists()).toBe(true);
  });

  it('emits a before-target page reorder when a page is dropped in the list', async () => {
    const wrapper = mount(PagesPanel, { props: { pages, activePageId: 'page-home' } });
    const source = wrapper.get('[data-page-id="page-home"]');
    const target = wrapper.get('[data-page-id="page-about"]');
    vi.spyOn(target.element, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 42, height: 32 } as DOMRect);
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };

    await source.trigger('dragstart', { dataTransfer });
    await target.trigger('dragover', { clientY: 14 });
    expect(target.classes()).toContain('page-row-button--drop-before');
    await target.trigger('drop', { dataTransfer, clientY: 14 });

    expect(wrapper.emitted('reorderPage')).toEqual([[{ sourcePageId: 'page-home', targetPageId: 'page-about', placement: 'before' }]]);
  });

  it('shows an after-target insertion line and emits an after reorder at the lower edge', async () => {
    const wrapper = mount(PagesPanel, { props: { pages, activePageId: 'page-home' } });
    const source = wrapper.get('[data-page-id="page-home"]');
    const target = wrapper.get('[data-page-id="page-about"]');
    vi.spyOn(target.element, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 42, height: 32 } as DOMRect);
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };

    await source.trigger('dragstart', { dataTransfer });
    await target.trigger('dragover', { clientY: 39 });
    expect(target.classes()).toContain('page-row-button--drop-after');
    await target.trigger('drop', { dataTransfer, clientY: 39 });

    expect(wrapper.emitted('reorderPage')).toEqual([[{ sourcePageId: 'page-home', targetPageId: 'page-about', placement: 'after' }]]);
  });

  it('renames the active page on double-click and commits through the page event', async () => {
    const wrapper = mount(PagesPanel, { props: { pages, activePageId: 'page-home' } });

    await wrapper.get('[data-page-id="page-home"]').trigger('dblclick');
    const input = wrapper.get('[aria-label="重命名页面 首页"]');
    await input.setValue('机器人首页');
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('renamePage')).toEqual([['page-home', '机器人首页']]);
    expect(wrapper.find('.page-title-input').exists()).toBe(false);
  });

  it('does not start renaming an inactive page or commit when cancelled', async () => {
    const wrapper = mount(PagesPanel, { props: { pages, activePageId: 'page-home' } });

    await wrapper.get('[data-page-id="page-about"]').trigger('dblclick');
    expect(wrapper.find('.page-title-input').exists()).toBe(false);

    await wrapper.get('[data-page-id="page-home"]').trigger('dblclick');
    const input = wrapper.get('[aria-label="重命名页面 首页"]');
    await input.setValue('不应保存');
    await input.trigger('keydown.esc');

    expect(wrapper.emitted('renamePage')).toBeUndefined();
    expect(wrapper.get('[data-page-id="page-home"]').text()).toContain('首页');
  });
});
