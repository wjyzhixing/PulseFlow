<script setup lang="ts">
import { computed, defineAsyncComponent, shallowRef } from 'vue';
import type { ComponentType, EntityField, PageDsl } from '@pulseflow/ui-dsl';
import { useRouter } from 'vue-router';
import { beginDraftSave, editDraftSession, finishDraftSaveFailure, getDraftSession, markDraftSaved, setDraft } from '../draft/draft-store';
import { isDraftRevisionCurrent } from '../draft/draft-store';
import { generateImageAsset, getDraftRevision, refineCurrentDraft, saveDraft, type ImagePlan } from '../draft/draft-api';
import PublishPanel from '../publish/PublishPanel.vue';
import { PublicationGateError, publishDraft, type GateResult } from '../publish/publication-api';
import ComponentPalette, { type PaletteItem } from './ComponentPalette.vue';
import DesignCanvas from './DesignCanvas.vue';
import EntityFieldEditor from './EntityFieldEditor.vue';
import NodePropertyEditor from './NodePropertyEditor.vue';
import PreviewPanel from '../preview/PreviewPanel.vue';
import { useImageAssets } from '../preview/use-image-assets';
import { createMockData } from '../preview/mock-handlers';
import { componentTypes, containerTypes, createDesignStore, type DesignEntityField, type DesignStore } from './design-store';
import DesignChatPanel, { type DesignChatMessage, type ImageAction, type ImageReview } from './DesignChatPanel.vue';

const DslMonacoEditor = defineAsyncComponent(() => import('./DslMonacoEditor.vue'));

const router = useRouter();
const store = shallowRef<DesignStore | null>(null);
const actionFeedback = shallowRef('');
const actionFailed = shallowRef(false);
const fieldFeedback = shallowRef('');
const fieldFailed = shallowRef(false);
const publishPending = shallowRef(false);
const publishError = shallowRef('');
const publishedVersionId = shallowRef('');
const publishGates = shallowRef<GateResult[]>([]);
const chatMessages = shallowRef<DesignChatMessage[]>([]);
const chatPending = shallowRef(false);
const chatInputResetKey = shallowRef(0);
const imageReviewState = shallowRef<ImageReview>();
const imagePlan = shallowRef<ImagePlan>();
const reviewAssetId = shallowRef<string>();
const generatedAssetIds = shallowRef<string[]>([]);
const imageActionPending = shallowRef(false);
const dslEditorOpen = shallowRef(false);
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
const { urls: imageUrls } = useImageAssets(availableAssetIds);
const imageReview = computed<ImageReview | undefined>(() => imageReviewState.value && {
  ...imageReviewState.value,
  ...(reviewAssetId.value && imageUrls.value[reviewAssetId.value] ? { imageUrl: imageUrls.value[reviewAssetId.value] } : {})
});
const previewData = computed(() => store.value ? createMockData(store.value.dsl.value, store.value.entityFields) : {});
const pageTypeLabel = computed(() => store.value?.dsl.value.pageKind === 'website' ? '企业官网'
  : '管理平台');
const paletteLabels: Record<ComponentType, [string, string]> = {
  Card: ['卡片', '内容容器'], PageHeader: ['页头', '页面标题'], Form: ['表单', '字段容器'], FormItem: ['表单项', '绑定字段'],
  Input: ['输入框', '文本录入'], Select: ['选择器', '选项录入'], Button: ['按钮', '触发动作'], Table: ['数据表', '字段列表'],
  Row: ['行', '栅格容器'], Col: ['列', '栅格单元'], Tag: ['标签', '短状态'], Badge: ['徽标', '状态提示'],
  SiteNavigation: ['网站导航', '官网导航栏'], Hero: ['首屏介绍', '标题与行动入口'], ContentSection: ['内容区块', '带标题的页面区块'],
  FeatureCard: ['功能卡片', '图标与功能说明'], MetricCard: ['指标卡', '名称、数值与趋势'],
  CallToAction: ['行动区块', '高对比转化入口'], Image: ['图片素材', '选择内置素材']
};
const paletteItems: PaletteItem[] = componentTypes.map((type) => ({ type, label: paletteLabels[type][0], hint: paletteLabels[type][1] }));

function isPublishedEdit(): boolean {
  const current = getDraftSession();
  return Boolean(publishedVersionId.value || (publishPending.value && current?.saved && !current.saving));
}

function startNewDraft(pageDsl: PageDsl, entityFields: readonly DesignEntityField[]): void {
  const current = getDraftSession();
  if (current) setDraft({ pageDsl, entityFields: entityFields.map((field) => ({ ...field, rules: field.rules.map((rule) => rule.kind === 'enum' ? { ...rule, values: [...rule.values] } : { ...rule }) })), semanticQuestions: current.questions });
  publishedVersionId.value = '';
  publishGates.value = [];
}

function onDesignDslChange(pageDsl: PageDsl, source: string): void {
  const currentFields = store.value?.entityFields ?? [];
  if (isPublishedEdit()) startNewDraft(pageDsl, currentFields);
  else editDraftSession({ dslText: source, fieldsText: JSON.stringify(currentFields, null, 2) });
}

function onEntityFieldsChange(fields: readonly DesignEntityField[]): void {
  if (!store.value) return;
  const pageDsl = JSON.parse(JSON.stringify(store.value.dsl.value)) as PageDsl;
  if (isPublishedEdit()) startNewDraft(pageDsl, fields);
  else editDraftSession({ fieldsText: JSON.stringify(fields, null, 2) });
}

function onDesignDraftChange(pageDsl: PageDsl, source: string, fields: readonly DesignEntityField[]): void {
  if (isPublishedEdit()) startNewDraft(pageDsl, fields);
  else editDraftSession({ dslText: source, fieldsText: JSON.stringify(fields, null, 2) });
}

function initialize() {
  const draft = getDraftSession();
  if (!draft) { void router.replace('/requirements'); return; }
  try {
    const parsedDsl = JSON.parse(draft.dslText) as Parameters<typeof createDesignStore>[0]['dsl'];
    const parsedFields = JSON.parse(draft.fieldsText) as DesignEntityField[];
    store.value = createDesignStore({
      dsl: parsedDsl,
      entityFields: parsedFields,
      onDslChange: onDesignDslChange,
      onEntityFieldsChange,
      onDraftChange: onDesignDraftChange
    });
  } catch {
    void router.replace('/draft');
  }
}
initialize();

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
  const submittedRevision = session.revision;
  const pageDsl = JSON.parse(JSON.stringify(store.value.dsl.value)) as PageDsl;
  const entityFields = store.value.entityFields.map((field) => ({
    ...field,
    rules: field.rules.map((rule) => rule.kind === 'enum' ? { ...rule, values: [...rule.values] } : { ...rule })
  }));
  addChatMessage({ role: 'user', text: instruction });
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
      ...serverGuard
    });
    if (!isDraftRevisionCurrent(session.id, submittedRevision)) {
      addChatMessage({ role: 'assistant', tone: 'muted', text: '你在等待期间又编辑了页面，因此这次结果没有覆盖当前画布。请基于最新页面重新发送修改要求。' });
      return;
    }
    if (!store.value?.replaceDraft(candidate.pageDsl, candidate.entityFields)) {
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
  store.value.flushSourceBuffer();
  const selected = store.value.selectedNode.value;
  const selectedAcceptsNode = selected && (containerTypes.has(selected.type) ||
    (selected.type === 'PageHeader' && (type === 'Tag' || type === 'Badge')));
  const parentId = selectedAcceptsNode ? selected.id : null;
  const tagSlot = selected?.slots.find((slot) => slot.name === 'tags');
  const index = parentId ? selected?.type === 'PageHeader' && tagSlot && 'children' in tagSlot
    ? tagSlot.children.length : selected?.children.length ?? 0 : store.value.dsl.value.nodes.length;
  const result = store.value.addNode(type, parentId, index);
  actionFeedback.value = result.ok ? `${type} 已加入画布` : `${type} 无法加入当前层级，请检查字段绑定或容器类型`;
  actionFailed.value = !result.ok;
}

function moveNode(payload: { nodeId: string; parentId: string | null; index: number }) {
  if (!store.value) return;
  const moved = store.value.moveNode(payload.nodeId, payload.parentId, payload.index);
  actionFeedback.value = moved ? '节点层级已更新' : '节点无法移动到该位置，请检查容器类型或循环层级';
  actionFailed.value = !moved;
}

function updateSelectedProps(patch: Record<string, unknown>) {
  if (!store.value?.selectedNodeId.value) return;
  const updated = store.value.updateNodeProps(store.value.selectedNodeId.value, patch);
  actionFeedback.value = updated ? '节点属性已更新' : '属性未保存：输入不符合组件白名单或 DSL 约束';
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
    const result = await publishDraft(saved.id);
    publishGates.value = result.gates;
    if (getDraftSession()?.id === saved.id) publishedVersionId.value = result.versionId;
    else actionFeedback.value = `版本 ${result.versionId} 已发布；当前修改已进入新草稿`;
  } catch (error) {
    finishDraftSaveFailure(session.id);
    if (error instanceof PublicationGateError) publishGates.value = error.gates;
    publishError.value = error instanceof Error ? error.message : '发布失败，请重试';
  } finally { publishPending.value = false; }
}
</script>

<template>
  <div v-if="store" class="design-studio">
    <header class="design-header">
      <div><span class="design-kicker">页面设计</span><h1>{{ store.dsl.value.title }}</h1><p>选择画布节点，编辑页面结构与字段属性。</p></div>
      <div class="design-meta"><span>页面类型</span><strong>{{ pageTypeLabel }}</strong><span>页面 ID</span><strong>{{ store.dsl.value.pageId }}</strong><span>规范版本</span><strong>V{{ store.dsl.value.schemaVersion }}</strong></div>
    </header>
    <div class="design-grid">
      <ComponentPalette :items="paletteItems" @add="addNode" />
      <main class="canvas-column">
        <p v-if="actionFeedback" class="action-feedback" :class="{ failed: actionFailed }" role="status">{{ actionFeedback }}</p>
        <DesignCanvas
          :nodes="store.dsl.value.nodes"
          :selected-node-id="store.selectedNodeId.value"
          @select="store.selectNode"
          @remove="store.removeNode"
          @move="moveNode"
        />
        <DesignChatPanel :messages="chatMessages" :pending="chatPending || imageActionPending" :disabled="publishPending" :reset-key="chatInputResetKey" :image-review="imageReview" @submit="refineCurrentPage" @image-action="onImageAction" />
      </main>
      <aside class="inspector-column">
        <EntityFieldEditor :fields="store.entityFields" :feedback="fieldFeedback" :failed="fieldFailed" @add="addEntityField" @update="updateEntityField" @remove="removeEntityField" />
        <NodePropertyEditor :node="store.selectedNode.value" :entity-fields="store.entityFields" :generated-asset-ids="availableAssetIds" @update="updateSelectedProps" />
        <button class="btn secondary dsl-source-toggle" type="button" :aria-expanded="dslEditorOpen" data-dsl-toggle @click="dslEditorOpen = !dslEditorOpen">
          {{ dslEditorOpen ? '收起 UI-DSL 源码' : '查看 UI-DSL 源码' }}<span v-if="store.diagnostics.value.length"> · {{ store.diagnostics.value.length }} 项校验错误</span>
        </button>
        <DslMonacoEditor v-if="dslEditorOpen" :source="store.source.value" :diagnostics="store.diagnostics.value" @buffer="store.updateSourceBuffer" @edit="store.applyJsonEdit" />
      </aside>
    </div>
    <PreviewPanel :dsl="store.dsl.value" :data="previewData" />
    <PublishPanel :gates="publishGates" :version-id="publishedVersionId" :pending="publishPending" :error="publishError" @publish="publish" />
  </div>
</template>

<style scoped>
.design-studio{width:min(1480px,100%);min-width:0;margin:0 auto;color:var(--pf-color-text)}
.design-header{display:flex;justify-content:space-between;align-items:center;gap:var(--pf-space-5);margin-bottom:var(--pf-space-4)}
.design-kicker{font-size:var(--pf-font-size-sm);font-weight:400;color:var(--pf-color-text-secondary)}
.design-header h1{font-size:24px;line-height:1.35;font-weight:600;margin:var(--pf-space-1) 0}
.design-header p{color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);margin:0}
.design-meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--pf-space-1) var(--pf-space-3);border:var(--pf-border-width) solid var(--pf-color-border-secondary);border-radius:var(--pf-radius);padding:var(--pf-space-2) var(--pf-space-3);background:var(--pf-color-surface);min-width:180px;max-width:100%}
.design-meta span{font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary)}
.design-meta strong{font-size:var(--pf-font-size-sm);font-weight:600;text-align:right;overflow-wrap:anywhere}
.design-grid{display:grid;grid-template-columns:210px minmax(0,1fr) minmax(330px,430px);min-height:720px;background:transparent;overflow:hidden}
.canvas-column{padding:var(--pf-space-4);min-width:0;background:var(--pf-color-bg)}
.inspector-column{display:grid;align-content:start;gap:var(--pf-space-3);padding:var(--pf-space-3);background:var(--pf-color-bg);border-left:var(--pf-border-width) solid var(--pf-color-border);min-width:0}
.dsl-source-toggle{width:100%;text-align:left}
.action-feedback{margin:0 0 var(--pf-space-3);padding:var(--pf-space-2) var(--pf-space-3);background:#f6ffed;border:var(--pf-border-width) solid #b7eb8f;border-radius:var(--pf-radius-sm);color:var(--pf-color-success-text);font-size:var(--pf-font-size-sm)}
.action-feedback.failed{background:#fff2f0;border-color:#ffccc7;color:var(--pf-color-error-text)}
@media(max-width:1100px){.design-grid{grid-template-columns:190px minmax(0,1fr)}.inspector-column{grid-column:1/-1;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);border-left:0;border-top:var(--pf-border-width) solid var(--pf-color-border)}}
@media(max-width:760px){.design-header{display:block}.design-meta{margin-top:var(--pf-space-3)}.design-grid{display:block}.canvas-column{padding:var(--pf-space-3)}.inspector-column{display:block}.inspector-column>*+*{margin-top:var(--pf-space-3)}}
</style>
