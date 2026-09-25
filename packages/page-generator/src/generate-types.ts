import type { PageDsl, UiNode } from '@pulseflow/ui-dsl';

function allNodes(nodes: readonly UiNode[]): UiNode[] {
  return nodes.flatMap((node) => [node, ...allNodes(node.children), ...node.slots.flatMap((slot) => slot.name === 'tags' ? allNodes(slot.children) : [])]);
}

export function generateTypes(dsl: PageDsl): string {
  const fields = new Set<string>();
  const collections = new Set<string>();
  for (const node of allNodes(dsl.nodes)) {
    if (node.type === 'FormItem') fields.add(String(node.props.fieldId));
    if (node.condition) fields.add(node.condition.fieldId);
    if (node.type === 'Table') {
      collections.add(String(node.props.dataSourceKey));
      for (const column of node.props.columns as Array<{ field: string }>) fields.add(column.field);
    }
  }
  const dataProperties = new Map<string, Set<string>>();
  const addProperty = (key: string, type: string) => dataProperties.set(key, new Set([...(dataProperties.get(key) ?? []), type]));
  for (const field of fields) addProperty(field, 'CellValue');
  for (const collection of collections) addProperty(collection, 'PageRecord[]');
  addProperty('fields', 'PageRecord');
  const lines = [
    '/* Generated data contract. Supply data from your application; no API implementation is included. */',
    'export type CellValue = string | number | boolean | null | undefined;',
    'export interface PageRecord {',
    ...[...fields].sort().map((field) => `  ${JSON.stringify(field)}?: CellValue;`),
    '  [fieldId: string]: CellValue;',
    '}',
    'export interface PageData {',
    ...[...dataProperties].sort(([a], [b]) => a.localeCompare(b)).map(([key, types]) => `  ${JSON.stringify(key)}?: ${[...types].join(' | ')};`),
    '  [key: string]: CellValue | PageRecord | PageRecord[] | undefined;',
    '}'
  ];
  return `${lines.join('\n')}\n`;
}
