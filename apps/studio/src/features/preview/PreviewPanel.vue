<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch, type PropType } from 'vue';
import { containerComponents, isComponentType, validatePageDsl, type UiNode } from '@pulseflow/ui-dsl';
import { getRootArtboardBounds, renderPage, type EditorRenderOptions, type EventHandlers, type PreviewData } from '@pulseflow/page-generator';
import type { NodeDesign } from '@pulseflow/ui-dsl';
import { createMockHandlers } from './mock-handlers';
import { useImageAssets } from './use-image-assets';
import { canDropNode, isDesignNodeLocked, relativeDropTarget, type NodeDropTarget } from '../design/design-commands';
import { readCanvasVisualRect, type CanvasVisualRect } from '../design/canvas-geometry';

type CanvasGeometryPatch = {
  position?: { mode: 'flow' | 'absolute'; x: number; y: number };
  size?: NodeDesign['size'];
  rotation?: number;
};
type CanvasTool = 'Frame' | 'Shape' | 'Text' | 'Image';
type ShapeType = 'rectangle' | 'ellipse' | 'line';
type CanvasPlacement = { type: CanvasTool; shape?: ShapeType; design: Pick<NodeDesign, 'position' | 'size' | 'flipY'>; parentId?: string; index?: number };
type ImageAssetDrop = { assetId: string; target: NodeDropTarget; position: NonNullable<NodeDesign['position']> };
type CanvasReparentPayload = { nodeIds: string[]; parentId: string; positions: Array<{ nodeId: string; position: NonNullable<NodeDesign['position']> }> };
type CanvasNodePosition = { nodeId: string; x: number; y: number; canvasX: number; canvasY: number; canvasWidth: number; canvasHeight: number; parentCanvasX: number; parentCanvasY: number; width: number; height: number; rotation: number; element: HTMLElement; originalStyle: string | null };
type SelectionBounds = { x: number; y: number; width: number; height: number };
type AlignmentResult = { patch: CanvasGeometryPatch; canvasCorrection: { x: number; y: number } };
type SelectionMarquee = { pointerId: number; startX: number; startY: number; currentX: number; currentY: number; additive: boolean; moved: boolean };
type DropGuideRect = { left: number; top: number; width: number; height: number };
type DuplicateGhostRect = { left: number; top: number; width: number; height: number };

const props = withDefaults(defineProps<{
  dsl: unknown;
  data?: PreviewData;
  handlers?: EventHandlers;
  editorMode?: boolean;
  prototypeMode?: boolean;
  artboardMode?: boolean;
  selectedNodeId?: string | null;
  selectedNodeIds?: readonly string[];
  editorZoom?: number;
  insertTool?: CanvasTool | null;
  insertShape?: ShapeType;
  externalAssetUrls?: ReadonlyMap<string, string>;
}>(), { data: () => ({}), editorMode: false, prototypeMode: false, artboardMode: false, selectedNodeId: null, editorZoom: 100, insertTool: null, insertShape: 'rectangle' });
const snapPixel = (value: number) => Math.round(value);
const emit = defineEmits<{
  selectNode: [nodeId: string | null, additive?: boolean];
  moveNode: [payload: { nodeId: string } & NodeDropTarget];
  reparentNodes: [payload: CanvasReparentPayload];
  reorderFlowNodes: [payload: { nodeIds: string[]; parentId: string; index: number }];
  insertComponent: [payload: { type: UiNode['type'] } & NodeDropTarget];
  dropRejected: [reason: string];
  updateNodeDesign: [payload: { nodeId: string; patch: CanvasGeometryPatch }];
  updateNodesDesign: [updates: Array<{ nodeId: string; patch: CanvasGeometryPatch }>];
  updateNodeText: [payload: { nodeId: string; text: string }];
  connectFrames: [payload: { sourceNodeId: string; targetNodeId: string }];
  placeTool: [payload: CanvasPlacement];
  dropImageAsset: [payload: ImageAssetDrop];
  duplicateNodesAt: [updates: Array<{ nodeId: string; position: NonNullable<NodeDesign['position']> }>];
  duplicateFlowNodesAt: [payload: { nodeIds: string[]; parentId: string; index: number }];
}>();
const lastEvent = shallowRef('');
const hoveredDropNode = shallowRef<HTMLElement | null>(null);
const hoveredReparentFrame = shallowRef<HTMLElement | null>(null);
const pointerTransform = shallowRef<{ pointerId: number; nodeId: string; nodePositions: CanvasNodePosition[]; kind: 'move' | 'resize' | 'rotate' | 'group-resize'; handle?: string; flowParentId?: string; duplicateOnMove: boolean; startX: number; startY: number; x: number; y: number; width: number; height: number; rotation: number; centerX: number; centerY: number; startAngle: number; moved: boolean; element: HTMLElement; alignmentParent: HTMLElement | null; originalStyle: string | null; groupBounds?: SelectionBounds } | null>(null);
const pointerPlacement = shallowRef<{ pointerId: number; tool: CanvasTool; shape: ShapeType; startX: number; startY: number; currentX: number; currentY: number; x: number; y: number; originLeft: number; originTop: number; parentId?: string; index: number } | null>(null);
const selectionMarquee = shallowRef<SelectionMarquee | null>(null);
const flowDropGuide = shallowRef<DropGuideRect | null>(null);
const duplicateGhosts = shallowRef<DuplicateGhostRect[]>([]);
const editingTextNodeId = shallowRef<string | null>(null);
let suppressNextClick = false;
let suppressNextEditorClick = false;
const panel = useTemplateRef<HTMLElement>('panel');
const validation = computed(() => validatePageDsl(props.dsl));
const isArtboardMode = computed(() => props.editorMode || props.artboardMode);
const editorArtboardBounds = computed(() => {
  if (!isArtboardMode.value || !validation.value.ok) return null;
  return getRootArtboardBounds(validation.value.dsl.nodes);
});
const editorCanvasStyle = computed(() => editorArtboardBounds.value ? {
  '--pf-editor-artboard-width': `${editorArtboardBounds.value.width}px`,
  '--pf-editor-artboard-height': `${editorArtboardBounds.value.height}px`
} : {});
const activeHandlers = computed(() => props.handlers ?? createMockHandlers(props.dsl, (name) => { lastEvent.value = `模拟事件：${name}`; }));
const selectionBounds = shallowRef<SelectionBounds | null>(null);
const prototypeConnection = shallowRef<{ pointerId: number; sourceNodeId: string; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
const savedPrototypeLines = shallowRef<Array<{ sourceNodeId: string; targetNodeId: string; x1: number; y1: number; x2: number; y2: number }>>([]);

function collectImageAssetIds(value: unknown): string[] {
  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const candidate = node as { type?: unknown; props?: unknown; children?: unknown; slots?: unknown };
    if (candidate.props && typeof candidate.props === 'object' && !Array.isArray(candidate.props)) {
      const nodeProps = candidate.props as Record<string, unknown>;
      const references = [nodeProps.backgroundAssetId, candidate.type === 'Image' ? nodeProps.assetId : undefined];
      references.forEach((assetId) => { if (typeof assetId === 'string') ids.add(assetId); });
    }
    if (Array.isArray(candidate.children)) candidate.children.forEach(visit);
    if (Array.isArray(candidate.slots)) {
      candidate.slots.forEach((slot) => {
        if (slot && typeof slot === 'object' && 'children' in slot && Array.isArray(slot.children)) slot.children.forEach(visit);
      });
    }
  };
  if (value && typeof value === 'object' && 'nodes' in value && Array.isArray(value.nodes)) value.nodes.forEach(visit);
  return [...ids];
}

const assetIds = computed(() => {
  const result = validation.value;
  const externalAssetUrls = props.externalAssetUrls;
  return result.ok ? collectImageAssetIds(result.dsl).filter((assetId) => !externalAssetUrls?.has(assetId)) : [];
});
const { urls: imageUrls, error: imageAssetError, dispose: disposeImageAssets } = useImageAssets(assetIds);
const resolvedAssetUrls = computed(() => {
  const urls = new Map(Object.entries(imageUrls.value));
  for (const [assetId, url] of props.externalAssetUrls ?? []) urls.set(assetId, url);
  return urls;
});
const placementPreviewStyle = computed(() => {
  const placement = pointerPlacement.value;
  const panelRect = panel.value?.getBoundingClientRect();
  if (!placement || !panelRect) return {};
  const scale = props.editorZoom / 100;
  return {
    left: `${(Math.min(placement.startX, placement.currentX) - panelRect.left) / scale}px`,
    top: `${(Math.min(placement.startY, placement.currentY) - panelRect.top) / scale}px`,
    width: `${Math.max(2, Math.abs(placement.currentX - placement.startX) / scale)}px`,
    height: `${Math.max(2, Math.abs(placement.currentY - placement.startY) / scale)}px`
  };
});
const selectionMarqueeStyle = computed(() => {
  const marquee = selectionMarquee.value;
  const panelRect = panel.value?.getBoundingClientRect();
  if (!marquee || !marquee.moved || !panelRect) return {};
  const scale = props.editorZoom / 100;
  return {
    left: `${(Math.min(marquee.startX, marquee.currentX) - panelRect.left) / scale}px`,
    top: `${(Math.min(marquee.startY, marquee.currentY) - panelRect.top) / scale}px`,
    width: `${Math.abs(marquee.currentX - marquee.startX) / scale}px`,
    height: `${Math.abs(marquee.currentY - marquee.startY) / scale}px`
  };
});
const flowDropGuideStyle = computed(() => {
  const guide = flowDropGuide.value;
  const panelRect = panel.value?.getBoundingClientRect();
  if (!guide || !panelRect) return {};
  const scale = props.editorZoom / 100;
  return { left: `${(guide.left - panelRect.left) / scale}px`, top: `${(guide.top - panelRect.top) / scale}px`,
    width: `${guide.width / scale}px`, height: `${guide.height / scale}px` };
});
const duplicateGhostStyles = computed(() => {
  const panelRect = panel.value?.getBoundingClientRect();
  if (!panelRect) return [];
  const scale = props.editorZoom / 100;
  return duplicateGhosts.value.map((ghost) => ({
    left: `${(ghost.left - panelRect.left) / scale}px`, top: `${(ghost.top - panelRect.top) / scale}px`,
    width: `${ghost.width / scale}px`, height: `${ghost.height / scale}px`
  }));
});
const prototypeLine = computed(() => {
  const connection = prototypeConnection.value;
  const panelRect = panel.value?.getBoundingClientRect();
  if (!connection || !panelRect) return null;
  const scale = props.editorZoom / 100;
  return {
    x1: connection.startX,
    y1: connection.startY,
    x2: (connection.currentX - panelRect.left) / scale,
    y2: (connection.currentY - panelRect.top) / scale
  };
});
function refreshPrototypeLines(): void {
  if (!props.prototypeMode || !validation.value.ok) {
    savedPrototypeLines.value = [];
    return;
  }
  const panelRect = panel.value?.getBoundingClientRect();
  if (!panelRect) return;
  const scale = props.editorZoom / 100;
  const frames: UiNode[] = [];
  const visit = (nodes: readonly UiNode[]) => nodes.forEach((node) => {
    if (node.type === 'Frame') frames.push(node);
    visit(node.children);
    node.slots.forEach((slot) => { if ('children' in slot) visit(slot.children); });
  });
  visit(validation.value.dsl.nodes);
  savedPrototypeLines.value = frames.flatMap((source) => {
    const targetId = source.design?.prototype?.targetNodeId;
    if (!targetId) return [];
    const sourceElement = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .find((element) => element.dataset.pfNodeId === source.id);
    const targetElement = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .find((element) => element.dataset.pfNodeId === targetId);
    if (!sourceElement || !targetElement) return [];
    const sourceRect = sourceElement.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) return [];
    return [{
      sourceNodeId: source.id, targetNodeId: targetId,
      x1: (sourceRect.right - panelRect.left) / scale, y1: (sourceRect.top + sourceRect.height / 2 - panelRect.top) / scale,
      x2: (targetRect.left - panelRect.left) / scale, y2: (targetRect.top + targetRect.height / 2 - panelRect.top) / scale
    }];
  });
}
watch(() => [props.prototypeMode, props.dsl, props.editorZoom] as const, async () => {
  await nextTick();
  refreshPrototypeLines();
}, { flush: 'post', immediate: true });
onScopeDispose(disposeImageAssets);
onMounted(() => window.addEventListener('keydown', onCanvasKeyDown));
onScopeDispose(() => window.removeEventListener('keydown', onCanvasKeyDown));

function eventNode(event: Event): HTMLElement | null {
  const target = event.target;
  return target instanceof Element ? target.closest<HTMLElement>('[data-pf-node-id]') : null;
}

function nodeIdOf(element: HTMLElement | null): string | null {
  return element?.getAttribute('data-pf-node-id') ?? null;
}

function nearestFrameAncestorId(element: HTMLElement | null): string | null {
  let candidate: HTMLElement | null = element;
  while (candidate) {
    const nodeId = nodeIdOf(candidate);
    if (nodeId && findNode(nodeId)?.type === 'Frame') return nodeId;
    candidate = candidate.parentElement?.closest<HTMLElement>('[data-pf-node-id]') ?? null;
  }
  return null;
}

function flowInsertionIndex(parentId: string, clientX: number, clientY: number): number {
  const parent = findNode(parentId);
  if (parent?.type !== 'Frame') return parent?.children.length ?? 0;
  const axis = parent.props.direction === 'row' ? 'x' : 'y';
  const pointer = axis === 'x' ? clientX : clientY;
  const flowChildren = parent.children.flatMap((node, index) => {
    if (node.design?.position?.mode === 'absolute') return [];
    const element = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .find((candidate) => candidate.dataset.pfNodeId === node.id);
    if (!element) return [];
    const rect = readCanvasVisualRect(node.design?.size, element);
    return [{ index, center: axis === 'x' ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2 }];
  });
  const next = flowChildren.find((child) => pointer < child.center);
  const last = flowChildren.at(-1);
  return next?.index ?? (last ? last.index + 1 : parent.children.length);
}

function startTextEdit(nodeId: string): void {
  if (isNodeLocked(nodeId)) return;
  editingTextNodeId.value = nodeId;
  void nextTick(() => {
    const element = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .find((candidate) => candidate.dataset.pfNodeId === nodeId)?.querySelector<HTMLElement>('.pf-text[contenteditable="true"]');
    element?.focus();
  });
}

function commitTextEdit(nodeId: string, text: string): void {
  if (editingTextNodeId.value !== nodeId) return;
  editingTextNodeId.value = null;
  const current = validation.value;
  const candidate = current.ok
    ? validatePageDsl({ ...current.dsl, nodes: replaceTextNode(current.dsl.nodes, nodeId, text) })
    : null;
  if (!candidate?.ok) {
    const original = findNode(nodeId);
    const element = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .find((item) => item.dataset.pfNodeId === nodeId)?.querySelector<HTMLElement>('.pf-text');
    if (original?.type === 'Text' && element && typeof original.props.text === 'string') element.textContent = original.props.text;
    lastEvent.value = '文字不符合 UI-DSL 约束，已恢复上次通过校验的内容。';
    return;
  }
  emit('updateNodeText', { nodeId, text });
}

function cancelTextEdit(nodeId: string): void {
  if (editingTextNodeId.value === nodeId) editingTextNodeId.value = null;
}

function verticalRatio(element: HTMLElement, clientY: number): number {
  const nodeId = nodeIdOf(element);
  const ownRect = element.getBoundingClientRect();
  const node = nodeId ? findNode(nodeId) : null;
  const rect = nodeId ? readCanvasVisualRect(node?.design?.size, element) : ownRect.height > 0 ? ownRect : element.firstElementChild?.getBoundingClientRect() ?? ownRect;
  return rect.height ? (clientY - rect.top) / rect.height : 0.5;
}

function findNode(nodeId: string): UiNode | null {
  const result = validation.value;
  if (!result.ok) return null;
  const pending = [...result.dsl.nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (node.id === nodeId) return node;
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return null;
}

function isNodeLocked(nodeId: string): boolean {
  const current = validation.value;
  return current.ok && isDesignNodeLocked(current.dsl.nodes, nodeId);
}

function replaceTextNode(nodes: readonly UiNode[], nodeId: string, text: string): UiNode[] {
  return nodes.map((node) => {
    const children = replaceTextNode(node.children, nodeId, text);
    const slots = node.slots.map((slot) => 'children' in slot
      ? { ...slot, children: replaceTextNode(slot.children, nodeId, text) }
      : { ...slot });
    return node.id === nodeId && node.type === 'Text'
      ? { ...node, props: { ...node.props, text }, children, slots }
      : { ...node, children, slots };
  });
}

function findPosition(nodeId: string): NodeDropTarget | null {
  const result = validation.value;
  if (!result.ok) return null;
  const visit = (nodes: readonly UiNode[], parentId: string | null = null, slotName?: 'tags'): NodeDropTarget | null => {
    for (const [index, node] of nodes.entries()) {
      if (node.id === nodeId) return { parentId, index, ...(slotName ? { slotName } : {}) };
      const child = visit(node.children, node.id);
      if (child) return child;
      for (const slot of node.slots) {
        if (!('children' in slot)) continue;
        const slotted = visit(slot.children, node.id, slot.name === 'tags' ? 'tags' : undefined);
        if (slotted) return slotted;
      }
    }
    return null;
  };
  return visit(result.dsl.nodes);
}

function editorRenderedPosition(nodeId: string, x: number, y: number): { x: number; y: number } {
  if (findPosition(nodeId)?.parentId) return { x, y };
  return {
    x: x - (editorArtboardBounds.value?.left ?? 0),
    y: y - (editorArtboardBounds.value?.top ?? 0)
  };
}

function alignmentParentOf(nodeId: string): HTMLElement | null {
  const position = findPosition(nodeId);
  const nodes = panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]');
  if (position?.parentId) {
    return Array.from(nodes ?? []).find((element) => element.dataset.pfNodeId === position.parentId) ?? null;
  }
  return panel.value?.querySelector<HTMLElement>('.pulseflow-page') ?? null;
}

function clearDropIntent(): void {
  hoveredDropNode.value?.removeAttribute('data-pf-drop-intent');
  hoveredDropNode.value = null;
}

function clearReparentTarget(): void {
  hoveredReparentFrame.value?.removeAttribute('data-pf-reparent-target');
  hoveredReparentFrame.value = null;
}

function isCanvasAxisAligned(element: HTMLElement): boolean {
  const page = panel.value?.querySelector<HTMLElement>('.pulseflow-page');
  if (!page) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const transform = window.getComputedStyle(current).transform;
    if (transform && transform !== 'none') {
      const match = transform.match(/^matrix\(([^)]+)\)$/);
      const values = match?.[1]?.split(',').map((value) => Number(value.trim()));
      if (!values || values.length !== 6 || values.some((value) => !Number.isFinite(value)) ||
        Math.abs(values[0]! - 1) > 1e-6 || Math.abs(values[1]!) > 1e-6 || Math.abs(values[2]!) > 1e-6 || Math.abs(values[3]! - 1) > 1e-6) return false;
    }
    if (current === page) return true;
  }
  return false;
}

function reparentTargetAtPointer(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): { frameId: string; frameElement: HTMLElement } | null {
  if (active.kind !== 'move' || active.duplicateOnMove || !active.nodePositions.length ||
    active.nodePositions.some(({ nodeId }) => findNode(nodeId)?.design?.position?.mode !== 'absolute' || isNodeLocked(nodeId))) return null;
  const frameId = frameAtPointer(event, new Set(active.nodePositions.map(({ nodeId }) => nodeId)), constrainedPointerPoint(active, event));
  const frame = frameId ? findNode(frameId) : null;
  const frameElement = frameId ? Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
    .find((candidate) => candidate.dataset.pfNodeId === frameId) : null;
  const page = panel.value?.querySelector<HTMLElement>('.pulseflow-page');
  if (!frameId || frame?.type !== 'Frame' || !frameElement || !page || isNodeLocked(frameId) ||
    active.nodePositions.some(({ element }) => !isCanvasAxisAligned(element)) || !isCanvasAxisAligned(frameElement)) return null;
  const sourceLocations = active.nodePositions.map(({ nodeId }) => findPosition(nodeId));
  if (sourceLocations.every((location) => location?.parentId === frameId && !location.slotName)) return null;
  for (const position of active.nodePositions) {
    const assessment = canDropNode(props.dsl, position.nodeId, { parentId: frameId, index: frame.children.length });
    if (!assessment.allowed) return null;
  }
  return { frameId, frameElement };
}

function reparentPositions(active: NonNullable<typeof pointerTransform.value>, frameElement: HTMLElement): CanvasReparentPayload['positions'] | null {
  const page = panel.value?.querySelector<HTMLElement>('.pulseflow-page');
  const frameContent = frameElement.firstElementChild;
  if (!page || !(frameContent instanceof HTMLElement)) return null;
  const pageRect = page.getBoundingClientRect();
  const frameRect = frameContent.getBoundingClientRect();
  const frameStyle = window.getComputedStyle(frameContent);
  const scale = props.editorZoom / 100;
  if (pageRect.width <= 0 || frameRect.width <= 0 || scale <= 0) return null;
  const frameX = (frameRect.left + Number.parseFloat(frameStyle.borderLeftWidth || '0') - pageRect.left) / scale;
  const frameY = (frameRect.top + Number.parseFloat(frameStyle.borderTopWidth || '0') - pageRect.top) / scale;
  const positions = active.nodePositions.map((position) => {
    const node = findNode(position.nodeId);
    if (!node) return null;
    const rect = readCanvasVisualRect(node.design?.size, position.element);
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      nodeId: position.nodeId,
      position: {
        mode: 'absolute' as const,
        x: Math.max(-8192, Math.min(8192, Math.round((rect.left - pageRect.left) / scale - frameX))),
        y: Math.max(-8192, Math.min(8192, Math.round((rect.top - pageRect.top) / scale - frameY)))
      }
    };
  });
  return positions.every((position) => position !== null)
    ? positions as CanvasReparentPayload['positions']
    : null;
}

function readCanvasNodePosition(nodeId: string, element: HTMLElement): CanvasNodePosition {
  const node = findNode(nodeId);
  const rect = readCanvasVisualRect(node?.design?.size, element);
  const pageRect = panel.value?.querySelector<HTMLElement>('.pulseflow-page')?.getBoundingClientRect();
  const parentElement = alignmentParentOf(nodeId);
  const parentRect = parentElement?.getBoundingClientRect();
  const scale = props.editorZoom / 100;
  const canvasX = pageRect ? (rect.left - pageRect.left) / scale : 0;
  const canvasY = pageRect ? (rect.top - pageRect.top) / scale : 0;
  const parentCanvasX = pageRect && parentRect ? (parentRect.left - pageRect.left) / scale : 0;
  const parentCanvasY = pageRect && parentRect ? (parentRect.top - pageRect.top) / scale : 0;
  const offsetParent = element.offsetParent as HTMLElement | null;
  const offsetParentNode = offsetParent?.closest<HTMLElement>('[data-pf-node-id]')
    ?? (offsetParent && offsetParent === panel.value?.querySelector('.pulseflow-page') ? offsetParent : null);
  const hasParentLocalOffset = Boolean(parentElement && offsetParentNode === parentElement);
  return {
    nodeId,
    x: node?.design?.position?.mode === 'absolute' ? node.design.position.x
      : hasParentLocalOffset ? element.offsetLeft : Math.round(canvasX - parentCanvasX),
    y: node?.design?.position?.mode === 'absolute' ? node.design.position.y
      : hasParentLocalOffset ? element.offsetTop : Math.round(canvasY - parentCanvasY),
    canvasX, canvasY, canvasWidth: rect.width / scale, canvasHeight: rect.height / scale, parentCanvasX, parentCanvasY,
    width: typeof node?.design?.size?.width === 'number' ? node.design.size.width : rect.width / scale,
    height: typeof node?.design?.size?.height === 'number' ? node.design.size.height : rect.height / scale,
    rotation: node?.design?.rotation ?? 0,
    element,
    originalStyle: element.getAttribute('style')
  };
}

function readSelectionBounds(): SelectionBounds | null {
  const ids = props.selectedNodeIds ?? (props.selectedNodeId ? [props.selectedNodeId] : []);
  const page = panel.value?.querySelector<HTMLElement>('.pulseflow-page');
  const pageRect = page?.getBoundingClientRect();
  if (!page || !pageRect || ids.length < 2) return null;
  const scale = props.editorZoom / 100;
  const rects = ids.flatMap((nodeId) => {
    const node = findNode(nodeId);
    const element = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .find((candidate) => candidate.dataset.pfNodeId === nodeId);
    if (!node || isNodeLocked(nodeId) || node.design?.visible === false || !element) return [];
    const rect = readCanvasVisualRect(node.design?.size, element);
    const width = rect.width > 0 ? rect.width / scale : typeof node.design?.size?.width === 'number' ? node.design.size.width : 0;
    const height = rect.height > 0 ? rect.height / scale : typeof node.design?.size?.height === 'number' ? node.design.size.height : 0;
    if (!width || !height) return [];
    const x = (rect.left - pageRect.left) / scale;
    const y = (rect.top - pageRect.top) / scale;
    return [{ x, y, width, height }];
  });
  if (rects.length < 2) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

watch(() => [props.editorMode, props.selectedNodeId, props.selectedNodeIds, props.dsl, props.editorZoom] as const, () => {
  selectionBounds.value = readSelectionBounds();
}, { flush: 'post', immediate: true });

function onPointerDown(event: PointerEvent): void {
  suppressNextEditorClick = false;
  if (!props.editorMode || event.button !== 0) return;
  const prototypeHandle = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pf-prototype-handle]') : null;
  if (props.prototypeMode && prototypeHandle) {
    const sourceNodeId = prototypeHandle.dataset.pfPrototypeHandle;
    const source = sourceNodeId ? findNode(sourceNodeId) : null;
    const panelRect = panel.value?.getBoundingClientRect();
    if (!sourceNodeId || source?.type !== 'Frame' || !panelRect) return;
    const scale = props.editorZoom / 100;
    const startX = (event.clientX - panelRect.left) / scale;
    const startY = (event.clientY - panelRect.top) / scale;
    prototypeConnection.value = { pointerId: event.pointerId, sourceNodeId, startX, startY, currentX: event.clientX, currentY: event.clientY };
    panel.value?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const wrapper = eventNode(event);
  if (props.insertTool) {
    const target = event.target instanceof Element ? event.target : null;
    const page = target?.closest<HTMLElement>('.pulseflow-page');
    const targetNodeId = nodeIdOf(wrapper);
    const targetNode = targetNodeId ? findNode(targetNodeId) : null;
    const directContainerId = targetNode && containerComponents.has(targetNode.type) ? targetNode.id : undefined;
    const frameId = nearestFrameAncestorId(wrapper);
    const parentId = directContainerId && targetNode?.type !== 'Frame' ? directContainerId : frameId ?? directContainerId;
    const coordinateRoot = parentId
      ? Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? []).find((candidate) => candidate.dataset.pfNodeId === parentId)
      : page;
    const rect = coordinateRoot?.getBoundingClientRect();
    if (!page || !coordinateRoot || !rect || rect.width <= 0 || rect.height <= 0) return;
    const scale = props.editorZoom / 100;
    pointerPlacement.value = {
      pointerId: event.pointerId,
      tool: props.insertTool,
      shape: props.insertShape,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      x: Math.max(-8192, Math.min(8192, snapPixel((event.clientX - rect.left) / scale + (!parentId ? editorArtboardBounds.value?.left ?? 0 : 0)))),
      y: Math.max(-8192, Math.min(8192, snapPixel((event.clientY - rect.top) / scale + (!parentId ? editorArtboardBounds.value?.top ?? 0 : 0)))),
      originLeft: rect.left,
      originTop: rect.top,
      ...(parentId ? { parentId } : {}),
      index: (parentId ? findNode(parentId)?.children.length : undefined) ?? (validation.value.ok ? validation.value.dsl.nodes.length : 0)
    };
    suppressNextClick = true;
    panel.value?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const surfaceTarget = event.target instanceof Element ? event.target : null;
  const isTransformHandle = Boolean(surfaceTarget?.closest('[data-pf-group-resize-handle], [data-pf-resize-handle], [data-pf-rotate-handle]'));
  if (!wrapper && !isTransformHandle && surfaceTarget?.closest('.pulseflow-page')) {
    selectionMarquee.value = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      currentX: event.clientX, currentY: event.clientY, additive: event.shiftKey || event.metaKey || event.ctrlKey, moved: false };
    suppressNextClick = true;
    panel.value?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    return;
  }
  const groupHandle = event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-pf-group-resize-handle]')
    : null;
  if (groupHandle) {
    const nodeIds = props.selectedNodeIds ?? [];
    const bounds = selectionBounds.value ?? readSelectionBounds();
    const nodePositions = nodeIds.flatMap((nodeId) => {
      const node = findNode(nodeId);
      const element = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
        .find((candidate) => candidate.dataset.pfNodeId === nodeId);
      return !node || isNodeLocked(nodeId) || !element ? [] : [readCanvasNodePosition(nodeId, element)];
    });
    if (!bounds || nodePositions.length !== nodeIds.length || nodePositions.length < 2 || !canResizeSelection(nodeIds)) return;
    pointerTransform.value = {
      pointerId: event.pointerId,
      nodeId: props.selectedNodeId ?? nodePositions[0]!.nodeId,
      nodePositions,
      kind: 'group-resize',
      handle: groupHandle.dataset.pfGroupResizeHandle,
      duplicateOnMove: false,
      startX: event.clientX,
      startY: event.clientY,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      rotation: 0,
      centerX: 0,
      centerY: 0,
      startAngle: 0,
      moved: false,
      element: panel.value ?? groupHandle,
      alignmentParent: null,
      originalStyle: null,
      groupBounds: bounds
    };
    panel.value?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const nodeId = nodeIdOf(wrapper);
  const node = nodeId ? findNode(nodeId) : null;
  if (!wrapper || !nodeId || !node) return;
  suppressNextEditorClick = true;
  const additive = event.shiftKey || event.metaKey || event.ctrlKey;
  const selectedNodeIds = props.selectedNodeIds ?? (props.selectedNodeId ? [props.selectedNodeId] : []);
  if (isNodeLocked(nodeId)) {
    if (!selectedNodeIds.includes(nodeId) || additive) {
      if (additive) emit('selectNode', nodeId, true);
      else emit('selectNode', nodeId);
    }
    event.preventDefault();
    return;
  }
  if (additive && selectedNodeIds.includes(nodeId)) {
    emit('selectNode', nodeId, true);
    event.preventDefault();
    return;
  }
  const movingNodeIds = additive
    ? [...selectedNodeIds, nodeId]
    : selectedNodeIds.includes(nodeId) ? [...selectedNodeIds] : [nodeId];
  if (additive) emit('selectNode', nodeId, true);
  else if (!selectedNodeIds.includes(nodeId)) emit('selectNode', nodeId);
  const nodePositions = [...new Set(movingNodeIds)].flatMap((movingNodeId) => {
    const movingNode = findNode(movingNodeId);
    const element = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .find((candidate) => candidate.dataset.pfNodeId === movingNodeId);
    return !movingNode || isNodeLocked(movingNodeId) || !element ? [] : [readCanvasNodePosition(movingNodeId, element)];
  });
  if (!nodePositions.some((position) => position.nodeId === nodeId)) nodePositions.push(readCanvasNodePosition(nodeId, wrapper));
  const target = event.target instanceof Element ? event.target : null;
  const handle = target?.closest<HTMLElement>('[data-pf-resize-handle]')?.dataset.pfResizeHandle;
  const rotating = Boolean(target?.closest('[data-pf-rotate-handle]'));
  const rect = readCanvasVisualRect(node.design?.size, wrapper);
  const scale = props.editorZoom / 100;
  const activePosition = nodePositions.find((position) => position.nodeId === nodeId);
  const nodeLocations = nodePositions.map((position) => findPosition(position.nodeId));
  const flowParentId = nodeLocations[0]?.parentId;
  const flowSelection = nodePositions.length === movingNodeIds.length && Boolean(flowParentId) &&
    nodePositions.every((position, index) => findNode(position.nodeId)?.design?.position?.mode !== 'absolute' &&
      nodeLocations[index]?.parentId === flowParentId && !nodeLocations[index]?.slotName);
  const flowParent = flowSelection && flowParentId ? findNode(flowParentId) : null;
  const parent = flowParent?.type === 'Frame' ? alignmentParentOf(nodeId) : nodePositions.length === 1 ? alignmentParentOf(nodeId) : null;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  pointerTransform.value = {
    pointerId: event.pointerId, nodeId, nodePositions, kind: rotating ? 'rotate' : handle ? 'resize' : 'move', ...(handle ? { handle } : {}),
    ...(flowParent?.type === 'Frame' ? { flowParentId: flowParent.id } : {}),
    duplicateOnMove: event.altKey && !handle && !rotating,
    startX: event.clientX, startY: event.clientY,
    x: activePosition?.x ?? 0,
    y: activePosition?.y ?? 0,
    width: typeof node.design?.size?.width === 'number' ? node.design.size.width : rect.width / (props.editorZoom / 100),
    height: typeof node.design?.size?.height === 'number' ? node.design.size.height : rect.height / (props.editorZoom / 100),
    rotation: node.design?.rotation ?? 0,
    centerX, centerY,
    startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
    moved: false,
    element: wrapper,
    alignmentParent: parent ?? null,
    originalStyle: wrapper.getAttribute('style')
  };
  wrapper.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  const connection = prototypeConnection.value;
  if (connection?.pointerId === event.pointerId) {
    prototypeConnection.value = { ...connection, currentX: event.clientX, currentY: event.clientY };
    event.preventDefault();
    return;
  }
  const marquee = selectionMarquee.value;
  if (marquee?.pointerId === event.pointerId) {
    const moved = Math.hypot(event.clientX - marquee.startX, event.clientY - marquee.startY) >= 3;
    selectionMarquee.value = { ...marquee, currentX: event.clientX, currentY: event.clientY, moved };
    event.preventDefault();
    return;
  }
  const placement = pointerPlacement.value;
  if (placement?.pointerId === event.pointerId) {
    pointerPlacement.value = { ...placement, currentX: event.clientX, currentY: event.clientY };
    event.preventDefault();
    return;
  }
  const active = pointerTransform.value;
  if (!active || active.pointerId !== event.pointerId) return;
  if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 3) return;
  const moved = { ...active, moved: true };
  pointerTransform.value = moved;
  if (moved.kind === 'move' && moved.duplicateOnMove) {
    clearReparentTarget();
    moved.nodePositions.forEach((position) => {
      if (position.originalStyle === null) position.element.removeAttribute('style');
      else position.element.setAttribute('style', position.originalStyle);
    });
    duplicateGhosts.value = duplicateGhostRects(moved, event);
    const target = moved.flowParentId ? flowReorderTarget(moved, event, true) : null;
    flowDropGuide.value = target ? flowDropGuideRect(moved, target, true) : null;
    event.preventDefault();
    return;
  }
  if (moved.kind === 'group-resize') applyGroupResizePreview(moved, event);
  else if (moved.kind === 'move' && moved.flowParentId && isPointerWithinFlowParent(moved, event)) {
    const scale = props.editorZoom / 100;
    const movement = constrainedPointerDelta(moved, event);
    moved.nodePositions.forEach((position) => {
      if (position.originalStyle === null) position.element.removeAttribute('style');
      else position.element.setAttribute('style', position.originalStyle);
      const localDelta = canvasDeltaToParent(position.element, movement.x / scale, movement.y / scale);
      if (localDelta) position.element.style.translate = `${localDelta.x}px ${localDelta.y}px`;
    });
    const target = flowReorderTarget(moved, event);
    flowDropGuide.value = target ? flowDropGuideRect(moved, target, false) : null;
  } else {
    if (moved.flowParentId) moved.nodePositions.forEach((position) => { position.element.style.translate = ''; });
    applyPointerPreview(moved, event);
    const target = moved.flowParentId ? flowReorderTarget(moved, event) : null;
    flowDropGuide.value = target ? flowDropGuideRect(moved, target, false) : null;
    const reparentTarget = reparentTargetAtPointer(moved, event);
    if (hoveredReparentFrame.value !== reparentTarget?.frameElement) {
      clearReparentTarget();
      if (reparentTarget) {
        hoveredReparentFrame.value = reparentTarget.frameElement;
        reparentTarget.frameElement.setAttribute('data-pf-reparent-target', 'true');
      }
    }
  }
}

function isPointerWithinFlowParent(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): boolean {
  const parent = active.flowParentId ? findNode(active.flowParentId) : null;
  const rect = active.alignmentParent ? readCanvasVisualRect(parent?.design?.size, active.alignmentParent) : null;
  const point = constrainedPointerPoint(active, event);
  return Boolean(active.flowParentId && rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
}

function flowReorderTarget(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent, duplicate = false): { parentId: string; index: number } | null {
  const sourceParentId = active.flowParentId;
  const nodeIds = active.nodePositions.map((position) => position.nodeId);
  if (!sourceParentId || !nodeIds.length || nodeIds.some((nodeId) => findPosition(nodeId)?.parentId !== sourceParentId)) return null;
  const point = constrainedPointerPoint(active, event);
  const pointerFrameId = frameAtPointer(event, new Set(nodeIds), point);
  const targetParentId = pointerFrameId ?? (isPointerWithinFlowParent(active, event) ? sourceParentId : null);
  const parent = targetParentId ? findNode(targetParentId) : null;
  if (parent?.type !== 'Frame') return null;
  if (isNodeLocked(parent.id) || nodeIds.some((nodeId) => isNodeLocked(nodeId))) return null;
  const direction = parent.props.direction === 'row' ? 'row' : 'column';
  const pageRect = panel.value?.querySelector<HTMLElement>('.pulseflow-page')?.getBoundingClientRect();
  if (!pageRect) return null;
  const scale = props.editorZoom / 100;
  const origins = active.nodePositions.map((position) => direction === 'row' ? position.canvasX : position.canvasY);
  const extents = active.nodePositions.map((position) => direction === 'row' ? position.canvasWidth : position.canvasHeight);
  const origin = direction === 'row' ? pageRect.left : pageRect.top;
  const leading = origin + Math.min(...origins) * scale;
  const trailing = origin + Math.max(...origins.map((value, index) => value + extents[index]!)) * scale;
  const projectedCenter = (leading + trailing) / 2 + (direction === 'row' ? point.x - active.startX : point.y - active.startY);
  const selected = new Set(nodeIds);
  const siblings = parent.children.flatMap((node, index) => {
    const isSelected = selected.has(node.id);
    if (isSelected && (!duplicate || targetParentId !== sourceParentId)) return [];
    if (isSelected) {
      const position = active.nodePositions.find((candidate) => candidate.nodeId === node.id);
      if (!position) return [];
      const center = direction === 'row'
        ? pageRect.left + (position.canvasX + position.canvasWidth / 2) * scale
        : pageRect.top + (position.canvasY + position.canvasHeight / 2) * scale;
      return [{ id: node.id, index, center }];
    }
    const element = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .find((candidate) => candidate.dataset.pfNodeId === node.id);
    if (!element) return [];
    const rect = readCanvasVisualRect(node.design?.size, element);
    return [{ id: node.id, index, center: direction === 'row' ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2 }];
  });
  const postRemovalIndex = siblings.filter(({ center }) => center < projectedCenter).length;
  const currentOrder = parent.children.map((node) => node.id);
  const remaining = currentOrder.filter((nodeId) => !selected.has(nodeId));
  const sourceOrder = findNode(sourceParentId)?.children.map((node) => node.id) ?? [];
  const selectedInOrder = sourceOrder.filter((nodeId) => selected.has(nodeId));
  const reordered = [...remaining];
  reordered.splice(postRemovalIndex, 0, ...selectedInOrder);
  if (!duplicate && targetParentId === sourceParentId && reordered.every((nodeId, index) => nodeId === currentOrder[index])) return null;
  return { parentId: parent.id, index: postRemovalIndex };
}

function frameAtPointer(event: PointerEvent, ignoredNodeIds: ReadonlySet<string>, point = { x: event.clientX, y: event.clientY }): string | null {
  const hits = typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(point.x, point.y)
    : typeof document.elementFromPoint === 'function'
      ? [document.elementFromPoint(point.x, point.y)].filter((item): item is Element => Boolean(item))
      : [];
  for (const hit of hits) {
    if (!(hit instanceof Element)) continue;
    let candidate = hit.closest<HTMLElement>('[data-pf-node-id]');
    let ignored = false;
    for (let ancestor = candidate; ancestor; ancestor = ancestor.parentElement?.closest<HTMLElement>('[data-pf-node-id]') ?? null) {
      if (ignoredNodeIds.has(nodeIdOf(ancestor) ?? '')) {
        ignored = true;
        break;
      }
    }
    if (ignored) continue;
    while (candidate) {
      const nodeId = nodeIdOf(candidate);
      if (nodeId && findNode(nodeId)?.type === 'Frame') return nodeId;
      candidate = candidate.parentElement?.closest<HTMLElement>('[data-pf-node-id]') ?? null;
    }
  }
  return null;
}

function flowDropGuideRect(active: NonNullable<typeof pointerTransform.value>, target: { parentId: string; index: number }, duplicate: boolean): DropGuideRect | null {
  const parent = findNode(target.parentId);
  const parentElement = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
    .find((candidate) => candidate.dataset.pfNodeId === target.parentId);
  if (parent?.type !== 'Frame' || !parentElement) return null;
  const selected = new Set(active.nodePositions.map((position) => position.nodeId));
  const siblings = parent.children.filter((node) => duplicate || parent.id !== active.flowParentId || !selected.has(node.id));
  const reference = siblings[target.index];
  const referenceNode = reference ?? siblings.at(-1);
  const referenceElement = referenceNode
    ? Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? []).find((candidate) => candidate.dataset.pfNodeId === referenceNode.id)
    : null;
  const parentRect = readCanvasVisualRect(parent.design?.size, parentElement);
  const referenceRect = referenceNode && referenceElement ? readCanvasVisualRect(referenceNode.design?.size, referenceElement) : null;
  const row = parent.props.direction === 'row';
  if (row) {
    const x = referenceRect ? reference ? referenceRect.left : referenceRect.right : (parentRect.left + parentRect.right) / 2;
    return { left: x - 1, top: parentRect.top, width: 2, height: parentRect.height };
  }
  const y = referenceRect ? reference ? referenceRect.top : referenceRect.bottom : (parentRect.top + parentRect.bottom) / 2;
  return { left: parentRect.left, top: y - 1, width: parentRect.width, height: 2 };
}

function duplicateGhostRects(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): DuplicateGhostRect[] {
  const pageRect = panel.value?.querySelector<HTMLElement>('.pulseflow-page')?.getBoundingClientRect();
  if (!pageRect) return [];
  const scale = props.editorZoom / 100;
  const movement = constrainedPointerDelta(active, event);
  const dx = movement.x;
  const dy = movement.y;
  return active.nodePositions.map((position) => ({
    left: pageRect.left + position.canvasX * scale + dx,
    top: pageRect.top + position.canvasY * scale + dy,
    width: position.canvasWidth * scale,
    height: position.canvasHeight * scale
  }));
}

function constrainedPointerDelta(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): { x: number; y: number } {
  const delta = { x: event.clientX - active.startX, y: event.clientY - active.startY };
  if (!event.shiftKey) return delta;
  return Math.abs(delta.x) >= Math.abs(delta.y) ? { ...delta, y: 0 } : { ...delta, x: 0 };
}

function constrainedPointerPoint(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): { x: number; y: number } {
  const delta = constrainedPointerDelta(active, event);
  return { x: active.startX + delta.x, y: active.startY + delta.y };
}

function pointerPatch(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): CanvasGeometryPatch {
  const scale = props.editorZoom / 100;
  const movement = constrainedPointerDelta(active, event);
  const dx = movement.x / scale;
  const dy = movement.y / scale;
  if (active.kind === 'rotate') {
    const currentAngle = Math.atan2(event.clientY - active.centerY, event.clientX - active.centerX);
    const delta = ((currentAngle - active.startAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const degrees = active.rotation + delta * (180 / Math.PI);
    const constrained = event.shiftKey ? Math.round(degrees / 15) * 15 : Math.round(degrees);
    return { rotation: Math.max(-360, Math.min(360, constrained)) };
  }
  if (active.kind === 'move') {
    const localDelta = canvasDeltaToParent(active.element, snapPixel(dx), snapPixel(dy));
    return localDelta
      ? { position: { mode: 'absolute' as const, x: snapPixel(active.x + localDelta.x), y: snapPixel(active.y + localDelta.y) } }
      : { position: { mode: 'absolute' as const, x: active.x, y: active.y } };
  }
  const handle = active.handle ?? '';
  const localDelta = canvasDeltaToParent(active.element, dx, dy, true);
  if (!localDelta) return {};
  const resizeFactor = event.altKey ? 2 : 1;
  const widthDelta = (handle.includes('w') ? -localDelta.x : handle.includes('e') ? localDelta.x : 0) * resizeFactor;
  const heightDelta = (handle.includes('n') ? -localDelta.y : handle.includes('s') ? localDelta.y : 0) * resizeFactor;
  let width = Math.max(1, snapPixel(active.width + widthDelta));
  let height = Math.max(1, snapPixel(active.height + heightDelta));
  if (event.shiftKey && active.width > 0 && active.height > 0) {
    const horizontal = handle.includes('w') || handle.includes('e');
    const vertical = handle.includes('n') || handle.includes('s');
    const widthChange = Math.abs(width - active.width) / active.width;
    const heightChange = Math.abs(height - active.height) / active.height;
    const widthDrivesRatio = horizontal && (!vertical || widthChange >= heightChange);
    const ratio = active.width / active.height;
    if (widthDrivesRatio) height = Math.max(1, snapPixel(width / ratio));
    else width = Math.max(1, snapPixel(height * ratio));
  }
  const horizontal = handle.includes('w') || handle.includes('e');
  const vertical = handle.includes('n') || handle.includes('s');
  const centerX = event.altKey || event.shiftKey && !horizontal;
  const centerY = event.altKey || event.shiftKey && !vertical;
  const position = { mode: 'absolute' as const,
    x: snapPixel(centerX ? active.x + (active.width - width) / 2 : active.x + (handle.includes('w') ? active.width - width : 0)),
    y: snapPixel(centerY ? active.y + (active.height - height) / 2 : active.y + (handle.includes('n') ? active.height - height : 0)) };
  const size = { width, height };
  const patch: CanvasGeometryPatch = { size };
  const keepsFlowPosition = findNode(active.nodeId)?.design?.position?.mode !== 'absolute';
  if (!keepsFlowPosition && (centerX || centerY || handle.includes('w') || handle.includes('n'))) patch.position = position;
  return patch;
}

type LinearTransform = { a: number; b: number; c: number; d: number };

function canvasDeltaToParent(element: HTMLElement, x: number, y: number, includeElementTransform = false): { x: number; y: number } | null {
  const transform = readCanvasToParentTransform(element, includeElementTransform);
  if (!transform) return null;
  return { x: transform.a * x + transform.c * y, y: transform.b * x + transform.d * y };
}

function readCanvasToParentTransform(element: HTMLElement, includeElementTransform = false): LinearTransform | null {
  const page = panel.value?.querySelector<HTMLElement>('.pulseflow-page');
  if (!page) return null;
  let parentToCanvas: LinearTransform = { a: 1, b: 0, c: 0, d: 1 };
  let ancestor = includeElementTransform ? element : element.parentElement;
  while (ancestor && ancestor !== page) {
    const transform = window.getComputedStyle(ancestor).transform;
    if (transform && transform !== 'none') {
      const match = transform.match(/^matrix\(([^)]+)\)$/);
      if (!match) return null;
      const values = match[1]!.split(',').map((value) => Number(value.trim()));
      if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return null;
      const [a, b, c, d] = values as [number, number, number, number, number, number];
      parentToCanvas = {
        a: a * parentToCanvas.a + c * parentToCanvas.b,
        b: b * parentToCanvas.a + d * parentToCanvas.b,
        c: a * parentToCanvas.c + c * parentToCanvas.d,
        d: b * parentToCanvas.c + d * parentToCanvas.d
      };
    }
    ancestor = ancestor.parentElement;
  }
  if (ancestor !== page) return null;
  const determinant = parentToCanvas.a * parentToCanvas.d - parentToCanvas.b * parentToCanvas.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) return null;
  return {
    a: parentToCanvas.d / determinant,
    b: -parentToCanvas.b / determinant,
    c: -parentToCanvas.c / determinant,
    d: parentToCanvas.a / determinant
  };
}

function parentDeltaToCanvas(element: HTMLElement, x: number, y: number): { x: number; y: number } | null {
  const inverse = readCanvasToParentTransform(element);
  if (!inverse) return null;
  const determinant = inverse.a * inverse.d - inverse.b * inverse.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) return null;
  return {
    x: (inverse.d * x - inverse.c * y) / determinant,
    y: (-inverse.b * x + inverse.a * y) / determinant
  };
}

function groupMoveUpdates(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent, canvasCorrection = { x: 0, y: 0 }): Array<{ nodeId: string; patch: CanvasGeometryPatch }> {
  const scale = props.editorZoom / 100;
  const movement = constrainedPointerDelta(active, event);
  const canvasDeltaX = snapPixel(movement.x / scale) + canvasCorrection.x;
  const canvasDeltaY = snapPixel(movement.y / scale) + canvasCorrection.y;
  const updates = active.nodePositions.map((position) => {
    const localDelta = canvasDeltaToParent(position.element, canvasDeltaX, canvasDeltaY);
    return localDelta ? {
      nodeId: position.nodeId,
      patch: { position: { mode: 'absolute' as const, x: Math.round(position.x + localDelta.x), y: Math.round(position.y + localDelta.y) } }
    } : null;
  });
  return updates.every((update) => update !== null) ? updates : [];
}

function groupResizeUpdates(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): Array<{ nodeId: string; patch: CanvasGeometryPatch }> {
  const bounds = active.groupBounds;
  const handle = active.handle ?? '';
  if (!bounds || !handle) return [];
  const scale = props.editorZoom / 100;
  const clampPosition = (value: number) => Math.max(-8192, Math.min(8192, snapPixel(value)));
  const dx = (event.clientX - active.startX) / scale;
  const dy = (event.clientY - active.startY) / scale;
  const movesWest = handle.includes('w');
  const movesEast = handle.includes('e');
  const movesNorth = handle.includes('n');
  const movesSouth = handle.includes('s');
  const resizeFactor = event.altKey ? 2 : 1;
  const widthDelta = movesEast ? dx * resizeFactor : movesWest ? -dx * resizeFactor : 0;
  const heightDelta = movesSouth ? dy * resizeFactor : movesNorth ? -dy * resizeFactor : 0;
  let width = movesWest || movesEast
    ? widthDelta ? Math.max(1, Math.min(8192, snapPixel(bounds.width + widthDelta))) : bounds.width
    : bounds.width;
  let height = movesNorth || movesSouth
    ? heightDelta ? Math.max(1, Math.min(8192, snapPixel(bounds.height + heightDelta))) : bounds.height
    : bounds.height;
  if (event.shiftKey && bounds.width > 0 && bounds.height > 0) {
    const horizontal = movesWest || movesEast;
    const vertical = movesNorth || movesSouth;
    const widthChange = Math.abs(width - bounds.width) / bounds.width;
    const heightChange = Math.abs(height - bounds.height) / bounds.height;
    const ratio = bounds.width / bounds.height;
    const widthDrivesRatio = horizontal && (!vertical || widthChange >= heightChange);
    if (widthDrivesRatio) height = Math.max(1, Math.min(8192, snapPixel(width / ratio)));
    else width = Math.max(1, Math.min(8192, snapPixel(height * ratio)));
  }
  const centered = event.altKey;
  const left = centered ? bounds.x + (bounds.width - width) / 2
    : movesWest ? bounds.x + bounds.width - width
      : movesEast ? bounds.x : bounds.x + (bounds.width - width) / 2;
  const top = centered ? bounds.y + (bounds.height - height) / 2
    : movesNorth ? bounds.y + bounds.height - height
      : movesSouth ? bounds.y : bounds.y + (bounds.height - height) / 2;
  const scaleX = width / bounds.width;
  const scaleY = height / bounds.height;
  const updates = active.nodePositions.map((position) => {
    const currentCenterX = position.canvasX + position.canvasWidth / 2;
    const currentCenterY = position.canvasY + position.canvasHeight / 2;
    const nextCenterX = left + (currentCenterX - bounds.x) * scaleX;
    const nextCenterY = top + (currentCenterY - bounds.y) * scaleY;
    const localCenterDelta = canvasDeltaToParent(position.element, nextCenterX - currentCenterX, nextCenterY - currentCenterY);
    const parentXAxis = parentDeltaToCanvas(position.element, 1, 0);
    const parentYAxis = parentDeltaToCanvas(position.element, 0, 1);
    const node = findNode(position.nodeId);
    if (!node || !parentXAxis || !parentYAxis) return null;
    const isFlow = node.design?.position?.mode !== 'absolute';
    if (!isFlow && !localCenterDelta) return null;
    const radians = position.rotation * (Math.PI / 180);
    const nodeXAxis = {
      x: parentXAxis.x * Math.cos(radians) + parentYAxis.x * Math.sin(radians),
      y: parentXAxis.y * Math.cos(radians) + parentYAxis.y * Math.sin(radians)
    };
    const nodeYAxis = {
      x: parentXAxis.x * -Math.sin(radians) + parentYAxis.x * Math.cos(radians),
      y: parentXAxis.y * -Math.sin(radians) + parentYAxis.y * Math.cos(radians)
    };
    const scaledAxisFactor = (axis: { x: number; y: number }, axisScaleX: number, axisScaleY: number) =>
      Math.hypot(axis.x * axisScaleX, axis.y * axisScaleY) / Math.hypot(axis.x, axis.y);
    const widthFactor = scaledAxisFactor(nodeXAxis, scaleX, scaleY);
    const heightFactor = scaledAxisFactor(nodeYAxis, scaleX, scaleY);
    const scaledSize = (current: number, factor: number) => Math.abs(factor - 1) < 1e-8
      ? current
      : Math.max(1, Math.min(8192, snapPixel(current * factor)));
    const nextWidth = scaledSize(position.width, widthFactor);
    const nextHeight = scaledSize(position.height, heightFactor);
    const widthChanged = Math.abs(widthFactor - 1) >= 1e-8;
    const heightChanged = Math.abs(heightFactor - 1) >= 1e-8;
    const size: NonNullable<NodeDesign['size']> = isFlow ? {
      width: widthChanged ? nextWidth : node.design?.size?.width ?? 'hug',
      height: heightChanged ? nextHeight : node.design?.size?.height ?? 'hug'
    } : { width: nextWidth, height: nextHeight };
    const centerX = position.x + position.width / 2 + (localCenterDelta?.x ?? 0);
    const centerY = position.y + position.height / 2 + (localCenterDelta?.y ?? 0);
    return {
      nodeId: position.nodeId,
      patch: {
        ...(!isFlow ? { position: { mode: 'absolute' as const, x: clampPosition(centerX - nextWidth / 2), y: clampPosition(centerY - nextHeight / 2) } } : {}),
        size
      }
    };
  });
  return updates.every((update) => update !== null) ? updates : [];
}

function canResizeSelection(nodeIds: readonly string[]): boolean {
  const nodes = nodeIds.map((nodeId) => findNode(nodeId));
  if (nodes.some((node) => !node)) return false;
  if (nodes.every((node) => node?.design?.position?.mode === 'absolute')) return true;
  const locations = nodeIds.map((nodeId) => findPosition(nodeId));
  const firstLocation = locations[0];
  return Boolean(firstLocation && nodes.every((node) => node?.design?.position?.mode !== 'absolute') &&
    locations.every((location) => location?.parentId === firstLocation.parentId && location?.slotName === firstLocation.slotName));
}

function applyGroupResizePreview(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): void {
  const updates = groupResizeUpdates(active, event);
  updates.forEach(({ nodeId, patch }) => {
    const element = active.nodePositions.find((position) => position.nodeId === nodeId)?.element;
    if (!element) return;
    if (patch.position) {
      element.style.position = 'absolute';
      const renderedPosition = editorRenderedPosition(nodeId, patch.position.x, patch.position.y);
      element.style.left = `${renderedPosition.x}px`;
      element.style.top = `${renderedPosition.y}px`;
    }
    if (typeof patch.size?.width === 'number') element.style.width = `${patch.size.width}px`;
    if (typeof patch.size?.height === 'number') element.style.height = `${patch.size.height}px`;
  });
}

function siblingIds(nodeId: string): string[] {
  const position = findPosition(nodeId);
  const result = validation.value;
  if (!position || !result.ok) return [];
  if (!position.parentId) return result.dsl.nodes.filter((node) => node.id !== nodeId).map((node) => node.id);
  const parent = findNode(position.parentId);
  if (!parent) return [];
  if (position.slotName) {
    const slot = parent.slots.find((item) => item.name === position.slotName);
    return slot && 'children' in slot ? slot.children.filter((node) => node.id !== nodeId).map((node) => node.id) : [];
  }
  return parent.children.filter((node) => node.id !== nodeId).map((node) => node.id);
}

function clearAlignmentGuides(_parent: HTMLElement | null): void {
  panel.value?.querySelectorAll('[data-pf-editor-guide]').forEach((guide) => guide.remove());
}

function drawGuide(parent: HTMLElement, axis: 'x' | 'y', coordinate: number): void {
  const guide = document.createElement('span');
  guide.dataset.pfEditorGuide = axis;
  Object.assign(guide.style, {
    position: 'absolute', zIndex: '30', pointerEvents: 'none', background: '#ff4d4f',
    ...(axis === 'x' ? { left: `${coordinate}px`, top: '0', bottom: '0', width: '1px' }
      : { top: `${coordinate}px`, left: '0', right: '0', height: '1px' })
  });
  parent.append(guide);
}

function alignToCanvasTargets(active: NonNullable<typeof pointerTransform.value>, patch: CanvasGeometryPatch, event: PointerEvent): AlignmentResult {
  const position = patch.position;
  const unchanged = { patch, canvasCorrection: { x: 0, y: 0 } };
  if (!position || active.kind !== 'move' || active.flowParentId) return unchanged;
  const page = panel.value?.querySelector<HTMLElement>('.pulseflow-page');
  if (!page) return unchanged;
  clearAlignmentGuides(active.alignmentParent);
  const pageRect = page.getBoundingClientRect();
  const scale = props.editorZoom / 100;
  const selectedRects = active.nodePositions.map((nodePosition) => ({
    left: pageRect.left + nodePosition.canvasX * scale,
    top: pageRect.top + nodePosition.canvasY * scale,
    width: nodePosition.canvasWidth * scale,
    height: nodePosition.canvasHeight * scale,
    right: pageRect.left + (nodePosition.canvasX + nodePosition.canvasWidth) * scale,
    bottom: pageRect.top + (nodePosition.canvasY + nodePosition.canvasHeight) * scale
  })).filter((rect) => rect.width > 0 && rect.height > 0);
  if (selectedRects.length !== active.nodePositions.length) return unchanged;
  const selectionLeft = Math.min(...selectedRects.map((rect) => rect.left));
  const selectionTop = Math.min(...selectedRects.map((rect) => rect.top));
  const selectionRight = Math.max(...selectedRects.map((rect) => rect.right));
  const selectionBottom = Math.max(...selectedRects.map((rect) => rect.bottom));
  const width = selectionRight - selectionLeft;
  const height = selectionBottom - selectionTop;
  const deltaX = snapPixel((event.clientX - active.startX) / scale) * scale;
  const deltaY = snapPixel((event.clientY - active.startY) / scale) * scale;
  const currentLeft = selectionLeft + deltaX;
  const currentTop = selectionTop + deltaY;
  const next = { ...patch, position: { ...position } };
  let verticalGuide: number | undefined;
  let horizontalGuide: number | undefined;
  let correctionX = 0;
  let correctionY = 0;
  let closestX = 7;
  let closestY = 7;
  const nodesById = new Map(Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
    .map((element) => [element.dataset.pfNodeId, element] as const));
  const selectedIds = new Set(active.nodePositions.map((item) => item.nodeId));
  const targets = new Map<HTMLElement, { node: UiNode | null; element: HTMLElement; isPage: boolean }>();
  for (const [nodeId, element] of nodesById) {
    if (!nodeId || selectedIds.has(nodeId)) continue;
    let ancestor = element.parentElement?.closest<HTMLElement>('[data-pf-node-id]') ?? null;
    let belongsToSelection = false;
    while (ancestor) {
      if (selectedIds.has(ancestor.dataset.pfNodeId ?? '')) {
        belongsToSelection = true;
        break;
      }
      ancestor = ancestor.parentElement?.closest<HTMLElement>('[data-pf-node-id]') ?? null;
    }
    if (!belongsToSelection) targets.set(element, { node: findNode(nodeId), element, isPage: false });
  }
  active.nodePositions.forEach((item) => {
    const parentId = findPosition(item.nodeId)?.parentId;
    const parentNode = parentId ? findNode(parentId) : null;
    const parentElement = parentId ? nodesById.get(parentId) : page;
    if (parentElement && (!parentId || !selectedIds.has(parentId)) && (!parentNode || containerComponents.has(parentNode.type))) {
      targets.set(parentElement, { node: parentNode, element: parentElement, isPage: !parentNode });
    }
  });
  for (const target of targets.values()) {
    const rect = target.isPage ? target.element.getBoundingClientRect()
      : readCanvasVisualRect(target.node?.design?.size, target.element);
    if (!rect || !rect.width || !rect.height) continue;
    const candidatesX = [
      { left: rect.left + rect.width / 2 - width / 2, guide: rect.left + rect.width / 2 },
      { left: rect.left, guide: rect.left },
      { left: rect.right - width, guide: rect.right }
    ];
    const candidatesY = [
      { top: rect.top + rect.height / 2 - height / 2, guide: rect.top + rect.height / 2 },
      { top: rect.top, guide: rect.top },
      { top: rect.bottom - height, guide: rect.bottom }
    ];
    candidatesX.forEach(({ left, guide }) => {
      const difference = Math.abs(left - currentLeft);
      if (difference <= 6 && difference < closestX) {
        closestX = difference;
        verticalGuide = Math.round((guide - pageRect.left) / scale);
        correctionX = left - currentLeft;
      }
    });
    candidatesY.forEach(({ top, guide }) => {
      const difference = Math.abs(top - currentTop);
      if (difference <= 6 && difference < closestY) {
        closestY = difference;
        horizontalGuide = Math.round((guide - pageRect.top) / scale);
        correctionY = top - currentTop;
      }
    });
  }
  let canvasCorrection = { x: correctionX / scale, y: correctionY / scale };
  if (active.nodePositions.length === 1) {
    const localCorrection = canvasDeltaToParent(active.element, correctionX / scale, correctionY / scale);
    if (localCorrection) {
      next.position.x = Math.round(next.position.x + localCorrection.x);
      next.position.y = Math.round(next.position.y + localCorrection.y);
      canvasCorrection = parentDeltaToCanvas(active.element, localCorrection.x, localCorrection.y) ?? { x: 0, y: 0 };
    }
  }
  if (verticalGuide !== undefined) drawGuide(page, 'x', verticalGuide);
  if (horizontalGuide !== undefined) drawGuide(page, 'y', horizontalGuide);
  return { patch: next, canvasCorrection };
}

function applyPointerPreview(active: NonNullable<typeof pointerTransform.value>, event: PointerEvent): void {
  const alignment = alignToCanvasTargets(active, pointerPatch(active, event), event);
  const patch = alignment.patch;
  const groupMoves = active.nodePositions.length > 1 && active.kind === 'move'
    ? groupMoveUpdates(active, event, alignment.canvasCorrection)
    : [];
  active.nodePositions.forEach((position) => {
    const element = position.element;
    element.style.display = 'block';
    if (patch.position) {
      const groupPosition = groupMoves.find((update) => update.nodeId === position.nodeId)?.patch.position;
      const nextPosition = active.nodePositions.length > 1
        ? groupPosition
        : position.nodeId === active.nodeId ? patch.position : undefined;
      if (!nextPosition) return;
      element.style.position = 'absolute';
      const renderedPosition = editorRenderedPosition(position.nodeId, nextPosition.x, nextPosition.y);
      element.style.left = `${renderedPosition.x}px`;
      element.style.top = `${renderedPosition.y}px`;
    }
    if (position.nodeId !== active.nodeId) return;
    if (typeof patch.size?.width === 'number') element.style.width = `${patch.size.width}px`;
    if (typeof patch.size?.height === 'number') element.style.height = `${patch.size.height}px`;
    if (patch.rotation !== undefined) {
      const design = findNode(active.nodeId)?.design;
      element.style.transform = [
        `rotate(${patch.rotation}deg)`,
        ...(design?.flipX ? ['scaleX(-1)'] : []),
        ...(design?.flipY ? ['scaleY(-1)'] : [])
      ].join(' ');
    }
  });
}

function onPointerUp(event: PointerEvent): void {
  const connection = prototypeConnection.value;
  if (connection?.pointerId === event.pointerId) {
    prototypeConnection.value = null;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const target = hit instanceof Element ? hit.closest<HTMLElement>('[data-pf-node-id]') : null;
    const targetNodeId = nodeIdOf(target);
    if (targetNodeId) {
      emit('connectFrames', { sourceNodeId: connection.sourceNodeId, targetNodeId });
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const marquee = selectionMarquee.value;
  if (marquee?.pointerId === event.pointerId) {
    selectionMarquee.value = null;
    if (!marquee.moved) {
      if (!marquee.additive) emit('selectNode', null);
      event.preventDefault();
      return;
    }
    const left = Math.min(marquee.startX, event.clientX);
    const right = Math.max(marquee.startX, event.clientX);
    const top = Math.min(marquee.startY, event.clientY);
    const bottom = Math.max(marquee.startY, event.clientY);
    const containsWholeNode = event.clientX >= marquee.startX;
    const hits = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
      .flatMap((element) => {
        const nodeId = nodeIdOf(element);
        const node = nodeId ? findNode(nodeId) : null;
        if (!nodeId || !node || isNodeLocked(nodeId) || node.design?.visible === false) return [];
        const rect = readCanvasVisualRect(node.design?.size, element);
        if (rect.width <= 0 || rect.height <= 0) return [];
        const selected = containsWholeNode
          ? rect.left >= left && rect.right <= right && rect.top >= top && rect.bottom <= bottom
          : rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
        return selected ? [nodeId] : [];
      });
    const uniqueHits = [...new Set(hits)];
    if (!uniqueHits.length) {
      if (!marquee.additive) emit('selectNode', null);
    } else if (marquee.additive) {
      const currentSelection = new Set(props.selectedNodeIds ?? (props.selectedNodeId ? [props.selectedNodeId] : []));
      uniqueHits.filter((nodeId) => !currentSelection.has(nodeId)).forEach((nodeId) => emit('selectNode', nodeId, true));
    } else {
      uniqueHits.forEach((nodeId, index) => {
        if (index > 0) emit('selectNode', nodeId, true);
        else emit('selectNode', nodeId);
      });
    }
    event.preventDefault();
    return;
  }
  const placement = pointerPlacement.value;
  if (placement && placement.pointerId === event.pointerId) {
    pointerPlacement.value = null;
    if (!Number.isFinite(placement.originLeft) || !Number.isFinite(placement.originTop)) return;
    const scale = props.editorZoom / 100;
    const rootOffsetX = !placement.parentId ? editorArtboardBounds.value?.left ?? 0 : 0;
    const rootOffsetY = !placement.parentId ? editorArtboardBounds.value?.top ?? 0 : 0;
    const endX = Math.max(-8192, Math.min(8192, snapPixel((event.clientX - placement.originLeft) / scale + rootOffsetX)));
    const endY = Math.max(-8192, Math.min(8192, snapPixel((event.clientY - placement.originTop) / scale + rootOffsetY)));
    const deltaX = (event.clientX - placement.startX) / scale;
    const deltaY = (event.clientY - placement.startY) / scale;
    const dragged = Math.hypot(deltaX, deltaY) >= 4;
    const defaults: Record<CanvasTool, { width: number; height: number }> = {
      Frame: { width: 320, height: 240 }, Shape: { width: 160, height: 100 },
      Text: { width: 240, height: 32 }, Image: { width: 320, height: 180 }
    };
    const fallback = defaults[placement.tool];
    const width = dragged ? Math.max(1, snapPixel(Math.abs(deltaX))) : fallback.width;
    const height = dragged ? Math.max(1, snapPixel(Math.abs(deltaY))) : fallback.height;
    const x = dragged ? Math.min(placement.x, endX) : placement.x;
    const y = dragged ? Math.min(placement.y, endY) : placement.y;
    const parent = placement.parentId ? findNode(placement.parentId) : null;
    const flowPlaced = parent?.type === 'Frame';
    emit('placeTool', {
      type: placement.tool,
      ...(placement.tool === 'Shape' ? { shape: placement.shape } : {}),
      ...(placement.parentId ? { parentId: placement.parentId, index: flowPlaced ? flowInsertionIndex(placement.parentId, event.clientX, event.clientY) : placement.index } : {}),
      design: {
        position: flowPlaced ? { mode: 'flow', x: 0, y: 0 } : { mode: 'absolute', x, y },
        size: { width, height },
        ...(placement.tool === 'Shape' && placement.shape === 'line' && dragged && (event.clientX - placement.startX) * (event.clientY - placement.startY) < 0 ? { flipY: true } : {})
      }
    });
    event.preventDefault();
    return;
  }
  const active = pointerTransform.value;
  if (!active || active.pointerId !== event.pointerId) return;
  pointerTransform.value = null;
  flowDropGuide.value = null;
  duplicateGhosts.value = [];
  if (active.moved && active.kind === 'move' && active.flowParentId) {
    const target = flowReorderTarget(active, event, active.duplicateOnMove);
    if (target) {
      const nodeIds = active.nodePositions.map((position) => position.nodeId);
      if (active.duplicateOnMove) emit('duplicateFlowNodesAt', { nodeIds, ...target });
      else emit('reorderFlowNodes', { nodeIds, ...target });
      active.nodePositions.forEach((position) => {
        if (position.originalStyle === null) position.element.removeAttribute('style');
        else position.element.setAttribute('style', position.originalStyle);
      });
      clearAlignmentGuides(active.alignmentParent);
      event.preventDefault();
      return;
    }
  }
  const reparentTarget = active.moved ? reparentTargetAtPointer(active, event) : null;
  if (reparentTarget) {
    const positions = reparentPositions(active, reparentTarget.frameElement);
    if (positions) {
      emit('reparentNodes', { nodeIds: positions.map(({ nodeId }) => nodeId), parentId: reparentTarget.frameId, positions });
      active.nodePositions.forEach((position) => {
        if (position.originalStyle === null) position.element.removeAttribute('style');
        else position.element.setAttribute('style', position.originalStyle);
      });
      clearReparentTarget();
      clearAlignmentGuides(active.alignmentParent);
      event.preventDefault();
      return;
    }
  }
  clearReparentTarget();
  if (!active.moved) return;
  if (active.kind === 'group-resize') {
    const updates = groupResizeUpdates(active, event);
    applyGroupResizePreview(active, event);
    if (updates.length) emit('updateNodesDesign', updates);
    active.nodePositions.forEach((position) => {
      if (position.originalStyle === null) position.element.removeAttribute('style');
      else position.element.setAttribute('style', position.originalStyle);
    });
    event.preventDefault();
    return;
  }
  const alignment = alignToCanvasTargets(active, pointerPatch(active, event), event);
  const patch = alignment.patch;
  applyPointerPreview(active, event);
  if (active.duplicateOnMove && patch.position) {
    const updates = active.nodePositions.length > 1
      ? groupMoveUpdates(active, event, alignment.canvasCorrection).flatMap(({ nodeId, patch: update }) => update.position ? [{ nodeId, position: update.position }] : [])
      : [{ nodeId: active.nodeId, position: patch.position }];
    if (updates.length) emit('duplicateNodesAt', updates);
  } else if (active.nodePositions.length > 1 && patch.position) {
    const updates = groupMoveUpdates(active, event, alignment.canvasCorrection);
    if (updates.length) emit('updateNodesDesign', updates);
  } else emit('updateNodeDesign', { nodeId: active.nodeId, patch });
  active.nodePositions.forEach((position) => {
    if (position.originalStyle === null) position.element.removeAttribute('style');
    else position.element.setAttribute('style', position.originalStyle);
  });
  clearAlignmentGuides(active.alignmentParent);
}

function cancelPointerTransform(): void {
  prototypeConnection.value = null;
  pointerPlacement.value = null;
  selectionMarquee.value = null;
  flowDropGuide.value = null;
  duplicateGhosts.value = [];
  clearReparentTarget();
  suppressNextClick = false;
  const active = pointerTransform.value;
  if (active) {
    clearAlignmentGuides(active.alignmentParent);
    active.nodePositions.forEach((position) => {
      if (position.originalStyle === null) position.element.removeAttribute('style');
      else position.element.setAttribute('style', position.originalStyle);
    });
  }
  pointerTransform.value = null;
}

function onEditorClickCapture(event: MouseEvent): void {
  if (!suppressNextClick && !suppressNextEditorClick) return;
  suppressNextClick = false;
  suppressNextEditorClick = false;
  event.preventDefault();
  event.stopPropagation();
}

function onCanvasDoubleClickCapture(event: MouseEvent): void {
  if (!props.editorMode) return;
  const nodeId = nodeIdOf(eventNode(event));
  if (!nodeId || findNode(nodeId)?.type !== 'Text') return;
  event.stopPropagation();
  startTextEdit(nodeId);
}

function onCanvasKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || (!pointerTransform.value && !selectionMarquee.value)) return;
  event.preventDefault();
  cancelPointerTransform();
}

function onDragStart(event: DragEvent): void {
  if (!props.editorMode || !event.dataTransfer) return;
  const nodeId = nodeIdOf(eventNode(event));
  if (!nodeId) return;
  if (pointerTransform.value?.nodeId === nodeId && pointerTransform.value.moved) {
    event.preventDefault();
    return;
  }
  if (isNodeLocked(nodeId)) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData('application/x-pulseflow-node', nodeId);
  event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event: DragEvent): void {
  if (!props.editorMode || !event.dataTransfer) return;
  if (Array.from(event.dataTransfer.types).includes('application/x-pulseflow-image-asset')) {
    event.dataTransfer.dropEffect = 'copy';
    const target = eventNode(event) ?? (event.target instanceof Element ? event.target.closest<HTMLElement>('.pulseflow-page') : null);
    if (target) {
      if (hoveredDropNode.value !== target) clearDropIntent();
      hoveredDropNode.value = target;
      target.setAttribute('data-pf-drop-intent', 'inside');
    }
    return;
  }
  const target = eventNode(event);
  if (!target) {
    event.dataTransfer.dropEffect = Array.from(event.dataTransfer.types).includes('application/x-pulseflow-component') ? 'copy' : 'move';
    return;
  }
  const nodeId = nodeIdOf(target);
  if (!nodeId) return;
  const ratio = verticalRatio(target, event.clientY);
  const componentTypeValue = event.dataTransfer.getData('application/x-pulseflow-component');
  const componentType = isComponentType(componentTypeValue) ? componentTypeValue : '';
  const targetNode = findNode(nodeId);
  const acceptsComponent = componentType && (targetNode?.type && containerComponents.has(targetNode.type) ||
    targetNode?.type === 'PageHeader' && (componentType === 'Tag' || componentType === 'Badge'));
  const acceptsInnerDrop = Boolean(targetNode?.type && containerComponents.has(targetNode.type) || acceptsComponent);
  const intent = acceptsInnerDrop && ratio >= 0.3 && ratio <= 0.7
    ? 'inside' : ratio < 0.5 ? 'before' : 'after';
  if (hoveredDropNode.value !== target) clearDropIntent();
  hoveredDropNode.value = target;
  target.setAttribute('data-pf-drop-intent', intent);
  event.dataTransfer.dropEffect = componentType ? 'copy' : 'move';
}

function onDrop(event: DragEvent): void {
  if (!props.editorMode || !event.dataTransfer) return;
  const assetId = event.dataTransfer.getData('application/x-pulseflow-image-asset');
  if (assetId) {
    if (!/^asset-[A-Za-z0-9_-]+$/.test(assetId)) return;
    const target = event.target instanceof Element ? event.target : null;
    const page = target?.closest<HTMLElement>('.pulseflow-page');
    if (!page) return;
    const targetElement = eventNode(event);
    const targetNodeId = nodeIdOf(targetElement);
    const targetNode = targetNodeId ? findNode(targetNodeId) : null;
    const targetPosition = targetNodeId ? findPosition(targetNodeId) : null;
    let parentId: string | null = null;
    let index = validation.value.ok ? validation.value.dsl.nodes.length : 0;
    let coordinateRoot = page;
    if (targetNode && targetElement && containerComponents.has(targetNode.type)) {
      parentId = targetNode.id;
      index = targetNode.children.length;
      coordinateRoot = targetElement;
    } else if (targetNode && targetNodeId && targetPosition) {
      const originalParent = targetPosition.parentId ? findNode(targetPosition.parentId) : null;
      if (originalParent && targetPosition.parentId && containerComponents.has(originalParent.type)) {
        parentId = originalParent.id;
        index = targetPosition.index + 1;
        coordinateRoot = Array.from(panel.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
          .find((element) => element.dataset.pfNodeId === originalParent.id) ?? page;
        if (coordinateRoot === page) parentId = null;
      } else if (!targetPosition.parentId) {
        index = targetPosition.index + 1;
      }
    }
    const rect = coordinateRoot.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = props.editorZoom / 100;
    const snap = (value: number) => Math.max(-8192, Math.min(8192, snapPixel(value)));
    emit('dropImageAsset', {
      assetId,
      target: { parentId, index },
      position: { mode: 'absolute', x: snap((event.clientX - rect.left) / scale + (!parentId ? editorArtboardBounds.value?.left ?? 0 : 0)), y: snap((event.clientY - rect.top) / scale + (!parentId ? editorArtboardBounds.value?.top ?? 0 : 0)) }
    });
    return;
  }
  const componentValue = event.dataTransfer.getData('application/x-pulseflow-component');
  const componentType = isComponentType(componentValue) ? componentValue : '';
  const movingNodeId = event.dataTransfer.getData('application/x-pulseflow-node');
  const targetElement = eventNode(event);
  const targetNodeId = nodeIdOf(targetElement);
  clearDropIntent();
  if (componentType) {
    const targetNode = targetNodeId ? findNode(targetNodeId) : null;
    if (!targetNode) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.pulseflow-preview')) return;
      const result = validation.value;
      if (result.ok) emit('insertComponent', { type: componentType, parentId: null, index: result.dsl.nodes.length });
      return;
    }
    const ratio = verticalRatio(targetElement!, event.clientY);
    const isHeaderTag = targetNode.type === 'PageHeader' && (componentType === 'Tag' || componentType === 'Badge');
    if ((containerComponents.has(targetNode.type) || isHeaderTag) && ratio >= 0.3 && ratio <= 0.7) {
      if (targetNode.type === 'PageHeader') {
        const slot = targetNode.slots.find((item) => item.name === 'tags');
        emit('insertComponent', { type: componentType, parentId: targetNode.id, slotName: 'tags', index: slot && 'children' in slot ? slot.children.length : 0 });
      } else emit('insertComponent', { type: componentType, parentId: targetNode.id, index: targetNode.children.length });
      return;
    }
    const position = findPosition(targetNode.id);
    if (!position) return;
    emit('insertComponent', { type: componentType, ...position, index: position.index + (ratio < 0.5 ? 0 : 1) });
    return;
  }
  if (!movingNodeId) return;
  if (!targetNodeId) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.pulseflow-preview')) return;
    const result = validation.value;
    if (result.ok) emit('moveNode', { nodeId: movingNodeId, parentId: null, index: result.dsl.nodes.length });
    return;
  }
  const targetNode = findNode(targetNodeId);
  if (!targetNode) return;
  const ratio = verticalRatio(targetElement!, event.clientY);
  let dropTarget: NodeDropTarget | null = null;
  if (containerComponents.has(targetNode.type) && ratio >= 0.3 && ratio <= 0.7) {
    dropTarget = { parentId: targetNode.id, index: targetNode.children.length };
  } else if (targetNode.type === 'PageHeader' && (findNode(movingNodeId)?.type === 'Tag' || findNode(movingNodeId)?.type === 'Badge') && ratio >= 0.3 && ratio <= 0.7) {
    const slot = targetNode.slots.find((item) => item.name === 'tags');
    dropTarget = { parentId: targetNode.id, slotName: 'tags', index: slot && 'children' in slot ? slot.children.length : 0 };
  } else {
    dropTarget = relativeDropTarget(props.dsl, movingNodeId, targetNodeId, ratio < 0.5 ? 'before' : 'after');
  }
  if (!dropTarget) {
    emit('dropRejected', '无法确定该位置，请拖到对象前后或可容纳子图层的容器中央。');
    return;
  }
  const assessment = canDropNode(props.dsl, movingNodeId, dropTarget);
  if (!assessment.allowed) {
    emit('dropRejected', assessment.reason);
    return;
  }
  emit('moveNode', { nodeId: movingNodeId, ...assessment.target });
}

const editorOptions = computed<EditorRenderOptions | undefined>(() => props.editorMode ? {
    selectedNodeId: props.selectedNodeId,
    selectedNodeIds: props.selectedNodeIds,
    selectionBounds: selectionBounds.value,
    canResizeGroup: canResizeSelection(props.selectedNodeIds ?? []),
    isNodeLocked,
    onSelectNode: (nodeId, additive) => {
      if (additive) emit('selectNode', nodeId, true);
      else emit('selectNode', nodeId);
    },
    editingTextNodeId: editingTextNodeId.value,
    prototypeMode: props.prototypeMode,
    onStartTextEdit: startTextEdit,
    onCommitTextEdit: commitTextEdit,
    onCancelTextEdit: cancelTextEdit
  } : undefined);
const PreviewContent = defineComponent({
  props: {
    dsl: { type: null as unknown as PropType<unknown>, required: true },
    data: { type: Object as PropType<PreviewData>, required: true },
    handlers: { type: Object as PropType<EventHandlers>, required: true },
    assetUrls: { type: Object as PropType<ReadonlyMap<string, string>>, required: true },
    editorOptions: { type: Object as PropType<EditorRenderOptions | undefined>, default: undefined }
  },
  setup(contentProps) {
    return () => {
      return renderPage(contentProps.dsl, contentProps.data, contentProps.handlers, contentProps.assetUrls, contentProps.editorOptions);
    };
  }
});
</script>

<template>
  <section ref="panel" class="preview-panel" :class="{ 'preview-panel--editor': editorMode, 'preview-panel--artboard': isArtboardMode, 'preview-panel--placing': insertTool }" :data-editor-artboard="editorArtboardBounds ? 'true' : undefined" :style="editorCanvasStyle" :aria-label="editorMode ? '可编辑页面画布' : isArtboardMode ? '固定尺寸画板预览' : '页面预览'" tabindex="-1" @scroll.capture="refreshPrototypeLines" @keydown="onCanvasKeyDown" @click.capture="onEditorClickCapture" @dblclick.capture="onCanvasDoubleClickCapture" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="cancelPointerTransform" @lostpointercapture="cancelPointerTransform" @dragstart="onDragStart" @dragover.prevent="onDragOver" @dragleave="clearDropIntent" @drop.capture="clearDropIntent" @drop.prevent="onDrop">
    <header v-if="!isArtboardMode" class="preview-panel__header"><h2>实时预览</h2><span data-testid="preview-status">{{ validation.ok ? '预览就绪' : '预览待修复' }}</span></header>
    <p v-if="!validation.ok" class="preview-panel__error" role="alert">{{ validation.diagnostics.map((item) => item.code).join(' · ') }}</p>
    <PreviewContent v-else :dsl="dsl" :data="data" :handlers="activeHandlers" :asset-urls="resolvedAssetUrls" :editor-options="editorOptions" />
    <svg v-if="prototypeMode && (savedPrototypeLines.length || prototypeLine)" class="prototype-connection-preview" aria-hidden="true">
      <defs><marker id="pf-prototype-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" /></marker></defs>
      <line v-for="link in savedPrototypeLines" :key="`${link.sourceNodeId}-${link.targetNodeId}`" :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2" marker-end="url(#pf-prototype-arrow)" />
      <line v-if="prototypeLine" class="prototype-link-draft" :x1="prototypeLine.x1" :y1="prototypeLine.y1" :x2="prototypeLine.x2" :y2="prototypeLine.y2" marker-end="url(#pf-prototype-arrow)" />
    </svg>
    <div v-if="pointerPlacement" class="placement-preview" :style="placementPreviewStyle" aria-hidden="true"></div>
    <div v-if="flowDropGuide" class="flow-drop-guide" :style="flowDropGuideStyle" aria-hidden="true"></div>
    <div v-for="(style, index) in duplicateGhostStyles" :key="index" class="duplicate-ghost" :style="style" aria-hidden="true"></div>
    <div v-if="selectionMarquee?.moved" class="selection-marquee" :class="{ 'selection-marquee--additive': selectionMarquee.additive }" :style="selectionMarqueeStyle" data-testid="selection-marquee" aria-hidden="true"></div>
    <p v-if="imageAssetError" class="preview-panel__error" role="status">{{ imageAssetError }}</p>
    <p v-if="lastEvent" class="preview-panel__event" role="status">{{ lastEvent }}</p>
  </section>
</template>

<style scoped>
.preview-panel{min-width:0;border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);background:var(--pf-color-surface);min-height:180px;margin-top:var(--pf-space-5);box-shadow:var(--pf-shadow-sm);overflow:hidden}
.preview-panel__header{display:flex;justify-content:space-between;align-items:center;gap:var(--pf-space-3);padding:var(--pf-space-3) var(--pf-space-4);border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.preview-panel__header h2{font-size:var(--pf-font-size-lg);font-weight:600;color:var(--pf-color-text);margin:0}
.preview-panel__header span{font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary)}
.preview-panel__error{color:var(--pf-color-error-text);margin:var(--pf-space-4)}
.preview-panel__event{display:inline-block;margin:0 var(--pf-space-4) var(--pf-space-4);background:#e6f4ff;color:var(--pf-color-primary-strong);padding:var(--pf-space-1) var(--pf-space-2);border-radius:var(--pf-radius-sm);font-size:var(--pf-font-size-sm)}
.preview-panel :deep(.pulseflow-preview){display:grid;gap:var(--pf-space-4);min-width:0;margin:var(--pf-space-4);padding:var(--pf-space-5);background:var(--pf-color-surface);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);box-shadow:var(--pf-shadow-sm);overflow-x:auto}
.preview-panel--editor{position:relative;margin-top:0;box-shadow:none;border:0;border-radius:0;background:transparent;overflow:visible}
.preview-panel--placing :deep(.pulseflow-page){cursor:crosshair}
.placement-preview{position:absolute;z-index:50;pointer-events:none;border:1px solid #1677ff;background:rgba(22,119,255,.12);box-shadow:0 0 0 1px rgba(22,119,255,.12)}
.flow-drop-guide{position:absolute;z-index:48;pointer-events:none;background:#1677ff;box-shadow:0 0 0 1px #fff9}
.duplicate-ghost{position:absolute;z-index:47;pointer-events:none;box-sizing:border-box;border:1px dashed #1677ff;border-radius:3px;background:rgba(22,119,255,.12);box-shadow:0 0 0 1px #fff8}
.selection-marquee{position:absolute;z-index:49;pointer-events:none;border:1px solid #1677ff;background:rgba(22,119,255,.12)}.selection-marquee--additive{border-style:dashed;background:rgba(22,119,255,.08)}
.preview-panel--artboard :deep(.pulseflow-preview){display:block;width:max-content;min-width:0;margin:0 auto;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;overflow:visible}
.preview-panel--editor :deep(.pulseflow-page[data-pf-multi-frame="true"]){background:transparent}
.preview-panel--artboard[data-editor-artboard="true"] :deep(.pulseflow-page){box-sizing:border-box;width:var(--pf-editor-artboard-width);max-width:none;min-height:var(--pf-editor-artboard-height);height:var(--pf-editor-artboard-height);margin:0;padding:0;display:block}
.preview-panel--editor :deep(.pf-editor-node[data-pf-node-id]){display:contents;cursor:grab}
.preview-panel--editor :deep(.pf-editor-node.pf-editor-node--designed[data-pf-node-id]){display:block;cursor:grab}
.preview-panel--editor :deep(.pf-editor-node[data-pf-drop-intent="before"] > *){box-shadow:inset 0 3px 0 var(--pf-color-primary)}
.preview-panel--editor :deep(.pf-editor-node[data-pf-drop-intent="after"] > *){box-shadow:inset 0 -3px 0 var(--pf-color-primary)}
.preview-panel--editor :deep(.pf-editor-node[data-pf-drop-intent="inside"] > *){outline:2px dashed var(--pf-color-primary);outline-offset:3px}
.preview-panel--editor :deep(.pf-editor-node[data-pf-reparent-target="true"] > *){outline:2px solid #1677ff;outline-offset:4px;box-shadow:0 0 0 4px rgba(22,119,255,.14)}
.preview-panel--editor :deep(.pf-editor-node[data-pf-node-selected="true"] > *){outline:2px solid var(--pf-color-primary);outline-offset:2px}
.preview-panel--editor :deep(.pf-text[contenteditable="true"]){outline:1px solid var(--pf-color-primary);outline-offset:3px;border-radius:2px;cursor:text;white-space:pre-wrap}
.preview-panel--editor :deep(.pf-editor-node[data-pf-locked="true"]){cursor:not-allowed}
.prototype-connection-preview{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:40}.prototype-connection-preview line{stroke:#1677ff;stroke-width:2;vector-effect:non-scaling-stroke}.prototype-connection-preview .prototype-link-draft{stroke-dasharray:6 4}.prototype-connection-preview marker path{fill:#1677ff}
@media(max-width:760px){.preview-panel__header{align-items:flex-start;flex-direction:column}.preview-panel :deep(.pulseflow-preview){margin:var(--pf-space-2);padding:var(--pf-space-3)}}
</style>
