<script setup lang="ts">
import { computed, type DeepReadonly } from 'vue';
import type { UiNode } from '@pulseflow/ui-dsl';
import type { DesignPageDsl, ReadonlyDesignNode, DesignEntityField } from './design-store';
import { componentLabelByType, inspectorFieldsByType, inspectorGroupOrder, type InspectorField } from './inspector-fields';
import PropertyRepeater from './PropertyRepeater.vue';
import { isDesignNodeLocked } from './design-commands';

interface SectionOption { id: string; label: string }
interface InspectorOption { value: string; label: string }
const props = defineProps<{
  node: ReadonlyDesignNode | null;
  entityFields: readonly DesignEntityField[];
  generatedAssetIds?: readonly string[];
  pageDsl?: DeepReadonly<DesignPageDsl>;
  embedded?: boolean;
}>();
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>();

const fields = computed(() => props.node ? inspectorFieldsByType[props.node.type] : []);
const isEffectivelyLocked = computed(() => props.node
  ? props.pageDsl ? isDesignNodeLocked(props.pageDsl.nodes, props.node.id) : props.node.design?.locked === true
  : false);
const visibleGroups = computed(() => inspectorGroupOrder.flatMap((group) => {
  const groupFields = fields.value.filter((field) => field.group === group);
  return groupFields.length ? [{ group, fields: groupFields }] : [];
}));
const sections = computed<SectionOption[]>(() => {
  const result: SectionOption[] = [];
  const visit = (nodes: readonly DeepReadonly<UiNode>[]) => nodes.forEach((node) => {
    if (node.type === 'ContentSection' && typeof node.props.sectionId === 'string') {
      result.push({ id: node.props.sectionId, label: typeof node.props.title === 'string' ? node.props.title : node.props.sectionId });
    }
    visit(node.children);
    node.slots.forEach((slot) => { if ('children' in slot) visit(slot.children); });
  });
  if (props.pageDsl) visit(props.pageDsl.nodes);
  return result;
});
const assetOptions = computed<InspectorOption[]>(() => {
  const assets = [...new Set([
    'asset-workflow', 'asset-analytics', 'asset-collaboration',
    ...(props.generatedAssetIds ?? []),
    ...(typeof props.node?.props.assetId === 'string' ? [props.node.props.assetId] : []),
    ...(typeof props.node?.props.backgroundAssetId === 'string' ? [props.node.props.backgroundAssetId] : [])
  ])];
  return assets.map((id, index) => ({ value: id, label: ({ 'asset-workflow': '团队协作插画', 'asset-analytics': '数据分析插画', 'asset-collaboration': '协作场景插画' } as Record<string, string>)[id] ?? `生成图片 ${index + 1}` }));
});

function optionsFor(field: InspectorField): InspectorOption[] {
  if (field.kind === 'select') return [...field.options];
  if (field.kind === 'asset') return assetOptions.value;
  if (field.kind === 'entity-field') return props.entityFields.map((item) => ({ value: item.id, label: item.label }));
  if (field.kind === 'section') return sections.value.map((item) => ({ value: item.id, label: item.label }));
  return [];
}

function updateProperty(field: InspectorField, value: unknown): void {
  const patch: Record<string, unknown> = { [field.key]: value };
  const actionPairs = { primaryLabel: 'primarySectionId', secondaryLabel: 'secondarySectionId' } as const;
  if (field.key in actionPairs) {
    const targetKey = actionPairs[field.key as keyof typeof actionPairs];
    if (typeof value === 'string' && value && !props.node?.props[targetKey]) {
      const firstTarget = sections.value[0]?.id;
      if (firstTarget) patch[targetKey] = firstTarget;
    }
    if (value === '') patch[targetKey] = undefined;
  }
  if (field.key === 'primarySectionId' && value === '') patch.primaryLabel = undefined;
  if (field.key === 'secondarySectionId' && value === '') patch.secondaryLabel = undefined;
  if (field.key === 'backgroundAssetId' && value === '') patch.backgroundOverlay = undefined;
  emit('update', patch);
}

function updateText(field: InspectorField, event: Event): void {
  updateProperty(field, (event.target as HTMLInputElement | HTMLTextAreaElement).value);
}

function updateNumber(field: InspectorField, event: Event): void {
  updateProperty(field, Number((event.target as HTMLInputElement).value));
}

function updateBoolean(field: InspectorField, event: Event): void {
  updateProperty(field, (event.target as HTMLInputElement).checked);
}

function updateSelect(field: InspectorField, event: Event): void {
  updateProperty(field, (event.target as HTMLSelectElement).value);
}

function updateCollection(field: InspectorField, value: Record<string, unknown>[]): void {
  updateProperty(field, value);
}
</script>

<template>
  <section class="property-editor" :class="{ 'property-editor--embedded': embedded }" :aria-labelledby="embedded ? undefined : 'property-title'">
    <template v-if="!embedded">
      <div class="section-kicker">03 / INSPECTOR</div>
      <h2 id="property-title">属性检查器</h2>
    </template>
    <div v-if="node" class="property-body">
      <div v-if="!embedded" class="node-identity"><span>{{ componentLabelByType[node.type] }}</span><small>{{ isEffectivelyLocked ? '图层已锁定，请先在图层面板解锁' : '已选中，可编辑以下属性' }}</small></div>
      <fieldset class="property-controls" :disabled="isEffectivelyLocked">
        <section v-for="group in visibleGroups" :key="group.group" class="property-group" :data-property-group="group.group">
          <h3>{{ group.group }}</h3>
          <div v-for="field in group.fields" :key="field.key" class="property-field">
          <label v-if="field.kind !== 'repeater'" :for="`prop-${field.key}`">{{ field.label }}</label>
          <input
            v-if="field.kind === 'text'"
            :id="`prop-${field.key}`"
            :data-testid="`prop-${field.key}`"
            :value="String(node.props[field.key] ?? '')"
            :aria-label="field.label"
            @input="updateText(field, $event)"
          >
          <textarea
            v-else-if="field.kind === 'textarea'"
            :id="`prop-${field.key}`"
            :data-testid="`prop-${field.key}`"
            :value="String(node.props[field.key] ?? '')"
            :aria-label="field.label"
            rows="3"
            @input="updateText(field, $event)"
          />
          <input
            v-else-if="field.kind === 'number'"
            :id="`prop-${field.key}`"
            :data-testid="`prop-${field.key}`"
            type="number"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            :value="Number(node.props[field.key] ?? field.min)"
            :aria-label="field.label"
            @input="updateNumber(field, $event)"
          >
          <input
            v-if="field.kind === 'number'"
            class="property-range"
            type="range"
            :data-testid="`prop-${field.key}-range`"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            :value="Number(node.props[field.key] ?? field.min)"
            :aria-label="`${field.label}拖动调整`"
            @input="updateNumber(field, $event)"
          >
          <label v-else-if="field.kind === 'boolean'" class="boolean-field" :for="`prop-${field.key}`">
            <input :id="`prop-${field.key}`" :data-testid="`prop-${field.key}`" type="checkbox" :checked="Boolean(node.props[field.key])" @change="updateBoolean(field, $event)">
            <span>{{ field.label }}</span>
          </label>
          <PropertyRepeater
            v-else-if="field.kind === 'repeater'"
            :field-key="field.key"
            :add-label="field.addLabel"
            :item-fields="field.itemFields"
            :items="(node.props[field.key] as Record<string, unknown>[]) ?? []"
            :entity-fields="entityFields"
            :sections="sections"
            :min-items="field.minItems"
            @update="updateCollection(field, $event)"
          />
          <template v-else>
            <select
              :id="`prop-${field.key}`"
              :data-testid="`prop-${field.key}`"
              :value="String(node.props[field.key] ?? '')"
              :aria-label="field.label"
              @change="updateSelect(field, $event)"
            >
              <option v-if="field.kind === 'asset' && field.key === 'backgroundAssetId'" value="">不使用背景图片</option>
              <option v-if="field.kind === 'section' && !field.required" value="">暂不设置</option>
              <option v-for="option in optionsFor(field)" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <p v-if="field.kind === 'asset' && !optionsFor(field).length" class="field-empty">暂无可用图片素材。</p>
            <p v-if="field.kind === 'section' && !sections.length" class="field-empty">先添加内容区块，再设置跳转目标。</p>
          </template>
          <small v-if="field.kind === 'number' && field.unit" class="field-unit">{{ field.unit }}</small>
          <small v-if="field.help" class="field-help">{{ field.help }}</small>
          </div>
        </section>
      </fieldset>
      <p v-if="!fields.length" class="empty-copy">此页面对象暂时没有可编辑属性。</p>
    </div>
    <p v-else class="empty-copy">选择画布中的对象后，可在这里调整它的内容、外观、布局和交互。</p>
  </section>
</template>

<style scoped>
.property-editor{min-width:0;padding:var(--pf-space-4);background:var(--pf-color-surface);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);min-height:210px}
.property-editor--embedded{min-height:0;padding:0;border:0;border-radius:0;background:transparent}
.property-editor--embedded .property-group{padding:8px 0;border-top:1px solid #f0f0f0}
.property-editor--embedded .property-group h3{margin:0 0 8px;color:#595959;font-size:12px}
.property-editor--embedded .property-field{grid-template-columns:minmax(0,1fr);gap:4px;margin:8px 0}
.property-editor--embedded .property-field>label:not(.boolean-field){font-size:11px;color:#595959}
.property-editor--embedded .property-field input:not([type=checkbox]),.property-editor--embedded .property-field select,.property-editor--embedded .property-field textarea{box-sizing:border-box;min-height:28px;padding:3px 6px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;font-size:11px}
.property-editor--embedded .property-field textarea{min-height:54px}
.property-editor--embedded .property-field .field-help,.property-editor--embedded .property-field .field-empty{font-size:10px}
.property-controls{min-width:0;margin:0;padding:0;border:0}
.section-kicker{font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text-secondary)}
.property-editor h2{font-size:var(--pf-font-size-lg);font-weight:600;margin:var(--pf-space-1) 0 var(--pf-space-4)}
.node-identity{display:grid;gap:2px;padding:var(--pf-space-3);background:#e6f4ff;color:var(--pf-color-text);border-radius:var(--pf-radius-sm);margin-bottom:var(--pf-space-3)}
.node-identity span{font-size:var(--pf-font-size-sm);font-weight:600;color:var(--pf-color-primary-strong)}.node-identity small{font-size:11px;color:var(--pf-color-text-secondary)}
.property-group{padding:var(--pf-space-2) 0;border-top:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.property-group h3{font-size:var(--pf-font-size-sm);font-weight:600;margin:0 0 var(--pf-space-2);color:var(--pf-color-text-secondary)}
.property-field{display:grid;gap:var(--pf-space-1);margin:var(--pf-space-3) 0;min-width:0}
.property-field>label:not(.boolean-field){font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text)}
.property-field input:not([type=checkbox]),.property-field select,.property-field textarea{width:100%;min-width:0;min-height:32px;border:var(--pf-border-width) solid var(--pf-color-border);background:var(--pf-color-surface);padding:var(--pf-space-2);color:var(--pf-color-text);border-radius:var(--pf-radius-sm);font:inherit;font-size:var(--pf-font-size-sm)}
.property-field textarea{resize:vertical;line-height:1.5}.property-field input:focus,.property-field select:focus,.property-field textarea:focus{outline:2px solid #e6f4ff;border-color:var(--pf-color-primary)}
.property-field input.property-range{min-height:22px;height:22px;padding:0;border:0;accent-color:var(--pf-color-primary);cursor:ew-resize}
.boolean-field{display:flex;align-items:center;gap:var(--pf-space-2);font-size:var(--pf-font-size-sm);cursor:pointer}.boolean-field input{width:16px;height:16px;accent-color:var(--pf-color-primary)}
.field-unit,.field-help,.field-empty{font-size:11px;line-height:1.5;color:var(--pf-color-text-secondary)}.field-help,.field-empty{margin:0}.empty-copy{color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
</style>
