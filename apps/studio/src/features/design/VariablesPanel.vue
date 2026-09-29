<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { DeepReadonly } from 'vue';
import type { PageDsl, UiNode } from '@pulseflow/ui-dsl';
import StudioIcon from './StudioIcon.vue';

const props = defineProps<{ page: DeepReadonly<PageDsl> }>();
const emit = defineEmits<{ updateVariables: [variables: Array<{ id: string; name: string; value: string }> ] }>();
const errors = shallowRef<Record<string, string>>({});
const variables = computed(() => props.page.theme?.colorVariables ?? []);
const usageCounts = computed(() => {
  const counts: Record<string, number> = {};
  const visit = (nodes: readonly DeepReadonly<UiNode>[]) => nodes.forEach((node) => {
    const references = [node.design?.fillVariableId, node.design?.typography?.colorVariableId];
    references.forEach((id) => { if (id) counts[id] = (counts[id] ?? 0) + 1; });
    visit(node.children);
    node.slots.forEach((slot) => { if ('children' in slot) visit(slot.children); });
  });
  visit(props.page.nodes);
  return counts;
});

function commit(next: Array<{ id: string; name: string; value: string }>, clearErrorId?: string): void {
  emit('updateVariables', next);
  if (clearErrorId) {
    const { [clearErrorId]: _, ...remaining } = errors.value;
    errors.value = remaining;
  }
}

function addVariable(): void {
  if (variables.value.length >= 64) return;
  const id = `color-${crypto.randomUUID()}`;
  let sequence = variables.value.length + 1;
  let name = `Color ${sequence}`;
  while (variables.value.some((item) => item.name === name)) name = `Color ${++sequence}`;
  commit([...variables.value.map((item) => ({ ...item })), { id, name, value: '#1677FF' }]);
}

function renameVariable(id: string, rawName: string): void {
  const name = rawName.trim();
  if (!name) {
    errors.value = { ...errors.value, [id]: '名称不能为空。' };
    return;
  }
  if (name.length > 120) {
    errors.value = { ...errors.value, [id]: '名称最多 120 个字符。' };
    return;
  }
  if (variables.value.some((item) => item.id !== id && item.name === name)) {
    errors.value = { ...errors.value, [id]: '变量名称不能重复。' };
    return;
  }
  commit(variables.value.map((item) => item.id === id ? { ...item, name } : { ...item }), id);
}

function updateVariableColor(id: string, value: string): void {
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return;
  commit(variables.value.map((item) => item.id === id ? { ...item, value } : { ...item }));
}

function removeVariable(id: string): void {
  if (usageCounts.value[id]) return;
  commit(variables.value.filter((item) => item.id !== id).map((item) => ({ ...item })));
}
</script>

<template>
  <section class="variables-panel" aria-label="设计变量">
    <header class="variables-panel__header">
      <div><h2>Variables</h2><p>在多个图层间复用颜色</p></div>
      <button type="button" aria-label="新建颜色变量" title="新建颜色变量" :disabled="variables.length >= 64" @click="addVariable"><StudioIcon name="plus" :size="16" /></button>
    </header>
    <p v-if="variables.length === 0" class="variables-panel__empty">还没有颜色变量。新建变量后，可在 Fill 和 Typography 中绑定。</p>
    <ul v-else class="variables-list">
      <li v-for="variable in variables" :key="variable.id" class="variable-row">
        <input class="variable-swatch" type="color" :aria-label="`${variable.name} 颜色值`" :value="variable.value" @change="updateVariableColor(variable.id, ($event.target as HTMLInputElement).value)">
        <div class="variable-row__details">
          <input class="variable-name" :aria-label="`${variable.name} 变量名称`" :value="variable.name" maxlength="120" @change="renameVariable(variable.id, ($event.target as HTMLInputElement).value)">
          <code>{{ variable.value.toUpperCase() }}</code>
          <small v-if="errors[variable.id]" class="variable-error" role="alert">{{ errors[variable.id] }}</small>
          <small v-else>{{ usageCounts[variable.id] ?? 0 }} 处引用</small>
        </div>
        <button type="button" class="variable-remove" :aria-label="usageCounts[variable.id] ? `${variable.name} 正在使用` : `删除 ${variable.name}`" :title="usageCounts[variable.id] ? '先解除所有图层引用' : '删除变量'" :disabled="Boolean(usageCounts[variable.id])" @click="removeVariable(variable.id)"><StudioIcon name="close" :size="14" /></button>
      </li>
    </ul>
    <p class="variables-panel__note">颜色变量保存在当前页面的 UI-DSL 中，修改变量值会同步更新所有引用它的图层。</p>
  </section>
</template>

<style scoped>
.variables-panel{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;padding:14px 10px;background:#fff;color:#262626}.variables-panel__header{display:flex;align-items:center;justify-content:space-between;padding:0 4px 10px;border-bottom:1px solid #f0f0f0}.variables-panel__header h2{margin:0;font-size:14px;font-weight:600}.variables-panel__header p{margin:4px 0 0;color:#8c8c8c;font-size:11px}.variables-panel__header button,.variable-remove{display:grid;width:26px;height:26px;place-items:center;border:1px solid #d9d9d9;border-radius:5px;background:#fff;color:#595959;cursor:pointer}.variables-panel__header button:hover:not(:disabled){border-color:#91caff;color:#1677ff}.variables-panel__header button:disabled,.variable-remove:disabled{opacity:.4;cursor:not-allowed}.variables-panel__empty{margin:8px 4px;color:#8c8c8c;font-size:12px;line-height:1.6}.variables-list{display:grid;gap:4px;margin:0;padding:0;list-style:none}.variable-row{display:flex;align-items:center;gap:8px;min-width:0;padding:7px 5px;border-radius:5px}.variable-row:hover{background:#fafafa}.variable-swatch{flex:none;width:26px;height:26px;padding:2px;border:1px solid #d9d9d9;border-radius:5px;background:#fff}.variable-row__details{display:grid;flex:1;min-width:0;gap:2px}.variable-name{width:100%;min-width:0;padding:2px 3px;border:1px solid transparent;border-radius:3px;background:transparent;color:#262626;font:inherit;font-size:12px}.variable-name:focus{border-color:#91caff;outline:2px solid #e6f4ff;background:#fff}.variable-row__details code,.variable-row__details small{padding:0 3px;color:#8c8c8c;font-size:10px}.variable-error{color:#cf1322!important}.variable-remove{flex:none;border-color:transparent;color:#8c8c8c}.variable-remove:hover:not(:disabled){border-color:#ffccc7;background:#fff2f0;color:#cf1322}.variables-panel__note{margin:auto 4px 0;padding-top:10px;border-top:1px solid #f0f0f0;color:#8c8c8c;font-size:10px;line-height:1.55}
</style>
