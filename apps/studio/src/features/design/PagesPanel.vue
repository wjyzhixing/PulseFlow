<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import StudioIcon from './StudioIcon.vue';

interface PageEntry { id: string; title: string }
const props = defineProps<{ pages: readonly PageEntry[]; activePageId: string; disabled?: boolean }>();
const emit = defineEmits<{
  addPage: [];
  selectPage: [pageId: string];
  renamePage: [pageId: string, title: string];
  reorderPage: [payload: { sourcePageId: string; targetPageId: string; placement: 'before' | 'after' }];
}>();

const searchOpen = shallowRef(false);
const query = shallowRef('');
const editingPageId = shallowRef<string | null>(null);
const editingTitle = shallowRef('');
const draggedPageId = shallowRef<string | null>(null);
const dropTarget = shallowRef<{ pageId: string; placement: 'before' | 'after' } | null>(null);
const searchInput = useTemplateRef<HTMLInputElement>('searchInput');
const pagesPanel = useTemplateRef<HTMLElement>('pagesPanel');
const visiblePages = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase();
  return normalized ? props.pages.filter((page) => page.title.toLocaleLowerCase().includes(normalized)) : props.pages;
});

watch(searchOpen, (open) => {
  if (open) void nextTick(() => searchInput.value?.focus());
  else query.value = '';
});

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
}

function beginRename(page: PageEntry): void {
  if (props.disabled || page.id !== props.activePageId) return;
  editingPageId.value = page.id;
  editingTitle.value = page.title;
  void nextTick(() => {
    const input = pagesPanel.value?.querySelector<HTMLInputElement>('.page-title-input');
    input?.focus();
    input?.select();
  });
}

function cancelRename(): void {
  editingPageId.value = null;
  editingTitle.value = '';
}

function commitRename(pageId: string): void {
  if (editingPageId.value !== pageId) return;
  const title = editingTitle.value.trim();
  cancelRename();
  if (title) emit('renamePage', pageId, title);
}

function startPageDrag(pageId: string, event: DragEvent): void {
  if (props.disabled) return;
  draggedPageId.value = pageId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-pulseflow-page', pageId);
  }
}

function finishPageDrag(): void {
  draggedPageId.value = null;
  dropTarget.value = null;
}

function dropPlacement(target: EventTarget | null, clientY: number): 'before' | 'after' {
  const bounds = target instanceof HTMLElement ? target.getBoundingClientRect() : null;
  return bounds && clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before';
}

function markPageDropTarget(pageId: string, event: DragEvent): void {
  if (draggedPageId.value && draggedPageId.value !== pageId) {
    dropTarget.value = { pageId, placement: dropPlacement(event.currentTarget, event.clientY) };
  }
}

function reorderPage(targetPageId: string, event: DragEvent): void {
  event.preventDefault();
  const sourcePageId = draggedPageId.value;
  if (sourcePageId && sourcePageId !== targetPageId && !props.disabled) {
    const placement = dropTarget.value?.pageId === targetPageId
      ? dropTarget.value.placement
      : dropPlacement(event.currentTarget, event.clientY);
    emit('reorderPage', { sourcePageId, targetPageId, placement });
  }
  finishPageDrag();
}
</script>

<template>
  <section ref="pagesPanel" class="pages-panel" aria-label="Pages">
    <header class="pages-heading">
      <h2>Pages</h2>
      <div class="pages-actions">
        <button type="button" aria-label="搜索页面" :aria-pressed="searchOpen" @click="toggleSearch"><StudioIcon name="search" /></button>
        <button type="button" aria-label="添加页面" :disabled="disabled" @click="emit('addPage')"><StudioIcon name="plus" /></button>
      </div>
    </header>
    <input
      v-if="searchOpen"
      ref="searchInput"
      v-model="query"
      class="pages-search"
      type="search"
      aria-label="搜索页面名称"
      placeholder="搜索页面"
    />
    <div v-if="visiblePages.length" class="pages-list">
      <div
        v-for="page in visiblePages"
        :key="page.id"
        class="page-row"
      >
        <button
          v-if="editingPageId !== page.id"
          type="button"
          class="page-row-button"
          :data-page-id="page.id"
          :aria-current="page.id === activePageId ? 'page' : undefined"
          :title="page.title"
          :class="{
            'page-row-button--dragging': draggedPageId === page.id,
            'page-row-button--drop-before': dropTarget?.pageId === page.id && dropTarget.placement === 'before',
            'page-row-button--drop-after': dropTarget?.pageId === page.id && dropTarget.placement === 'after'
          }"
          :disabled="disabled"
          :draggable="!disabled"
          @click="emit('selectPage', page.id)"
          @dblclick.stop.prevent="beginRename(page)"
          @dragstart="startPageDrag(page.id, $event)"
          @dragover.prevent="markPageDropTarget(page.id, $event)"
          @drop.stop="reorderPage(page.id, $event)"
          @dragend="finishPageDrag"
        >
          <span class="page-icon" aria-hidden="true"></span>
          <span class="page-title">{{ page.title }}</span>
        </button>
        <div v-else class="page-row-edit">
          <span class="page-icon" aria-hidden="true"></span>
          <input
            v-model="editingTitle"
            class="page-title-input"
            :aria-label="`重命名页面 ${page.title}`"
            maxlength="120"
            @keydown.enter.prevent="commitRename(page.id)"
            @keydown.esc.prevent.stop="cancelRename"
            @blur="commitRename(page.id)"
          />
        </div>
      </div>
    </div>
    <p v-else class="pages-empty" role="status">没有匹配的页面</p>
  </section>
</template>

<style scoped>
.pages-panel{display:grid;gap:6px;padding:8px 9px 7px;border-bottom:1px solid #f0f0f0;background:#fff}
.pages-heading{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:24px}
.pages-heading h2{margin:0;color:#8c8c8c;font-size:10px;font-weight:600;letter-spacing:.08em;line-height:1.2}
.pages-actions{display:flex;gap:1px}
.pages-actions button{display:grid;width:24px;height:24px;place-items:center;border:0;border-radius:5px;background:transparent;color:#595959;font:inherit;font-size:18px;line-height:1;cursor:pointer}.pages-actions svg{display:block;width:14px;height:14px}
.pages-actions button:hover:not(:disabled),.pages-actions button[aria-pressed="true"]{background:#f0f5ff;color:#1677ff}
.pages-actions button:disabled,.pages-list button:disabled{opacity:.45;cursor:not-allowed}
.pages-actions button:focus-visible,.page-row-button:focus-visible{outline:2px solid #1677ff;outline-offset:1px}
.pages-search{width:100%;height:30px;padding:0 8px;border:1px solid #d9d9d9;border-radius:5px;background:#fff;font:inherit;font-size:12px}
.pages-search:focus{border-color:#4096ff;outline:3px solid #1677ff1f}
.pages-list{display:grid;gap:1px;max-height:180px;overflow:auto}
.page-row{display:flex;align-items:center;min-width:0}
.page-row-button,.page-row-edit{display:flex;align-items:center;justify-content:flex-start;gap:6px;width:100%;min-width:0;height:30px;padding:0 6px;border:1px solid transparent;border-radius:5px;background:transparent;color:#262626;text-align:left;font:inherit;font-size:11px}
.page-row-button{cursor:pointer}.page-row-button:hover{background:#f5f5f5;color:#0958d9}.page-row-button--dragging{opacity:.45}.page-row-button--drop-before{box-shadow:inset 0 2px #1677ff}.page-row-button--drop-after{box-shadow:inset 0 -2px #1677ff}
.page-row-button[aria-current="page"]{background:#e6f4ff;color:#0958d9}
.page-icon{width:9px;height:9px;flex:none;border:1px solid currentColor;border-radius:2px;background:#fff}
.page-title{display:flex;flex:1;align-self:stretch;align-items:center;min-width:0;overflow:hidden;color:#595959;font-size:10.5px;font-weight:400;letter-spacing:.01em;line-height:1;text-align:left;text-overflow:ellipsis;white-space:nowrap}
.page-row-button:hover .page-title{color:#1677ff}
.page-row-button[aria-current="page"] .page-title{color:#0958d9;font-weight:500}
.page-title-input{width:100%;min-width:0;height:26px;padding:0 5px;border:1px solid #4096ff;border-radius:4px;background:#fff;color:#0958d9;font:inherit;font-size:12px;outline:2px solid #1677ff1f}
.pages-empty{margin:4px 0;color:#8c8c8c;font-size:12px}
@container resource (max-width:270px){.pages-panel{padding-right:6px;padding-left:6px}.pages-heading{gap:3px}.pages-actions{gap:0}.page-row-button,.page-row-edit{gap:5px;padding-right:4px;padding-left:4px}}
</style>
