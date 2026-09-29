import { containerComponents, validatePageDsl, type EntityField, type NodeDesign, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';

export interface NodeDropTarget {
  parentId: string | null;
  index: number;
  slotName?: 'tags';
}

export type DropAssessment =
  | { allowed: true; target: NodeDropTarget }
  | { allowed: false; code: string; reason: string };

export type MoveNodeResult =
  | { ok: true; dsl: PageDsl }
  | { ok: false; code: string; reason: string };

interface NodeLocation {
  node: UiNode;
  parentId: string | null;
  index: number;
  slotName?: 'tags';
}

interface LockableNode {
  readonly id: string;
  readonly design?: { readonly locked?: boolean };
  readonly children: readonly LockableNode[];
  readonly slots: readonly (
    | { readonly children: readonly LockableNode[] }
    | { readonly name: string; readonly children?: never }
  )[];
}

export interface NodeClipboardEntry {
  node: UiNode;
  parentId: string | null;
  index: number;
  slotName?: 'tags';
}

export type PasteNodesResult =
  | { ok: true; dsl: PageDsl; nodeIds: string[] }
  | { ok: false; code: string; reason: string };

export type GroupNodesResult =
  | { ok: true; dsl: PageDsl; groupId: string; nodeIds: string[] }
  | { ok: false; reason: string };

export interface GroupNodeGeometry {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentTransform: { a: number; b: number; c: number; d: number };
}

const TAG_COMPONENTS = new Set<UiNode['type']>(['Tag', 'Badge']);

function failure(code: string, reason: string): DropAssessment {
  return { allowed: false, code, reason };
}

function findLocation(nodes: readonly UiNode[], nodeId: string, parentId: string | null = null): NodeLocation | null {
  for (const [index, node] of nodes.entries()) {
    if (node.id === nodeId) return { node, parentId, index };
    const child = findLocation(node.children, nodeId, node.id);
    if (child) return child;
    for (const slot of node.slots) {
      if (!('children' in slot)) continue;
      const slotted = findLocation(slot.children, nodeId, node.id);
      if (slotted) return { ...slotted, slotName: slot.name === 'tags' ? 'tags' : undefined };
    }
  }
  return null;
}

export function isDesignNodeLocked(nodes: readonly LockableNode[], nodeId: string): boolean {
  const visit = (items: readonly LockableNode[], lockedAncestor = false): boolean => items.some((node) => {
    const locked = lockedAncestor || node.design?.locked === true;
    if (node.id === nodeId) return locked;
    return visit(node.children, locked) || node.slots.some((slot) => 'children' in slot && slot.children && visit(slot.children, locked));
  });
  return visit(nodes);
}

export function hasLockedAncestor(nodes: readonly LockableNode[], nodeId: string, lockedAncestor = false): boolean {
  for (const node of nodes) {
    if (node.id === nodeId) return lockedAncestor;
    const locked = lockedAncestor || node.design?.locked === true;
    const childMatch = hasLockedAncestor(node.children, nodeId, locked);
    if (childMatch) return true;
    for (const slot of node.slots) {
      if ('children' in slot && slot.children && hasLockedAncestor(slot.children, nodeId, locked)) return true;
    }
  }
  return false;
}

function cloneNode(node: UiNode): UiNode {
  return {
    ...node,
    props: structuredClone(node.props),
    ...(node.design ? { design: structuredClone(node.design) } : {}),
    children: node.children.map(cloneNode),
    slots: node.slots.map((slot) => 'children' in slot
      ? { ...slot, children: slot.children.map(cloneNode) }
      : structuredClone(slot))
  };
}

function isDescendant(nodes: readonly UiNode[], ancestorId: string, candidateId: string): boolean {
  const ancestor = findLocation(nodes, ancestorId)?.node;
  return Boolean(ancestor && containsNode(ancestor, candidateId) && ancestorId !== candidateId);
}

export function copyNodesCommand(dsl: unknown, nodeIds: readonly string[], entityFields?: readonly EntityField[]): NodeClipboardEntry[] {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return [];
  const requested = [...new Set(nodeIds)].filter((nodeId) => findLocation(validation.dsl.nodes, nodeId));
  const selected = requested.filter((nodeId) => !requested.some((ancestorId) => isDescendant(validation.dsl.nodes, ancestorId, nodeId)));
  return selected.flatMap((nodeId) => {
    const location = findLocation(validation.dsl.nodes, nodeId);
    return location ? [{
      node: cloneNode(location.node), parentId: location.parentId, index: location.index,
      ...(location.slotName ? { slotName: location.slotName } : {})
    }] : [];
  });
}

function collectIdentifiers(nodes: readonly UiNode[], nodeIds: Set<string>, sectionIds: Set<string>): void {
  nodes.forEach((node) => {
    nodeIds.add(node.id);
    if (typeof node.props.sectionId === 'string') sectionIds.add(node.props.sectionId);
    collectIdentifiers(node.children, nodeIds, sectionIds);
    node.slots.forEach((slot) => { if ('children' in slot) collectIdentifiers(slot.children, nodeIds, sectionIds); });
  });
}

function uniqueCopyId(sourceId: string, occupied: Set<string>): string {
  const base = `${sourceId.replace(/-copy(?:-\d+)?$/, '')}-copy`;
  let candidate = base;
  let suffix = 2;
  while (occupied.has(candidate)) candidate = `${base}-${suffix++}`;
  occupied.add(candidate);
  return candidate;
}

function buildCloneMaps(entries: readonly NodeClipboardEntry[], occupiedIds: Set<string>, occupiedSections: Set<string>): {
  nodeIds: Map<string, string>;
  sectionIds: Map<string, string>;
} {
  const nodeIds = new Map<string, string>();
  const sectionIds = new Map<string, string>();
  const visit = (node: UiNode): void => {
    nodeIds.set(node.id, uniqueCopyId(node.id, occupiedIds));
    if (typeof node.props.sectionId === 'string') {
      sectionIds.set(node.props.sectionId, uniqueCopyId(node.props.sectionId, occupiedSections));
    }
    node.children.forEach(visit);
    node.slots.forEach((slot) => { if ('children' in slot) slot.children.forEach(visit); });
  };
  entries.forEach((entry) => visit(entry.node));
  return { nodeIds, sectionIds };
}

const SECTION_REFERENCE_KEYS = new Set(['sectionId', 'targetSectionId', 'primarySectionId', 'secondarySectionId']);

function remapSectionReferences(value: unknown, sectionIds: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapSectionReferences(item, sectionIds));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    SECTION_REFERENCE_KEYS.has(key) && typeof child === 'string'
      ? sectionIds.get(child) ?? child
      : remapSectionReferences(child, sectionIds)
  ]));
}

function cloneForPaste(node: UiNode, nodeIds: ReadonlyMap<string, string>, sectionIds: ReadonlyMap<string, string>): UiNode {
  const cloned = cloneNode(node);
  const props = remapSectionReferences(cloned.props, sectionIds) as Record<string, unknown>;
  const children = cloned.children.map((child) => cloneForPaste(child, nodeIds, sectionIds));
  const slots = cloned.slots.map((slot) => 'children' in slot
    ? { ...slot, children: slot.children.map((child) => cloneForPaste(child, nodeIds, sectionIds)) }
    : structuredClone(slot));
  return { ...cloned, id: nodeIds.get(node.id) ?? cloned.id, props, children, slots };
}

function insertClipboardCopies(
  nodes: readonly UiNode[],
  copies: ReadonlyMap<string, NodeClipboardEntry>,
  clones: ReadonlyMap<string, UiNode>,
  parentId: string | null,
  slotName?: 'tags'
): UiNode[] {
  return nodes.flatMap((node) => {
    const children = insertClipboardCopies(node.children, copies, clones, node.id);
    const slots = node.slots.map((slot) => 'children' in slot
      ? { ...slot, children: insertClipboardCopies(slot.children, copies, clones, node.id, slot.name === 'tags' ? 'tags' : undefined) }
      : { ...slot });
    const next = { ...node, props: { ...node.props }, children, slots };
    const copied = copies.get(node.id);
    const clone = clones.get(node.id);
    return copied && clone && copied.parentId === parentId && copied.slotName === slotName
      ? [next, clone]
      : [next];
  });
}

export function pasteNodesCommand(
  dsl: unknown,
  entries: readonly NodeClipboardEntry[],
  entityFields?: readonly EntityField[],
  offset = 16
): PasteNodesResult {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return { ok: false, code: 'dsl.invalid', reason: '当前页面 DSL 无效，无法粘贴图层。' };
  if (!entries.length) return { ok: false, code: 'paste.empty', reason: '剪贴板中没有可粘贴的图层。' };
  if (!Number.isFinite(offset) || offset < 0 || offset > 256) return { ok: false, code: 'paste.offset.invalid', reason: '粘贴偏移值无效。' };

  const occupiedIds = new Set<string>();
  const occupiedSections = new Set<string>();
  collectIdentifiers(validation.dsl.nodes, occupiedIds, occupiedSections);
  const { nodeIds, sectionIds } = buildCloneMaps(entries, occupiedIds, occupiedSections);
  const clones = new Map(entries.map((entry) => [entry.node.id, cloneForPaste(entry.node, nodeIds, sectionIds)]));
  const positionedClones = new Map([...clones].map(([sourceId, node]) => {
    const position = node.design?.position;
    const nextNode = position?.mode === 'absolute'
      ? { ...node, design: { ...node.design, position: { ...position, x: position.x + offset, y: position.y + offset } } }
      : node;
    return [sourceId, nextNode];
  }));

  const validTargets = new Map<string, NodeClipboardEntry>();
  const rootCopies: UiNode[] = [];
  for (const entry of entries) {
    const source = findLocation(validation.dsl.nodes, entry.node.id);
    const clone = positionedClones.get(entry.node.id);
    const parent = entry.parentId ? findLocation(validation.dsl.nodes, entry.parentId)?.node ?? null : null;
    const target = { parentId: entry.parentId, index: entry.index + 1, ...(entry.slotName ? { slotName: entry.slotName } : {}) };
    const canKeepParent = Boolean(source && source.parentId === entry.parentId && source.slotName === entry.slotName && normalizeTarget(parent, clone!, target));
    if (canKeepParent) validTargets.set(entry.node.id, entry);
    else if (clone) rootCopies.push(clone);
  }

  let nodes = insertClipboardCopies(validation.dsl.nodes, validTargets, positionedClones, null);
  for (const rootCopy of rootCopies) nodes = [...nodes, rootCopy];
  const pasted = validatePageDsl({ ...validation.dsl, nodes }, entityFields);
  if (!pasted.ok) return { ok: false, code: 'paste.dsl.invalid', reason: pasted.diagnostics[0]?.message ?? '粘贴结果未通过 UI-DSL 校验。' };
  return { ok: true, dsl: pasted.dsl, nodeIds: entries.map((entry) => nodeIds.get(entry.node.id) ?? '') };
}

function containsNode(node: UiNode, candidateId: string): boolean {
  return node.id === candidateId || node.children.some((child) => containsNode(child, candidateId)) ||
    node.slots.some((slot) => 'children' in slot && slot.children.some((child) => containsNode(child, candidateId)));
}

function childrenAtParent(nodes: readonly UiNode[], parentId: string | null): readonly UiNode[] | null {
  if (parentId === null) return nodes;
  return findLocation(nodes, parentId)?.node.children ?? null;
}

function replaceChildrenAtParent(nodes: readonly UiNode[], parentId: string | null, children: readonly UiNode[]): UiNode[] {
  if (parentId === null) return [...children];
  return nodes.map((node) => {
    if (node.id === parentId) return { ...node, children: [...children] };
    return {
      ...node,
      children: replaceChildrenAtParent(node.children, parentId, children),
      slots: node.slots.map((slot) => 'children' in slot
        ? { ...slot, children: replaceChildrenAtParent(slot.children, parentId, children) }
        : { ...slot })
    };
  });
}

function replaceNodeById(nodes: readonly UiNode[], nodeId: string, replacement: UiNode): UiNode[] {
  return nodes.map((node) => node.id === nodeId ? replacement : {
    ...node,
    children: replaceNodeById(node.children, nodeId, replacement),
    slots: node.slots.map((slot) => 'children' in slot
      ? { ...slot, children: replaceNodeById(slot.children, nodeId, replacement) }
      : { ...slot })
  });
}

export function groupNodesCommand(dsl: unknown, nodeIds: readonly string[], groupId: string, geometries: readonly GroupNodeGeometry[] = [], entityFields?: readonly EntityField[]): GroupNodesResult {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return { ok: false, reason: '当前页面 DSL 无效，无法组合图层。' };
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length < 2) return { ok: false, reason: '至少选择两个图层才能组合。' };
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(groupId) || findLocation(validation.dsl.nodes, groupId)) {
    return { ok: false, reason: '组合图层标识无效，请重试。' };
  }
  if (uniqueIds.some((nodeId) => isDesignNodeLocked(validation.dsl.nodes, nodeId))) {
    return { ok: false, reason: '锁定图层不能组合，请先解锁。' };
  }
  const locations = uniqueIds.map((nodeId) => findLocation(validation.dsl.nodes, nodeId));
  if (locations.some((location) => !location)) return { ok: false, reason: '所选图层已变化，请重新选择后组合。' };
  const selected = locations.filter((location): location is NodeLocation => Boolean(location));
  const parentId = selected[0]!.parentId;
  if (selected.some((location) => location.parentId !== parentId || location.slotName)) {
    return { ok: false, reason: '只能组合位于同一容器中的图层。' };
  }
  if (parentId && isDesignNodeLocked(validation.dsl.nodes, parentId)) return { ok: false, reason: '父容器已锁定，无法组合其中的图层。' };
  const siblings = childrenAtParent(validation.dsl.nodes, parentId);
  if (!siblings) return { ok: false, reason: '当前容器不支持组合图层。' };
  const ordered = [...selected].sort((left, right) => left.index - right.index);
  const firstIndex = ordered[0]!.index;
  if (ordered.at(-1)!.index - firstIndex + 1 !== ordered.length) {
    return { ok: false, reason: '请先把要组合的图层排列在一起，避免改变未选图层的遮挡顺序。' };
  }
  const nodes = ordered.map((location) => location.node);
  const positionMode = nodes[0]?.design?.position?.mode ?? 'flow';
  if (nodes.some((node) => (node.design?.position?.mode ?? 'flow') !== positionMode || (node.design?.rotation ?? 0) !== 0 || node.design?.flipX || node.design?.flipY)) {
    return { ok: false, reason: '组合图层必须使用相同的定位方式，且尚未旋转或翻转。' };
  }
  const geometryById = new Map(geometries.map((geometry) => [geometry.nodeId, geometry]));
  if (positionMode === 'flow') {
    const parent = parentId ? findLocation(validation.dsl.nodes, parentId)?.node : null;
    const isSimpleFrame = parent?.type === 'Frame' && parent.props.justifyContent !== 'center' && parent.props.justifyContent !== 'end' &&
      parent.props.justifyContent !== 'space-between' && (parent.props.alignItems === undefined || parent.props.alignItems === 'start' || parent.props.alignItems === 'stretch');
    if (!isSimpleFrame) return { ok: false, reason: '流式图层需位于起始对齐的 Frame 中才能组合，以避免网格或自动布局位移。' };
    const flowGeometry = nodes.map((node) => geometryById.get(node.id));
    if (flowGeometry.some((geometry) => !geometry || Math.abs(geometry.parentTransform.a - 1) > 0.001 || Math.abs(geometry.parentTransform.d - 1) > 0.001 || Math.abs(geometry.parentTransform.b) > 0.001 || Math.abs(geometry.parentTransform.c) > 0.001)) {
      return { ok: false, reason: '流式图层的父容器存在旋转或缩放，暂时无法安全组合。' };
    }
  }
  const positions = nodes.map((node) => {
    const position = node.design?.position;
    const measured = geometryById.get(node.id);
    if (position?.mode === 'absolute') return { x: position.x, y: position.y };
    return measured ? { x: measured.x, y: measured.y } : null;
  });
  const sizes = nodes.map((node) => {
    const measured = geometryById.get(node.id);
    return {
      width: typeof node.design?.size?.width === 'number' ? node.design.size.width : measured ? Math.round(measured.width) : undefined,
      height: typeof node.design?.size?.height === 'number' ? node.design.size.height : measured ? Math.round(measured.height) : undefined
    };
  });
  if (positions.some((position) => !position) || sizes.some((size) => typeof size.width !== 'number' || typeof size.height !== 'number' || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 1 || size.height < 1)) {
    return { ok: false, reason: '无法读取全部图层的位置和尺寸，请重新选择后组合。' };
  }
  const measuredPositions = positions as Array<{ x: number; y: number }>;
  const measuredSizes = sizes as Array<{ width: number; height: number }>;
  const left = Math.min(...measuredPositions.map((position) => position.x));
  const top = Math.min(...measuredPositions.map((position) => position.y));
  const right = Math.max(...measuredPositions.map((position, index) => position.x + measuredSizes[index]!.width));
  const bottom = Math.max(...measuredPositions.map((position, index) => position.y + measuredSizes[index]!.height));
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1 || width > 8192 || height > 8192) return { ok: false, reason: '组合后的尺寸超出 UI-DSL 范围。' };
  const groupedChildren = nodes.map((node, index) => ({
    ...node,
    design: {
      ...node.design,
      position: { mode: 'absolute' as const, x: measuredPositions[index]!.x - left, y: measuredPositions[index]!.y - top },
      size: { width: measuredSizes[index]!.width, height: measuredSizes[index]!.height }
    }
  }));
  const group: UiNode = {
    id: groupId,
    type: 'Frame',
    props: { name: '组合', direction: 'column', gap: 0, padding: 0, clipContent: true, alignItems: 'stretch', justifyContent: 'start' },
    children: groupedChildren,
    slots: [],
    design: { position: positionMode === 'absolute' ? { mode: 'absolute', x: left, y: top } : { mode: 'flow', x: 0, y: 0 }, size: { width, height } }
  };
  const nextSiblings = siblings.filter((node) => !uniqueIds.includes(node.id));
  nextSiblings.splice(firstIndex, 0, group);
  const result = validatePageDsl({ ...validation.dsl, nodes: replaceChildrenAtParent(validation.dsl.nodes, parentId, nextSiblings) }, entityFields);
  if (!result.ok) return { ok: false, reason: result.diagnostics[0]?.message ?? '组合结果未通过 UI-DSL 校验。' };
  return { ok: true, dsl: result.dsl, groupId, nodeIds: uniqueIds };
}

export function autoLayoutNodesCommand(dsl: unknown, nodeIds: readonly string[], groupId: string, geometries: readonly GroupNodeGeometry[] = [], entityFields?: readonly EntityField[]): GroupNodesResult {
  if (geometries.length !== nodeIds.length || new Set(geometries.map((geometry) => geometry.nodeId)).size !== nodeIds.length) {
    return { ok: false, reason: '无法读取所有选中图层的位置和尺寸，请重新选择后再创建自动布局。' };
  }
  const grouped = groupNodesCommand(dsl, nodeIds, groupId, geometries, entityFields);
  if (!grouped.ok) return grouped;
  const geometryById = new Map(geometries.map((geometry) => [geometry.nodeId, geometry]));
  const measured = nodeIds.flatMap((nodeId) => {
    const geometry = geometryById.get(nodeId);
    return geometry && [geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite) && geometry.width > 0 && geometry.height > 0
      ? [{ ...geometry, centerX: geometry.x + geometry.width / 2, centerY: geometry.y + geometry.height / 2 }]
      : [];
  });
  if (measured.length !== nodeIds.length) return { ok: false, reason: '选中图层的位置或尺寸无效，自动布局未应用。' };
  const range = (values: readonly number[]) => Math.max(...values) - Math.min(...values);
  const sameRow = range(measured.map(({ centerY }) => centerY)) <= 1;
  const sameColumn = range(measured.map(({ centerX }) => centerX)) <= 1;
  if (!sameRow && !sameColumn) return { ok: false, reason: '自动布局只接受已经对齐成单行或单列的选区；请先对齐图层。' };
  const direction = sameRow && (!sameColumn || range(measured.map(({ centerX }) => centerX)) >= range(measured.map(({ centerY }) => centerY)))
    ? 'row' as const
    : 'column' as const;
  const ordered = [...measured].sort((left, right) => direction === 'row' ? left.x - right.x : left.y - right.y);
  const gaps = ordered.slice(1).map((item, index) => direction === 'row'
    ? item.x - (ordered[index]!.x + ordered[index]!.width)
    : item.y - (ordered[index]!.y + ordered[index]!.height));
  if (gaps.some((gap) => gap < 0 || gap > 256) || range(gaps) > 1) {
    return { ok: false, reason: '图层之间存在重叠或间距不一致；请先整理成等间距单行/单列，再创建自动布局。' };
  }
  const gap = gaps.length ? Math.max(0, Math.min(256, Math.round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length))) : 0;
  const groupedFrame = findLocation(grouped.dsl.nodes, grouped.groupId)?.node;
  if (!groupedFrame || groupedFrame.type !== 'Frame') return { ok: false, reason: '自动布局 Frame 创建失败，页面保持不变。' };
  const groupedChildren = new Map(groupedFrame.children.map((node) => [node.id, node]));
  const children = ordered.flatMap((geometry) => {
    const node = groupedChildren.get(geometry.nodeId);
    if (!node) return [];
    return [{ ...node, design: { ...node.design,
      position: { mode: 'flow' as const, x: 0, y: 0 },
      size: { width: Math.max(1, Math.round(geometry.width)), height: Math.max(1, Math.round(geometry.height)) }
    } }];
  });
  if (children.length !== nodeIds.length) return { ok: false, reason: '部分选中图层无法加入自动布局，页面保持不变。' };
  const frame: UiNode = {
    ...groupedFrame,
    props: { ...groupedFrame.props, direction, gap, padding: 0, alignItems: 'center', justifyContent: 'start' },
    children
  };
  const validation = validatePageDsl({ ...grouped.dsl, nodes: replaceNodeById(grouped.dsl.nodes, grouped.groupId, frame) }, entityFields);
  if (!validation.ok) return { ok: false, reason: validation.diagnostics[0]?.message ?? '自动布局结果未通过 UI-DSL 校验。' };
  return { ...grouped, dsl: validation.dsl };
}

export function ungroupNodeCommand(dsl: unknown, nodeId: string, entityFields?: readonly EntityField[]): GroupNodesResult {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return { ok: false, reason: '当前页面 DSL 无效，无法取消组合。' };
  const location = findLocation(validation.dsl.nodes, nodeId);
  if (!location || location.node.type !== 'Frame') return { ok: false, reason: '请选择一个组合画框后再取消组合。' };
  if (isDesignNodeLocked(validation.dsl.nodes, nodeId)) return { ok: false, reason: '锁定图层不能取消组合，请先解锁。' };
  if (location.slotName || location.parentId && isDesignNodeLocked(validation.dsl.nodes, location.parentId)) {
    return { ok: false, reason: '父容器已锁定或不支持移出子图层。' };
  }
  const framePosition = location.node.design?.position;
  if ((framePosition?.mode !== 'absolute' && framePosition?.mode !== 'flow') || (location.node.design?.rotation ?? 0) !== 0 || location.node.design?.flipX || location.node.design?.flipY ||
    location.node.children.some((child) => child.design?.position?.mode !== 'absolute' || typeof child.design.size?.width !== 'number' || typeof child.design.size?.height !== 'number')) {
    return { ok: false, reason: '只能取消组合未旋转且子图层使用固定尺寸和绝对位置的画框。' };
  }
  if (framePosition.mode === 'flow') {
    const parent = location.parentId ? findLocation(validation.dsl.nodes, location.parentId)?.node : null;
    const isSimpleFrame = parent?.type === 'Frame' && parent.props.justifyContent !== 'center' && parent.props.justifyContent !== 'end' &&
      parent.props.justifyContent !== 'space-between' && (parent.props.alignItems === undefined || parent.props.alignItems === 'start' || parent.props.alignItems === 'stretch');
    if (!isSimpleFrame) return { ok: false, reason: '流式组合需要保留在起始对齐的 Frame 中才能取消组合。' };
  }
  if (location.node.children.some((child) => isDesignNodeLocked([location.node], child.id))) {
    return { ok: false, reason: '组合中含有锁定图层，请先解锁。' };
  }
  const siblings = childrenAtParent(validation.dsl.nodes, location.parentId);
  if (!siblings) return { ok: false, reason: '当前容器不支持取消组合。' };
  const expanded = location.node.children.map((child) => ({
    ...child,
    design: {
      ...child.design,
      position: framePosition.mode === 'absolute'
        ? { mode: 'absolute' as const, x: framePosition.x + child.design!.position!.x, y: framePosition.y + child.design!.position!.y }
        : { mode: 'flow' as const, x: 0, y: 0 }
    }
  }));
  const nextSiblings = [...siblings];
  nextSiblings.splice(location.index, 1, ...expanded);
  const result = validatePageDsl({ ...validation.dsl, nodes: replaceChildrenAtParent(validation.dsl.nodes, location.parentId, nextSiblings) }, entityFields);
  if (!result.ok) return { ok: false, reason: result.diagnostics[0]?.message ?? '取消组合结果未通过 UI-DSL 校验。' };
  return { ok: true, dsl: result.dsl, groupId: nodeId, nodeIds: expanded.map((child) => child.id) };
}

function childrenForTarget(parent: UiNode, slotName?: 'tags'): readonly UiNode[] | null {
  if (slotName === 'tags') {
    if (parent.type !== 'PageHeader') return null;
    const slot = parent.slots.find((candidate) => candidate.name === 'tags');
    return slot && 'children' in slot ? slot.children : [];
  }
  return containerComponents.has(parent.type) ? parent.children : null;
}

function normalizeTarget(parent: UiNode | null, moving: UiNode, target: NodeDropTarget): NodeDropTarget | null {
  if (!parent) return target.parentId === null && !target.slotName ? { ...target } : null;
  if (parent.type === 'PageHeader') {
    if (!TAG_COMPONENTS.has(moving.type) || (target.slotName && target.slotName !== 'tags')) return null;
    return { ...target, slotName: 'tags' };
  }
  if (target.slotName || !containerComponents.has(parent.type)) return null;
  return { ...target };
}

export function canDropNode(dsl: unknown, nodeId: string, target: NodeDropTarget, entityFields?: readonly EntityField[]): DropAssessment {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return failure('dsl.invalid', validation.diagnostics[0]?.message ?? '当前页面 DSL 无效，无法移动图层。');
  const moving = findLocation(validation.dsl.nodes, nodeId);
  if (!moving) return failure('node.missing', '要移动的图层已不存在，请刷新后重试。');
  if (isDesignNodeLocked(validation.dsl.nodes, nodeId)) return failure('node.locked', '锁定的图层或其子图层不能移动，请先解锁。');
  if (!Number.isInteger(target.index) || target.index < 0) return failure('drop.index.invalid', '放置位置无效，请选择有效的图层位置。');
  const parent = target.parentId === null ? null : findLocation(validation.dsl.nodes, target.parentId)?.node ?? null;
  if (target.parentId !== null && !parent) return failure('drop.parent.missing', '目标图层已不存在，请重新选择放置位置。');
  if (parent && isDesignNodeLocked(validation.dsl.nodes, parent.id)) return failure('drop.parent.locked', '不能把图层放入已锁定的容器或其子图层中，请先解锁。');
  if (parent && containsNode(moving.node, parent.id)) {
    if (target.slotName && !normalizeTarget(parent, moving.node, target)) return failure('drop.slot.unsupported', '该图层没有可用的此类插槽。');
    return failure('drop.cycle', '不能把图层放进自身或自己的子图层中。');
  }
  const normalized = normalizeTarget(parent, moving.node, target);
  if (!normalized) {
    if (target.slotName) return failure('drop.slot.unsupported', '该图层没有可用的此类插槽。');
    if (parent?.type === 'PageHeader') return failure('drop.child.unsupported', '页头图层只接受状态标签或状态徽标。');
    return failure('drop.parent.unsupported', '该图层不能包含其他页面对象。');
  }
  const siblings = parent ? childrenForTarget(parent, normalized.slotName) : validation.dsl.nodes;
  if (!siblings) return failure('drop.parent.unsupported', '该图层不能包含其他页面对象。');
  if (target.index > siblings.length) return failure('drop.index.invalid', '放置位置已超出当前图层范围。');
  return { allowed: true, target: normalized };
}

function detachNode(nodes: readonly UiNode[], nodeId: string): { nodes: UiNode[]; detached: UiNode | null } {
  let detached: UiNode | null = null;
  const next = nodes.flatMap((node) => {
    if (node.id === nodeId) { detached = node; return []; }
    const childResult = detachNode(node.children, nodeId);
    if (childResult.detached) detached = childResult.detached;
    const slots = node.slots.map((slot) => {
      if (!('children' in slot)) return { ...slot };
      const slotResult = detachNode(slot.children, nodeId);
      if (slotResult.detached) detached = slotResult.detached;
      return { ...slot, children: slotResult.nodes };
    });
    return [{ ...node, props: { ...node.props }, children: childResult.nodes, slots }];
  });
  return { nodes: next, detached };
}

function insertNode(nodes: readonly UiNode[], target: NodeDropTarget, inserted: UiNode): { nodes: UiNode[]; found: boolean } {
  if (target.parentId === null) {
    const next = [...nodes];
    next.splice(Math.min(target.index, next.length), 0, inserted);
    return { nodes: next, found: true };
  }
  let found = false;
  const next = nodes.map((node) => {
    if (node.id === target.parentId) {
      found = true;
      if (target.slotName === 'tags') {
        const slots = [...node.slots];
        const slotIndex = slots.findIndex((slot) => slot.name === 'tags');
        if (slotIndex < 0) slots.push({ name: 'tags', children: [inserted] });
        else {
          const slot = slots[slotIndex];
          if (slot && 'children' in slot) {
            const children = [...slot.children];
            children.splice(Math.min(target.index, children.length), 0, inserted);
            slots[slotIndex] = { ...slot, children };
          }
        }
        return { ...node, props: { ...node.props }, children: [...node.children], slots };
      }
      const children = [...node.children];
      children.splice(Math.min(target.index, children.length), 0, inserted);
      return { ...node, props: { ...node.props }, children, slots: [...node.slots] };
    }
    const childResult = insertNode(node.children, target, inserted);
    const slots = node.slots.map((slot) => {
      if (!('children' in slot)) return { ...slot };
      const slotResult = insertNode(slot.children, target, inserted);
      if (slotResult.found) found = true;
      return { ...slot, children: slotResult.nodes };
    });
    if (childResult.found) found = true;
    return { ...node, props: { ...node.props }, children: childResult.nodes, slots };
  });
  return { nodes: next, found };
}

export function moveNodeCommand(dsl: unknown, nodeId: string, target: NodeDropTarget, entityFields?: readonly EntityField[], position?: NonNullable<NodeDesign['position']>): MoveNodeResult {
  const assessment = canDropNode(dsl, nodeId, target, entityFields);
  if (!assessment.allowed) return { ok: false, code: assessment.code, reason: assessment.reason };
  const validated = validatePageDsl(dsl, entityFields);
  if (!validated.ok) return { ok: false, code: 'dsl.invalid', reason: '当前页面 DSL 无效，无法移动图层。' };
  const detached = detachNode(validated.dsl.nodes, nodeId);
  if (!detached.detached) return { ok: false, code: 'node.missing', reason: '要移动的图层已不存在，请刷新后重试。' };
  const source = findLocation(validated.dsl.nodes, nodeId);
  const normalizedTarget = assessment.target;
  const adjustedTarget = source && source.parentId === normalizedTarget.parentId && source.slotName === normalizedTarget.slotName && source.index < normalizedTarget.index
    ? { ...normalizedTarget, index: normalizedTarget.index - 1 }
    : normalizedTarget;
  const movedNode = position
    ? { ...detached.detached, design: { ...(detached.detached.design ?? {}), position } }
    : detached.detached;
  const inserted = insertNode(detached.nodes, adjustedTarget, movedNode);
  if (!inserted.found) return { ok: false, code: 'drop.parent.missing', reason: '目标图层已不存在，请重新选择放置位置。' };
  const result = validatePageDsl({ ...validated.dsl, nodes: inserted.nodes }, entityFields);
  if (!result.ok) return { ok: false, code: 'drop.dsl.invalid', reason: result.diagnostics[0]?.message ?? '此位置无法生成有效页面结构。' };
  return { ok: true, dsl: result.dsl };
}

export function moveNodesToParentCommand(
  dsl: unknown,
  nodeIds: readonly string[],
  parentId: string,
  positions: readonly { nodeId: string; position: NonNullable<NodeDesign['position']> }[],
  entityFields?: readonly EntityField[]
): MoveNodeResult {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return { ok: false, code: 'dsl.invalid', reason: '当前页面 DSL 无效，无法移动图层。' };
  const requested = [...new Set(nodeIds)].filter((nodeId) => findLocation(validation.dsl.nodes, nodeId));
  const selected = requested.filter((nodeId) => !requested.some((ancestorId) => ancestorId !== nodeId && isDescendant(validation.dsl.nodes, ancestorId, nodeId)));
  if (!selected.length || positions.some((item) => !requested.includes(item.nodeId)) ||
    new Set(positions.map((item) => item.nodeId)).size !== positions.length || selected.some((nodeId) => !positions.some((item) => item.nodeId === nodeId)) ||
    positions.some(({ position }) => position.mode !== 'absolute' || !Number.isFinite(position.x) || !Number.isFinite(position.y))) {
    return { ok: false, code: 'move.selection.invalid', reason: '选区或新位置已变化，请重新拖动。' };
  }
  const positionsById = new Map(positions.map((item) => [item.nodeId, item.position]));
  let candidate: PageDsl = validation.dsl;
  for (const nodeId of selected) {
    const parent = findLocation(candidate.nodes, parentId)?.node;
    if (parent?.type !== 'Frame') return { ok: false, code: 'drop.parent.unsupported', reason: '目标画框已不存在或不能接收图层。' };
    const result = moveNodeCommand(candidate, nodeId, { parentId, index: parent.children.length }, entityFields, positionsById.get(nodeId));
    if (!result.ok) return result;
    candidate = result.dsl;
  }
  return { ok: true, dsl: candidate };
}

/** Reorders flow nodes or reparents them into another Frame while preserving their order and layout mode. */
export function reorderFlowNodesCommand(dsl: unknown, nodeIds: readonly string[], target: NodeDropTarget, entityFields?: readonly EntityField[]): MoveNodeResult {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return { ok: false, code: 'dsl.invalid', reason: '当前页面 DSL 无效，无法重排图层。' };
  const selectedIds = [...new Set(nodeIds)];
  const locations = selectedIds.map((nodeId) => findLocation(validation.dsl.nodes, nodeId));
  if (!selectedIds.length || locations.some((location) => !location)) {
    return { ok: false, code: 'node.missing', reason: '所选图层已变化，请重新选择后重排。' };
  }
  const selected = locations.filter((location): location is NodeLocation => Boolean(location));
  const sourceParentId = selected[0]!.parentId;
  const sourceParent = sourceParentId ? findLocation(validation.dsl.nodes, sourceParentId)?.node : null;
  const targetParent = target.parentId ? findLocation(validation.dsl.nodes, target.parentId)?.node : null;
  if (!sourceParentId || target.slotName || sourceParent?.type !== 'Frame' || targetParent?.type !== 'Frame' ||
    selected.some((location) => location.parentId !== sourceParentId || location.slotName || location.node.design?.position?.mode === 'absolute') ||
    selected.some(({ node }) => containsNode(node, target.parentId!))) {
    return { ok: false, code: 'flow.reorder.unsupported', reason: '流式图层只能移动到另一个有效 Frame 中。' };
  }
  if (isDesignNodeLocked(validation.dsl.nodes, sourceParentId) || isDesignNodeLocked(validation.dsl.nodes, target.parentId!) ||
    selected.some(({ node }) => isDesignNodeLocked(validation.dsl.nodes, node.id))) {
    return { ok: false, code: 'node.locked', reason: '锁定图层或其父容器不能重排，请先解锁。' };
  }
  const sourceSiblings = childrenAtParent(validation.dsl.nodes, sourceParentId);
  const targetSiblings = target.parentId === sourceParentId ? sourceSiblings : childrenAtParent(validation.dsl.nodes, target.parentId);
  if (!sourceSiblings || !targetSiblings) return { ok: false, code: 'drop.parent.unsupported', reason: '当前 Frame 不支持子图层重排。' };
  const moving = new Set(selectedIds);
  const orderedSelection = sourceSiblings.filter((node) => moving.has(node.id));
  const remaining = sourceSiblings.filter((node) => !moving.has(node.id));
  const sameParent = target.parentId === sourceParentId;
  const destinationSiblings = sameParent ? remaining : targetSiblings;
  if (!Number.isInteger(target.index) || target.index < 0 || target.index > destinationSiblings.length) {
    return { ok: false, code: 'drop.index.invalid', reason: '重排位置无效，请重新拖动图层。' };
  }
  const reordered = [...destinationSiblings];
  reordered.splice(target.index, 0, ...orderedSelection);
  if (sameParent && reordered.every((node, index) => node.id === sourceSiblings[index]?.id)) return { ok: true, dsl: validation.dsl };
  const sourceRemoved = sameParent
    ? validation.dsl.nodes
    : replaceChildrenAtParent(validation.dsl.nodes, sourceParentId, remaining);
  const nextNodes = replaceChildrenAtParent(sourceRemoved, target.parentId, reordered);
  const result = validatePageDsl({ ...validation.dsl, nodes: nextNodes }, entityFields);
  if (!result.ok) return { ok: false, code: 'flow.reorder.dsl.invalid', reason: result.diagnostics[0]?.message ?? '重排结果未通过 UI-DSL 校验。' };
  return { ok: true, dsl: result.dsl };
}

/** Duplicates flow children at a canvas insertion point without converting them to absolute positioning. */
export function duplicateFlowNodesCommand(dsl: unknown, nodeIds: readonly string[], target: NodeDropTarget, entityFields?: readonly EntityField[]): PasteNodesResult {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return { ok: false, code: 'dsl.invalid', reason: '当前页面 DSL 无效，无法复制图层。' };
  if (target.slotName || !target.parentId || !Number.isInteger(target.index) || target.index < 0) {
    return { ok: false, code: 'flow.duplicate.target.invalid', reason: '只能把流式副本放入有效 Frame。' };
  }
  const parent = findLocation(validation.dsl.nodes, target.parentId)?.node;
  const entries = copyNodesCommand(validation.dsl, nodeIds, entityFields);
  if (parent?.type !== 'Frame' || !entries.length || entries.length !== new Set(nodeIds).size ||
    entries.some((entry) => entry.parentId === null || entry.slotName || entry.node.design?.position?.mode === 'absolute' ||
      !findLocation(validation.dsl.nodes, entry.parentId)?.node || findLocation(validation.dsl.nodes, entry.parentId)?.node.type !== 'Frame')) {
    return { ok: false, code: 'flow.duplicate.unsupported', reason: '只能复制同一流式 Frame 中的图层。' };
  }
  if (entries.some((entry) => containsNode(entry.node, parent.id))) {
    return { ok: false, code: 'drop.cycle', reason: '不能把图层副本放入自身或其子图层中。' };
  }
  if (entries.some((entry) => isDesignNodeLocked(validation.dsl.nodes, entry.node.id) || isDesignNodeLocked(validation.dsl.nodes, entry.parentId!)) ||
    isDesignNodeLocked(validation.dsl.nodes, parent.id)) {
    return { ok: false, code: 'node.locked', reason: '锁定图层或目标 Frame 不能复制。' };
  }
  const siblings = parent.children;
  if (target.index > siblings.length) return { ok: false, code: 'drop.index.invalid', reason: '副本插入位置无效。' };
  const occupiedIds = new Set<string>();
  const occupiedSections = new Set<string>();
  collectIdentifiers(validation.dsl.nodes, occupiedIds, occupiedSections);
  const { nodeIds: cloneIds, sectionIds } = buildCloneMaps(entries, occupiedIds, occupiedSections);
  const clones = entries.map((entry) => cloneForPaste(entry.node, cloneIds, sectionIds));
  const reordered = [...siblings];
  reordered.splice(target.index, 0, ...clones);
  const result = validatePageDsl({ ...validation.dsl, nodes: replaceChildrenAtParent(validation.dsl.nodes, parent.id, reordered) }, entityFields);
  if (!result.ok) return { ok: false, code: 'flow.duplicate.dsl.invalid', reason: result.diagnostics[0]?.message ?? '副本未通过 UI-DSL 校验。' };
  return { ok: true, dsl: result.dsl, nodeIds: entries.map((entry) => cloneIds.get(entry.node.id) ?? '') };
}

export function insertNodeCommand(dsl: unknown, node: UiNode, target: NodeDropTarget, entityFields?: readonly EntityField[]): MoveNodeResult {
  const validation = validatePageDsl(dsl, entityFields);
  if (!validation.ok) return { ok: false, code: 'dsl.invalid', reason: validation.diagnostics[0]?.message ?? '当前页面 DSL 无效，无法添加组件。' };
  if (findLocation(validation.dsl.nodes, node.id)) return { ok: false, code: 'node.duplicate', reason: '组件标识已存在，请重新添加。' };
  if (!Number.isInteger(target.index) || target.index < 0) return { ok: false, code: 'drop.index.invalid', reason: '放置位置无效，请选择有效的图层位置。' };
  const parent = target.parentId === null ? null : findLocation(validation.dsl.nodes, target.parentId)?.node ?? null;
  if (target.parentId !== null && !parent) return { ok: false, code: 'drop.parent.missing', reason: '目标图层已不存在，请重新选择放置位置。' };
  if (parent && isDesignNodeLocked(validation.dsl.nodes, parent.id)) return { ok: false, code: 'drop.parent.locked', reason: '不能把图层放入已锁定的容器或其子图层中，请先解锁。' };
  const normalized = normalizeTarget(parent, node, target);
  if (!normalized) {
    if (target.slotName) return { ok: false, code: 'drop.slot.unsupported', reason: '该图层没有可用的此类插槽。' };
    if (parent?.type === 'PageHeader') return { ok: false, code: 'drop.child.unsupported', reason: '页头图层只接受状态标签或状态徽标。' };
    return { ok: false, code: 'drop.parent.unsupported', reason: '该图层不能包含其他页面对象。' };
  }
  const siblings = parent ? childrenForTarget(parent, normalized.slotName) : validation.dsl.nodes;
  if (!siblings) return { ok: false, code: 'drop.parent.unsupported', reason: '该图层不能包含其他页面对象。' };
  if (target.index > siblings.length) return { ok: false, code: 'drop.index.invalid', reason: '放置位置已超出当前图层范围。' };
  const inserted = insertNode(validation.dsl.nodes, normalized, node);
  if (!inserted.found) return { ok: false, code: 'drop.parent.missing', reason: '目标图层已不存在，请重新选择放置位置。' };
  const result = validatePageDsl({ ...validation.dsl, nodes: inserted.nodes }, entityFields);
  if (!result.ok) return { ok: false, code: 'drop.dsl.invalid', reason: result.diagnostics[0]?.message ?? '此位置无法生成有效页面结构。' };
  return { ok: true, dsl: result.dsl };
}

export function relativeDropTarget(dsl: unknown, movingNodeId: string, targetNodeId: string, placement: 'before' | 'after'): NodeDropTarget | null {
  const validation = validatePageDsl(dsl);
  if (!validation.ok || movingNodeId === targetNodeId) return null;
  const moving = findLocation(validation.dsl.nodes, movingNodeId);
  const target = findLocation(validation.dsl.nodes, targetNodeId);
  if (!moving || !target) return null;
  let index = target.index + (placement === 'after' ? 1 : 0);
  if (moving.parentId === target.parentId && moving.slotName === target.slotName && moving.index < index) index -= 1;
  return { parentId: target.parentId, index, ...(target.slotName ? { slotName: target.slotName } : {}) };
}
