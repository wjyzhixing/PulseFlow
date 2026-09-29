import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ComponentPalette from '../src/features/design/ComponentPalette.vue';

describe('ComponentPalette', () => {
  it('keeps click-to-add and exports a typed copy drag payload', async () => {
    const wrapper = mount(ComponentPalette, { props: { items: [{ type: 'Button', label: '按钮', hint: '触发动作' }] } });
    const add = wrapper.get('[data-testid="palette-Button"]');
    expect(add.attributes('draggable')).toBe('true');
    await add.trigger('click');
    expect(wrapper.emitted('add')).toEqual([['Button']]);

    const data = new Map<string, string>();
    const dataTransfer = { setData: (key: string, value: string) => data.set(key, value), effectAllowed: 'all' };
    await add.trigger('dragstart', { dataTransfer });
    expect(data.get('application/x-pulseflow-component')).toBe('Button');
    expect(dataTransfer.effectAllowed).toBe('copy');
  });
});
