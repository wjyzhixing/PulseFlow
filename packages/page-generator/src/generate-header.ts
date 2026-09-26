/** Project-owned header included in the generated bundle, with no UI-library PageHeader dependency. */
export function generateHeader(): string {
  return `<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>
<template>
  <header class="pulseflow-page-header">
    <div><h1>{{ title }}</h1><p v-if="subtitle">{{ subtitle }}</p></div>
    <div v-if="$slots.tags" class="pulseflow-page-header__tags"><slot name="tags" /></div>
  </header>
</template>
`;
}
