<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import type { DesignDiagnostic } from './design-diagnostics';

const props = defineProps<{ source: string; diagnostics: readonly DesignDiagnostic[] }>();
const emit = defineEmits<{ edit: [source: string] }>();
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
  changeSubscription = editor.onDidChangeModelContent(() => {
    if (applyingExternalValue || !editor) return;
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
.dsl-editor{background:#102d38;color:#eaf1eb;border:1px solid #33515a}.dsl-editor header{height:64px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #33515a}.dsl-editor header span{font:600 9px 'DM Mono',monospace;letter-spacing:.13em;color:#86a5a9}.dsl-editor h2{font:600 15px 'Noto Sans SC',sans-serif;margin:3px 0 0}.dsl-editor header b{font:600 9px 'DM Mono',monospace;padding:5px 7px;border:1px solid}.dsl-editor header .valid{color:#d2f473;border-color:#719049}.dsl-editor header .invalid{color:#ffb4a8;border-color:#9b5148}.monaco-host{height:360px}.diagnostics{list-style:none;margin:0;padding:10px 14px 14px;border-top:1px solid #6e3f3d;background:#321f21;max-height:170px;overflow:auto}.diagnostics li{display:grid;grid-template-columns:auto 1fr;gap:5px 9px;padding:7px 0;border-bottom:1px solid #583335;font-size:11px}.diagnostics code{color:#ffb4a8}.diagnostics span{color:#c8a7a3}.diagnostics p{grid-column:1/-1;margin:0;color:#f4ded9;line-height:1.5}
</style>
