<script setup lang="ts">
import type { ReadonlyDesignNode } from './design-store';
import CanvasNode from './CanvasNode.vue';

interface MovePayload { nodeId: string; parentId: string | null; index: number }
defineProps<{ nodes: readonly ReadonlyDesignNode[]; selectedNodeId: string | null }>();
const emit = defineEmits<{ select: [nodeId: string]; remove: [nodeId: string]; move: [payload: MovePayload] }>();
let draggedNodeId: string | null = null;
function rememberDrag(nodeId: string) { draggedNodeId = nodeId; }
function dropNode(payload: MovePayload) {
  if (draggedNodeId) emit('move', { ...payload, nodeId: draggedNodeId });
  draggedNodeId = null;
}
</script>

<template>
  <section class="design-canvas" aria-labelledby="canvas-title" @dragover.prevent @drop.prevent="dropNode({ nodeId: '', parentId: null, index: nodes.length })">
    <header class="canvas-heading"><div><span>02 / PAGE TREE</span><h2 id="canvas-title">{{ nodes.length ? '页面画布' : '空白画布' }}</h2></div><b>{{ nodes.length }} ROOT NODES</b></header>
    <div v-if="nodes.length" class="node-stack">
      <CanvasNode
        v-for="(node, index) in nodes"
        :key="node.id"
        :node="node"
        :parent-id="null"
        :index="index"
        :sibling-count="nodes.length"
        :selected-node-id="selectedNodeId"
        @select="emit('select', $event)"
        @remove="emit('remove', $event)"
        @move="emit('move', $event)"
        @drag-start="rememberDrag"
        @drop-node="dropNode"
      />
    </div>
    <div v-else class="empty-state"><strong>＋</strong><p>从左侧选择一个白名单组件<br>建立页面的第一层结构</p></div>
  </section>
</template>

<style scoped>
.design-canvas{min-height:420px;min-width:0;padding:var(--pf-space-4);background:var(--pf-color-surface);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius)}
.canvas-heading{display:flex;align-items:center;justify-content:space-between;gap:var(--pf-space-2);padding-bottom:var(--pf-space-3);border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.canvas-heading span,.canvas-heading b{font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text-secondary)}
.canvas-heading h2{font-size:var(--pf-font-size-lg);font-weight:600;margin:var(--pf-space-1) 0 0}
.node-stack{min-width:0;padding:var(--pf-space-3) 0;overflow-x:auto}
.empty-state{min-height:300px;display:grid;place-content:center;text-align:center;color:var(--pf-color-text-secondary)}
.empty-state strong{font-size:48px;font-weight:300;color:var(--pf-color-border)}
.empty-state p{font-size:var(--pf-font-size);line-height:var(--pf-line-height)}
@media(max-width:760px){.design-canvas{padding:var(--pf-space-3)}.canvas-heading{flex-wrap:wrap}}
</style>
