<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const stage = computed(() => route.path === '/design' ? 4 : route.path === '/draft' ? 3 : route.path === '/login' ? 1 : 2);
const stageLabels = ['工作区登录', '需求导入', '实体确认', '画布设计'];
const currentStage = computed(() => stageLabels[stage.value - 1]);
</script>

<template>
  <div class="studio">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">P</span>
        <span class="brand-name">PulseFlow <span>Studio</span></span>
      </div>
      <div class="topbar-context">
        <span>业务建模工作台</span>
        <span class="topbar-divider" aria-hidden="true"></span>
        <span>当前步骤：{{ currentStage }}</span>
      </div>
    </header>

    <div class="workspace" :class="{ 'design-workspace': stage === 4 }">
      <aside class="rail" aria-label="工作流程">
        <div class="rail-heading">工作流程</div>
        <ol class="workflow-steps">
          <li :class="{ active: stage === 1, done: stage > 1 }" :aria-current="stage === 1 ? 'step' : undefined"><span class="step-number">01</span><span>工作区登录</span></li>
          <li :class="{ active: stage === 2, done: stage > 2 }" :aria-current="stage === 2 ? 'step' : undefined"><span class="step-number">02</span><span>需求导入</span></li>
          <li :class="{ active: stage === 3, done: stage > 3 }" :aria-current="stage === 3 ? 'step' : undefined"><span class="step-number">03</span><span>实体确认</span></li>
          <li :class="{ active: stage === 4 }" :aria-current="stage === 4 ? 'step' : undefined"><span class="step-number">04</span><span>画布设计</span></li>
        </ol>
      </aside>
      <main class="canvas" :class="{ 'design-canvas-shell': stage === 4 }"><router-view /></main>
    </div>
  </div>
</template>

<style>
* { box-sizing: border-box; }
button, input, textarea { font: inherit; }
button { cursor: pointer; }

.studio { min-height: 100vh; }
.topbar {
  height: 64px;
  padding: 0 var(--pf-space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pf-space-4);
  background: var(--pf-color-surface);
  border-bottom: var(--pf-border-width) solid var(--pf-color-border-secondary);
  box-shadow: var(--pf-shadow-sm);
}
.brand { display: flex; align-items: center; gap: var(--pf-space-3); white-space: nowrap; }
.brand-mark {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--pf-radius);
  background: var(--pf-color-primary-strong);
  color: var(--pf-color-surface);
  font-size: var(--pf-font-size-lg);
  font-weight: 700;
  line-height: 1;
}
.brand-name { font-size: var(--pf-font-size-lg); font-weight: 600; letter-spacing: -0.02em; }
.brand-name span { color: var(--pf-color-text-secondary); font-weight: 400; }
.topbar-context { display: flex; align-items: center; gap: var(--pf-space-4); color: var(--pf-color-text-secondary); font-size: var(--pf-font-size-sm); }
.topbar-divider { height: 14px; border-left: var(--pf-border-width) solid var(--pf-color-border); }

.workspace { display: grid; grid-template-columns: 224px minmax(0, 1fr); min-height: calc(100vh - 64px); }
.workspace.design-workspace { grid-template-columns: 224px minmax(0, 1fr); }
.rail { background: var(--pf-color-surface); border-right: var(--pf-border-width) solid var(--pf-color-border-secondary); padding: var(--pf-space-5) var(--pf-space-3); }
.rail-heading { padding: 0 var(--pf-space-3) var(--pf-space-3); color: var(--pf-color-text-secondary); font-size: var(--pf-font-size-sm); font-weight: 600; }
.workflow-steps { list-style: none; margin: 0; padding: 0; }
.workflow-steps li { min-height: 44px; display: flex; align-items: center; gap: var(--pf-space-3); padding: 0 var(--pf-space-3); border-radius: var(--pf-radius); color: var(--pf-color-text-secondary); white-space: nowrap; }
.workflow-steps li.active { background: #e6f4ff; color: var(--pf-color-primary-strong); font-weight: 600; }
.workflow-steps li.done .step-number { color: var(--pf-color-primary-strong); border-color: #91caff; }
.step-number { width: 24px; height: 24px; display: grid; flex: 0 0 24px; place-items: center; border: var(--pf-border-width) solid var(--pf-color-border); border-radius: 50%; background: var(--pf-color-surface); color: #8c8c8c; font-size: var(--pf-font-size-sm); font-variant-numeric: tabular-nums; }
.workflow-steps li.active .step-number { border-color: var(--pf-color-primary-strong); background: var(--pf-color-primary-strong); color: var(--pf-color-surface); }
.canvas { min-width: 0; background: var(--pf-color-bg); padding: clamp(24px, 3vw, 48px); }
.canvas.design-canvas-shell { padding: var(--pf-space-5); }

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
  .topbar { padding: 0 var(--pf-space-4); }
  .topbar-context { display: none; }
  .workspace, .workspace.design-workspace { display: block; }
  .rail { padding: var(--pf-space-2) var(--pf-space-3); border-right: 0; border-bottom: var(--pf-border-width) solid var(--pf-color-border-secondary); overflow-x: auto; }
  .rail-heading { display: none; }
  .workflow-steps { display: flex; width: max-content; gap: var(--pf-space-1); }
  .workflow-steps li { min-height: 36px; padding: 0 var(--pf-space-2); font-size: var(--pf-font-size-sm); }
  .workflow-steps li .step-number { font-size: 11px; }
  .canvas, .canvas.design-canvas-shell { padding: var(--pf-space-5); }
  .grid-two { grid-template-columns: 1fr; }
}
</style>
