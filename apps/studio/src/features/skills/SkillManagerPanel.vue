<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import { createSkill, deleteSkill, listSkills, updateSkill, type SkillInput, type SkillSummary } from './skill-api';
import { STUDIO_SKILL_SCOPES } from './skill-types';
import SkillEditorForm from './SkillEditorForm.vue';
import SkillList from './SkillList.vue';

const emit = defineEmits<{ close: [] }>();
const skills = shallowRef<SkillSummary[]>([]);
const form = shallowRef<SkillInput>(emptySkill());
const selectedSlug = shallowRef('');
const editingNewSkill = shallowRef(true);
const pending = shallowRef(false);
const error = shallowRef('');
const loadError = shallowRef('');

function emptySkill(): SkillInput {
  return { slug: '', name: '', description: '', studio_scopes: [...STUDIO_SKILL_SCOPES], studio_enabled: true, body: '' };
}

function editSkill(skill: SkillSummary): void {
  selectedSlug.value = skill.slug;
  editingNewSkill.value = false;
  error.value = '';
  form.value = {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    ...(skill.license ? { license: skill.license } : {}),
    ...(skill.compatibility ? { compatibility: skill.compatibility } : {}),
    studio_scopes: [...skill.studio_scopes],
    studio_enabled: skill.studio_enabled,
    body: skill.body
  };
}

function startNewSkill(): void {
  selectedSlug.value = '';
  editingNewSkill.value = true;
  error.value = '';
  form.value = emptySkill();
}

async function refreshSkills(): Promise<void> {
  loadError.value = '';
  try {
    skills.value = await listSkills();
    const selected = skills.value.find((skill) => skill.slug === selectedSlug.value);
    if (selected) editSkill(selected);
    else if (skills.value[0]) editSkill(skills.value[0]);
    else startNewSkill();
  } catch (caught) {
    loadError.value = caught instanceof Error ? caught.message : '无法读取项目 Skills';
  }
}

async function saveSkill(): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  try {
    const saved = editingNewSkill.value ? await createSkill(form.value) : await updateSkill(form.value);
    skills.value = [...skills.value.filter((skill) => skill.slug !== saved.slug), saved].sort((left, right) => left.slug.localeCompare(right.slug));
    editSkill(saved);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Skill 保存失败';
  } finally {
    pending.value = false;
  }
}

async function removeSkill(): Promise<void> {
  if (pending.value || editingNewSkill.value || !selectedSlug.value) return;
  if (!window.confirm(`删除「${form.value.name}」？这会移除 SKILL.md；references 等辅助文件会保留在项目 Skills 目录。`)) return;
  pending.value = true;
  error.value = '';
  try {
    await deleteSkill(selectedSlug.value);
    skills.value = skills.value.filter((skill) => skill.slug !== selectedSlug.value);
    if (skills.value[0]) editSkill(skills.value[0]);
    else startNewSkill();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Skill 删除失败';
  } finally {
    pending.value = false;
  }
}

onMounted(() => { void refreshSkills(); });
</script>

<template>
  <div class="skill-manager-backdrop" @click.self="emit('close')">
    <section class="skill-manager" role="dialog" aria-modal="true" aria-labelledby="skill-manager-title">
      <header class="skill-manager__header"><div><span>项目级规则文件</span><h2 id="skill-manager-title">AI Skills</h2><p>同一份 SKILL.md 可供 Studio 页面 AI 和项目开发助手使用；开发助手重新载入项目 Skills 后即可识别。</p></div><button type="button" aria-label="关闭 AI Skills" @click="emit('close')">关闭</button></header>
      <div v-if="loadError" class="skill-manager__load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="refreshSkills">重试</button></div>
      <div class="skill-manager__body">
        <aside class="skill-manager__sidebar"><div class="skill-manager__list-heading"><strong>项目 Skills</strong><button type="button" :disabled="pending" @click="startNewSkill">新建</button></div><SkillList :skills="skills" :selected-slug="selectedSlug" :pending="pending" @select="(slug) => { const selected = skills.find((skill) => skill.slug === slug); if (selected) editSkill(selected); }" /></aside>
        <SkillEditorForm v-model="form" :is-new="editingNewSkill" :pending="pending" :error="error" :path="skills.find((skill) => skill.slug === selectedSlug)?.path" @save="saveSkill" @remove="removeSkill" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.skill-manager-backdrop{position:fixed;z-index:1100;inset:0;display:grid;place-items:center;padding:24px;background:#0006}.skill-manager{display:flex;width:min(960px,96vw);height:min(760px,92vh);min-height:420px;flex-direction:column;overflow:hidden;border:1px solid #d9d9d9;border-radius:10px;background:#fff;box-shadow:0 16px 56px #0003;color:#262626}.skill-manager__header{display:flex;flex:none;align-items:center;justify-content:space-between;gap:18px;padding:18px 22px;border-bottom:1px solid #f0f0f0}.skill-manager__header>div{display:grid;gap:4px}.skill-manager__header>div>span{color:#1677ff;font-size:11px}.skill-manager__header h2{margin:0;font-size:19px}.skill-manager__header p{margin:0;color:#8c8c8c;font-size:12px}.skill-manager__header button,.skill-manager__list-heading button,.skill-manager__load-error button{min-height:30px;padding:0 10px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#434343;font:inherit;font-size:12px;cursor:pointer}.skill-manager__body{display:grid;min-height:0;flex:1;grid-template-columns:240px minmax(0,1fr)}.skill-manager__sidebar{display:flex;min-height:0;flex-direction:column;border-right:1px solid #f0f0f0}.skill-manager__list-heading{display:flex;align-items:center;justify-content:space-between;padding:14px 12px 8px 16px;color:#595959;font-size:12px}.skill-manager__list-heading button{border-color:#91caff;color:#1677ff}.skill-manager__load-error{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;background:#fff2f0;color:#cf1322;font-size:12px}.skill-manager__load-error button{flex:none;border-color:#ffccc7;color:#cf1322}@media(max-width:680px){.skill-manager-backdrop{padding:8px}.skill-manager{width:100%;height:96vh}.skill-manager__body{grid-template-columns:145px minmax(0,1fr)}.skill-manager__header{padding:14px}.skill-manager__header p{max-width:260px}.skill-manager :deep(.skill-editor){padding:14px}.skill-manager :deep(.skill-editor__scopes){grid-template-columns:1fr}}
</style>
