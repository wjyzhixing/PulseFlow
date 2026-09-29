<script setup lang="ts">
import type { SkillSummary } from './skill-types';

defineProps<{ skills: readonly SkillSummary[]; selectedSlug: string; pending: boolean }>();
const emit = defineEmits<{ select: [slug: string] }>();
</script>

<template>
  <nav class="skill-list" aria-label="项目 Skills">
    <p v-if="!skills.length" class="skill-list__empty">还没有 Skill。新建后会保存在项目 Skills 目录。</p>
    <button
      v-for="skill in skills"
      :key="skill.slug"
      class="skill-list__item"
      :class="{ 'skill-list__item--selected': selectedSlug === skill.slug }"
      type="button"
      :disabled="pending"
      :aria-current="selectedSlug === skill.slug ? 'true' : undefined"
      @click="emit('select', skill.slug)"
    >
      <span class="skill-list__name">{{ skill.name }}</span>
      <span class="skill-list__slug">{{ skill.slug }}</span>
      <span class="skill-list__state">{{ skill.studio_enabled && skill.studio_scopes.length ? 'Studio 已启用' : '开发助手 Skill' }}</span>
    </button>
  </nav>
</template>

<style scoped>
.skill-list{display:grid;align-content:start;gap:4px;min-height:0;overflow:auto;padding:8px}.skill-list__empty{margin:8px;color:#8c8c8c;font-size:12px;line-height:1.6}.skill-list__item{display:grid;gap:3px;min-width:0;padding:10px 12px;border:1px solid transparent;border-radius:6px;background:transparent;color:#262626;text-align:left;cursor:pointer}.skill-list__item:hover{background:#f5f5f5}.skill-list__item--selected{border-color:#91caff;background:#e6f4ff}.skill-list__item:disabled{opacity:.55;cursor:wait}.skill-list__name{overflow:hidden;font-size:13px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.skill-list__slug{color:#8c8c8c;font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}.skill-list__state{color:#1677ff;font-size:11px}
</style>
