<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue';
import { shallowRef } from 'vue';
import type { RequirementSection } from '@pulseflow/requirement-import';
defineProps<{ sections: RequirementSection[]; selectedIds: string[]; busy: boolean }>();
const emit = defineEmits<{ toggle: [id: string]; generate: []; 'add-manual': [heading: string, text: string] }>();
const heading = shallowRef(''); const text = shallowRef('');
function addManual() { if (!text.value.trim()) return; emit('add-manual', heading.value.trim(), text.value.trim()); heading.value = ''; text.value = ''; }
</script>
<template>
  <section class="card selection-card">
    <h2>02 / 选择生成范围</h2>
    <p class="muted section-help">只会将勾选的章节发送到生成服务。无标题内容仍可选择。</p>
    <div class="section-list">
      <div v-for="section in sections" :key="section.id" class="section-row" :data-testid="`section-${section.id}`">
        <input type="checkbox" :data-testid="`select-${section.id}`" :checked="selectedIds.includes(section.id)" :aria-label="`选择 ${section.heading || '无标题内容'}`" @change="emit('toggle', section.id)">
        <div class="section-content"><strong>{{ section.heading || '无标题内容' }}</strong><p>{{ section.text }}</p></div>
      </div>
    </div>
    <div class="manual-section">
      <div class="field-group"><label class="field-label" for="manual-heading">补充章节标题（可选）</label><input id="manual-heading" v-model="heading" class="input" data-testid="manual-heading" placeholder="例如：审批约束"></div>
      <div class="field-group"><label class="field-label" for="manual-text">补充内容</label><input id="manual-text" v-model="text" class="input" data-testid="manual-text" placeholder="手动输入遗漏的需求"></div>
      <AButton class="btn secondary" data-testid="add-manual-section" :disabled="!text.trim()" @click="addManual">添加章节</AButton>
    </div>
    <div class="action-row"><AButton class="btn" data-testid="generate-draft" :disabled="!selectedIds.length || busy" @click="emit('generate')">{{ busy ? '正在生成…' : `生成草稿 · ${selectedIds.length} 章 →` }}</AButton></div>
  </section>
</template>
<style scoped>
.selection-card { margin: 0 0 var(--pf-space-4); padding: var(--pf-space-5); background: var(--pf-color-surface); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius-lg); box-shadow: var(--pf-shadow-sm); }
.selection-card h2 { margin: 0 0 var(--pf-space-1); color: var(--pf-color-text); font-size: var(--pf-font-size-lg); font-weight: 600; }
.section-help { margin: 0 0 var(--pf-space-4); color: var(--pf-color-text-secondary); }
.section-list { border: var(--pf-border-width) solid var(--pf-color-border-secondary); border-radius: var(--pf-radius); overflow: hidden; }
.section-row { display: flex; align-items: flex-start; gap: var(--pf-space-3); padding: var(--pf-space-3) var(--pf-space-4); border: 0; }
.section-row + .section-row { border-top: var(--pf-border-width) solid var(--pf-color-border-secondary); }
.section-row:has(input:checked) { background: #e6f4ff; }
.section-row input { flex: none; width: 16px; height: 16px; margin: 3px 0 0; accent-color: var(--pf-color-primary); }
.section-row input:focus-visible { outline: 2px solid var(--pf-color-primary); outline-offset: 2px; }
.section-content { min-width: 0; }
.section-row strong { margin: 0 0 var(--pf-space-1); color: var(--pf-color-text); font-weight: 500; }
.section-row p { margin: 0; color: var(--pf-color-text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.manual-section { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pf-space-4); margin-top: var(--pf-space-5); padding-top: var(--pf-space-5); border-top: var(--pf-border-width) solid var(--pf-color-border-secondary); }
.field-group { width: 100%; }
.field-label { margin: 0 0 var(--pf-space-2); color: var(--pf-color-text); font-size: var(--pf-font-size); font-weight: 500; }
.input { min-height: 40px; padding: var(--pf-space-2) var(--pf-space-3); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius); background: var(--pf-color-surface); color: var(--pf-color-text); font: inherit; }
.input:hover { border-color: var(--pf-color-primary-hover); }
.input:focus { border-color: var(--pf-color-primary); outline: 2px solid rgba(22, 119, 255, .16); outline-offset: 0; }
.action-row { display: flex; justify-content: flex-end; margin-top: var(--pf-space-5); padding-top: var(--pf-space-4); border-top: var(--pf-border-width) solid var(--pf-color-border-secondary); }
.btn { min-height: 36px; margin: 0; padding: var(--pf-space-1) var(--pf-space-4); border: var(--pf-border-width) solid var(--pf-color-primary); border-radius: var(--pf-radius); background: var(--pf-color-primary); color: #fff; font: inherit; font-weight: 400; box-shadow: var(--pf-shadow-sm); }
.btn:hover { border-color: var(--pf-color-primary-hover); background: var(--pf-color-primary-hover); color: #fff; }
.btn.secondary { border-color: var(--pf-color-border); background: var(--pf-color-surface); color: var(--pf-color-text); }
.btn.secondary:hover { border-color: var(--pf-color-primary); background: var(--pf-color-surface); color: var(--pf-color-primary); }
.btn:focus-visible { outline: 2px solid var(--pf-color-primary); outline-offset: 2px; }
.btn:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 560px) { .selection-card { padding: var(--pf-space-4); } .manual-section .btn, .action-row .btn { width: 100%; } }
</style>
