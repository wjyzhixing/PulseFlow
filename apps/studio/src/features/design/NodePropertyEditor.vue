<script setup lang="ts">
import { computed } from 'vue';
import type { ReadonlyDesignNode, DesignEntityField } from './design-store';

const props = defineProps<{ node: ReadonlyDesignNode | null; entityFields: readonly DesignEntityField[] }>();
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>();

interface FieldSpec { key: string; label: string; kind?: 'text' | 'number' | 'boolean' | 'field' | 'select'; options?: readonly string[] }
const specsByType: Record<string, readonly FieldSpec[]> = {
  Card: [{ key: 'title', label: '卡片标题' }],
  PageHeader: [{ key: 'title', label: '页面标题' }, { key: 'subtitle', label: '副标题' }],
  Form: [{ key: 'layout', label: '布局', kind: 'select', options: ['vertical', 'horizontal', 'inline'] }],
  FormItem: [{ key: 'label', label: '字段标签' }, { key: 'fieldId', label: '实体字段', kind: 'field' }],
  Input: [{ key: 'placeholder', label: '占位提示' }, { key: 'disabled', label: '禁用', kind: 'boolean' }],
  Select: [{ key: 'placeholder', label: '占位提示' }],
  Button: [{ key: 'label', label: '按钮文字' }, { key: 'variant', label: '样式', kind: 'select', options: ['primary', 'default', 'dashed', 'text', 'link'] }, { key: 'event', label: '事件标识' }],
  Table: [{ key: 'dataSourceKey', label: '数据源标识' }], Row: [{ key: 'gutter', label: '栅格间距', kind: 'number' }],
  Col: [{ key: 'span', label: '栅格跨度', kind: 'number' }], Tag: [{ key: 'text', label: '标签文字' }, { key: 'color', label: '颜色', kind: 'select', options: ['default', 'success', 'warning', 'error', 'processing'] }],
  Badge: [{ key: 'text', label: '状态文字' }, { key: 'status', label: '状态', kind: 'select', options: ['default', 'success', 'warning', 'error', 'processing'] }]
};
const fields = computed(() => props.node ? specsByType[props.node.type] ?? [] : []);
function updateText(key: string, event: Event) { emit('update', { [key]: (event.target as HTMLInputElement).value }); }
function updateNumber(key: string, event: Event) { emit('update', { [key]: Number((event.target as HTMLInputElement).value) }); }
function updateBoolean(key: string, event: Event) { emit('update', { [key]: (event.target as HTMLInputElement).checked }); }
</script>

<template>
  <section class="property-editor" aria-labelledby="property-title">
    <div class="section-kicker">03 / INSPECTOR</div>
    <h2 id="property-title">属性检查器</h2>
    <div v-if="node" class="property-body">
      <div class="node-identity"><span>{{ node.type }}</span><code>{{ node.id }}</code></div>
      <label v-for="field in fields" :key="field.key" class="property-field">
        <span>{{ field.label }} <code>{{ field.key }}</code></span>
        <input v-if="!field.kind || field.kind === 'text'" :data-testid="`prop-${field.key}`" :value="String(node.props[field.key] ?? '')" @input="updateText(field.key, $event)">
        <input v-else-if="field.kind === 'number'" type="number" :min="field.key === 'span' ? 1 : 0" :max="field.key === 'span' ? 24 : 48" :data-testid="`prop-${field.key}`" :value="Number(node.props[field.key] ?? 0)" @input="updateNumber(field.key, $event)">
        <input v-else-if="field.kind === 'boolean'" class="check" type="checkbox" :data-testid="`prop-${field.key}`" :checked="Boolean(node.props[field.key])" @change="updateBoolean(field.key, $event)">
        <select v-else-if="field.kind === 'field'" :data-testid="`prop-${field.key}`" :value="String(node.props[field.key] ?? '')" @change="updateText(field.key, $event)"><option v-for="item in entityFields" :key="item.id" :value="item.id">{{ item.label }}</option></select>
        <select v-else :data-testid="`prop-${field.key}`" :value="String(node.props[field.key] ?? '')" @change="updateText(field.key, $event)"><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select>
      </label>
      <p v-if="!fields.length" class="empty-copy">此节点没有常用可编辑属性。</p>
    </div>
    <p v-else class="empty-copy">在画布选择节点后，可在这里调整白名单属性。</p>
  </section>
</template>

<style scoped>
.property-editor{min-width:0;padding:var(--pf-space-4);background:var(--pf-color-surface);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);min-height:210px}
.section-kicker{font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text-secondary)}
.property-editor h2{font-size:var(--pf-font-size-lg);font-weight:600;margin:var(--pf-space-1) 0 var(--pf-space-4)}
.node-identity{display:flex;justify-content:space-between;align-items:center;gap:var(--pf-space-2);padding:var(--pf-space-2) var(--pf-space-3);background:#e6f4ff;color:var(--pf-color-text);border-radius:var(--pf-radius-sm);margin-bottom:var(--pf-space-3);min-width:0}
.node-identity span{font-size:var(--pf-font-size-sm);font-weight:600;color:var(--pf-color-primary)}.node-identity code,.property-field code{font-size:var(--pf-font-size-sm);overflow-wrap:anywhere}
.property-field{display:block;margin:var(--pf-space-3) 0;min-width:0}.property-field>span{display:flex;justify-content:space-between;gap:var(--pf-space-2);font-size:var(--pf-font-size-sm);font-weight:500;margin-bottom:var(--pf-space-1)}.property-field>span code{color:var(--pf-color-text-secondary);font-weight:400}
.property-field input:not(.check),.property-field select{width:100%;min-width:0;height:32px;border:var(--pf-border-width) solid var(--pf-color-border);background:var(--pf-color-surface);padding:0 var(--pf-space-2);color:var(--pf-color-text);border-radius:var(--pf-radius-sm);font-size:var(--pf-font-size-sm)}
.property-field input:focus,.property-field select:focus{outline:2px solid #e6f4ff;border-color:var(--pf-color-primary)}
.check{width:16px;height:16px;accent-color:var(--pf-color-primary)}.empty-copy{color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
</style>
