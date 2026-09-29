import { computed, readonly, shallowRef, type ComputedRef, type DeepReadonly, type Ref } from 'vue';
import { nodeDesignSchema, validatePageDsl, type ComponentType, type FieldRule, type NodeDesign } from '@pulseflow/ui-dsl';
import { jsonParseDiagnostic, schemaDiagnostics, type DesignDiagnostic } from './design-diagnostics';
import { autoLayoutNodesCommand, copyNodesCommand, duplicateFlowNodesCommand, groupNodesCommand, hasLockedAncestor, insertNodeCommand, isDesignNodeLocked, moveNodeCommand, moveNodesToParentCommand, pasteNodesCommand, reorderFlowNodesCommand, ungroupNodeCommand, type GroupNodeGeometry, type NodeClipboardEntry, type NodeDropTarget } from './design-commands';
import { createDesignHistory, type DesignHistorySnapshot } from './use-design-history';

export type DesignPageDsl = Extract<ReturnType<typeof validatePageDsl>, { ok: true }>['dsl'];
export type DesignNode = DesignPageDsl['nodes'][number];
export type ReadonlyDesignNode = DeepReadonly<DesignNode>;
type PageDsl = DesignPageDsl;
type UiNode = DesignNode;

export type DesignEntityField = NonNullable<Parameters<typeof validatePageDsl>[1]>[number];

export type JsonEditResult =
  | { ok: true; dsl: PageDsl; diagnostics: [] }
  | { ok: false; dsl: PageDsl; diagnostics: DesignDiagnostic[] };

export type NodeAlignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';
export type NodeAlignmentBounds = Partial<{ nodeWidth: number; nodeHeight: number; parentWidth: number; parentHeight: number }>;
export type NodePasteResult = { ok: true; nodeIds: string[] } | { ok: false; reason: string };
export type NodeGroupResult = { ok: true; groupId: string; nodeIds: string[] } | { ok: false; reason: string };
export type DesignShapeType = 'rectangle' | 'ellipse' | 'line';

export interface DesignStore {
  dsl: Readonly<Ref<DeepReadonly<PageDsl>>>;
  source: Readonly<Ref<string>>;
  diagnostics: Readonly<Ref<readonly DesignDiagnostic[]>>;
  selectedNodeId: Readonly<Ref<string | null>>;
  selectedNodeIds: Readonly<Ref<readonly string[]>>;
  selectedNode: ComputedRef<ReadonlyDesignNode | null>;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  undo(): boolean;
  redo(): boolean;
  entityFields: readonly DesignEntityField[];
  addEntityField(): DesignEntityField;
  updateEntityField(id: string, patch: Partial<Pick<DesignEntityField, 'key' | 'label' | 'type' | 'rules'>>): boolean;
  removeEntityField(id: string): boolean;
  selectNode(nodeId: string | null, additive?: boolean): void;
  selectNodes(nodeIds: readonly string[], mode?: 'replace' | 'add' | 'toggle'): void;
  updatePage(patch: Partial<Pick<PageDsl, 'title' | 'pageKind' | 'theme'>>): boolean;
  addNode(type: ComponentType, parentId: string | null, index: number, design?: Partial<NodeDesign>, shape?: DesignShapeType): { ok: boolean; nodeId?: string; reason?: string };
  addNodeToTarget(type: ComponentType, target: NodeDropTarget, design?: Partial<NodeDesign>, shape?: DesignShapeType): { ok: boolean; nodeId?: string; reason?: string };
  insertImageAsset(assetId: string, alt: string, target: NodeDropTarget, position: NonNullable<NodeDesign['position']>): { ok: boolean; nodeId?: string; reason?: string };
  removeNode(nodeId: string): boolean;
  removeNodes(nodeIds: readonly string[]): boolean;
  copyNodes(nodeIds: readonly string[]): NodeClipboardEntry[];
  pasteNodes(entries: readonly NodeClipboardEntry[]): NodePasteResult;
  duplicateNodes(nodeIds: readonly string[]): NodePasteResult;
  duplicateNodesAt(updates: readonly { nodeId: string; position: NonNullable<NodeDesign['position']> }[]): NodePasteResult;
  groupNodes(nodeIds: readonly string[], geometries?: readonly GroupNodeGeometry[]): NodeGroupResult;
  autoLayoutNodes(nodeIds: readonly string[], geometries?: readonly GroupNodeGeometry[]): NodeGroupResult;
  ungroupNode(nodeId: string): NodeGroupResult;
  moveNode(nodeId: string, parentId: string | null, index: number): boolean;
  moveNodeToTarget(nodeId: string, target: NodeDropTarget): { ok: boolean; reason?: string };
  moveNodesToParent(nodeIds: readonly string[], parentId: string, positions: readonly { nodeId: string; position: NonNullable<NodeDesign['position']> }[]): { ok: boolean; reason?: string };
  reorderFlowNodes(nodeIds: readonly string[], target: NodeDropTarget): { ok: boolean; reason?: string };
  duplicateFlowNodesAt(nodeIds: readonly string[], target: NodeDropTarget): NodePasteResult;
  updateNodeProps(nodeId: string, patch: Record<string, unknown>): boolean;
  updateNodeDesign(nodeId: string, patch: Partial<NodeDesign>): boolean;
  updateNodesDesign(updates: readonly { nodeId: string; patch: Partial<NodeDesign> }[]): boolean;
  alignNode(nodeId: string, alignment: NodeAlignment, bounds?: NodeAlignmentBounds): boolean;
  applyImageAsset(assetId: string, placement: 'inline' | 'background', targetNodeId?: string): boolean;
  removeImageAsset(assetId: string): boolean;
  replaceImageAsset(previousAssetId: string, nextAssetId: string): boolean;
  replaceDraft(dsl: PageDsl, entityFields: readonly DesignEntityField[], selectionAfterReplace?: readonly string[]): boolean;
  updateSourceBuffer(source: string): void;
  flushSourceBuffer(): JsonEditResult | null;
  applyJsonEdit(source: string): JsonEditResult;
}

export const componentTypes = [
  'Frame', 'Text', 'Shape',
  'Card', 'PageHeader', 'Form', 'FormItem', 'Input', 'Select',
  'Button', 'Table', 'Row', 'Col', 'Tag', 'Badge', 'SiteNavigation',
  'Hero', 'ContentSection', 'FeatureCard', 'MetricCard', 'CallToAction', 'Image'
] as const satisfies readonly ComponentType[];

export const containerTypes = new Set<ComponentType>(['Frame', 'Card', 'Form', 'FormItem', 'Row', 'Col', 'ContentSection']);

const propKeys: Record<ComponentType, readonly string[]> = {
  Frame: ['name', 'direction', 'gap', 'padding', 'clipContent', 'alignItems', 'justifyContent'], Text: ['text'], Shape: ['shape'],
  Card: ['title'], PageHeader: ['title', 'subtitle'], Form: ['layout'], FormItem: ['fieldId', 'label'],
  Input: ['placeholder', 'disabled'], Select: ['options', 'placeholder'], Button: ['label', 'variant', 'event'],
  Table: ['columns', 'dataSourceKey'], Row: ['gutter'], Col: ['span'], Tag: ['text', 'color'], Badge: ['text', 'status'],
  SiteNavigation: ['brand', 'links'], Hero: ['eyebrow', 'title', 'subtitle', 'primaryLabel', 'primarySectionId', 'secondaryLabel', 'secondarySectionId', 'backgroundAssetId', 'backgroundOverlay'],
  ContentSection: ['sectionId', 'title', 'description', 'tone', 'backgroundAssetId', 'backgroundOverlay'], FeatureCard: ['title', 'description', 'icon'],
  MetricCard: ['label', 'value', 'trend', 'tone'], CallToAction: ['title', 'description', 'actionLabel', 'targetSectionId'],
  Image: ['assetId', 'alt', 'fit', 'aspectRatio']
};

function defaultProps(type: ComponentType, fields: readonly DesignEntityField[]): Record<string, unknown> {
  const field = fields[0]?.id ?? 'field';
  const defaults: Record<ComponentType, Record<string, unknown>> = {
    Frame: { name: '新建画框', direction: 'column', gap: 12, padding: 24, clipContent: true, alignItems: 'stretch', justifyContent: 'start' },
    Text: { text: '双击编辑文字' }, Shape: { shape: 'rectangle' },
    Card: { title: '新卡片' }, PageHeader: { title: '页面标题' }, Form: { layout: 'vertical' },
    FormItem: { fieldId: field, label: fields[0]?.label ?? '字段' }, Input: { placeholder: '请输入' },
    Select: { options: [], placeholder: '请选择' }, Button: { label: '按钮', variant: 'primary' },
    Table: { columns: [{ field, title: fields[0]?.label ?? '字段' }], dataSourceKey: 'records' },
    Row: { gutter: 16 }, Col: { span: 12 }, Tag: { text: '标签', color: 'default' }, Badge: { text: '状态', status: 'default' },
    SiteNavigation: { brand: 'PulseFlow', links: [] },
    Hero: { eyebrow: '企业服务平台', title: '让业务协作更简单', subtitle: '以清晰的信息和可靠的流程，帮助团队专注重要工作。' },
    ContentSection: { sectionId: 'overview', title: '核心能力', description: '围绕团队日常工作构建稳定、清晰的业务体验。', tone: 'default' },
    FeatureCard: { title: '协同工作流', description: '让关键任务在团队之间顺畅流转。', icon: 'workflow' },
    MetricCard: { label: '本月处理量', value: '1,280', trend: '较上月增长 12%', tone: 'default' },
    CallToAction: { title: '开始与我们沟通', description: '了解适合团队的服务方案。', actionLabel: '预约咨询', targetSectionId: 'overview' },
    Image: { assetId: 'asset-workflow', alt: '团队工作流示意图', fit: 'cover', aspectRatio: '16:9' }
  };
  return defaults[type];
}

function cloneRule(rule: FieldRule): FieldRule {
  return rule.kind === 'enum' ? { ...rule, values: [...rule.values] } : { ...rule };
}

function cloneField(field: DesignEntityField): DesignEntityField {
  return { ...field, rules: field.rules.map(cloneRule) };
}

function findNode(nodes: readonly UiNode[], nodeId: string): UiNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNode(node.children, nodeId);
    if (child) return child;
    for (const slot of node.slots) {
      if ('children' in slot) {
        const slotted = findNode(slot.children, nodeId);
        if (slotted) return slotted;
      }
    }
  }
  return null;
}

function findParentNode(nodes: readonly UiNode[], nodeId: string, parent: UiNode | null = null): UiNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return parent;
    const childParent = findParentNode(node.children, nodeId, node);
    if (childParent) return childParent;
    for (const slot of node.slots) {
      if (!('children' in slot)) continue;
      const slotParent = findParentNode(slot.children, nodeId, node);
      if (slotParent) return slotParent;
    }
  }
  return null;
}

function mapNodes(nodes: readonly UiNode[], mapper: (node: UiNode) => UiNode | null): UiNode[] {
  return nodes.flatMap((node) => {
    const children = mapNodes(node.children, mapper);
    const slots = node.slots.map((slot) => 'children' in slot ? { ...slot, children: mapNodes(slot.children, mapper) } : { ...slot });
    const mapped = mapper({ ...node, props: { ...node.props }, children, slots });
    return mapped ? [mapped] : [];
  });
}

function containsNode(node: UiNode, nodeId: string): boolean {
  return node.id === nodeId || node.children.some((child) => containsNode(child, nodeId)) ||
    node.slots.some((slot) => 'children' in slot && slot.children.some((child) => containsNode(child, nodeId)));
}

function detachNode(nodes: readonly UiNode[], nodeId: string): { nodes: UiNode[]; detached: UiNode | null } {
  let detached: UiNode | null = null;
  const next = nodes.flatMap((node) => {
    if (node.id === nodeId) { detached = node; return []; }
    const children = detachNode(node.children, nodeId);
    if (children.detached) detached = children.detached;
    const slots = node.slots.map((slot) => {
      if (!('children' in slot)) return { ...slot };
      const result = detachNode(slot.children, nodeId);
      if (result.detached) detached = result.detached;
      return { ...slot, children: result.nodes };
    });
    return [{ ...node, props: { ...node.props }, children: children.nodes, slots }];
  });
  return { nodes: next, detached };
}

function collectIds(nodes: readonly UiNode[], ids = new Set<string>()): Set<string> {
  nodes.forEach((node) => {
    ids.add(node.id); collectIds(node.children, ids);
    node.slots.forEach((slot) => { if ('children' in slot) collectIds(slot.children, ids); });
  });
  return ids;
}

export function createDesignStore(options: {
  dsl: PageDsl;
  entityFields?: readonly DesignEntityField[];
  onDslChange?: (dsl: PageDsl, source: string) => void;
  onEntityFieldsChange?: (fields: readonly DesignEntityField[]) => void;
  onDraftChange?: (dsl: PageDsl, source: string, fields: readonly DesignEntityField[]) => void;
}): DesignStore {
  const initial = validatePageDsl(options.dsl, options.entityFields);
  if (!initial.ok) throw new Error(`Invalid initial PageDsl: ${initial.diagnostics.map((item) => item.path).join(', ')}`);
  const currentDsl = shallowRef<PageDsl>(initial.dsl);
  const source = shallowRef(JSON.stringify(initial.dsl, null, 2));
  const diagnostics = shallowRef<DesignDiagnostic[]>([]);
  const sourceDirty = shallowRef(false);
  const sourcePending = shallowRef(false);
  const selectedNodeId = shallowRef<string | null>(null);
  const selectedNodeIds = shallowRef<string[]>([]);
  const fields = shallowRef((options.entityFields ?? []).map(cloneField));
  const history = createDesignHistory({ dsl: initial.dsl, entityFields: fields.value });

  const selectedNode = computed<ReadonlyDesignNode | null>(() => selectedNodeId.value
    ? findNode(currentDsl.value.nodes, selectedNodeId.value) as ReadonlyDesignNode | null
    : null);

  function setSelection(nodeIds: readonly string[]): void {
    const validIds = [...new Set(nodeIds)].filter((nodeId) => findNode(currentDsl.value.nodes, nodeId));
    const topLevelIds = validIds.filter((nodeId) => !validIds.some((otherId) => {
      if (otherId === nodeId) return false;
      const ancestor = findNode(currentDsl.value.nodes, otherId);
      return Boolean(ancestor && containsNode(ancestor, nodeId));
    }));
    selectedNodeIds.value = topLevelIds;
    selectedNodeId.value = topLevelIds.at(-1) ?? null;
  }

  function commit(candidate: PageDsl, description = '编辑页面', coalesceKey?: string): boolean {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return false;
    const validated = validatePageDsl(candidate, fields.value);
    if (!validated.ok) return false;
    const canonicalSource = JSON.stringify(validated.dsl, null, 2);
    if (!history.commit({ dsl: validated.dsl, entityFields: fields.value }, { description, coalesceKey })) return false;
    currentDsl.value = validated.dsl;
    if (!sourceDirty.value) {
      source.value = canonicalSource;
      diagnostics.value = [];
    }
    options.onDslChange?.(validated.dsl, canonicalSource);
    return true;
  }

  function commitFields(candidate: readonly DesignEntityField[]): boolean {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return false;
    const copied = candidate.map(cloneField);
    if (!validatePageDsl(currentDsl.value, copied).ok) return false;
    if (!history.commit({ dsl: currentDsl.value, entityFields: copied }, { description: '修改数据字段' })) return false;
    fields.value = copied;
    options.onEntityFieldsChange?.(fields.value.map(cloneField));
    return true;
  }

  function replaceDraft(candidateDsl: PageDsl, candidateFields: readonly DesignEntityField[], selectionAfterReplace: readonly string[] = []): boolean {
    const copiedFields = candidateFields.map(cloneField);
    const validated = validatePageDsl(candidateDsl, copiedFields);
    if (!validated.ok) return false;
    const canonicalSource = JSON.stringify(validated.dsl, null, 2);
    const retainedSelection = selectionAfterReplace.filter((nodeId) => findNode(validated.dsl.nodes, nodeId));
    if (!history.commit({ dsl: validated.dsl, entityFields: copiedFields }, { description: '应用页面修改' })) return false;
    fields.value = copiedFields;
    currentDsl.value = validated.dsl;
    source.value = canonicalSource;
    diagnostics.value = [];
    sourceDirty.value = false;
    sourcePending.value = false;
    setSelection(retainedSelection);
    options.onDraftChange?.(validated.dsl, canonicalSource, copiedFields.map(cloneField));
    return true;
  }

  function restoreHistorySnapshot(snapshot: DesignHistorySnapshot): boolean {
    const validated = validatePageDsl(snapshot.dsl, snapshot.entityFields);
    if (!validated.ok) return false;
    const copiedFields = snapshot.entityFields.map(cloneField);
    const canonicalSource = JSON.stringify(validated.dsl, null, 2);
    fields.value = copiedFields;
    currentDsl.value = validated.dsl;
    source.value = canonicalSource;
    diagnostics.value = [];
    sourceDirty.value = false;
    sourcePending.value = false;
    setSelection(selectedNodeIds.value.filter((nodeId) => findNode(validated.dsl.nodes, nodeId)));
    options.onDraftChange?.(validated.dsl, canonicalSource, copiedFields.map(cloneField));
    return true;
  }

  function undo(): boolean {
    const snapshot = history.undo();
    return snapshot ? restoreHistorySnapshot(snapshot) : false;
  }

  function redo(): boolean {
    const snapshot = history.redo();
    return snapshot ? restoreHistorySnapshot(snapshot) : false;
  }

  function addEntityField(): DesignEntityField {
    let suffix = 1;
    while (fields.value.some((field) => field.id === `field-${suffix}` || field.key === `field_${suffix}`)) suffix += 1;
    const field: DesignEntityField = { id: `field-${suffix}`, key: `field_${suffix}`, label: '新字段', type: 'string', rules: [] };
    if (!commitFields([...fields.value, field])) throw new Error('Could not add a valid entity field');
    return cloneField(field);
  }

  function updateEntityField(id: string, patch: Partial<Pick<DesignEntityField, 'key' | 'label' | 'type' | 'rules'>>): boolean {
    const allowedKeys = new Set(['key', 'label', 'type', 'rules']);
    if (Object.keys(patch).some((key) => !allowedKeys.has(key)) || !fields.value.some((field) => field.id === id)) return false;
    const candidate = fields.value.map((field) => field.id === id
      ? { ...field, ...patch, rules: patch.rules?.map(cloneRule) ?? field.rules.map(cloneRule) }
      : cloneField(field));
    return commitFields(candidate);
  }

  function removeEntityField(id: string): boolean {
    if (!fields.value.some((field) => field.id === id)) return false;
    return commitFields(fields.value.filter((field) => field.id !== id));
  }

  function addNode(type: ComponentType, parentId: string | null, index: number, design?: Partial<NodeDesign>, shape?: DesignShapeType): { ok: boolean; nodeId?: string; reason?: string } {
    return addNodeToTarget(type, { parentId, index }, design, shape);
  }

  function addNodeToTarget(type: ComponentType, target: NodeDropTarget, designPatch?: Partial<NodeDesign>, shape?: DesignShapeType): { ok: boolean; nodeId?: string; reason?: string } {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) {
      return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再添加组件。' };
    }
    if (!componentTypes.includes(type)) throw new Error(`Unsupported component: ${String(type)}`);
    if (shape !== undefined && type !== 'Shape') return { ok: false, reason: '只有形状图层可以选择形状类型。' };
    const ids = collectIds(currentDsl.value.nodes);
    const base = type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    let suffix = 1; while (ids.has(`${base}-${suffix}`)) suffix += 1;
    const baseProps = type === 'ContentSection'
      ? { ...defaultProps(type, fields.value), sectionId: `section-${suffix}` }
      : defaultProps(type, fields.value);
    const props = type === 'Shape' && shape ? { ...baseProps, shape } : baseProps;
    const defaultDesign: Partial<Record<ComponentType, NodeDesign>> = {
      Frame: { size: { width: 480, height: 320 }, fill: '#FFFFFF', cornerRadius: 8 },
      Text: { size: { width: 'hug', height: 'hug' }, typography: { fontFamily: 'sans', fontSize: 16, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0, textAlign: 'left', color: '#1F1F1F' } },
      Shape: { size: { width: 160, height: 100 }, fill: '#D9E8FF', cornerRadius: 8 }
    };
    const baseDesign = defaultDesign[type];
    const design: NodeDesign | undefined = designPatch || baseDesign ? {
      ...baseDesign,
      ...designPatch,
      ...((designPatch?.position || baseDesign?.position) ? { position: designPatch?.position ?? baseDesign?.position } : {}),
      ...((designPatch?.size || baseDesign?.size) ? { size: designPatch?.size ?? baseDesign?.size } : {}),
      ...((designPatch?.typography || baseDesign?.typography) ? { typography: { ...baseDesign?.typography, ...designPatch?.typography } } : {})
    } : undefined;
    const node: UiNode = { id: `${base}-${suffix}`, type, props, children: [], slots: [], ...(design ? { design } : {}) };
    const result = insertNodeCommand(currentDsl.value, node, target, fields.value);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!commit(result.dsl)) return { ok: false, reason: '组件添加结果未通过 UI-DSL 校验，请检查目标位置。' };
    setSelection([node.id]);
    return { ok: true, nodeId: node.id };
  }

  function insertImageAsset(assetId: string, alt: string, target: NodeDropTarget, position: NonNullable<NodeDesign['position']>): { ok: boolean; nodeId?: string; reason?: string } {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再添加图片。' };
    if (!/^asset-[A-Za-z0-9_-]+$/.test(assetId)) return { ok: false, reason: '图片素材标识无效。' };
    if (target.parentId && isDesignNodeLocked(currentDsl.value.nodes, target.parentId)) {
      return { ok: false, reason: '目标画框已锁定，无法放入图片。' };
    }
    const ids = collectIds(currentDsl.value.nodes);
    let suffix = 1;
    while (ids.has(`generated-image-${suffix}`)) suffix += 1;
    const node: UiNode = {
      id: `generated-image-${suffix}`,
      type: 'Image',
      props: { assetId, alt: alt.trim().slice(0, 240) || '图片素材', fit: 'cover', aspectRatio: '16:9' },
      design: { position, size: { width: 320, height: 180 } },
      children: [],
      slots: []
    };
    const result = insertNodeCommand(currentDsl.value, node, target, fields.value);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!commit(result.dsl, '放置图片素材')) return { ok: false, reason: '图片图层未通过 UI-DSL 校验，未放入画布。' };
    setSelection([node.id]);
    return { ok: true, nodeId: node.id };
  }

  function removeNode(nodeId: string): boolean {
    return removeNodes([nodeId]);
  }

  function removeNodes(nodeIds: readonly string[]): boolean {
    flushSourceBuffer();
    const selected = [...new Set(nodeIds)].filter((nodeId) => findNode(currentDsl.value.nodes, nodeId));
    const topLevel = selected.filter((nodeId) => !selected.some((otherId) => {
      if (otherId === nodeId) return false;
      const ancestor = findNode(currentDsl.value.nodes, otherId);
      return Boolean(ancestor && containsNode(ancestor, nodeId));
    }));
    if (!topLevel.length) return false;
    if (topLevel.some((nodeId) => isDesignNodeLocked(currentDsl.value.nodes, nodeId))) return false;
    let nodes = currentDsl.value.nodes;
    for (const nodeId of topLevel) {
      const result = detachNode(nodes, nodeId);
      if (!result.detached) return false;
      nodes = result.nodes;
    }
    if (!commit({ ...currentDsl.value, nodes }, topLevel.length > 1 ? '删除多个图层' : '删除图层')) return false;
    setSelection(selectedNodeIds.value.filter((nodeId) => findNode(nodes, nodeId)));
    return true;
  }

  function copyNodes(nodeIds: readonly string[]): NodeClipboardEntry[] {
    return copyNodesCommand(currentDsl.value, nodeIds, fields.value);
  }

  function applyPaste(entries: readonly NodeClipboardEntry[], description: string, offset = 16): NodePasteResult {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再粘贴。' };
    const result = pasteNodesCommand(currentDsl.value, entries, fields.value, offset);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!commit(result.dsl, description)) return { ok: false, reason: '粘贴结果未能加入页面历史。' };
    setSelection(result.nodeIds);
    return { ok: true, nodeIds: result.nodeIds };
  }

  function pasteNodes(entries: readonly NodeClipboardEntry[]): NodePasteResult {
    return applyPaste(entries, '粘贴图层');
  }

  function duplicateNodes(nodeIds: readonly string[]): NodePasteResult {
    const entries = copyNodes(nodeIds);
    if (!entries.length) return { ok: false, reason: '请先选择可复制的图层。' };
    return applyPaste(entries, '重复图层');
  }

  function duplicateNodesAt(updates: readonly { nodeId: string; position: NonNullable<NodeDesign['position']> }[]): NodePasteResult {
    if (!updates.length || new Set(updates.map(({ nodeId }) => nodeId)).size !== updates.length) {
      return { ok: false, reason: '请选择可复制的图层。' };
    }
    const entries = copyNodes(updates.map(({ nodeId }) => nodeId));
    if (entries.length !== updates.length) return { ok: false, reason: '图层已变化，请重新选择后复制。' };
    const positions = new Map(updates.map(({ nodeId, position }) => [nodeId, position]));
    const positionedEntries = entries.map((entry) => ({
      ...entry,
      node: { ...entry.node, design: { ...entry.node.design, position: positions.get(entry.node.id)! } }
    }));
    return applyPaste(positionedEntries, '拖动复制图层', 0);
  }

  function groupNodes(nodeIds: readonly string[], geometries: readonly GroupNodeGeometry[] = []): NodeGroupResult {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再组合。' };
    const groupId = `frame-group-${crypto.randomUUID()}`;
    const result = groupNodesCommand(currentDsl.value, nodeIds, groupId, geometries, fields.value);
    if (!result.ok) return result;
    if (!commit(result.dsl, '组合图层')) return { ok: false, reason: '组合结果未能加入页面历史。' };
    setSelection([result.groupId]);
    return { ok: true, groupId: result.groupId, nodeIds: result.nodeIds };
  }

  function autoLayoutNodes(nodeIds: readonly string[], geometries: readonly GroupNodeGeometry[] = []): NodeGroupResult {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再创建自动布局。' };
    const groupId = `frame-layout-${crypto.randomUUID()}`;
    const result = autoLayoutNodesCommand(currentDsl.value, nodeIds, groupId, geometries, fields.value);
    if (!result.ok) return result;
    if (!commit(result.dsl, '创建自动布局')) return { ok: false, reason: '自动布局结果未能加入页面历史。' };
    setSelection([result.groupId]);
    return { ok: true, groupId: result.groupId, nodeIds: result.nodeIds };
  }

  function ungroupNode(nodeId: string): NodeGroupResult {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再取消组合。' };
    const result = ungroupNodeCommand(currentDsl.value, nodeId, fields.value);
    if (!result.ok) return result;
    if (!commit(result.dsl, '取消组合')) return { ok: false, reason: '取消组合结果未能加入页面历史。' };
    setSelection(result.nodeIds);
    return { ok: true, groupId: result.groupId, nodeIds: result.nodeIds };
  }

  function moveNode(nodeId: string, parentId: string | null, index: number): boolean {
    return moveNodeToTarget(nodeId, { parentId, index }).ok;
  }

  function moveNodeToTarget(nodeId: string, target: NodeDropTarget): { ok: boolean; reason?: string } {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) {
      return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再移动图层。' };
    }
    const result = moveNodeCommand(currentDsl.value, nodeId, target, fields.value);
    if (!result.ok) return { ok: false, reason: result.reason };
    const committed = commit(result.dsl);
    return committed ? { ok: true } : { ok: false, reason: '移动结果未通过 UI-DSL 校验，请检查目标位置。' };
  }

  function moveNodesToParent(nodeIds: readonly string[], parentId: string, positions: readonly { nodeId: string; position: NonNullable<NodeDesign['position']> }[]): { ok: boolean; reason?: string } {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再移动图层。' };
    const result = moveNodesToParentCommand(currentDsl.value, nodeIds, parentId, positions, fields.value);
    if (!result.ok) return { ok: false, reason: result.reason };
    const committed = commit(result.dsl, '拖动画布图层到画框');
    return committed ? { ok: true } : { ok: false, reason: '移动结果未通过 UI-DSL 校验，请检查目标画框。' };
  }

  function reorderFlowNodes(nodeIds: readonly string[], target: NodeDropTarget): { ok: boolean; reason?: string } {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再重排图层。' };
    const result = reorderFlowNodesCommand(currentDsl.value, nodeIds, target, fields.value);
    if (!result.ok) return { ok: false, reason: result.reason };
    const committed = commit(result.dsl);
    return committed ? { ok: true } : { ok: false, reason: '重排结果未通过 UI-DSL 校验，请检查 Frame 结构。' };
  }

  function duplicateFlowNodesAt(nodeIds: readonly string[], target: NodeDropTarget): NodePasteResult {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return { ok: false, reason: '当前 UI-DSL 存在校验错误，请先修复后再复制图层。' };
    const result = duplicateFlowNodesCommand(currentDsl.value, nodeIds, target, fields.value);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!commit(result.dsl, '拖动复制流式图层')) return { ok: false, reason: '副本未能加入页面历史。' };
    setSelection(result.nodeIds);
    return { ok: true, nodeIds: result.nodeIds };
  }

  function updateNodeProps(nodeId: string, patch: Record<string, unknown>): boolean {
    flushSourceBuffer();
    const node = findNode(currentDsl.value.nodes, nodeId);
    if (!node || isDesignNodeLocked(currentDsl.value.nodes, nodeId) || Object.keys(patch).some((key) => !propKeys[node.type].includes(key))) return false;
    let found = false;
    const nodes = mapNodes(currentDsl.value.nodes, (item) => {
      if (item.id !== nodeId) return item;
      found = true; return { ...item, props: { ...item.props, ...patch } };
    });
    return found && commit({ ...currentDsl.value, nodes }, '修改组件内容', `node:${nodeId}:${Object.keys(patch).sort().join(',')}`);
  }

  function updateNodeDesign(nodeId: string, patch: Partial<NodeDesign>): boolean {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return false;
    const node = findNode(currentDsl.value.nodes, nodeId);
    const layerMetadataOnly = Object.keys(patch).every((key) => key === 'locked' || key === 'visible' || key === 'name');
    const mayChangeMetadataOnLockedNode = node?.design?.locked === true && !hasLockedAncestor(currentDsl.value.nodes, nodeId) && layerMetadataOnly;
    if (node && isDesignNodeLocked(currentDsl.value.nodes, nodeId) && !mayChangeMetadataOnLockedNode) return false;
    if (!node || !Object.keys(patch).length || !nodeDesignSchema.safeParse({ ...node.design, ...patch }).success) return false;
    const nextDesign = { ...node.design, ...patch };
    const nodes = mapNodes(currentDsl.value.nodes, (item) => item.id === nodeId ? { ...item, design: nextDesign } : item);
    return commit({ ...currentDsl.value, nodes }, '修改图层样式', `design:${nodeId}:${Object.keys(patch).sort().join(',')}`);
  }

  function updateNodesDesign(updates: readonly { nodeId: string; patch: Partial<NodeDesign> }[]): boolean {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok || !updates.length) return false;
    const byNodeId = new Map<string, Partial<NodeDesign>>();
    for (const { nodeId, patch } of updates) {
      const node = findNode(currentDsl.value.nodes, nodeId);
      if (!node || isDesignNodeLocked(currentDsl.value.nodes, nodeId) || byNodeId.has(nodeId) || !Object.keys(patch).length ||
        !nodeDesignSchema.safeParse({ ...node.design, ...patch }).success) return false;
      byNodeId.set(nodeId, patch);
    }
    const nodes = mapNodes(currentDsl.value.nodes, (node) => {
      const patch = byNodeId.get(node.id);
      return patch ? { ...node, design: { ...node.design, ...patch } } : node;
    });
    return commit({ ...currentDsl.value, nodes }, byNodeId.size > 1 ? '移动多个图层' : '修改图层样式');
  }

  function alignNode(nodeId: string, alignment: NodeAlignment, bounds?: NodeAlignmentBounds): boolean {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return false;
    const node = findNode(currentDsl.value.nodes, nodeId);
    if (!node || isDesignNodeLocked(currentDsl.value.nodes, nodeId)) return false;
    const parent = findParentNode(currentDsl.value.nodes, nodeId);
    if (node.design?.position?.mode !== 'absolute') {
      // Flow children of an auto-layout Frame align on their cross axis. A top-level flow layer is
      // contained by the page itself, so it aligns by becoming absolutely positioned instead.
      if (parent) {
        if (parent.type !== 'Frame') return false;
        const isRow = parent.props.direction === 'row';
        const crossAxisAlignment: NodeDesign['alignSelf'] = isRow
          ? alignment === 'top' ? 'start' : alignment === 'center-y' ? 'center' : alignment === 'bottom' ? 'end' : undefined
          : alignment === 'left' ? 'start' : alignment === 'center-x' ? 'center' : alignment === 'right' ? 'end' : undefined;
        const crossAxisSize = isRow ? node.design?.size?.height : node.design?.size?.width;
        if (crossAxisSize === 'fill') return false;
        return crossAxisAlignment ? updateNodeDesign(nodeId, { alignSelf: crossAxisAlignment }) : false;
      }
    }
    const ownWidth = bounds?.nodeWidth ?? (typeof node.design?.size?.width === 'number' ? node.design.size.width : undefined);
    const ownHeight = bounds?.nodeHeight ?? (typeof node.design?.size?.height === 'number' ? node.design.size.height : undefined);
    const parentWidth = bounds?.parentWidth ?? (typeof parent?.design?.size?.width === 'number' ? parent.design.size.width : parent ? undefined : 1280);
    const parentHeight = bounds?.parentHeight ?? (typeof parent?.design?.size?.height === 'number' ? parent.design.size.height : parent ? undefined : 720);
    const current = node.design?.position ?? { mode: 'absolute' as const, x: 0, y: 0 };
    const position = { mode: 'absolute' as const, x: current.x, y: current.y };
    if (alignment === 'left') position.x = 0;
    if (alignment === 'center-x') {
      if (ownWidth === undefined || parentWidth === undefined) return false;
      position.x = Math.max(0, Math.round((parentWidth - ownWidth) / 2));
    }
    if (alignment === 'right') {
      if (ownWidth === undefined || parentWidth === undefined) return false;
      position.x = Math.max(0, parentWidth - ownWidth);
    }
    if (alignment === 'top') position.y = 0;
    if (alignment === 'center-y') {
      if (ownHeight === undefined || parentHeight === undefined) return false;
      position.y = Math.max(0, Math.round((parentHeight - ownHeight) / 2));
    }
    if (alignment === 'bottom') {
      if (ownHeight === undefined || parentHeight === undefined) return false;
      position.y = Math.max(0, parentHeight - ownHeight);
    }
    return updateNodeDesign(nodeId, { position });
  }

  function updatePage(patch: Partial<Pick<PageDsl, 'title' | 'pageKind' | 'theme'>>): boolean {
    const pendingEdit = flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) return false;
    const allowedKeys = new Set(['title', 'pageKind', 'theme']);
    if (!Object.keys(patch).length || Object.keys(patch).some((key) => !allowedKeys.has(key))) return false;
    const description = patch.title !== undefined ? '修改页面名称' : patch.theme !== undefined ? '修改页面主题' : '修改页面用途';
    const coalesceKey = patch.title !== undefined ? 'page:title' : undefined;
    return commit({ ...currentDsl.value, ...patch }, description, coalesceKey);
  }

  function applyImageAsset(assetId: string, placement: 'inline' | 'background', targetNodeId?: string): boolean {
    flushSourceBuffer();
    if (!/^asset-[A-Za-z0-9_-]+$/.test(assetId)) return false;
    const target = targetNodeId ? findNode(currentDsl.value.nodes, targetNodeId) : null;
    if (targetNodeId && !target) return false;
    if (placement === 'background') {
      if (!target || (target.type !== 'Hero' && target.type !== 'ContentSection')) return false;
      const nodes = mapNodes(currentDsl.value.nodes, (node) => node.id === targetNodeId
        ? { ...node, props: { ...node.props, backgroundAssetId: assetId, backgroundOverlay: node.props.backgroundOverlay ?? 'dark' } }
        : node);
      return commit({ ...currentDsl.value, nodes });
    }
    if (placement !== 'inline') return false;
    if (target?.type === 'Image') return updateNodeProps(target.id, { assetId });
    const ids = collectIds(currentDsl.value.nodes);
    let suffix = 1;
    while (ids.has(`generated-image-${suffix}`)) suffix += 1;
    const image: UiNode = { id: `generated-image-${suffix}`, type: 'Image', props: { assetId, alt: '生成的图片', fit: 'cover', aspectRatio: '16:9' }, children: [], slots: [] };
    if (target?.type === 'ContentSection') {
      const nodes = mapNodes(currentDsl.value.nodes, (node) => node.id === target.id ? { ...node, children: [...node.children, image] } : node);
      return commit({ ...currentDsl.value, nodes });
    }
    const nodes = [...currentDsl.value.nodes];
    const targetIndex = target ? nodes.findIndex((node) => node.id === target.id) : nodes.findIndex((node) => node.type === 'Hero');
    nodes.splice(targetIndex >= 0 ? targetIndex + 1 : nodes.length, 0, image);
    return commit({ ...currentDsl.value, nodes });
  }

  function removeImageAsset(assetId: string): boolean {
    flushSourceBuffer();
    let changed = false;
    const nodes = mapNodes(currentDsl.value.nodes, (node) => {
      if (node.type === 'Image' && node.props.assetId === assetId) { changed = true; return null; }
      if ((node.type === 'Hero' || node.type === 'ContentSection') && node.props.backgroundAssetId === assetId) {
        changed = true;
        const props = Object.fromEntries(
          Object.entries(node.props).filter(([key]) => key !== 'backgroundAssetId' && key !== 'backgroundOverlay'),
        );
        return { ...node, props };
      }
      return node;
    });
    return changed && commit({ ...currentDsl.value, nodes });
  }

  function replaceImageAsset(previousAssetId: string, nextAssetId: string): boolean {
    flushSourceBuffer();
    if (!/^asset-[A-Za-z0-9_-]+$/.test(nextAssetId)) return false;
    let changed = false;
    const nodes = mapNodes(currentDsl.value.nodes, (node) => {
      if (node.type === 'Image' && node.props.assetId === previousAssetId) {
        changed = true;
        return { ...node, props: { ...node.props, assetId: nextAssetId } };
      }
      if ((node.type === 'Hero' || node.type === 'ContentSection') && node.props.backgroundAssetId === previousAssetId) {
        changed = true;
        return { ...node, props: { ...node.props, backgroundAssetId: nextAssetId } };
      }
      return node;
    });
    return changed && commit({ ...currentDsl.value, nodes });
  }

  function applyJsonEdit(nextSource: string): JsonEditResult {
    source.value = nextSource;
    sourceDirty.value = true;
    sourcePending.value = false;
    let parsed: unknown;
    try { parsed = JSON.parse(nextSource) as unknown; }
    catch (error) {
      diagnostics.value = [jsonParseDiagnostic(nextSource, error)];
      return { ok: false, dsl: currentDsl.value, diagnostics: diagnostics.value };
    }
    const validated = validatePageDsl(parsed, fields.value);
    if (!validated.ok) {
      diagnostics.value = schemaDiagnostics(nextSource, validated.diagnostics);
      return { ok: false, dsl: currentDsl.value, diagnostics: diagnostics.value };
    }
    if (!history.commit({ dsl: validated.dsl, entityFields: fields.value }, { description: '编辑 UI-DSL' })) {
      diagnostics.value = [{ code: 'history.invalid', path: '$', severity: 'error', message: '页面内容未能加入撤销记录。', line: 1, col: 1 }];
      return { ok: false, dsl: currentDsl.value, diagnostics: diagnostics.value };
    }
    currentDsl.value = validated.dsl;
    diagnostics.value = [];
    sourceDirty.value = false;
    setSelection(selectedNodeIds.value.filter((nodeId) => findNode(validated.dsl.nodes, nodeId)));
    options.onDslChange?.(validated.dsl, nextSource);
    return { ok: true, dsl: validated.dsl, diagnostics: [] };
  }

  function flushSourceBuffer(): JsonEditResult | null {
    // Only a debounce-pending buffer blocks a canvas mutation. Invalid text that was already
    // applied and reported is kept in the editor while the canvas mutates the last valid DSL.
    return sourceDirty.value && sourcePending.value ? applyJsonEdit(source.value) : null;
  }

  return {
    dsl: readonly(currentDsl), source: readonly(source), diagnostics: readonly(diagnostics),
    selectedNodeId: readonly(selectedNodeId), selectedNodeIds: readonly(selectedNodeIds), selectedNode,
    canUndo: history.canUndo, canRedo: history.canRedo, undo, redo,
    get entityFields() { return fields.value.map(cloneField); },
    addEntityField, updateEntityField, removeEntityField,
    selectNode(nodeId, additive = false) {
      if (!nodeId) { setSelection([]); return; }
      if (!findNode(currentDsl.value.nodes, nodeId)) return;
      setSelection(additive
        ? selectedNodeIds.value.includes(nodeId) ? selectedNodeIds.value.filter((id) => id !== nodeId) : [...selectedNodeIds.value, nodeId]
        : [nodeId]);
    },
    selectNodes(nodeIds, mode = 'replace') {
      const existing = selectedNodeIds.value;
      const validIds = nodeIds.filter((nodeId) => findNode(currentDsl.value.nodes, nodeId));
      if (mode === 'add') setSelection([...existing, ...validIds]);
      else if (mode === 'toggle') {
        const toggledIds = new Set(validIds);
        setSelection([...existing.filter((nodeId) => !toggledIds.has(nodeId)), ...validIds.filter((nodeId) => !existing.includes(nodeId))]);
      } else setSelection(validIds);
    },
    addNode, addNodeToTarget, insertImageAsset, removeNode, removeNodes, copyNodes, pasteNodes, duplicateNodes, duplicateNodesAt, duplicateFlowNodesAt, groupNodes, autoLayoutNodes, ungroupNode, moveNode, moveNodeToTarget, moveNodesToParent, reorderFlowNodes, updateNodeProps, updateNodeDesign, updateNodesDesign, alignNode, updatePage, applyImageAsset, removeImageAsset, replaceImageAsset, replaceDraft,
    updateSourceBuffer(nextSource) { source.value = nextSource; sourceDirty.value = true; sourcePending.value = true; },
    flushSourceBuffer,
    applyJsonEdit
  };
}
