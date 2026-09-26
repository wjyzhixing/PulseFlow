<script setup lang="ts">
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue';

export interface DesignChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tone?: 'error' | 'muted';
}

export interface ImageReview {
  status: 'generating' | 'ready' | 'failed' | 'needs_confirmation';
  imageUrl?: string;
  alt?: string;
  message?: string;
  canReplace?: boolean;
}

export type ImageAction = 'apply-inline' | 'apply-background' | 'regenerate' | 'remove';

const props = defineProps<{ messages: readonly DesignChatMessage[]; pending: boolean; disabled?: boolean; resetKey?: number; imageReview?: ImageReview }>();
const emit = defineEmits<{ submit: [instruction: string]; 'image-action': [action: ImageAction] }>();
const instruction = shallowRef('');
const messageBody = useTemplateRef<HTMLDivElement>('messageBody');
watch(() => props.resetKey, () => { instruction.value = ''; });
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
  if (!value || props.pending || props.disabled) return;
  emit('submit', value);
}
</script>

<template>
  <section class="design-chat" aria-labelledby="design-chat-title">
    <header class="design-chat__header">
      <div>
        <h2 id="design-chat-title">对话调整页面</h2>
        <p>基于当前画布提出修改，结果通过结构校验后才会应用。</p>
      </div>
      <span class="design-chat__badge">页面迭代</span>
    </header>

    <div ref="messageBody" class="design-chat__body" aria-live="polite" aria-relevant="additions text">
      <p v-if="!messages.length" class="design-chat__empty">例如：让首页更像企业官网，加入清晰的首屏介绍、功能区和咨询入口。</p>
      <ol v-else class="design-chat__messages" aria-label="对话记录">
        <li v-for="message in messages" :key="message.id" class="design-chat__message" :class="[`is-${message.role}`, message.tone ? `is-${message.tone}` : '']">
          <span class="design-chat__role">{{ message.role === 'user' ? '你' : 'PulseFlow' }}</span>
          <p>{{ message.text }}</p>
        </li>
      </ol>
      <p v-if="pending" class="design-chat__pending" role="status"><span class="design-chat__spinner" aria-hidden="true"></span>正在分析当前页面并生成修改…</p>
    </div>

    <section v-if="imageReview" class="design-chat__image-review" data-testid="image-review" aria-labelledby="image-review-title" :aria-busy="imageReview.status === 'generating'">
      <div class="design-chat__image-heading">
        <h3 id="image-review-title">图片生成预览</h3>
        <p data-testid="image-cost-notice">每次生成或重新生成图片可能产生费用。<a data-testid="image-model-catalog" href="https://tokenrhythm.studio/models" target="_blank" rel="noopener noreferrer">查看模型目录与价格</a></p>
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
      <textarea id="design-chat-input" v-model="instruction" rows="3" maxlength="2000" placeholder="描述你希望如何调整页面…" :disabled="disabled || pending"></textarea>
      <div class="design-chat__composer-footer">
        <span>最多 2000 字 · 不会生成或执行业务代码</span>
        <button type="submit" :disabled="disabled || pending || !instruction.trim()">{{ pending ? '处理中…' : '应用修改' }}</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.design-chat{min-width:0;margin-top:var(--pf-space-5);overflow:hidden;border:var(--pf-border-width) solid var(--pf-color-border);border-radius:var(--pf-radius);background:var(--pf-color-surface);box-shadow:var(--pf-shadow-sm)}
.design-chat__header{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--pf-space-3);padding:var(--pf-space-4);border-bottom:var(--pf-border-width) solid var(--pf-color-border-secondary)}
.design-chat__header h2{margin:0;color:var(--pf-color-text);font-size:var(--pf-font-size-lg);font-weight:600}
.design-chat__header p{margin:var(--pf-space-1) 0 0;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
.design-chat__badge{flex:none;padding:2px var(--pf-space-2);border-radius:var(--pf-radius-sm);background:#e6f4ff;color:var(--pf-color-primary-strong);font-size:var(--pf-font-size-sm)}
.design-chat__body{max-height:320px;overflow:auto;padding:var(--pf-space-4)}
.design-chat__empty{margin:0;color:var(--pf-color-text-secondary);font-size:var(--pf-font-size-sm);line-height:var(--pf-line-height)}
.design-chat__messages{display:grid;gap:var(--pf-space-3);margin:0;padding:0;list-style:none}
.design-chat__message{max-width:min(780px,92%);padding:var(--pf-space-3);border:var(--pf-border-width) solid var(--pf-color-border-secondary);border-radius:var(--pf-radius);background:#fafafa}
.design-chat__message.is-user{justify-self:end;border-color:#d6e4ff;background:#f0f5ff}
.design-chat__message.is-error{border-color:#ffccc7;background:#fff2f0}
.design-chat__role{color:var(--pf-color-text-secondary);font-size:11px;font-weight:600}
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
@media(max-width:640px){.design-chat__header{flex-direction:column}.design-chat__message{max-width:100%}.design-chat__composer-footer{align-items:flex-end}.design-chat__composer-footer span{max-width:60%}}
@media(prefers-reduced-motion:reduce){.design-chat__spinner{animation-duration:1.8s}}
</style>
