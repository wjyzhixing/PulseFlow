<script setup lang="ts">
import { computed, defineComponent, h, shallowRef } from 'vue';
import { validatePageDsl } from '@pulseflow/ui-dsl';
import { renderPage, type EventHandlers, type PreviewData } from '@pulseflow/page-generator';
import { createMockHandlers } from './mock-handlers';

const props = withDefaults(defineProps<{ dsl: unknown; data?: PreviewData; handlers?: EventHandlers }>(), { data: () => ({}) });
const lastEvent = shallowRef('');
const validation = computed(() => validatePageDsl(props.dsl));
const activeHandlers = computed(() => props.handlers ?? createMockHandlers(props.dsl, (name) => { lastEvent.value = `模拟事件：${name}`; }));
const PreviewContent = defineComponent({ setup() { return () => renderPage(props.dsl, props.data, activeHandlers.value); } });
</script>

<template>
  <section class="preview-panel" aria-label="页面预览">
    <header class="preview-panel__header"><h2>实时预览</h2><span data-testid="preview-status">{{ validation.ok ? '预览就绪' : '预览待修复' }} · SAFE RENDERER</span></header>
    <p v-if="!validation.ok" class="preview-panel__error" role="alert">{{ validation.diagnostics.map((item) => item.code).join(' · ') }}</p>
    <PreviewContent v-else />
    <p v-if="lastEvent" class="preview-panel__event" role="status">{{ lastEvent }}</p>
  </section>
</template>

<style scoped>
.preview-panel{border:1px solid #173943;background:#fffef8;padding:20px;min-height:180px;margin-top:24px;box-shadow:9px 9px 0 #cdd8d0}.preview-panel__header{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:2px solid #d2f473;padding-bottom:11px;margin-bottom:20px}.preview-panel__header h2{font:700 18px 'Noto Serif SC',serif;color:#173943;margin:0}.preview-panel__header span{font:10px 'DM Mono',monospace;color:#386b6c;letter-spacing:.1em}.preview-panel__error{color:#9a302b}.preview-panel__event{display:inline-block;background:#d2f473;color:#173943;padding:6px 10px;font:600 11px 'DM Mono',monospace}@media(max-width:760px){.preview-panel__header{align-items:flex-start;flex-direction:column}}
.preview-panel :deep(.pulseflow-preview){display:grid;gap:18px}.preview-panel :deep(.pulseflow-page-header){display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #d2f473;padding-bottom:16px}.preview-panel :deep(.pulseflow-page-header h1){font:700 28px 'Noto Serif SC',serif;color:#173943;margin:0}.preview-panel :deep(.pulseflow-page-header p){color:#607775;margin:7px 0 0}.preview-panel :deep(.pulseflow-page-header__tags){display:flex;flex-wrap:wrap;gap:6px}
</style>
