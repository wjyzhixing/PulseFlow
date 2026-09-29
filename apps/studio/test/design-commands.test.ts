import { describe, expect, it } from 'vitest';
import type { PageDsl, UiNode } from '@pulseflow/ui-dsl';
import { canDropNode, copyNodesCommand, insertNodeCommand, moveNodeCommand, pasteNodesCommand, relativeDropTarget } from '../src/features/design/design-commands';

const page: PageDsl = {
  schemaVersion: 1,
  pageId: 'drop-test',
  title: '拖放测试',
  nodes: [
    { id: 'first', type: 'Button', props: { label: '提交' }, children: [], slots: [] },
    { id: 'card', type: 'Card', props: { title: '内容' }, children: [], slots: [] },
    { id: 'header', type: 'PageHeader', props: { title: '订单' }, children: [], slots: [] },
    { id: 'tag', type: 'Tag', props: { text: '进行中' }, children: [], slots: [] },
    { id: 'outer', type: 'Card', props: { title: '外层' }, children: [
      { id: 'inner', type: 'Card', props: { title: '内层' }, children: [], slots: [] }
    ], slots: [] }
  ]
};

describe('designer drop commands', () => {
  it('moves root siblings into a new order without mutating the source DSL', () => {
    const source = structuredClone(page);
    const result = moveNodeCommand(page, 'first', { parentId: null, index: 2 });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.dsl.nodes.map((node) => node.id)).toEqual(['card', 'first', 'header', 'tag', 'outer']);
    expect(page).toEqual(source);
    expect(result.dsl).not.toBe(page);
  });

  it('inserts into a supported container and the PageHeader tags slot', () => {
    const child = moveNodeCommand(page, 'first', { parentId: 'card', index: 0 });
    const tag = moveNodeCommand(page, 'tag', { parentId: 'header', slotName: 'tags', index: 0 });
    expect(child.ok && child.dsl.nodes.find((node) => node.id === 'card')?.children[0]?.id).toBe('first');
    expect(tag.ok && tag.dsl.nodes.find((node) => node.id === 'header')?.slots[0]).toMatchObject({ name: 'tags', children: [{ id: 'tag' }] });
  });

  it('inserts new components immutably and rejects unsupported insertion targets', () => {
    const component: UiNode = { id: 'new-card', type: 'Card', props: { title: '新卡片' }, children: [], slots: [] };
    const inserted = insertNodeCommand(page, component, { parentId: null, index: 1 });
    expect(inserted.ok && inserted.dsl.nodes.map((node) => node.id)).toEqual(['first', 'new-card', 'card', 'header', 'tag', 'outer']);
    expect(page.nodes.map((node) => node.id)).toEqual(['first', 'card', 'header', 'tag', 'outer']);
    expect(insertNodeCommand(page, component, { parentId: 'first', index: 0 })).toMatchObject({ ok: false, code: 'drop.parent.unsupported' });
    expect(insertNodeCommand(page, component, { parentId: null, index: 8 })).toMatchObject({ ok: false, code: 'drop.index.invalid' });
    expect(insertNodeCommand(page, component, { parentId: 'header', index: 0 })).toMatchObject({ ok: false, code: 'drop.child.unsupported' });
  });

  it('allows only status components in the PageHeader tags slot for palette insertion', () => {
    const tag: UiNode = { id: 'new-tag', type: 'Tag', props: { text: '草稿' }, children: [], slots: [] };
    const result = insertNodeCommand(page, tag, { parentId: 'header', index: 0, slotName: 'tags' });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.dsl.nodes.find((node) => node.id === 'header')?.slots[0]).toMatchObject({
      name: 'tags', children: [{ id: 'new-tag' }]
    });
  });

  it('rejects missing nodes, invalid parents, unsupported slots, and descendant cycles with reasons', () => {
    expect(canDropNode(page, 'missing', { parentId: null, index: 0 })).toMatchObject({ allowed: false, code: 'node.missing' });
    expect(canDropNode(page, 'first', { parentId: 'missing', index: 0 })).toMatchObject({ allowed: false, code: 'drop.parent.missing' });
    expect(canDropNode(page, 'first', { parentId: 'first', index: 0 })).toMatchObject({ allowed: false, code: 'drop.cycle' });
    expect(canDropNode(page, 'first', { parentId: 'first', index: 0, slotName: 'tags' })).toMatchObject({ allowed: false, code: 'drop.slot.unsupported' });
    expect(canDropNode(page, 'outer', { parentId: 'inner', index: 0 })).toMatchObject({ allowed: false, code: 'drop.cycle' });
    expect(canDropNode(page, 'first', { parentId: 'tag', index: 0 })).toMatchObject({ allowed: false, code: 'drop.parent.unsupported' });
    expect(canDropNode(page, 'first', { parentId: null, index: -1 })).toMatchObject({ allowed: false, code: 'drop.index.invalid' });
    expect(canDropNode(page, 'first', { parentId: null, index: 100 })).toMatchObject({ allowed: false, code: 'drop.index.invalid' });
    expect(canDropNode(page, 'first', { parentId: 'header', index: 0 })).toMatchObject({ allowed: false, code: 'drop.child.unsupported' });
    expect(canDropNode(page, 'tag', { parentId: 'header', index: 0, slotName: 'other' as never })).toMatchObject({ allowed: false, code: 'drop.slot.unsupported' });
    expect(canDropNode({ invalid: true }, 'first', { parentId: null, index: 0 })).toMatchObject({ allowed: false, code: 'dsl.invalid' });
  });

  it('resolves before and after targets with correct same-sibling index adjustment', () => {
    expect(relativeDropTarget(page, 'first', 'card', 'after')).toEqual({ parentId: null, index: 1 });
    expect(relativeDropTarget(page, 'card', 'first', 'after')).toEqual({ parentId: null, index: 1 });
    expect(relativeDropTarget(page, 'first', 'inner', 'before')).toEqual({ parentId: 'outer', index: 0 });
    expect(relativeDropTarget(page, 'first', 'first', 'before')).toBeNull();
    expect(relativeDropTarget(page, 'missing', 'first', 'before')).toBeNull();
    expect(relativeDropTarget({ invalid: true }, 'first', 'card', 'before')).toBeNull();
  });

  it('rejects duplicate, missing-parent, and unsupported-slot insertions', () => {
    const duplicate = { id: 'first', type: 'Button' as const, props: { label: 'Duplicate' }, children: [], slots: [] };
    const tag: UiNode = { id: 'new-tag', type: 'Tag', props: { text: '草稿' }, children: [], slots: [] };
    expect(insertNodeCommand(page, duplicate, { parentId: null, index: 0 })).toMatchObject({ ok: false, code: 'node.duplicate' });
    expect(insertNodeCommand(page, tag, { parentId: 'missing', index: 0 })).toMatchObject({ ok: false, code: 'drop.parent.missing' });
    expect(insertNodeCommand(page, tag, { parentId: 'card', index: 0, slotName: 'tags' })).toMatchObject({ ok: false, code: 'drop.slot.unsupported' });
    expect(insertNodeCommand({ invalid: true }, tag, { parentId: null, index: 0 })).toMatchObject({ ok: false, code: 'dsl.invalid' });
  });

  it('copies selected top-level layers with their parent location and full child tree', () => {
    const source = structuredClone(page);
    const copied = copyNodesCommand(page, ['outer', 'inner']);

    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ parentId: null, index: 4, node: { id: 'outer', children: [{ id: 'inner' }] } });
    expect(page).toEqual(source);
  });

  it('pastes copied layers beside their source with new IDs and an offset position', () => {
    const source = structuredClone(page);
    source.nodes[4] = {
      ...source.nodes[4]!,
      design: { position: { mode: 'absolute', x: 32, y: 48 }, size: { width: 320, height: 240 } }
    };
    const copied = copyNodesCommand(source, ['outer']);
    const result = pasteNodesCommand(source, copied);

    expect(result).toMatchObject({ ok: true, nodeIds: ['outer-copy'] });
    if (!result.ok) return;
    expect(result.dsl.nodes.map((node) => node.id)).toEqual(['first', 'card', 'header', 'tag', 'outer', 'outer-copy']);
    expect(result.dsl.nodes[5]?.design?.position).toEqual({ mode: 'absolute', x: 48, y: 64 });
    expect(result.dsl.nodes[5]?.children[0]?.id).toBe('inner-copy');
    expect(source).not.toEqual(result.dsl);
  });

  it('remaps copied section identifiers and matching action references together', () => {
    const source: PageDsl = {
      schemaVersion: 1, pageId: 'copy-sections', title: '页面', nodes: [
        { id: 'section', type: 'ContentSection', props: { sectionId: 'overview', title: '介绍', tone: 'default' }, children: [], slots: [] },
        { id: 'action', type: 'CallToAction', props: { title: '联系', actionLabel: '开始', targetSectionId: 'overview' }, children: [], slots: [] }
      ]
    };
    const copied = copyNodesCommand(source, ['section', 'action']);
    const result = pasteNodesCommand(source, copied);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dsl.nodes[1]?.props.sectionId).not.toBe('overview');
    expect(result.dsl.nodes[3]?.props.targetSectionId).toBe(result.dsl.nodes[1]?.props.sectionId);
  });

  it('rejects a copied node tree that would make the page invalid without changing the source', () => {
    const source = structuredClone(page);
    const copied = copyNodesCommand(page, ['outer']);
    const invalid = [{ ...copied[0]!, node: { ...copied[0]!.node, props: { title: '<script>bad</script>' } } }];

    expect(pasteNodesCommand(page, invalid)).toMatchObject({ ok: false, code: 'paste.dsl.invalid' });
    expect(page).toEqual(source);
  });
});
