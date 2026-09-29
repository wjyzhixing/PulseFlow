<script setup lang="ts">
import { computed, nextTick, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue';
import { validateDesignReferenceFile } from './image-import';

export interface DesignChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tone?: 'error' | 'muted';
  scope?: string;
}

export interface ImageReview {
  status: 'generating' | 'ready' | 'failed' | 'needs_confirmation';
  imageUrl?: string;
  alt?: string;
  message?: string;
  canReplace?: boolean;
}

export type ImageAction = 'apply-inline' | 'apply-background' | 'regenerate' | 'remove';

const props = defineProps<{ messages: readonly DesignChatMessage[]; pending: boolean; disabled?: boolean; resetKey?: number; imageReview?: ImageReview; targetLabel?: string; compact?: boolean }>();
const emit = defineEmits<{ submit: [instruction: string]; importImage: [payload: { file: File; instruction: string }]; 'image-action': [action: ImageAction] }>();
const instruction = shallowRef('');
const attachment = shallowRef<File | null>(null);
const attachmentUrl = shallowRef('');
const attachmentError = shallowRef('');
const attachmentInput = shallowRef<HTMLInputElement | null>(null);
const manuallyCollapsed = shallowRef(false);
const manuallyExpanded = shallowRef(false);
const isCollapsed = computed(() => props.compact ? !manuallyExpanded.value : manuallyCollapsed.value);
const collapsedOffset = shallowRef({ x: 0, y: 0 });
const activeDrag = shallowRef<{
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  originX: number;
  originY: number;
  moved: boolean;
} | null>(null);
const draggedBeforeClick = shallowRef(false);
const collapsedOffsetStyle = computed(() => ({
  '--assistant-drag-x': `${collapsedOffset.value.x}px`,
  '--assistant-drag-y': `${collapsedOffset.value.y}px`
}));
const messageBody = useTemplateRef<HTMLDivElement>('messageBody');
watch(() => props.resetKey, () => { instruction.value = ''; });
watch(() => props.compact, () => {
  manuallyCollapsed.value = false;
  manuallyExpanded.value = false;
  collapsedOffset.value = { x: 0, y: 0 };
});
watch(() => `${props.messages.length}:${props.pending}`, async () => {
  await nextTick();
  const body = messageBody.value;
  if (body) body.scrollTop = body.scrollHeight;
}, { flush: 'post', immediate: true });

const suggestions = [
  '让首屏更清晰，突出最重要的价值和行动按钮',
  '把管理列表整理成筛选区、指标卡和数据表',
  '统一卡片文案，缩短说明并增加留白'
];

function send() {
  const value = instruction.value.trim();
  if ((!value && !attachment.value) || props.pending || props.disabled) return;
  if (attachment.value) {
    emit('importImage', { file: attachment.value, instruction: value });
    instruction.value = '';
    clearAttachment();
    return;
  }
  emit('submit', value);
}

function clearAttachment(): void {
  if (attachmentUrl.value) URL.revokeObjectURL(attachmentUrl.value);
  attachmentUrl.value = '';
  attachment.value = null;
}

function chooseAttachment(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  clearAttachment();
  try {
    validateDesignReferenceFile(file);
    attachment.value = file;
    attachmentUrl.value = URL.createObjectURL(file);
    attachmentError.value = '';
  } catch (error) {
    attachmentError.value = error instanceof Error ? error.message : '无法读取这张图片。';
  }
  (event.target as HTMLInputElement).value = '';
}

function toggleCollapsed(): void {
  if (isCollapsed.value) {
    manuallyExpanded.value = true;
    manuallyCollapsed.value = false;
  } else {
    manuallyExpanded.value = false;
    manuallyCollapsed.value = true;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function startBubbleDrag(event: PointerEvent): void {
  if (!isCollapsed.value || event.button !== 0) return;
  const bubble = (event.currentTarget as HTMLElement).closest<HTMLElement>('.design-chat');
  const bounds = bubble?.parentElement?.getBoundingClientRect();
  const bubbleBounds = bubble?.getBoundingClientRect();
  if (!bubble || !bounds || !bubbleBounds) return;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  activeDrag.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: bubbleBounds.left,
    startTop: bubbleBounds.top,
    originX: collapsedOffset.value.x,
    originY: collapsedOffset.value.y,
    moved: false
  };
}

function moveBubble(event: PointerEvent): void {
  const drag = activeDrag.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const bubble = (event.currentTarget as HTMLElement).closest<HTMLElement>('.design-chat');
  const bounds = bubble?.parentElement?.getBoundingClientRect();
  const bubbleBounds = bubble?.getBoundingClientRect();
  if (!bounds || !bubbleBounds) return;
  const deltaX = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  const clampedX = clamp(deltaX, bounds.left - drag.startLeft, bounds.right - drag.startLeft - bubbleBounds.width);
  const clampedY = clamp(deltaY, bounds.top - drag.startTop, bounds.bottom - drag.startTop - bubbleBounds.height);
  if (Math.hypot(deltaX, deltaY) > 3) drag.moved = true;
  collapsedOffset.value = { x: drag.originX + clampedX, y: drag.originY + clampedY };
}

function finishBubbleDrag(event: PointerEvent): void {
  const drag = activeDrag.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  draggedBeforeClick.value = event.type !== 'pointercancel' && drag.moved;
  activeDrag.value = null;
}

function onRestoreClick(): void {
  if (draggedBeforeClick.value) {
    draggedBeforeClick.value = false;
    return;
  }
  toggleCollapsed();
}

function nudgeBubble(event: KeyboardEvent): void {
  const directions: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }
  };
  const direction = directions[event.key];
  if (!direction || !isCollapsed.value) return;
  const button = event.currentTarget as HTMLElement;
  const bubble = button.closest<HTMLElement>('.design-chat');
  const bounds = bubble?.parentElement?.getBoundingClientRect();
  const bubbleBounds = bubble?.getBoundingClientRect();
  if (!bounds || !bubbleBounds) return;
  event.preventDefault();
  const step = event.shiftKey ? 16 : 6;
  const nextLeft = clamp(bubbleBounds.left + direction.x * step, bounds.left, bounds.right - bubbleBounds.width);
  const nextTop = clamp(bubbleBounds.top + direction.y * step, bounds.top, bounds.bottom - bubbleBounds.height);
  collapsedOffset.value = {
    x: collapsedOffset.value.x + nextLeft - bubbleBounds.left,
    y: collapsedOffset.value.y + nextTop - bubbleBounds.top
  };
}

onScopeDispose(clearAttachment);
</script>

<template>
  <section class="design-chat" :style="collapsedOffsetStyle" :class="{ 'design-chat--conversation': messages.length > 0 || imageReview, 'design-chat--collapsed': isCollapsed, 'design-chat--dragging': activeDrag !== null }" aria-labelledby="design-chat-title">
    <button v-if="isCollapsed" class="design-chat__restore" type="button" aria-label="展开 AI 页面助手（可拖动，方向键微调位置）" aria-expanded="false" @pointerdown="startBubbleDrag" @pointermove="moveBubble" @pointerup="finishBubbleDrag" @pointercancel="finishBubbleDrag" @click="onRestoreClick" @keydown="nudgeBubble">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.25v2.1M8 5.7a6.75 6.75 0 0 0-5 6.52v1.03a2.5 2.5 0 0 0 2.5 2.5h13a2.5 2.5 0 0 0 2.5-2.5v-1.03A6.75 6.75 0 0 0 16 5.7V4.5h-8v1.2Z"/><path d="M8.5 11h.01M15.5 11h.01M9 17.75h6M10 20.5h4"/></svg>
      <span class="design-chat__restore-pulse" aria-hidden="true"></span>
    </button>
    <header class="design-chat__header">
      <div>
        <h2 id="design-chat-title">对话调整页面</h2>
        <p>{{ targetLabel && targetLabel !== '整页' ? '修改范围限定在当前选区及其子图层。' : '基于整页提出修改，结果通过结构校验后才会应用。' }}</p>
      </div>
      <span class="design-chat__badge">页面迭代</span>
      <button class="design-chat__collapse" type="button" aria-label="收起 AI 页面助手" aria-expanded="true" @click="toggleCollapsed">−</button>
    </header>

    <div ref="messageBody" class="design-chat__body" aria-live="polite" aria-relevant="additions text">
      <p v-if="!messages.length" class="design-chat__empty">例如：让首页更像企业官网，加入清晰的首屏介绍、功能区和咨询入口。</p>
      <ol v-else class="design-chat__messages" aria-label="对话记录">
        <li v-for="message in messages" :key="message.id" class="design-chat__message" :class="[`is-${message.role}`, message.tone ? `is-${message.tone}` : '']">
          <span class="design-chat__role">{{ message.role === 'user' ? '你' : 'PulseFlow' }}</span>
          <span v-if="message.scope" class="design-chat__scope-tag">{{ message.scope }}</span>
          <p>{{ message.text }}</p>
        </li>
      </ol>
      <p v-if="pending" class="design-chat__pending" role="status"><span class="design-chat__spinner" aria-hidden="true"></span>正在分析当前页面并生成修改…</p>
    </div>

    <section v-if="imageReview" class="design-chat__image-review" data-testid="image-review" aria-labelledby="image-review-title" :aria-busy="imageReview.status === 'generating'">
      <div class="design-chat__image-heading">
        <h3 id="image-review-title">图片生成预览</h3>
        <p data-testid="image-cost-notice">每次生成或重新生成图片可能产生费用，请在已配置的模型服务控制台查看价格与配额。</p>
      </div>
      <p v-if="imageReview.status === 'generating'" class="design-chat__image-status" data-testid="image-review-status" role="status">正在生成图片，请稍候…</p>
      <p v-else-if="imageReview.status === 'failed'" class="design-chat__image-status is-error" data-testid="image-review-status" role="alert">{{ imageReview.message || '图片生成失败，请重试。' }}</p>
      <template v-else>
        <p v-if="imageReview.message" class="design-chat__image-status" data-testid="image-review-status">{{ imageReview.message }}</p>
        <img v-if="imageReview.imageUrl" class="design-chat__image-preview" data-testid="generated-image-preview" :src="imageReview.imageUrl" :alt="imageReview.alt || '生成的图片预览'" />
        <p v-if="imageReview.status === 'needs_confirmation'" class="design-chat__image-question" data-testid="image-placement-question">这张图片要放在页面中，还是用作背景？请选择位置后应用。</p>
      </template>
      <div v-if="imageReview.status !== 'generating'" class="design-chat__image-actions">
        <template v-if="imageReview.status === 'needs_confirmation' || (imageReview.status === 'ready' && imageReview.imageUrl)">
          <button type="button" data-image-action="apply-inline" :disabled="disabled || pending" @click="emit('image-action', 'apply-inline')">{{ imageReview.status === 'needs_confirmation' ? '生成页面图片' : imageReview.canReplace ? '替换页面图片' : '应用到页面' }}</button>
          <button type="button" data-image-action="apply-background" :disabled="disabled || pending" @click="emit('image-action', 'apply-background')">{{ imageReview.status === 'needs_confirmation' ? '生成背景图片' : imageReview.canReplace ? '替换背景图片' : '用作背景' }}</button>
        </template>
        <button v-if="imageReview.status !== 'needs_confirmation'" type="button" data-image-action="regenerate" :disabled="disabled || pending" @click="emit('image-action', 'regenerate')">重新生成</button>
        <button v-if="imageReview.status === 'ready'" type="button" data-image-action="remove" :disabled="disabled || pending" @click="emit('image-action', 'remove')">移除图片</button>
      </div>
    </section>

    <div v-if="!messages.length" class="design-chat__suggestions" aria-label="修改建议">
      <button v-for="suggestion in suggestions" :key="suggestion" type="button" :disabled="disabled || pending" @click="instruction = suggestion">{{ suggestion }}</button>
    </div>

    <form class="design-chat__composer" @submit.prevent="send">
      <label class="sr-only" for="design-chat-input">描述你希望如何调整页面</label>
      <div class="design-chat__target" data-testid="chat-target-scope"><span>修改目标</span><strong>{{ targetLabel || '整页' }}</strong></div>
      <div v-if="attachment" class="design-chat__attachment" data-testid="chat-image-attachment"><img :src="attachmentUrl" :alt="`待导入图片：${attachment.name}`"><span>{{ attachment.name }}</span><button type="button" aria-label="移除附加图片" :disabled="disabled || pending" @click="clearAttachment">×</button></div>
      <p v-if="attachmentError" class="design-chat__attachment-error" role="alert">{{ attachmentError }}</p>
      <textarea id="design-chat-input" v-model="instruction" rows="3" maxlength="2000" placeholder="描述你希望如何调整页面…" :disabled="disabled || pending"></textarea>
      <div class="design-chat__composer-footer">
        <input ref="attachmentInput" class="design-chat__file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="附加设计参考图" :disabled="disabled || pending" @change="chooseAttachment">
        <button class="design-chat__attach" type="button" aria-label="附加设计参考图" title="附加设计参考图" :disabled="disabled || pending" @click="attachmentInput?.click()"><span aria-hidden="true">＋</span></button>
        <span>文字可结合参考图转换为可编辑 UI-DSL</span>
        <button type="submit" :disabled="disabled || pending || (!instruction.trim() && !attachment)">{{ pending ? '处理中…' : attachment ? '分析图片并转 UI-DSL' : '应用修改' }}</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.design-chat{position:sticky;bottom:12px;z-index:6;width:min(840px,calc(100% - 32px));max-height:58vh;min-width:0;margin:-92px auto 16px;overflow:hidden;border:var(--pf-border-width) solid var(--pf-color-border);border-radius:10px;background:var(--pf-color-surface);box-shadow:0 8px 28px rgba(31,35,41,.16)}
.design-chat--collapsed{box-sizing:border-box!important;display:grid;width:52px!important;min-width:52px!important;height:52px!important;max-height:52px!important;aspect-ratio:1/1;padding:0;overflow:visible;border:0;border-radius:50%;background:transparent;box-shadow:none;transform:translate3d(var(--assistant-drag-x,0),var(--assistant-drag-y,0),0);transition:transform .12s ease-out}
.design-chat--collapsed.design-chat--dragging{transition:none}
.design-chat--collapsed>*:not(.design-chat__restore){display:none!important}
.design-chat__restore{position:relative;isolation:isolate;box-sizing:border-box;display:grid;flex:none;width:52px;height:52px;place-items:center;overflow:visible;border:1px solid #b7d7ff;border-radius:50%;background:linear-gradient(145deg,#fff 8%,#f0f7ff 62%,#e6f4ff 100%);color:#0958d9;box-shadow:0 5px 16px rgba(22,119,255,.2),inset 0 1px 0 #fff;cursor:grab;touch-action:none;user-select:none;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.design-chat__restore::before{position:absolute;z-index:-1;inset:-4px;border:1px solid rgba(22,119,255,.14);border-radius:50%;content:""}
.design-chat__restore:hover{transform:translateY(-1px);border-color:#69b1ff;box-shadow:0 8px 20px rgba(22,119,255,.26),inset 0 1px 0 #fff}
.design-chat__restore:active,.design-chat--dragging .design-chat__restore{transform:scale(.97);cursor:grabbing}
.design-chat__restore:focus-visible{outline:3px solid rgba(22,119,255,.24);outline-offset:4px}
.design-chat__restore svg{display:block;width:23px;height:23px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.6}
.design-chat__restore-pulse{position:absolute;right:12px;bottom:11px;width:5px;height:5px;border:1px solid #fff;border-radius:50%;background:#52c41a;box-shadow:0 0 0 2px #e6f4ff}
.design-chat__collapse{flex:none;width:28px;height:28px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#595959;font-size:18px;line-height:1;cursor:pointer}
.design-chat:not(.design-chat--conversation) .design-chat__header,.design-chat:not(.design-chat--conversation) .design-chat__body,.design-chat:not(.design-chat--conversation) .design-chat__suggestions{display:none}
.design-chat__header{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--pf-space-3);padding:var(--pf-space-4);border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.design-chat__header h2{margin:0;color:var(--pf-color-text);font-size:var(--pf-font-size-lg);font-weight:600}
.design-chat__header p{margin:var(--pf-space-1) 0 0;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
.design-chat__badge{flex:none;padding:2px var(--pf-space-2);border-radius:var(--pf-radius-sm);background:#e6f4ff;color:var(--pf-color-primary-strong);font-size:var(--pf-font-size-sm)}
.design-chat__body{max-height:190px;overflow:auto;padding:var(--pf-space-4)}
.design-chat__empty{margin:0;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
.design-chat__messages{display:grid;gap:var(--pf-space-3);margin:0;padding:0;list-style:none}
.design-chat__message{max-width:min(780px,92%);padding:var(--pf-space-3);border:var(--pf-border-width) solid var(--pf-color-border-secondary);border-radius:var(--pf-radius);background:#fafafa}
.design-chat__message.is-user{justify-self:end;border-color:#d6e4ff;background:#f0f5ff}
.design-chat__message.is-error{border-color:#ffccc7;background:#fff2f0}
.design-chat__role{color:var(--pf-color-text-secondary);font-size:11px;font-weight:600}
.design-chat__scope-tag{display:inline-flex;margin:0 0 0 8px;padding:2px 7px;border-radius:999px;background:#e6f4ff;color:#0958d9;font-size:10px}
.design-chat__message p{margin:var(--pf-space-1) 0 0;color:var(--pf-color-text);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height);white-space:pre-wrap;overflow-wrap:anywhere}
.design-chat__image-review{display:grid;gap:var(--pf-space-3);margin:0 var(--pf-space-4) var(--pf-space-4);padding:var(--pf-space-4);border:var(--pf-border-width) solid var(--pf-color-border-secondary);border-radius:var(--pf-radius);background:#fafcff}
.design-chat__image-heading h3{margin:0;color:var(--pf-color-text);font-size:var(--pf-font-size-sm)}
.design-chat__image-heading p{margin:var(--pf-space-1) 0 0;color:var(--pf-color-text-secondary);font-size:11px;line-height:var(--pf-line-height)}
.design-chat__image-heading a{color:var(--pf-color-primary-strong)}
.design-chat__image-status,.design-chat__image-question{margin:0;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
.design-chat__image-status.is-error{color:#a8071a}
.design-chat__image-preview{display:block;max-width:100%;max-height:320px;object-fit:contain;border-radius:var(--pf-radius-sm);background:#f5f5f5}
.design-chat__image-actions{display:flex;flex-wrap:wrap;gap:var(--pf-space-2)}
.design-chat__image-actions button{min-height:32px;padding:0 var(--pf-space-3);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius-sm);background:var(--pf-color-surface);color:var(--pf-color-text);font-size:var(--pf-font-size-sm);cursor:pointer}
.design-chat__image-actions button[data-image-action^="apply"]{border-color:var(--pf-color-primary);background:var(--pf-color-primary);color:#fff}
.design-chat__image-actions button:disabled{opacity:.55;cursor:not-allowed}
.design-chat__suggestions{display:flex;flex-wrap:wrap;gap:var(--pf-space-2);padding:0 var(--pf-space-4) var(--pf-space-3)}
.design-chat__suggestions button{max-width:100%;padding:var(--pf-space-1) var(--pf-space-2);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius-sm);background:var(--pf-color-surface);color:var(--pf-color-text-secondary);font-size:11px;text-align:left;cursor:pointer}
.design-chat__suggestions button:hover:not(:disabled){border-color:var(--pf-color-primary);color:var(--pf-color-primary-strong)}
.design-chat__composer{padding:var(--pf-space-3) var(--pf-space-4);border-top:var(--pf-border-width) solid var(--pf-color-border-secondary);background:#fafafa}
.design-chat__target{display:flex;align-items:center;gap:7px;margin-bottom:8px;color:var(--pf-color-text-secondary);font-size:11px}.design-chat__target strong{max-width:70%;overflow:hidden;padding:3px 8px;border:1px solid #d6e4ff;border-radius:999px;background:#f0f5ff;color:#0958d9;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.design-chat__attachment{display:flex;align-items:center;gap:9px;margin-bottom:8px;padding:6px 8px;border:1px solid #d6e4ff;border-radius:7px;background:#f0f5ff;color:#434343;font-size:11px}.design-chat__attachment img{width:36px;height:36px;object-fit:cover;border-radius:4px}.design-chat__attachment span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.design-chat__attachment button{width:24px;height:24px;border:0;border-radius:4px;background:transparent;color:#595959;cursor:pointer}.design-chat__attachment-error{margin:0 0 6px;color:#cf1322;font-size:11px}.design-chat__file-input{display:none}.design-chat__composer-footer .design-chat__attach{flex:none;width:30px;height:30px;padding:0;border:1px solid var(--pf-color-border);background:#fff;color:#595959;font-size:20px;line-height:1}
.design-chat__composer textarea{display:block;width:100%;min-height:72px;resize:vertical;padding:var(--pf-space-2) var(--pf-space-3);border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);background:var(--pf-color-surface);color:var(--pf-color-text);font:inherit;font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
.design-chat__composer textarea:focus{outline:2px solid #e6f4ff;border-color:var(--pf-color-primary)}
.design-chat__composer-footer{display:flex;justify-content:space-between;align-items:center;gap:var(--pf-space-3);margin-top:var(--pf-space-2)}
.design-chat__composer-footer span{color:var(--pf-color-text-secondary);font-size:11px}
.design-chat__composer-footer button{min-height:32px;padding:0 var(--pf-space-3);border:var(--pf-border-width) solid var(--pf-color-primary);border-radius:var(--pf-radius-sm);background:var(--pf-color-primary);color:#fff;font-size:var(--pf-font-size-sm);cursor:pointer}
.design-chat__composer-footer button:disabled,.design-chat__suggestions button:disabled{opacity:.55;cursor:not-allowed}
.design-chat__pending{display:flex;align-items:center;gap:var(--pf-space-2);margin:var(--pf-space-3) 0 0;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm)}
.design-chat__spinner{width:14px;height:14px;border:2px solid var(--pf-color-border);border-top-color:var(--pf-color-primary);border-radius:50%;animation:design-chat-spin .8s linear infinite}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes design-chat-spin{to{transform:rotate(360deg)}}
@media(max-width:640px){.design-chat{width:calc(100% - 20px);margin:-64px auto 12px;bottom:8px}.design-chat__header{flex-direction:column}.design-chat__message{max-width:100%}.design-chat__composer-footer{align-items:flex-end}.design-chat__composer-footer span{max-width:60%}.design-chat--collapsed{width:52px!important;min-width:52px!important;height:52px!important;max-height:52px!important}}
@media(prefers-reduced-motion:reduce){.design-chat__spinner{animation-duration:1.8s}}
</style>
