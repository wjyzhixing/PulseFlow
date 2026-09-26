<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue';
import { shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { request } from '../../shared/api/client';
import { setToken } from './auth-store';
const tokenInput = shallowRef('');
const error = shallowRef('');
const busy = shallowRef(false);
const router = useRouter(); const route = useRoute();
async function login() {
  if (!tokenInput.value.trim()) { error.value = '请输入工作区令牌'; return; }
  busy.value = true; error.value = '';
  try {
    const response = await request<{ authenticated: boolean }>('/api/session/validate', { token: tokenInput.value.trim() }, false);
    if (!response.authenticated) throw new Error('令牌验证失败');
    setToken(tokenInput.value.trim()); tokenInput.value = '';
    await router.replace(typeof route.query.next === 'string' ? route.query.next : '/requirements');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '登录失败'; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="panel login-panel">
    <h2 class="page-title">进入工作区</h2>
    <p class="lede">验证工作区令牌后开始建模。令牌仅在本次页面会话的内存中使用。</p>
    <form class="card login-card" @submit.prevent="login">
      <h3>身份验证</h3>
      <label class="field-label" for="token">工作区令牌</label>
      <input id="token" v-model="tokenInput" data-testid="token-input" class="input" type="password" autocomplete="off" placeholder="输入访问令牌">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="action-row">
        <AButton class="btn" data-testid="login-submit" :disabled="busy" html-type="submit">{{ busy ? '正在验证…' : '进入 Studio →' }}</AButton>
      </div>
    </form>
  </div>
</template>
<style scoped>
.login-panel { max-width: 560px; }
.page-title { margin: 0 0 var(--pf-space-1); color: var(--pf-color-text); font: 600 24px/1.4 var(--pf-font-family); letter-spacing: 0; }
.lede { margin: 0 0 var(--pf-space-5); color: var(--pf-color-text-secondary); line-height: var(--pf-line-height); }
.login-card { margin: 0; padding: var(--pf-space-5); background: var(--pf-color-surface); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius); box-shadow: var(--pf-shadow-sm); }
.login-card h3 { margin: 0 0 var(--pf-space-4); font-size: var(--pf-font-size-lg); font-weight: 600; }
.field-label { margin: 0 0 var(--pf-space-2); color: var(--pf-color-text); font-size: var(--pf-font-size); font-weight: 500; }
.input { min-height: 40px; padding: var(--pf-space-2) var(--pf-space-3); border: var(--pf-border-width) solid var(--pf-color-border); border-radius: var(--pf-radius); color: var(--pf-color-text); font: inherit; }
.input:hover { border-color: var(--pf-color-primary-hover); }
.input:focus { border-color: var(--pf-color-primary); outline: 2px solid rgba(22, 119, 255, .16); outline-offset: 0; }
.error { margin: var(--pf-space-3) 0 0; padding: var(--pf-space-2) var(--pf-space-3); color: var(--pf-color-error-text); background: #fff2f0; border: var(--pf-border-width) solid #ffccc7; border-radius: var(--pf-radius); }
.action-row { display: flex; justify-content: flex-end; margin-top: var(--pf-space-5); }
.btn { min-height: 36px; margin: 0; padding: var(--pf-space-1) var(--pf-space-4); border: var(--pf-border-width) solid var(--pf-color-primary); border-radius: var(--pf-radius); background: var(--pf-color-primary); color: #fff; font: inherit; font-weight: 400; box-shadow: var(--pf-shadow-sm); }
.btn:hover { border-color: var(--pf-color-primary-hover); background: var(--pf-color-primary-hover); color: #fff; }
.btn:focus-visible { outline: 2px solid var(--pf-color-primary); outline-offset: 2px; }
.btn:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 560px) { .login-card { padding: var(--pf-space-4); } .action-row .btn { width: 100%; } }
</style>
