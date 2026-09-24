<script setup lang="ts">
import { shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import type { RequirementSection } from '@pulseflow/requirement-import';
import RequirementSource from './RequirementSource.vue';
import SectionSelection from './SectionSelection.vue';
import { parseRequirement } from './requirement-api';
import { generateDraft } from '../draft/draft-api';
import { setDraft } from '../draft/draft-store';
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
</script>
<template><div class="panel"><div class="eyebrow">INGEST / REQUIREMENT SOURCE</div><h2 class="page-title">导入业务需求</h2><p class="lede">解析原始材料，核对章节范围，再生成可编辑的实体与界面定义。</p><RequirementSource ref="source" :text="text" :file-name="file?.name || ''" :busy="busy" :error="error" @update:text="text = $event" @file="onFile" @parse="parse"/><SectionSelection v-if="sections.length" :sections="sections" :selected-ids="selectedIds" :busy="busy" @toggle="toggle" @generate="generate" @add-manual="addManual"/></div></template>
