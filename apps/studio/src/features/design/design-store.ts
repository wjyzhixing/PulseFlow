import { computed, readonly, shallowRef, type ComputedRef, type DeepReadonly, type Ref } from 'vue';
import { validatePageDsl, type ComponentType, type FieldRule } from '@pulseflow/ui-dsl';
import { jsonParseDiagnostic, schemaDiagnostics, type DesignDiagnostic } from './design-diagnostics';

export type DesignPageDsl = Extract<ReturnType<typeof validatePageDsl>, { ok: true }>['dsl'];
export type DesignNode = DesignPageDsl['nodes'][number];
export type ReadonlyDesignNode = DeepReadonly<DesignNode>;
type PageDsl = DesignPageDsl;
type UiNode = DesignNode;

export type DesignEntityField = NonNullable<Parameters<typeof validatePageDsl>[1]>[number];

export type JsonEditResult =
  | { ok: true; dsl: PageDsl; diagnostics: [] }
  | { ok: false; dsl: PageDsl; diagnostics: DesignDiagnostic[] };

export interface DesignStore {
  dsl: Readonly<Ref<DeepReadonly<PageDsl>>>;
  source: Readonly<Ref<string>>;
  diagnostics: Readonly<Ref<readonly DesignDiagnostic[]>>;
  selectedNodeId: Readonly<Ref<string | null>>;
  selectedNode: ComputedRef<ReadonlyDesignNode | null>;
  entityFields: readonly DesignEntityField[];
  addEntityField(): DesignEntityField;
  updateEntityField(id: string, patch: Partial<Pick<DesignEntityField, 'key' | 'label' | 'type' | 'rules'>>): boolean;
  removeEntityField(id: string): boolean;
  selectNode(nodeId: string | null): void;
  addNode(type: ComponentType, parentId: string | null, index: number): { ok: boolean; nodeId?: string };
  removeNode(nodeId: string): boolean;
  moveNode(nodeId: string, parentId: string | null, index: number): boolean;
  updateNodeProps(nodeId: string, patch: Record<string, unknown>): boolean;
  applyImageAsset(assetId: string, placement: 'inline' | 'background', targetNodeId?: string): boolean;
  removeImageAsset(assetId: string): boolean;
  replaceImageAsset(previousAssetId: string, nextAssetId: string): boolean;
  replaceDraft(dsl: PageDsl, entityFields: readonly DesignEntityField[]): boolean;
  updateSourceBuffer(source: string): void;
  flushSourceBuffer(): JsonEditResult | null;
  applyJsonEdit(source: string): JsonEditResult;
}

export const componentTypes = [
  'Card', 'PageHeader', 'Form', 'FormItem', 'Input', 'Select',
  'Button', 'Table', 'Row', 'Col', 'Tag', 'Badge', 'SiteNavigation',
  'Hero', 'ContentSection', 'FeatureCard', 'MetricCard', 'CallToAction', 'Image'
] as const satisfies readonly ComponentType[];

export const containerTypes = new Set<ComponentType>(['Card', 'Form', 'FormItem', 'Row', 'Col', 'ContentSection']);

const propKeys: Record<ComponentType, readonly string[]> = {
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

function insertNode(nodes: readonly UiNode[], parentId: string | null, index: number, inserted: UiNode): UiNode[] | null {
  if (parentId === null) {
    const next = [...nodes]; next.splice(Math.max(0, Math.min(index, next.length)), 0, inserted); return next;
  }
  let found = false;
  const next = mapNodes(nodes, (node) => {
    if (node.id !== parentId) return node;
    if (node.type === 'PageHeader' && (inserted.type === 'Tag' || inserted.type === 'Badge')) {
      found = true;
      const slots = [...node.slots];
      const tagSlotIndex = slots.findIndex((slot) => slot.name === 'tags');
      if (tagSlotIndex < 0) {
        slots.push({ name: 'tags', children: [inserted] });
      } else {
        const tagSlot = slots[tagSlotIndex];
        if (tagSlot && 'children' in tagSlot) {
          const children = [...tagSlot.children];
          children.splice(Math.max(0, Math.min(index, children.length)), 0, inserted);
          slots[tagSlotIndex] = { ...tagSlot, children };
        }
      }
      return { ...node, slots };
    }
    if (!containerTypes.has(node.type)) return node;
    found = true;
    const children = [...node.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, inserted);
    return { ...node, children };
  });
  return found ? next : null;
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
  const fields = shallowRef((options.entityFields ?? []).map(cloneField));

  const selectedNode = computed<ReadonlyDesignNode | null>(() => selectedNodeId.value
    ? findNode(currentDsl.value.nodes, selectedNodeId.value) as ReadonlyDesignNode | null
    : null);

  function commit(candidate: PageDsl): boolean {
    const validated = validatePageDsl(candidate, fields.value);
    if (!validated.ok) return false;
    const canonicalSource = JSON.stringify(validated.dsl, null, 2);
    currentDsl.value = validated.dsl;
    if (!sourceDirty.value) {
      source.value = canonicalSource;
      diagnostics.value = [];
    }
    options.onDslChange?.(validated.dsl, canonicalSource);
    return true;
  }

  function commitFields(candidate: readonly DesignEntityField[]): boolean {
    const copied = candidate.map(cloneField);
    if (!validatePageDsl(currentDsl.value, copied).ok) return false;
    fields.value = copied;
    options.onEntityFieldsChange?.(fields.value.map(cloneField));
    return true;
  }

  function replaceDraft(candidateDsl: PageDsl, candidateFields: readonly DesignEntityField[]): boolean {
    const copiedFields = candidateFields.map(cloneField);
    const validated = validatePageDsl(candidateDsl, copiedFields);
    if (!validated.ok) return false;
    const canonicalSource = JSON.stringify(validated.dsl, null, 2);
    fields.value = copiedFields;
    currentDsl.value = validated.dsl;
    source.value = canonicalSource;
    diagnostics.value = [];
    sourceDirty.value = false;
    sourcePending.value = false;
    selectedNodeId.value = null;
    options.onDraftChange?.(validated.dsl, canonicalSource, copiedFields.map(cloneField));
    return true;
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

  function addNode(type: ComponentType, parentId: string | null, index: number): { ok: boolean; nodeId?: string } {
    flushSourceBuffer();
    if (!componentTypes.includes(type)) throw new Error(`Unsupported component: ${String(type)}`);
    const ids = collectIds(currentDsl.value.nodes);
    const base = type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    let suffix = 1; while (ids.has(`${base}-${suffix}`)) suffix += 1;
    const props = type === 'ContentSection'
      ? { ...defaultProps(type, fields.value), sectionId: `section-${suffix}` }
      : defaultProps(type, fields.value);
    const node: UiNode = { id: `${base}-${suffix}`, type, props, children: [], slots: [] };
    const nodes = insertNode(currentDsl.value.nodes, parentId, index, node);
    if (!nodes || !commit({ ...currentDsl.value, nodes })) return { ok: false };
    selectedNodeId.value = node.id;
    return { ok: true, nodeId: node.id };
  }

  function removeNode(nodeId: string): boolean {
    flushSourceBuffer();
    const result = detachNode(currentDsl.value.nodes, nodeId);
    if (!result.detached || !commit({ ...currentDsl.value, nodes: result.nodes })) return false;
    if (selectedNodeId.value && containsNode(result.detached, selectedNodeId.value)) selectedNodeId.value = null;
    return true;
  }

  function moveNode(nodeId: string, parentId: string | null, index: number): boolean {
    flushSourceBuffer();
    const moving = findNode(currentDsl.value.nodes, nodeId);
    if (!moving || (parentId !== null && containsNode(moving, parentId))) return false;
    const detached = detachNode(currentDsl.value.nodes, nodeId);
    if (!detached.detached) return false;
    const nodes = insertNode(detached.nodes, parentId, index, detached.detached);
    return nodes ? commit({ ...currentDsl.value, nodes }) : false;
  }

  function updateNodeProps(nodeId: string, patch: Record<string, unknown>): boolean {
    flushSourceBuffer();
    const node = findNode(currentDsl.value.nodes, nodeId);
    if (!node || Object.keys(patch).some((key) => !propKeys[node.type].includes(key))) return false;
    let found = false;
    const nodes = mapNodes(currentDsl.value.nodes, (item) => {
      if (item.id !== nodeId) return item;
      found = true; return { ...item, props: { ...item.props, ...patch } };
    });
    return found && commit({ ...currentDsl.value, nodes });
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
        const { backgroundAssetId: _asset, backgroundOverlay: _overlay, ...props } = node.props;
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
    currentDsl.value = validated.dsl;
    diagnostics.value = [];
    sourceDirty.value = false;
    if (selectedNodeId.value && !findNode(validated.dsl.nodes, selectedNodeId.value)) selectedNodeId.value = null;
    options.onDslChange?.(validated.dsl, nextSource);
    return { ok: true, dsl: validated.dsl, diagnostics: [] };
  }

  function flushSourceBuffer(): JsonEditResult | null {
    return sourceDirty.value && sourcePending.value ? applyJsonEdit(source.value) : null;
  }

  return {
    dsl: readonly(currentDsl), source: readonly(source), diagnostics: readonly(diagnostics),
    selectedNodeId: readonly(selectedNodeId), selectedNode,
    get entityFields() { return fields.value.map(cloneField); },
    addEntityField, updateEntityField, removeEntityField,
    selectNode(nodeId) { selectedNodeId.value = nodeId && findNode(currentDsl.value.nodes, nodeId) ? nodeId : null; },
    addNode, removeNode, moveNode, updateNodeProps, applyImageAsset, removeImageAsset, replaceImageAsset, replaceDraft,
    updateSourceBuffer(nextSource) { source.value = nextSource; sourceDirty.value = true; sourcePending.value = true; },
    flushSourceBuffer,
    applyJsonEdit
  };
}
