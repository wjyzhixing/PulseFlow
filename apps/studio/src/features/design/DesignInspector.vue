<script setup lang="ts">
import { computed } from 'vue';
import type { DeepReadonly } from 'vue';
import type { DesignPageDsl, ReadonlyDesignNode, DesignEntityField } from './design-store';
import NodePropertyEditor from './NodePropertyEditor.vue';
import type { NodeDesign, PageDsl } from '@pulseflow/ui-dsl';
import { isDesignNodeLocked } from './design-commands';
import StudioIcon from './StudioIcon.vue';
import { componentLabelByType } from './inspector-fields';

const props = withDefaults(defineProps<{
  page: DeepReadonly<DesignPageDsl>;
  node: ReadonlyDesignNode | null;
  entityFields: readonly DesignEntityField[];
  generatedAssetIds?: readonly string[];
  selectedNodeCount?: number;
}>(), { selectedNodeCount: 1 });
const fontFamilyOptions = [
  { value: 'sans', label: '系统默认' },
  { value: 'pingfang-sc', label: 'PingFang SC' },
  { value: 'noto-sans-sc', label: 'Noto Sans SC' },
  { value: 'inter', label: 'Inter' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'arial', label: 'Arial' },
  { value: 'serif', label: 'Georgia / 衬线' },
  { value: 'mono', label: 'SF Mono / 等宽' }
] as const;
const isEffectivelyLocked = computed(() => props.node ? isDesignNodeLocked(props.page.nodes, props.node.id) : false);
function findParentNode(nodes: readonly ReadonlyDesignNode[], childId: string): ReadonlyDesignNode | null {
  for (const parent of nodes) {
    if (parent.children.some((child) => child.id === childId)) return parent;
    const nestedParent = findParentNode(parent.children, childId);
    if (nestedParent) return nestedParent;
    for (const slot of parent.slots) {
      if (!('children' in slot)) continue;
      if (slot.children.some((child) => child.id === childId)) return parent;
      const slotParent = findParentNode(slot.children, childId);
      if (slotParent) return slotParent;
    }
  }
  return null;
}
const supportsFillSizing = computed(() => {
  if (!props.node || props.node.design?.position?.mode === 'absolute') return false;
  return findParentNode(props.page.nodes, props.node.id)?.type === 'Frame';
});
function canAlign(alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'): boolean {
  if (!props.node) return false;
  if (props.node.design?.position?.mode === 'absolute') return true;
  const parent = findParentNode(props.page.nodes, props.node.id);
  // A top-level flow layer is contained by the page, so every alignment can make it absolute.
  if (!parent) return true;
  if (parent.type !== 'Frame') return false;
  const row = parent.props.direction === 'row';
  const crossAxis = row ? ['top', 'center-y', 'bottom'].includes(alignment) : ['left', 'center-x', 'right'].includes(alignment);
  const crossAxisSize = row ? props.node.design?.size?.height : props.node.design?.size?.width;
  return crossAxis && crossAxisSize !== 'fill';
}
const layerName = computed(() => {
  if (!props.node) return '';
  if (props.node.design?.name) return props.node.design.name;
  for (const key of ['title', 'label', 'placeholder', 'text', 'alt']) {
    const value = props.node.props[key];
    if (typeof value === 'string' && value) return value;
  }
  return props.node.id;
});
const emit = defineEmits<{
  updatePage: [patch: Partial<Pick<PageDsl, 'title' | 'pageKind' | 'theme'>>];
  updateNode: [patch: Record<string, unknown>];
  updateDesign: [patch: Partial<NodeDesign>];
  alignNode: [alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'];
}>();

function numberValue(event: Event): number { return Number((event.target as HTMLInputElement).value); }
function updateLayerName(event: Event): void {
  const name = (event.target as HTMLInputElement).value.trim();
  emit('updateDesign', { name: name || undefined });
}
function updatePosition(key: 'x' | 'y' | 'mode', event: Event): void {
  const current = props.node?.design?.position;
  const mode = key === 'mode' ? (event.target as HTMLSelectElement).value as 'flow' | 'absolute' : 'absolute';
  const nextPosition = {
    mode,
    x: key === 'x' ? numberValue(event) : current?.x ?? 0,
    y: key === 'y' ? numberValue(event) : current?.y ?? 0
  };
  emit('updateDesign', { position: nextPosition });
}
function updateSize(key: 'width' | 'height', event: Event): void {
  const current = props.node?.design?.size ?? { width: 'hug', height: 'hug' };
  const value = (event.target as HTMLInputElement).value;
  emit('updateDesign', { size: { ...current, [key]: value === 'hug' || value === 'fill' ? value : Number(value) } });
}
function updateSizeMode(key: 'width' | 'height', event: Event): void {
  const input = event.target as HTMLSelectElement;
  const value = input.value;
  if (value === 'hug' || value === 'fill') {
    const current = props.node?.design?.size ?? { width: 'hug', height: 'hug' };
    emit('updateDesign', { size: { ...current, [key]: value } });
  } else {
    const currentValue = props.node?.design?.size?.[key];
    const current = props.node?.design?.size ?? { width: 'hug', height: 'hug' };
    emit('updateDesign', { size: { ...current, [key]: typeof currentValue === 'number' ? currentValue : 320 } });
  }
}
function updateScalar(key: 'rotation' | 'opacity' | 'cornerRadius' | 'strokeWidth', event: Event): void {
  emit('updateDesign', { [key]: numberValue(event) });
}
function toggleVisibility(): void {
  emit('updateDesign', { visible: props.node?.design?.visible === false });
}
function toggleFlip(key: 'flipX' | 'flipY'): void {
  emit('updateDesign', { [key]: !props.node?.design?.[key] });
}
function updateColor(key: 'fill' | 'stroke', event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  emit('updateDesign', { [key]: value || undefined, ...(key === 'fill' ? { fillVariableId: undefined } : {}) });
}
function updateFillVariable(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  emit('updateDesign', { fill: undefined, fillVariableId: id || undefined });
}
function updateTypography(key: keyof NonNullable<NodeDesign['typography']>, event: Event): void {
  const input = event.target as HTMLInputElement | HTMLSelectElement;
  const raw = input.value;
  const current = props.node?.design?.typography ?? {};
  const value = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].includes(key)
    ? Number(raw) : raw;
  emit('updateDesign', { typography: { ...current, [key]: value, ...(key === 'color' ? { colorVariableId: undefined } : {}) } });
}
function updateTypographyColorVariable(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  const current = props.node?.design?.typography ?? {};
  emit('updateDesign', { typography: { ...current, color: undefined, colorVariableId: id || undefined } });
}

function updateTheme(patch: Partial<NonNullable<DesignPageDsl['theme']>>): void {
  const current = props.page.theme;
  const variables = patch.colorVariables ?? current?.colorVariables;
  emit('updatePage', { theme: {
    colorScheme: patch.colorScheme ?? current?.colorScheme,
    cornerStyle: patch.cornerStyle ?? current?.cornerStyle,
    colorVariables: variables?.map((variable) => ({ id: variable.id, name: variable.name, value: variable.value }))
  } });
}
</script>

<template>
  <section v-if="node" class="figma-inspector" aria-label="设计属性">
    <p v-if="selectedNodeCount > 1" class="multi-selection-hint" role="status">已选中 {{ selectedNodeCount }} 个图层。位置与尺寸请使用画布操作；外观与文字样式修改会同步应用，同一 Frame 的流式子图层可批量设置交叉轴对齐，多选缩放保留自动布局。</p>
    <header v-else class="inspector-node-heading"><span>{{ componentLabelByType[node.type] }}</span><strong>{{ layerName }}</strong></header>
    <fieldset class="figma-controls" :disabled="isEffectivelyLocked">
    <NodePropertyEditor
      v-if="selectedNodeCount === 1"
      embedded
      :node="node"
      :entity-fields="entityFields"
      :generated-asset-ids="generatedAssetIds"
      :page-dsl="page"
      @update="emit('updateNode', $event)"
    />
    <label class="layer-name-field">图层名称<input aria-label="图层名称" maxlength="120" :disabled="selectedNodeCount > 1" :value="layerName" @change="updateLayerName"></label>
    <fieldset class="inspector-group">
      <legend>Position</legend>
      <div class="alignment-controls" role="group" aria-label="图层对齐">
        <button type="button" aria-label="左对齐" title="左对齐" :disabled="!canAlign('left')" @click="emit('alignNode', 'left')"><StudioIcon name="align-left" :size="16" /></button>
        <button type="button" aria-label="水平居中" title="水平居中" :disabled="!canAlign('center-x')" @click="emit('alignNode', 'center-x')"><StudioIcon name="align-center-x" :size="16" /></button>
        <button type="button" aria-label="右对齐" title="右对齐" :disabled="!canAlign('right')" @click="emit('alignNode', 'right')"><StudioIcon name="align-right" :size="16" /></button>
        <button type="button" aria-label="顶端对齐" title="顶端对齐" :disabled="!canAlign('top')" @click="emit('alignNode', 'top')"><StudioIcon name="align-top" :size="16" /></button>
        <button type="button" aria-label="垂直居中" title="垂直居中" :disabled="!canAlign('center-y')" @click="emit('alignNode', 'center-y')"><StudioIcon name="align-center-y" :size="16" /></button>
        <button type="button" aria-label="底端对齐" title="底端对齐" :disabled="!canAlign('bottom')" @click="emit('alignNode', 'bottom')"><StudioIcon name="align-bottom" :size="16" /></button>
      </div>
      <p v-if="(node.design?.position?.mode ?? 'flow') !== 'absolute'" class="position-hint">自动布局子图层可调整交叉轴对齐；Fill 尺寸已拉伸至容器边界，主轴顺序由 Frame 布局控制。</p>
      <label>定位方式<select aria-label="定位方式" :disabled="selectedNodeCount > 1" :value="node.design?.position?.mode ?? 'flow'" @change="updatePosition('mode', $event)"><option value="flow">流式</option><option value="absolute">绝对定位</option></select></label>
      <label>X<input aria-label="X 坐标" type="number" min="-8192" max="8192" :disabled="selectedNodeCount > 1" :value="node.design?.position?.x ?? 0" @change="updatePosition('x', $event)"></label>
      <label>Y<input aria-label="Y 坐标" type="number" min="-8192" max="8192" :disabled="selectedNodeCount > 1" :value="node.design?.position?.y ?? 0" @change="updatePosition('y', $event)"></label>
      <p v-if="(node.design?.position?.mode ?? 'flow') !== 'absolute'" class="position-hint">编辑 X / Y 会自动切换为绝对定位。</p>
      <label>旋转<input aria-label="旋转角度" type="number" min="-360" max="360" :disabled="selectedNodeCount > 1" :value="node.design?.rotation ?? 0" @change="updateScalar('rotation', $event)"></label>
      <div class="flip-controls" role="group" aria-label="翻转图层">
        <button type="button" aria-label="水平翻转" title="水平翻转" :aria-pressed="Boolean(node.design?.flipX)" @click="toggleFlip('flipX')"><StudioIcon name="flip-horizontal" :size="16" /></button>
        <button type="button" aria-label="垂直翻转" title="垂直翻转" :aria-pressed="Boolean(node.design?.flipY)" @click="toggleFlip('flipY')"><StudioIcon name="flip-vertical" :size="16" /></button>
      </div>
    </fieldset>
    <fieldset class="inspector-group">
      <legend>Layout</legend>
      <label v-if="node.type === 'Frame'" class="layout-checkbox"><input aria-label="裁切超出内容" type="checkbox" :checked="node.props.clipContent !== false" @change="emit('updateNode', { clipContent: ($event.target as HTMLInputElement).checked })"><span>裁切超出内容</span></label>
      <label>宽度模式<select aria-label="宽度模式" :disabled="selectedNodeCount > 1" :value="typeof node.design?.size?.width === 'number' ? 'fixed' : node.design?.size?.width ?? 'hug'" @change="updateSizeMode('width', $event)"><option value="fixed">固定</option><option value="hug">Hug</option><option value="fill" :disabled="!supportsFillSizing">Fill</option></select></label>
      <label v-if="typeof node.design?.size?.width === 'number'">宽度<input aria-label="宽度" type="number" min="1" max="8192" :disabled="selectedNodeCount > 1" :value="node.design.size.width" @change="updateSize('width', $event)"></label>
      <label>高度模式<select aria-label="高度模式" :disabled="selectedNodeCount > 1" :value="typeof node.design?.size?.height === 'number' ? 'fixed' : node.design?.size?.height ?? 'hug'" @change="updateSizeMode('height', $event)"><option value="fixed">固定</option><option value="hug">Hug</option><option value="fill" :disabled="!supportsFillSizing">Fill</option></select></label>
      <p v-if="!supportsFillSizing" class="position-hint">Fill 仅适用于 Frame 自动布局中的流式子图层。</p>
      <label v-if="typeof node.design?.size?.height === 'number'">高度<input aria-label="高度" type="number" min="1" max="8192" :disabled="selectedNodeCount > 1" :value="node.design.size.height" @change="updateSize('height', $event)"></label>
    </fieldset>
    <fieldset class="inspector-group">
      <legend>Appearance</legend>
      <button class="visibility-control" type="button" :aria-label="node.design?.visible === false ? '显示图层' : '隐藏图层'" :aria-pressed="node.design?.visible !== false" @click="toggleVisibility"><StudioIcon :name="node.design?.visible === false ? 'eye-off' : 'eye'" :size="16" /><span>{{ node.design?.visible === false ? '已隐藏' : '可见' }}</span></button>
      <label>透明度<input aria-label="透明度" type="number" min="0" max="1" step="0.05" :value="node.design?.opacity ?? 1" @change="updateScalar('opacity', $event)"></label>
      <label>圆角<input aria-label="圆角" type="number" min="0" max="256" :value="node.design?.cornerRadius ?? 0" @change="updateScalar('cornerRadius', $event)"></label>
    </fieldset>
    <fieldset v-if="node.type === 'Text'" class="inspector-group">
      <legend>Typography</legend>
      <label>字体<select aria-label="字体" :value="node.design?.typography?.fontFamily ?? 'sans'" @change="updateTypography('fontFamily', $event)"><option v-for="option in fontFamilyOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <label>字号<input aria-label="字号" type="number" min="8" max="128" :value="node.design?.typography?.fontSize ?? 16" @change="updateTypography('fontSize', $event)"></label>
      <label>字重<select aria-label="字重" :value="node.design?.typography?.fontWeight ?? 400" @change="updateTypography('fontWeight', $event)"><option :value="400">常规</option><option :value="500">中等</option><option :value="600">半粗</option><option :value="700">粗体</option></select></label>
      <label>行高<input aria-label="行高" type="number" min="0.5" max="3" step="0.1" :value="node.design?.typography?.lineHeight ?? 1.5" @change="updateTypography('lineHeight', $event)"></label>
      <label>字距<input aria-label="字距" type="number" min="-8" max="32" step="0.5" :value="node.design?.typography?.letterSpacing ?? 0" @change="updateTypography('letterSpacing', $event)"></label>
      <label>对齐<select aria-label="文字对齐" :value="node.design?.typography?.textAlign ?? 'left'" @change="updateTypography('textAlign', $event)"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
      <label>文字颜色变量<select aria-label="文字颜色变量" :value="node.design?.typography?.colorVariableId ?? ''" @change="updateTypographyColorVariable"><option value="">固定颜色</option><option v-for="variable in page.theme?.colorVariables ?? []" :key="variable.id" :value="variable.id">{{ variable.name }}</option></select></label>
      <label>文字颜色<input aria-label="文字颜色" type="color" :value="node?.design?.typography?.color ?? page.theme?.colorVariables?.find((variable) => variable.id === node?.design?.typography?.colorVariableId)?.value ?? '#000000'" @change="updateTypography('color', $event)"></label>
    </fieldset>
    <fieldset class="inspector-group">
      <legend>Fill</legend>
      <label>填充变量<select aria-label="填充变量" :value="node.design?.fillVariableId ?? ''" @change="updateFillVariable"><option value="">固定颜色</option><option v-for="variable in page.theme?.colorVariables ?? []" :key="variable.id" :value="variable.id">{{ variable.name }}</option></select></label>
      <label>填充<input aria-label="填充颜色" type="color" :value="node?.design?.fill ?? page.theme?.colorVariables?.find((variable) => variable.id === node?.design?.fillVariableId)?.value ?? '#ffffff'" @change="updateColor('fill', $event)"></label>
      <label>描边<input aria-label="描边颜色" type="color" :value="node.design?.stroke ?? '#000000'" @change="updateColor('stroke', $event)"></label>
      <label>描边宽度<input aria-label="描边宽度" type="number" min="0" max="24" :value="node.design?.strokeWidth ?? 1" @change="updateScalar('strokeWidth', $event)"></label>
    </fieldset>
    </fieldset>
  </section>
  <section v-else class="page-inspector" aria-labelledby="page-inspector-title">
    <div class="section-kicker">03 / INSPECTOR</div>
    <h2 id="page-inspector-title">页面设置</h2>
    <p class="page-inspector__hint">当前没有选中页面对象。先设置页面基本信息，或在画布中选择一个对象。</p>
    <label class="page-field" for="page-title">
      <span>页面名称</span>
      <input id="page-title" data-testid="page-title" :value="page.title" @input="emit('updatePage', { title: ($event.target as HTMLInputElement).value })">
    </label>
    <fieldset class="page-kind-field">
      <legend>页面用途</legend>
      <label class="page-kind-choice" :class="{ selected: (page.pageKind ?? 'admin') === 'admin' }">
        <input data-testid="page-kind" type="radio" name="page-kind" value="admin" :checked="(page.pageKind ?? 'admin') === 'admin'" @change="emit('updatePage', { pageKind: 'admin' })">
        <span><strong>管理平台</strong><small>工作台、表格、表单和业务操作</small></span>
      </label>
      <label class="page-kind-choice" :class="{ selected: page.pageKind === 'website' }">
        <input type="radio" name="page-kind" value="website" :checked="page.pageKind === 'website'" @change="emit('updatePage', { pageKind: 'website' })">
        <span><strong>企业官网</strong><small>品牌介绍、内容区块和行动引导</small></span>
      </label>
    </fieldset>
    <fieldset class="page-kind-field page-theme-field">
      <legend>主题配色</legend>
      <div class="theme-options" role="group" aria-label="主题配色">
        <button
          v-for="option in [
            { value: 'blue', label: '科技蓝' },
            { value: 'teal', label: '青绿色' },
            { value: 'violet', label: '星云紫' },
            { value: 'amber', label: '活力橙' }
          ]"
          :key="option.value"
          type="button"
          class="theme-choice"
          :class="{ selected: (page.theme?.colorScheme ?? 'blue') === option.value }"
          :aria-pressed="(page.theme?.colorScheme ?? 'blue') === option.value"
          :data-testid="`theme-color-${option.value}`"
          @click="updateTheme({ colorScheme: option.value as NonNullable<DesignPageDsl['theme']>['colorScheme'] })"
        >{{ option.label }}</button>
      </div>
    </fieldset>
    <fieldset class="page-kind-field page-theme-field">
      <legend>圆角风格</legend>
      <div class="theme-options" role="group" aria-label="圆角风格">
        <button
          v-for="option in [
            { value: 'rounded', label: '标准圆角' },
            { value: 'soft', label: '柔和圆角' },
            { value: 'square', label: '直角' }
          ]"
          :key="option.value"
          type="button"
          class="theme-choice"
          :class="{ selected: (page.theme?.cornerStyle ?? 'rounded') === option.value }"
          :aria-pressed="(page.theme?.cornerStyle ?? 'rounded') === option.value"
          :data-testid="`theme-corner-${option.value}`"
          @click="updateTheme({ cornerStyle: option.value as NonNullable<DesignPageDsl['theme']>['cornerStyle'] })"
        >{{ option.label }}</button>
      </div>
    </fieldset>
    <div class="page-inspector__summary"><span>页面结构版本</span><strong>V{{ page.schemaVersion }}</strong></div>
  </section>
</template>

<style scoped>
.figma-inspector{display:grid;gap:10px;padding:12px;background:#fff;border:1px solid #d9d9d9;border-radius:6px}.inspector-node-heading{display:grid;gap:3px;padding:0 0 10px;border-bottom:1px solid #f0f0f0}.inspector-node-heading span{color:#8c8c8c;font-size:10px}.inspector-node-heading strong{overflow:hidden;color:#262626;font-size:14px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.figma-controls{display:grid;gap:10px;min-width:0;margin:0;padding:0;border:0}.figma-controls:disabled{opacity:.65}.inspector-group{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0;border:0}.inspector-group legend{grid-column:1/-1;width:100%;padding:0 0 6px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:600;color:#595959}.inspector-group label{display:grid;gap:4px;min-width:0;font-size:11px;color:#595959}.inspector-group input,.inspector-group select{box-sizing:border-box;width:100%;height:28px;min-width:0;padding:3px 6px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;color:#1f1f1f;font:inherit}.inspector-group input[type=color]{padding:2px}.alignment-controls{grid-column:1/-1;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:2px}.alignment-controls button,.flip-controls button{height:30px;border:1px solid #f0f0f0;border-radius:4px;background:#fafafa;color:#434343;cursor:pointer}.alignment-controls button:hover:not(:disabled),.flip-controls button:hover,.flip-controls button[aria-pressed="true"]{border-color:#91caff;background:#e6f4ff;color:#0958d9}.alignment-controls button:disabled{opacity:.45;cursor:not-allowed}.flip-controls{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px}
.layer-name-field{display:grid;gap:4px;font-size:11px;color:#595959}.layer-name-field input{box-sizing:border-box;width:100%;height:30px;padding:4px 7px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;color:#1f1f1f;font:inherit}
.multi-selection-hint{margin:0;padding:8px 10px;border-radius:5px;background:#e6f4ff;color:#0958d9;font-size:11px;line-height:1.5}
.position-hint{grid-column:1/-1;margin:0;color:#8c8c8c;font-size:10px;line-height:1.4}
.visibility-control{grid-column:1/-1;display:flex;align-items:center;gap:7px;justify-self:start;min-height:30px;padding:0 8px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;color:#434343;font:inherit;cursor:pointer}.visibility-control:hover,.visibility-control[aria-pressed="false"]{border-color:#91caff;background:#e6f4ff;color:#0958d9}.visibility-control:focus-visible{outline:2px solid #91caff;outline-offset:1px}
.page-inspector{min-width:0;padding:var(--pf-space-4);background:var(--pf-color-surface);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);min-height:260px}
.section-kicker{font-size:var(--pf-font-size-sm);font-weight:500;color:var(--pf-color-text-secondary)}
.page-inspector h2{font-size:var(--pf-font-size-lg);font-weight:600;margin:var(--pf-space-1) 0 var(--pf-space-2)}
.page-inspector__hint{margin:0 0 var(--pf-space-4);font-size:var(--pf-font-size-sm);line-height:1.5;color:var(--pf-color-text-secondary)}
.page-field{display:grid;gap:var(--pf-space-1);margin:var(--pf-space-3) 0}.page-field span,.page-kind-field legend{font-size:var(--pf-font-size-sm);font-weight:500}
.page-field input{width:100%;height:34px;padding:0 var(--pf-space-2);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius-sm);color:var(--pf-color-text);font:inherit}
.page-field input:focus{outline:2px solid #e6f4ff;border-color:var(--pf-color-primary)}
.page-kind-field{display:grid;gap:var(--pf-space-2);margin:var(--pf-space-4) 0 0;padding:0;border:0}.page-kind-field legend{margin-bottom:var(--pf-space-2)}
.page-kind-choice{display:flex;gap:var(--pf-space-2);align-items:flex-start;padding:var(--pf-space-2);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius-sm);cursor:pointer}
.page-kind-choice.selected{border-color:#91caff;background:#e6f4ff}.page-kind-choice input{margin:3px 0 0;accent-color:var(--pf-color-primary)}.page-kind-choice span{display:grid;gap:3px}.page-kind-choice strong{font-size:var(--pf-font-size-sm)}.page-kind-choice small{font-size:11px;line-height:1.4;color:var(--pf-color-text-secondary)}
.theme-options{display:flex;flex-wrap:wrap;gap:var(--pf-space-2)}.theme-choice{min-height:32px;padding:0 var(--pf-space-2);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius-sm);background:var(--pf-color-surface);color:var(--pf-color-text);font:inherit;font-size:var(--pf-font-size-sm);cursor:pointer}.theme-choice.selected{border-color:#91caff;background:#e6f4ff;color:var(--pf-color-primary)}.theme-choice:focus-visible{outline:2px solid #e6f4ff;outline-offset:1px;border-color:var(--pf-color-primary)}
.page-inspector__summary{display:flex;justify-content:space-between;margin-top:var(--pf-space-4);padding-top:var(--pf-space-3);border-top:var(--pf-border-width) solid var(--pf-color-border-secondary);color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm)}.page-inspector__summary strong{color:var(--pf-color-text)}
.inspector-group .layout-checkbox{display:flex;grid-column:1/-1;align-items:center;gap:7px;min-height:28px;cursor:pointer}.inspector-group .layout-checkbox input{width:14px;height:14px;margin:0;padding:0;accent-color:#1677ff}
</style>
