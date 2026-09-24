<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue';
import { shallowRef } from 'vue';
defineProps<{ text: string; fileName: string; busy: boolean; error: string }>();
const emit = defineEmits<{ 'update:text': [value: string]; file: [value: File | null]; parse: [] }>();
const fileInput = shallowRef<HTMLInputElement | null>(null);
function onFile(event: Event) { emit('file', (event.target as HTMLInputElement).files?.[0] ?? null); }
function resetFile() { if (fileInput.value) fileInput.value.value = ''; }
defineExpose({ resetFile });
</script>
<template><section class="card"><h2>01 / 导入需求 <span class="tag">SOURCE</span></h2><label class="field-label" for="requirement-text">粘贴需求文本</label><textarea id="requirement-text" class="textarea" data-testid="requirement-text" :value="text" placeholder="粘贴业务需求、字段说明或流程约束…" @input="emit('update:text', ($event.target as HTMLTextAreaElement).value)"></textarea><div class="grid-two"><div><label class="field-label" for="requirement-file">或上传 DOCX 文件</label><input id="requirement-file" ref="fileInput" data-testid="requirement-file" class="input" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="onFile"></div><div class="muted" style="align-self:end;padding:12px">{{ fileName || '支持 .docx，最大 10 MB' }}</div></div><p v-if="error" class="error" role="alert">{{ error }}</p><AButton class="btn" data-testid="parse-requirement" :disabled="busy" @click="emit('parse')">{{ busy ? '正在解析…' : '解析需求 →' }}</AButton></section></template>
