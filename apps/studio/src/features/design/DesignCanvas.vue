<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue';
import type { ReadonlyDesignNode } from './design-store';
import PreviewPanel from '../preview/PreviewPanel.vue';
import { getRootArtboardBounds, type PreviewData } from '@pulseflow/page-generator';
import type { ComponentType } from '@pulseflow/ui-dsl';
import type { NodeDesign } from '@pulseflow/ui-dsl';
import DesignToolbar from './DesignToolbar.vue';
import { clampCanvasZoom, getCanvasPanCorrection, useCanvasViewport } from './use-canvas-viewport';

type CanvasTool = 'Frame' | 'Shape' | 'Text' | 'Image';
type ShapeType = 'rectangle' | 'ellipse' | 'line';
const props = defineProps<{ nodes: readonly ReadonlyDesignNode[]; selectedNodeId: string | null; selectedNodeIds?: readonly string[]; dsl: unknown; previewData: PreviewData; canUndo: boolean; canRedo: boolean; hasSelection?: boolean; canPaste?: boolean; canGroup?: boolean; canAutoLayout?: boolean; canUngroup?: boolean; interactionDisabled?: boolean; prototypeMode?: boolean }>();
const emit = defineEmits<{
  undo: [];
  redo: [];
  copySelection: [];
  pasteSelection: [];
  duplicateSelection: [];
  groupSelection: [];
  autoLayoutSelection: [];
  ungroupSelection: [];
  select: [nodeId: string | null, additive?: boolean];
  selectNodes: [nodeIds: string[], mode: 'replace' | 'add' | 'toggle'];
  move: [payload: { nodeId: string; parentId: string | null; index: number; slotName?: 'tags' }];
  reorderFlowNodes: [payload: { nodeIds: string[]; parentId: string; index: number }];
  reparentNodes: [payload: { nodeIds: string[]; parentId: string; positions: Array<{ nodeId: string; position: NonNullable<NodeDesign['position']> }> }];
  addComponent: [payload: { type: ComponentType; parentId: string | null; index: number; slotName?: 'tags' }];
  dropRejected: [reason: string];
  updateNodeDesign: [payload: { nodeId: string; patch: Partial<NodeDesign> }];
  updateNodesDesign: [updates: Array<{ nodeId: string; patch: Partial<NodeDesign> }>];
  updateNodeText: [payload: { nodeId: string; text: string }];
  placeTool: [payload: { type: CanvasTool; shape?: ShapeType; design: Pick<NodeDesign, 'position' | 'size' | 'flipY'>; parentId?: string; index?: number }];
  dropImageAsset: [payload: { assetId: string; target: { parentId: string | null; index: number }; position: NonNullable<NodeDesign['position']> }];
  duplicateNodesAt: [updates: Array<{ nodeId: string; position: NonNullable<NodeDesign['position']> }>];
  duplicateFlowNodesAt: [payload: { nodeIds: string[]; parentId: string; index: number }];
  connectFrames: [payload: { sourceNodeId: string; targetNodeId: string }];
}>();
function forwardSelect(nodeId: string | null, additive?: boolean): void {
  if (additive) emit('select', nodeId, true);
  else emit('select', nodeId);
}
const viewport = useCanvasViewport();
const artboardBounds = computed(() => getRootArtboardBounds(props.nodes));
const logicalCanvasWidth = computed(() => artboardBounds.value?.width ?? viewport.width.value);
const logicalCanvasHeight = computed(() => artboardBounds.value?.height ?? 720);
const canvasWidth = logicalCanvasWidth;
const activeTool = shallowRef<CanvasTool | null>(null);
const shapeType = shallowRef<ShapeType>('rectangle');
const assistantStyle = shallowRef<Record<string, string>>({ right: '24px', bottom: '82px', left: 'auto', top: 'auto' });
const assistantCompact = shallowRef(false);
const workspace = useTemplateRef<HTMLDivElement>('workspace');
const artboardShell = useTemplateRef<HTMLDivElement>('artboardShell');
const canvasStage = useTemplateRef<HTMLDivElement>('canvasStage');
const activePan = shallowRef<{ x: number; y: number } | null>(null);
const marquee = shallowRef<{ pointerId: number; startX: number; startY: number; currentX: number; currentY: number; additive: boolean } | null>(null);
const rootPlacement = shallowRef<{ pointerId: number; tool: CanvasTool; shape: ShapeType; startX: number; startY: number; x: number; y: number; currentX: number; currentY: number } | null>(null);
const spaceHeld = shallowRef(false);
let resizeObserver: ResizeObserver | undefined;
let hasManualViewportAdjustment = false;
let wheelZoomRemainder = 0;

const shellStyle = computed(() => ({
  width: `${Math.round(canvasWidth.value * viewport.zoom.value / 100)}px`,
  height: `${Math.round(logicalCanvasHeight.value * viewport.zoom.value / 100)}px`
}));
const stageStyle = computed(() => ({
  width: `${canvasWidth.value}px`,
  height: `${logicalCanvasHeight.value}px`,
  transform: `translate(${viewport.pan.value.x}px, ${viewport.pan.value.y}px) scale(${viewport.zoom.value / 100})`
}));
function updateAssistantPlacement(): void {
  const surface = workspace.value;
  const stage = canvasStage.value;
  if (!surface || !stage) return;
  const maxHeight = Math.max(160, Math.min(window.innerHeight * 0.62, surface.clientHeight - 32));
  const fallback = { right: '24px', bottom: '82px', left: 'auto', top: 'auto', width: `min(400px, ${Math.max(180, surface.clientWidth - 32)}px)`, maxHeight: `${maxHeight}px` };
  const roots = props.nodes.flatMap((node) => {
    const element = stage.querySelector<HTMLElement>(`[data-pf-node-id="${node.id}"]`);
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? [rect] : [];
  });
  if (!roots.length) {
    assistantStyle.value = fallback;
    assistantCompact.value = false;
    return;
  }
  const surfaceRect = surface.getBoundingClientRect();
  const artboardLeft = Math.min(...roots.map((rect) => rect.left));
  const artboardRight = Math.max(...roots.map((rect) => rect.right));
  const rightSpace = surfaceRect.right - artboardRight;
  const leftSpace = artboardLeft - surfaceRect.left;
  const panelWidth = Math.min(400, Math.max(180, surface.clientWidth - 32));
  const scrollLeft = surface.scrollLeft;
  const scrollTop = surface.scrollTop;
  const topLimit = Math.max(scrollTop + 16, scrollTop + surface.clientHeight - Math.min(window.innerHeight * 0.62, surface.clientHeight - 32));
  const desiredTop = Math.max(scrollTop + 16, roots[0]!.top - surfaceRect.top + scrollTop + 64);
  const top = Math.min(desiredTop, topLimit);
  if (rightSpace >= panelWidth + 32) {
    assistantStyle.value = { left: `${artboardRight - surfaceRect.left + scrollLeft + 16}px`, top: `${top}px`, right: 'auto', bottom: 'auto', width: `${panelWidth}px`, maxHeight: `${maxHeight}px` };
    assistantCompact.value = false;
    return;
  }
  if (leftSpace >= panelWidth + 32) {
    assistantStyle.value = { left: `${artboardLeft - surfaceRect.left + scrollLeft - panelWidth - 16}px`, top: `${top}px`, right: 'auto', bottom: 'auto', width: `${panelWidth}px`, maxHeight: `${maxHeight}px` };
    assistantCompact.value = false;
    return;
  }
  assistantStyle.value = { left: `${scrollLeft + surface.clientWidth - 60}px`, top: `${scrollTop + Math.max(16, surface.clientHeight - 132)}px`, right: 'auto', bottom: 'auto' };
  assistantCompact.value = true;
}
watch([() => props.nodes, viewport.zoom, viewport.pan], async () => {
  await nextTick();
  updateAssistantPlacement();
}, { flush: 'post' });
const marqueeStyle = computed(() => {
  const box = marquee.value;
  const surface = workspace.value?.getBoundingClientRect();
  if (!box || !surface) return {};
  return {
    left: `${Math.min(box.startX, box.currentX) - surface.left + (workspace.value?.scrollLeft ?? 0)}px`,
    top: `${Math.min(box.startY, box.currentY) - surface.top + (workspace.value?.scrollTop ?? 0)}px`,
    width: `${Math.abs(box.currentX - box.startX)}px`,
    height: `${Math.abs(box.currentY - box.startY)}px`
  };
});

function fitCanvas(automatic = false) {
  if (automatic && hasManualViewportAdjustment) return;
  const surface = workspace.value;
  if (!surface) return;
  const availableWidth = surface.clientWidth - 32;
  const availableHeight = surface.clientHeight - 112;
  viewport.fitToViewport(availableWidth, logicalCanvasWidth.value, availableHeight, logicalCanvasHeight.value);
  if (!automatic) hasManualViewportAdjustment = false;
}

watch([logicalCanvasWidth, logicalCanvasHeight], () => fitCanvas(true));

function isKeyboardControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editable = target instanceof HTMLElement && target.isContentEditable;
  const nativeControl = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  const interactiveControl = target.closest('button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="combobox"], [role="spinbutton"], [role="listbox"], [role="textbox"], .monaco-editor');
  return Boolean(editable || nativeControl || interactiveControl);
}

function onKeyDown(event: KeyboardEvent) {
  if (props.interactionDisabled) return;
  if (event.key === 'Escape') {
    if (event.defaultPrevented || isKeyboardControlTarget(event.target)) return;
    if (activeTool.value) {
      activeTool.value = null;
      event.preventDefault();
      return;
    }
    if (props.selectedNodeIds?.length || props.selectedNodeId) {
      emit('select', null);
      event.preventDefault();
    }
    return;
  }
  if (!isKeyboardControlTarget(event.target) && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (event.code === 'Digit1') {
      fitCanvas();
      event.preventDefault();
      return;
    }
    if (event.code === 'Digit2' && (props.selectedNodeIds?.length || props.selectedNodeId)) {
      void zoomToSelection();
      event.preventDefault();
      return;
    }
  }
  if (!isKeyboardControlTarget(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const tools: Record<string, CanvasTool | null> = { v: null, f: 'Frame', r: 'Shape', t: 'Text', i: 'Image' };
    const key = event.key.toLowerCase();
    if (Object.hasOwn(tools, key)) {
      activeTool.value = tools[key] ?? null;
      event.preventDefault();
      return;
    }
  }
  if (event.defaultPrevented || event.code !== 'Space' || isKeyboardControlTarget(event.target)) return;
  spaceHeld.value = true;
  event.preventDefault();
}

function onKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') spaceHeld.value = false;
}

function startPan(event: PointerEvent) {
  const target = event.target instanceof Element ? event.target : null;
  // Space plus drag and middle-button drag pan the canvas; they take precedence over tool
  // placement and marquee selection so a held Space never starts a marquee.
  if (event.button === 1 || (event.button === 0 && spaceHeld.value)) {
    marquee.value = null;
    rootPlacement.value = null;
    hasManualViewportAdjustment = true;
    activePan.value = { x: event.clientX, y: event.clientY };
    workspace.value?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (activeTool.value && event.button === 0 && !target?.closest('.design-toolbar, .design-chat, [data-pf-node-id], .pulseflow-page')) {
    const stageRect = canvasStage.value?.getBoundingClientRect();
    if (!stageRect) return;
    const scale = viewport.zoom.value / 100;
    const snap = (value: number) => Math.max(-8192, Math.min(8192, Math.round(value)));
    rootPlacement.value = {
      pointerId: event.pointerId, tool: activeTool.value, shape: shapeType.value,
      startX: event.clientX, startY: event.clientY,
      x: snap((event.clientX - stageRect.left) / scale + (artboardBounds.value?.left ?? 0)),
      y: snap((event.clientY - stageRect.top) / scale + (artboardBounds.value?.top ?? 0)),
      currentX: event.clientX, currentY: event.clientY
    };
    workspace.value?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.button === 0 && !activeTool.value && !props.interactionDisabled && isMarqueeStartTarget(target)) {
    marquee.value = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, additive: event.shiftKey || event.metaKey || event.ctrlKey };
    workspace.value?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
}

function isMarqueeStartTarget(target: Element | null): boolean {
  if (!target || target.closest('.design-toolbar, .design-chat, [data-pf-resize-handle], [data-pf-rotation-handle], [data-pf-prototype-handle], button, input, textarea, select, [role="button"]')) return false;
  const onNode = Boolean(target.closest('[data-pf-node-id]'));
  if (onNode) return false;
  const page = target.closest('.pulseflow-page');
  return !page || target === page;
}

function movePan(event: PointerEvent) {
  if (marquee.value?.pointerId === event.pointerId) {
    marquee.value = { ...marquee.value, currentX: event.clientX, currentY: event.clientY };
    event.preventDefault();
    return;
  }
  if (rootPlacement.value?.pointerId === event.pointerId) {
    rootPlacement.value = { ...rootPlacement.value, currentX: event.clientX, currentY: event.clientY };
    event.preventDefault();
    return;
  }
  if (!activePan.value) return;
  viewport.panBy(event.clientX - activePan.value.x, event.clientY - activePan.value.y);
  activePan.value = { x: event.clientX, y: event.clientY };
}

function endPan(event?: PointerEvent) {
  const selectionBox = marquee.value;
  if (selectionBox && event?.pointerId === selectionBox.pointerId) {
    marquee.value = null;
    const distance = Math.hypot(event.clientX - selectionBox.startX, event.clientY - selectionBox.startY);
    if (distance < 4) emit('select', null);
    else selectNodesInMarquee(selectionBox, event.clientX, event.clientY);
    event.preventDefault();
    return;
  }
  activePan.value = null;
  const placement = rootPlacement.value;
  if (!placement || event?.pointerId !== placement.pointerId) return;
  rootPlacement.value = null;
  const stageRect = canvasStage.value?.getBoundingClientRect();
  if (!stageRect) return;
  const scale = viewport.zoom.value / 100;
  const snap = (value: number) => Math.max(-8192, Math.min(8192, Math.round(value)));
  const endX = snap((event.clientX - stageRect.left) / scale + (artboardBounds.value?.left ?? 0));
  const endY = snap((event.clientY - stageRect.top) / scale + (artboardBounds.value?.top ?? 0));
  const dragged = Math.hypot(event.clientX - placement.startX, event.clientY - placement.startY) >= 4;
  const defaults: Record<CanvasTool, { width: number; height: number }> = {
    Frame: { width: 320, height: 240 }, Shape: { width: 160, height: 100 }, Text: { width: 240, height: 32 }, Image: { width: 320, height: 180 }
  };
  const fallback = defaults[placement.tool];
  const width = dragged ? Math.max(1, Math.abs(endX - placement.x)) : fallback.width;
  const height = dragged ? Math.max(1, Math.abs(endY - placement.y)) : fallback.height;
  emit('placeTool', {
    type: placement.tool,
    ...(placement.tool === 'Shape' ? { shape: placement.shape } : {}),
    design: {
      position: { mode: 'absolute', x: dragged ? Math.min(placement.x, endX) : placement.x, y: dragged ? Math.min(placement.y, endY) : placement.y },
      size: { width, height },
      ...(placement.tool === 'Shape' && placement.shape === 'line' && dragged && (event.clientX - placement.startX) * (event.clientY - placement.startY) < 0 ? { flipY: true } : {})
    },
    index: props.nodes.length
  });
  event.preventDefault();
}

function selectNodesInMarquee(box: NonNullable<typeof marquee.value>, endX: number, endY: number): void {
  const left = Math.min(box.startX, endX);
  const right = Math.max(box.startX, endX);
  const top = Math.min(box.startY, endY);
  const bottom = Math.max(box.startY, endY);
  const containsWholeNode = endX >= box.startX;
  const lockedIds = new Set<string>();
  const hiddenIds = new Set<string>();
  const collectStates = (nodes: readonly ReadonlyDesignNode[], parentLocked = false, parentHidden = false): void => {
    nodes.forEach((node) => {
      const locked = parentLocked || node.design?.locked === true;
      const hidden = parentHidden || node.design?.visible === false;
      if (locked) lockedIds.add(node.id);
      if (hidden) hiddenIds.add(node.id);
      collectStates(node.children, locked, hidden);
      node.slots.forEach((slot) => { if ('children' in slot) collectStates(slot.children, locked, hidden); });
    });
  };
  collectStates(props.nodes);
  const visibleNodes = Array.from(canvasStage.value?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? []);
  const selectedIds = visibleNodes
    .flatMap((element) => {
      const nodeId = element.dataset.pfNodeId;
      const rect = element.getBoundingClientRect();
      const fullyContained = rect.width > 0 && rect.height > 0 && rect.left >= left && rect.right <= right && rect.top >= top && rect.bottom <= bottom;
      const intersects = rect.width > 0 && rect.height > 0 && rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
      const hasSelectableChildren = Boolean(element.querySelector('[data-pf-node-id]'));
      const boxSelectsNode = containsWholeNode ? fullyContained : intersects && (!hasSelectableChildren || fullyContained);
      return nodeId && boxSelectsNode && !lockedIds.has(nodeId) && !hiddenIds.has(nodeId) ? [nodeId] : [];
    });
  const mode = box.additive ? 'add' : 'replace';
  emit('selectNodes', selectedIds, mode);
}

function cancelWorkspacePointer(): void {
  rootPlacement.value = null;
  marquee.value = null;
  activePan.value = null;
}

const rootPlacementStyle = computed(() => {
  const placement = rootPlacement.value;
  const surface = workspace.value?.getBoundingClientRect();
  if (!placement || !surface) return {};
  return {
    left: `${Math.min(placement.startX, placement.currentX) - surface.left}px`,
    top: `${Math.min(placement.startY, placement.currentY) - surface.top}px`,
    width: `${Math.max(2, Math.abs(placement.currentX - placement.startX))}px`,
    height: `${Math.max(2, Math.abs(placement.currentY - placement.startY))}px`
  };
});

function selectTool(type: CanvasTool | 'select'): void {
  activeTool.value = type === 'select' ? null : type;
}

function selectShape(shape: ShapeType): void {
  shapeType.value = shape;
}

function zoomAround(amount: number, anchor?: { x: number; y: number }): void {
  const workspaceElement = workspace.value;
  const workspaceRect = workspaceElement?.getBoundingClientRect();
  const shellRect = artboardShell.value?.getBoundingClientRect();
  const fromOrigin = workspaceRect && shellRect
    ? { x: shellRect.left - workspaceRect.left, y: shellRect.top - workspaceRect.top }
    : { x: 0, y: 0 };
  const previousZoom = viewport.zoom.value;
  const nextZoom = clampCanvasZoom(previousZoom + amount);
  if (previousZoom !== nextZoom) hasManualViewportAdjustment = true;
  const nextShellWidth = Math.round(canvasWidth.value * nextZoom / 100);
  const toOrigin = { x: Math.max(0, ((workspaceElement?.clientWidth ?? 0) - nextShellWidth) / 2), y: fromOrigin.y };
  const panCorrection = getCanvasPanCorrection({ fromOrigin, toOrigin, fromZoom: previousZoom, toZoom: nextZoom });
  viewport.zoomBy(amount, anchor);
  viewport.panBy(panCorrection.x, panCorrection.y);
}

function handleCanvasWheel(event: WheelEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('.design-toolbar, .design-chat, button, input, textarea, select, [role="button"], [contenteditable="true"]')) return;

  const workspaceElement = workspace.value;
  if (!workspaceElement) return;
  const pixels = (delta: number, axis: 'x' | 'y'): number => {
    if (event.deltaMode === 1) {
      const styles = window.getComputedStyle(workspaceElement);
      const lineHeight = Number.parseFloat(styles.lineHeight);
      const fontSize = Number.parseFloat(styles.fontSize);
      return delta * (Number.isFinite(lineHeight) ? lineHeight : Number.isFinite(fontSize) ? fontSize * 1.2 : 16);
    }
    if (event.deltaMode === 2) return delta * (axis === 'x' ? workspaceElement.clientWidth : workspaceElement.clientHeight);
    return delta;
  };
  const deltaX = pixels(event.deltaX, 'x');
  const deltaY = pixels(event.deltaY, 'y');
  const horizontalDelta = event.shiftKey && Math.abs(deltaX) < 0.01 ? deltaY : deltaX;
  const verticalDelta = event.shiftKey ? 0 : deltaY;
  if (event.ctrlKey || event.metaKey) {
    const delta = deltaY || deltaX;
    if (delta === 0) return;
    event.preventDefault();
    hasManualViewportAdjustment = true;
    const rect = workspaceElement.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const accumulatedZoom = wheelZoomRemainder - delta * 0.1;
    const zoomStep = Math.trunc(accumulatedZoom);
    wheelZoomRemainder = accumulatedZoom - zoomStep;
    if (zoomStep !== 0) zoomAround(zoomStep, anchor);
    return;
  }

  if (horizontalDelta === 0 && verticalDelta === 0) return;
  event.preventDefault();
  hasManualViewportAdjustment = true;
  viewport.panBy(-horizontalDelta, -verticalDelta);
}

function zoomAtCenter(amount: number): void {
  const element = workspace.value;
  zoomAround(amount, element ? { x: element.clientWidth / 2, y: element.clientHeight / 2 } : undefined);
}

function readSelectedClientBounds(): { left: number; top: number; right: number; bottom: number } | null {
  const stage = canvasStage.value;
  const selectedNodeIds = props.selectedNodeIds?.length ? props.selectedNodeIds : props.selectedNodeId ? [props.selectedNodeId] : [];
  const selectedIds = new Set(selectedNodeIds);
  if (!stage || !selectedIds.size) return null;
  const rects = Array.from(stage.querySelectorAll<HTMLElement>('[data-pf-node-id]'))
    .filter((element) => selectedIds.has(element.dataset.pfNodeId ?? ''))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom))
  };
}

async function zoomToSelection(): Promise<void> {
  const surface = workspace.value;
  const surfaceRect = surface?.getBoundingClientRect();
  const bounds = readSelectedClientBounds();
  if (!surface || !surfaceRect || !bounds) return;
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (width <= 0 || height <= 0) return;
  const availableWidth = Math.max(1, surface.clientWidth - 64);
  const availableHeight = Math.max(1, surface.clientHeight - 112);
  const fitRatio = Math.min(availableWidth / width, availableHeight / height);
  const targetZoom = clampCanvasZoom(viewport.zoom.value * fitRatio);
  const anchor = { x: (bounds.left + bounds.right) / 2 - surfaceRect.left, y: (bounds.top + bounds.bottom) / 2 - surfaceRect.top };
  hasManualViewportAdjustment = true;
  zoomAround(targetZoom - viewport.zoom.value, anchor);
  await nextTick();
  const nextBounds = readSelectedClientBounds();
  const nextSurface = workspace.value;
  if (!nextBounds || !nextSurface) return;
  const currentCenterX = (nextBounds.left + nextBounds.right) / 2 - nextSurface.getBoundingClientRect().left;
  const currentCenterY = (nextBounds.top + nextBounds.bottom) / 2 - nextSurface.getBoundingClientRect().top;
  viewport.panBy(nextSurface.clientWidth / 2 - currentCenterX, nextSurface.clientHeight / 2 - currentCenterY);
}

onMounted(() => {
  fitCanvas();
  void nextTick(updateAssistantPlacement);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  if (typeof ResizeObserver !== 'undefined' && workspace.value) {
    resizeObserver = new ResizeObserver(() => {
      fitCanvas(true);
      updateAssistantPlacement();
    });
    resizeObserver.observe(workspace.value);
  }
});
onScopeDispose(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  resizeObserver?.disconnect();
});
</script>

<template>
  <section class="design-canvas" aria-labelledby="canvas-title">
    <h2 id="canvas-title" class="sr-only">{{ props.nodes.length ? '页面预览与编辑' : '空白画布' }}</h2>
    <div
      ref="workspace"
      class="canvas-workspace"
      :class="{ 'canvas-workspace--panning': activePan, 'canvas-workspace--placing': activeTool }"
      @pointerdown.capture="startPan"
      @pointermove="movePan"
      @pointerup="endPan"
      @pointercancel="cancelWorkspacePointer"
      @wheel="handleCanvasWheel"
      @scroll.passive="updateAssistantPlacement"
    >
      <div ref="artboardShell" class="canvas-artboard-shell" :style="shellStyle">
        <div ref="canvasStage" class="canvas-stage" :style="stageStyle">
          <PreviewPanel :dsl="props.dsl" :data="props.previewData" editor-mode :prototype-mode="props.prototypeMode" :editor-zoom="viewport.zoom.value" :selected-node-id="props.selectedNodeId" :selected-node-ids="props.selectedNodeIds" :insert-tool="activeTool" :insert-shape="shapeType" @select-node="forwardSelect" @move-node="emit('move', $event)" @reorder-flow-nodes="emit('reorderFlowNodes', $event)" @reparent-nodes="emit('reparentNodes', $event)" @insert-component="emit('addComponent', $event)" @place-tool="emit('placeTool', $event)" @drop-image-asset="emit('dropImageAsset', $event)" @duplicate-nodes-at="emit('duplicateNodesAt', $event)" @duplicate-flow-nodes-at="emit('duplicateFlowNodesAt', $event)" @drop-rejected="emit('dropRejected', $event)" @update-node-design="emit('updateNodeDesign', $event)" @update-nodes-design="emit('updateNodesDesign', $event)" @update-node-text="emit('updateNodeText', $event)" @connect-frames="emit('connectFrames', $event)" />
        </div>
      </div>
      <div v-if="rootPlacement" class="root-placement-preview" :style="rootPlacementStyle" aria-hidden="true"></div>
      <div v-if="marquee" class="canvas-marquee" :style="marqueeStyle" aria-hidden="true"></div>
      <slot name="assistant" :placement-style="assistantStyle" :compact="assistantCompact" />
    <DesignToolbar class="canvas-floating-toolbar" :device="viewport.device.value" :zoom="viewport.zoom.value" :can-undo="props.canUndo" :can-redo="props.canRedo" :has-selection="props.hasSelection ?? Boolean(props.selectedNodeIds?.length || props.selectedNodeId)" :can-paste="props.canPaste" :can-group="props.canGroup" :can-auto-layout="props.canAutoLayout" :can-ungroup="props.canUngroup" :active-tool="activeTool" :shape-type="shapeType" @undo="emit('undo')" @redo="emit('redo')" @copy-selection="emit('copySelection')" @paste-selection="emit('pasteSelection')" @duplicate-selection="emit('duplicateSelection')" @group-selection="emit('groupSelection')" @auto-layout-selection="emit('autoLayoutSelection')" @ungroup-selection="emit('ungroupSelection')" @set-device="viewport.setDevice" @zoom-by="zoomAtCenter" @fit="fitCanvas" @add-tool="selectTool" @select-shape="selectShape" />
    </div>
    <p v-if="activeTool" class="canvas-empty-hint" role="status">{{ activeTool }} 工具已选中：在画布上点击放置，或拖动绘制大小；按 Esc 返回选择工具。</p>
    <p v-else-if="!props.nodes.length" class="canvas-empty-hint">画布已就绪。到左侧“组件”中添加首个页面区块，或从设计对话开始。</p>
  </section>
</template>

<style scoped>
.design-canvas{display:flex;flex:1;flex-direction:column;min-height:0;min-width:0;padding:0;background:transparent;border:0;border-radius:0;overflow:hidden}
.canvas-workspace{position:relative;flex:1;min-height:0;height:100%;overflow:auto;overscroll-behavior:contain;border:0;border-radius:0;background:#f5f5f5}
.canvas-workspace :deep(.design-toolbar){position:absolute;left:50%;bottom:16px;z-index:8;width:max-content;max-width:calc(100% - 24px);margin:0;transform:translateX(-50%);flex-wrap:wrap}
.canvas-workspace :deep(.design-chat){position:absolute;right:24px;bottom:82px;z-index:7;width:min(400px,calc(100% - 48px));max-height:62vh;margin:0;}
.canvas-workspace :deep(.design-chat--collapsed){width:48px;min-width:48px;height:48px;max-height:48px;border-radius:50%}
.canvas-artboard-shell{min-height:100%;margin:32px auto;overflow:visible}
.canvas-stage{transform-origin:top left;will-change:transform}
.canvas-workspace--panning{cursor:grabbing;user-select:none}
.canvas-workspace--placing{cursor:crosshair}
.root-placement-preview{position:absolute;z-index:6;pointer-events:none;box-sizing:border-box;border:1px solid #1677ff;background:rgba(22,119,255,.12);box-shadow:0 0 0 1px rgba(22,119,255,.12)}
.canvas-marquee{position:absolute;z-index:9;pointer-events:none;box-sizing:border-box;border:1px solid #1677ff;background:rgba(22,119,255,.12)}
.canvas-empty-hint{margin:0;padding:0 0 var(--pf-space-3);text-align:center;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm)}
@media(max-width:760px){.canvas-workspace :deep(.design-chat){right:12px;bottom:72px;width:calc(100% - 24px);max-height:48vh}.canvas-workspace :deep(.design-toolbar){bottom:12px;max-width:calc(100% - 12px)}}
</style>
