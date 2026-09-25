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
.field-editor{padding:18px;background:#fffefa;border:1px solid #cbd4cf}.field-editor__header{display:flex;justify-content:space-between;align-items:center;gap:10px}.section-kicker{font:600 9px 'DM Mono',monospace;letter-spacing:.13em;color:#557476}.field-editor h2{font:700 19px 'Noto Serif SC',serif;margin:6px 0 13px}.add-field,.remove-field{border:1px solid #9db7b1;background:#e6efeb;color:#164d4b;border-radius:2px;padding:7px 9px;font-size:11px;font-weight:700}.field-row{padding:12px 0;border-top:1px solid #e2e8e4}.field-row__identity{display:flex;justify-content:space-between;margin-bottom:10px}.field-row__identity strong{font-size:12px}.field-row__identity code{font:10px 'DM Mono',monospace;color:#769092}.field-control{display:block;margin:9px 0}.field-control>span,.required-control span{display:block;font-size:10px;font-weight:600;color:#456264;margin-bottom:4px}.field-control input,.field-control select{width:100%;height:32px;border:1px solid #b9c8c5;background:#fff;padding:0 8px;color:#173943;border-radius:2px;font-size:11px}.field-control__pair{display:grid;grid-template-columns:1fr 1fr;gap:9px}.required-control{display:flex;align-items:center;gap:7px;margin:11px 0}.required-control input{accent-color:#176d6a}.required-control span{margin:0}.remove-field{background:#fff;color:#8b4038;border-color:#e4c3bd}.empty-copy{color:#708688;font-size:11px;line-height:1.7}.field-feedback{padding:8px 10px;margin:10px 0 0;background:#e5f0e4;color:#245e5d;border-left:3px solid #18706b;font-size:11px}.field-feedback.failed{background:#fbefec;border-color:#b74943;color:#8b322e}
</style>
