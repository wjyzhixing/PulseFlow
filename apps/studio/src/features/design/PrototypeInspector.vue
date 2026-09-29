<script setup lang="ts">
import { computed, type DeepReadonly } from 'vue';
import type { UiNode } from '@pulseflow/ui-dsl';
import type { DesignPageDsl, ReadonlyDesignNode } from './design-store';
import { isDesignNodeLocked } from './design-commands';

const props = defineProps<{
  page: DeepReadonly<DesignPageDsl>;
  node: ReadonlyDesignNode | null;
}>();
const emit = defineEmits<{
  update: [patch: Record<string, unknown>];
  'update-design': [patch: { prototype?: { trigger: 'click'; targetNodeId: string } }];
}>();

const locked = computed(() => props.node ? isDesignNodeLocked(props.page.nodes, props.node.id) : false);
const sections = computed(() => {
  const result: Array<{ id: string; label: string }> = [];
  const visit = (nodes: readonly DeepReadonly<UiNode>[]) => nodes.forEach((node) => {
    if (node.type === 'ContentSection' && typeof node.props.sectionId === 'string') {
      result.push({ id: node.props.sectionId, label: typeof node.props.title === 'string' ? node.props.title : node.props.sectionId });
    }
    visit(node.children);
    node.slots.forEach((slot) => { if ('children' in slot) visit(slot.children); });
  });
  visit(props.page.nodes);
  return result;
});
const navigationLinks = computed(() => props.node?.type === 'SiteNavigation'
  ? props.node.props.links as readonly { label: string; sectionId: string }[]
  : []);
const frames = computed(() => {
  const result: Array<{ id: string; label: string }> = [];
  const visit = (nodes: readonly DeepReadonly<UiNode>[]) => nodes.forEach((node) => {
    if (node.type === 'Frame') {
      const label = node.design?.name || (typeof node.props.name === 'string' ? node.props.name : node.id);
      result.push({ id: node.id, label });
    }
    visit(node.children);
    node.slots.forEach((slot) => { if ('children' in slot) visit(slot.children); });
  });
  visit(props.page.nodes);
  return result;
});
const prototypeTargets = computed(() => frames.value.filter((frame) => frame.id !== props.node?.id));

function updateButtonTarget(value: string): void {
  emit('update', { targetSectionId: value || undefined, ...(value ? { event: undefined } : {}) });
}

function updateButtonEvent(event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim();
  emit('update', { event: value || undefined, ...(value ? { targetSectionId: undefined } : {}) });
}

function updateHeroTarget(key: 'primarySectionId' | 'secondarySectionId', value: string): void {
  const labelKey = key === 'primarySectionId' ? 'primaryLabel' : 'secondaryLabel';
  emit('update', { [key]: value || undefined, ...(value ? {} : { [labelKey]: undefined }) });
}

function updateNavigationTarget(index: number, sectionId: string): void {
  const links = navigationLinks.value.map((link, linkIndex) => linkIndex === index ? { ...link, sectionId } : { ...link });
  emit('update', { links });
}

function updateFrameTarget(targetNodeId: string): void {
  emit('update-design', {
    prototype: targetNodeId ? { trigger: 'click', targetNodeId } : undefined
  });
}
</script>

<template>
  <section class="prototype-inspector" aria-labelledby="prototype-inspector-title">
    <div class="prototype-inspector__heading">
      <span class="prototype-inspector__kicker">INTERACTIONS</span>
      <h2 id="prototype-inspector-title">原型交互</h2>
      <p>配置页面区块或画框之间的点击跳转。连接目标会保存到 UI-DSL。</p>
    </div>
    <p v-if="!node" class="prototype-inspector__empty">选择按钮、导航、Hero 或行动区块来配置交互。</p>
    <fieldset v-else class="prototype-inspector__controls" :disabled="locked">
      <p class="prototype-inspector__node"><strong>{{ node.design?.name || node.type }}</strong><span>{{ locked ? '图层已锁定' : node.type }}</span></p>

      <template v-if="node.type === 'Frame'">
        <label>点击后跳转到画框<select aria-label="画框跳转目标" :value="String(node.design?.prototype?.targetNodeId ?? '')" @change="updateFrameTarget(($event.target as HTMLSelectElement).value)">
          <option value="">不设置</option>
          <option v-for="frame in prototypeTargets" :key="frame.id" :value="frame.id">{{ frame.label }}</option>
        </select></label>
        <p class="prototype-inspector__hint">在画布上拖动选中画框右侧的蓝色连接点到另一个画框，可直接创建连线；也可在此选择目标。预览或发布页面中点击源画框，会滚动到目标画框。</p>
        <p v-if="!prototypeTargets.length" class="prototype-inspector__warning">页面中至少还需有另一个 Frame 才能设置跳转。</p>
      </template>

      <template v-if="node.type === 'Button'">
        <label>点击后跳转<select aria-label="按钮跳转目标" :value="String(node.props.targetSectionId ?? '')" @change="updateButtonTarget(($event.target as HTMLSelectElement).value)">
          <option value="">不跳转</option>
          <option v-for="section in sections" :key="section.id" :value="section.id">{{ section.label }}</option>
        </select></label>
        <label>或触发项目动作<input aria-label="按钮动作标识" :value="String(node.props.event ?? '')" placeholder="例如 submit-form" @change="updateButtonEvent" /></label>
        <p class="prototype-inspector__hint">跳转与项目动作互斥。项目动作由接入页面的项目实现。</p>
      </template>

      <template v-else-if="node.type === 'Hero'">
        <label v-if="node.props.primaryLabel">主按钮目标<select aria-label="主按钮跳转目标" :value="String(node.props.primarySectionId ?? '')" @change="updateHeroTarget('primarySectionId', ($event.target as HTMLSelectElement).value)">
          <option value="">不设置</option><option v-for="section in sections" :key="section.id" :value="section.id">{{ section.label }}</option>
        </select></label>
        <label v-if="node.props.secondaryLabel">次按钮目标<select aria-label="次按钮跳转目标" :value="String(node.props.secondarySectionId ?? '')" @change="updateHeroTarget('secondarySectionId', ($event.target as HTMLSelectElement).value)">
          <option value="">不设置</option><option v-for="section in sections" :key="section.id" :value="section.id">{{ section.label }}</option>
        </select></label>
        <p v-if="!node.props.primaryLabel && !node.props.secondaryLabel" class="prototype-inspector__hint">先在设计面板为 Hero 添加行动按钮文字，再配置跳转目标。</p>
      </template>

      <template v-else-if="node.type === 'CallToAction'">
        <label>行动按钮目标<select aria-label="行动区块跳转目标" :value="String(node.props.targetSectionId ?? '')" @change="emit('update', { targetSectionId: ($event.target as HTMLSelectElement).value })">
          <option v-for="section in sections" :key="section.id" :value="section.id">{{ section.label }}</option>
        </select></label>
      </template>

      <template v-else-if="node.type === 'SiteNavigation'">
        <label v-for="(link, index) in navigationLinks" :key="`${index}-${link.label}`">{{ link.label }} 跳转到
          <select :aria-label="`${link.label}导航目标`" :value="link.sectionId" @change="updateNavigationTarget(index, ($event.target as HTMLSelectElement).value)">
            <option v-for="section in sections" :key="section.id" :value="section.id">{{ section.label }}</option>
          </select>
        </label>
        <p v-if="!navigationLinks.length" class="prototype-inspector__hint">当前导航没有链接，请先在设计面板添加导航项。</p>
      </template>

      <p v-else-if="node.type !== 'Frame'" class="prototype-inspector__hint">该图层没有可配置的点击跳转。选择 Frame、按钮、导航、Hero 或行动区块设置页面内交互。</p>
      <p v-if="!sections.length && node.type !== 'Frame' && ['Button', 'Hero', 'CallToAction', 'SiteNavigation'].includes(node.type)" class="prototype-inspector__warning">页面还没有内容区块。先添加 ContentSection，再设置跳转目标。</p>
    </fieldset>
  </section>
</template>

<style scoped>
.prototype-inspector{display:grid;align-content:start;gap:14px;min-width:0;padding:16px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#1f1f1f}
.prototype-inspector__heading{display:grid;gap:5px}.prototype-inspector__kicker{color:#1677ff;font-size:10px;font-weight:700;letter-spacing:.1em}.prototype-inspector__heading h2{margin:0;font-size:16px;font-weight:600}.prototype-inspector__heading p,.prototype-inspector__empty,.prototype-inspector__hint,.prototype-inspector__warning{margin:0;color:#737b86;font-size:12px;line-height:1.55}
.prototype-inspector__controls{display:grid;gap:12px;min-width:0;margin:0;padding:0;border:0}.prototype-inspector__controls label{display:grid;gap:5px;color:#595959;font-size:12px}.prototype-inspector__controls input,.prototype-inspector__controls select{box-sizing:border-box;width:100%;height:34px;min-width:0;padding:0 9px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#1f1f1f;font:inherit}.prototype-inspector__controls input:focus,.prototype-inspector__controls select:focus{outline:2px solid #e6f4ff;border-color:#1677ff}.prototype-inspector__node{display:flex;justify-content:space-between;gap:10px;margin:0;padding:10px;border-radius:6px;background:#f5f7fa}.prototype-inspector__node strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.prototype-inspector__node span{flex:none;color:#8c8c8c;font-size:11px}.prototype-inspector__warning{padding:9px;border-radius:6px;background:#fff7e6;color:#ad6800}
</style>
