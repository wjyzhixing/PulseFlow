<script setup lang="ts">
import type { ComponentType } from '@pulseflow/ui-dsl';

export interface PaletteItem {
  type: ComponentType;
  label: string;
  hint: string;
}

defineProps<{ items: readonly PaletteItem[] }>();
const emit = defineEmits<{ add: [type: ComponentType] }>();
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
        :data-testid="`palette-${item.type}`"
        @click="emit('add', item.type)"
      >
        <span class="palette-glyph">+</span>
        <span><strong>{{ item.label }}</strong><small>{{ item.type }} · {{ item.hint }}</small></span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.palette{height:100%;padding:22px 18px;background:#102d38;color:#f8f5e9;border-right:1px solid #33515a}.section-kicker{font:600 10px 'DM Mono',monospace;letter-spacing:.14em;color:#d2f473}.palette h2{font:700 21px 'Noto Serif SC',serif;margin:10px 0 5px}.palette>p{font-size:12px;line-height:1.6;color:#9db6ba;margin:0 0 18px}.palette-list{display:grid;gap:8px}.palette-item{width:100%;display:flex;gap:10px;align-items:center;text-align:left;border:1px solid #3b5962;background:#173743;color:#f8f5e9;padding:10px;border-radius:2px;transition:transform .16s,border-color .16s,background .16s}.palette-item:hover,.palette-item:focus-visible{transform:translateX(3px);border-color:#d2f473;background:#1d4652;outline:none}.palette-glyph{display:grid;place-items:center;width:25px;height:25px;background:#d2f473;color:#102d38;font:700 18px 'DM Mono',monospace}.palette-item strong,.palette-item small{display:block}.palette-item strong{font-size:13px}.palette-item small{color:#94afb4;font:9px/1.5 'DM Mono',monospace;margin-top:2px}
</style>
