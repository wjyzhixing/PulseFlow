import { validatePageDsl, type ComponentType, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';
import { generateTypes } from './generate-types.js';
import { generateEvents } from './generate-events.js';
import { generateHeader } from './generate-header.js';
import { generateRuntime } from './generate-runtime.js';

export interface GeneratedFile { path: string; content: string }

function jsLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

interface BuildContext { declarations: string[]; nextId: number }

const propDefaults: Record<ComponentType, string> = {
  Card: '{ title: undefined as string | undefined }',
  PageHeader: '{ subtitle: undefined as string | undefined }',
  Form: "{ layout: undefined as 'horizontal' | 'vertical' | 'inline' | undefined }",
  FormItem: '{ label: undefined as string | undefined }',
  Input: '{ placeholder: undefined as string | undefined, disabled: undefined as boolean | undefined }',
  Select: '{ placeholder: undefined as string | undefined }',
  Button: "{ variant: undefined as 'primary' | 'default' | 'dashed' | 'text' | 'link' | undefined, event: undefined as string | undefined }",
  Table: '{}', Row: '{ gutter: undefined as number | undefined }', Col: '{}',
  Tag: "{ color: undefined as 'default' | 'success' | 'warning' | 'error' | 'processing' | undefined }",
  Badge: "{ status: undefined as 'default' | 'success' | 'warning' | 'error' | 'processing' | undefined }"
};

function buildNode(node: UiNode, context: BuildContext, fieldId?: string): string {
  const id = `n${context.nextId++}`;
  context.declarations.push(`const ${id} = { ...${propDefaults[node.type]}, ...(${jsLiteral(node.props)} as const) };`);
  if (node.condition) context.declarations.push(`const ${id}Condition = ${jsLiteral(node.condition)} as const;`);
  const conditional = node.condition ? ` v-if="matchesCondition(data, ${id}Condition.fieldId, ${id}Condition.equals)"` : '';
  const children = () => node.children.map((child) => buildNode(child, context, node.type === 'FormItem' ? String(node.props.fieldId) : fieldId)).join('\n');
  switch (node.type) {
    case 'Card': return `<a-card${conditional} :title="${id}.title">${children()}</a-card>`;
    case 'PageHeader': {
      const tags = node.slots.find((slot) => slot.name === 'tags');
      const tagNodes = tags?.name === 'tags' ? tags.children.map((child) => buildNode(child, context)).join('\n') : '';
      return `<PageHeader${conditional} :title="${id}.title" :subtitle="${id}.subtitle">${tagNodes ? `<template #tags>${tagNodes}</template>` : ''}</PageHeader>`;
    }
    case 'Form': return `<a-form${conditional} :layout="${id}.layout ?? 'vertical'">${children()}</a-form>`;
    case 'FormItem': return `<a-form-item${conditional} :label="${id}.label">${children()}</a-form-item>`;
    case 'Input': {
      if (fieldId) context.declarations.push(`const ${id}Field = ${jsLiteral(fieldId)};`);
      return `<a-input${conditional} :placeholder="${id}.placeholder" :disabled="${id}.disabled"${fieldId ? ` :value="displayValue(fieldValue(data, ${id}Field))"` : ''} />`;
    }
    case 'Select': {
      if (fieldId) context.declarations.push(`const ${id}Field = ${jsLiteral(fieldId)};`);
      return `<a-select${conditional} :options="${id}.options.map(option => ({ ...option }))" :placeholder="${id}.placeholder"${fieldId ? ` :value="fieldValue(data, ${id}Field)"` : ''} />`;
    }
    case 'Button': return `<a-button${conditional} :type="${id}.variant ?? 'default'"${node.props.event ? ` @click="invokeEvent(handlers, ${id}.event)"` : ''}>{{ ${id}.label }}</a-button>`;
    case 'Table': {
      const slot = node.slots.find((item) => item.name === 'bodyCell');
      if (slot?.name === 'bodyCell') context.declarations.push(`const ${id}Cases = ${jsLiteral(slot.cases)} as const;`, `const ${id}Field = ${jsLiteral(slot.field)};`);
      const cell = slot?.name === 'bodyCell' ? `<template #bodyCell="{ column, record }"><template v-if="column.dataIndex === ${id}Field"><a-tag v-if="bodyCellLabel(record[${id}Field], ${id}Cases).color" :color="bodyCellLabel(record[${id}Field], ${id}Cases).color">{{ bodyCellLabel(record[${id}Field], ${id}Cases).text }}</a-tag><template v-else>{{ bodyCellLabel(record[${id}Field], ${id}Cases).text }}</template></template><template v-else>{{ tableCellValue(record, column.dataIndex) }}</template></template>` : '';
      return `<a-table${conditional} :columns="tableColumns(${id}.columns)" :data-source="tableRows(data, ${id}.dataSourceKey, ${id}.columns)" :pagination="false">${cell}</a-table>`;
    }
    case 'Row': return `<a-row${conditional} :gutter="${id}.gutter">${children()}</a-row>`;
    case 'Col': return `<a-col${conditional} :span="${id}.span">${children()}</a-col>`;
    case 'Tag': return `<a-tag${conditional} :color="${id}.color">{{ ${id}.text }}</a-tag>`;
    case 'Badge': return `<a-badge${conditional} :status="${id}.status" :text="${id}.text" />`;
  }
}

function generatedSfc(dsl: PageDsl): string {
  const context: BuildContext = { declarations: [], nextId: 0 };
  const markup = dsl.nodes.map((node) => buildNode(node, context)).join('\n');
  return `<script setup lang="ts">\nimport { Card as ACard, Form as AForm, Input as AInput, Select as ASelect, Button as AButton, Table as ATable, Row as ARow, Col as ACol, Tag as ATag, Badge as ABadge } from 'ant-design-vue';\nimport PageHeader from './components/PageHeader.vue';\nimport { displayValue, fieldValue, matchesCondition, invokeEvent, bodyCellLabel, tableCellValue, tableColumns, tableRows } from './runtime';\nimport type { PageData } from './types';\nimport type { PageHandlers } from './events';\nconst { data = {}, handlers = {} } = defineProps<{ data?: PageData; handlers?: PageHandlers }>();\n${context.declarations.join('\n')}\n</script>\n<template>\n<section class="pulseflow-page" data-page-id="${dsl.pageId}">\n${markup}\n</section>\n</template>\n`;
}

export function generatePage(value: unknown): GeneratedFile[] {
  const validated = validatePageDsl(value);
  if (!validated.ok) throw new Error(validated.diagnostics[0]?.code ?? 'schema.invalid');
  const dsl = validated.dsl;
  const files: GeneratedFile[] = [
    { path: 'src/generated/Page.vue', content: generatedSfc(dsl) },
    { path: 'src/generated/types.ts', content: generateTypes(dsl) },
    { path: 'src/generated/events.ts', content: generateEvents(dsl) },
    { path: 'src/generated/runtime.ts', content: generateRuntime() },
    { path: 'src/generated/components/PageHeader.vue', content: generateHeader() }
  ];
  const manifest = {
    schemaVersion: 1, pageId: dsl.pageId, title: dsl.title, entry: files[0].path,
    framework: 'vue3', dependencies: { vue: '^3.5.18', 'ant-design-vue': '^4.2.6' },
    files: files.map((file) => file.path)
  };
  return [...files, { path: 'src/generated/manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` }];
}
