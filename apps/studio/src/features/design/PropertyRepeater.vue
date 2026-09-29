<script setup lang="ts">
import { computed } from 'vue';
import type { InspectorItemField } from './inspector-fields';
import type { DesignEntityField } from './design-store';

interface SectionOption { id: string; label: string }
const props = withDefaults(defineProps<{
  fieldKey: string;
  addLabel: string;
  itemFields: readonly InspectorItemField[];
  items: readonly Record<string, unknown>[];
  entityFields: readonly DesignEntityField[];
  sections: readonly SectionOption[];
  minItems?: number;
}>(), { minItems: 0 });
const emit = defineEmits<{ update: [items: Record<string, unknown>[]] }>();

const canRemove = computed(() => props.items.length > props.minItems);

function optionsFor(field: InspectorItemField): readonly SectionOption[] {
  return field.kind === 'section'
    ? props.sections
    : props.entityFields.map((item) => ({ id: item.id, label: item.label }));
}

function updateItem(index: number, key: string, value: string): void {
  emit('update', props.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : { ...item }));
}

function addItem(): void {
  const item = Object.fromEntries(props.itemFields.map((field) => {
    if (field.kind === 'entity-field') return [field.key, props.entityFields[0]?.id ?? ''];
    if (field.kind === 'section') return [field.key, props.sections[0]?.id ?? ''];
    return [field.key, ''];
  }));
  emit('update', [...props.items.map((existing) => ({ ...existing })), item]);
}

function removeItem(index: number): void {
  if (!canRemove.value) return;
  emit('update', props.items.filter((_, itemIndex) => itemIndex !== index).map((item) => ({ ...item })));
}
</script>

<template>
  <div class="property-repeater" :data-testid="`repeater-${fieldKey}`">
    <div v-for="(item, index) in items" :key="`${fieldKey}-${index}`" class="repeater-row">
      <div class="repeater-row__heading">
        <strong>{{ addLabel.replace(/^添加/, '') }} {{ index + 1 }}</strong>
        <button
          type="button"
          class="repeater-remove"
          :data-testid="`remove-${fieldKey}-${index}`"
          :disabled="!canRemove"
          :aria-label="`移除第 ${index + 1} 项`"
          @click="removeItem(index)"
        >移除</button>
      </div>
      <label v-for="field in itemFields" :key="field.key" class="repeater-field">
        <span>{{ field.label }}</span>
        <select
          v-if="field.kind !== 'text'"
          :data-testid="`repeater-${fieldKey}-${index}-${field.key}`"
          :value="String(item[field.key] ?? '')"
          @change="updateItem(index, field.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in optionsFor(field)" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
        <input
          v-else
          :data-testid="`repeater-${fieldKey}-${index}-${field.key}`"
          :value="String(item[field.key] ?? '')"
          :placeholder="field.placeholder"
          @input="updateItem(index, field.key, ($event.target as HTMLInputElement).value)"
        >
      </label>
    </div>
    <p v-if="!items.length" class="repeater-empty">还没有{{ addLabel.replace(/^添加/, '') }}。</p>
    <button type="button" class="repeater-add" :data-testid="`add-${fieldKey}`" @click="addItem">＋ {{ addLabel }}</button>
  </div>
</template>

<style scoped>
.property-repeater{display:grid;gap:var(--pf-space-2)}
.repeater-row{display:grid;gap:var(--pf-space-2);padding:var(--pf-space-2);border:var(--pf-border-width) solid var(--pf-color-border-secondary);border-radius:var(--pf-radius-sm);background:var(--pf-color-fill-quaternary,#fafafa)}
.repeater-row__heading{display:flex;align-items:center;justify-content:space-between;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm)}
.repeater-remove,.repeater-add{min-height:30px;border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius-sm);background:var(--pf-color-surface);color:var(--pf-color-text);font:inherit;cursor:pointer}
.repeater-remove{padding:0 var(--pf-space-2);font-size:var(--pf-font-size-sm)}.repeater-remove:disabled{opacity:.45;cursor:not-allowed}
.repeater-field{display:grid;gap:var(--pf-space-1);font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary)}
.repeater-field input,.repeater-field select{width:100%;min-width:0;height:32px;border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius-sm);background:var(--pf-color-surface);padding:0 var(--pf-space-2);color:var(--pf-color-text);font:inherit}
.repeater-add{padding:0 var(--pf-space-2);border-color:var(--pf-color-primary-border,#91caff);color:var(--pf-color-primary-strong,#0958d9)}
.repeater-empty{margin:0;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm)}
</style>
