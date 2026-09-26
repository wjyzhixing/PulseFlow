<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import {
  Layout as ALayout,
  LayoutContent as ALayoutContent,
  LayoutHeader as ALayoutHeader,
  LayoutSider as ALayoutSider,
  Step as AStep,
  Steps as ASteps
} from 'ant-design-vue';

const route = useRoute();
const stage = computed(() => route.path === '/design' ? 4 : route.path === '/draft' ? 3 : route.path === '/login' ? 1 : 2);
const stageLabels = ['工作区登录', '需求导入', '实体确认', '画布设计'];
const currentStage = computed(() => stageLabels[stage.value - 1]);
</script>

<template>
  <ALayout class="studio-shell">
    <ALayoutHeader class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">P</span>
        <span class="brand-name">PulseFlow <span>Studio</span></span>
      </div>
      <div class="topbar-context">
        <span>业务建模工作台</span>
        <span class="current-stage"><span class="stage-dot" aria-hidden="true"></span>{{ currentStage }}</span>
      </div>
    </ALayoutHeader>

    <nav class="workflow-semantics sr-only" aria-label="工作流程进度">
      <ol>
        <li v-for="(label, index) in stageLabels" :key="label" :aria-current="index === stage - 1 ? 'step' : undefined">{{ label }}</li>
      </ol>
    </nav>

    <ALayout class="studio-workspace" :class="{ 'design-workspace': stage === 4 }" has-sider>
      <ALayoutSider class="rail" :width="224" :collapsed="false" theme="light" aria-label="工作流程">
        <div class="rail-heading">工作流程</div>
        <ASteps class="workflow-steps workflow-steps--vertical" :current="stage - 1" direction="vertical" size="small" aria-hidden="true">
          <AStep v-for="label in stageLabels" :key="label" :title="label" />
        </ASteps>
      </ALayoutSider>

      <ALayoutContent class="canvas" :class="{ 'design-canvas-shell': stage === 4 }">
        <div class="mobile-workflow" aria-label="工作流程">
          <ASteps class="workflow-steps workflow-steps--horizontal" :current="stage - 1" :responsive="false" size="small" aria-hidden="true">
            <AStep v-for="label in stageLabels" :key="label" :title="label" />
          </ASteps>
        </div>
        <router-view />
      </ALayoutContent>
    </ALayout>
  </ALayout>
</template>

<style>
* { box-sizing: border-box; }
button, input, textarea { font: inherit; }
button { cursor: pointer; }

.studio-shell { min-height: 100vh; background: var(--pf-color-bg); }
.topbar.ant-layout-header {
  position: relative;
  z-index: 2;
  height: 64px;
  padding: 0 var(--pf-space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pf-space-4);
  background: var(--pf-color-surface);
  border-bottom: var(--pf-border-width) solid var(--pf-color-border-secondary);
  line-height: normal;
}
.brand { display: flex; align-items: center; gap: var(--pf-space-3); white-space: nowrap; }
.brand-mark {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--pf-radius);
  background: var(--pf-color-primary);
  color: var(--pf-color-surface);
  font-size: var(--pf-font-size-lg);
  font-weight: 700;
  line-height: 1;
}
.brand-name { font-size: var(--pf-font-size-lg); font-weight: 600; letter-spacing: -0.02em; }
.brand-name span { color: var(--pf-color-text-secondary); font-weight: 400; }
.topbar-context { display: flex; align-items: center; gap: var(--pf-space-4); color: var(--pf-color-text-secondary); font-size: var(--pf-font-size-sm); }
.current-stage { display: inline-flex; align-items: center; gap: var(--pf-space-2); color: var(--pf-color-text); }
.stage-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pf-color-primary); }

.studio-workspace.ant-layout { min-height: calc(100vh - 64px); background: var(--pf-color-bg); }
.rail.ant-layout-sider {
  flex: 0 0 224px !important;
  width: 224px !important;
  max-width: 224px !important;
  min-width: 224px !important;
  padding: var(--pf-space-5) var(--pf-space-3);
  background: var(--pf-color-surface);
  border-right: var(--pf-border-width) solid var(--pf-color-border-secondary);
}
.rail-heading { padding: 0 var(--pf-space-3) var(--pf-space-4); color: var(--pf-color-text-secondary); font-size: var(--pf-font-size-sm); font-weight: 600; }
.workflow-steps--vertical .ant-steps-item { min-height: 52px; }
.workflow-steps--vertical .ant-steps-item-title { color: var(--pf-color-text-secondary); font-size: var(--pf-font-size-sm); }
.workflow-steps--vertical .ant-steps-item-process .ant-steps-item-title { color: var(--pf-color-primary-strong); font-weight: 600; }
.workflow-steps--vertical .ant-steps-item-finish .ant-steps-item-title { color: var(--pf-color-text); }
.workflow-steps--vertical .ant-steps-item-icon { background: var(--pf-color-surface); }
.workflow-steps--vertical .ant-steps-item-process .ant-steps-item-icon { background: var(--pf-color-primary); border-color: var(--pf-color-primary); }
.canvas.ant-layout-content { min-width: 0; padding: clamp(24px, 3vw, 48px); background: var(--pf-color-bg); }
.canvas.design-canvas-shell { padding: var(--pf-space-5); }
.mobile-workflow { display: none; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

.panel { max-width: 960px; margin: 0 auto; }
.eyebrow { color: var(--pf-color-text-secondary); margin-bottom: var(--pf-space-2); font-size: var(--pf-font-size-sm); font-weight: 500; letter-spacing: .02em; }
.page-title { font-size: 24px; font-weight: 600; line-height: 1.35; margin: 0 0 var(--pf-space-2); }
.lede { color: var(--pf-color-text-secondary); margin: 0 0 var(--pf-space-5); line-height: var(--pf-line-height); }
.card { background: var(--pf-color-surface); border: var(--pf-border-width) solid var(--pf-color-border-secondary); border-radius: var(--pf-radius); box-shadow: var(--pf-shadow); padding: var(--pf-space-5); margin: var(--pf-space-4) 0; }
.card h2 { font-size: var(--pf-font-size-lg); font-weight: 600; margin: 0 0 var(--pf-space-4); }
.field-label { display: block; color: var(--pf-color-text); font-weight: 500; font-size: var(--pf-font-size); margin: var(--pf-space-4) 0 var(--pf-space-2); }
.input, .textarea { display: block; width: 100%; border: var(--pf-border-width) solid var(--pf-color-border); background: var(--pf-color-surface); color: var(--pf-color-text); padding: var(--pf-space-2) var(--pf-space-3); border-radius: var(--pf-radius); outline-color: var(--pf-color-primary); }
.textarea { min-height: 138px; resize: vertical; line-height: var(--pf-line-height); }
.btn { border: var(--pf-border-width) solid var(--pf-color-primary-strong); background: var(--pf-color-primary-strong); color: var(--pf-color-surface); padding: var(--pf-space-2) var(--pf-space-4); font-weight: 500; border-radius: var(--pf-radius); margin-top: 0; box-shadow: var(--pf-shadow-sm); }
.btn:hover { border-color: var(--pf-color-primary-strong-hover); background: var(--pf-color-primary-strong-hover); }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn.secondary { border-color: var(--pf-color-border); background: var(--pf-color-surface); color: var(--pf-color-text); }
.error { color: var(--pf-color-error-text); background: #fff2f0; border: var(--pf-border-width) solid #ffccc7; border-radius: var(--pf-radius); padding: var(--pf-space-3); margin: var(--pf-space-4) 0; }
.success { color: var(--pf-color-success-text); background: #f6ffed; border: var(--pf-border-width) solid #b7eb8f; border-radius: var(--pf-radius); padding: var(--pf-space-3); margin: var(--pf-space-4) 0; }
.muted { color: var(--pf-color-text-secondary); }
.section-row { display: flex; gap: var(--pf-space-3); padding: var(--pf-space-4) 0; border-top: var(--pf-border-width) solid var(--pf-color-border-secondary); align-items: start; }
.section-row input { margin-top: 5px; accent-color: var(--pf-color-primary); }
.section-row strong { display: block; margin-bottom: var(--pf-space-1); }
.section-row p { margin: 0; color: var(--pf-color-text-secondary); line-height: var(--pf-line-height); }
.grid-two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--pf-space-4); }
.code { font: var(--pf-font-size-sm)/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; min-height: 180px; }
.tag { display: inline-flex; align-items: center; font-size: var(--pf-font-size-sm); color: var(--pf-color-text-secondary); background: #f5f5f5; border: var(--pf-border-width) solid var(--pf-color-border-secondary); padding: var(--pf-space-1) var(--pf-space-2); border-radius: var(--pf-radius-sm); }

@media (max-width: 760px) {
  .topbar.ant-layout-header { padding: 0 var(--pf-space-4); }
  .topbar-context { display: none; }
  .studio-workspace.ant-layout { display: block; }
  .rail.ant-layout-sider { display: none; }
  .canvas.ant-layout-content, .canvas.design-canvas-shell { padding: 0 var(--pf-space-4) var(--pf-space-5); }
  .mobile-workflow { display: block; margin: 0 calc(-1 * var(--pf-space-4)) var(--pf-space-4); padding: var(--pf-space-3) var(--pf-space-4); overflow-x: auto; background: var(--pf-color-surface); border-bottom: var(--pf-border-width) solid var(--pf-color-border-secondary); }
  .workflow-steps--horizontal { width: 100%; min-width: 0; }
  .workflow-steps--horizontal .ant-steps-item { min-width: 0; }
  .workflow-steps--horizontal .ant-steps-item-title { max-width: 100%; font-size: 10px; line-height: 1.25; text-align: center; white-space: normal; overflow-wrap: anywhere; }
  .grid-two { grid-template-columns: 1fr; }
}
</style>
