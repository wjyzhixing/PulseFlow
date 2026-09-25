<script setup lang="ts">
import { ConfigProvider } from 'ant-design-vue';
import Page from './generated/Page.vue';

const theme = { token: { colorPrimary: '#176c69', colorInfo: '#176c69', colorSuccess: '#3e8d62', borderRadius: 6, fontFamily: 'system-ui, sans-serif' } };
</script>

<template>
  <ConfigProvider :theme="theme">
    <main class="app-shell"><Page :data="{}" :handlers="{}" /></main>
  </ConfigProvider>
</template>

<style>
body{margin:0;background:#e6ece6;color:#173943}.app-shell{max-width:1200px;margin:32px auto;padding:32px 34px;background:#fffef8;border:1px solid #173943;box-shadow:10px 10px 0 #c9d8cb}.pulseflow-page{display:grid;gap:20px}@media(max-width:640px){.app-shell{margin:0;padding:22px 18px;box-shadow:none}}
</style>
