import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { validPage } from '../../../packages/ui-dsl/test/fixtures.js';
import LayersPanel from '../src/features/design/LayersPanel.vue';
import type { ReadonlyDesignNode } from '../src/features/design/design-store';

const nodes = JSON.parse(JSON.stringify(validPage.nodes)) as readonly ReadonlyDesignNode[];

describe('LayersPanel', () => {
  it('shows Chinese layer names and mirrors the selected DSL node', () => {
    const wrapper = mount(LayersPanel, { props: { nodes, selectedNodeId: 'header' } });
    expect(wrapper.get('[role="tree"]').attributes('aria-label')).toBe('页面图层');
    expect(wrapper.get('[data-testid="canvas-node-header"]').text()).toContain('页面页头');
    expect(wrapper.get('[data-testid="canvas-node-header"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.get('[data-testid="canvas-node-header-tag"]').text()).toContain('状态标签');
  });

  it('uses vector icons for layer types, visibility and lock state', () => {
    const wrapper = mount(LayersPanel, { props: { nodes, selectedNodeId: null } });
    const header = wrapper.get('[data-testid="canvas-node-header"]');
    expect(header.find('.node-icon svg[aria-hidden="true"]').exists()).toBe(true);
    expect(header.find('[aria-label="隐藏 Dedicated line"] svg[aria-hidden="true"]').exists()).toBe(true);
    expect(header.find('[aria-label="锁定 Dedicated line"] svg[aria-hidden="true"]').exists()).toBe(true);
    expect(header.find('[aria-label="移除 Dedicated line"] svg[aria-hidden="true"]').exists()).toBe(true);
  });

  it('renders the panel search icon from its local Studio icon component', () => {
    const wrapper = mount(LayersPanel, { props: { nodes, selectedNodeId: null } });
    expect(wrapper.find('[aria-label="搜索图层"] svg[aria-hidden="true"]').exists()).toBe(true);
  });

  it('sends selection and remove intent to the owning store', async () => {
    const wrapper = mount(LayersPanel, { props: { nodes, selectedNodeId: null } });
    await wrapper.get('[data-testid="canvas-node-header"]').trigger('click');
    await wrapper.get('[aria-label="移除 Dedicated line"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['header']]);
    expect(wrapper.emitted('remove')).toEqual([['header']]);
  });

  it('supports Enter and Space keyboard selection on focused layers', async () => {
    const wrapper = mount(LayersPanel, { props: { nodes, selectedNodeId: null } });
    const headerLayer = wrapper.get('[data-testid="canvas-node-header"]');
    await headerLayer.trigger('keydown.enter');
    await headerLayer.trigger('keydown.space');
    expect(wrapper.emitted('select')).toEqual([['header'], ['header']]);
  });

  it('converts layer drag and drop into a stable node move intent', async () => {
    const wrapper = mount(LayersPanel, { props: { nodes, selectedNodeId: null } });
    await wrapper.get('[data-testid="canvas-node-header"]').trigger('dragstart');
    await wrapper.get('[data-testid="canvas-node-metric-row"] [data-testid="drop-before"]').element.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(wrapper.emitted('move')).toEqual([[{ nodeId: 'header', parentId: null, index: 1 }]]);
  });

  it('emits visibility and lock changes for the selected layer', async () => {
    const wrapper = mount(LayersPanel, { props: { nodes, selectedNodeId: null } });
    await wrapper.get('[aria-label="隐藏 Dedicated line"]').trigger('click');
    await wrapper.get('[aria-label="锁定 Dedicated line"]').trigger('click');

    expect(wrapper.emitted('updateDesign')).toEqual([
      [{ nodeId: 'header', patch: { visible: false } }],
      [{ nodeId: 'header', patch: { locked: true } }]
    ]);
  });

  it('shows the inverse visibility and lock actions for hidden locked layers', () => {
    const hiddenLockedNodes = nodes.map((node) => node.id === 'header'
      ? { ...node, design: { visible: false, locked: true } }
      : node);
    const wrapper = mount(LayersPanel, { props: { nodes: hiddenLockedNodes, selectedNodeId: null } });
    expect(wrapper.get('[aria-label="显示 Dedicated line"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="解锁 Dedicated line"]').attributes('aria-pressed')).toBe('true');
  });

  it('disables removal for locked layers and layers inside a locked ancestor', () => {
    const lockedNodes = nodes.map((node) => node.id === 'header'
      ? { ...node, design: { locked: true } }
      : node);
    const wrapper = mount(LayersPanel, { props: { nodes: lockedNodes, selectedNodeId: null } });
    expect(wrapper.get('[aria-label="Dedicated line 已锁定，无法移除"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="Live 已锁定，无法移除"]').attributes('disabled')).toBeDefined();
  });

  it('collapses and expands nested layers and disables the disclosure control for empty layers', async () => {
    const wrapper = mount(LayersPanel, { props: { nodes, selectedNodeId: null } });
    const headerLayer = wrapper.get('[data-testid="canvas-node-header"]');
    const toggle = headerLayer.get('[aria-label="折叠 Dedicated line"]');
    await toggle.trigger('click');
    expect(headerLayer.get('[aria-label="展开 Dedicated line"]').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-testid="canvas-node-header-tag"]').exists()).toBe(false);

    await headerLayer.get('[aria-label="展开 Dedicated line"]').trigger('click');
    expect(headerLayer.get('[aria-label="折叠 Dedicated line"]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[data-testid="canvas-node-header-tag"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="canvas-node-button"]').get('.tree-toggle').attributes('disabled')).toBeDefined();
  });
});
