<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { CanvasDevice } from './use-canvas-viewport';
import { CANVAS_ZOOM_MAX, CANVAS_ZOOM_MIN } from './use-canvas-viewport';
import StudioIcon from './StudioIcon.vue';

type CanvasTool = 'Frame' | 'Shape' | 'Text' | 'Image';
type ShapeType = 'rectangle' | 'ellipse' | 'line';
const props = defineProps<{ device: CanvasDevice; zoom: number; canUndo: boolean; canRedo: boolean; hasSelection?: boolean; canPaste?: boolean; canGroup?: boolean; canAutoLayout?: boolean; canUngroup?: boolean; activeTool?: CanvasTool | null; shapeType?: ShapeType }>();
const emit = defineEmits<{
  undo: [];
  redo: [];
  copySelection: [];
  pasteSelection: [];
  duplicateSelection: [];
  groupSelection: [];
  autoLayoutSelection: [];
  ungroupSelection: [];
  setDevice: [device: CanvasDevice];
  zoomBy: [amount: number];
  fit: [];
  addTool: [type: CanvasTool | 'select'];
  selectShape: [shape: ShapeType];
}>();
const shapeMenuOpen = shallowRef(false);

const deviceOptions: Array<{ value: CanvasDevice; label: string; width: number }> = [
  { value: 'desktop', label: '桌面', width: 1280 },
  { value: 'tablet', label: '平板', width: 768 },
  { value: 'mobile', label: '手机', width: 390 }
];
const shapeOptions: Array<{ value: ShapeType; label: string; icon: string }> = [
  { value: 'rectangle', label: '矩形', icon: '□' },
  { value: 'ellipse', label: '椭圆', icon: '○' },
  { value: 'line', label: '直线', icon: '╱' }
];
const activeShapeOption = computed(() => shapeOptions.find((option) => option.value === (props.shapeType ?? 'rectangle')) ?? shapeOptions[0]!);

function chooseShape(shape: ShapeType): void {
  emit('selectShape', shape);
  emit('addTool', 'Shape');
  shapeMenuOpen.value = false;
}
</script>

<template>
  <div class="design-toolbar" role="toolbar" aria-label="画布工具">
    <div class="creation-tools" aria-label="插入图层">
      <button type="button" aria-label="选择工具" title="选择工具（V）" :aria-pressed="activeTool == null" @click="emit('addTool', 'select')"><StudioIcon name="select" /></button>
      <button type="button" aria-label="添加画框" title="画框（F）" :aria-pressed="activeTool === 'Frame'" @click="emit('addTool', 'Frame')"><StudioIcon name="frame" /></button>
      <div class="shape-tool-group" @keydown.esc.prevent.stop="shapeMenuOpen = false">
        <button type="button" aria-label="添加形状" :title="`${activeShapeOption.label}（R）`" :aria-pressed="props.activeTool === 'Shape'" @click="emit('addTool', 'Shape')"><StudioIcon :name="shapeType === 'ellipse' ? 'ellipse' : shapeType === 'line' ? 'line' : 'rectangle'" /></button>
        <button type="button" class="shape-menu-toggle" aria-label="选择形状类型" :aria-expanded="shapeMenuOpen" @click="shapeMenuOpen = !shapeMenuOpen"><StudioIcon name="chevron-down" :size="12" /></button>
        <div v-if="shapeMenuOpen" class="shape-menu" role="group" aria-label="形状类型">
          <button v-for="option in shapeOptions" :key="option.value" type="button" :aria-pressed="(props.shapeType ?? 'rectangle') === option.value" @click="chooseShape(option.value)"><span aria-hidden="true">{{ option.icon }}</span>{{ option.label }}</button>
        </div>
      </div>
      <button type="button" aria-label="添加文字" title="文字（T）" :aria-pressed="activeTool === 'Text'" @click="emit('addTool', 'Text')"><StudioIcon name="text" /></button>
      <button type="button" aria-label="添加图片" title="图片（I）" :aria-pressed="activeTool === 'Image'" @click="emit('addTool', 'Image')"><StudioIcon name="image" /></button>
    </div>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <div class="history-controls" aria-label="编辑历史">
      <button type="button" aria-label="撤销" title="撤销（⌘/Ctrl+Z）" :disabled="!canUndo" @click="emit('undo')"><StudioIcon name="undo" /></button>
      <button type="button" aria-label="重做" title="重做（⌘/Ctrl+Shift+Z）" :disabled="!canRedo" @click="emit('redo')"><StudioIcon name="redo" /></button>
    </div>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <div class="layer-edit-controls" aria-label="图层编辑">
      <button type="button" aria-label="复制图层" title="复制图层（⌘/Ctrl+C）" :disabled="!hasSelection" @click="emit('copySelection')"><StudioIcon name="copy" /></button>
      <button type="button" aria-label="粘贴图层" title="粘贴图层（⌘/Ctrl+V）" :disabled="!canPaste" @click="emit('pasteSelection')"><StudioIcon name="paste" /></button>
      <button type="button" aria-label="重复图层" title="重复图层（⌘/Ctrl+D）" :disabled="!hasSelection" @click="emit('duplicateSelection')"><StudioIcon name="duplicate" /></button>
      <button type="button" aria-label="组合图层" title="组合图层（⌘/Ctrl+G）" :disabled="!canGroup" @click="emit('groupSelection')"><StudioIcon name="group" /></button>
      <button type="button" aria-label="自动布局" title="自动布局（Shift+A）：将等间距单行/单列选区转换为 Frame" :disabled="!canAutoLayout" @click="emit('autoLayoutSelection')">自动布局</button>
      <button type="button" aria-label="取消组合" title="取消组合（⌘/Ctrl+Shift+G）" :disabled="!canUngroup" @click="emit('ungroupSelection')"><StudioIcon name="ungroup" /></button>
    </div>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <div class="device-switch" aria-label="预览设备">
      <button
        v-for="option in deviceOptions"
        :key="option.value"
        type="button"
        :data-device="option.value"
        :aria-pressed="device === option.value"
        :aria-label="`${option.label}预览，${option.width}像素`"
        @click="emit('setDevice', option.value)"
      ><StudioIcon :name="option.value" :size="16" /><span class="sr-only">{{ option.label }}</span></button>
    </div>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <div class="zoom-controls" aria-label="画布缩放">
      <button type="button" aria-label="缩小画布" :disabled="zoom <= CANVAS_ZOOM_MIN" @click="emit('zoomBy', -10)"><StudioIcon name="zoom-out" /></button>
      <output aria-live="polite" data-testid="canvas-zoom" title="Shift+1 适配画布 · Shift+2 缩放到选区">{{ zoom }}%</output>
      <button type="button" aria-label="放大画布" :disabled="zoom >= CANVAS_ZOOM_MAX" @click="emit('zoomBy', 10)"><StudioIcon name="zoom-in" /></button>
      <button type="button" class="fit-button" title="适配画布（Shift+1）" aria-label="适配画布" @click="emit('fit')"><StudioIcon name="fit" /></button>
    </div>
  </div>
</template>

<style scoped>
.design-toolbar{display:flex;align-items:center;justify-content:space-between;gap:var(--pf-space-3);padding:var(--pf-space-2);border:var(--pf-border-width) solid var(--pf-color-border-secondary);border-radius:8px;background:#fff;box-shadow:0 4px 14px rgba(31,35,41,.12)}
.history-controls,.layer-edit-controls,.device-switch,.zoom-controls{display:flex;align-items:center;gap:var(--pf-space-1)}
.creation-tools{display:flex;align-items:center;gap:2px}.creation-tools button{display:grid;min-width:30px;place-items:center;padding:0;color:#595959}.creation-tools button:hover{background:#e6f4ff;color:#1677ff}.design-toolbar button svg{display:block;flex:none}
.shape-tool-group{position:relative;display:flex;align-items:center}.shape-tool-group .shape-menu-toggle{min-width:15px;width:15px;padding:0;font-size:10px}.shape-tool-group .shape-menu{position:absolute;bottom:36px;left:0;z-index:12;display:grid;min-width:124px;padding:4px;border:1px solid #d9d9d9;border-radius:7px;background:#fff;box-shadow:0 6px 20px #0002}.shape-tool-group .shape-menu button{display:flex;align-items:center;gap:8px;width:100%;text-align:left}.shape-tool-group .shape-menu button span{width:18px;text-align:center;font-size:15px}
.design-toolbar button{display:inline-flex;height:30px;align-items:center;justify-content:center;gap:6px;padding:0 var(--pf-space-2);border:1px solid transparent;border-radius:var(--pf-radius-sm);background:transparent;color:var(--pf-color-text-secondary);font:inherit;font-size:var(--pf-font-size-sm);cursor:pointer}
.design-toolbar button:hover:not(:disabled){background:#e6f4ff;color:var(--pf-color-primary-strong)}
.design-toolbar button[aria-pressed="true"]{border-color:#91caff;background:#e6f4ff;color:var(--pf-color-primary-strong);font-weight:600}
.design-toolbar button:focus-visible{outline:2px solid var(--pf-color-primary);outline-offset:1px}
.design-toolbar button:disabled{opacity:.4;cursor:not-allowed}
.toolbar-divider{width:1px;height:20px;background:var(--pf-color-border)}
.zoom-controls{margin-left:auto}.zoom-controls output{min-width:46px;text-align:center;color:var(--pf-color-text);font-size:var(--pf-font-size-sm);font-variant-numeric:tabular-nums}.zoom-controls .fit-button{border:1px solid var(--pf-color-border);background:var(--pf-color-surface);color:var(--pf-color-text)}
@media(max-width:520px){.design-toolbar{flex-wrap:wrap}.zoom-controls{margin-left:0}.device-switch{flex:1}}
</style>
