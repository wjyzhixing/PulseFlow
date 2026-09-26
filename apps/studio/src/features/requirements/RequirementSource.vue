<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue';
import { shallowRef } from 'vue';
defineProps<{ text: string; fileName: string; busy: boolean; error: string }>();
const emit = defineEmits<{ 'update:text': [value: string]; file: [value: File | null]; parse: [] }>();
const fileInput = shallowRef<HTMLInputElement | null>(null);
function onFile(event: Event) { emit('file', (event.target as HTMLInputElement).files?.[0] ?? null); }
function resetFile() { if (fileInput.value) fileInput.value.value = ''; }
defineExpose({ resetFile });
</script>
<template>
  <section class="card source-card">
    <h2>01 / 导入需求</h2>
    <div class="field-group">
      <label class="field-label" for="requirement-text">粘贴需求文本</label>
      <textarea id="requirement-text" class="textarea" data-testid="requirement-text" :value="text" placeholder="粘贴业务需求、字段说明或流程约束…" @input="emit('update:text', ($event.target as HTMLTextAreaElement).value)"></textarea>
    </div>
    <div class="field-group">
      <label class="field-label" for="requirement-file">或上传 DOCX 文件</label>
      <input id="requirement-file" ref="fileInput" data-testid="requirement-file" class="input file-input" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="onFile">
      <p class="muted file-hint">{{ fileName || '支持 .docx，最大 10 MB' }}</p>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="action-row"><AButton class="btn" data-testid="parse-requirement" :disabled="busy" @click="emit('parse')">{{ busy ? '正在解析…' : '解析需求 →' }}</AButton></div>
  </section>
</template>
<style scoped>
.source-card { margin: 0 0 var(--pf-space-4); padding: var(--pf-space-5); background: var(--pf-color-surface); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius); box-shadow: var(--pf-shadow-sm); }
.source-card h2 { margin: 0 0 var(--pf-space-5); color: var(--pf-color-text); font-size: var(--pf-font-size-lg); font-weight: 600; }
.field-group + .field-group { margin-top: var(--pf-space-4); }
.field-label { margin: 0 0 var(--pf-space-2); color: var(--pf-color-text); font-size: var(--pf-font-size); font-weight: 500; }
.input, .textarea { min-height: 40px; padding: var(--pf-space-2) var(--pf-space-3); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius); background: var(--pf-color-surface); color: var(--pf-color-text); font: inherit; }
.textarea { min-height: 144px; line-height: var(--pf-line-height); }
.input:hover, .textarea:hover { border-color: var(--pf-color-primary-hover); }
.input:focus, .textarea:focus { border-color: var(--pf-color-primary); outline: 2px solid rgba(22, 119, 255, .16); outline-offset: 0; }
.file-input { padding: var(--pf-space-1); font-size: var(--pf-font-size); }
.file-input::file-selector-button { margin-right: var(--pf-space-3); padding: var(--pf-space-1) var(--pf-space-3); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius-sm); background: var(--pf-color-surface); color: var(--pf-color-text); font: inherit; cursor: pointer; }
.file-input::file-selector-button:hover { border-color: var(--pf-color-primary-strong); color: var(--pf-color-primary-strong); }
.file-hint { margin: var(--pf-space-1) 0 0; color: var(--pf-color-text-secondary); font-size: var(--pf-font-size-sm); }
.error { margin: var(--pf-space-4) 0 0; padding: var(--pf-space-2) var(--pf-space-3); color: var(--pf-color-error-text); background: #fff2f0; border: var(--pf-border-width) solid #ffccc7; border-radius: var(--pf-radius); }
.action-row { display: flex; justify-content: flex-end; margin-top: var(--pf-space-5); }
.btn { min-height: 36px; margin: 0; padding: var(--pf-space-1) var(--pf-space-4); border: var(--pf-border-width) solid var(--pf-color-primary-strong); border-radius: var(--pf-radius); background: var(--pf-color-primary-strong); color: #fff; font: inherit; font-weight: 400; box-shadow: var(--pf-shadow-sm); }
.btn:hover { border-color: var(--pf-color-primary-strong-hover); background: var(--pf-color-primary-strong-hover); color: #fff; }
.btn:focus-visible { outline: 2px solid var(--pf-color-primary); outline-offset: 2px; }
.btn:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 560px) { .source-card { padding: var(--pf-space-4); } .action-row .btn { width: 100%; } }
</style>
