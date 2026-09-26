<script setup lang="ts">
import type { GateResult } from './publication-api';

defineProps<{ gates: readonly GateResult[]; versionId: string; pending: boolean; error: string }>();
defineEmits<{ publish: [] }>();

const labels: Record<GateResult['id'], string> = {
  dsl: 'DSL', 'preview-compile': '预览编译', typecheck: '类型检查', 'template-build': '干净模板构建', eslint: 'ESLint'
};
const hardGates = ['dsl', 'preview-compile', 'typecheck', 'template-build'] as const;
</script>

<template>
  <section class="publish-panel" aria-label="页面发布" data-testid="publish">
    <header><div><span class="kicker">RELEASE CONTROL</span><h2>发布检查</h2></div><span data-testid="publish-status">{{ versionId ? '已发布' : '待发布' }}</span></header>
    <ol class="gates">
      <li v-for="id in hardGates" :key="id" :class="gates.find((gate) => gate.id === id)?.status">
        <strong>{{ labels[id] }}</strong><span>{{ gates.find((gate) => gate.id === id)?.status === 'passed' ? '通过' : gates.find((gate) => gate.id === id)?.status === 'failed' ? '失败' : '待运行' }}</span>
      </li>
      <li :class="gates.find((gate) => gate.id === 'eslint')?.status"><strong>{{ labels.eslint }}</strong><span>{{ gates.find((gate) => gate.id === 'eslint')?.status === 'failed' ? '警告' : gates.find((gate) => gate.id === 'eslint')?.status === 'passed' ? '通过' : '待运行' }}</span></li>
    </ol>
    <p v-if="versionId" class="version">版本 {{ versionId }}</p>
    <ul v-if="gates.some((gate) => gate.diagnostics.length)" class="diagnostics">
      <li v-for="(diagnostic, index) in gates.flatMap((gate) => gate.diagnostics)" :key="index">{{ diagnostic.path }}：{{ diagnostic.message }}</li>
    </ul>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="button" data-testid="publish-action" :disabled="pending" @click="$emit('publish')">{{ pending ? '发布检查中…' : '运行检查并发布' }}</button>
  </section>
</template>

<style scoped>
.publish-panel{min-width:0;border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);background:var(--pf-color-surface);padding:var(--pf-space-4);margin-top:var(--pf-space-5);box-shadow:var(--pf-shadow-sm);color:var(--pf-color-text)}
.publish-panel header{display:flex;justify-content:space-between;align-items:center;gap:var(--pf-space-3);padding-bottom:var(--pf-space-3);border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.publish-panel h2{margin:var(--pf-space-1) 0 0;font-size:var(--pf-font-size-lg);font-weight:600}.kicker{font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text-secondary)}
.publish-panel header>span{font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary)}
.gates{padding:0;list-style:none;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--pf-space-2);margin:var(--pf-space-4) 0}
.gates li{display:flex;flex-direction:column;gap:var(--pf-space-1);min-width:0;background:var(--pf-color-bg);border:var(--pf-border-width) solid var(--pf-color-border-secondary);border-radius:var(--pf-radius-sm);padding:var(--pf-space-2) var(--pf-space-3);font-size:var(--pf-font-size-sm)}
.gates strong{font-weight:600;overflow-wrap:anywhere}.gates span{color:var(--pf-color-text-secondary)}
.gates .passed{background:#f6ffed;border-color:#b7eb8f}.gates .passed span{color:var(--pf-color-success-text)}
.gates .failed{background:#fff2f0;border-color:#ffccc7}.gates .failed span{color:var(--pf-color-error-text)}
.diagnostics{padding-left:var(--pf-space-5);color:var(--pf-color-error-text);font-size:var(--pf-font-size-sm)}.diagnostics li+li{margin-top:var(--pf-space-1)}
.publish-panel [role="alert"]{color:var(--pf-color-error-text)}
.version{font-size:var(--pf-font-size-sm);font-weight:600;color:var(--pf-color-primary-strong)}
.publish-panel button{border:var(--pf-border-width) solid var(--pf-color-primary-strong);border-radius:var(--pf-radius-sm);background:var(--pf-color-primary-strong);color:var(--pf-color-surface);padding:var(--pf-space-2) var(--pf-space-4);font-size:var(--pf-font-size);font-weight:500;cursor:pointer;box-shadow:var(--pf-shadow-sm)}
.publish-panel button:hover:not(:disabled){background:var(--pf-color-primary-strong-hover);border-color:var(--pf-color-primary-strong-hover)}.publish-panel button:focus-visible{outline:2px solid var(--pf-color-primary);outline-offset:2px}.publish-panel button:disabled{opacity:.55;cursor:wait}
@media(max-width:1100px){.gates{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.gates{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:420px){.gates{grid-template-columns:1fr}}
</style>
