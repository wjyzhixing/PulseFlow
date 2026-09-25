<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { ComponentType, EntityField, PageDsl } from '@pulseflow/ui-dsl';
import { useRouter } from 'vue-router';
import { beginDraftSave, editDraftSession, finishDraftSaveFailure, getDraftSession, markDraftSaved, setDraft } from '../draft/draft-store';
import { saveDraft } from '../draft/draft-api';
import PublishPanel from '../publish/PublishPanel.vue';
import { PublicationGateError, publishDraft, type GateResult } from '../publish/publication-api';
import ComponentPalette, { type PaletteItem } from './ComponentPalette.vue';
import DesignCanvas from './DesignCanvas.vue';
import DslMonacoEditor from './DslMonacoEditor.vue';
import EntityFieldEditor from './EntityFieldEditor.vue';
import NodePropertyEditor from './NodePropertyEditor.vue';
import PreviewPanel from '../preview/PreviewPanel.vue';
import { createMockData } from '../preview/mock-handlers';
import { componentTypes, containerTypes, createDesignStore, type DesignEntityField, type DesignStore } from './design-store';

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
const previewData = computed(() => store.value ? createMockData(store.value.dsl.value, store.value.entityFields) : {});
const paletteLabels: Record<ComponentType, [string, string]> = {
  Card: ['卡片', '内容容器'], PageHeader: ['页头', '页面标题'], Form: ['表单', '字段容器'], FormItem: ['表单项', '绑定字段'],
  Input: ['输入框', '文本录入'], Select: ['选择器', '选项录入'], Button: ['按钮', '触发动作'], Table: ['数据表', '字段列表'],
  Row: ['行', '栅格容器'], Col: ['列', '栅格单元'], Tag: ['标签', '短状态'], Badge: ['徽标', '状态提示']
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
      onEntityFieldsChange
    });
  } catch {
    void router.replace('/draft');
  }
}
initialize();

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
      <div><span class="design-kicker">DESIGN OPERATIONS / LIVE DSL</span><h1>{{ store.dsl.value.title }}</h1><p>画布操作与 JSON 共享同一份规范状态。选择节点，调整结构与字段属性。</p></div>
      <div class="design-meta"><span>PAGE</span><strong>{{ store.dsl.value.pageId }}</strong><span>SCHEMA</span><strong>V{{ store.dsl.value.schemaVersion }}</strong></div>
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
      </main>
      <aside class="inspector-column">
        <EntityFieldEditor :fields="store.entityFields" :feedback="fieldFeedback" :failed="fieldFailed" @add="addEntityField" @update="updateEntityField" @remove="removeEntityField" />
        <NodePropertyEditor :node="store.selectedNode.value" :entity-fields="store.entityFields" @update="updateSelectedProps" />
        <DslMonacoEditor :source="store.source.value" :diagnostics="store.diagnostics.value" @buffer="store.updateSourceBuffer" @edit="store.applyJsonEdit" />
      </aside>
    </div>
    <PreviewPanel :dsl="store.dsl.value" :data="previewData" />
    <PublishPanel :gates="publishGates" :version-id="publishedVersionId" :pending="publishPending" :error="publishError" @publish="publish" />
  </div>
</template>

<style scoped>
.design-studio{width:min(1480px,100%);min-width:0;margin:0 auto;color:var(--pf-color-text)}
.design-header{display:flex;justify-content:space-between;align-items:center;gap:var(--pf-space-5);margin-bottom:var(--pf-space-5)}
.design-kicker{font-size:var(--pf-font-size-sm);font-weight:600;letter-spacing:.04em;color:var(--pf-color-primary)}
.design-header h1{font-size:24px;line-height:1.35;font-weight:600;margin:var(--pf-space-1) 0}
.design-header p{color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);margin:0}
.design-meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--pf-space-1) var(--pf-space-3);border:var(--pf-border-width) solid var(--pf-color-border-secondary);border-radius:var(--pf-radius);padding:var(--pf-space-2) var(--pf-space-3);background:var(--pf-color-surface);min-width:180px;max-width:100%}
.design-meta span{font-size:var(--pf-font-size-sm);color:var(--pf-color-text-secondary)}
.design-meta strong{font-size:var(--pf-font-size-sm);font-weight:600;text-align:right;overflow-wrap:anywhere}
.design-grid{display:grid;grid-template-columns:210px minmax(0,1fr) minmax(330px,430px);min-height:720px;border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);box-shadow:var(--pf-shadow-sm);background:var(--pf-color-surface);overflow:hidden}
.canvas-column{padding:var(--pf-space-4);min-width:0;background:var(--pf-color-bg)}
.inspector-column{display:grid;align-content:start;gap:var(--pf-space-3);padding:var(--pf-space-3);background:var(--pf-color-bg);border-left:var(--pf-border-width) solid var(--pf-color-border);min-width:0}
.action-feedback{margin:0 0 var(--pf-space-3);padding:var(--pf-space-2) var(--pf-space-3);background:#f6ffed;border:var(--pf-border-width) solid #b7eb8f;border-radius:var(--pf-radius-sm);color:var(--pf-color-text);font-size:var(--pf-font-size-sm)}
.action-feedback.failed{background:#fff2f0;border-color:#ffccc7}
@media(max-width:1100px){.design-grid{grid-template-columns:190px minmax(0,1fr)}.inspector-column{grid-column:1/-1;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);border-left:0;border-top:var(--pf-border-width) solid var(--pf-color-border)}}
@media(max-width:760px){.design-header{display:block}.design-meta{margin-top:var(--pf-space-3)}.design-grid{display:block}.canvas-column{padding:var(--pf-space-3)}.inspector-column{display:block}.inspector-column>*+*{margin-top:var(--pf-space-3)}}
</style>
