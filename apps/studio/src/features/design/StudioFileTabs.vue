<script setup lang="ts">
import type { StudioFileSummary } from '@pulseflow/contracts';
import StudioIcon from './StudioIcon.vue';

defineProps<{
  files: readonly StudioFileSummary[];
  activeFileId: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  select: [fileId: string];
  create: [];
}>();
</script>

<template>
  <nav class="studio-file-tabs" role="tablist" aria-label="最近设计文件">
    <button
      v-for="file in files"
      :key="file.id"
      type="button"
      role="tab"
      :aria-selected="file.id === activeFileId"
      :title="file.title"
      :disabled="disabled"
      @click="emit('select', file.id)"
    >
      <StudioIcon name="file" :size="15" />
      <span>{{ file.title }}</span>
    </button>
    <button class="studio-file-tabs__create" type="button" aria-label="新建设计文件" title="新建设计文件" :disabled="disabled" @click="emit('create')">
      <StudioIcon name="plus" :size="16" />
    </button>
  </nav>
</template>

<style scoped>
.studio-file-tabs{display:flex;align-self:stretch;align-items:flex-end;min-width:0;flex:1;overflow-x:auto;scrollbar-width:thin}
.studio-file-tabs button{display:flex;flex:none;align-items:center;gap:8px;height:35px;max-width:min(260px,48vw);padding:0 12px;border:1px solid #d5dbe4;border-bottom-color:transparent;border-radius:6px 6px 0 0;background:#e8ecf2;color:#595959;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.studio-file-tabs button[aria-selected="true"]{border-color:#d5dbe4;border-bottom-color:#fff;background:#fff;color:#1677ff}
.studio-file-tabs button span{overflow:hidden;text-overflow:ellipsis}
.studio-file-tabs button:disabled{cursor:wait;opacity:.65}
.studio-file-tabs .studio-file-tabs__create{width:36px;max-width:36px;justify-content:center;padding:0;border-color:transparent;background:transparent;color:#595959}
.studio-file-tabs .studio-file-tabs__create:hover:not(:disabled){background:#fff;color:#1677ff}
.studio-file-tabs button:focus-visible{position:relative;outline:2px solid #1677ff;outline-offset:-2px}
</style>
