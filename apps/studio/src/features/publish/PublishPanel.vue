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
  <section class="publish-panel" aria-label="页面发布">
    <header><div><span class="kicker">RELEASE CONTROL</span><h2>发布检查</h2></div><span data-testid="publish-status">{{ versionId ? '已发布' : '待发布' }}</span></header>
    <ol class="gates">
      <li v-for="id in hardGates" :key="id">
        <strong>{{ labels[id] }}</strong><span>{{ gates.find((gate) => gate.id === id)?.status === 'passed' ? '通过' : gates.find((gate) => gate.id === id)?.status === 'failed' ? '失败' : '待运行' }}</span>
      </li>
      <li><strong>{{ labels.eslint }}</strong><span>{{ gates.find((gate) => gate.id === 'eslint')?.status === 'failed' ? '警告' : gates.find((gate) => gate.id === 'eslint')?.status === 'passed' ? '通过' : '待运行' }}</span></li>
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
.publish-panel{border:1px solid #173943;background:#fffef8;padding:20px;margin-top:24px;box-shadow:9px 9px 0 #cdd8d0;color:#173943}.publish-panel header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #d2f473;padding-bottom:10px}.publish-panel h2{margin:4px 0 0;font:700 20px 'Noto Serif SC',serif}.kicker{font:600 10px 'DM Mono',monospace;letter-spacing:.16em;color:#386b6c}.gates{padding:0;list-style:none;display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.gates li{display:flex;flex-direction:column;gap:5px;background:#edf1e9;padding:10px;font-size:11px}.gates strong{font-weight:700}.diagnostics{padding-left:18px;color:#9a302b;font-size:12px}.diagnostics li+li{margin-top:5px}.version{font:600 12px 'DM Mono',monospace;color:#386b6c}.publish-panel button{border:0;background:#d2f473;color:#173943;padding:10px 15px;font-weight:700;cursor:pointer}.publish-panel button:disabled{opacity:.55;cursor:wait}@media(max-width:760px){.gates{grid-template-columns:repeat(2,1fr)}}
</style>
