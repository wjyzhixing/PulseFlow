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
<template><div class="panel"><div class="eyebrow">ACCESS / WORKSPACE TOKEN</div><h2 class="page-title">进入工作区</h2><p class="lede">验证工作区令牌后开始建模。令牌仅在本次页面会话的内存中使用。</p><form class="card" @submit.prevent="login"><h2>身份验证 <span class="tag">SECURE SESSION</span></h2><label class="field-label" for="token">工作区令牌</label><input id="token" v-model="tokenInput" data-testid="token-input" class="input" type="password" autocomplete="off" placeholder="输入访问令牌"><p v-if="error" class="error" role="alert">{{ error }}</p><AButton class="btn" data-testid="login-submit" :disabled="busy" html-type="submit">{{ busy ? '正在验证…' : '进入 Studio →' }}</AButton></form></div></template>
