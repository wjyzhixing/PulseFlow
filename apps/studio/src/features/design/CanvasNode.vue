<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue';
import type { NodeDesign } from '@pulseflow/ui-dsl';
import type { ReadonlyDesignNode } from './design-store';
import StudioIcon from './StudioIcon.vue';

type LayerIconName = 'frame' | 'text' | 'rectangle' | 'image' | 'file' | 'tools' | 'assets' | 'chevron-down';

interface MovePayload { nodeId: string; parentId: string | null; index: number; slotName?: 'tags' }
const props = defineProps<{
  node: ReadonlyDesignNode;
  parentId: string | null;
  index: number;
  siblingCount: number;
  selectedNodeId: string | null;
  selectedNodeIds?: readonly string[];
  depth?: number;
  treeMode?: boolean;
  lockedAncestor?: boolean;
}>();
const emit = defineEmits<{
  select: [nodeId: string, additive?: boolean];
  remove: [nodeId: string];
  move: [payload: MovePayload];
  dragStart: [nodeId: string];
  dropNode: [payload: MovePayload];
  updateDesign: [payload: { nodeId: string; patch: Partial<NodeDesign> }];
}>();

const summary = computed(() => {
  if (props.node.design?.name) return props.node.design.name;
  const propsRecord = props.node.props;
  for (const key of ['title', 'label', 'placeholder', 'text', 'alt']) {
    const value = propsRecord[key];
    if (typeof value === 'string' && value) return value;
  }
  return props.node.id;
});
const typeLabels: Record<ReadonlyDesignNode['type'], string> = {
  Frame: '画框', Text: '文字', Shape: '形状',
  Card: '内容卡片', PageHeader: '页面页头', Form: '表单容器', FormItem: '字段项', Input: '输入框', Select: '下拉选择',
  Button: '操作按钮', Table: '数据表格', Row: '栅格行', Col: '栅格列', Tag: '状态标签', Badge: '状态徽标',
  SiteNavigation: '网站导航', Hero: '首屏主视觉', ContentSection: '内容区块', FeatureCard: '功能卡片',
  MetricCard: '数据指标', CallToAction: '转化行动区', Image: '图片素材'
};
const typeLabel = computed(() => typeLabels[props.node.type]);
const isSelected = computed(() => props.selectedNodeIds?.includes(props.node.id) ?? props.selectedNodeId === props.node.id);
const treeMode = computed(() => props.treeMode ?? false);
const isLockedByAncestor = computed(() => props.lockedAncestor ?? false);
const isEffectivelyLocked = computed(() => isLockedByAncestor.value || props.node.design?.locked === true);
const collapsed = shallowRef(false);
const renaming = shallowRef(false);
const treeDropActive = shallowRef(false);
const edgeDropActive = shallowRef(false);
const renameInput = useTemplateRef<HTMLInputElement>('renameInput');
const iconLabels: Record<ReadonlyDesignNode['type'], LayerIconName> = {
  Frame: 'frame', Text: 'text', Shape: 'rectangle', Card: 'rectangle', PageHeader: 'file', Form: 'file', FormItem: 'file', Input: 'text', Select: 'chevron-down',
  Button: 'rectangle', Table: 'tools', Row: 'frame', Col: 'frame', Tag: 'assets', Badge: 'assets', SiteNavigation: 'tools', Hero: 'image',
  ContentSection: 'file', FeatureCard: 'rectangle', MetricCard: 'assets', CallToAction: 'frame', Image: 'image'
};
const nodeIcon = computed(() => iconLabels[props.node.type]);
const childSlots = computed(() => props.node.slots.flatMap((slot) => 'children' in slot ? [{ name: slot.name, children: slot.children }] : []));
const hasTreeChildren = computed(() => props.node.children.length > 0 || childSlots.value.some((slot) => slot.children.length > 0));
const acceptsChildren = computed(() => ['Frame', 'Card', 'Form', 'FormItem', 'Row', 'Col', 'PageHeader', 'ContentSection'].includes(props.node.type));
const dropIndex = computed(() => props.node.type === 'PageHeader'
  ? childSlots.value.find((slot) => slot.name === 'tags')?.children.length ?? 0
  : props.node.children.length);
const dropSlot = computed(() => props.node.type === 'PageHeader' ? 'tags' as const : undefined);
function forwardSelect(nodeId: string, additive = false): void {
  if (additive) emit('select', nodeId, true);
  else emit('select', nodeId);
}
function selectFromClick(event: MouseEvent): void {
  const additive = event.shiftKey || event.metaKey || event.ctrlKey;
  if (additive) emit('select', props.node.id, true);
  else emit('select', props.node.id);
}
async function startLayerRename(event: MouseEvent): Promise<void> {
  if (!treeMode.value || event.target instanceof Element && event.target.closest('button')) return;
  renaming.value = true;
  await nextTick();
  renameInput.value?.focus();
  renameInput.value?.select();
}
function finishLayerRename(commit: boolean): void {
  if (!renaming.value) return;
  const name = renameInput.value?.value.trim() ?? '';
  renaming.value = false;
  if (commit) emit('updateDesign', { nodeId: props.node.id, patch: { name: name || undefined } });
}
function dropOnLayerRow(): void {
  treeDropActive.value = false;
  if (treeMode.value && acceptsChildren.value) {
    if (!isEffectivelyLocked.value) {
      emit('dropNode', { nodeId: '', parentId: props.node.id, index: dropIndex.value, ...(dropSlot.value ? { slotName: dropSlot.value } : {}) });
    }
    return;
  }
  emit('dropNode', { nodeId: '', parentId: props.parentId, index: props.index });
}
</script>

<template>
  <article
    class="canvas-node"
    :class="{ selected: isSelected, 'canvas-node--edge-drop-active': edgeDropActive }"
    :style="{ '--node-depth': depth ?? 0 }"
    :data-testid="`canvas-node-${node.id}`"
    :draggable="!isEffectivelyLocked"
    tabindex="0"
    role="treeitem"
    :aria-level="(depth ?? 0) + 1"
    :aria-selected="isSelected"
    @click.stop="selectFromClick($event)"
    @dblclick.stop="startLayerRename"
    @keydown.enter.stop="emit('select', node.id)"
    @keydown.space.stop.prevent="emit('select', node.id)"
    @dragstart.stop="emit('dragStart', node.id)"
    @dragover.prevent
    @drop.stop.prevent="emit('dropNode', { nodeId: '', parentId, index })"
  >
    <div class="drop-edge drop-edge--before" data-testid="drop-before" @dragover.stop.prevent="edgeDropActive = true" @dragleave.stop="edgeDropActive = false" @drop.stop.prevent="edgeDropActive = false; emit('dropNode', { nodeId: '', parentId, index })">放在此对象之前</div>
    <div
      class="node-face"
      :class="{ 'node-face--tree': treeMode, 'node-face--drop-target': treeMode && treeDropActive }"
      @dragover.stop.prevent="treeMode && acceptsChildren && !isEffectivelyLocked ? treeDropActive = true : undefined"
      @dragleave.stop="treeDropActive = false"
      @drop.stop.prevent="dropOnLayerRow"
    >
      <button v-if="treeMode" type="button" class="tree-toggle" :aria-label="collapsed ? `展开 ${summary}` : `折叠 ${summary}`" :aria-expanded="!collapsed" :disabled="!hasTreeChildren" @click.stop="collapsed = !collapsed"><StudioIcon v-if="hasTreeChildren" :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="12" /></button>
      <span v-else class="node-index">{{ String(index + 1).padStart(2, '0') }}</span>
      <span v-if="treeMode" class="node-icon"><StudioIcon :name="nodeIcon" :size="14" /></span>
      <span class="node-type" :class="{ 'node-type--sr': treeMode }">{{ typeLabel }}</span>
      <input v-if="treeMode && renaming" ref="renameInput" class="node-rename-input" aria-label="重命名图层" maxlength="120" :value="summary" @click.stop @keydown.enter.stop.prevent="finishLayerRename(true)" @keydown.esc.stop.prevent="finishLayerRename(false)" @blur="finishLayerRename(true)">
      <strong v-else class="node-summary">{{ summary }}</strong>
      <div class="node-actions" :class="{ 'node-actions--tree': treeMode }">
        <template v-if="treeMode">
          <button type="button" class="layer-toggle" :aria-label="node.design?.visible === false ? `显示 ${summary}` : `隐藏 ${summary}`" :aria-pressed="node.design?.visible !== false" :disabled="isLockedByAncestor" @click.stop="emit('updateDesign', { nodeId: node.id, patch: { visible: node.design?.visible === false } })"><StudioIcon :name="node.design?.visible === false ? 'eye-off' : 'eye'" :size="14" /></button>
          <button type="button" class="layer-toggle" :aria-label="isLockedByAncestor ? `${summary} 被父图层锁定` : node.design?.locked ? `解锁 ${summary}` : `锁定 ${summary}`" :aria-pressed="isEffectivelyLocked" :disabled="isLockedByAncestor" @click.stop="emit('updateDesign', { nodeId: node.id, patch: { locked: !node.design?.locked } })"><StudioIcon :name="isEffectivelyLocked ? 'lock' : 'unlock'" :size="13" /></button>
          <button type="button" class="remove" :disabled="isEffectivelyLocked" :aria-label="isEffectivelyLocked ? `${summary} 已锁定，无法移除` : `移除 ${summary}`" @click.stop="emit('remove', node.id)"><StudioIcon name="close" :size="13" /></button>
        </template>
        <template v-else>
          <button type="button" :disabled="isEffectivelyLocked || index === 0" :data-testid="`move-up-${node.id}`" :aria-label="`上移 ${summary}`" @click.stop="emit('move', { nodeId: node.id, parentId, index: index - 1 })"><StudioIcon name="arrow-up" :size="13" /></button>
          <button type="button" :disabled="isEffectivelyLocked || index === siblingCount - 1" :data-testid="`move-down-${node.id}`" :aria-label="`下移 ${summary}`" @click.stop="emit('move', { nodeId: node.id, parentId, index: index + 2 })"><StudioIcon name="arrow-down" :size="13" /></button>
          <button type="button" class="remove" :disabled="isEffectivelyLocked" :aria-label="isEffectivelyLocked ? `${summary} 已锁定，无法移除` : `移除 ${summary}`" @click.stop="emit('remove', node.id)"><StudioIcon name="close" :size="13" /></button>
        </template>
      </div>
    </div>
    <div v-if="node.children.length && (!treeMode || !collapsed)" class="node-children" role="group">
      <CanvasNode
        v-for="(child, childIndex) in node.children"
        :key="child.id"
        :node="child"
        :parent-id="node.id"
        :index="childIndex"
        :sibling-count="node.children.length"
        :selected-node-id="selectedNodeId"
        :selected-node-ids="selectedNodeIds"
        :depth="(depth ?? 0) + 1"
        :tree-mode="treeMode"
        :locked-ancestor="isEffectivelyLocked"
        @select="forwardSelect"
        @remove="emit('remove', $event)"
        @move="emit('move', $event)"
        @drag-start="emit('dragStart', $event)"
        @drop-node="emit('dropNode', $event)"
        @update-design="emit('updateDesign', $event)"
      />
    </div>
    <div v-for="slot in treeMode && collapsed ? [] : childSlots" :key="slot.name" class="node-children slot-children" role="group" :aria-label="`${slot.name} 子图层`">
      <span class="slot-label">SLOT / {{ slot.name }}</span>
      <CanvasNode
        v-for="(child, childIndex) in slot.children"
        :key="child.id"
        :node="child"
        :parent-id="node.id"
        :index="childIndex"
        :sibling-count="slot.children.length"
        :selected-node-id="selectedNodeId"
        :selected-node-ids="selectedNodeIds"
        :depth="(depth ?? 0) + 1"
        :tree-mode="treeMode"
        :locked-ancestor="isEffectivelyLocked"
        @select="forwardSelect"
        @remove="emit('remove', $event)"
        @move="emit('move', $event)"
        @drag-start="emit('dragStart', $event)"
        @drop-node="emit('dropNode', $event)"
        @update-design="emit('updateDesign', $event)"
      />
    </div>
    <div
      v-if="acceptsChildren && !treeMode"
      class="drop-target"
      :data-testid="`drop-into-${node.id}`"
      @click.stop
      @dragover.stop.prevent
      @drop.stop.prevent="emit('dropNode', { nodeId: '', parentId: node.id, index: dropIndex, ...(dropSlot ? { slotName: dropSlot } : {}) })"
    >放入{{ node.type === 'PageHeader' ? '状态标签区域' : typeLabel }}内部</div>
    <div class="drop-edge drop-edge--after" data-testid="drop-after" @dragover.stop.prevent="edgeDropActive = true" @dragleave.stop="edgeDropActive = false" @drop.stop.prevent="edgeDropActive = false; emit('dropNode', { nodeId: '', parentId, index: index + 1 })">放在此对象之后</div>
  </article>
</template>

<style scoped>
.canvas-node{position:relative;min-width:0;margin:var(--pf-space-2) 0 var(--pf-space-2) calc(var(--node-depth) * 12px);border:var(--pf-border-width) solid var(--pf-color-border);background:var(--pf-color-surface);border-radius:var(--pf-radius-sm);outline:none;box-shadow:var(--pf-shadow-sm)}
.canvas-node.selected{border-color:var(--pf-color-primary);box-shadow:0 0 0 2px #e6f4ff}
.canvas-node:focus-visible{outline:2px solid var(--pf-color-primary);outline-offset:2px}
.node-face{display:grid;grid-template-columns:24px auto minmax(0,1fr) auto;gap:var(--pf-space-2);align-items:center;padding:var(--pf-space-2) var(--pf-space-3);min-width:0}
.node-face--tree{position:relative;display:flex;min-height:30px;gap:7px;padding:4px 7px}
.node-face--tree.node-face--drop-target{border-radius:4px;background:#d6eaff;box-shadow:inset 0 0 0 1px #1677ff}
.tree-toggle{display:grid;flex:none;width:16px;height:20px;place-items:center;padding:0;border:0;border-radius:3px;background:transparent;color:#8c8c8c;font:inherit;font-size:12px;cursor:pointer}
.tree-toggle:hover:not(:disabled){background:#e6f4ff;color:#1677ff}.tree-toggle:disabled{cursor:default}.tree-toggle svg{display:block}
.node-icon{display:inline-grid;flex:none;width:17px;place-items:center;color:#8c8c8c}.node-icon svg{display:block}
.node-face--tree .node-summary{flex:1;font-size:12px;font-weight:400}
.node-index{font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary)}
.node-type{font-size:var(--pf-font-size-sm);font-weight:600;background:#e6f4ff;color:var(--pf-color-primary-strong);padding:var(--pf-space-1) var(--pf-space-2);border-radius:var(--pf-radius-sm)}
.node-type--sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.node-summary{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--pf-font-size-sm);font-weight:500}
.node-rename-input{flex:1;min-width:0;height:24px;padding:2px 5px;border:1px solid #1677ff;border-radius:3px;font:inherit}
.node-actions{display:flex;gap:var(--pf-space-1)}
.node-actions--tree{position:absolute;top:50%;right:3px;z-index:2;display:flex;gap:0;visibility:hidden;transform:translateY(-50%);padding:2px;border:1px solid #d6e4ff;border-radius:5px;background:#fff;box-shadow:0 2px 6px #0000001a;opacity:0;pointer-events:none;transition:opacity .12s ease,visibility .12s ease}
.node-face--tree:hover > .node-actions--tree,.node-face--tree:focus-within > .node-actions--tree{visibility:visible;opacity:1;pointer-events:auto}
.canvas-node[aria-selected="true"] > .node-face .node-actions--tree{border-color:#91caff;background:#f0f7ff}
.node-actions--tree button{display:grid;place-items:center;width:18px;height:18px;padding:0;border-color:transparent;background:transparent}
.node-actions--tree .layer-toggle{color:#1677ff}.node-actions--tree .layer-toggle svg{display:block;margin:auto}
.node-actions--tree .layer-toggle:nth-child(2){color:#d48806}.node-actions--tree .remove{color:#cf1322}
.node-actions--tree .layer-toggle:first-child:hover:not(:disabled){border-color:#91caff;background:#e6f4ff;color:#0958d9}
.node-actions--tree .layer-toggle:nth-child(2):hover:not(:disabled){border-color:#ffd591;background:#fff7e6;color:#ad6800}
.node-actions--tree .remove:hover:not(:disabled){border-color:#ffccc7;background:#fff2f0;color:#a8071a}
.node-actions--tree .layer-toggle:first-child[aria-pressed="false"]{color:#bfbfbf}.node-actions--tree .layer-toggle:nth-child(2)[aria-pressed="false"]{color:#8c8c8c}
.node-actions button{width:28px;height:28px;border:var(--pf-border-width) solid var(--pf-color-border);background:var(--pf-color-surface);color:var(--pf-color-text-secondary);border-radius:var(--pf-radius-sm);cursor:pointer}
.node-actions button:hover:not(:disabled){border-color:var(--pf-color-primary);color:var(--pf-color-primary-strong)}
.node-actions button:focus-visible{outline:2px solid var(--pf-color-primary);outline-offset:1px}
.node-actions button:disabled{opacity:.4;cursor:not-allowed}.node-actions .remove:hover{border-color:var(--pf-color-error);color:var(--pf-color-error-text)}
.node-children{min-width:0;padding:0 var(--pf-space-2) var(--pf-space-2) var(--pf-space-2);border-top:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.slot-children{padding-top:var(--pf-space-2)}.slot-label{display:block;margin:0 0 var(--pf-space-1) var(--pf-space-2);color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm)}
.drop-target{margin:var(--pf-space-2);padding:var(--pf-space-2);border:var(--pf-border-width) dashed var(--pf-color-border);border-radius:var(--pf-radius-sm);color:var(--pf-color-text-secondary);text-align:center;font-size:var(--pf-font-size-sm)}
.drop-target:hover{border-color:var(--pf-color-primary);background:#e6f4ff;color:var(--pf-color-primary-strong)}
.drop-edge{height:0;overflow:hidden;text-align:center;color:var(--pf-color-primary-strong);font-size:11px;transition:height .12s ease}
.canvas-node--edge-drop-active > .drop-edge{height:20px;border-top:2px solid var(--pf-color-primary);background:#e6f4ff}
@media(max-width:760px){.canvas-node{margin-left:calc(var(--node-depth) * 8px)}.node-face{grid-template-columns:auto minmax(0,1fr) auto;gap:var(--pf-space-1);padding:var(--pf-space-2)}.node-index{display:none}.node-actions button{width:26px;height:26px}}
</style>
