<script setup lang="ts">
import { ConfigProvider } from 'ant-design-vue';
import Page from './generated/Page.vue';

const theme = { token: { colorPrimary: '#1677ff', colorInfo: '#1677ff', colorSuccess: '#389e0d', borderRadius: 6, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif' } };
</script>

<template>
  <ConfigProvider :theme="theme">
    <main class="app-shell"><Page :data="{}" :handlers="{}" /></main>
  </ConfigProvider>
</template>

<style>
*{box-sizing:border-box}html,body,#app{min-height:100%;margin:0}body{background:#f5f5f5;color:#1f1f1f}.app-shell{min-height:100vh;width:100%;background:#f5f5f5}
</style>
