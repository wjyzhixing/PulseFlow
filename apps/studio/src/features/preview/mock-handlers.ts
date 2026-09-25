import { validatePageDsl, type EntityField, type UiNode } from '@pulseflow/ui-dsl';
import type { EventHandlers, PreviewData } from '@pulseflow/page-generator';

function names(nodes: readonly UiNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.type === 'Button' && typeof node.props.event === 'string' ? [node.props.event] : []),
    ...names(node.children),
    ...node.slots.flatMap((slot) => slot.name === 'tags' ? names(slot.children) : [])
  ]);
}

export function createMockHandlers(dsl: unknown, onEvent: (name: string) => void): EventHandlers {
  const validated = validatePageDsl(dsl);
  if (!validated.ok) return {};
  return Object.fromEntries([...new Set(names(validated.dsl.nodes))].map((name) => [name, () => onEvent(name)]));
}

export function createMockData(dsl: unknown, fields: readonly EntityField[]): PreviewData {
  const validated = validatePageDsl(dsl, fields);
  if (!validated.ok) return {};
  const values = Object.fromEntries(fields.map((field) => {
    const enumRule = field.rules.find((rule) => rule.kind === 'enum');
    const raw = enumRule?.kind === 'enum' ? enumRule.values[0] : undefined;
    const numeric = raw === undefined ? 0 : Number(raw);
    const value = field.type === 'number' ? (Number.isFinite(numeric) ? numeric : 0)
      : field.type === 'boolean' ? raw === 'true' : raw ?? '';
    return [field.id, value];
  }));
  const tables: UiNode[] = [];
  const walk = (nodes: readonly UiNode[]) => nodes.forEach((node) => { if (node.type === 'Table') tables.push(node); walk(node.children); });
  walk(validated.dsl.nodes);
  return { ...values, fields: values, ...Object.fromEntries(tables.map((table) => [String(table.props.dataSourceKey), [values]])) };
}
