<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import type { DesignDiagnostic } from './design-diagnostics';

declare global {
  interface Window { __pulseflowMonacoEditor?: monaco.editor.IStandaloneCodeEditor }
}

const props = defineProps<{ source: string; diagnostics: readonly DesignDiagnostic[] }>();
const emit = defineEmits<{ buffer: [source: string]; edit: [source: string] }>();
const editorElement = useTemplateRef<HTMLElement>('editorElement');
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let changeSubscription: monaco.IDisposable | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let applyingExternalValue = false;

if (typeof self !== 'undefined') {
  self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
}

function applyMarkers() {
  const model = editor?.getModel();
  if (!model) return;
  monaco.editor.setModelMarkers(model, 'pulseflow-dsl', props.diagnostics.map((item) => ({
    severity: monaco.MarkerSeverity.Error,
    message: `[${item.code}] ${item.path}: ${item.message}`,
    startLineNumber: item.line,
    startColumn: item.col,
    endLineNumber: item.line,
    endColumn: item.col + 1
  })));
}

onMounted(() => {
  if (!editorElement.value) return;
  editor = monaco.editor.create(editorElement.value, {
    value: props.source,
    language: 'json',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: 'DM Mono, monospace',
    fontSize: 12,
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    tabSize: 2
  });
  if (import.meta.env.DEV && import.meta.env.MODE === 'e2e') window.__pulseflowMonacoEditor = editor;
  changeSubscription = editor.onDidChangeModelContent(() => {
    if (applyingExternalValue || !editor) return;
    emit('buffer', editor.getValue());
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { if (editor) emit('edit', editor.getValue()); }, 250);
  });
  applyMarkers();
});

watch(() => props.source, (value) => {
  if (!editor || editor.getValue() === value) return;
  applyingExternalValue = true;
  editor.setValue(value);
  applyingExternalValue = false;
});
watch(() => props.diagnostics, applyMarkers, { deep: true });
onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  const model = editor?.getModel();
  changeSubscription?.dispose();
  editor?.dispose();
  if (window.__pulseflowMonacoEditor === editor) delete window.__pulseflowMonacoEditor;
  model?.dispose();
});
</script>

<template>
  <section class="dsl-editor" aria-labelledby="dsl-title">
    <header><div><span>04 / CANONICAL JSON</span><h2 id="dsl-title">UI-DSL 源码</h2></div><b :class="diagnostics.length ? 'invalid' : 'valid'">{{ diagnostics.length ? `${diagnostics.length} ERRORS` : 'VALID' }}</b></header>
    <div ref="editorElement" class="monaco-host" data-testid="dsl-monaco"></div>
    <ul v-if="diagnostics.length" class="diagnostics" aria-live="polite">
      <li v-for="item in diagnostics" :key="`${item.code}-${item.path}-${item.line}-${item.col}`"><code>{{ item.code }}</code><span>{{ item.path }} · {{ item.line }}:{{ item.col }}</span><p>{{ item.message }}</p></li>
    </ul>
  </section>
</template>

<style scoped>
.dsl-editor{min-width:0;background:var(--pf-color-surface);color:var(--pf-color-text);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);overflow:hidden}
.dsl-editor header{min-height:56px;padding:var(--pf-space-2) var(--pf-space-4);display:flex;align-items:center;justify-content:space-between;gap:var(--pf-space-2);border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.dsl-editor header span{font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text-secondary)}
.dsl-editor h2{font-size:var(--pf-font-size-lg);font-weight:600;margin:var(--pf-space-1) 0 0}
.dsl-editor header b{font-size:var(--pf-font-size-sm);font-weight:500;padding:var(--pf-space-1) var(--pf-space-2);border:var(--pf-border-width) solid;border-radius:var(--pf-radius-sm)}
.dsl-editor header .valid{color:var(--pf-color-success-text);background:#f6ffed;border-color:#b7eb8f}.dsl-editor header .invalid{color:var(--pf-color-error-text);background:#fff2f0;border-color:#ffccc7}
.monaco-host{height:360px;min-width:0}.diagnostics{list-style:none;margin:0;padding:var(--pf-space-2) var(--pf-space-3);border-top:var(--pf-border-width) solid #ffccc7;background:#fff2f0;max-height:170px;overflow:auto}
.diagnostics li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--pf-space-1) var(--pf-space-2);padding:var(--pf-space-2) 0;border-bottom:var(--pf-border-width) solid #ffccc7;font-size:var(--pf-font-size-sm)}
.diagnostics code{color:var(--pf-color-error-text)}.diagnostics span{color:var(--pf-color-text-secondary);overflow-wrap:anywhere}.diagnostics p{grid-column:1/-1;margin:0;color:var(--pf-color-text);line-height:var(--pf-line-height)}
</style>
