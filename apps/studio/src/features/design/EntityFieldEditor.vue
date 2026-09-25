<script setup lang="ts">
import type { FieldRule } from '@pulseflow/ui-dsl';
import type { DesignEntityField } from './design-store';

defineProps<{ fields: readonly DesignEntityField[]; feedback: string; failed: boolean }>();
const emit = defineEmits<{
  add: [];
  update: [id: string, patch: Partial<Pick<DesignEntityField, 'key' | 'label' | 'type' | 'rules'>>];
  remove: [id: string];
}>();

function enumValues(field: DesignEntityField): string {
  const rule = field.rules.find((item): item is Extract<FieldRule, { kind: 'enum' }> => item.kind === 'enum');
  return rule?.values.join(', ') ?? '';
}

function selectedFormat(field: DesignEntityField): string {
  return field.rules.find((item): item is Extract<FieldRule, { kind: 'format' }> => item.kind === 'format')?.format ?? '';
}

function updateRequired(field: DesignEntityField, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  const otherRules = field.rules.filter((rule) => rule.kind !== 'required');
  emit('update', field.id, { rules: checked ? [...otherRules, { kind: 'required' }] : otherRules });
}

function updateEnum(field: DesignEntityField, event: Event): void {
  const values = (event.target as HTMLInputElement).value.split(',').map((item) => item.trim()).filter(Boolean);
  const otherRules = field.rules.filter((rule) => rule.kind !== 'enum');
  emit('update', field.id, { rules: values.length ? [...otherRules, { kind: 'enum', values }] : otherRules });
}

function updateFormat(field: DesignEntityField, event: Event): void {
  const format = (event.target as HTMLSelectElement).value as 'phone' | 'creditCode' | '';
  const otherRules = field.rules.filter((rule) => rule.kind !== 'format');
  emit('update', field.id, { rules: format ? [...otherRules, { kind: 'format', format }] : otherRules });
}
</script>

<template>
  <section class="field-editor" data-testid="entity-field-editor" aria-labelledby="entity-fields-title">
    <header class="field-editor__header">
      <div><span class="section-kicker">03 / ENTITY FIELDS</span><h2 id="entity-fields-title">实体字段</h2></div>
      <button type="button" class="add-field" data-testid="add-entity-field" @click="emit('add')">＋ 添加字段</button>
    </header>
    <p v-if="!fields.length" class="empty-copy">暂无实体字段。先添加字段，表单项和数据表就可以绑定它。</p>
    <article v-for="field in fields" :key="field.id" class="field-row" :data-testid="`entity-field-${field.id}`">
      <div class="field-row__identity"><strong>{{ field.label }}</strong><code>{{ field.id }}</code></div>
      <label class="field-control"><span>显示名称</span><input :data-testid="`field-label-${field.id}`" :value="field.label" @input="emit('update', field.id, { label: ($event.target as HTMLInputElement).value })"></label>
      <div class="field-control__pair">
        <label class="field-control"><span>字段键</span><input :data-testid="`field-key-${field.id}`" :value="field.key" @input="emit('update', field.id, { key: ($event.target as HTMLInputElement).value })"></label>
        <label class="field-control"><span>类型</span><select :data-testid="`field-type-${field.id}`" :value="field.type" @change="emit('update', field.id, { type: ($event.target as HTMLSelectElement).value as DesignEntityField['type'] })"><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔值</option></select></label>
      </div>
      <label class="required-control"><input :data-testid="`field-required-${field.id}`" type="checkbox" :checked="field.rules.some((rule) => rule.kind === 'required')" @change="updateRequired(field, $event)"><span>必填</span></label>
      <label class="field-control"><span>枚举选项（逗号分隔）</span><input :data-testid="`field-enum-${field.id}`" :value="enumValues(field)" placeholder="例如：待处理, 已完成" @change="updateEnum(field, $event)"></label>
      <label class="field-control"><span>格式校验</span><select :data-testid="`field-format-${field.id}`" :value="selectedFormat(field)" @change="updateFormat(field, $event)"><option value="">无</option><option value="phone">手机号</option><option value="creditCode">统一社会信用代码</option></select></label>
      <button type="button" class="remove-field" :data-testid="`remove-field-${field.id}`" @click="emit('remove', field.id)">移除字段</button>
    </article>
    <p v-if="feedback" class="field-feedback" :class="{ failed }" data-testid="field-feedback" :role="failed ? 'alert' : 'status'">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.field-editor{min-width:0;padding:var(--pf-space-4);background:var(--pf-color-surface);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius)}
.field-editor__header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--pf-space-2);margin-bottom:var(--pf-space-3)}
.section-kicker{font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text-secondary)}
.field-editor h2{font-size:var(--pf-font-size-lg);font-weight:600;margin:var(--pf-space-1) 0 0}
.add-field,.remove-field{border:var(--pf-border-width) solid var(--pf-color-primary);background:var(--pf-color-surface);color:var(--pf-color-primary);border-radius:var(--pf-radius-sm);padding:var(--pf-space-1) var(--pf-space-3);font-size:var(--pf-font-size-sm);font-weight:500;cursor:pointer}
.add-field:hover{background:#e6f4ff}.add-field:focus-visible,.remove-field:focus-visible{outline:2px solid var(--pf-color-primary);outline-offset:2px}
.field-row{padding:var(--pf-space-3) 0;border-top:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.field-row__identity{display:flex;justify-content:space-between;gap:var(--pf-space-2);margin-bottom:var(--pf-space-2);min-width:0}.field-row__identity strong{font-size:var(--pf-font-size-sm)}.field-row__identity code{font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary);overflow-wrap:anywhere}
.field-control{display:block;margin:var(--pf-space-2) 0;min-width:0}.field-control>span,.required-control span{display:block;font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text-secondary);margin-bottom:var(--pf-space-1)}
.field-control input,.field-control select{width:100%;min-width:0;height:32px;border:var(--pf-border-width) solid var(--pf-color-border);background:var(--pf-color-surface);padding:0 var(--pf-space-2);color:var(--pf-color-text);border-radius:var(--pf-radius-sm);font-size:var(--pf-font-size-sm)}
.field-control input:focus,.field-control select:focus{outline:2px solid #e6f4ff;border-color:var(--pf-color-primary)}
.field-control__pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--pf-space-2)}
.required-control{display:flex;align-items:center;gap:var(--pf-space-2);margin:var(--pf-space-3) 0}.required-control input{accent-color:var(--pf-color-primary)}.required-control span{margin:0}
.remove-field{color:var(--pf-color-error-text);border-color:var(--pf-color-border)}.remove-field:hover{border-color:var(--pf-color-error);background:#fff2f0}
.empty-copy{color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
.field-feedback{padding:var(--pf-space-2);margin:var(--pf-space-2) 0 0;background:#f6ffed;border:var(--pf-border-width) solid #b7eb8f;border-radius:var(--pf-radius-sm);color:var(--pf-color-success-text);font-size:var(--pf-font-size-sm)}.field-feedback.failed{background:#fff2f0;border-color:#ffccc7;color:var(--pf-color-error-text)}
@media(max-width:420px){.field-control__pair{grid-template-columns:1fr}}
</style>
