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
  height: 56px;
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
  width: 30px;
  height: 30px;
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
.topbar-divider { height: 14px; border-left: var(--pf-border-width) solid var(--pf-color-border); }

.workspace { display: grid; grid-template-columns: 200px minmax(0, 1fr); min-height: calc(100vh - 56px); }
.workspace.design-workspace { grid-template-columns: 200px minmax(0, 1fr); }
.rail { background: var(--pf-color-surface); border-right: var(--pf-border-width) solid var(--pf-color-border-secondary); padding: var(--pf-space-5) var(--pf-space-3); }
.rail-heading { padding: 0 var(--pf-space-3) var(--pf-space-3); color: var(--pf-color-text-secondary); font-size: var(--pf-font-size-sm); font-weight: 600; }
.workflow-steps { list-style: none; margin: 0; padding: 0; }
.workflow-steps li { min-height: 40px; display: flex; align-items: center; gap: var(--pf-space-3); padding: 0 var(--pf-space-3); border-radius: var(--pf-radius); color: var(--pf-color-text-secondary); white-space: nowrap; }
.workflow-steps li.active { background: #e6f4ff; color: var(--pf-color-primary); font-weight: 600; }
.workflow-steps li.done .step-number { color: var(--pf-color-success); }
.step-number { color: #8c8c8c; font-size: var(--pf-font-size-sm); font-variant-numeric: tabular-nums; }
.workflow-steps li.active .step-number { color: var(--pf-color-primary); }
.canvas { min-width: 0; background: var(--pf-color-bg); padding: clamp(24px, 3vw, 48px); }
.canvas.design-canvas-shell { padding: var(--pf-space-5); }

/* Shared route styles remain here until the route views receive their own refresh. */
.panel { max-width: 960px; margin: 0 auto; }
.eyebrow { color: #53747a; margin-bottom: 18px; font-size: 11px; font-weight: 500; letter-spacing: .13em; }
.page-title { font: 700 clamp(30px,3.4vw,49px)/1.25 var(--pf-font-family); letter-spacing: -.05em; margin: 0 0 15px; }
.lede { color: #61757a; margin: 0 0 37px; line-height: 1.8; }
.card { background: #fffefa; border: 1px solid #d5d9d4; box-shadow: 8px 8px 0 #dce3de; padding: 30px; margin: 24px 0; }
.card h2 { font-size: 18px; margin: 0 0 22px; }
.field-label { display: block; font-weight: 600; font-size: 13px; margin: 18px 0 9px; }
.input, .textarea { display: block; width: 100%; border: 1px solid #bccac9; background: #fff; color: #14242d; padding: 12px 14px; border-radius: 3px; outline-color: #087a78; }
.textarea { min-height: 138px; resize: vertical; line-height: 1.7; }
.btn { border: 0; background: #0d6766; color: #fff; padding: 12px 22px; font-weight: 700; border-radius: 3px; margin-top: 20px; }
.btn:hover { background: #0a5555; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn.secondary { background: #dce8e5; color: #124747; }
.error { color: #9b3731; background: #fbefec; border-left: 3px solid #b74943; padding: 12px 15px; margin: 16px 0; }
.success { color: #17675d; background: #e7f3ec; border-left: 3px solid #3c9c77; padding: 12px 15px; margin: 16px 0; }
.muted { color: #6d8284; }
.section-row { display: flex; gap: 14px; padding: 18px 0; border-top: 1px solid #e2e8e4; align-items: start; }
.section-row input { margin-top: 5px; accent-color: #0d6766; }
.section-row strong { display: block; margin-bottom: 5px; }
.section-row p { margin: 0; color: #738789; line-height: 1.6; }
.grid-two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.code { font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; min-height: 180px; }
.tag { font-size: 11px; color: #547879; border: 1px solid #b8cbc7; padding: 5px 8px; border-radius: 2px; }

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
