<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef } from 'vue';
import { validatePageDsl, type EntityField, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';
import PreviewPanel from '../preview/PreviewPanel.vue';
import { createMockData } from '../preview/mock-handlers';
import { convertImageToDsl, saveImportedImageRegions, type ImageImportPageType, type ImageImportResult } from './design-api';
import * as imageImport from './image-import';
import { createImageRegionPreviews, prepareDesignReferenceImage, validateDesignReferenceFile, type ImageRegionPreview } from './image-import';
import StudioIcon from './StudioIcon.vue';

const props = defineProps<{ currentPageKind?: 'website' | 'admin'; currentPageId?: string; initialFile?: File | null; initialInstruction?: string }>();
const emit = defineEmits<{
  close: [];
  apply: [payload: { pageDsl: PageDsl; entityFields: EntityField[] }];
}>();

const file = shallowRef<File | null>(null);
const previewUrl = shallowRef('');
const pageType = shallowRef<ImageImportPageType>(props.currentPageKind ?? 'auto');
const instruction = shallowRef(props.initialInstruction ?? '');
const pending = shallowRef(false);
const applying = shallowRef(false);
const error = shallowRef('');
const referenceImageDataUrl = shallowRef('');
const result = shallowRef<ImageImportResult | null>(null);
const previewAssetUrls = shallowRef<ReadonlyMap<string, string>>(new Map());
const previewNodeAssetIds = shallowRef<ReadonlyMap<string, string>>(new Map());
const dragging = shallowRef(false);
const input = shallowRef<HTMLInputElement | null>(null);
let disposed = false;
const previewData = computed(() => result.value ? createMockData(result.value.pageDsl, result.value.entityFields) : {});
const importedLayerCount = computed(() => result.value ? countLayers(result.value.pageDsl.nodes) : 0);
const importedFrameCount = computed(() => result.value ? countLayers(result.value.pageDsl.nodes, true) : 0);
const previewDsl = computed(() => result.value ? {
  ...result.value.pageDsl,
  nodes: imageAssetsToNodes(result.value.pageDsl.nodes, previewNodeAssetIds.value, new Map((result.value.imageRegions ?? []).map((region) => [region.nodeId, region.alt])))
} : null);

function countLayers(nodes: readonly UiNode[], framesOnly = false): number {
  return nodes.reduce((count, node) => count + (framesOnly ? Number(node.type === 'Frame') : 1) +
    countLayers(node.children, framesOnly) + node.slots.reduce((slotCount, slot) =>
      slotCount + ('children' in slot ? countLayers(slot.children, framesOnly) : 0), 0), 0);
}

function clearPreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

function clearImageRegionPreviews(): void {
  for (const objectUrl of previewAssetUrls.value.values()) URL.revokeObjectURL(objectUrl);
  previewAssetUrls.value = new Map();
  previewNodeAssetIds.value = new Map();
}

function chooseFile(nextFile?: File): void {
  if (!nextFile || pending.value || applying.value) return;
  clearPreview();
  clearImageRegionPreviews();
  file.value = null;
  result.value = null;
  referenceImageDataUrl.value = '';
  try {
    validateDesignReferenceFile(nextFile);
    file.value = nextFile;
    previewUrl.value = URL.createObjectURL(nextFile);
    result.value = null;
    error.value = '';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '图片格式不受支持。';
  }
}

onMounted(() => {
  if (!props.initialFile) return;
  chooseFile(props.initialFile);
  if (file.value) void convert();
});

function onFileChange(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLInputElement) chooseFile(target.files?.[0]);
}

function onDrop(event: DragEvent): void {
  if (pending.value || applying.value) return;
  dragging.value = false;
  chooseFile(event.dataTransfer?.files[0]);
}

/** High-resolution detail tiles are optional: an older import module may not provide them. */
function detailTileHelper(): ((source: File) => Promise<Awaited<ReturnType<typeof imageImport.prepareDesignReferenceDetailTiles>>>) | null {
  try {
    return typeof imageImport.prepareDesignReferenceDetailTiles === 'function' ? imageImport.prepareDesignReferenceDetailTiles : null;
  } catch {
    return null;
  }
}

async function convert(): Promise<void> {
  if (!file.value || pending.value) return;
  pending.value = true;
  error.value = '';
  clearImageRegionPreviews();
  result.value = null;
  try {
    const imageDataUrl = await prepareDesignReferenceImage(file.value);
    if (disposed) return;
    referenceImageDataUrl.value = imageDataUrl;
    const detailImages = await detailTileHelper()?.(file.value) ?? [];
    if (disposed) return;
    const imported = await convertImageToDsl({
      imageDataUrl,
      ...(detailImages.length ? { detailImages } : {}),
      pageType: pageType.value,
      ...(instruction.value.trim() ? { instruction: instruction.value.trim() } : {})
    });
    if (disposed) return;
    let previews: ImageRegionPreview[] = [];
    try {
      previews = await createImageRegionPreviews(imageDataUrl, imported.imageRegions ?? []);
    } catch {
      error.value = '部分图片区暂时无法显示裁片预览；应用页面时仍会由服务端处理。';
    }
    if (disposed) {
      previews.forEach((preview) => URL.revokeObjectURL(preview.objectUrl));
      return;
    }
    previewAssetUrls.value = new Map(previews.map((preview) => [preview.temporaryAssetId, preview.objectUrl]));
    previewNodeAssetIds.value = new Map(previews.map((preview) => [preview.nodeId, preview.temporaryAssetId]));
    result.value = imported;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '图片转换失败，请稍后重试。';
  } finally {
    pending.value = false;
  }
}

function imageAssetsToNodes(nodes: readonly UiNode[], assets: ReadonlyMap<string, string>, alts: ReadonlyMap<string, string>): UiNode[] {
  return nodes.map((node) => {
    const assetId = assets.get(node.id);
    const nextNode: UiNode = assetId && node.type === 'Shape' && node.props.shape === 'rectangle'
      ? { ...node, type: 'Image', props: { assetId, alt: alts.get(node.id) ?? '参考图图片区域', fit: 'cover', aspectRatio: 'auto' } }
      : node;
    return {
      ...nextNode,
      children: imageAssetsToNodes(nextNode.children, assets, alts),
      slots: nextNode.slots.map((slot) => 'children' in slot
        ? { ...slot, children: imageAssetsToNodes(slot.children, assets, alts) }
        : { ...slot })
    };
  });
}

async function apply(): Promise<void> {
  if (!result.value || applying.value || disposed) return;
  applying.value = true;
  error.value = '';
  try {
    const imported = result.value;
    const imageRegions = imported.imageRegions ?? [];
    const targetPageId = props.currentPageId || imported.pageDsl.pageId;
    const targetPageDsl = { ...imported.pageDsl, pageId: targetPageId };
    const saved = imageRegions.length
      ? await saveImportedImageRegions({ pageId: targetPageId, pageDsl: targetPageDsl, imageDataUrl: referenceImageDataUrl.value, regions: imageRegions })
      : { assets: [] };
    if (disposed) return;
    const assetMap = new Map(saved.assets.map((asset) => [asset.nodeId, asset.assetId]));
    const expectedIds = imageRegions.map((region) => region.nodeId);
    if (expectedIds.some((nodeId) => !assetMap.has(nodeId)) || assetMap.size !== expectedIds.length) {
      throw new Error('图片素材返回不完整，当前画布没有修改。请重试转换。');
    }
    const altMap = new Map(imageRegions.map((region) => [region.nodeId, region.alt]));
    const candidate = validatePageDsl({
      ...targetPageDsl,
      nodes: imageAssetsToNodes(imported.pageDsl.nodes, assetMap, altMap)
    }, imported.entityFields);
    if (!candidate.ok) throw new Error('图片转换结果校验失败，当前画布没有修改。请重新生成。');
    emit('apply', { pageDsl: candidate.dsl, entityFields: imported.entityFields });
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '图片素材保存失败，当前画布没有修改。';
  } finally {
    applying.value = false;
  }
}

onScopeDispose(() => {
  disposed = true;
  clearPreview();
  clearImageRegionPreviews();
  referenceImageDataUrl.value = '';
});
</script>

<template>
  <div class="image-import-backdrop" data-testid="image-import-backdrop" @click.self="!pending && !applying && emit('close')">
    <section class="image-import-panel" role="dialog" aria-modal="true" aria-labelledby="image-import-title" @keydown.esc="!pending && !applying && emit('close')">
      <header class="image-import-header">
        <div class="image-import-heading">
          <span class="image-import-kicker">FIGMA WORKFLOW · IMAGE TO UI-DSL</span>
          <h2 id="image-import-title">从设计图创建可编辑页面</h2>
          <p>上传界面截图，AI 会识别版式、图层、文字和图片区域，生成可继续编辑、预览和导出的 UI-DSL。</p>
        </div>
        <button class="image-import-close" type="button" aria-label="关闭图片导入" :disabled="pending || applying" @click="emit('close')"><StudioIcon name="close" /></button>
      </header>

      <div class="image-import-content">
        <section class="image-import-source" aria-label="设计图输入">
          <div class="image-import-section-title"><span>01</span><h3>参考设计图</h3></div>
          <input ref="input" class="image-import-file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择设计图" :disabled="pending || applying" @change="onFileChange" />
          <button
            type="button"
            class="image-import-dropzone"
            :class="{ 'is-dragging': dragging, 'has-image': previewUrl }"
            data-testid="image-import-dropzone"
            :disabled="pending || applying"
            @click="input?.click()"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <img v-if="previewUrl" :src="previewUrl" alt="待转换的设计图预览" />
            <template v-else>
              <span class="upload-icon" aria-hidden="true">↑</span>
              <strong>拖入截图或点击选择文件</strong>
              <small>PNG、JPEG、WebP · 最大 20 MB</small>
            </template>
          </button>
          <p v-if="file" class="image-import-filename" :title="file.name">{{ file.name }}</p>

          <label class="image-import-label" for="image-import-kind">页面类型</label>
          <select id="image-import-kind" v-model="pageType" class="image-import-select" :disabled="pending || applying">
            <option value="auto">自动识别</option>
            <option value="website">企业官网</option>
            <option value="admin">管理平台</option>
          </select>
          <label class="image-import-label" for="image-import-instruction">转换要求 <span>可选</span></label>
          <textarea id="image-import-instruction" v-model="instruction" rows="3" maxlength="1000" placeholder="例如：保留蓝白色风格，优先还原左侧导航和统计卡片。" :disabled="pending || applying"></textarea>
          <p class="image-import-privacy">整图与最多两块原图高清细节会发送到当前配置的视觉模型识别。应用页面时只保存识别到的图片裁片，整张截图不会作为页面素材保存。</p>
          <p v-if="error" class="image-import-error" role="alert">{{ error }}</p>
          <button class="image-import-generate" type="button" data-testid="image-import-generate" :disabled="!file || pending || applying" @click="convert">
            <span v-if="pending" class="image-import-spinner" aria-hidden="true"></span>{{ pending ? '正在识别并生成 DSL…' : result ? '重新生成 DSL' : '生成可编辑页面' }}
          </button>
        </section>

        <section class="image-import-result" aria-label="UI-DSL 页面预览" :aria-busy="pending">
          <div class="image-import-section-title"><span>02</span><h3>预览生成结果</h3><b v-if="result" class="valid-badge">DSL 校验通过</b></div>
          <div v-if="result" class="image-import-preview" data-testid="image-import-result" :aria-busy="applying">
            <header><strong>{{ result.pageDsl.title }}</strong><span>{{ importedLayerCount }} 个图层 · {{ importedFrameCount }} 个画框 · {{ result.entityFields.length }} 个数据字段</span></header>
            <div class="image-import-render"><PreviewPanel :dsl="previewDsl ?? result.pageDsl" :data="previewData" :external-asset-urls="previewAssetUrls" artboard-mode /></div>
            <ul v-if="result.notes.length" class="image-import-notes" aria-label="识别说明">
              <li v-for="(note, index) in result.notes" :key="`${index}-${note}`">{{ note }}</li>
            </ul>
          </div>
          <div v-else class="image-import-empty" :class="{ 'is-pending': pending }">
            <div class="empty-artboard" aria-hidden="true"><span></span><i></i><i></i><i></i></div>
            <strong>{{ pending ? '正在分析图片结构' : '生成后在这里检查页面' }}</strong>
            <p>{{ pending ? '识别文字、布局和样式，然后通过 UI-DSL 校验。' : '结果会先显示在预览中，确认后才替换当前画布。' }}</p>
          </div>
        </section>
      </div>

      <footer class="image-import-footer">
        <p>接受后会替换当前画布内容；识别到的图片区域会保存为页面素材，并保留撤销、重做、图层编辑和发布门禁。</p>
        <div><button type="button" class="image-import-cancel" :disabled="pending || applying" @click="emit('close')">取消</button><button type="button" class="image-import-apply" data-testid="image-import-apply" :disabled="!result || pending || applying" @click="apply">{{ applying ? '正在保存图片素材…' : '应用到画布' }}</button></div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.image-import-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(22,30,42,.44);backdrop-filter:blur(3px)}
.image-import-panel{display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:min(1120px,100%);max-height:min(820px,calc(100vh - 48px));overflow:hidden;border:1px solid #d9d9d9;border-radius:12px;background:#fff;box-shadow:0 24px 80px rgba(13,30,55,.24);color:#1f1f1f}
.image-import-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 26px 18px;border-bottom:1px solid #f0f0f0}
.image-import-kicker{color:#1677ff;font-size:10px;font-weight:700;letter-spacing:.11em}
.image-import-heading h2{margin:6px 0 4px;font-size:20px;font-weight:600;letter-spacing:-.02em}
.image-import-heading p{max-width:700px;margin:0;color:#737b86;font-size:13px;line-height:1.6}
.image-import-close{width:30px;height:30px;border:0;border-radius:6px;background:transparent;color:#767e88;font-size:22px;line-height:1;cursor:pointer}.image-import-close:hover{background:#f3f5f7;color:#1f1f1f}
.image-import-content{display:grid;grid-template-columns:350px minmax(0,1fr);min-height:0;overflow:auto}
.image-import-source{padding:20px 22px;border-right:1px solid #f0f0f0}
.image-import-section-title{display:flex;align-items:center;gap:9px;min-height:28px;margin-bottom:14px}.image-import-section-title>span{display:grid;width:22px;height:22px;place-items:center;border-radius:6px;background:#e6f4ff;color:#1677ff;font-size:11px;font-weight:700}.image-import-section-title h3{margin:0;font-size:14px;font-weight:600}.image-import-file-input{display:none}
.image-import-dropzone{display:flex;width:100%;min-height:160px;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:12px;border:1px dashed #c8d0da;border-radius:8px;background:#fafbfd;color:#4b5563;cursor:pointer;transition:border-color .15s,background .15s}.image-import-dropzone:hover,.image-import-dropzone.is-dragging{border-color:#1677ff;background:#f0f7ff}.image-import-dropzone.has-image{height:192px;border-style:solid;background:#f3f5f7}.image-import-dropzone img{width:100%;height:100%;object-fit:contain}.upload-icon{display:grid;width:34px;height:34px;place-items:center;border:1px solid #d7e7ff;border-radius:9px;background:#fff;color:#1677ff;font-size:21px}.image-import-dropzone strong{font-size:13px;font-weight:500}.image-import-dropzone small{color:#9299a2;font-size:11px}.image-import-filename{margin:5px 0 0;overflow:hidden;color:#747d88;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.image-import-label{display:block;margin:16px 0 6px;color:#5d6672;font-size:12px;font-weight:600}.image-import-label span{margin-left:4px;color:#a0a6ad;font-weight:400}.image-import-select,.image-import-source textarea{width:100%;min-height:36px;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#262626;font:inherit;font-size:12px}.image-import-source textarea{min-height:72px;resize:vertical;line-height:1.5}.image-import-select:focus,.image-import-source textarea:focus{border-color:#4096ff;outline:3px solid rgba(22,119,255,.12)}.image-import-privacy{margin:10px 0;color:#89919b;font-size:11px;line-height:1.55}.image-import-error{margin:8px 0;padding:8px 10px;border:1px solid #ffccc7;border-radius:6px;background:#fff2f0;color:#a8071a;font-size:12px;line-height:1.5}.image-import-generate,.image-import-apply{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:0 14px;border:1px solid #1677ff;border-radius:6px;background:#1677ff;color:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.image-import-generate{width:100%;margin-top:8px}.image-import-generate:hover:not(:disabled),.image-import-apply:hover:not(:disabled){border-color:#4096ff;background:#4096ff}.image-import-generate:disabled,.image-import-apply:disabled{border-color:#d9d9d9;background:#f5f5f5;color:#b6b6b6;cursor:not-allowed}.image-import-spinner{width:13px;height:13px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .75s linear infinite}
.image-import-result{display:flex;min-width:0;min-height:420px;flex-direction:column;padding:20px 22px;background:#f6f7f9}.image-import-result .image-import-section-title{flex:none}.image-import-section-title .valid-badge{margin-left:auto;padding:4px 8px;border:1px solid #b7eb8f;border-radius:20px;background:#f6ffed;color:#389e0d;font-size:10px;font-weight:600}.image-import-preview{display:flex;min-height:0;flex:1;flex-direction:column;overflow:hidden;border:1px solid #e1e4e8;border-radius:8px;background:#fff}.image-import-preview>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #f0f0f0}.image-import-preview>header strong{font-size:12px}.image-import-preview>header span{color:#8c959f;font-size:10px}.image-import-render{min-height:240px;flex:1;overflow:auto;padding:22px;background-color:#f0f2f5;background-image:radial-gradient(#ccd1d8 .7px,transparent .7px);background-size:16px 16px}.image-import-render :deep(.preview-panel){width:max-content;min-width:min(100%,720px);margin:0 auto;box-shadow:0 8px 32px rgba(25,39,56,.13)}.image-import-notes{display:grid;gap:4px;max-height:78px;overflow:auto;margin:0;padding:9px 14px;border-top:1px solid #f0f0f0;list-style:none}.image-import-notes li{color:#77808a;font-size:10px;line-height:1.45}.image-import-notes li::before{content:'·';margin-right:6px;color:#1677ff}
.image-import-empty{display:grid;align-content:center;justify-items:center;flex:1;min-height:300px;border:1px dashed #d4d9e0;border-radius:8px;background:rgba(255,255,255,.7);text-align:center}.image-import-empty>strong{margin-top:18px;color:#39424c;font-size:13px;font-weight:600}.image-import-empty>p{max-width:280px;margin:6px 0 0;color:#89919b;font-size:11px;line-height:1.5}.empty-artboard{position:relative;width:154px;height:92px;padding:13px;border:1px solid #dfe4eb;border-radius:7px;background:#fff;box-shadow:0 6px 18px rgba(30,45,60,.06)}.empty-artboard span{display:block;width:35%;height:8px;margin-bottom:8px;border-radius:4px;background:#dbeaff}.empty-artboard i{display:inline-block;width:29%;height:48px;margin-right:5%;border-radius:5px;background:#f1f4f8}.empty-artboard i:first-of-type{width:29%;background:#e8f3ff}.empty-artboard i:last-of-type{margin-right:0}
.image-import-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 22px;border-top:1px solid #f0f0f0;background:#fff}.image-import-footer p{margin:0;color:#858d97;font-size:11px;line-height:1.4}.image-import-footer>div{display:flex;flex:none;gap:8px}.image-import-cancel{min-height:36px;padding:0 14px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#454d57;font:inherit;font-size:12px;cursor:pointer}.image-import-cancel:hover{border-color:#91caff;color:#1677ff}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:760px){.image-import-backdrop{padding:8px}.image-import-panel{max-height:calc(100vh - 16px)}.image-import-header{padding:16px}.image-import-content{grid-template-columns:1fr}.image-import-source{border-right:0;border-bottom:1px solid #f0f0f0}.image-import-result{min-height:400px;padding:16px}.image-import-footer{align-items:flex-start;flex-direction:column;padding:12px 16px}.image-import-footer>div{align-self:flex-end}.image-import-dropzone.has-image{height:150px}}
@media(prefers-reduced-motion:reduce){.image-import-spinner{animation-duration:1.5s}}
</style>
