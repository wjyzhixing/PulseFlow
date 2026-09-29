import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { DeepReadonly } from 'vue';
import type { PageDsl } from '@pulseflow/ui-dsl';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures.js';
import NodePropertyEditor from '../src/features/design/NodePropertyEditor.vue';
import type { DesignPageDsl, ReadonlyDesignNode } from '../src/features/design/design-store';

describe('NodePropertyEditor', () => {
  it('groups table settings for designers and edits columns with a structured repeater', async () => {
    const table = validPage.nodes.find((node) => node.type === 'Table');
    expect(table).toBeDefined();
    const wrapper = mount(NodePropertyEditor, { props: { node: table as unknown as ReadonlyDesignNode, entityFields: validFields, pageDsl: validPage as unknown as DeepReadonly<DesignPageDsl> } });

    const dataGroup = wrapper.get('[data-property-group="数据"]');
    expect(dataGroup.text()).toContain('数据字段');
    expect(dataGroup.text()).toContain('列标题');
    expect(dataGroup.text()).not.toContain('dataSourceKey');
    expect(wrapper.get('[data-testid="prop-dataSourceKey"]').element.tagName).toBe('INPUT');

    await wrapper.get('[data-testid="add-columns"]').trigger('click');
    const added = wrapper.emitted('update')?.at(-1)?.[0] as { columns: unknown[] };
    expect(added.columns).toHaveLength(3);
    expect(added.columns[2]).toEqual({ field: validFields[0]?.id, title: '' });
  });

  it('offers only existing content sections as interaction targets', () => {
    const website: PageDsl = {
      ...validPage,
      pageKind: 'website' as const,
      nodes: [
        { id: 'hero', type: 'Hero' as const, props: { title: '欢迎', subtitle: '介绍' }, children: [], slots: [] },
        { id: 'features', type: 'ContentSection' as const, props: { sectionId: 'features', title: '能力', tone: 'default' as const }, children: [], slots: [] }
      ]
    };
    const hero = website.nodes[0]!;
    const wrapper = mount(NodePropertyEditor, { props: { node: hero as unknown as ReadonlyDesignNode, entityFields: validFields, pageDsl: website as unknown as DeepReadonly<DesignPageDsl> } });
    const target = wrapper.get('[data-testid="prop-primarySectionId"]');
    expect(target.findAll('option').map((option) => option.element.value)).toContain('features');
    expect(target.findAll('option').map((option) => option.element.value)).not.toContain('missing');
  });

  it('lets designers drag a bounded layout value through the same property update event', async () => {
    const row = validPage.nodes.find((node) => node.type === 'Row');
    const wrapper = mount(NodePropertyEditor, { props: { node: row as unknown as ReadonlyDesignNode, entityFields: validFields } });
    const gutter = wrapper.get('[data-testid="prop-gutter-range"]');
    expect(gutter.attributes('min')).toBe('0');
    expect(gutter.attributes('max')).toBe('48');
    await gutter.setValue('24');
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual({ gutter: 24 });
  });
});
