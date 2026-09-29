import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PropertyRepeater from '../src/features/design/PropertyRepeater.vue';
import type { InspectorItemField } from '../src/features/design/inspector-fields';

const itemFields: InspectorItemField[] = [
  { key: 'sectionId', label: '链接区块', kind: 'section' },
  { key: 'fieldId', label: '数据字段', kind: 'entity-field' },
  { key: 'label', label: '名称', kind: 'text', placeholder: '输入名称' }
];
const sections = [{ id: 'overview', label: '总览' }, { id: 'contact', label: '联系' }];
const entityFields = [{ id: 'customer-name', key: 'customerName', label: '客户名称', type: 'string' as const, rules: [] }];

describe('PropertyRepeater', () => {
  it('shows an empty state and adds the first section, entity field, and text values', async () => {
    const wrapper = mount(PropertyRepeater, { props: { fieldKey: 'links', addLabel: '添加链接', itemFields, items: [], entityFields, sections } });
    expect(wrapper.text()).toContain('还没有链接');
    await wrapper.get('[data-testid="add-links"]').trigger('click');
    expect(wrapper.emitted('update')).toEqual([[[{ sectionId: 'overview', fieldId: 'customer-name', label: '' }]]]);
  });

  it('copies sibling records when updating a field and preserves the minimum count on removal', async () => {
    const items = [{ sectionId: 'overview', fieldId: 'customer-name', label: '主页' }, { sectionId: 'contact', fieldId: 'customer-name', label: '联系' }];
    const wrapper = mount(PropertyRepeater, { props: { fieldKey: 'links', addLabel: '添加链接', itemFields, items, entityFields, sections, minItems: 1 } });
    expect(wrapper.get('[data-testid="remove-links-0"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-testid="repeater-links-1-label"]').setValue('支持');
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([{ ...items[0] }, { ...items[1], label: '支持' }]);
    await wrapper.get('[data-testid="remove-links-0"]').trigger('click');
    expect(wrapper.emitted('update')?.[1]?.[0]).toEqual([items[1]]);
  });

  it('uses safe blank defaults when there are no available entity fields or sections', async () => {
    const wrapper = mount(PropertyRepeater, { props: { fieldKey: 'columns', addLabel: '添加列', itemFields, items: [], entityFields: [], sections: [] } });
    await wrapper.get('[data-testid="add-columns"]').trigger('click');
    expect(wrapper.emitted('update')).toEqual([[[{ sectionId: '', fieldId: '', label: '' }]]]);
  });
});
