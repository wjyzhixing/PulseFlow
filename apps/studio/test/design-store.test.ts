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

  it('adds an image and accepts safe generated asset IDs while rejecting external URLs or invalid display properties', () => {
    const added = store.addNode('Image', null, 0);
    expect(added.ok).toBe(true);
    expect(store.selectedNode.value).toMatchObject({ type: 'Image', props: {
      assetId: 'asset-workflow', alt: expect.any(String), fit: 'cover', aspectRatio: '16:9'
    } });
    expect(store.updateNodeProps(added.nodeId!, { assetId: 'asset-analytics', alt: '业务分析示意图', fit: 'contain', aspectRatio: '4:3' })).toBe(true);
    expect(store.updateNodeProps(added.nodeId!, { assetId: 'https://example.test/image.png' })).toBe(false);
    expect(store.updateNodeProps(added.nodeId!, { assetId: 'asset-generated_123' })).toBe(true);
    expect(store.updateNodeProps(added.nodeId!, { aspectRatio: '2:1' })).toBe(false);
  });

  it('adds and edits a website conversion block linked to an existing section', () => {
    const website = { ...page(), pageKind: 'website' as const, nodes: [
      { id: 'overview', type: 'ContentSection' as const, props: { sectionId: 'overview', title: '核心能力', tone: 'default' }, children: [], slots: [] }
    ] };
    store = createDesignStore({ dsl: website, entityFields: fields });
    const added = store.addNode('CallToAction', null, 1);
    expect(added.ok).toBe(true);
    expect(store.selectedNode.value).toMatchObject({ type: 'CallToAction', props: {
      title: expect.any(String), actionLabel: expect.any(String), targetSectionId: 'overview'
    } });
    expect(store.updateNodeProps(added.nodeId!, { targetSectionId: 'missing' })).toBe(false);
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

  it('adds and updates entity fields immutably and notifies the draft owner', () => {
    const changed: string[] = [];
    store = createDesignStore({ dsl: page(), entityFields: fields, onEntityFieldsChange: (items) => changed.push(JSON.stringify(items)) });
    const before = store.entityFields;
    const added = store.addEntityField();

    expect(added).toMatchObject({ id: expect.stringMatching(/^[A-Za-z0-9_-]+$/), key: expect.stringMatching(/^[A-Za-z0-9_-]+$/), type: 'string', rules: [] });
    expect(store.entityFields).not.toBe(before);
    expect(before).toHaveLength(1);
    expect(store.entityFields).toHaveLength(2);
    expect(store.updateEntityField('company', { label: '客户名称', rules: [{ kind: 'required' }] })).toBe(true);
    expect(before[0]?.label).toBe('企业名称');
    expect(store.entityFields[0]).toMatchObject({ label: '客户名称', rules: [{ kind: 'required' }] });
    expect(changed).toHaveLength(2);
  });

  it('does not expose mutable references to the internal entity field state', () => {
    const exposed = store.entityFields as unknown as Array<{ label: string; rules: Array<{ kind: string }> }>;
    exposed[0]!.label = '篡改名称';
    exposed[0]!.rules.push({ kind: 'required' });

    expect(store.entityFields[0]).toMatchObject({ label: '企业名称', rules: [] });
  });

  it('rejects invalid field keys, labels, and rules without changing state', () => {
    const other = store.addEntityField();
    const before = store.entityFields;
    expect(store.updateEntityField('company', { key: other.key })).toBe(false);
    expect(store.updateEntityField('company', { label: '<script>bad</script>' })).toBe(false);
    expect(store.updateEntityField('company', { rules: [{ kind: 'format', format: 'email' } as never] })).toBe(false);
    expect(store.entityFields).toEqual(before);
    expect(store.entityFields[0]?.label).toBe('企业名称');
  });

  it('refuses to remove fields referenced by the DSL and removes unused fields', () => {
    const boundPage = {
      ...page(),
      nodes: [{
        id: 'form', type: 'Form' as const, props: {}, slots: [], children: [
          { id: 'field', type: 'FormItem' as const, props: { fieldId: 'company' }, slots: [], children: [] }
        ]
      }]
    };
    store = createDesignStore({ dsl: boundPage, entityFields: fields });
    const before = store.entityFields;
    expect(store.removeEntityField('company')).toBe(false);
    expect(store.entityFields).toEqual(before);
    const unused = store.addEntityField();
    expect(store.removeEntityField(unused.id)).toBe(true);
    expect(store.entityFields.map((field) => field.id)).toEqual(['company']);
  });

  it('keeps fields referenced by table columns, status slots, or conditions', () => {
    const referencedPages = [
      [{
        id: 'table', type: 'Table' as const,
        props: { columns: [{ field: 'company', title: '企业名称' }], dataSourceKey: 'records' }, children: [],
        slots: [{ name: 'bodyCell' as const, field: 'company', cases: [{ equals: '企业', label: '企业', color: 'default' as const }] }]
      }],
      [{ id: 'button', type: 'Button' as const, props: { label: '查看' }, children: [], slots: [], condition: { fieldId: 'company', equals: '企业' } }]
    ];
    for (const nodes of referencedPages) {
      store = createDesignStore({ dsl: { ...page(), nodes }, entityFields: fields });
      expect(store.removeEntityField('company')).toBe(false);
      expect(store.entityFields).toHaveLength(1);
    }
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

  it('preserves invalid Monaco source and diagnostics across canvas mutations', () => {
    const invalid = '{\n  "schemaVersion": 1,\n  "nodes": [';
    store.applyJsonEdit(invalid);
    const diagnostics = store.diagnostics.value;
    expect(store.addNode('Button', null, 1).ok).toBe(true);
    expect(store.source.value).toBe(invalid);
    expect(store.diagnostics.value).toBe(diagnostics);
    expect(store.dsl.value.nodes.map((node) => node.type)).toEqual(['Card', 'Button']);
  });

  it('preserves a pending Monaco buffer across canvas mutations', () => {
    const pending = JSON.stringify({ ...page(), title: '尚未提交的标题' }, null, 2);
    store.updateSourceBuffer(pending);
    expect(store.addNode('Button', null, 1).ok).toBe(true);
    expect(store.dsl.value.title).toBe('尚未提交的标题');
    expect(store.dsl.value.nodes.map((node) => node.type)).toEqual(['Card', 'Button']);
    expect(JSON.parse(store.source.value)).toMatchObject({ title: '尚未提交的标题', nodes: [expect.anything(), expect.objectContaining({ type: 'Button' })] });
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

  it('moves existing nodes into supported containers and PageHeader tags without allowing cycles', () => {
    const nested = {
      ...page(),
      nodes: [
        { id: 'card', type: 'Card' as const, props: { title: '卡片' }, slots: [], children: [{ id: 'row', type: 'Row' as const, props: {}, slots: [], children: [] }] },
        { id: 'form', type: 'Form' as const, props: {}, slots: [], children: [] },
        { id: 'button', type: 'Button' as const, props: { label: '提交' }, slots: [], children: [] },
        { id: 'header', type: 'PageHeader' as const, props: { title: '页头' }, slots: [], children: [] },
        { id: 'tag', type: 'Tag' as const, props: { text: '状态' }, slots: [], children: [] }
      ]
    };
    store = createDesignStore({ dsl: nested, entityFields: fields });
    expect(store.moveNode('button', 'card', 1)).toBe(true);
    expect(store.moveNode('button', 'form', 0)).toBe(true);
    expect(store.moveNode('button', 'row', 0)).toBe(true);
    expect(store.moveNode('tag', 'header', 0)).toBe(true);
    expect(store.moveNode('card', 'row', 0)).toBe(false);
    expect(store.dsl.value.nodes.find((node) => node.id === 'card')?.children[0]?.children[0]?.id).toBe('button');
    const header = store.dsl.value.nodes.find((node) => node.id === 'header');
    expect(header?.slots[0]).toMatchObject({ name: 'tags', children: [expect.objectContaining({ id: 'tag' })] });
  });
});
