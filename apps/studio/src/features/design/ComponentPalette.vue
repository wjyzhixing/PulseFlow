<script setup lang="ts">
import type { ComponentType } from '@pulseflow/ui-dsl';

export interface PaletteItem {
  type: ComponentType;
  label: string;
  hint: string;
}

defineProps<{ items: readonly PaletteItem[] }>();
const emit = defineEmits<{ add: [type: ComponentType] }>();

function startDrag(type: ComponentType, event: DragEvent): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData('application/x-pulseflow-component', type);
  event.dataTransfer.effectAllowed = 'copy';
}
</script>

<template>
  <section class="palette" aria-labelledby="palette-title">
    <div class="section-kicker">01 / COMPONENTS</div>
    <h2 id="palette-title">组件工具架</h2>
    <p>点选组件，加入当前容器或画布末尾。</p>
    <div class="palette-list">
      <button
        v-for="item in items"
        :key="item.type"
        class="palette-item"
        type="button"
        draggable="true"
        :data-testid="`palette-${item.type}`"
        @click="emit('add', item.type)"
        @dragstart="startDrag(item.type, $event)"
      >
        <span class="palette-glyph">+</span>
        <span><strong>{{ item.label }}</strong><small>{{ item.type }} · {{ item.hint }}</small></span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.palette{height:100%;min-width:0;padding:var(--pf-space-4);background:var(--pf-color-surface);color:var(--pf-color-text);border-right:var(--pf-border-width) solid var(--pf-color-border)}
.section-kicker{font-size:var(--pf-font-size-sm);font-weight:600;color:var(--pf-color-text-secondary)}
.palette h2{font-size:var(--pf-font-size-lg);font-weight:600;margin:var(--pf-space-1) 0}
.palette>p{font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height);color:var(--pf-color-text-secondary);margin:0 0 var(--pf-space-4)}
.palette-list{display:grid;gap:var(--pf-space-2)}
.palette-item{width:100%;min-width:0;display:flex;gap:var(--pf-space-2);align-items:center;text-align:left;border:var(--pf-border-width) solid var(--pf-color-border);background:var(--pf-color-surface);color:var(--pf-color-text);padding:var(--pf-space-2);border-radius:var(--pf-radius-sm);cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}
.palette-item:hover{border-color:var(--pf-color-primary);background:#e6f4ff}
.palette-item:focus-visible{outline:2px solid var(--pf-color-primary);outline-offset:2px}
.palette-glyph{display:grid;place-items:center;flex:none;width:26px;height:26px;border-radius:var(--pf-radius-sm);background:#e6f4ff;color:var(--pf-color-primary-strong);font-size:var(--pf-font-size-lg);font-weight:600}
.palette-item strong,.palette-item small{display:block}.palette-item strong{font-size:var(--pf-font-size-sm);font-weight:600}.palette-item small{color:var(--pf-color-text-secondary);font-size:11px;line-height:1.4;margin-top:2px;overflow-wrap:anywhere}
@media(max-width:760px){.palette{border-right:0;border-bottom:var(--pf-border-width) solid var(--pf-color-border)}.palette-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:420px){.palette-list{grid-template-columns:1fr}}
</style>
