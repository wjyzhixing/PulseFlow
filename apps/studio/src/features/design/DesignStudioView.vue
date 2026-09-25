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
import NodePropertyEditor from './NodePropertyEditor.vue';
import PreviewPanel from '../preview/PreviewPanel.vue';
import { createMockData } from '../preview/mock-handlers';
import { componentTypes, containerTypes, createDesignStore, type DesignEntityField, type DesignStore } from './design-store';

const router = useRouter();
const store = shallowRef<DesignStore | null>(null);
const actionFeedback = shallowRef('');
const actionFailed = shallowRef(false);
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

function initialize() {
  const draft = getDraftSession();
  if (!draft) { void router.replace('/requirements'); return; }
  try {
    const parsedDsl = JSON.parse(draft.dslText) as Parameters<typeof createDesignStore>[0]['dsl'];
    const parsedFields = JSON.parse(draft.fieldsText) as DesignEntityField[];
    store.value = createDesignStore({
      dsl: parsedDsl,
      entityFields: parsedFields,
      onDslChange: (dsl, source) => {
        const current = getDraftSession();
        if (publishedVersionId.value || (publishPending.value && current?.saved && !current.saving)) {
          if (current) setDraft({ pageDsl: dsl, entityFields: parsedFields, semanticQuestions: current.questions });
          publishedVersionId.value = '';
          publishGates.value = [];
        } else editDraftSession({ dslText: source });
      }
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
        <NodePropertyEditor :node="store.selectedNode.value" :entity-fields="store.entityFields" @update="updateSelectedProps" />
        <DslMonacoEditor :source="store.source.value" :diagnostics="store.diagnostics.value" @buffer="store.updateSourceBuffer" @edit="store.applyJsonEdit" />
      </aside>
    </div>
    <PreviewPanel :dsl="store.dsl.value" :data="previewData" />
    <PublishPanel :gates="publishGates" :version-id="publishedVersionId" :pending="publishPending" :error="publishError" @publish="publish" />
  </div>
</template>

<style scoped>
.design-studio{width:min(1480px,100%);margin:0 auto}.design-header{display:flex;justify-content:space-between;align-items:end;gap:30px;margin-bottom:22px}.design-kicker{font:600 10px 'DM Mono',monospace;letter-spacing:.16em;color:#386b6c}.design-header h1{font:700 clamp(28px,3vw,46px)/1.1 'Noto Serif SC',serif;letter-spacing:-.045em;margin:8px 0}.design-header p{color:#637b7d;font-size:13px;margin:0}.design-meta{display:grid;grid-template-columns:auto auto;gap:5px 14px;border-left:3px solid #d2f473;padding:10px 15px;background:#e7ebe4;min-width:180px}.design-meta span{font:9px 'DM Mono',monospace;color:#718386}.design-meta strong{font:600 10px 'DM Mono',monospace;text-align:right}.design-grid{display:grid;grid-template-columns:210px minmax(390px,1fr) minmax(330px,430px);min-height:720px;border:1px solid #173943;box-shadow:9px 9px 0 #cdd8d0;background:#f8f6ed}.canvas-column{padding:18px;min-width:0}.inspector-column{display:grid;align-content:start;gap:12px;padding:12px;background:#dfe5df;border-left:1px solid #b9c8c3;min-width:0}.action-feedback{margin:0 0 9px;padding:8px 10px;background:#e5f0e4;border-left:3px solid #18706b;color:#245e5d;font-size:11px}.action-feedback.failed{background:#fbefec;border-color:#b74943;color:#8b322e}@media(max-width:1100px){.design-grid{grid-template-columns:190px 1fr}.inspector-column{grid-column:1/-1;grid-template-columns:1fr 1.5fr;border-left:0;border-top:1px solid #b9c8c3}}@media(max-width:760px){.design-header{display:block}.design-meta{margin-top:15px}.design-grid{display:block}.inspector-column{display:block}.inspector-column>*+*{margin-top:12px}}
</style>
