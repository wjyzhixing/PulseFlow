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
.design-canvas{min-height:420px;padding:24px;background-color:#eef0e8;background-image:linear-gradient(#dce2dc 1px,transparent 1px),linear-gradient(90deg,#dce2dc 1px,transparent 1px);background-size:18px 18px;border:1px solid #cad3ce}.canvas-heading{display:flex;align-items:end;justify-content:space-between;padding-bottom:17px;border-bottom:2px solid #173943}.canvas-heading span,.canvas-heading b{font:600 10px 'DM Mono',monospace;letter-spacing:.12em;color:#547478}.canvas-heading h2{font:700 25px 'Noto Serif SC',serif;margin:5px 0 0}.node-stack{padding:12px 4px}.empty-state{min-height:300px;display:grid;place-content:center;text-align:center;color:#78908e}.empty-state strong{font:300 60px 'DM Mono',monospace;color:#adc0b8}.empty-state p{font-size:13px;line-height:1.8}
</style>
