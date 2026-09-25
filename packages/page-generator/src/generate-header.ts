/** Project-owned header included in the generated bundle, with no UI-library PageHeader dependency. */
export function generateHeader(): string {
  return `<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>
<template>
  <header class="page-header">
    <div class="page-header__copy"><span class="page-header__eyebrow">PULSEFLOW / GENERATED VIEW</span><h1>{{ title }}</h1><p v-if="subtitle">{{ subtitle }}</p></div>
    <div v-if="$slots.tags" class="page-header__tags"><slot name="tags" /></div>
  </header>
</template>
<style scoped>
.page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:0 0 22px;border-bottom:3px solid #d2f473}.page-header__eyebrow{display:inline-block;font:700 10px 'DM Mono',monospace;letter-spacing:.16em;color:#286762;margin-bottom:10px}.page-header__copy h1{font:700 clamp(27px,3vw,42px)/1.15 'Noto Serif SC',serif;letter-spacing:-.035em;margin:0;color:#173943}.page-header__copy p{margin:9px 0 0;color:#607775}.page-header__tags{display:flex;align-items:center;gap:8px;flex-wrap:wrap}@media(max-width:640px){.page-header{flex-direction:column}}
</style>
`;
}
