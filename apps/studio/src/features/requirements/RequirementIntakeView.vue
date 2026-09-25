<script setup lang="ts">
import { shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import type { RequirementSection } from '@pulseflow/requirement-import';
import RequirementSource from './RequirementSource.vue';
import SectionSelection from './SectionSelection.vue';
import { parseRequirement } from './requirement-api';
import { generateDraft } from '../draft/draft-api';
import { setBlankDraft, setDraft } from '../draft/draft-store';
const router = useRouter();
const text = shallowRef(''); const file = shallowRef<File | null>(null); const error = shallowRef(''); const busy = shallowRef(false);
const sections = shallowRef<RequirementSection[]>([]); const selectedIds = shallowRef<string[]>([]);
const source = shallowRef<InstanceType<typeof RequirementSource> | null>(null);
const maxBytes = 10 * 1024 * 1024;
function onFile(candidate: File | null) {
  if (!candidate) { file.value = null; return; }
  if (!candidate.name.toLowerCase().endsWith('.docx') || (candidate.type && candidate.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) { file.value = null; error.value = '仅支持 DOCX 文件'; source.value?.resetFile(); return; }
  if (candidate.size > maxBytes) { file.value = null; error.value = 'DOCX 文件不能超过 10 MB'; source.value?.resetFile(); return; }
  file.value = candidate; error.value = '';
}
async function parse() {
  if (!file.value && !text.value.trim()) { error.value = '请输入需求文本或上传 DOCX'; return; }
  busy.value = true; error.value = '';
  try {
    const parsed = await parseRequirement(file.value ?? text.value);
    if (!parsed.length) { error.value = '未找到可用章节，请检查原稿或补充内容后重试'; return; }
    sections.value = parsed;
    selectedIds.value = [];
    text.value = ''; file.value = null; source.value?.resetFile();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '解析失败，请重试'; }
  finally { busy.value = false; }
}
function toggle(id: string) { selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id]; }
function addManual(heading: string, content: string) {
  sections.value = [...sections.value, { id: `manual-${Date.now()}-${sections.value.length}`, heading: heading || null, text: content }];
}
async function generate() {
  const selected = sections.value.filter((section) => selectedIds.value.includes(section.id));
  if (!selected.length) { error.value = '请先选择至少一个章节'; return; }
  busy.value = true; error.value = '';
  try { setDraft(await generateDraft(selected)); await router.push('/draft'); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '生成失败，请重试'; }
  finally { busy.value = false; }
}
async function startBlankDraft() {
  setBlankDraft();
  await router.push('/design');
}
</script>
<template>
  <div class="panel intake-panel">
    <div class="page-heading">
      <div>
        <h2 class="page-title">导入业务需求</h2>
        <p class="lede">解析原始材料，核对章节范围，再生成可编辑的实体与界面定义。</p>
      </div>
      <button class="btn secondary blank-action" type="button" data-testid="start-blank-draft" :disabled="busy" @click="startBlankDraft">从空白画布开始 →</button>
    </div>
    <RequirementSource ref="source" :text="text" :file-name="file?.name || ''" :busy="busy" :error="error" @update:text="text = $event" @file="onFile" @parse="parse"/>
    <SectionSelection v-if="sections.length" :sections="sections" :selected-ids="selectedIds" :busy="busy" @toggle="toggle" @generate="generate" @add-manual="addManual"/>
  </div>
</template>
<style scoped>
.intake-panel { max-width: 800px; }
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--pf-space-4); margin-bottom: var(--pf-space-5); }
.page-title { margin: 0 0 var(--pf-space-1); color: var(--pf-color-text); font: 600 24px/1.4 var(--pf-font-family); letter-spacing: 0; }
.lede { margin: 0; color: var(--pf-color-text-secondary); line-height: var(--pf-line-height); }
.blank-action { flex: none; margin: 0; min-height: 36px; padding: var(--pf-space-1) var(--pf-space-4); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius); background: var(--pf-color-surface); color: var(--pf-color-text); font: inherit; font-weight: 400; box-shadow: var(--pf-shadow-sm); }
.blank-action:hover { border-color: var(--pf-color-primary); background: var(--pf-color-surface); color: var(--pf-color-primary); }
.blank-action:focus-visible { outline: 2px solid var(--pf-color-primary); outline-offset: 2px; }
.blank-action:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 640px) { .page-heading { flex-direction: column; } .blank-action { width: 100%; } }
</style>
