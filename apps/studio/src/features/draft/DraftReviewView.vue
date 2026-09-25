<script setup lang="ts">
import { shallowRef } from 'vue';
import { validatePageDsl, type EntityField, type PageDsl, type SemanticQuestion } from '@pulseflow/ui-dsl';
import { useRouter } from 'vue-router';
import DraftEditor from './DraftEditor.vue';
import { beginDraftSave, editDraftSession, finishDraftSaveFailure, getDraftSession, isDraftRevisionCurrent, markDraftSaved } from './draft-store';
import { saveDraft } from './draft-api';
const router = useRouter();
const initial = getDraftSession();
const fieldsText = shallowRef(initial?.fieldsText ?? '[]');
const dslText = shallowRef(initial?.dslText ?? '{}');
const questions = shallowRef<SemanticQuestion[]>(initial?.questions ?? []);
const feedback = shallowRef(''); const valid = shallowRef(false);
function invalidate() { feedback.value = ''; valid.value = false; }
function editFields(value: string) { fieldsText.value = value; editDraftSession({ fieldsText: value }); invalidate(); }
function editDsl(value: string) { dslText.value = value; editDraftSession({ dslText: value }); invalidate(); }
function answer(id: string, value: string) { questions.value = questions.value.map((question) => question.id === id ? { ...question, answer: value } : question); editDraftSession({ questions: questions.value }); invalidate(); }
async function confirm() {
  let fields: EntityField[]; let page: PageDsl;
  try { fields = JSON.parse(fieldsText.value) as EntityField[]; page = JSON.parse(dslText.value) as PageDsl; }
  catch { feedback.value = 'JSON 格式无效，请检查实体字段和 UI-DSL'; valid.value = false; return; }
  const validation = validatePageDsl(page, fields);
  if (!validation.ok) { feedback.value = `校验未通过：${validation.diagnostics.map((item) => `${item.path}: ${item.message}`).join('；')}`; valid.value = false; return; }
  const currentSession = getDraftSession();
  if (!currentSession) return;
  const draftId = currentSession.id;
  const submittedRevision = currentSession.revision;
  const submittedQuestions = questions.value.map((question) => ({ ...question }));
  const unanswered = submittedQuestions.filter((question) => !question.answer?.trim()).length;
  if (!beginDraftSave(draftId)) return;
  try {
    const persisted = await saveDraft({ id: draftId, pageId: page.pageId, pageDsl: page, entityFields: fields, semanticQuestions: submittedQuestions, status: 'draft' }, currentSession.saved);
    if (!markDraftSaved(draftId, persisted.id, submittedRevision)) return;
    feedback.value = `校验通过并已保存草稿 · ${fields.length} 个实体字段 · ${unanswered} 个问题待回答（草稿可保留）`;
    valid.value = true;
  } catch (cause) {
    finishDraftSaveFailure(draftId);
    if (!isDraftRevisionCurrent(draftId, submittedRevision)) return;
    feedback.value = cause instanceof Error ? cause.message : '草稿保存失败，请重试'; valid.value = false;
  }
}
</script>
<template>
  <div class="panel draft-panel" data-testid="draft-ready">
    <h2 class="page-title">确认实体结构</h2>
    <p class="lede">检查模型产出的字段、问题与 UI-DSL。编辑后运行本地结构校验。</p>
    <template v-if="initial">
      <DraftEditor :fields-text="fieldsText" :dsl-text="dslText" :questions="questions" :feedback="feedback" :valid="valid" @update:fields-text="editFields" @update:dsl-text="editDsl" @answer="answer" @confirm="confirm"/>
      <div class="action-row"><button class="btn design-entry" data-testid="enter-design" @click="router.push('/design')">进入设计画布 →</button></div>
    </template>
    <div v-else class="card empty-card">
      <p>当前没有生成的草稿。请先导入需求。</p>
      <button class="btn" @click="router.push('/requirements')">返回需求导入</button>
    </div>
  </div>
</template>
<style scoped>
.draft-panel { max-width: 800px; }
.page-title { margin: 0 0 var(--pf-space-1); color: var(--pf-color-text); font: 600 24px/1.4 var(--pf-font-family); letter-spacing: 0; }
.lede { margin: 0 0 var(--pf-space-5); color: var(--pf-color-text-secondary); line-height: var(--pf-line-height); }
.action-row { display: flex; justify-content: flex-end; margin-top: var(--pf-space-4); }
.empty-card { margin: 0; padding: var(--pf-space-5); background: var(--pf-color-surface); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius); box-shadow: var(--pf-shadow-sm); }
.empty-card p { margin: 0; color: var(--pf-color-text-secondary); }
.btn { min-height: 36px; margin: var(--pf-space-4) 0 0; padding: var(--pf-space-1) var(--pf-space-4); border: var(--pf-border-width) solid #0958d9; border-radius: var(--pf-radius); background: #0958d9; color: #fff; font: inherit; font-weight: 400; box-shadow: var(--pf-shadow-sm); }
.btn:hover { border-color: #003eb3; background: #003eb3; color: #fff; }
.btn:focus-visible { outline: 2px solid var(--pf-color-primary); outline-offset: 2px; }
.design-entry { margin: 0; }
@media (max-width: 560px) { .empty-card { padding: var(--pf-space-4); } .action-row .btn, .empty-card .btn { width: 100%; } }
</style>
