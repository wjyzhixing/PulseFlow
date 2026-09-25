import { beforeEach, describe, expect, it } from 'vitest';
import { createDesignStore } from '../src/features/design/design-store';

const fields = [{ id: 'company', key: 'company', label: '企业名称', type: 'string' as const, rules: [] }];
const page = () => ({
  schemaVersion: 1 as const,
  pageId: 'orders',
  title: '订单工作台',
  nodes: [
    {
      id: 'card', type: 'Card' as const, props: { title: '客户' }, slots: [], children: [
        { id: 'first', type: 'Input' as const, props: { placeholder: '第一个' }, slots: [], children: [] },
        { id: 'second', type: 'Button' as const, props: { label: '保存' }, slots: [], children: [] }
      ]
    }
  ]
});

describe('design store', () => {
  let store: ReturnType<typeof createDesignStore>;

  beforeEach(() => { store = createDesignStore({ dsl: page(), entityFields: fields }); });

  it('adds only a whitelisted component and selects the new node', () => {
    const added = store.addNode('FormItem', 'card', 1);
    expect(added.ok).toBe(true);
    expect(store.selectedNode.value).toMatchObject({ id: store.selectedNodeId.value, type: 'FormItem', props: { fieldId: 'company' } });
    expect(store.dsl.value.nodes[0]?.children.map((node) => node.type)).toEqual(['Input', 'FormItem', 'Button']);
    expect(() => store.addNode('script' as never, null, 0)).toThrow(/unsupported/i);
  });

  it('removes a selected subtree and clears its selection', () => {
    store.selectNode('first');
    expect(store.removeNode('first')).toBe(true);
    expect(store.dsl.value.nodes[0]?.children.map((node) => node.id)).toEqual(['second']);
    expect(store.selectedNodeId.value).toBeNull();
  });

  it('reorders siblings without an off-by-one shift', () => {
    expect(store.moveNode('first', 'card', 2)).toBe(true);
    expect(store.dsl.value.nodes[0]?.children.map((node) => node.id)).toEqual(['second', 'first']);
  });

  it('rejects moving a node into its own descendant', () => {
    const before = store.dsl.value;
    expect(store.moveNode('card', 'first', 0)).toBe(false);
    expect(store.dsl.value).toBe(before);
  });

  it('updates allowed properties and rejects unknown properties', () => {
    expect(store.updateNodeProps('card', { title: '重点客户' })).toBe(true);
    expect(store.selectedNode.value).toBeNull();
    expect(store.dsl.value.nodes[0]?.props).toEqual({ title: '重点客户' });
    expect(store.updateNodeProps('card', { dangerouslySetInnerHTML: '<script />' })).toBe(false);
    expect(store.dsl.value.nodes[0]?.props).toEqual({ title: '重点客户' });
  });

  it('applies valid JSON to the canonical DSL and reflects canvas edits in the JSON buffer', () => {
    const edited = { ...page(), title: '新版订单', nodes: [] };
    expect(store.applyJsonEdit(JSON.stringify(edited))).toMatchObject({ ok: true, dsl: edited, diagnostics: [] });
    expect(store.dsl.value.title).toBe('新版订单');
    store.addNode('Button', null, 0);
    expect(JSON.parse(store.source.value).nodes[0]).toMatchObject({ type: 'Button', props: { label: '按钮' } });
  });

  it('keeps invalid source and the last valid DSL with parse location diagnostics', () => {
    const before = store.dsl.value;
    const source = '{\n  "schemaVersion": 1,\n  "nodes": [\n';
    const result = store.applyJsonEdit(source);
    expect(result.ok).toBe(false);
    expect(store.dsl.value).toBe(before);
    expect(store.source.value).toBe(source);
    expect(store.diagnostics.value[0]).toMatchObject({ code: 'json.parse', path: '$', line: 4, col: 1 });
  });

  it('keeps the last valid DSL when schema validation fails and exposes its path', () => {
    const before = store.dsl.value;
    const source = JSON.stringify({ ...page(), nodes: [{ id: 'x', type: 'Script', props: {}, children: [], slots: [] }] });
    const result = store.applyJsonEdit(source);
    expect(result.ok).toBe(false);
    expect(store.dsl.value).toBe(before);
    expect(store.source.value).toBe(source);
    expect(store.diagnostics.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'component.unsupported', path: 'nodes[0].type', line: 1, col: expect.any(Number) })
    ]));
  });

  it('rejects invalid initial DSL and impossible mutation targets', () => {
    expect(() => createDesignStore({ dsl: { ...page(), schemaVersion: 2 as never }, entityFields: fields })).toThrow(/invalid initial/i);
    expect(store.addNode('Button', 'first', 0)).toEqual({ ok: false });
    expect(store.removeNode('missing')).toBe(false);
    expect(store.moveNode('missing', null, 0)).toBe(false);
    expect(store.updateNodeProps('missing', { label: 'x' })).toBe(false);
    store.selectNode('missing');
    expect(store.selectedNodeId.value).toBeNull();
  });

  it('selects and edits nodes nested in supported slots', () => {
    const withSlot = {
      ...page(),
      nodes: [{
        id: 'header', type: 'PageHeader' as const, props: { title: '订单' }, children: [],
        slots: [{ name: 'tags' as const, children: [{ id: 'tag', type: 'Tag' as const, props: { text: '新建' }, children: [], slots: [] }] }]
      }]
    };
    store = createDesignStore({ dsl: withSlot, entityFields: fields });
    store.selectNode('tag');
    expect(store.selectedNode.value?.id).toBe('tag');
    expect(store.updateNodeProps('tag', { text: '处理中' })).toBe(true);
    expect(store.removeNode('tag')).toBe(true);
    expect(store.dsl.value.nodes[0]?.slots).toEqual([{ name: 'tags', children: [] }]);
  });

  it('adds and reorders PageHeader tag-slot nodes through the parent id', () => {
    const withSlot = {
      ...page(),
      nodes: [{
        id: 'header', type: 'PageHeader' as const, props: { title: '订单' }, children: [],
        slots: [{ name: 'tags' as const, children: [{ id: 'tag', type: 'Tag' as const, props: { text: '新建' }, children: [], slots: [] }] }]
      }]
    };
    store = createDesignStore({ dsl: withSlot, entityFields: fields });
    expect(store.addNode('Badge', 'header', 1)).toMatchObject({ ok: true });
    expect(store.moveNode('tag', 'header', 2)).toBe(true);
    const tags = store.dsl.value.nodes[0]?.slots[0];
    expect(tags && 'children' in tags ? tags.children.map((node) => node.type) : []).toEqual(['Badge', 'Tag']);
  });
});
