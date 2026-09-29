<script setup lang="ts">
import { shallowRef } from 'vue';
export interface StudioImageAsset {
  id: string;
  name: string;
  url?: string;
  used: boolean;
}

const props = defineProps<{
  assets: readonly StudioImageAsset[];
  actionLabel: string;
  disabled?: boolean;
  uploading?: boolean;
  uploadError?: string;
}>();
const emit = defineEmits<{ apply: [assetId: string]; upload: [file: File] }>();
const uploadInput = shallowRef<HTMLInputElement | null>(null);

function onUploadChange(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = '';
  if (file) emit('upload', file);
}

function startAssetDrag(event: DragEvent, asset: StudioImageAsset): void {
  if (!asset.url || props.disabled || props.uploading || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData('application/x-pulseflow-image-asset', asset.id);
  event.dataTransfer.effectAllowed = 'copy';
}
</script>

<template>
  <section class="assets-panel" aria-labelledby="assets-title">
    <header class="assets-heading">
      <div>
        <span class="assets-kicker">02 / LIBRARY</span>
        <h2 id="assets-title">图片素材</h2>
      </div>
      <div class="assets-heading-actions">
        <span class="assets-count">{{ assets.length }}</span>
        <input ref="uploadInput" class="asset-upload-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择要上传的图片" :disabled="disabled || uploading" @change="onUploadChange" />
        <button type="button" class="asset-upload-button" :disabled="disabled || uploading" @click="uploadInput?.click()">{{ uploading ? '上传中…' : '上传图片' }}</button>
      </div>
    </header>
    <p class="assets-hint">选中素材卡片上的按钮，将图片应用到当前页面。生成或导入的图片也会显示在这里。</p>
    <p v-if="uploadError" class="assets-upload-error" role="alert">{{ uploadError }}</p>
    <div v-if="assets.length" class="assets-grid">
      <article
        v-for="asset in assets"
        :key="asset.id"
        class="asset-card"
        :data-testid="`asset-card-${asset.id}`"
        :draggable="Boolean(asset.url) && !disabled && !uploading"
        @dragstart="startAssetDrag($event, asset)"
      >
        <div class="asset-preview">
          <img v-if="asset.url" :src="asset.url" :alt="asset.name" loading="lazy" />
          <span v-else class="asset-preview-empty" role="status">正在载入</span>
          <span v-if="asset.used" class="asset-used">已使用</span>
        </div>
        <div class="asset-card-footer">
          <span class="asset-name" :title="asset.name">{{ asset.name }}</span>
          <button
            type="button"
            class="asset-apply"
            :disabled="disabled || !asset.url"
            :aria-label="`${actionLabel}${asset.name}`"
            @click="emit('apply', asset.id)"
          >
            {{ actionLabel }}
          </button>
        </div>
      </article>
    </div>
    <div v-else class="assets-empty" role="status">
      <span aria-hidden="true">▧</span>
      <strong>还没有图片素材</strong>
      <p>通过对话生成图片，或使用“图片转 UI-DSL”导入页面截图。</p>
    </div>
  </section>
</template>

<style scoped>
.assets-panel{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;gap:10px;padding:14px 12px;overflow:auto;background:#fff;color:#262626}
.assets-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px 10px;border-bottom:1px solid #f0f0f0}
.assets-heading-actions{display:flex;align-items:center;gap:6px}.asset-upload-input{display:none}.asset-upload-button{height:26px;padding:0 8px;border:1px solid #91caff;border-radius:4px;background:#e6f4ff;color:#0958d9;font:inherit;font-size:10px;cursor:pointer}.asset-upload-button:hover:not(:disabled){border-color:#1677ff;background:#1677ff;color:#fff}.asset-upload-button:disabled{opacity:.5;cursor:not-allowed}.assets-upload-error{margin:0;padding:7px 8px;border:1px solid #ffccc7;border-radius:4px;background:#fff2f0;color:#a8071a;font-size:10px;line-height:1.45}
.assets-kicker{color:#8c8c8c;font-size:9px;font-weight:600;letter-spacing:.06em}
.assets-heading h2{margin:3px 0 0;font-size:14px;font-weight:600}
.assets-count{display:grid;min-width:23px;height:23px;place-items:center;border-radius:12px;background:#f5f5f5;color:#595959;font-size:11px}
.assets-hint{margin:0;color:#8c8c8c;font-size:11px;line-height:1.5}
.assets-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:10px}
.asset-card{min-width:0;overflow:hidden;border:1px solid #f0f0f0;border-radius:7px;background:#fff;transition:border-color .15s,box-shadow .15s}
.asset-card:hover{border-color:#91caff;box-shadow:0 2px 8px #1677ff14}
.asset-preview{position:relative;display:grid;aspect-ratio:4/3;place-items:center;overflow:hidden;background:#f5f7fa}
.asset-preview img{width:100%;height:100%;object-fit:cover}
.asset-preview-empty{color:#8c8c8c;font-size:10px}
.asset-used{position:absolute;right:5px;top:5px;padding:2px 5px;border-radius:4px;background:#f6ffed;color:#389e0d;font-size:9px}
.asset-card-footer{display:grid;gap:6px;padding:7px}
.asset-name{overflow:hidden;color:#434343;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
.asset-apply{min-height:26px;padding:0 5px;border:1px solid #91caff;border-radius:4px;background:#e6f4ff;color:#0958d9;font:inherit;font-size:10px;cursor:pointer}
.asset-apply:hover:not(:disabled){border-color:#1677ff;background:#1677ff;color:#fff}
.asset-apply:disabled{opacity:.5;cursor:not-allowed}
.asset-apply:focus-visible{outline:2px solid #1677ff;outline-offset:1px}
.assets-empty{display:grid;flex:1;align-content:center;justify-items:center;gap:7px;min-height:180px;padding:10px;text-align:center;color:#8c8c8c}
.assets-empty>span{font-size:26px;color:#bfbfbf}
.assets-empty strong{color:#595959;font-size:12px}
.assets-empty p{max-width:190px;margin:0;font-size:11px;line-height:1.5}
</style>
