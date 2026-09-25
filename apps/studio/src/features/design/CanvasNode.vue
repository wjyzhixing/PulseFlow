<script setup lang="ts">
import { computed } from 'vue';
import type { ReadonlyDesignNode } from './design-store';

interface MovePayload { nodeId: string; parentId: string | null; index: number }
const props = defineProps<{
  node: ReadonlyDesignNode;
  parentId: string | null;
  index: number;
  siblingCount: number;
  selectedNodeId: string | null;
  depth?: number;
}>();
const emit = defineEmits<{
  select: [nodeId: string];
  remove: [nodeId: string];
  move: [payload: MovePayload];
  dragStart: [nodeId: string];
  dropNode: [payload: MovePayload];
}>();

const summary = computed(() => {
  const propsRecord = props.node.props;
  for (const key of ['title', 'label', 'placeholder', 'text']) {
    const value = propsRecord[key];
    if (typeof value === 'string' && value) return value;
  }
  return props.node.id;
});
const childSlots = computed(() => props.node.slots.flatMap((slot) => 'children' in slot ? [{ name: slot.name, children: slot.children }] : []));
const acceptsChildren = computed(() => ['Card', 'Form', 'FormItem', 'Row', 'Col', 'PageHeader'].includes(props.node.type));
const dropIndex = computed(() => props.node.type === 'PageHeader'
  ? childSlots.value.find((slot) => slot.name === 'tags')?.children.length ?? 0
  : props.node.children.length);
</script>

<template>
  <article
    class="canvas-node"
    :class="{ selected: selectedNodeId === node.id }"
    :style="{ '--node-depth': depth ?? 0 }"
    :data-testid="`canvas-node-${node.id}`"
    draggable="true"
    tabindex="0"
    role="button"
    :aria-pressed="selectedNodeId === node.id"
    @click.stop="emit('select', node.id)"
    @keydown.enter.stop="emit('select', node.id)"
    @dragstart.stop="emit('dragStart', node.id)"
    @dragover.prevent
    @drop.stop.prevent="emit('dropNode', { nodeId: '', parentId, index })"
  >
    <div class="node-face">
      <span class="node-index">{{ String(index + 1).padStart(2, '0') }}</span>
      <span class="node-type">{{ node.type }}</span>
      <strong class="node-summary">{{ summary }}</strong>
      <div class="node-actions">
        <button type="button" :disabled="index === 0" :data-testid="`move-up-${node.id}`" :aria-label="`上移 ${summary}`" @click.stop="emit('move', { nodeId: node.id, parentId, index: index - 1 })">↑</button>
        <button type="button" :disabled="index === siblingCount - 1" :data-testid="`move-down-${node.id}`" :aria-label="`下移 ${summary}`" @click.stop="emit('move', { nodeId: node.id, parentId, index: index + 2 })">↓</button>
        <button type="button" class="remove" :aria-label="`移除 ${summary}`" @click.stop="emit('remove', node.id)">×</button>
      </div>
    </div>
    <div v-if="node.children.length" class="node-children">
      <CanvasNode
        v-for="(child, childIndex) in node.children"
        :key="child.id"
        :node="child"
        :parent-id="node.id"
        :index="childIndex"
        :sibling-count="node.children.length"
        :selected-node-id="selectedNodeId"
        :depth="(depth ?? 0) + 1"
        @select="emit('select', $event)"
        @remove="emit('remove', $event)"
        @move="emit('move', $event)"
        @drag-start="emit('dragStart', $event)"
        @drop-node="emit('dropNode', $event)"
      />
    </div>
    <div v-for="slot in childSlots" :key="slot.name" class="node-children slot-children">
      <span class="slot-label">SLOT / {{ slot.name }}</span>
      <CanvasNode
        v-for="(child, childIndex) in slot.children"
        :key="child.id"
        :node="child"
        :parent-id="node.id"
        :index="childIndex"
        :sibling-count="slot.children.length"
        :selected-node-id="selectedNodeId"
        :depth="(depth ?? 0) + 1"
        @select="emit('select', $event)"
        @remove="emit('remove', $event)"
        @move="emit('move', $event)"
        @drag-start="emit('dragStart', $event)"
        @drop-node="emit('dropNode', $event)"
      />
    </div>
    <div
      v-if="acceptsChildren"
      class="drop-target"
      :data-testid="`drop-into-${node.id}`"
      @click.stop
      @dragover.stop.prevent
      @drop.stop.prevent="emit('dropNode', { nodeId: '', parentId: node.id, index: dropIndex })"
    >拖放到 {{ node.type === 'PageHeader' ? 'tags slot' : node.type }}</div>
  </article>
</template>

<style scoped>
.canvas-node{position:relative;margin:9px 0 9px calc(var(--node-depth) * 15px);border:1px solid #bdcbc7;background:#fffef8;box-shadow:3px 3px 0 #dfe7e1;border-radius:2px;outline:none}.canvas-node::before{content:'';position:absolute;left:-9px;top:-10px;bottom:-10px;border-left:1px solid #c6d0cc}.canvas-node.selected{border-color:#163b43;box-shadow:0 0 0 3px #d2f473,4px 4px 0 #183944}.canvas-node:focus-visible{box-shadow:0 0 0 3px #d2f473}.node-face{display:grid;grid-template-columns:30px auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px}.node-index{font:10px 'DM Mono',monospace;color:#799092}.node-type{font:600 10px 'DM Mono',monospace;letter-spacing:.05em;background:#e8efeb;color:#214b51;padding:5px 7px}.node-summary{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.node-actions{display:flex;gap:4px}.node-actions button{width:27px;height:27px;border:1px solid #c5d0cd;background:#f5f5ed;color:#173943;border-radius:2px}.node-actions button:hover:not(:disabled){background:#173943;color:#fff}.node-actions button:disabled{opacity:.3;cursor:not-allowed}.node-actions .remove{color:#9b3731}.node-children{padding:0 10px 9px 3px;border-top:1px dashed #d9dfdb}.slot-children{padding-top:7px}.slot-label{display:block;margin-left:13px;color:#6f8888;font:600 8px 'DM Mono',monospace;letter-spacing:.13em}.drop-target{margin:5px 10px 10px;padding:5px;border:1px dashed #9db3ac;color:#6f8584;text-align:center;font:8px 'DM Mono',monospace;letter-spacing:.08em}.drop-target:hover{border-color:#173943;background:#eaf0e8;color:#173943}
</style>
