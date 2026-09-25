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
.preview-panel{min-width:0;border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);background:var(--pf-color-surface);min-height:180px;margin-top:var(--pf-space-5);box-shadow:var(--pf-shadow-sm);overflow:hidden}
.preview-panel__header{display:flex;justify-content:space-between;align-items:center;gap:var(--pf-space-3);padding:var(--pf-space-3) var(--pf-space-4);border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.preview-panel__header h2{font-size:var(--pf-font-size-lg);font-weight:600;color:var(--pf-color-text);margin:0}
.preview-panel__header span{font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary)}
.preview-panel__error{color:var(--pf-color-error-text);margin:var(--pf-space-4)}
.preview-panel__event{display:inline-block;margin:0 var(--pf-space-4) var(--pf-space-4);background:#e6f4ff;color:var(--pf-color-primary);padding:var(--pf-space-1) var(--pf-space-2);border-radius:var(--pf-radius-sm);font-size:var(--pf-font-size-sm)}
.preview-panel :deep(.pulseflow-preview){display:grid;gap:var(--pf-space-4);min-width:0;margin:var(--pf-space-4);padding:var(--pf-space-5);background:var(--pf-color-surface);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);box-shadow:var(--pf-shadow-sm);overflow-x:auto}
.preview-panel :deep(.pulseflow-page-header){display:flex;justify-content:space-between;align-items:flex-start;gap:var(--pf-space-3);border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary);padding-bottom:var(--pf-space-4)}
.preview-panel :deep(.pulseflow-page-header h1){font-size:20px;font-weight:600;color:var(--pf-color-text);margin:0}
.preview-panel :deep(.pulseflow-page-header p){color:var(--pf-color-text-secondary);margin:var(--pf-space-1) 0 0}
.preview-panel :deep(.pulseflow-page-header__tags){display:flex;flex-wrap:wrap;gap:var(--pf-space-2)}
@media(max-width:760px){.preview-panel__header{align-items:flex-start;flex-direction:column}.preview-panel :deep(.pulseflow-preview){margin:var(--pf-space-2);padding:var(--pf-space-3)}.preview-panel :deep(.pulseflow-page-header){flex-direction:column}}
</style>
