import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { DeepReadonly } from 'vue';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures.js';
import DesignInspector from '../src/features/design/DesignInspector.vue';
import type { DesignPageDsl, ReadonlyDesignNode } from '../src/features/design/design-store';

describe('DesignInspector', () => {
  it('shows page settings when no object is selected', async () => {
    const wrapper = mount(DesignInspector, { props: { page: validPage as unknown as DeepReadonly<DesignPageDsl>, node: null, entityFields: validFields } });
    expect(wrapper.text()).toContain('页面设置');
    await wrapper.get('[data-testid="page-title"]').setValue('客户服务中心');
    await wrapper.get('input[value="website"]').trigger('change');
    expect(wrapper.emitted('updatePage')).toEqual([
      [{ title: '客户服务中心' }],
      [{ pageKind: 'website' }]
    ]);
  });

  it('offers validated named themes and preserves the other theme token on change', async () => {
    const page = { ...validPage, theme: { colorScheme: 'teal', cornerStyle: 'soft' } } as unknown as DeepReadonly<DesignPageDsl>;
    const wrapper = mount(DesignInspector, { props: { page, node: null, entityFields: validFields } });

    expect(wrapper.get('[data-testid="theme-color-teal"]').attributes('aria-pressed')).toBe('true');
    await wrapper.get('[data-testid="theme-color-violet"]').trigger('click');
    await wrapper.get('[data-testid="theme-corner-square"]').trigger('click');

    expect(wrapper.emitted('updatePage')).toEqual([
      [{ theme: { colorScheme: 'violet', cornerStyle: 'soft' } }],
      [{ theme: { colorScheme: 'teal', cornerStyle: 'square' } }]
    ]);
  });

  it('shows designer property groups for the selected object', () => {
    const table = validPage.nodes.find((item) => item.type === 'Table');
    const wrapper = mount(DesignInspector, {
      props: { page: validPage as unknown as DeepReadonly<DesignPageDsl>, node: table as unknown as ReadonlyDesignNode, entityFields: validFields }
    });
    expect(wrapper.find('[data-property-group="数据"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="prop-dataSourceKey"]').element.tagName).toBe('INPUT');
  });

  it('exposes Figma geometry and typography groups and emits typed design updates', async () => {
    const textNode = {
      id: 'hero-title', type: 'Text', props: { text: 'PulseFlow' }, children: [], slots: [],
      design: { position: { mode: 'absolute', x: 20, y: 30 }, size: { width: 320, height: 'hug' }, typography: { fontFamily: 'sans', fontSize: 32, fontWeight: 700, color: '#112233' } }
    } as unknown as ReadonlyDesignNode;
    const wrapper = mount(DesignInspector, {
      props: { page: validPage as unknown as DeepReadonly<DesignPageDsl>, node: textNode, entityFields: validFields }
    });
    expect(wrapper.text()).toContain('Position');
    expect(wrapper.text()).toContain('Layout');
    expect(wrapper.text()).toContain('Appearance');
    expect(wrapper.text()).toContain('Typography');
    expect(wrapper.text()).toContain('Fill');
    expect(wrapper.findAll('.flip-controls svg[aria-hidden="true"]')).toHaveLength(2);
    await wrapper.get('[aria-label="X 坐标"]').setValue('44');
    await wrapper.get('[aria-label="字号"]').setValue('40');
    expect(wrapper.emitted('updateDesign')).toEqual([
      [{ position: { mode: 'absolute', x: 44, y: 30 } }],
      [{ typography: { fontFamily: 'sans', fontSize: 40, fontWeight: 700, color: '#112233' } }]
    ]);
  });

  it('offers Figma alignment actions and Hug/Fill sizing modes', async () => {
    const frameNode = {
      id: 'frame', type: 'Frame', props: { name: '卡片' }, children: [], slots: [],
      design: { position: { mode: 'absolute', x: 20, y: 30 }, size: { width: 320, height: 180 } }
    } as unknown as ReadonlyDesignNode;
    const wrapper = mount(DesignInspector, {
      props: { page: validPage as unknown as DeepReadonly<DesignPageDsl>, node: frameNode, entityFields: validFields }
    });
    expect(wrapper.findAll('.alignment-controls svg[aria-hidden="true"]')).toHaveLength(6);
    await wrapper.get('[aria-label="水平居中"]').trigger('click');
    await wrapper.get('[aria-label="宽度模式"]').setValue('hug');
    expect(wrapper.emitted('alignNode')).toEqual([['center-x']]);
    expect(wrapper.emitted('updateDesign')).toEqual([[{ size: { width: 'hug', height: 180 } }]]);
  });

  it('writes geometry, appearance, fill, and every typography control to design updates', async () => {
    const textNode = {
      id: 'text-layer', type: 'Text', props: { text: 'Dashboard' }, children: [], slots: [],
      design: { position: { mode: 'flow', x: 2, y: 3 }, size: { width: 280, height: 40 }, typography: { fontFamily: 'sans', fontSize: 20 } }
    } as unknown as ReadonlyDesignNode;
    const wrapper = mount(DesignInspector, {
      props: { page: validPage as unknown as DeepReadonly<DesignPageDsl>, node: textNode, entityFields: validFields }
    });
    await wrapper.get('[aria-label="定位方式"]').setValue('absolute');
    await wrapper.get('[aria-label="Y 坐标"]').setValue('28');
    await wrapper.get('[aria-label="宽度"]').setValue('360');
    await wrapper.get('[aria-label="高度模式"]').setValue('fill');
    await wrapper.get('[aria-label="旋转角度"]').setValue('12');
    await wrapper.get('[aria-label="透明度"]').setValue('0.8');
    await wrapper.get('[aria-label="圆角"]').setValue('12');
    await wrapper.get('[aria-label="填充颜色"]').setValue('#abcdef');
    await wrapper.get('[aria-label="描边颜色"]').setValue('#123456');
    await wrapper.get('[aria-label="描边宽度"]').setValue('2');
    await wrapper.get('[aria-label="字体"]').setValue('mono');
    await wrapper.get('[aria-label="字号"]').setValue('24');
    await wrapper.get('[aria-label="字重"]').setValue('600');
    await wrapper.get('[aria-label="行高"]').setValue('1.8');
    await wrapper.get('[aria-label="字距"]').setValue('1');
    await wrapper.get('[aria-label="文字对齐"]').setValue('center');
    await wrapper.get('[aria-label="文字颜色"]').setValue('#654321');

    const updates = wrapper.emitted('updateDesign')?.map(([patch]) => patch as Record<string, unknown>) ?? [];
    expect(updates).toEqual(expect.arrayContaining([
      { position: { mode: 'absolute', x: 2, y: 3 } },
      { position: { mode: 'absolute', x: 2, y: 28 } },
      { size: { width: 360, height: 40 } },
      { size: { width: 280, height: 'fill' } },
      { rotation: 12 }, { opacity: 0.8 }, { cornerRadius: 12 }, { fill: '#abcdef' }, { stroke: '#123456' }, { strokeWidth: 2 },
      { typography: { fontFamily: 'mono', fontSize: 20 } },
      { typography: { fontFamily: 'sans', fontSize: 24 } },
      { typography: { fontFamily: 'sans', fontSize: 20, fontWeight: 600 } },
      { typography: { fontFamily: 'sans', fontSize: 20, lineHeight: 1.8 } },
      { typography: { fontFamily: 'sans', fontSize: 20, letterSpacing: 1 } },
      { typography: { fontFamily: 'sans', fontSize: 20, textAlign: 'center' } },
      { typography: { fontFamily: 'sans', fontSize: 20, color: '#654321' } }
    ]));
  });
});
