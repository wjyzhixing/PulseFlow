<script setup lang="ts">
import { computed } from 'vue';
import { STUDIO_SKILL_SCOPES, type SkillInput, type StudioSkillScope } from './skill-types';

const skill = defineModel<SkillInput>({ required: true });
defineProps<{ isNew: boolean; pending: boolean; error: string; path?: string }>();
const emit = defineEmits<{ save: []; remove: [] }>();

const scopeLabels: Record<StudioSkillScope, string> = {
  pageGeneration: '页面生成', pageRefinement: '对话精修', imageToDsl: '图片转 UI-DSL', layoutOptimization: '导出布局优化'
};
const bodyLength = computed(() => skill.value.body.length);

function toggleScope(scope: StudioSkillScope, checked: boolean): void {
  const next = checked
    ? [...new Set([...skill.value.studio_scopes, scope])]
    : skill.value.studio_scopes.filter((item) => item !== scope);
  skill.value = { ...skill.value, studio_scopes: next };
}
</script>

<template>
  <form class="skill-editor" @submit.prevent="emit('save')">
    <div class="skill-editor__heading"><div><span>共享规则</span><h3>{{ isNew ? '新建 Skill' : skill.name }}</h3></div><span class="skill-editor__count">{{ bodyLength }}/8000</span></div>
    <label class="skill-editor__field"><span>目录名称</span><input v-model.trim="skill.slug" :disabled="pending || !isNew" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="64" placeholder="robot-site-design"></label>
    <label class="skill-editor__field"><span>Skill 名称</span><input v-model="skill.name" :disabled="pending" required maxlength="120"></label>
    <label class="skill-editor__field"><span>开发助手可见的描述</span><input v-model="skill.description" :disabled="pending" required maxlength="500" placeholder="为机器人官网提供品牌和页面设计规则"></label>
    <label class="skill-editor__field"><span>License（可选）</span><input v-model="skill.license" :disabled="pending" maxlength="200"></label>
    <label class="skill-editor__field"><span>兼容环境（可选）</span><input v-model="skill.compatibility" :disabled="pending" maxlength="500"></label>
    <fieldset class="skill-editor__scopes"><legend>Studio 使用场景</legend><label v-for="scope in STUDIO_SKILL_SCOPES" :key="scope"><input type="checkbox" :checked="skill.studio_scopes.includes(scope)" :disabled="pending" @change="toggleScope(scope, ($event.target as HTMLInputElement).checked)"><span>{{ scopeLabels[scope] }}</span></label></fieldset>
    <label class="skill-editor__enable"><input v-model="skill.studio_enabled" type="checkbox" :disabled="pending"><span>启用给 Studio 页面 AI 使用</span></label>
    <label class="skill-editor__field skill-editor__body"><span>Skill 指令（Markdown）</span><textarea v-model="skill.body" :disabled="pending" maxlength="8000" rows="14" placeholder="写下开发助手和 Studio AI 共用的设计规则…"></textarea></label>
    <p class="skill-editor__path">保存位置：<code>{{ isNew ? `.agents/skills/${skill.slug || '<slug>'}/SKILL.md` : path || `.agents/skills/${skill.slug}/SKILL.md` }}</code></p>
    <p v-if="error" class="skill-editor__error" role="alert">{{ error }}</p>
    <footer><button v-if="!isNew" class="skill-editor__delete" type="button" :disabled="pending" @click="emit('remove')">删除 Skill</button><span></span><button class="skill-editor__save" type="submit" :disabled="pending">{{ pending ? '保存中…' : isNew ? '创建 Skill' : '保存修改' }}</button></footer>
  </form>
</template>

<style scoped>
.skill-editor{display:grid;gap:14px;min-width:0;padding:20px 24px;overflow:auto}.skill-editor__heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.skill-editor__heading>div{display:grid;gap:3px}.skill-editor__heading span{color:#8c8c8c;font-size:11px}.skill-editor__heading h3{margin:0;color:#262626;font-size:17px;font-weight:600}.skill-editor__count{font-variant-numeric:tabular-nums}.skill-editor__field{display:grid;gap:6px;color:#434343;font-size:12px;font-weight:500}.skill-editor__field input,.skill-editor__field textarea{width:100%;min-width:0;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#262626;font:inherit;font-weight:400;outline-color:#1677ff}.skill-editor__body textarea{resize:vertical;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}.skill-editor__scopes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:12px;border:1px solid #f0f0f0;border-radius:6px}.skill-editor__scopes legend{padding:0 5px;color:#595959;font-size:12px}.skill-editor__scopes label,.skill-editor__enable{display:flex;align-items:center;gap:7px;color:#434343;font-size:12px}.skill-editor__scopes input,.skill-editor__enable input{accent-color:#1677ff}.skill-editor__path{margin:0;color:#8c8c8c;font-size:11px;line-height:1.5;overflow-wrap:anywhere}.skill-editor__path code{color:#595959}.skill-editor__error{margin:0;color:#cf1322;font-size:12px}.skill-editor footer{display:flex;align-items:center;gap:8px;margin-top:4px}.skill-editor footer>span{flex:1}.skill-editor footer button{min-height:32px;padding:0 12px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#262626;font:inherit;font-size:12px;cursor:pointer}.skill-editor footer button:disabled{opacity:.5;cursor:wait}.skill-editor footer .skill-editor__delete{border-color:#ffccc7;color:#cf1322}.skill-editor footer .skill-editor__save{border-color:#1677ff;background:#1677ff;color:#fff}
</style>
