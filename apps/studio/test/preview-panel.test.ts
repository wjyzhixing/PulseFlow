import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { validPage } from '../../../packages/ui-dsl/test/fixtures.js';
import PreviewPanel from '../src/features/preview/PreviewPanel.vue';
import { createMockData } from '../src/features/preview/mock-handlers';
import { validFields } from '../../../packages/ui-dsl/test/fixtures.js';

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
});
