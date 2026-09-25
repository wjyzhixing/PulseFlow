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
.canvas-node{position:relative;min-width:0;margin:var(--pf-space-2) 0 var(--pf-space-2) calc(var(--node-depth) * 12px);border:var(--pf-border-width) solid var(--pf-color-border);background:var(--pf-color-surface);border-radius:var(--pf-radius-sm);outline:none;box-shadow:var(--pf-shadow-sm)}
.canvas-node.selected{border-color:var(--pf-color-primary);box-shadow:0 0 0 2px #e6f4ff}
.canvas-node:focus-visible{outline:2px solid var(--pf-color-primary);outline-offset:2px}
.node-face{display:grid;grid-template-columns:24px auto minmax(0,1fr) auto;gap:var(--pf-space-2);align-items:center;padding:var(--pf-space-2) var(--pf-space-3);min-width:0}
.node-index{font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary)}
.node-type{font-size:var(--pf-font-size-sm);font-weight:600;background:#e6f4ff;color:var(--pf-color-primary);padding:var(--pf-space-1) var(--pf-space-2);border-radius:var(--pf-radius-sm)}
.node-summary{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--pf-font-size-sm);font-weight:500}
.node-actions{display:flex;gap:var(--pf-space-1)}
.node-actions button{width:28px;height:28px;border:var(--pf-border-width) solid var(--pf-color-border);background:var(--pf-color-surface);color:var(--pf-color-text-secondary);border-radius:var(--pf-radius-sm);cursor:pointer}
.node-actions button:hover:not(:disabled){border-color:var(--pf-color-primary);color:var(--pf-color-primary)}
.node-actions button:focus-visible{outline:2px solid var(--pf-color-primary);outline-offset:1px}
.node-actions button:disabled{opacity:.4;cursor:not-allowed}.node-actions .remove:hover{border-color:var(--pf-color-error);color:var(--pf-color-error-text)}
.node-children{min-width:0;padding:0 var(--pf-space-2) var(--pf-space-2) var(--pf-space-2);border-top:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.slot-children{padding-top:var(--pf-space-2)}.slot-label{display:block;margin:0 0 var(--pf-space-1) var(--pf-space-2);color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm)}
.drop-target{margin:var(--pf-space-2);padding:var(--pf-space-2);border:var(--pf-border-width) dashed var(--pf-color-border);border-radius:var(--pf-radius-sm);color:var(--pf-color-text-secondary);text-align:center;font-size:var(--pf-font-size-sm)}
.drop-target:hover{border-color:var(--pf-color-primary);background:#e6f4ff;color:var(--pf-color-primary)}
@media(max-width:760px){.canvas-node{margin-left:calc(var(--node-depth) * 8px)}.node-face{grid-template-columns:auto minmax(0,1fr) auto;gap:var(--pf-space-1);padding:var(--pf-space-2)}.node-index{display:none}.node-actions button{width:26px;height:26px}}
</style>
