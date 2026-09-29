<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { NodeDesign } from '@pulseflow/ui-dsl';
import type { ReadonlyDesignNode } from './design-store';
import CanvasNode from './CanvasNode.vue';
import StudioIcon from './StudioIcon.vue';

interface MovePayload { nodeId: string; parentId: string | null; index: number; slotName?: 'tags' }
const props = defineProps<{ nodes: readonly ReadonlyDesignNode[]; selectedNodeId: string | null; selectedNodeIds?: readonly string[] }>();
const emit = defineEmits<{
  select: [nodeId: string, additive?: boolean];
  remove: [nodeId: string];
  move: [payload: MovePayload];
  updateDesign: [payload: { nodeId: string; patch: Partial<NodeDesign> }];
}>();
const draggedNodeId = shallowRef<string | null>(null);
const searchOpen = shallowRef(false);
const searchQuery = shallowRef('');

function nodeMatches(node: ReadonlyDesignNode, normalizedQuery: string): boolean {
  const values = [node.id, node.design?.name, ...Object.values(node.props)];
  return values.some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(normalizedQuery));
}

function filterNodes(nodes: readonly ReadonlyDesignNode[], normalizedQuery: string): ReadonlyDesignNode[] {
  return nodes.flatMap((node) => {
    if (nodeMatches(node, normalizedQuery)) return [node];
    const children = filterNodes(node.children, normalizedQuery);
    const slots = node.slots.map((slot) => 'children' in slot
      ? { ...slot, children: filterNodes(slot.children, normalizedQuery) }
      : slot);
    const hasSlotMatches = slots.some((slot) => 'children' in slot && slot.children.length > 0);
    return children.length || hasSlotMatches ? [{ ...node, children, slots } as ReadonlyDesignNode] : [];
  });
}

const visibleNodes = computed(() => {
  const normalizedQuery = searchQuery.value.trim().toLocaleLowerCase();
  return normalizedQuery ? filterNodes(props.nodes, normalizedQuery) : props.nodes;
});

function countNodes(nodes: readonly ReadonlyDesignNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countNodes(node.children) + node.slots.reduce((slotCount, slot) =>
    slotCount + ('children' in slot ? countNodes(slot.children) : 0), 0), 0);
}

const visibleNodeCount = computed(() => countNodes(visibleNodes.value));

function rememberDrag(nodeId: string) { draggedNodeId.value = nodeId; }
function forwardSelect(nodeId: string, additive = false) {
  if (additive) emit('select', nodeId, true);
  else emit('select', nodeId);
}
function dropNode(payload: MovePayload) {
  if (draggedNodeId.value) emit('move', { ...payload, nodeId: draggedNodeId.value });
  draggedNodeId.value = null;
}
</script>

<template>
  <section class="layers-panel" aria-label="页面图层">
    <header class="layers-heading">
      <div><span>页面结构</span><h2>图层</h2></div>
      <div class="layers-heading-actions">
        <span class="layer-count">{{ visibleNodeCount }} 个图层</span>
        <button type="button" aria-label="搜索图层" :aria-pressed="searchOpen" @click="searchOpen = !searchOpen; searchQuery = ''"><StudioIcon name="search" /></button>
      </div>
    </header>
    <input v-if="searchOpen" v-model="searchQuery" class="layers-search" type="search" aria-label="搜索图层名称或内容" placeholder="搜索图层名称或内容">
    <p class="layers-hint">选择图层可在画布与属性面板中同步定位，也可以拖动调整顺序。</p>
    <div v-if="visibleNodes.length" class="layer-tree" role="tree" aria-label="页面图层">
      <CanvasNode
        v-for="(node, index) in visibleNodes"
        :key="node.id"
        :node="node"
        :parent-id="null"
        :index="index"
        :sibling-count="visibleNodes.length"
        :selected-node-id="selectedNodeId"
        :selected-node-ids="selectedNodeIds"
        tree-mode
        @select="forwardSelect"
        @remove="emit('remove', $event)"
        @move="emit('move', $event)"
        @drag-start="rememberDrag"
        @drop-node="dropNode"
        @update-design="emit('updateDesign', $event)"
      />
    </div>
    <div v-else-if="nodes.length" class="layers-empty" role="status">
      <StudioIcon name="search" :size="24" />
      <strong>没有匹配的图层</strong>
      <p>换个图层名称或内容试试。</p>
    </div>
    <div v-else class="layers-empty" role="status">
      <StudioIcon name="file" :size="24" />
      <strong>页面还没有图层</strong>
      <p>从左侧 Tools 工具区添加组件后，这里会显示完整结构。</p>
    </div>
  </section>
</template>

<style scoped>
.layers-panel{display:flex;flex:1;flex-direction:column;min-height:0;padding:8px 6px;background:var(--pf-color-surface);color:var(--pf-color-text)}
.layers-heading{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:0 2px 6px;border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.layers-heading>div>span{font-size:10px;color:var(--pf-color-text-secondary)}
.layers-heading h2{margin:1px 0 0;font-size:13px;line-height:1.25;font-weight:600}
.layers-heading-actions{display:flex;align-items:center;gap:2px}.layers-heading-actions button{display:grid;width:24px;height:24px;place-items:center;border:1px solid transparent;border-radius:4px;background:transparent;color:#8c8c8c;cursor:pointer}.layers-heading-actions button:hover,.layers-heading-actions button[aria-pressed="true"]{border-color:#91caff;background:#e6f4ff;color:#1677ff}
.layers-search{box-sizing:border-box;width:100%;height:28px;margin-top:7px;padding:3px 7px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;color:#262626;font:inherit;font-size:11px}.layers-search:focus{border-color:#1677ff;outline:2px solid #e6f4ff}
.layer-count{color:var(--pf-color-text-secondary);font-size:10px;white-space:nowrap}
.layers-hint{margin:8px 0 5px;color:var(--pf-color-text-secondary);font-size:11px;line-height:1.45}
.layer-tree{min-height:0;overflow:auto}
.layer-tree :deep(.canvas-node){box-shadow:none;background:transparent;margin:1px 0 1px calc(var(--node-depth) * 8px);border-color:transparent;border-radius:var(--pf-radius-sm)}
.layer-tree :deep(.canvas-node:hover){background:#f5faff}
.layer-tree :deep(.canvas-node[aria-selected="true"]){border-color:#91caff;background:#e6f4ff;box-shadow:none}
.layer-tree :deep(.canvas-node){margin-top:0;margin-bottom:0}
.layer-tree :deep(.node-face--tree){min-height:27px;padding:3px 4px;gap:4px}
.layer-tree :deep(.tree-toggle){width:13px}
.layer-tree :deep(.node-icon){width:14px}
.layer-tree :deep(.node-face--tree .node-summary){font-size:11px}
.layer-tree :deep(.node-actions--tree){gap:0}
.layer-tree :deep(.node-actions--tree button){width:18px;height:18px}
.layer-tree :deep(.node-children){border-top:0;padding:0 0 2px}
.layers-empty{display:grid;justify-items:center;align-content:center;gap:var(--pf-space-2);flex:1;min-height:180px;text-align:center;color:var(--pf-color-text-secondary)}
.layers-empty>span{font-size:28px;color:#bfbfbf}.layers-empty strong{font-size:var(--pf-font-size-sm);color:var(--pf-color-text)}
.layers-empty p{max-width:190px;margin:0;font-size:12px;line-height:1.6}
@container resource (max-width:270px){.layers-panel{padding-right:4px;padding-left:4px}.layers-heading{padding-right:1px;padding-left:1px}.layer-tree :deep(.canvas-node){margin-left:calc(var(--node-depth) * 5px)}.layer-tree :deep(.node-face--tree){gap:3px;padding-right:2px;padding-left:2px}.layer-tree :deep(.node-actions--tree button){width:17px;height:17px}}
</style>
