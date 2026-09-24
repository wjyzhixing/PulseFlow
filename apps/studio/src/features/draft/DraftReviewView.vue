<script setup lang="ts">
import { shallowRef } from 'vue';
import { validatePageDsl, type EntityField, type PageDsl, type SemanticQuestion } from '@pulseflow/ui-dsl';
import { useRouter } from 'vue-router';
import DraftEditor from './DraftEditor.vue';
import { getDraftSession, updateDraftSession } from './draft-store';
import { saveDraft } from './draft-api';
const router = useRouter();
const initial = getDraftSession();
const fieldsText = shallowRef(initial?.fieldsText ?? '[]');
const dslText = shallowRef(initial?.dslText ?? '{}');
const questions = shallowRef<SemanticQuestion[]>(initial?.questions ?? []);
const feedback = shallowRef(''); const valid = shallowRef(false);
const draftId = initial?.id ?? ''; const saved = shallowRef(initial?.saved ?? false);
function invalidate() { feedback.value = ''; valid.value = false; }
function editFields(value: string) { fieldsText.value = value; updateDraftSession({ fieldsText: value }); invalidate(); }
function editDsl(value: string) { dslText.value = value; updateDraftSession({ dslText: value }); invalidate(); }
function answer(id: string, value: string) { questions.value = questions.value.map((question) => question.id === id ? { ...question, answer: value } : question); updateDraftSession({ questions: questions.value }); invalidate(); }
async function confirm() {
  let fields: EntityField[]; let page: PageDsl;
  try { fields = JSON.parse(fieldsText.value) as EntityField[]; page = JSON.parse(dslText.value) as PageDsl; }
  catch { feedback.value = 'JSON 格式无效，请检查实体字段和 UI-DSL'; valid.value = false; return; }
  const validation = validatePageDsl(page, fields);
  if (!validation.ok) { feedback.value = `校验未通过：${validation.diagnostics.map((item) => `${item.path}: ${item.message}`).join('；')}`; valid.value = false; return; }
  const unanswered = questions.value.filter((question) => !question.answer?.trim()).length;
  try {
    await saveDraft({ id: draftId, pageId: page.pageId, pageDsl: page, entityFields: fields, semanticQuestions: questions.value, status: 'draft' }, saved.value);
    saved.value = true; updateDraftSession({ saved: true });
    feedback.value = `校验通过并已保存草稿 · ${fields.length} 个实体字段 · ${unanswered} 个问题待回答（草稿可保留）`;
    valid.value = true;
  } catch (cause) { feedback.value = cause instanceof Error ? cause.message : '草稿保存失败，请重试'; valid.value = false; }
}
</script>
<template><div class="panel"><div class="eyebrow">MODEL / DRAFT REVIEW</div><h2 class="page-title">确认实体结构</h2><p class="lede">检查模型产出的字段、问题与 UI-DSL。编辑后运行本地结构校验。</p><template v-if="initial"><DraftEditor :fields-text="fieldsText" :dsl-text="dslText" :questions="questions" :feedback="feedback" :valid="valid" @update:fields-text="editFields" @update:dsl-text="editDsl" @answer="answer" @confirm="confirm"/></template><div v-else class="card"><p>当前没有生成的草稿。请先导入需求。</p><button class="btn" @click="router.push('/requirements')">返回需求导入</button></div></div></template>
