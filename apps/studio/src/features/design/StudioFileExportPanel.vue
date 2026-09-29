<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, shallowRef, useTemplateRef } from 'vue';
import type { StudioFilePage } from '@pulseflow/contracts';
import PreviewPanel from '../preview/PreviewPanel.vue';
import { createMockData } from '../preview/mock-handlers';
import type { StudioFileExportInput } from './studio-file-export';
import { exportStudioVueProject, exportValidatedStudioFile } from './studio-file-export';
import { analyzeLayoutPage, applyLayoutGroupSuggestions, captureLayoutPreview, measureLayoutGroupGeometries, type LayoutOptimizationResult } from './layout-optimization';

interface PageLayoutReview {
  originalImage: string;
  candidateImage?: string;
  result: LayoutOptimizationResult;
  status: 'ready' | 'original' | 'candidate';
}

const props = defineProps<{ file: StudioFileExportInput; imageUrls?: Readonly<Record<string, string>> }>();
const emit = defineEmits<{ close: [] }>();
const feedback = shallowRef('');
const result = computed(() => exportValidatedStudioFile(props.file));
const vueProjectError = shallowRef('');
const vueProjectPending = shallowRef(false);
const layoutEnabled = shallowRef(false);
const selectedLayoutPageIds = shallowRef<string[]>([]);
const layoutPending = shallowRef(false);
const layoutError = shallowRef('');
const layoutNotice = shallowRef('');
const layoutPreviewPage = shallowRef<StudioFilePage | null>(null);
const layoutReviews = shallowRef<Record<string, PageLayoutReview>>({});
const dialog = useTemplateRef<HTMLElement>('dialog');
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');
const layoutPreviewStage = useTemplateRef<HTMLElement>('layoutPreviewStage');
let previousFocused: HTMLElement | null = null;
let inertSiblings: Array<{ element: HTMLElement; wasInert: boolean }> = [];

function absoluteNodeCount(page: StudioFilePage): number {
  const pending = [...page.pageDsl.nodes];
  let count = 0;
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (node.design?.position?.mode === 'absolute') count += 1;
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return count;
}

const layoutEligiblePages = computed(() => result.value.ok
  ? result.value.file.pages.filter((page) => absoluteNodeCount(page) >= 2)
  : []);
const layoutPreviewData = computed(() => layoutPreviewPage.value
  ? createMockData(layoutPreviewPage.value.pageDsl, layoutPreviewPage.value.entityFields)
  : {});
const layoutImageUrls = computed(() => new Map(Object.entries(props.imageUrls ?? {})));

function toggleLayoutPage(pageId: string, checked: boolean): void {
  selectedLayoutPageIds.value = checked
    ? [...new Set([...selectedLayoutPageIds.value, pageId])]
    : selectedLayoutPageIds.value.filter((id) => id !== pageId);
}

async function waitForLayoutPreview(): Promise<HTMLElement> {
  await nextTick();
  const panel = layoutPreviewStage.value?.querySelector<HTMLElement>('.preview-panel');
  if (!panel) throw new Error('页面预览未就绪，请重试。');
  return panel;
}

async function analyzeSelectedLayouts(): Promise<void> {
  if (layoutPending.value || selectedLayoutPageIds.value.length === 0) return;
  if (selectedLayoutPageIds.value.length > 5) {
    layoutError.value = '每次最多分析 5 个页面，请分批选择。';
    return;
  }
  layoutPending.value = true;
  layoutError.value = '';
  layoutNotice.value = '';
  try {
    const pages = layoutEligiblePages.value.filter((page) => selectedLayoutPageIds.value.includes(page.id));
    for (const page of pages) {
      layoutPreviewPage.value = page;
      const preview = await waitForLayoutPreview();
      const originalImage = await captureLayoutPreview(preview);
      const nodeIds: string[] = [];
      const stack = [...page.pageDsl.nodes];
      while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        if (node.design?.position?.mode === 'absolute') nodeIds.push(node.id);
        stack.push(...node.children);
        for (const slot of node.slots) if ('children' in slot) stack.push(...slot.children);
      }
      const measured = measureLayoutGroupGeometries(page.pageDsl, preview, nodeIds);
      if (!measured) throw new Error(`「${page.pageDsl.title}」的图层尺寸无法读取，未应用布局建议。`);
      const geometryByNodeId = new Map(measured.map((geometry) => [geometry.nodeId, geometry]));
      const analysis = await analyzeLayoutPage(page.pageDsl, originalImage);
      const result = applyLayoutGroupSuggestions(page.pageDsl, analysis.groups, geometryByNodeId, page.entityFields);
      let candidateImage: string | undefined;
      if (result.appliedGroups.length) {
        layoutPreviewPage.value = { ...page, pageDsl: result.pageDsl };
        const candidatePreview = await waitForLayoutPreview();
        candidateImage = await captureLayoutPreview(candidatePreview);
      }
      layoutReviews.value = {
        ...layoutReviews.value,
        [page.id]: { originalImage, ...(candidateImage ? { candidateImage } : {}), result, status: 'original' }
      };
      layoutPreviewPage.value = null;
      await nextTick();
    }
    layoutNotice.value = `已完成 ${pages.length} 个页面的布局分析；逐页检查并选择导出版本。`;
  } catch (error) {
    layoutError.value = error instanceof Error ? error.message : '布局分析失败，可继续导出原始页面。';
  } finally {
    layoutPreviewPage.value = null;
    layoutPending.value = false;
  }
}

function selectLayoutVersion(pageId: string, status: PageLayoutReview['status']): void {
  const current = layoutReviews.value[pageId];
  if (!current || status === 'candidate' && !current.candidateImage) return;
  layoutReviews.value = { ...layoutReviews.value, [pageId]: { ...current, status } };
}

function projectForVueExport(): StudioFileExportInput {
  if (!result.value.ok) return props.file;
  if (!layoutEnabled.value) return result.value.file;
  const pages = result.value.file.pages.map((page) => {
    const review = layoutReviews.value[page.id];
    return review?.status === 'candidate' && review.result.appliedGroups.length
      ? { ...page, pageDsl: review.result.pageDsl }
      : page;
  });
  return { ...result.value.file, pages };
}

function focusableElements(): HTMLElement[] {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []);
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;
  const items = focusableElements();
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) {
    event.preventDefault();
    dialog.value?.focus();
  } else if (event.shiftKey && (document.activeElement === first || !dialog.value?.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.value?.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  previousFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = dialog.value?.parentElement;
  const appRoot = dialog.value?.closest('.design-studio') ?? overlay?.parentElement;
  if (appRoot && overlay) {
    inertSiblings = Array.from(appRoot.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map((element) => ({ element, wasInert: element.inert }));
    for (const item of inertSiblings) item.element.inert = true;
  }
  document.addEventListener('keydown', onDialogKeydown);
  void nextTick(() => closeButton.value?.focus());
});

onScopeDispose(() => {
  document.removeEventListener('keydown', onDialogKeydown);
  for (const item of inertSiblings) item.element.inert = item.wasInert;
  previousFocused?.focus();
});

async function copyProject(): Promise<void> {
  if (!result.value.ok) return;
  try {
    await navigator.clipboard.writeText(result.value.jsonText);
    feedback.value = '完整 Studio 项目已复制';
  } catch {
    feedback.value = '复制失败，请检查浏览器剪贴板权限后重试';
  }
}

function downloadProject(): void {
  if (!result.value.ok) return;
  const blob = new Blob([result.value.jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${result.value.file.id}.pulseflow.json`;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1_000);
  feedback.value = '项目文件已开始下载';
}

async function downloadVueProject(): Promise<void> {
  if (!result.value.ok || vueProjectPending.value) return;
  vueProjectPending.value = true;
  vueProjectError.value = '';
  try {
    const generated = await exportStudioVueProject(projectForVueExport(), props.imageUrls);
    if (!generated.ok) {
      vueProjectError.value = generated.diagnostics.map((item) => `${item.path}：${item.message}`).join('；');
      return;
    }
  const blob = new Blob([new Uint8Array(generated.bytes).buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = generated.fileName;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1_000);
  feedback.value = '可运行的 Vue 项目 ZIP 已开始下载';
  } catch {
    vueProjectError.value = 'Vue 项目打包失败，请重试。';
  } finally {
    vueProjectPending.value = false;
  }
}
</script>

<template>
  <div class="studio-file-export-backdrop" @click.self="emit('close')">
  <section ref="dialog" class="studio-file-export" role="dialog" aria-modal="true" aria-labelledby="studio-file-export-title" tabindex="-1">
    <header>
      <div><span>完整设计文件</span><h2 id="studio-file-export-title">导出 Studio 项目</h2></div>
      <button ref="closeButton" type="button" aria-label="关闭项目导出" @click="emit('close')">关闭</button>
    </header>
    <p class="studio-file-export__hint">项目名称、当前页面以及全部 {{ file.pages.length }} 个页面会一起导出。每页 UI-DSL 都会先校验。</p>
    <div v-if="result.ok" class="studio-file-export__valid" role="status">{{ result.file.pages.length }} 个页面均通过 UI-DSL 校验</div>
    <div v-else class="studio-file-export__invalid" role="alert">
      <strong>项目不能导出</strong>
      <ul><li v-for="item in result.diagnostics" :key="`${item.code}:${item.path}`"><code>{{ item.path }}</code>：{{ item.message }}</li></ul>
    </div>
    <div class="studio-file-export__project-note"><strong>Vue 3 项目包</strong><span>包含全部页面源码、所用图片素材、切换导航和本地运行配置；解压后执行 <code>pnpm install</code>、<code>pnpm dev</code>。</span></div>
    <p class="studio-file-export__hint">AI 布局选择只影响“下载可运行 Vue 项目”；复制或下载 Studio JSON 会保留原设计，方便继续在画布中编辑。</p>
    <section v-if="result.ok" class="layout-assist" aria-label="导出前 AI 布局优化">
      <label class="layout-assist__toggle"><input v-model="layoutEnabled" type="checkbox"><span><strong>AI 协助优化 Flex 布局</strong><small>结合页面截图和 UI-DSL 检查绝对定位图层；结果只用于导出的副本。</small></span></label>
      <div v-if="layoutEnabled" class="layout-assist__body">
        <p class="layout-assist__hint">选择最多 5 个页面进行分析。AI 仅给出图层分组建议，未通过几何检查的图层会保持原样。</p>
        <div v-if="layoutEligiblePages.length" class="layout-assist__pages">
          <label v-for="page in layoutEligiblePages" :key="page.id" class="layout-assist__page-option">
            <input type="checkbox" :checked="selectedLayoutPageIds.includes(page.id)" :disabled="layoutPending" @change="toggleLayoutPage(page.id, ($event.target as HTMLInputElement).checked)">
            <span><strong>{{ page.pageDsl.title }}</strong><small>{{ absoluteNodeCount(page) }} 个绝对定位图层</small></span>
          </label>
        </div>
        <p v-else class="layout-assist__hint">当前项目没有包含两个以上绝对定位图层的页面。</p>
        <button class="layout-assist__analyze" type="button" :disabled="layoutPending || !selectedLayoutPageIds.length" @click="analyzeSelectedLayouts">{{ layoutPending ? '正在分析并生成预览…' : `分析已选页面（${selectedLayoutPageIds.length}）` }}</button>
        <p v-if="layoutError" class="layout-assist__error" role="alert">{{ layoutError }} 仍可导出原始页面。</p>
        <p v-else-if="layoutNotice" class="layout-assist__notice" role="status">{{ layoutNotice }}</p>
        <div v-for="page in layoutEligiblePages.filter((item) => layoutReviews[item.id])" :key="page.id" class="layout-review">
          <header class="layout-review__header"><div><strong>{{ page.pageDsl.title }}</strong><span>已识别 {{ layoutReviews[page.id]!.result.appliedGroups.length }} 组可安全转换</span></div><label><input type="radio" :name="`layout-${page.id}`" :checked="layoutReviews[page.id]!.status === 'original'" @change="selectLayoutVersion(page.id, 'original')">导出原版</label><label v-if="layoutReviews[page.id]!.candidateImage"><input type="radio" :name="`layout-${page.id}`" :checked="layoutReviews[page.id]!.status === 'candidate'" @change="selectLayoutVersion(page.id, 'candidate')">导出 Flex 优化版</label></header>
          <div class="layout-review__images"><figure><figcaption>当前页面</figcaption><img :src="layoutReviews[page.id]!.originalImage" :alt="`${page.pageDsl.title} 原始布局预览`"></figure><figure v-if="layoutReviews[page.id]!.candidateImage"><figcaption>候选 Flex 布局</figcaption><img :src="layoutReviews[page.id]!.candidateImage" :alt="`${page.pageDsl.title} Flex 候选预览`"></figure><div v-else class="layout-review__empty">没有通过安全检查的转换建议；此页将使用原始布局。</div></div>
          <ul v-if="layoutReviews[page.id]!.result.skippedGroups.length" class="layout-review__reasons"><li v-for="(group, index) in layoutReviews[page.id]!.result.skippedGroups" :key="`${page.id}-${index}`">{{ group.reason }}</li></ul>
        </div>
      </div>
    </section>
    <div ref="layoutPreviewStage" class="layout-preview-stage" aria-hidden="true">
      <PreviewPanel v-if="layoutPreviewPage" :dsl="layoutPreviewPage.pageDsl" :data="layoutPreviewData" :artboard-mode="true" :external-asset-urls="layoutImageUrls" />
    </div>
    <div v-if="vueProjectError" class="studio-file-export__invalid" role="alert">{{ vueProjectError }}</div>
    <pre v-if="result.ok" class="studio-file-export__preview"><code>{{ result.jsonText }}</code></pre>
    <p v-if="feedback" class="studio-file-export__feedback" role="status">{{ feedback }}</p>
    <footer>
      <button type="button" :disabled="!result.ok" @click="copyProject">复制项目 JSON</button>
      <button type="button" :disabled="!result.ok" @click="downloadProject">下载项目 JSON</button>
      <button class="studio-file-export__vue-action" type="button" :disabled="!result.ok || vueProjectPending || layoutPending" @click="downloadVueProject">{{ vueProjectPending ? '正在打包…' : layoutPending ? '正在分析布局…' : '下载可运行 Vue 项目' }}</button>
    </footer>
  </section>
  </div>
</template>

<style scoped>
.studio-file-export{position:fixed;z-index:1001;inset:5vh 5vw;display:flex;flex-direction:column;gap:16px;padding:24px;overflow:auto;border:1px solid #d9d9d9;border-radius:8px;background:#fff;box-shadow:0 16px 48px #0003;color:#1f1f1f}
.layout-assist{display:grid;gap:10px;padding:12px;border:1px solid #d6e4ff;border-radius:6px;background:#f8fbff}.layout-assist__toggle{display:flex;align-items:flex-start;gap:9px;color:#262626;cursor:pointer}.layout-assist__toggle input,.layout-assist__page-option input,.layout-review__header input{accent-color:#1677ff}.layout-assist__toggle span,.layout-assist__page-option span{display:grid;gap:3px}.layout-assist__toggle strong{font-size:13px}.layout-assist__toggle small,.layout-assist__page-option small{color:#8c8c8c;font-size:11px}.layout-assist__body{display:grid;gap:9px;padding-left:22px}.layout-assist__hint,.layout-assist__notice,.layout-assist__error{margin:0;color:#595959;font-size:12px;line-height:1.5}.layout-assist__notice{color:#389e0d}.layout-assist__error{color:#cf1322}.layout-assist__pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px}.layout-assist__page-option{display:flex;align-items:flex-start;gap:7px;padding:8px;border:1px solid #f0f0f0;border-radius:5px;background:#fff;cursor:pointer}.layout-assist__page-option strong{font-size:12px}.layout-assist__analyze{justify-self:start;min-height:30px;padding:0 11px;border:1px solid #1677ff;border-radius:5px;background:#1677ff;color:#fff;font:inherit;font-size:12px;cursor:pointer}.layout-assist__analyze:disabled{opacity:.5;cursor:not-allowed}.layout-review{display:grid;gap:8px;padding:10px;border:1px solid #e8e8e8;border-radius:6px;background:#fff}.layout-review__header{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.layout-review__header>div{display:grid;gap:2px;flex:1;min-width:140px}.layout-review__header>div strong{font-size:12px}.layout-review__header>div span,.layout-review__header label{color:#595959;font-size:11px}.layout-review__header label{display:flex;align-items:center;gap:5px}.layout-review__images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.layout-review__images figure{display:grid;align-content:start;gap:5px;min-width:0;margin:0;padding:6px;border:1px solid #f0f0f0;border-radius:4px}.layout-review__images figcaption{color:#8c8c8c;font-size:10px}.layout-review__images img{display:block;max-width:100%;max-height:280px;object-fit:contain;object-position:top left}.layout-review__empty{align-self:center;color:#8c8c8c;font-size:11px}.layout-review__reasons{margin:0;padding-left:18px;color:#ad6800;font-size:11px}.layout-preview-stage{position:fixed;top:0;left:-12000px;width:max-content;max-width:1440px;pointer-events:none;z-index:-1}
.studio-file-export__project-note{display:grid;gap:4px;padding:10px 12px;border:1px solid #d6e4ff;border-radius:6px;background:#f0f5ff;color:#434343;font-size:12px}.studio-file-export__project-note strong{color:#0958d9;font-size:13px}.studio-file-export__project-note code{padding:1px 4px;border-radius:3px;background:#fff;color:#0958d9}.studio-file-export__vue-action{border-color:#1677ff!important;background:#1677ff!important;color:#fff!important}.studio-file-export__vue-action:hover:not(:disabled){border-color:#4096ff!important;background:#4096ff!important}
.studio-file-export-backdrop{position:fixed;z-index:1001;inset:0;background:#00000052}
.studio-file-export{position:absolute;inset:5vh 5vw}
.studio-file-export>header,.studio-file-export>footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.studio-file-export>header span{color:#8c8c8c;font-size:12px}.studio-file-export>header h2{margin:4px 0 0;font-size:20px}.studio-file-export__hint{margin:0;color:#595959;font-size:13px}.studio-file-export__valid,.studio-file-export__invalid{padding:10px 12px;border-radius:6px;font-size:13px}.studio-file-export__valid{background:#f6ffed;color:#389e0d}.studio-file-export__invalid{background:#fff2f0;color:#cf1322}.studio-file-export__invalid ul{margin:8px 0 0;padding-left:20px}.studio-file-export__preview{flex:none;min-height:80px;max-height:160px;margin:0;overflow:auto;padding:16px;border:1px solid #f0f0f0;border-radius:6px;background:#fafafa;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}.studio-file-export__feedback{margin:0;color:#1677ff;font-size:13px}.studio-file-export>footer{justify-content:flex-end;margin-top:auto}.studio-file-export button{min-height:34px;padding:0 14px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#262626;font:inherit;cursor:pointer}.studio-file-export button:hover:not(:disabled){border-color:#4096ff;color:#1677ff}.studio-file-export button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:640px){.studio-file-export{inset:2vh 3vw;padding:16px}.layout-review__images{grid-template-columns:1fr}}
</style>
