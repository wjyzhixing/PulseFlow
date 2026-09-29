<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onScopeDispose, shallowRef, useTemplateRef } from 'vue';
import { getImageAsset, getImageAssetDataUrl, IMAGE_ASSET_IDS, type ComponentType, type EntityField, type NodeDesign, type PageDsl } from '@pulseflow/ui-dsl';
import type { StudioFile, StudioFilePage, StudioFileSummary } from '@pulseflow/contracts';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { beginDraftSave, editDraftSession, finishDraftSaveFailure, getDraftSession, markDraftSaved, restoreDraftSession, setDraft, type DraftSession } from '../draft/draft-store';
import { isDraftRevisionCurrent } from '../draft/draft-store';
import { generateImageAsset, getDraftRevision, refineCurrentDraft, saveDraft, uploadImageAsset, type ImagePlan } from '../draft/draft-api';
import PublishPanel from '../publish/PublishPanel.vue';
import { PublicationProjectGateError, publishStudioProject, type GateResult, type ProjectPageResult } from '../publish/publication-api';
import ComponentPalette, { type PaletteItem } from './ComponentPalette.vue';
import AssetsPanel, { type StudioImageAsset } from './AssetsPanel.vue';
import LayersPanel from './LayersPanel.vue';
import DesignCanvas from './DesignCanvas.vue';
import EntityFieldEditor from './EntityFieldEditor.vue';
import DesignInspector from './DesignInspector.vue';
import VariablesPanel from './VariablesPanel.vue';
import PrototypeInspector from './PrototypeInspector.vue';
import { useImageAssets } from '../preview/use-image-assets';
import { createMockData } from '../preview/mock-handlers';
import { componentTypes, containerTypes, createDesignStore, type DesignEntityField, type DesignShapeType, type DesignStore, type NodeAlignmentBounds } from './design-store';
import DesignChatPanel, { type DesignChatMessage, type ImageAction, type ImageReview } from './DesignChatPanel.vue';
import DslExportPanel from './DslExportPanel.vue';
import StudioFileExportPanel from './StudioFileExportPanel.vue';
import ImageToDslPanel from './ImageToDslPanel.vue';
import PagesPanel from './PagesPanel.vue';
import StudioIcon from './StudioIcon.vue';
import SkillManagerPanel from '../skills/SkillManagerPanel.vue';
import StudioFileTabs from './StudioFileTabs.vue';
import { cloneStudioFilePage, createStudioFile, listStudioFiles, loadLatestStudioFile, loadStudioFile, updateStudioFile, type StudioFileInput } from './studio-file-api';
import { isDesignNodeLocked, type NodeClipboardEntry } from './design-commands';
import { readCanvasVisualRect, type CanvasVisualRect } from './canvas-geometry';
import { prepareDesignReferenceImage } from './image-import';

const DslMonacoEditor = defineAsyncComponent(() => import('./DslMonacoEditor.vue'));

const router = useRouter();
const studioRoot = useTemplateRef<HTMLDivElement>('studioRoot');
const store = shallowRef<DesignStore | null>(null);
interface StudioPage { id: string; store: DesignStore; session: DraftSession }
const studioPages = shallowRef<StudioPage[]>([]);
const activeStudioPageId = shallowRef('');
const studioFileTitle = shallowRef('');
const studioFileTabs = shallowRef<StudioFileSummary[]>([]);
const studioFileRevision = shallowRef<number | null>(null);
const studioLoading = shallowRef(false);
const fileSwitchPending = shallowRef(false);
const studioLoadError = shallowRef('');
const studioSaveState = shallowRef<'saving' | 'saved' | 'error'>('saved');
const resourcePanel = shallowRef<'file' | 'assets' | 'tools' | 'variables'>('file');
const inspectorPanel = shallowRef<'design' | 'prototype' | 'fields'>('design');
const resourcePanelWidth = shallowRef(330);
const inspectorPanelWidth = shallowRef(335);
const resizingPanel = shallowRef<'resource' | 'inspector' | null>(null);
const panelResizeStart = shallowRef<{ x: number; width: number } | null>(null);
const panelWidthStorageKey = 'pulseflow-studio-panel-widths-v1';
const actionFeedback = shallowRef('');
const actionFailed = shallowRef(false);
const copiedNodes = shallowRef<NodeClipboardEntry[]>([]);
const fieldFeedback = shallowRef('');
const fieldFailed = shallowRef(false);
const publishPending = shallowRef(false);
const publishError = shallowRef('');
const publishedVersionId = shallowRef('');
const publishGates = shallowRef<GateResult[]>([]);
const projectPageResults = shallowRef<ProjectPageResult[]>([]);
const chatMessages = shallowRef<DesignChatMessage[]>([]);
const chatPending = shallowRef(false);
const chatInputResetKey = shallowRef(0);
const imageReviewState = shallowRef<ImageReview>();
const imagePlan = shallowRef<ImagePlan>();
const reviewAssetId = shallowRef<string>();
const generatedAssetIds = shallowRef<string[]>([]);
const imageActionPending = shallowRef(false);
const assetUploadPending = shallowRef(false);
const assetUploadError = shallowRef('');
const dslEditorOpen = shallowRef(false);
const dslExportOpen = shallowRef(false);
const projectExportOpen = shallowRef(false);
const skillManagerOpen = shallowRef(false);
const imageImportOpen = shallowRef(false);
const chatImageImport = shallowRef<{ file: File; instruction: string } | null>(null);
const publishPanelOpen = shallowRef(false);
const availableAssetIds = computed(() => {
  const ids = new Set(generatedAssetIds.value);
  const visit = (nodes: readonly { props: Record<string, unknown>; children: readonly unknown[]; slots: readonly unknown[] }[]) => {
    for (const node of nodes) {
      for (const key of ['assetId', 'backgroundAssetId']) {
        const id = node.props[key];
        if (typeof id === 'string' && /^asset-[A-Za-z0-9_-]+$/.test(id)) ids.add(id);
      }
      visit(node.children as typeof nodes);
      for (const slot of node.slots) if (slot && typeof slot === 'object' && 'children' in slot) visit((slot as { children: typeof nodes }).children);
    }
  };
  if (store.value) visit(store.value.dsl.value.nodes as typeof store.value.dsl.value.nodes);
  return [...ids];
});
const pageEntries = computed(() => studioPages.value.map(({ id, store: pageStore }) => ({ id, title: pageStore.dsl.value.title })));
const studioProjectForExport = computed(() => studioFileInput());
const { urls: imageUrls } = useImageAssets(availableAssetIds);
const usedAssetIds = computed(() => {
  const ids = new Set<string>();
  const visit = (nodes: readonly { props: Record<string, unknown>; children: readonly unknown[]; slots: readonly unknown[] }[]) => {
    for (const node of nodes) {
      for (const key of ['assetId', 'backgroundAssetId']) {
        const id = node.props[key];
        if (typeof id === 'string') ids.add(id);
      }
      visit(node.children as typeof nodes);
      for (const slot of node.slots) if (slot && typeof slot === 'object' && 'children' in slot) visit((slot as { children: typeof nodes }).children);
    }
  };
  if (store.value) visit(store.value.dsl.value.nodes as typeof store.value.dsl.value.nodes);
  return ids;
});
const imageAssetEntries = computed<StudioImageAsset[]>(() => {
  const builtinNames: Record<string, string> = {
    'asset-workflow': '团队工作流',
    'asset-analytics': '数据分析',
    'asset-collaboration': '团队协作'
  };
  const ids = [...new Set([...IMAGE_ASSET_IDS, ...availableAssetIds.value])];
  const generatedIndex = new Map(availableAssetIds.value.filter((id) => !getImageAsset(id)).map((id, index) => [id, index + 1]));
  return ids.map((id) => ({
    id,
    name: builtinNames[id] ?? `生成图片 ${generatedIndex.get(id) ?? ''}`,
    url: getImageAssetDataUrl(id) ?? imageUrls.value[id],
    used: usedAssetIds.value.has(id)
  }));
});
const assetActionLabel = computed(() => {
  const selected = store.value?.selectedNode.value;
  if (selected?.type === 'Image') return '替换图片';
  if (selected?.type === 'Hero' || selected?.type === 'ContentSection') return '设为背景';
  return '添加到画布';
});
const imageReview = computed<ImageReview | undefined>(() => imageReviewState.value && {
  ...imageReviewState.value,
  ...(reviewAssetId.value && imageUrls.value[reviewAssetId.value] ? { imageUrl: imageUrls.value[reviewAssetId.value] } : {})
});
const previewData = computed(() => store.value ? createMockData(store.value.dsl.value, store.value.entityFields) : {});
const chatTargetLabel = computed(() => {
  const currentStore = store.value;
  if (!currentStore) return '整页';
  const ids = currentStore.selectedNodeIds.value;
  if (!ids.length) return '整页';
  if (ids.length > 1) return `${ids.length} 个选中图层`;
  const node = findDesignNode(ids[0]!, currentStore.dsl.value.nodes);
  if (!node) return '已选图层';
  const props = node.props as Record<string, unknown>;
  const name = node.design?.name ?? [props.name, props.title, props.text, props.label].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return name ? `${name} · ${node.type}` : node.type;
});
const paletteLabels: Record<ComponentType, [string, string]> = {
  Frame: ['画框', '基础布局容器'], Text: ['文字', '排版文本'], Shape: ['形状', '矩形、椭圆或线条'],
  Card: ['卡片', '内容容器'], PageHeader: ['页头', '页面标题'], Form: ['表单', '字段容器'], FormItem: ['表单项', '绑定字段'],
  Input: ['输入框', '文本录入'], Select: ['选择器', '选项录入'], Button: ['按钮', '触发动作'], Table: ['数据表', '字段列表'],
  Row: ['行', '栅格容器'], Col: ['列', '栅格单元'], Tag: ['标签', '短状态'], Badge: ['徽标', '状态提示'],
  SiteNavigation: ['网站导航', '官网导航栏'], Hero: ['首屏介绍', '标题与行动入口'], ContentSection: ['内容区块', '带标题的页面区块'],
  FeatureCard: ['功能卡片', '图标与功能说明'], MetricCard: ['指标卡', '名称、数值与趋势'],
  CallToAction: ['行动区块', '高对比转化入口'], Image: ['图片素材', '选择内置素材']
};
const paletteItems: PaletteItem[] = componentTypes.map((type) => ({ type, label: paletteLabels[type][0], hint: paletteLabels[type][1] }));
let studioFileSaveTimer: ReturnType<typeof setTimeout> | null = null;
let studioFileSaveInProgress = false;
let studioFileSaveQueued = false;
let studioFileSavePromise: Promise<boolean> | null = null;
let studioFileSavedFingerprint: string | null = null;
let studioDisposed = false;

function isPublishedEdit(): boolean {
  const current = getDraftSession();
  return Boolean(publishedVersionId.value || (publishPending.value && current?.saved && !current.saving));
}

function startNewDraft(pageDsl: PageDsl, entityFields: readonly DesignEntityField[]): void {
  const current = getDraftSession();
  if (current) setDraft({ pageDsl, entityFields: entityFields.map((field) => ({ ...field, rules: field.rules.map((rule) => rule.kind === 'enum' ? { ...rule, values: [...rule.values] } : { ...rule }) })), semanticQuestions: current.questions }, current.fileId);
  publishedVersionId.value = '';
  publishGates.value = [];
  projectPageResults.value = [];
}

function captureActivePage(): void {
  const current = getDraftSession();
  if (!current || !activeStudioPageId.value) return;
  studioPages.value = studioPages.value.map((page) => page.id === activeStudioPageId.value
    ? { ...page, session: { ...current, questions: current.questions.map((question) => ({ ...question })) } }
    : page);
  scheduleStudioFileSave();
}

function studioFileInput(): StudioFileInput | null {
  const current = getDraftSession();
  const active = studioPages.value.find((page) => page.id === activeStudioPageId.value);
  if (!current || !active || studioPages.value.length === 0) return null;
  const pages: StudioFilePage[] = studioPages.value.map((page) => cloneStudioFilePage({
    id: page.id,
    pageDsl: JSON.parse(JSON.stringify(page.store.dsl.value)) as PageDsl,
    entityFields: [...page.store.entityFields],
    semanticQuestions: page.id === activeStudioPageId.value
      ? current.questions
      : page.session.questions
  }));
  return { id: current.fileId, title: studioFileTitle.value || active.store.dsl.value.title, activePageId: active.id, pages };
}

function fingerprintStudioFile(input: StudioFileInput): string {
  return JSON.stringify(input);
}

function scheduleStudioFileSave(): void {
  if (!store.value || studioPages.value.length === 0) return;
  studioSaveState.value = 'saving';
  if (studioFileSaveTimer) clearTimeout(studioFileSaveTimer);
  studioFileSaveTimer = setTimeout(() => {
    studioFileSaveTimer = null;
    void saveStudioFile();
  }, 300);
}

async function saveStudioFile(): Promise<boolean> {
  if (studioFileSaveInProgress) {
    studioFileSaveQueued = true;
    return studioFileSavePromise ?? false;
  }
  studioFileSaveInProgress = true;
  studioFileSavePromise = (async () => {
    let savedAll = true;
    do {
      studioFileSaveQueued = false;
      const input = studioFileInput();
      if (!input) break;
      const fingerprint = fingerprintStudioFile(input);
      if (studioFileRevision.value !== null && fingerprint === studioFileSavedFingerprint) {
        studioSaveState.value = 'saved';
        continue;
      }
      try {
        const saved = studioFileRevision.value === null
          ? await createStudioFile(input)
          : await updateStudioFile(input, studioFileRevision.value);
        studioFileRevision.value = saved.revision;
        studioFileSavedFingerprint = fingerprint;
        studioSaveState.value = 'saved';
        studioFileTabs.value = [
          { id: saved.id, title: saved.title, revision: saved.revision, updatedAt: saved.updatedAt },
          ...studioFileTabs.value.filter((file) => file.id !== saved.id)
        ].slice(0, 12);
      } catch (error) {
        studioSaveState.value = 'error';
        actionFeedback.value = error instanceof Error ? `项目保存失败：${error.message}` : '项目保存失败，请检查连接后重试。';
        actionFailed.value = true;
        savedAll = false;
      }
    } while (studioFileSaveQueued);
    return savedAll;
  })().finally(() => {
    studioFileSaveInProgress = false;
    studioFileSavePromise = null;
  });
  return studioFileSavePromise;
}

async function flushStudioFileSave(): Promise<boolean> {
  if (studioPages.value.length === 0) return true;
  if (studioFileSaveTimer) {
    clearTimeout(studioFileSaveTimer);
    studioFileSaveTimer = null;
  }
  return saveStudioFile();
}

function createPageSession(fileId: string, page: StudioFilePage): DraftSession {
  return {
    id: `draft-${crypto.randomUUID()}`,
    fileId,
    fieldsText: JSON.stringify(page.entityFields, null, 2),
    dslText: JSON.stringify(page.pageDsl, null, 2),
    questions: page.semanticQuestions.map((question) => ({ ...question })),
    revision: 0,
    dirty: true,
    saved: false,
    saving: false
  };
}

function restoreStudioFile(file: StudioFile): void {
  const pageContexts = file.pages.map((page) => {
    const session = createPageSession(file.id, cloneStudioFilePage(page));
    return {
      id: page.id,
      session,
      store: createPageStore(session.dslText ? JSON.parse(session.dslText) as PageDsl : page.pageDsl, page.entityFields)
    };
  });
  const active = pageContexts.find((page) => page.id === file.activePageId) ?? pageContexts[0];
  if (!active) throw new Error('Studio 文件没有可打开的页面');
  studioPages.value = pageContexts;
  studioFileTitle.value = file.title;
  activeStudioPageId.value = active.id;
  store.value = active.store;
  restoreDraftSession(active.session);
  studioFileRevision.value = file.revision;
  const restoredInput = studioFileInput();
  studioFileSavedFingerprint = restoredInput ? fingerprintStudioFile(restoredInput) : null;
  resourcePanel.value = 'file';
}

async function refreshStudioFileTabs(): Promise<void> {
  try {
    const files = await listStudioFiles();
    const active = getDraftSession();
    const includesActive = active && files.some((file) => file.id === active.fileId);
    studioFileTabs.value = active && !includesActive
      ? [{ id: active.fileId, title: studioFileTitle.value, revision: studioFileRevision.value ?? 1, updatedAt: '' }, ...files].slice(0, 12)
      : files;
  } catch {
    const active = getDraftSession();
    if (active) studioFileTabs.value = [{ id: active.fileId, title: studioFileTitle.value, revision: studioFileRevision.value ?? 1, updatedAt: '' }];
  }
}

function resetFileTransientState(): void {
  chatMessages.value = [];
  chatInputResetKey.value += 1;
  imageReviewState.value = undefined;
  imagePlan.value = undefined;
  reviewAssetId.value = undefined;
  generatedAssetIds.value = [];
  publishedVersionId.value = '';
  publishGates.value = [];
  projectPageResults.value = [];
  actionFeedback.value = '';
  actionFailed.value = false;
}

async function openStudioFile(fileId: string): Promise<void> {
  if (!store.value || fileId === getDraftSession()?.fileId || studioLoading.value || fileSwitchPending.value || publishPending.value || chatPending.value || imageActionPending.value || assetUploadPending.value) return;
  fileSwitchPending.value = true;
  try {
    const pendingEdit = store.value.flushSourceBuffer();
    if (pendingEdit && !pendingEdit.ok) {
      actionFeedback.value = '当前 UI-DSL 有错误，请先修复后再切换文件。';
      actionFailed.value = true;
      return;
    }
    captureActivePage();
    if (!await flushStudioFileSave()) {
      actionFeedback.value = '当前文件保存失败，已取消切换。请检查连接后重试。';
      actionFailed.value = true;
      return;
    }
    const file = await loadStudioFile(fileId);
    if (!file) throw new Error('这个设计文件已不存在或无法访问。');
    restoreStudioFile(file);
    resetFileTransientState();
    await refreshStudioFileTabs();
  } catch (error) {
    actionFeedback.value = error instanceof Error ? `切换文件失败：${error.message}` : '切换文件失败，请重试。';
    actionFailed.value = true;
  } finally {
    fileSwitchPending.value = false;
  }
}

async function createNewStudioFile(): Promise<void> {
  if (fileSwitchPending.value || publishPending.value || chatPending.value || imageActionPending.value || assetUploadPending.value) return;
  fileSwitchPending.value = true;
  try {
    captureActivePage();
    if (!await flushStudioFileSave()) {
      actionFeedback.value = '当前文件保存失败，无法新建设计文件。';
      actionFailed.value = true;
      return;
    }
    await router.push('/requirements');
  } finally {
    fileSwitchPending.value = false;
  }
}

function createPageStore(pageDsl: PageDsl, entityFields: readonly DesignEntityField[]): DesignStore {
  return createDesignStore({
    dsl: pageDsl,
    entityFields,
    onDslChange: onDesignDslChange,
    onEntityFieldsChange,
    onDraftChange: onDesignDraftChange
  });
}

function onDesignDslChange(pageDsl: PageDsl, source: string): void {
  const currentFields = store.value?.entityFields ?? [];
  if (isPublishedEdit()) startNewDraft(pageDsl, currentFields);
  else editDraftSession({ dslText: source, fieldsText: JSON.stringify(currentFields, null, 2) });
  captureActivePage();
}

function onEntityFieldsChange(fields: readonly DesignEntityField[]): void {
  if (!store.value) return;
  const pageDsl = JSON.parse(JSON.stringify(store.value.dsl.value)) as PageDsl;
  if (isPublishedEdit()) startNewDraft(pageDsl, fields);
  else editDraftSession({ fieldsText: JSON.stringify(fields, null, 2) });
  captureActivePage();
}

function onDesignDraftChange(pageDsl: PageDsl, source: string, fields: readonly DesignEntityField[]): void {
  if (isPublishedEdit()) startNewDraft(pageDsl, fields);
  else editDraftSession({ dslText: source, fieldsText: JSON.stringify(fields, null, 2) });
  captureActivePage();
}

function applyImportedDesign(payload: { pageDsl: PageDsl; entityFields: readonly DesignEntityField[] }): void {
  const openedFromChat = Boolean(chatImageImport.value);
  if (!store.value?.replaceDraft(payload.pageDsl, payload.entityFields)) {
    actionFeedback.value = '转换结果未通过 UI-DSL 校验，当前画布未修改。';
    actionFailed.value = true;
    return;
  }
  imageImportOpen.value = false;
  chatImageImport.value = null;
  resourcePanel.value = 'file';
  if (openedFromChat) addChatMessage({ role: 'assistant', text: '参考图已转换并应用到画布。页面结构通过 UI-DSL 校验，你可以继续在画布或对话中调整。' });
  else chatMessages.value = [];
  imageReviewState.value = undefined;
  imagePlan.value = undefined;
  reviewAssetId.value = undefined;
  generatedAssetIds.value = [];
  publishedVersionId.value = '';
  publishGates.value = [];
  projectPageResults.value = [];
  actionFeedback.value = `设计图已转换为 ${countDslNodes(payload.pageDsl.nodes)} 个可编辑图层；UI-DSL 校验通过。`;
  actionFailed.value = false;
}

function startImageImportFromChat(payload: { file: File; instruction: string }): void {
  chatImageImport.value = payload;
  addChatMessage({ role: 'user', text: payload.instruction || '请将这张参考图转换成可编辑页面。', scope: `参考图 · ${payload.file.name}` });
  imageImportOpen.value = true;
}

function closeImageImport(): void {
  if (chatImageImport.value) addChatMessage({ role: 'assistant', tone: 'muted', text: '图片转换已取消，当前画布保持不变。' });
  imageImportOpen.value = false;
  chatImageImport.value = null;
}

function countDslNodes(nodes: readonly unknown[]): number {
  let count = 0;
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    const item = node as { children?: unknown; slots?: unknown };
    count += 1;
    if (Array.isArray(item.children)) pending.push(...item.children);
    if (Array.isArray(item.slots)) {
      for (const slot of item.slots) if (slot && typeof slot === 'object' && 'children' in slot && Array.isArray(slot.children)) pending.push(...slot.children);
    }
  }
  return count;
}

function initializeDraft(draft: DraftSession): void {
  try {
    const parsedDsl = JSON.parse(draft.dslText) as Parameters<typeof createDesignStore>[0]['dsl'];
    const parsedFields = JSON.parse(draft.fieldsText) as DesignEntityField[];
    resourcePanel.value = 'file';
    const pageStore = createPageStore(parsedDsl, parsedFields);
    const pageId = `studio-page-${crypto.randomUUID()}`;
    studioFileTitle.value = parsedDsl.title;
    store.value = pageStore;
    studioPages.value = [{ id: pageId, store: pageStore, session: { ...draft, questions: draft.questions.map((question) => ({ ...question })) } }];
    activeStudioPageId.value = pageId;
    studioFileRevision.value = null;
    studioFileSavedFingerprint = null;
    scheduleStudioFileSave();
  } catch {
    studioLoadError.value = '当前草稿无法打开，请返回草稿确认步骤修复 DSL。';
  }
}

async function initialize(): Promise<void> {
  studioLoading.value = true;
  studioLoadError.value = '';
  const current = getDraftSession();
  try {
    if (current) {
      try {
        const existing = await loadStudioFile(current.fileId);
        if (studioDisposed) return;
        if (existing) {
          restoreStudioFile(existing);
          void refreshStudioFileTabs();
          return;
        }
      } catch { /* Continue with the current in-memory draft when project storage is unavailable. */ }
      initializeDraft(current);
      return;
    }
    const latest = await loadLatestStudioFile();
    if (studioDisposed) return;
    if (latest) {
      restoreStudioFile(latest);
      void refreshStudioFileTabs();
      return;
    }
    void router.replace('/requirements');
  } catch (error) {
    studioLoadError.value = error instanceof Error ? error.message : '无法载入 Studio 文件。';
  } finally {
    studioLoading.value = false;
  }
}
void initialize();

function persistPanelWidths(): void {
  try {
    localStorage.setItem(panelWidthStorageKey, JSON.stringify({ resource: resourcePanelWidth.value, inspector: inspectorPanelWidth.value }));
  } catch { /* Keep the current session widths when browser storage is unavailable. */ }
}

function resizePanel(kind: 'resource' | 'inspector', event: PointerEvent): void {
  const start = panelResizeStart.value;
  if (!start || resizingPanel.value !== kind) return;
  const delta = event.clientX - start.x;
  const direction = kind === 'resource' ? 1 : -1;
  const width = Math.max(kind === 'resource' ? 220 : 260, Math.min(kind === 'resource' ? 480 : 440, start.width + delta * direction));
  if (kind === 'resource') resourcePanelWidth.value = width;
  else inspectorPanelWidth.value = width;
  persistPanelWidths();
}

function beginPanelResize(kind: 'resource' | 'inspector', event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  resizingPanel.value = kind;
  panelResizeStart.value = { x: event.clientX, width: kind === 'resource' ? resourcePanelWidth.value : inspectorPanelWidth.value };
  window.addEventListener('pointermove', onPanelResizeMove);
  window.addEventListener('pointerup', endPanelResize, { once: true });
  window.addEventListener('pointercancel', endPanelResize, { once: true });
}

function onPanelResizeMove(event: PointerEvent): void {
  if (resizingPanel.value) resizePanel(resizingPanel.value, event);
}

function endPanelResize(): void {
  resizingPanel.value = null;
  panelResizeStart.value = null;
  window.removeEventListener('pointermove', onPanelResizeMove);
  window.removeEventListener('pointerup', endPanelResize);
  window.removeEventListener('pointercancel', endPanelResize);
}

function nudgePanel(kind: 'resource' | 'inspector', event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 24 : 8) * (kind === 'resource' ? 1 : -1);
  if (kind === 'resource') resourcePanelWidth.value = Math.max(220, Math.min(480, resourcePanelWidth.value + delta));
  else inspectorPanelWidth.value = Math.max(260, Math.min(440, inspectorPanelWidth.value + delta));
  persistPanelWidths();
}

function updateColorVariables(variables: Array<{ id: string; name: string; value: string }>): void {
  if (!store.value) return;
  updatePageProps({ theme: { ...store.value.dsl.value.theme, colorVariables: variables } });
}

function restorePanelWidths(): void {
  try {
    const raw = localStorage.getItem(panelWidthStorageKey);
    if (!raw) return;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return;
    const widths = value as { resource?: unknown; inspector?: unknown };
    if (typeof widths.resource === 'number' && Number.isFinite(widths.resource)) resourcePanelWidth.value = Math.max(220, Math.min(480, widths.resource));
    if (typeof widths.inspector === 'number' && Number.isFinite(widths.inspector)) inspectorPanelWidth.value = Math.max(260, Math.min(440, widths.inspector));
  } catch { /* Ignore invalid or unavailable browser storage. */ }
}

onScopeDispose(() => {
  studioDisposed = true;
  endPanelResize();
  if (studioFileSaveTimer) clearTimeout(studioFileSaveTimer);
});

function selectStudioPage(pageId: string): void {
  if (pageId === activeStudioPageId.value || !store.value || publishPending.value || chatPending.value || imageActionPending.value) return;
  const pendingEdit = store.value.flushSourceBuffer();
  if (pendingEdit && !pendingEdit.ok) {
    actionFeedback.value = '当前 UI-DSL 有错误，请先修复后再切换页面。';
    actionFailed.value = true;
    return;
  }
  captureActivePage();
  const target = studioPages.value.find((page) => page.id === pageId);
  if (!target?.session) return;
  restoreDraftSession(target.session);
  store.value = target.store;
  activeStudioPageId.value = target.id;
  resourcePanel.value = 'file';
  chatMessages.value = [];
  chatInputResetKey.value += 1;
  imageReviewState.value = undefined;
  imagePlan.value = undefined;
  reviewAssetId.value = undefined;
  generatedAssetIds.value = [];
  publishedVersionId.value = '';
  publishGates.value = [];
  projectPageResults.value = [];
  actionFeedback.value = '';
  actionFailed.value = false;
  scheduleStudioFileSave();
}

function renameStudioPage(pageId: string, rawTitle: string): void {
  if (pageId !== activeStudioPageId.value || !store.value || publishPending.value || chatPending.value || imageActionPending.value) return;
  const title = rawTitle.trim();
  if (!title || title.length > 120 || /[<>]|javascript\s*:|\bon\w+\s*=/i.test(title)) {
    actionFeedback.value = '页面名称不能为空，且不能包含标记或脚本内容。';
    actionFailed.value = true;
    return;
  }
  const duplicate = pageEntries.value.some((page) => page.id !== pageId && page.title.toLocaleLowerCase() === title.toLocaleLowerCase());
  if (duplicate) {
    actionFeedback.value = '已有同名页面，请为当前页面选择其他名称。';
    actionFailed.value = true;
    return;
  }
  if (store.value.dsl.value.title === title) return;
  const renamed = store.value.updatePage({ title });
  actionFeedback.value = renamed ? `页面已重命名为“${title}”` : '页面名称未保存，请检查当前 UI-DSL。';
  actionFailed.value = !renamed;
}

function reorderStudioPage(payload: { sourcePageId: string; targetPageId: string; placement: 'before' | 'after' }): void {
  if (publishPending.value || chatPending.value || imageActionPending.value || payload.sourcePageId === payload.targetPageId) return;
  const source = studioPages.value.find((page) => page.id === payload.sourcePageId);
  if (!source) return;
  const remaining = studioPages.value.filter((page) => page.id !== payload.sourcePageId);
  const targetIndex = remaining.findIndex((page) => page.id === payload.targetPageId);
  if (targetIndex < 0) return;
  const insertionIndex = targetIndex + (payload.placement === 'after' ? 1 : 0);
  studioPages.value = [...remaining.slice(0, insertionIndex), source, ...remaining.slice(insertionIndex)];
  actionFeedback.value = '页面顺序已调整并保存';
  actionFailed.value = false;
  scheduleStudioFileSave();
}

function addStudioPage(): void {
  if (!store.value || publishPending.value || chatPending.value || imageActionPending.value) return;
  const pendingEdit = store.value.flushSourceBuffer();
  if (pendingEdit && !pendingEdit.ok) {
    actionFeedback.value = '当前 UI-DSL 有错误，请先修复后再添加页面。';
    actionFailed.value = true;
    return;
  }
  captureActivePage();
  const currentSession = getDraftSession();
  if (!currentSession) return;
  const existingPageNames = new Set(pageEntries.value.map((page) => page.title));
  let index = studioPages.value.length + 1;
  while (existingPageNames.has(`Page ${index}`)) index += 1;
  const activeTheme = store.value.dsl.value.theme;
  const pageDsl: PageDsl = {
    schemaVersion: 1,
    pageId: `page-${crypto.randomUUID()}`,
    title: `Page ${index}`,
    pageKind: store.value.dsl.value.pageKind,
    ...(activeTheme ? { theme: { colorScheme: activeTheme.colorScheme, cornerStyle: activeTheme.cornerStyle, colorVariables: activeTheme.colorVariables?.map((variable) => ({ ...variable })) } } : {}),
    nodes: []
  };
  const entityFields = store.value.entityFields.map((field) => ({ ...field, rules: field.rules.map((rule) => rule.kind === 'enum' ? { ...rule, values: [...rule.values] } : { ...rule }) }));
  setDraft({ pageDsl, entityFields, semanticQuestions: currentSession.questions.map((question) => ({ ...question })) }, currentSession.fileId);
  const pageStore = createPageStore(pageDsl, entityFields);
  const pageId = `studio-page-${crypto.randomUUID()}`;
  const session = getDraftSession();
  if (!session) return;
  studioPages.value = [...studioPages.value, { id: pageId, store: pageStore, session }];
  activeStudioPageId.value = pageId;
  store.value = pageStore;
  resourcePanel.value = 'file';
  chatMessages.value = [];
  chatInputResetKey.value += 1;
  imageReviewState.value = undefined;
  imagePlan.value = undefined;
  reviewAssetId.value = undefined;
  generatedAssetIds.value = [];
  publishedVersionId.value = '';
  publishGates.value = [];
  projectPageResults.value = [];
  actionFeedback.value = '新页面已创建。该页面拥有独立的 UI-DSL 和撤销历史。';
  actionFailed.value = false;
  scheduleStudioFileSave();
}

function onHistoryKeyDown(event: KeyboardEvent): void {
  if (fileSwitchPending.value) return;
  const target = event.target;
  if (target instanceof HTMLElement && (
    target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    Boolean(target.closest('[role="textbox"], .monaco-editor'))
  )) return;
  const isCommand = (event.metaKey || event.ctrlKey) && !event.altKey;
  if (isCommand) {
    const key = event.key.toLowerCase();
    if (key === 'g' && store.value) {
      event.preventDefault();
      if (event.shiftKey) ungroupSelectedNode();
      else groupSelectedNodes();
      return;
    }
    if (key === 'c' && store.value?.selectedNodeIds.value.length) {
      event.preventDefault();
      copySelectedNodes();
      return;
    }
    if (key === 'v' && copiedNodes.value.length && store.value) {
      event.preventDefault();
      pasteCopiedNodes();
      return;
    }
    if (key === 'd' && store.value?.selectedNodeIds.value.length) {
      event.preventDefault();
      duplicateSelectedNodes();
      return;
    }
    if (key === 'z' && event.shiftKey || key === 'y') {
      if (!store.value?.canRedo.value) return;
      event.preventDefault();
      store.value.redo();
      return;
    }
    if (key === 'z' && !event.shiftKey) {
      if (!store.value?.canUndo.value) return;
      event.preventDefault();
      store.value.undo();
      return;
    }
  }
  if (event.shiftKey && event.key.toLowerCase() === 'a' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    autoLayoutSelectedNodes();
    return;
  }
  if (target instanceof HTMLElement && target.closest('[role="button"], [role="tab"], [role="menuitem"], button, a[href]')) return;
  const nudgeDirections: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
  };
  const direction = nudgeDirections[event.key];
  if (direction && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const selectedNodeIds = store.value?.selectedNodeIds.value ?? [];
    if (!selectedNodeIds.length) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    nudgeSelectedLayers(direction[0] * step, direction[1] * step);
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const nodeIds = store.value?.selectedNodeIds.value ?? [];
    if (!nodeIds.length || !store.value) return;
    event.preventDefault();
    if (nodeIds.some((nodeId) => isDesignNodeLocked(store.value!.dsl.value.nodes, nodeId))) {
      actionFeedback.value = '锁定图层无法删除，请先在图层面板解锁。';
      actionFailed.value = true;
      return;
    }
    const removed = store.value.removeNodes(nodeIds);
    actionFeedback.value = removed ? nodeIds.length === 1 ? '已删除所选图层，可使用撤销恢复' : `已删除 ${nodeIds.length} 个所选图层，可使用撤销恢复` : '图层删除失败';
    actionFailed.value = !removed;
    return;
  }
}

function copySelectedNodes(): void {
  const currentStore = store.value;
  if (!currentStore) return;
  const copied = currentStore.copyNodes(currentStore.selectedNodeIds.value);
  if (!copied.length) return;
  copiedNodes.value = copied;
  actionFeedback.value = copied.length === 1 ? '已复制图层，可粘贴创建副本' : `已复制 ${copied.length} 个图层，可粘贴创建副本`;
  actionFailed.value = false;
}

function pasteCopiedNodes(): void {
  const currentStore = store.value;
  if (!currentStore || !copiedNodes.value.length) return;
  const result = currentStore.pasteNodes(copiedNodes.value);
  actionFeedback.value = result.ok ? `已粘贴 ${result.nodeIds.length} 个图层并通过 UI-DSL 校验` : result.reason;
  actionFailed.value = !result.ok;
}

function duplicateSelectedNodes(): void {
  const currentStore = store.value;
  if (!currentStore) return;
  const result = currentStore.duplicateNodes(currentStore.selectedNodeIds.value);
  actionFeedback.value = result.ok ? `已重复 ${result.nodeIds.length} 个图层并通过 UI-DSL 校验` : result.reason;
  actionFailed.value = !result.ok;
}

function duplicateNodesAt(updates: readonly { nodeId: string; position: NonNullable<NodeDesign['position']> }[]): void {
  const currentStore = store.value;
  if (!currentStore) return;
  const result = currentStore.duplicateNodesAt(updates);
  actionFeedback.value = result.ok ? `已复制并移动 ${result.nodeIds.length} 个图层` : result.reason ?? '复制图层失败';
  actionFailed.value = !result.ok;
}

function duplicateFlowNodesAt(payload: { nodeIds: string[]; parentId: string; index: number }): void {
  const currentStore = store.value;
  if (!currentStore) return;
  const result = currentStore.duplicateFlowNodesAt(payload.nodeIds, { parentId: payload.parentId, index: payload.index });
  actionFeedback.value = result.ok ? `已复制 ${result.nodeIds.length} 个流式图层并通过 UI-DSL 校验` : result.reason ?? '复制图层失败';
  actionFailed.value = !result.ok;
}

function groupSelectedNodes(): void {
  const currentStore = store.value;
  if (!currentStore) return;
  const selectedIds = currentStore.selectedNodeIds.value;
  const geometries = selectedIds.flatMap((nodeId) => {
    const node = findDesignNode(nodeId, currentStore.dsl.value.nodes);
    const geometry = node ? readAlignmentGeometry(nodeId, node) : null;
    return geometry ? [{ nodeId, x: geometry.localX, y: geometry.localY, width: geometry.width, height: geometry.height, parentTransform: geometry.parentTransform }] : [];
  });
  const result = currentStore.groupNodes(selectedIds, geometries);
  actionFeedback.value = result.ok ? `已组合 ${result.nodeIds.length} 个图层并保存到 UI-DSL` : result.reason;
  actionFailed.value = !result.ok;
}

function autoLayoutSelectedNodes(): void {
  const currentStore = store.value;
  if (!currentStore) return;
  const selectedIds = currentStore.selectedNodeIds.value;
  const geometries = selectedIds.flatMap((nodeId) => {
    const node = findDesignNode(nodeId, currentStore.dsl.value.nodes);
    const geometry = node ? readAlignmentGeometry(nodeId, node) : null;
    return geometry ? [{ nodeId, x: geometry.localX, y: geometry.localY, width: geometry.width, height: geometry.height, parentTransform: geometry.parentTransform }] : [];
  });
  const result = currentStore.autoLayoutNodes(selectedIds, geometries);
  actionFeedback.value = result.ok ? `已将 ${result.nodeIds.length} 个图层转换为自动布局 Frame，并通过 UI-DSL 校验` : result.reason;
  actionFailed.value = !result.ok;
}

function ungroupSelectedNode(): void {
  const currentStore = store.value;
  const nodeId = currentStore?.selectedNodeId.value;
  if (!currentStore || !nodeId) return;
  const result = currentStore.ungroupNode(nodeId);
  actionFeedback.value = result.ok ? `已取消组合并还原 ${result.nodeIds.length} 个图层` : result.reason;
  actionFailed.value = !result.ok;
}

function nudgeSelectedLayers(deltaX: number, deltaY: number): void {
  const currentStore = store.value;
  const root = studioRoot.value;
  if (!currentStore || !root) return;
  const selectedIds = currentStore.selectedNodeIds.value;
  const nodesById = new Map<string, (typeof currentStore.dsl.value.nodes)[number]>();
  const visit = (nodes: readonly (typeof currentStore.dsl.value.nodes)[number][]): void => {
    nodes.forEach((node) => {
      nodesById.set(node.id, node);
      visit(node.children);
      node.slots.forEach((slot) => { if ('children' in slot) visit(slot.children); });
    });
  };
  visit(currentStore.dsl.value.nodes);
  const page = root.querySelector<HTMLElement>('.pulseflow-page');
  const pageRect = page?.getBoundingClientRect();
  if (!page || !pageRect) return;
  const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-pf-node-id]'));
  const updates = selectedIds.flatMap((nodeId) => {
    const node = nodesById.get(nodeId);
    const element = elements.find((candidate) => candidate.dataset.pfNodeId === nodeId);
    if (!node || !element || isDesignNodeLocked(currentStore.dsl.value.nodes, node.id) || node.design?.visible === false) return [];
    const elementRect = element.getBoundingClientRect();
    const rect = elementRect.width > 0 && elementRect.height > 0
      ? elementRect
      : element.firstElementChild?.getBoundingClientRect() ?? elementRect;
    const parentElement = element.parentElement?.closest<HTMLElement>('[data-pf-node-id]') ?? page;
    const parentRect = parentElement.getBoundingClientRect();
    const stage = element.closest('.canvas-stage');
    const transform = stage ? window.getComputedStyle(stage).transform : 'none';
    const matrix = transform.match(/^matrix\(([^,]+),\s*([^,]+)/);
    const scale = matrix ? Math.hypot(Number(matrix[1]), Number(matrix[2])) : 1;
    if (!Number.isFinite(scale) || scale <= 0) return [];
    const position = node.design?.position;
    const flowPosition = measureFlowPosition(node, element, rect, parentRect, scale);
    const x = position?.mode === 'absolute' ? position.x : flowPosition.x;
    const y = position?.mode === 'absolute' ? position.y : flowPosition.y;
    return [{ nodeId, patch: { position: {
      mode: 'absolute' as const,
      x: Math.max(-8192, Math.min(8192, x + deltaX)),
      y: Math.max(-8192, Math.min(8192, y + deltaY))
    } } }];
  });
  if (!updates.length) return;
  const updated = currentStore.updateNodesDesign(updates);
  actionFeedback.value = updated ? `已移动 ${updates.length} 个图层并通过 UI-DSL 校验` : '图层微移未保存：请检查锁定状态或设计属性范围';
  actionFailed.value = !updated;
}

function measureFlowPosition(
  node: ReadonlyCanvasNode,
  element: HTMLElement,
  rect: CanvasVisualRect,
  parentRect: DOMRect,
  scale: number
): { x: number; y: number } {
  const dimension = (axis: 'width' | 'height'): number => {
    const designSize = node.design?.size?.[axis];
    if (typeof designSize === 'number') return designSize;
    const cssSize = Number.parseFloat(window.getComputedStyle(element)[axis]);
    return Number.isFinite(cssSize) && cssSize > 0 ? cssSize : rect[axis] / scale;
  };
  const width = dimension('width');
  const height = dimension('height');
  const radians = (node.design?.rotation ?? 0) * Math.PI / 180;
  const visualWidth = width * Math.abs(Math.cos(radians)) + height * Math.abs(Math.sin(radians));
  const visualHeight = width * Math.abs(Math.sin(radians)) + height * Math.abs(Math.cos(radians));
  return {
    x: Math.round((rect.left - parentRect.left) / scale + (visualWidth - width) / 2),
    y: Math.round((rect.top - parentRect.top) / scale + (visualHeight - height) / 2)
  };
}

onMounted(() => {
  restorePanelWidths();
  document.addEventListener('keydown', onHistoryKeyDown);
});
onScopeDispose(() => document.removeEventListener('keydown', onHistoryKeyDown));
onBeforeRouteLeave(async () => {
  if (studioPages.value.length === 0) return true;
  const session = getDraftSession();
  if (session?.saved && session.dirty && !session.saving && !window.confirm('草稿有未发布的修改，确定离开设计页面吗？')) return false;
  const saved = await flushStudioFileSave();
  return saved || window.confirm('项目文件暂时无法同步，仍要离开吗？');
});

function addChatMessage(message: Omit<DesignChatMessage, 'id'>): void {
  chatMessages.value = [...chatMessages.value, { ...message, id: crypto.randomUUID() }];
}

async function refineCurrentPage(instruction: string): Promise<void> {
  if (!store.value || chatPending.value || publishPending.value) return;
  const pendingEdit = store.value.flushSourceBuffer();
  if (pendingEdit && !pendingEdit.ok || store.value.diagnostics.value.length) {
    addChatMessage({ role: 'user', text: instruction });
    addChatMessage({ role: 'assistant', tone: 'error', text: '当前 UI-DSL 有错误，请先修复右侧 JSON 编辑器中的诊断，再提交对话修改。' });
    return;
  }
  const session = getDraftSession();
  if (!session) return;
  const targetNodeIds = [...store.value.selectedNodeIds.value];
  if (targetNodeIds.some((nodeId) => isDesignNodeLocked(store.value!.dsl.value.nodes, nodeId))) {
    addChatMessage({ role: 'user', text: instruction, scope: chatTargetLabel.value });
    addChatMessage({ role: 'assistant', tone: 'error', text: '选区中包含已锁定图层，请先在 Layers 面板解锁后再提交修改。' });
    return;
  }
  const submittedRevision = session.revision;
  const pageDsl = JSON.parse(JSON.stringify(store.value.dsl.value)) as PageDsl;
  const entityFields = store.value.entityFields.map((field) => ({
    ...field,
    rules: field.rules.map((rule) => rule.kind === 'enum' ? { ...rule, values: [...rule.values] } : { ...rule })
  }));
  const scope = targetNodeIds.length ? chatTargetLabel.value : undefined;
  addChatMessage({ role: 'user', text: instruction, ...(scope ? { scope } : {}) });
  chatPending.value = true;
  try {
    const serverGuard = session.saved && !session.dirty
      ? { draftId: session.id, expectedRevision: await getDraftRevision(session.id) }
      : {};
    if (!isDraftRevisionCurrent(session.id, submittedRevision)) {
      addChatMessage({ role: 'assistant', tone: 'muted', text: '草稿在提交期间发生变化，请重新发送修改要求。' });
      return;
    }
    const candidate = await refineCurrentDraft({
      instruction,
      entityFields,
      pageDsl,
      semanticQuestions: session.questions.map((question) => ({ ...question })),
      ...(targetNodeIds.length ? { targetNodeIds } : {}),
      ...serverGuard
    });
    if (!isDraftRevisionCurrent(session.id, submittedRevision)) {
      addChatMessage({ role: 'assistant', tone: 'muted', text: '你在等待期间又编辑了页面，因此这次结果没有覆盖当前画布。请基于最新页面重新发送修改要求。' });
      return;
    }
    if (!store.value?.replaceDraft(candidate.pageDsl, candidate.entityFields, targetNodeIds)) {
      addChatMessage({ role: 'assistant', tone: 'error', text: '模型结果未通过当前页面校验，画布保持不变。你可以换一种更明确的描述后重试。' });
      return;
    }
    editDraftSession({ questions: candidate.semanticQuestions.map((question) => ({ ...question })) });
    imagePlan.value = candidate.imagePlan;
    if (candidate.intent === 'needs_confirmation' && candidate.imagePlan) {
      reviewAssetId.value = undefined;
      imageReviewState.value = { status: 'needs_confirmation', message: '请选择图片放置位置后再生成。' };
    } else if (candidate.imageGeneration?.status === 'failed') {
      reviewAssetId.value = undefined;
      imageReviewState.value = { status: 'failed', message: candidate.imageGeneration.error.message };
    } else if (candidate.imageGeneration?.status === 'generated') {
      const asset = candidate.imageGeneration.asset;
      generatedAssetIds.value = [...new Set([...generatedAssetIds.value, asset.assetId])];
      reviewAssetId.value = asset.assetId;
      imageReviewState.value = { status: 'ready', message: candidate.imageGeneration.applied ? '图片已应用到页面。' : candidate.imageGeneration.error?.message };
    } else {
      imageReviewState.value = undefined;
      reviewAssetId.value = undefined;
    }
    addChatMessage({ role: 'assistant', text: candidate.imageGeneration?.status === 'failed'
      ? '页面修改已保存到当前画布；图片生成失败，可在下方重试。'
      : candidate.intent === 'needs_confirmation' ? '页面已更新。请在下方确认图片放置位置。'
        : '页面已更新。你可以继续提出修改，也可以在画布和属性检查器中手动微调。' });
    chatInputResetKey.value += 1;
  } catch (error) {
    addChatMessage({ role: 'assistant', tone: 'error', text: error instanceof Error ? error.message : '页面修改失败，请稍后重试。' });
  } finally {
    chatPending.value = false;
  }
}

async function saveForImageRequest(): Promise<{ draftId: string; expectedRevision: string; localRevision: number } | null> {
  if (!store.value) return null;
  const session = getDraftSession();
  if (!session) return null;
  const localRevision = session.revision;
  if (!session.saved || session.dirty) {
    if (!beginDraftSave(session.id)) return null;
    try {
      const pageDsl = JSON.parse(JSON.stringify(store.value.dsl.value)) as PageDsl;
      const saved = await saveDraft({ id: session.id, pageId: pageDsl.pageId, pageDsl,
        entityFields: [...store.value.entityFields], semanticQuestions: session.questions.map((item) => ({ ...item })), status: 'draft' }, session.saved);
      if (!markDraftSaved(session.id, saved.id, localRevision)) return null;
      captureActivePage();
    } catch (error) {
      finishDraftSaveFailure(session.id);
      throw error;
    }
  }
  const current = getDraftSession();
  if (!current || current.revision !== localRevision) return null;
  const expectedRevision = await getDraftRevision(current.id);
  return isDraftRevisionCurrent(current.id, localRevision)
    ? { draftId: current.id, expectedRevision, localRevision } : null;
}

function findImagePlacement(assetId: string): { placement: 'inline' | 'background'; targetNodeId?: string } | null {
  if (!store.value) return null;
  const pending = [...store.value.dsl.value.nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (node.type === 'Image' && node.props.assetId === assetId) return { placement: 'inline', targetNodeId: node.id };
    if ((node.type === 'Hero' || node.type === 'ContentSection') && node.props.backgroundAssetId === assetId) {
      return { placement: 'background', targetNodeId: node.id };
    }
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return null;
}

function findPageNode(nodeId: string | undefined) {
  if (!store.value || !nodeId) return null;
  const pending = [...store.value.dsl.value.nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (node.id === nodeId) return node;
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return null;
}

async function onImageAction(action: ImageAction): Promise<void> {
  if (!store.value || imageActionPending.value || chatPending.value || publishPending.value) return;
  const assetId = reviewAssetId.value;
  if (action === 'remove') {
    if (assetId) store.value.removeImageAsset(assetId);
    imageReviewState.value = undefined;
    reviewAssetId.value = undefined;
    imagePlan.value = undefined;
    actionFeedback.value = assetId ? '图片已从页面移除' : '已关闭图片预览';
    actionFailed.value = false;
    return;
  }
  const plan = imagePlan.value;
  if (!plan) return;
  if (action === 'regenerate' && imageReviewState.value?.status === 'needs_confirmation') return;
  if (action !== 'regenerate' && imageReviewState.value?.status === 'ready' && assetId) {
    const placement = action === 'apply-background' ? 'background' : 'inline';
    const selected = store.value.selectedNode.value;
    const currentPlacement = findImagePlacement(assetId);
    const plannedNode = findPageNode(plan.targetNodeId);
    const targetNodeId = placement === 'background'
      ? (selected?.type === 'Hero' || selected?.type === 'ContentSection' ? selected.id
        : currentPlacement?.placement === 'background' ? currentPlacement.targetNodeId
          : plannedNode?.type === 'Hero' || plannedNode?.type === 'ContentSection' ? plannedNode.id : undefined)
      : (selected?.type === 'Image' || selected?.type === 'ContentSection' ? selected.id
        : plannedNode?.type === 'Image' || plannedNode?.type === 'ContentSection' ? plannedNode.id : undefined);
    if (placement === 'background' && !targetNodeId) {
      imageReviewState.value = { status: 'ready', message: '请先在画布选择首屏或内容区块，再用作背景。', canReplace: true };
      return;
    }
    if (currentPlacement?.placement === placement &&
        (placement === 'background' ? currentPlacement.targetNodeId === targetNodeId
          : !targetNodeId || currentPlacement.targetNodeId === targetNodeId)) {
      actionFeedback.value = '图片已应用到页面';
      actionFailed.value = false;
      return;
    }
    if (currentPlacement) store.value.removeImageAsset(assetId);
    const applied = store.value.applyImageAsset(assetId, placement, targetNodeId);
    actionFeedback.value = applied ? '图片已应用到页面' : '图片目标无效，请选择合适的页面节点';
    actionFailed.value = !applied;
    if (applied) imagePlan.value = { ...plan, placement, ...(targetNodeId ? { targetNodeId } : {}) };
    return;
  }
  const placement = action === 'regenerate' ? plan.placement : action === 'apply-background' ? 'background' : 'inline';
  const selected = store.value.selectedNode.value;
  const targetNodeId = selected && (placement === 'background'
    ? selected.type === 'Hero' || selected.type === 'ContentSection'
    : selected.type === 'Image' || selected.type === 'ContentSection') ? selected.id : plan.targetNodeId;
  if (placement === 'background' && !targetNodeId) {
    imageReviewState.value = { status: 'failed', message: '请先选择首屏或内容区块，再生成背景图片。' };
    return;
  }
  imageActionPending.value = true;
  imageReviewState.value = { status: 'generating' };
  try {
    const guard = await saveForImageRequest();
    if (!guard || !store.value) throw new Error('草稿在准备图片时发生变化，请重试。');
    const nextPlan: ImagePlan = { prompt: plan.prompt, placement, ...(targetNodeId ? { targetNodeId } : {}) };
    const asset = await generateImageAsset({ pageId: store.value.dsl.value.pageId, imagePlan: nextPlan,
      draftId: guard.draftId, expectedRevision: guard.expectedRevision });
    generatedAssetIds.value = [...new Set([...generatedAssetIds.value, asset.assetId])];
    if (!isDraftRevisionCurrent(guard.draftId, guard.localRevision)) {
      reviewAssetId.value = asset.assetId;
      imageReviewState.value = { status: 'ready', message: '页面在生成期间已变化；请确认目标后应用图片。' };
      return;
    }
    const applied = assetId && action === 'regenerate'
      ? store.value.replaceImageAsset(assetId, asset.assetId) || store.value.applyImageAsset(asset.assetId, placement, targetNodeId)
      : store.value.applyImageAsset(asset.assetId, placement, targetNodeId);
    reviewAssetId.value = asset.assetId;
    imagePlan.value = nextPlan;
    imageReviewState.value = { status: 'ready', message: applied ? '图片已应用到页面。' : '图片已生成，请确认页面目标后应用。', canReplace: Boolean(assetId) };
  } catch (error) {
    imageReviewState.value = { status: 'failed', message: error instanceof Error ? error.message : '图片生成失败，请重试。' };
  } finally {
    imageActionPending.value = false;
  }
}

function addNode(type: ComponentType) {
  if (!store.value) return;
  const selected = store.value.selectedNode.value;
  const selectedAcceptsNode = selected && (containerTypes.has(selected.type) ||
    (selected.type === 'PageHeader' && (type === 'Tag' || type === 'Badge')));
  const parentId = selectedAcceptsNode ? selected.id : null;
  const tagSlot = selected?.slots.find((slot) => slot.name === 'tags');
  const index = parentId ? selected?.type === 'PageHeader' && tagSlot && 'children' in tagSlot
    ? tagSlot.children.length : selected?.children.length ?? 0 : store.value.dsl.value.nodes.length;
  addNodeAt(type, { parentId, index });
}

function applyLibraryAsset(assetId: string): void {
  if (!store.value || publishPending.value) return;
  const selected = store.value.selectedNode.value;
  const targetNodeId = selected?.type === 'Image' || selected?.type === 'Hero' || selected?.type === 'ContentSection'
    ? selected.id
    : undefined;
  const placement = selected?.type === 'Hero' || selected?.type === 'ContentSection' ? 'background' : 'inline';
  const applied = store.value.applyImageAsset(assetId, placement, targetNodeId);
  actionFeedback.value = applied ? (placement === 'background' ? '图片已设为区块背景' : targetNodeId ? '选中图片已替换' : '图片已加入画布') : '图片无法应用到当前选择';
  actionFailed.value = !applied;
}

function dropImageAsset(payload: {
  assetId: string;
  target: { parentId: string | null; index: number };
  position: NonNullable<NodeDesign['position']>;
}): void {
  if (!store.value || publishPending.value) return;
  const asset = imageAssetEntries.value.find((entry) => entry.id === payload.assetId && entry.url);
  if (!asset) {
    actionFeedback.value = '图片素材不可用，请确认素材仍在资源库中。';
    actionFailed.value = true;
    return;
  }
  const inserted = store.value.insertImageAsset(asset.id, asset.name, payload.target, payload.position);
  actionFeedback.value = inserted.ok ? '图片已放入画布并保存到 UI-DSL' : inserted.reason ?? '图片未能放入画布';
  actionFailed.value = !inserted.ok;
}

async function uploadLibraryImage(file: File): Promise<void> {
  if (!store.value || assetUploadPending.value || publishPending.value) return;
  assetUploadPending.value = true;
  assetUploadError.value = '';
  try {
    const imageDataUrl = await prepareDesignReferenceImage(file);
    const guard = await saveForImageRequest();
    if (!guard || !store.value) throw new Error('草稿正在变化，请稍后重新上传。');
    const pageId = store.value.dsl.value.pageId;
    const asset = await uploadImageAsset({ pageId, imageDataUrl, draftId: guard.draftId, expectedRevision: guard.expectedRevision });
    generatedAssetIds.value = [...new Set([...generatedAssetIds.value, asset.assetId])];
    if (!isDraftRevisionCurrent(guard.draftId, guard.localRevision)) {
      assetUploadError.value = '图片已上传，但页面在上传期间发生了变化。可在素材列表中手动应用它。';
      actionFeedback.value = assetUploadError.value;
      actionFailed.value = true;
      return;
    }
    applyLibraryAsset(asset.assetId);
  } catch (error) {
    assetUploadError.value = error instanceof Error ? error.message : '图片上传失败，请重试。';
    actionFeedback.value = assetUploadError.value;
    actionFailed.value = true;
  } finally {
    assetUploadPending.value = false;
  }
}

function placeCanvasTool(payload: { type: 'Frame' | 'Shape' | 'Text' | 'Image'; shape?: DesignShapeType; design: Pick<NodeDesign, 'position' | 'size'>; parentId?: string; index?: number }) {
  if (!store.value) return;
  const parentId = payload.parentId ?? null;
  const parent = parentId ? findPageNode(parentId) : null;
  addNodeAt(payload.type, { parentId, index: payload.index ?? parent?.children.length ?? store.value.dsl.value.nodes.length }, payload.design, payload.shape);
}

function addNodeAt(type: ComponentType, target: { parentId: string | null; index: number; slotName?: 'tags' }, design?: Partial<NodeDesign>, shape?: DesignShapeType) {
  if (!store.value) return;
  const result = store.value.addNodeToTarget(type, target, design, shape);
  const label = paletteLabels[type][0];
  actionFeedback.value = result.ok ? `${label} 已加入画布，页面结构校验通过` : result.reason ?? `${label} 无法加入当前层级，请检查字段绑定或容器类型`;
  actionFailed.value = !result.ok;
}

function addComponentFromCanvas(payload: { type: ComponentType; parentId: string | null; index: number; slotName?: 'tags' }) {
  const { type, ...target } = payload;
  addNodeAt(type, target);
}

function moveNode(payload: { nodeId: string; parentId: string | null; index: number; slotName?: 'tags' }) {
  if (!store.value) return;
  const { nodeId, ...target } = payload;
  const result = store.value.moveNodeToTarget(nodeId, target);
  actionFeedback.value = result.ok ? '图层已移动，页面结构校验通过' : result.reason ?? '节点无法移动到该位置';
  actionFailed.value = !result.ok;
}

function reorderFlowNodes(payload: { nodeIds: string[]; parentId: string; index: number }): void {
  if (!store.value) return;
  const result = store.value.reorderFlowNodes(payload.nodeIds, { parentId: payload.parentId, index: payload.index });
  actionFeedback.value = result.ok ? '流式图层已移动，页面结构校验通过' : result.reason ?? '图层无法移动到此 Frame';
  actionFailed.value = !result.ok;
}

function reparentCanvasNodes(payload: { nodeIds: string[]; parentId: string; positions: Array<{ nodeId: string; position: NonNullable<NodeDesign['position']> }> }): void {
  if (!store.value) return;
  const result = store.value.moveNodesToParent(payload.nodeIds, payload.parentId, payload.positions);
  actionFeedback.value = result.ok ? '图层已移入画框，视觉位置保持不变并通过页面结构校验' : result.reason ?? '图层无法移入此画框';
  actionFailed.value = !result.ok;
}

function selectNode(nodeId: string | null, additive?: boolean): void {
  store.value?.selectNode(nodeId, additive);
}

function selectCanvasNodes(nodeIds: readonly string[], mode: 'replace' | 'add' | 'toggle'): void {
  store.value?.selectNodes(nodeIds, mode);
}

function updateSelectedProps(patch: Record<string, unknown>) {
  if (!store.value?.selectedNodeId.value) return;
  const updated = store.value.updateNodeProps(store.value.selectedNodeId.value, patch);
  actionFeedback.value = updated ? '节点属性已更新' : '属性未保存：输入不符合组件白名单或 DSL 约束';
  actionFailed.value = !updated;
}

function updateTextNode(payload: { nodeId: string; text: string }): void {
  if (!store.value) return;
  const updated = store.value.updateNodeProps(payload.nodeId, { text: payload.text });
  actionFeedback.value = updated ? '画布文字已更新并保存到 UI-DSL' : '文字未保存：内容不符合 UI-DSL 约束';
  actionFailed.value = !updated;
}

function updateSelectedDesign(patch: Partial<NodeDesign>) {
  const currentStore = store.value;
  const selectedIds = currentStore?.selectedNodeIds.value ?? [];
  if (!currentStore || !selectedIds.length) return;
  if (selectedIds.length === 1) {
    const nodeId = selectedIds[0]!;
    const node = findDesignNode(nodeId, currentStore.dsl.value.nodes);
    const enteringAbsolutePosition = patch.position?.mode === 'absolute' && node?.design?.position?.mode !== 'absolute';
    const geometry = enteringAbsolutePosition && node ? readAlignmentGeometry(nodeId, node) : null;
    if (enteringAbsolutePosition && !geometry) {
      actionFeedback.value = '无法读取图层当前位置，定位方式未更改。请在画布中拖动图层后重试。';
      actionFailed.value = true;
      return;
    }
    const nextPatch = geometry && patch.position
      ? { ...patch, position: { ...patch.position, x: Math.round(geometry.localX), y: Math.round(geometry.localY) } }
      : patch;
    updateDesignNode(nodeId, nextPatch);
    return;
  }
  const sharedStyleKeys = new Set(['flipX', 'flipY', 'visible', 'opacity', 'fill', 'fillVariableId', 'stroke', 'strokeWidth', 'cornerRadius', 'typography']);
  if (!Object.keys(patch).every((key) => sharedStyleKeys.has(key))) {
    updateDesignNode(selectedIds[selectedIds.length - 1]!, patch);
    return;
  }
  const primaryNode = findDesignNode(selectedIds[selectedIds.length - 1]!, currentStore.dsl.value.nodes);
  const changedTypography = Object.fromEntries(Object.entries(patch.typography ?? {}).filter(([key, value]) =>
    JSON.stringify(primaryNode?.design?.typography?.[key as keyof NonNullable<NodeDesign['typography']>]) !== JSON.stringify(value)
  ));
  const updates = selectedIds.flatMap((nodeId) => {
    const node = findDesignNode(nodeId, currentStore.dsl.value.nodes);
    const textOnlyPatch = Object.hasOwn(patch, 'typography');
    if (!node || isDesignNodeLocked(currentStore.dsl.value.nodes, nodeId) || textOnlyPatch && node.type !== 'Text') return [];
    const nodePatch = textOnlyPatch
      ? { ...patch, typography: { ...node.design?.typography, ...changedTypography } as NodeDesign['typography'] }
      : patch;
    return [{ nodeId, patch: nodePatch }];
  });
  const updated = updates.length > 0 && currentStore.updateNodesDesign(updates);
  actionFeedback.value = updated ? '所选图层的设计属性已同步并通过 UI-DSL 校验' : '多图层设计属性未保存：请检查锁定状态或设计属性范围';
  actionFailed.value = !updated;
}

function updateDesignNode(nodeId: string, patch: Partial<NodeDesign>) {
  if (!store.value) return;
  const updated = store.value.updateNodeDesign(nodeId, patch);
  actionFeedback.value = updated ? '设计属性已更新并通过 UI-DSL 校验' : '设计属性未保存：数值或颜色超出 UI-DSL 允许范围';
  actionFailed.value = !updated;
}

function connectFrames(payload: { sourceNodeId: string; targetNodeId: string }): void {
  const source = findDesignNode(payload.sourceNodeId, store.value?.dsl.value.nodes ?? []);
  const target = findDesignNode(payload.targetNodeId, store.value?.dsl.value.nodes ?? []);
  if (source?.type !== 'Frame' || target?.type !== 'Frame' || source.id === target.id || isDesignNodeLocked(store.value?.dsl.value.nodes ?? [], source.id)) {
    actionFeedback.value = '只能从未锁定的 Frame 连接到另一个 Frame';
    actionFailed.value = true;
    return;
  }
  const updated = store.value?.updateNodeDesign(source.id, { prototype: { trigger: 'click', targetNodeId: target.id } }) ?? false;
  actionFeedback.value = updated ? `原型连线已保存：${source.design?.name || source.id} → ${target.design?.name || target.id}` : '原型连线未保存：目标 Frame 未通过 UI-DSL 校验';
  actionFailed.value = !updated;
}

function updateDesignNodes(updates: readonly { nodeId: string; patch: Partial<NodeDesign> }[]): void {
  if (!store.value) return;
  const updated = store.value.updateNodesDesign(updates);
  actionFeedback.value = updated ? `已移动 ${updates.length} 个图层并通过 UI-DSL 校验` : '图层移动未保存：请检查锁定状态或设计属性范围';
  actionFailed.value = !updated;
}

function alignSelectedNode(alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') {
  const nodeId = store.value?.selectedNodeId.value;
  if (!nodeId || !store.value) return;
  const selectedIds = store.value.selectedNodeIds.value;
  if (selectedIds.length > 1) {
    alignSelection(selectedIds, alignment);
    return;
  }
  const bounds = readAlignmentBounds(nodeId);
  const updated = store.value.alignNode(nodeId, alignment, bounds);
  actionFeedback.value = updated ? '图层已对齐并保存到 UI-DSL' : '对齐未应用，请检查对象尺寸';
  actionFailed.value = !updated;
}

type AlignmentGeometry = {
  nodeId: string;
  x: number;
  y: number;
  localX: number;
  localY: number;
  width: number;
  height: number;
  parentTransform: LinearTransform;
};

type LinearTransform = { a: number; b: number; c: number; d: number };

function alignSelection(nodeIds: readonly string[], alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'): void {
  const currentStore = store.value;
  if (!currentStore) return;
  const selectedNodes = nodeIds.map((nodeId) => findDesignNode(nodeId, currentStore.dsl.value.nodes));
  const flowSelection = selectedNodes.some((node) => node?.design?.position?.mode !== 'absolute');
  if (flowSelection) {
    if (selectedNodes.some((node) => !node || node.design?.position?.mode === 'absolute')) {
      actionFeedback.value = '自动布局图层与绝对定位图层不能一起对齐';
      actionFailed.value = true;
      return;
    }
    const parents = nodeIds.map((nodeId) => findDesignParent(nodeId, currentStore.dsl.value.nodes));
    const parent = parents[0];
    if (!parent || parent.type !== 'Frame' || parents.some((candidate) => candidate?.id !== parent.id)) {
      actionFeedback.value = '流式图层需位于同一个 Frame 中才能批量对齐';
      actionFailed.value = true;
      return;
    }
    const row = parent.props.direction === 'row';
    const alignSelf: NodeDesign['alignSelf'] = row
      ? alignment === 'top' ? 'start' : alignment === 'center-y' ? 'center' : alignment === 'bottom' ? 'end' : undefined
      : alignment === 'left' ? 'start' : alignment === 'center-x' ? 'center' : alignment === 'right' ? 'end' : undefined;
    if (!alignSelf) {
      actionFeedback.value = '自动布局主轴由图层顺序和 Frame 分布控制';
      actionFailed.value = true;
      return;
    }
    const updates = nodeIds.flatMap((nodeId, index) => {
      const node = selectedNodes[index];
      const fillsCrossAxis = row ? node?.design?.size?.height === 'fill' : node?.design?.size?.width === 'fill';
      return isDesignNodeLocked(currentStore.dsl.value.nodes, nodeId) || fillsCrossAxis
        ? [] : [{ nodeId, patch: { alignSelf } }];
    });
    const updated = updates.length > 0 && currentStore.updateNodesDesign(updates);
    actionFeedback.value = updated ? `已批量设置 ${updates.length} 个流式图层的交叉轴对齐` : '流式图层对齐未保存：请检查锁定状态';
    actionFailed.value = !updated;
    return;
  }
  const geometries = nodeIds.flatMap((nodeId) => {
    const node = findDesignNode(nodeId, currentStore.dsl.value.nodes);
    const geometry = node ? readAlignmentGeometry(nodeId, node) : null;
    return geometry && !isDesignNodeLocked(currentStore.dsl.value.nodes, nodeId) && node?.design?.visible !== false ? [geometry] : [];
  });
  if (geometries.length < 2) {
    actionFeedback.value = '至少需要两个可见且未锁定的图层才能按选区对齐';
    actionFailed.value = true;
    return;
  }
  const left = Math.min(...geometries.map((item) => item.x));
  const top = Math.min(...geometries.map((item) => item.y));
  const right = Math.max(...geometries.map((item) => item.x + item.width));
  const bottom = Math.max(...geometries.map((item) => item.y + item.height));
  const updates = geometries.flatMap((item) => {
    let canvasDeltaX = 0;
    let canvasDeltaY = 0;
    if (alignment === 'left') canvasDeltaX = left - item.x;
    if (alignment === 'center-x') canvasDeltaX = (left + right) / 2 - (item.x + item.width / 2);
    if (alignment === 'right') canvasDeltaX = right - (item.x + item.width);
    if (alignment === 'top') canvasDeltaY = top - item.y;
    if (alignment === 'center-y') canvasDeltaY = (top + bottom) / 2 - (item.y + item.height / 2);
    if (alignment === 'bottom') canvasDeltaY = bottom - (item.y + item.height);
    const { a, b, c, d } = item.parentTransform;
    const deltaX = a * canvasDeltaX + c * canvasDeltaY;
    const deltaY = b * canvasDeltaX + d * canvasDeltaY;
    const x = Math.max(-8192, Math.min(8192, Math.round(item.localX + deltaX)));
    const y = Math.max(-8192, Math.min(8192, Math.round(item.localY + deltaY)));
    if (x === Math.round(item.localX) && y === Math.round(item.localY)) return [];
    return [{ nodeId: item.nodeId, patch: { position: { mode: 'absolute' as const, x, y } } }];
  });
  if (!updates.length) {
    actionFeedback.value = '所选图层已经对齐';
    actionFailed.value = false;
    return;
  }
  const updated = currentStore.updateNodesDesign(updates);
  actionFeedback.value = updated ? `已对齐 ${updates.length} 个图层并通过 UI-DSL 校验` : '多图层对齐未保存：请检查锁定状态或设计属性范围';
  actionFailed.value = !updated;
}

type ReadonlyCanvasNode = NonNullable<DesignStore['selectedNode']['value']>;

function findDesignNode(nodeId: string, nodes: readonly ReadonlyCanvasNode[]): ReadonlyCanvasNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findDesignNode(nodeId, node.children);
    if (child) return child;
    for (const slot of node.slots) {
      if (!('children' in slot)) continue;
      const slotted = findDesignNode(nodeId, slot.children);
      if (slotted) return slotted;
    }
  }
  return null;
}

function findDesignParent(nodeId: string, nodes: readonly ReadonlyCanvasNode[]): ReadonlyCanvasNode | null {
  for (const node of nodes) {
    if (node.children.some((child) => child.id === nodeId)) return node;
    const childParent = findDesignParent(nodeId, node.children);
    if (childParent) return childParent;
    for (const slot of node.slots) {
      if (!('children' in slot)) continue;
      if (slot.children.some((child) => child.id === nodeId)) return node;
      const slotParent = findDesignParent(nodeId, slot.children);
      if (slotParent) return slotParent;
    }
  }
  return null;
}

function readAlignmentGeometry(nodeId: string, node: ReadonlyCanvasNode): AlignmentGeometry | null {
  const root = studioRoot.value;
  const element = Array.from(root?.querySelectorAll<HTMLElement>('[data-pf-node-id]') ?? [])
    .find((candidate) => candidate.dataset.pfNodeId === nodeId);
  const page = root?.querySelector<HTMLElement>('.pulseflow-page');
  if (!element || !page) return null;
  const parent = element.parentElement?.closest<HTMLElement>('[data-pf-node-id]') ?? page;
  const stage = element.closest('.canvas-stage');
  const transform = stage ? window.getComputedStyle(stage).transform : 'none';
  const matrix = transform.match(/^matrix\(([^,]+),\s*([^,]+)/);
  const scale = matrix ? Math.hypot(Number(matrix[1]), Number(matrix[2])) : 1;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const rect = readCanvasVisualRect(node.design?.size, element);
  const pageRect = page.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const parentTransform = readCanvasToParentTransform(element, page);
  if (!parentTransform) return null;
  const localX = node.design?.position?.mode === 'absolute'
    ? node.design.position.x
    : measureFlowPosition(node, element, rect, parentRect, scale).x;
  const localY = node.design?.position?.mode === 'absolute'
    ? node.design.position.y
    : measureFlowPosition(node, element, rect, parentRect, scale).y;
  const width = rect.width > 0 ? rect.width / scale : typeof node.design?.size?.width === 'number' ? node.design.size.width : 0;
  const height = rect.height > 0 ? rect.height / scale : typeof node.design?.size?.height === 'number' ? node.design.size.height : 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const x = (rect.left - pageRect.left) / scale;
  const y = (rect.top - pageRect.top) / scale;
  return { nodeId, localX, localY, x, y, width, height, parentTransform };
}

function readCanvasToParentTransform(element: HTMLElement, page: HTMLElement): LinearTransform | null {
  let parentToCanvas: LinearTransform = { a: 1, b: 0, c: 0, d: 1 };
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== page) {
    const transform = window.getComputedStyle(ancestor).transform;
    const matrix = transform.match(/^matrix\(([^)]+)\)$/);
    if (matrix) {
      const values = matrix[1]!.split(',').map((value) => Number(value.trim()));
      if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return null;
      const [a, b, c, d] = values as [number, number, number, number, number, number];
      parentToCanvas = {
        a: a * parentToCanvas.a + c * parentToCanvas.b,
        b: b * parentToCanvas.a + d * parentToCanvas.b,
        c: a * parentToCanvas.c + c * parentToCanvas.d,
        d: b * parentToCanvas.c + d * parentToCanvas.d
      };
    }
    ancestor = ancestor.parentElement;
  }
  if (ancestor !== page) return null;
  const determinant = parentToCanvas.a * parentToCanvas.d - parentToCanvas.b * parentToCanvas.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) return null;
  return {
    a: parentToCanvas.d / determinant,
    b: -parentToCanvas.b / determinant,
    c: -parentToCanvas.c / determinant,
    d: parentToCanvas.a / determinant
  };
}

function readAlignmentBounds(nodeId: string): NodeAlignmentBounds | undefined {
  const root = studioRoot.value;
  const elements = root?.querySelectorAll<HTMLElement>('[data-pf-node-id]');
  const nodeElement = Array.from(elements ?? []).find((element) => element.dataset.pfNodeId === nodeId);
  const node = findDesignNode(nodeId, store.value?.dsl.value.nodes ?? []);
  const parentElement = nodeElement?.parentElement?.closest<HTMLElement>('[data-pf-node-id]')
    ?? nodeElement?.closest('.pulseflow-page') as HTMLElement | null;
  if (!nodeElement || !parentElement) return undefined;
  const stage = nodeElement.closest('.canvas-stage');
  const transform = stage ? window.getComputedStyle(stage).transform : 'none';
  const matrix = transform.match(/^matrix\(([^,]+),\s*([^,]+)/);
  const scale = matrix ? Math.hypot(Number(matrix[1]), Number(matrix[2])) : 1;
  const nodeRect = nodeElement && node ? readCanvasVisualRect(node.design?.size, nodeElement) : undefined;
  const dimension = (element: HTMLElement, axis: 'width' | 'height', visualRect?: CanvasVisualRect): number | undefined => {
    if (visualRect) {
      const rendered = visualRect[axis] / (Number.isFinite(scale) && scale > 0 ? scale : 1);
      if (rendered > 0) return rendered;
    }
    const computed = Number.parseFloat(window.getComputedStyle(element)[axis]);
    if (Number.isFinite(computed) && computed > 0) return computed;
    const rect = element.getBoundingClientRect();
    const rendered = rect[axis] / (Number.isFinite(scale) && scale > 0 ? scale : 1);
    return rendered > 0 ? rendered : undefined;
  };
  const nodeWidth = dimension(nodeElement, 'width', nodeRect);
  const nodeHeight = dimension(nodeElement, 'height', nodeRect);
  const parentWidth = dimension(parentElement, 'width');
  const parentHeight = dimension(parentElement, 'height');
  return {
    ...(nodeWidth ? { nodeWidth } : {}), ...(nodeHeight ? { nodeHeight } : {}),
    ...(parentWidth ? { parentWidth } : {}), ...(parentHeight ? { parentHeight } : {})
  };
}

function updatePageProps(patch: Partial<Pick<PageDsl, 'title' | 'pageKind' | 'theme'>>) {
  if (!store.value) return;
  const updated = store.value.updatePage(patch);
  actionFeedback.value = updated ? '页面设置已更新' : '页面设置未保存，请检查页面名称和页面用途';
  actionFailed.value = !updated;
}

function addEntityField() {
  if (!store.value) return;
  try {
    const added = store.value.addEntityField();
    fieldFeedback.value = `${added.label} 已添加`;
    fieldFailed.value = false;
  } catch {
    fieldFeedback.value = '字段未添加，请检查当前 UI-DSL';
    fieldFailed.value = true;
  }
}

function updateEntityField(id: string, patch: Partial<Pick<DesignEntityField, 'key' | 'label' | 'type' | 'rules'>>) {
  if (!store.value) return;
  const updated = store.value.updateEntityField(id, patch);
  fieldFeedback.value = updated ? '字段已更新' : '字段未保存：检查字段键、名称、类型与校验规则';
  fieldFailed.value = !updated;
}

function removeEntityField(id: string) {
  if (!store.value) return;
  const removed = store.value.removeEntityField(id);
  fieldFeedback.value = removed ? '字段已移除' : '字段仍被页面组件引用，无法移除';
  fieldFailed.value = !removed;
}

async function publish() {
  if (!store.value || publishPending.value) return;
  publishError.value = '';
  publishGates.value = [];
  projectPageResults.value = [];
  const pendingEdit = store.value.flushSourceBuffer();
  if (pendingEdit && !pendingEdit.ok || store.value.diagnostics.value.length) {
    publishError.value = '请先修正 DSL 编辑器中的错误';
    publishGates.value = [{ id: 'dsl', status: 'failed', blocking: true,
      diagnostics: store.value.diagnostics.value.map((item) => ({ code: item.code, path: item.path, message: item.message })) }];
    return;
  }
  const session = getDraftSession();
  if (!session || !beginDraftSave(session.id)) return;
  publishPending.value = true;
  try {
    const pageDsl = JSON.parse(JSON.stringify(store.value.dsl.value)) as PageDsl;
    const entityFields = JSON.parse(session.fieldsText) as EntityField[];
    const saved = await saveDraft({ id: session.id, pageId: pageDsl.pageId, pageDsl, entityFields,
      semanticQuestions: session.questions.map((question) => ({ ...question })), status: 'confirmed' }, session.saved);
    if (!markDraftSaved(session.id, saved.id, session.revision)) {
      publishError.value = '设计在保存期间发生变化，请重新发布';
      return;
    }
    captureActivePage();
    if (!await flushStudioFileSave() || studioFileRevision.value === null) {
      publishError.value = '项目页面尚未保存成功，请重试';
      return;
    }
    const project = await publishStudioProject(session.fileId, studioFileRevision.value);
    projectPageResults.value = project.publications.map((publication) => ({ pageId: publication.pageId,
      status: 'passed', gates: publication.gates, versionId: publication.versionId }));
    publishedVersionId.value = project.publications.map((publication) => publication.versionId).join('、');
    if (getDraftSession()?.id !== saved.id) actionFeedback.value = `项目 ${project.title} 的全部 ${project.publications.length} 个页面已发布`;
  } catch (error) {
    finishDraftSaveFailure(session.id);
    if (error instanceof PublicationProjectGateError) {
      projectPageResults.value = error.pages;
      publishGates.value = error.pages.flatMap((page) => page.gates);
    }
    publishError.value = error instanceof Error ? error.message : '发布失败，请重试';
  } finally { publishPending.value = false; }
}
</script>

<template>
  <p v-if="studioLoading" class="studio-loading" role="status">正在载入 Studio 文件…</p>
  <p v-else-if="studioLoadError" class="studio-load-error" role="alert">{{ studioLoadError }}</p>
  <div v-if="store" ref="studioRoot" class="design-studio" :aria-busy="fileSwitchPending">
    <header class="editor-tabbar" aria-label="设计文件栏" :inert="fileSwitchPending">
      <div class="editor-brand" aria-label="PulseFlow Studio"><span aria-hidden="true">P</span></div>
      <StudioFileTabs :files="studioFileTabs" :active-file-id="getDraftSession()?.fileId ?? ''" :disabled="studioLoading || fileSwitchPending || studioSaveState === 'saving' || assetUploadPending" @select="openStudioFile" @create="createNewStudioFile" />
    </header>
    <div v-if="fileSwitchPending" class="file-switch-overlay" role="status">正在保存并切换设计文件…</div>
    <header class="design-header editor-topbar" :inert="fileSwitchPending">
      <div class="editor-document">
        <span class="design-kicker">PulseFlow Studio</span>
        <h1>{{ store.dsl.value.title }}</h1>
      </div>
      <div class="design-header__actions">
        <span class="editor-validation" :class="{ 'editor-validation--error': store.diagnostics.value.length }" role="status">
          <i aria-hidden="true"></i>{{ store.diagnostics.value.length ? `${store.diagnostics.value.length} 项 DSL 校验错误` : 'UI-DSL 已验证' }}
        </span>
        <span class="editor-save-state" :class="`editor-save-state--${studioSaveState}`" role="status">{{ studioSaveState === 'saving' ? '保存中…' : studioSaveState === 'error' ? '同步失败' : '已保存' }}</span>
        <button class="image-import-open" type="button" data-testid="open-image-import" :disabled="publishPending" @click="imageImportOpen = true"><span aria-hidden="true">▧</span> 图片转 UI-DSL</button>
        <button class="editor-header-action" type="button" data-dsl-export @click="dslExportOpen = true">导出当前页</button>
        <button class="editor-header-action" type="button" data-project-export @click="projectExportOpen = true">导出项目</button>
        <button class="editor-header-action" type="button" data-skill-manager @click="skillManagerOpen = true">AI Skills</button>
        <button class="editor-publish-action" type="button" :disabled="publishPending" @click="publishPanelOpen = true">发布</button>
      </div>
    </header>
    <div class="design-grid" :inert="fileSwitchPending" :class="{ 'design-grid--resizing': resizingPanel }" :style="{ '--resource-panel-width': `${resourcePanelWidth}px`, '--inspector-panel-width': `${inspectorPanelWidth}px` }">
      <nav class="editor-tool-rail" aria-label="设计工具区">
        <button type="button" aria-label="文件" title="文件" :aria-pressed="resourcePanel === 'file'" @click="resourcePanel = 'file'"><StudioIcon name="file" :size="20" /><small>File</small></button>
        <button type="button" aria-label="素材" title="素材" :aria-pressed="resourcePanel === 'assets'" @click="resourcePanel = 'assets'"><StudioIcon name="assets" :size="20" /><small>Assets</small></button>
        <button type="button" aria-label="工具" title="工具" :aria-pressed="resourcePanel === 'tools'" @click="resourcePanel = 'tools'"><StudioIcon name="tools" :size="20" /><small>Tools</small></button>
        <button type="button" aria-label="变量" title="变量" :aria-pressed="resourcePanel === 'variables'" @click="resourcePanel = 'variables'"><StudioIcon name="variables" :size="20" /><small>Variables</small></button>
      </nav>
      <aside class="resource-column" aria-label="设计资源">
        <div v-if="resourcePanel === 'file'" class="file-structure-panel">
          <PagesPanel :pages="pageEntries" :active-page-id="activeStudioPageId" :disabled="publishPending || chatPending || imageActionPending" @add-page="addStudioPage" @select-page="selectStudioPage" @rename-page="renameStudioPage" @reorder-page="reorderStudioPage" />
          <LayersPanel
            :nodes="store.dsl.value.nodes"
            :selected-node-id="store.selectedNodeId.value"
            :selected-node-ids="store.selectedNodeIds.value"
            @select="selectNode"
            @remove="store.removeNode"
            @move="moveNode"
            @update-design="(payload) => updateDesignNode(payload.nodeId, payload.patch)"
          />
        </div>
        <AssetsPanel v-else-if="resourcePanel === 'assets'" :assets="imageAssetEntries" :action-label="assetActionLabel" :disabled="publishPending || assetUploadPending" :uploading="assetUploadPending" :upload-error="assetUploadError" @apply="applyLibraryAsset" @upload="uploadLibraryImage" />
        <ComponentPalette v-else-if="resourcePanel === 'tools'" :items="paletteItems" @add="addNode" />
        <VariablesPanel v-else :page="store.dsl.value" @update-variables="updateColorVariables" />
      </aside>
      <div class="panel-resizer panel-resizer--resource" role="separator" aria-label="调整页面和图层面板宽度" aria-orientation="vertical" aria-valuemin="220" aria-valuemax="480" :aria-valuenow="resourcePanelWidth" tabindex="0" data-testid="resource-panel-resizer" @pointerdown="beginPanelResize('resource', $event)" @keydown="nudgePanel('resource', $event)"></div>
      <main class="canvas-column">
        <p v-if="actionFeedback" class="action-feedback" :class="{ failed: actionFailed }" role="status">{{ actionFeedback }}</p>
        <DesignCanvas
          :nodes="store.dsl.value.nodes"
          :dsl="store.dsl.value"
          :preview-data="previewData"
          :selected-node-id="store.selectedNodeId.value"
          :selected-node-ids="store.selectedNodeIds.value"
          :can-undo="store.canUndo.value"
          :can-redo="store.canRedo.value"
          :has-selection="store.selectedNodeIds.value.length > 0"
          :can-paste="copiedNodes.length > 0"
          :can-group="store.selectedNodeIds.value.length > 1"
          :can-auto-layout="store.selectedNodeIds.value.length > 1"
          :can-ungroup="store.selectedNodeIds.value.length === 1 && store.selectedNode.value?.type === 'Frame'"
          :interaction-disabled="fileSwitchPending"
          :prototype-mode="inspectorPanel === 'prototype'"
          @select="selectNode"
          @select-nodes="selectCanvasNodes"
          @undo="store.undo"
          @redo="store.redo"
          @copy-selection="copySelectedNodes"
          @paste-selection="pasteCopiedNodes"
          @duplicate-selection="duplicateSelectedNodes"
          @group-selection="groupSelectedNodes"
          @auto-layout-selection="autoLayoutSelectedNodes"
          @ungroup-selection="ungroupSelectedNode"
          @move="moveNode"
          @reorder-flow-nodes="reorderFlowNodes"
          @reparent-nodes="reparentCanvasNodes"
          @add-component="addComponentFromCanvas"
          @place-tool="placeCanvasTool"
          @duplicate-nodes-at="duplicateNodesAt"
          @duplicate-flow-nodes-at="duplicateFlowNodesAt"
          @drop-image-asset="dropImageAsset"
          @drop-rejected="(reason) => { actionFeedback = reason; actionFailed = true; }"
          @update-node-design="(payload) => updateDesignNode(payload.nodeId, payload.patch)"
          @update-nodes-design="updateDesignNodes"
          @update-node-text="updateTextNode"
          @connect-frames="connectFrames"
        >
          <template #assistant="{ placementStyle, compact }">
            <DesignChatPanel :style="placementStyle" :compact="compact" :messages="chatMessages" :pending="chatPending || imageActionPending" :disabled="publishPending" :reset-key="chatInputResetKey" :image-review="imageReview" :target-label="chatTargetLabel" @submit="refineCurrentPage" @import-image="startImageImportFromChat" @image-action="onImageAction" />
          </template>
        </DesignCanvas>
      </main>
      <div class="panel-resizer panel-resizer--inspector" role="separator" aria-label="调整检查器宽度" aria-orientation="vertical" aria-valuemin="260" aria-valuemax="440" :aria-valuenow="inspectorPanelWidth" tabindex="0" data-testid="inspector-panel-resizer" @pointerdown="beginPanelResize('inspector', $event)" @keydown="nudgePanel('inspector', $event)"></div>
      <aside class="inspector-column">
        <div class="inspector-tabs" role="tablist" aria-label="属性面板">
          <button id="inspector-tab-design" data-inspector-tab="design" role="tab" type="button" :aria-selected="inspectorPanel === 'design'" aria-controls="inspector-panel-design" @click="inspectorPanel = 'design'">设计</button>
          <button id="inspector-tab-prototype" data-inspector-tab="prototype" role="tab" type="button" :aria-selected="inspectorPanel === 'prototype'" aria-controls="inspector-panel-prototype" @click="inspectorPanel = 'prototype'">原型</button>
          <button id="inspector-tab-fields" data-inspector-tab="fields" role="tab" type="button" :aria-selected="inspectorPanel === 'fields'" aria-controls="inspector-panel-fields" @click="inspectorPanel = 'fields'">数据</button>
        </div>
        <section v-if="inspectorPanel === 'design'" id="inspector-panel-design" data-inspector-panel="design" role="tabpanel" aria-labelledby="inspector-tab-design" class="inspector-tab-panel">
          <DesignInspector :page="store.dsl.value" :node="store.selectedNode.value" :entity-fields="store.entityFields" :generated-asset-ids="availableAssetIds" :selected-node-count="store.selectedNodeIds.value.length" @update-page="updatePageProps" @update-node="updateSelectedProps" @update-design="updateSelectedDesign" @align-node="alignSelectedNode" />
        </section>
        <section v-else-if="inspectorPanel === 'prototype'" id="inspector-panel-prototype" data-inspector-panel="prototype" role="tabpanel" aria-labelledby="inspector-tab-prototype" class="inspector-tab-panel">
          <PrototypeInspector :page="store.dsl.value" :node="store.selectedNode.value" @update="updateSelectedProps" @update-design="updateSelectedDesign" />
        </section>
        <section v-else id="inspector-panel-fields" data-inspector-panel="fields" role="tabpanel" aria-labelledby="inspector-tab-fields" class="inspector-tab-panel">
          <EntityFieldEditor :fields="store.entityFields" :feedback="fieldFeedback" :failed="fieldFailed" @add="addEntityField" @update="updateEntityField" @remove="removeEntityField" />
        </section>
        <button class="btn secondary dsl-source-toggle" type="button" :aria-expanded="dslEditorOpen" data-dsl-toggle @click="dslEditorOpen = !dslEditorOpen">
          {{ dslEditorOpen ? '收起 UI-DSL 源码' : '查看 UI-DSL 源码' }}<span v-if="store.diagnostics.value.length"> · {{ store.diagnostics.value.length }} 项校验错误</span>
        </button>
        <button class="btn secondary dsl-source-toggle" type="button" @click="dslExportOpen = true">导出 UI-DSL</button>
        <DslMonacoEditor v-if="dslEditorOpen" :source="store.source.value" :diagnostics="store.diagnostics.value" @buffer="store.updateSourceBuffer" @edit="store.applyJsonEdit" />
      </aside>
    </div>
    <div v-if="publishPanelOpen" class="editor-modal-backdrop" :inert="fileSwitchPending" @click.self="publishPanelOpen = false">
      <section class="editor-publish-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-dialog-title">
        <header><h2 id="publish-dialog-title">发布设计</h2><button type="button" aria-label="关闭发布面板" @click="publishPanelOpen = false"><StudioIcon name="close" /></button></header>
        <PublishPanel :gates="publishGates" :pages="projectPageResults" :version-id="publishedVersionId" :pending="publishPending" :error="publishError" @publish="publish" />
      </section>
    </div>
    <ImageToDslPanel v-if="imageImportOpen" :inert="fileSwitchPending" :current-page-kind="store.dsl.value.pageKind" :current-page-id="store.dsl.value.pageId" :initial-file="chatImageImport?.file" :initial-instruction="chatImageImport?.instruction" @close="closeImageImport" @apply="applyImportedDesign" />
    <DslExportPanel v-if="dslExportOpen" :inert="fileSwitchPending" :dsl="store.dsl.value" :entity-fields="store.entityFields" :asset-ids="[...new Set([...Object.keys(imageUrls), ...availableAssetIds.filter((id) => getImageAsset(id))])]" @close="dslExportOpen = false" />
    <StudioFileExportPanel v-if="projectExportOpen && studioProjectForExport" :inert="fileSwitchPending" :file="studioProjectForExport" :image-urls="imageUrls" @close="projectExportOpen = false" />
    <SkillManagerPanel v-if="skillManagerOpen" @close="skillManagerOpen = false" />
  </div>
</template>

<style scoped>
.design-studio{--studio-tabbar-height:42px;--studio-header-height:54px;position:relative;display:flex;width:100%;height:100%;min-width:0;min-height:0;flex-direction:column;overflow:hidden;color:var(--pf-color-text);background:#f5f5f5}
.file-switch-overlay{position:absolute;inset:0;z-index:30;display:grid;place-items:center;background:#ffffffa8;color:#434343;font-size:13px;cursor:wait;backdrop-filter:blur(1px)}
.studio-loading,.studio-load-error{display:grid;min-height:100%;place-items:center;margin:0;padding:24px;color:#595959;background:#f0f2f5;font-size:14px}.studio-load-error{color:#cf1322}
.editor-tabbar{display:flex;flex:none;height:var(--studio-tabbar-height);align-items:center;gap:10px;padding:0 12px;background:#e8ecf2;border-bottom:1px solid #d5dbe4}
.editor-brand{display:grid;flex:none;width:27px;height:27px;place-items:center;border:1px solid #c4ccd8;border-radius:6px;background:#f8fafc;color:#1677ff;font-size:15px;font-weight:700}
.design-header{display:flex;flex:none;height:var(--studio-header-height);align-items:center;gap:12px;margin:0;padding:0 16px;background:#fff;border-bottom:1px solid #d9d9d9}
.editor-document{display:grid;min-width:130px;line-height:1.2}.design-kicker{font-size:10px;font-weight:500;color:#8c8c8c}.design-header h1{max-width:220px;margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:1.4;font-weight:600}
.design-header__actions{display:flex;align-items:center;gap:8px;flex:none}.editor-validation{display:flex;align-items:center;gap:6px;padding:0 8px;color:#595959;font-size:11px;white-space:nowrap}.editor-validation i{width:7px;height:7px;border-radius:50%;background:#52c41a}.editor-validation--error{color:#cf1322}.editor-validation--error i{background:#ff4d4f}
.editor-save-state{color:#389e0d;font-size:11px;white-space:nowrap}.editor-save-state--saving{color:#1677ff}.editor-save-state--error{color:#cf1322}
.image-import-open,.editor-header-action,.editor-publish-action{display:flex;align-items:center;gap:6px;min-height:32px;padding:0 10px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#262626;font:inherit;font-size:12px;cursor:pointer}.image-import-open{border-color:#91caff;background:#e6f4ff;color:#0958d9;font-weight:500}.image-import-open:hover,.editor-header-action:hover{border-color:#4096ff;color:#1677ff}.image-import-open>span{font-size:14px}.image-import-open:disabled,.editor-publish-action:disabled{opacity:.45;cursor:not-allowed}.editor-publish-action{border-color:#1677ff;background:#1677ff;color:#fff}.editor-publish-action:hover:not(:disabled){border-color:#4096ff;background:#4096ff}
.design-grid{display:grid;flex:1;grid-template-columns:80px var(--resource-panel-width,330px) 8px minmax(0,1fr) 8px var(--inspector-panel-width,335px);min-height:0;overflow:hidden;background:#f5f5f5}
.panel-resizer{position:relative;z-index:2;min-width:8px;cursor:col-resize;touch-action:none;outline:none}.panel-resizer::after{position:absolute;top:0;bottom:0;left:3px;width:1px;background:#f0f0f0;content:""}.panel-resizer:hover::after,.panel-resizer:focus-visible::after,.design-grid--resizing .panel-resizer::after{left:2px;width:3px;background:#1677ff}.panel-resizer:focus-visible{background:#e6f4ff}
.editor-tool-rail{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0;background:#fff;border-right:1px solid #f0f0f0}.editor-tool-rail button{display:grid;width:42px;height:48px;place-content:center;gap:2px;border:1px solid transparent;border-radius:7px;background:transparent;color:#595959}.editor-tool-rail button>svg{display:block;width:20px;height:20px;margin:auto}.editor-tool-rail button small{font-size:9px}.editor-tool-rail button:hover,.editor-tool-rail button[aria-pressed="true"]{background:#e6f4ff;color:#1677ff}.editor-tool-rail button:focus-visible{outline:2px solid #1677ff;outline-offset:1px}
.resource-column{display:flex;flex-direction:column;min-width:0;min-height:0;background:#fff;border-right:1px solid #d9d9d9;container-type:inline-size;container-name:resource}.file-structure-panel{display:flex;flex:1;flex-direction:column;min-height:0}.file-structure-panel :deep(.pages-panel){flex:none}.file-structure-panel :deep(.layers-hint){display:none}.resource-column :deep(.palette){flex:1;border-right:0;overflow:auto}.resource-column :deep(.assets-panel){flex:1}
.canvas-column{position:relative;display:flex;min-width:0;min-height:0;overflow:hidden;background:#f5f5f5}.action-feedback{position:absolute;top:10px;left:50%;z-index:9;max-width:min(540px,calc(100% - 24px));transform:translateX(-50%);margin:0;padding:6px 10px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:6px;color:#389e0d;font-size:11px;box-shadow:0 2px 8px #00000014}.action-feedback.failed{background:#fff2f0;border-color:#ffccc7;color:#cf1322}
.inspector-column{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;padding:12px 14px;overflow:auto;background:#fff}.inspector-tabs{display:flex;gap:4px;border-bottom:1px solid #f0f0f0}.inspector-tabs button{flex:1;min-height:32px;border:0;border-bottom:2px solid transparent;background:transparent;color:#595959;font:inherit;font-size:12px;cursor:pointer}.inspector-tabs button[aria-selected="true"]{border-bottom-color:#1677ff;color:#0958d9;font-weight:600}.inspector-tabs button:focus-visible{outline:2px solid #1677ff;outline-offset:1px}.inspector-tab-panel{min-width:0}.inspector-column :deep(.figma-inspector){border:0;padding:0}.inspector-column :deep(.inspector-group){border-bottom:1px solid #f0f0f0}.dsl-source-toggle{width:100%;text-align:left}
.editor-modal-backdrop{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:24px;background:#00000052}.editor-publish-dialog{width:min(680px,100%);max-height:min(82vh,820px);overflow:auto;border:1px solid #d9d9d9;border-radius:10px;background:#fff;box-shadow:0 16px 48px #0003}.editor-publish-dialog>header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f0f0f0}.editor-publish-dialog>header h2{margin:0;font-size:15px}.editor-publish-dialog>header button{width:28px;height:28px;border:0;border-radius:5px;background:transparent;color:#595959;font-size:20px}.editor-publish-dialog :deep(.publish-panel){margin:0;border:0;box-shadow:none}
@media(max-width:1380px){.design-grid{grid-template-columns:52px minmax(220px,var(--resource-panel-width,280px)) 8px minmax(0,1fr) 8px minmax(260px,var(--inspector-panel-width,300px))}.editor-document{min-width:100px}.editor-validation{display:none}}
@media(max-width:820px){.design-grid{grid-template-columns:48px minmax(0,1fr)}.panel-resizer{display:none}.editor-tool-rail{grid-row:1/3}.resource-column{position:absolute;z-index:10;top:calc(var(--studio-tabbar-height) + var(--studio-header-height));bottom:0;left:48px;width:min(280px,calc(100vw - 48px));box-shadow:8px 0 24px #00000018}.inspector-column{position:absolute;z-index:9;right:0;bottom:0;width:min(340px,calc(100vw - 48px));max-height:58vh;border-top:1px solid #d9d9d9;box-shadow:0 -8px 24px #00000014}.canvas-column{grid-column:2;grid-row:1/3}.design-header__actions{gap:5px}.image-import-open{font-size:0}.image-import-open>span{font-size:15px}.editor-header-action{display:none}}
@media(max-width:520px){.editor-tabbar{padding:0 8px}.design-header{gap:8px;padding:0 8px}.editor-document{min-width:80px}.design-header h1{max-width:120px}.editor-publish-action{min-height:30px;padding:0 8px}.editor-modal-backdrop{padding:8px}.editor-publish-dialog{max-height:90vh}}
</style>
