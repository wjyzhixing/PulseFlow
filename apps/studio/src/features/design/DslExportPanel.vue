<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { EntityField } from '@pulseflow/ui-dsl';
import { exportValidatedDsl } from './dsl-export';

const props = defineProps<{ dsl: unknown; entityFields: readonly EntityField[]; assetIds: readonly string[] }>();
const emit = defineEmits<{ close: [] }>();
const feedback = shallowRef('');
const result = computed(() => exportValidatedDsl(props.dsl, props.entityFields, props.assetIds));

async function copyDsl(): Promise<void> {
  if (!result.value.ok) return;
  try {
    await navigator.clipboard.writeText(result.value.jsonText);
    feedback.value = 'UI-DSL 已复制到剪贴板';
  } catch {
    feedback.value = '复制失败，请检查浏览器剪贴板权限后重试';
  }
}

function downloadDsl(): void {
  if (!result.value.ok) return;
  const blob = new Blob([result.value.jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${result.value.dsl.pageId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  feedback.value = 'UI-DSL 文件已开始下载';
}
</script>

<template>
  <section class="dsl-export" aria-labelledby="dsl-export-title" role="dialog" aria-modal="true">
    <header class="dsl-export__header">
      <div><span>有效页面数据</span><h2 id="dsl-export-title">导出 UI-DSL</h2></div>
      <button type="button" aria-label="关闭导出面板" @click="emit('close')">关闭</button>
    </header>
    <p class="dsl-export__hint">导出文件只包含页面 DSL，不包含选中状态、画布尺寸或编辑器设置。</p>
    <div v-if="result.ok" class="dsl-export__valid" role="status">页面和资源引用校验通过</div>
    <div v-else class="dsl-export__invalid" role="alert">
      <strong>当前页面不能导出</strong>
      <ul><li v-for="item in result.diagnostics" :key="`${item.code}:${item.path}`"><code>{{ item.path }}</code>：{{ item.message }}</li></ul>
    </div>
    <pre v-if="result.ok" class="dsl-export__preview"><code>{{ result.jsonText }}</code></pre>
    <p v-if="feedback" class="dsl-export__feedback" role="status">{{ feedback }}</p>
    <footer class="dsl-export__actions">
      <button data-testid="copy-dsl" type="button" :disabled="!result.ok" @click="copyDsl">复制 JSON</button>
      <button data-testid="download-dsl" type="button" :disabled="!result.ok" @click="downloadDsl">下载 JSON</button>
    </footer>
  </section>
</template>

<style scoped>
.dsl-export{position:fixed;z-index:1000;inset:5vh 5vw;display:flex;flex-direction:column;gap:16px;padding:24px;border:1px solid #d9d9d9;border-radius:8px;background:#fff;box-shadow:0 16px 48px rgba(0,0,0,.2);color:#1f1f1f}
.dsl-export__header,.dsl-export__actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.dsl-export__header span{color:#8c8c8c;font-size:12px}.dsl-export__header h2{margin:4px 0 0;font-size:20px}.dsl-export__hint{margin:0;color:#595959;font-size:13px}.dsl-export__valid,.dsl-export__invalid{padding:10px 12px;border-radius:6px;font-size:13px}.dsl-export__valid{background:#f6ffed;color:#389e0d}.dsl-export__invalid{background:#fff2f0;color:#cf1322}.dsl-export__invalid ul{margin:8px 0 0;padding-left:20px}.dsl-export__invalid code{font-size:12px}.dsl-export__preview{flex:1;min-height:120px;margin:0;overflow:auto;padding:16px;border:1px solid #f0f0f0;border-radius:6px;background:#fafafa;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}.dsl-export__feedback{margin:0;color:#1677ff;font-size:13px}.dsl-export__actions{justify-content:flex-end;margin-top:auto}.dsl-export button{min-height:34px;padding:0 14px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#262626;font:inherit;cursor:pointer}.dsl-export button:hover:not(:disabled){border-color:#4096ff;color:#1677ff}.dsl-export button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:640px){.dsl-export{inset:2vh 3vw;padding:16px}}
</style>
