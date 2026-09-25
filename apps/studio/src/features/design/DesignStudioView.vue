<script setup lang="ts">
import { shallowRef } from 'vue';
import type { ComponentType } from '@pulseflow/ui-dsl';
import { useRouter } from 'vue-router';
import { editDraftSession, getDraftSession } from '../draft/draft-store';
import ComponentPalette, { type PaletteItem } from './ComponentPalette.vue';
import DesignCanvas from './DesignCanvas.vue';
import DslMonacoEditor from './DslMonacoEditor.vue';
import NodePropertyEditor from './NodePropertyEditor.vue';
import { componentTypes, containerTypes, createDesignStore, type DesignEntityField, type DesignStore } from './design-store';

const router = useRouter();
const store = shallowRef<DesignStore | null>(null);
const actionFeedback = shallowRef('');
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
      onDslChange: (_dsl, source) => editDraftSession({ dslText: source })
    });
  } catch {
    void router.replace('/draft');
  }
}
initialize();

function addNode(type: ComponentType) {
  if (!store.value) return;
  const selected = store.value.selectedNode.value;
  const selectedAcceptsNode = selected && (containerTypes.has(selected.type) ||
    (selected.type === 'PageHeader' && (type === 'Tag' || type === 'Badge')));
  const parentId = selectedAcceptsNode ? selected.id : null;
  const tagSlot = selected?.slots.find((slot) => slot.name === 'tags');
  const index = parentId ? selected?.type === 'PageHeader' && tagSlot && 'children' in tagSlot
    ? tagSlot.children.length : selected?.children.length ?? 0 : store.value.dsl.value.nodes.length;
  const result = store.value.addNode(type, parentId, index);
  actionFeedback.value = result.ok ? `${type} 已加入画布` : `${type} 无法加入当前层级，请检查字段绑定或容器类型`;
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
        <p v-if="actionFeedback" class="action-feedback" role="status">{{ actionFeedback }}</p>
        <DesignCanvas
          :nodes="store.dsl.value.nodes"
          :selected-node-id="store.selectedNodeId.value"
          @select="store.selectNode"
          @remove="store.removeNode"
          @move="store.moveNode($event.nodeId, $event.parentId, $event.index)"
        />
      </main>
      <aside class="inspector-column">
        <NodePropertyEditor :node="store.selectedNode.value" :entity-fields="store.entityFields" @update="store.selectedNodeId.value && store.updateNodeProps(store.selectedNodeId.value, $event)" />
        <DslMonacoEditor :source="store.source.value" :diagnostics="store.diagnostics.value" @edit="store.applyJsonEdit" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.design-studio{width:min(1480px,100%);margin:0 auto}.design-header{display:flex;justify-content:space-between;align-items:end;gap:30px;margin-bottom:22px}.design-kicker{font:600 10px 'DM Mono',monospace;letter-spacing:.16em;color:#386b6c}.design-header h1{font:700 clamp(28px,3vw,46px)/1.1 'Noto Serif SC',serif;letter-spacing:-.045em;margin:8px 0}.design-header p{color:#637b7d;font-size:13px;margin:0}.design-meta{display:grid;grid-template-columns:auto auto;gap:5px 14px;border-left:3px solid #d2f473;padding:10px 15px;background:#e7ebe4;min-width:180px}.design-meta span{font:9px 'DM Mono',monospace;color:#718386}.design-meta strong{font:600 10px 'DM Mono',monospace;text-align:right}.design-grid{display:grid;grid-template-columns:210px minmax(390px,1fr) minmax(330px,430px);min-height:720px;border:1px solid #173943;box-shadow:9px 9px 0 #cdd8d0;background:#f8f6ed}.canvas-column{padding:18px;min-width:0}.inspector-column{display:grid;align-content:start;gap:12px;padding:12px;background:#dfe5df;border-left:1px solid #b9c8c3;min-width:0}.action-feedback{margin:0 0 9px;padding:8px 10px;background:#e5f0e4;border-left:3px solid #18706b;color:#245e5d;font-size:11px}@media(max-width:1100px){.design-grid{grid-template-columns:190px 1fr}.inspector-column{grid-column:1/-1;grid-template-columns:1fr 1.5fr;border-left:0;border-top:1px solid #b9c8c3}}@media(max-width:760px){.design-header{display:block}.design-meta{margin-top:15px}.design-grid{display:block}.inspector-column{display:block}.inspector-column>*+*{margin-top:12px}}
</style>
