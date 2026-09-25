<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue';
import type { SemanticQuestion } from '@pulseflow/ui-dsl';
defineProps<{ fieldsText: string; dslText: string; questions: SemanticQuestion[]; feedback: string; valid: boolean }>();
const emit = defineEmits<{ 'update:fieldsText': [value: string]; 'update:dslText': [value: string]; answer: [id: string, answer: string]; confirm: [] }>();
</script>
<template>
  <section class="card editor-card">
    <h2>03 / 核对实体与界面</h2>
    <div class="editor-fields">
      <div class="field-group"><label class="field-label" for="draft-fields">实体字段 · JSON</label><textarea id="draft-fields" class="textarea code" data-testid="draft-fields" :value="fieldsText" @input="emit('update:fieldsText', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
      <div class="field-group"><label class="field-label" for="draft-dsl">UI-DSL · JSON</label><textarea id="draft-dsl" class="textarea code" data-testid="draft-dsl" :value="dslText" @input="emit('update:dslText', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
    </div>
    <div v-if="questions.length" class="questions">
      <h2>待澄清问题</h2>
      <p class="muted">可以暂时留空并保存在草稿中；发布前需要回答。</p>
      <div v-for="question in questions" :key="question.id" class="field-group"><label class="field-label" :for="`question-${question.id}`">{{ question.question }}</label><input :id="`question-${question.id}`" class="input" :value="question.answer || ''" @input="emit('answer', question.id, ($event.target as HTMLInputElement).value)"></div>
    </div>
    <p v-if="feedback" :class="valid ? 'success' : 'error'" role="status">{{ feedback }}</p>
    <div class="action-row"><AButton class="btn" data-testid="confirm-draft" @click="emit('confirm')">确认结构并校验 →</AButton></div>
  </section>
</template>
<style scoped>
.editor-card { margin: 0; padding: var(--pf-space-5); background: var(--pf-color-surface); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius-lg); box-shadow: var(--pf-shadow-sm); }
.editor-card h2 { margin: 0 0 var(--pf-space-5); color: var(--pf-color-text); font-size: var(--pf-font-size-lg); font-weight: 600; }
.editor-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--pf-space-4); }
.field-group { min-width: 0; }
.field-label { margin: 0 0 var(--pf-space-2); color: var(--pf-color-text); font-size: var(--pf-font-size); font-weight: 500; }
.input, .textarea { min-height: 40px; padding: var(--pf-space-2) var(--pf-space-3); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius); background: var(--pf-color-surface); color: var(--pf-color-text); font: inherit; }
.textarea.code { min-height: 220px; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; tab-size: 2; }
.input:hover, .textarea:hover { border-color: var(--pf-color-primary-hover); }
.input:focus, .textarea:focus { border-color: var(--pf-color-primary); outline: 2px solid rgba(22, 119, 255, .16); outline-offset: 0; }
.questions { margin-top: var(--pf-space-5); padding-top: var(--pf-space-5); border-top: var(--pf-border-width) solid var(--pf-color-border-secondary); }
.questions h2 { margin-bottom: var(--pf-space-1); }
.questions .muted { margin: 0 0 var(--pf-space-4); color: var(--pf-color-text-secondary); }
.questions .field-group + .field-group { margin-top: var(--pf-space-4); }
.success, .error { margin: var(--pf-space-4) 0 0; padding: var(--pf-space-2) var(--pf-space-3); border: var(--pf-border-width) solid; border-radius: var(--pf-radius); overflow-wrap: anywhere; }
.success { color: #389e0d; background: #f6ffed; border-color: #b7eb8f; }
.error { color: var(--pf-color-error); background: #fff2f0; border-color: #ffccc7; }
.action-row { display: flex; justify-content: flex-end; margin-top: var(--pf-space-5); }
.btn { min-height: 36px; margin: 0; padding: var(--pf-space-1) var(--pf-space-4); border: var(--pf-border-width) solid var(--pf-color-primary); border-radius: var(--pf-radius); background: var(--pf-color-primary); color: #fff; font: inherit; font-weight: 400; box-shadow: var(--pf-shadow-sm); }
.btn:hover { border-color: var(--pf-color-primary-hover); background: var(--pf-color-primary-hover); color: #fff; }
.btn:focus-visible { outline: 2px solid var(--pf-color-primary); outline-offset: 2px; }
@media (max-width: 560px) { .editor-card { padding: var(--pf-space-4); } .action-row .btn { width: 100%; } }
</style>
