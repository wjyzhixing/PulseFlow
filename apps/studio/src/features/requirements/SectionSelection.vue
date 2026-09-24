<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue';
import { shallowRef } from 'vue';
import type { RequirementSection } from '@pulseflow/requirement-import';
defineProps<{ sections: RequirementSection[]; selectedIds: string[]; busy: boolean }>();
const emit = defineEmits<{ toggle: [id: string]; generate: []; 'add-manual': [heading: string, text: string] }>();
const heading = shallowRef(''); const text = shallowRef('');
function addManual() { if (!text.value.trim()) return; emit('add-manual', heading.value.trim(), text.value.trim()); heading.value = ''; text.value = ''; }
</script>
<template><section class="card"><h2>02 / 选择生成范围 <span class="tag">SECTIONS</span></h2><p class="muted">只会将勾选的章节发送到生成服务。无标题内容仍可选择。</p><div v-for="section in sections" :key="section.id" class="section-row" :data-testid="`section-${section.id}`"><input type="checkbox" :data-testid="`select-${section.id}`" :checked="selectedIds.includes(section.id)" :aria-label="`选择 ${section.heading || '无标题内容'}`" @change="emit('toggle', section.id)"><div><strong>{{ section.heading || '无标题内容' }}</strong><p>{{ section.text }}</p></div></div><div class="grid-two"><div><label class="field-label" for="manual-heading">补充章节标题（可选）</label><input id="manual-heading" v-model="heading" class="input" data-testid="manual-heading" placeholder="例如：审批约束"></div><div><label class="field-label" for="manual-text">补充内容</label><input id="manual-text" v-model="text" class="input" data-testid="manual-text" placeholder="手动输入遗漏的需求"></div></div><AButton class="btn secondary" data-testid="add-manual-section" :disabled="!text.trim()" @click="addManual">添加章节</AButton><div><AButton class="btn" data-testid="generate-draft" :disabled="!selectedIds.length || busy" @click="emit('generate')">{{ busy ? '正在生成…' : `生成草稿 · ${selectedIds.length} 章 →` }}</AButton></div></section></template>
