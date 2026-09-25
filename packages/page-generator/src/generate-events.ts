import type { PageDsl, UiNode } from '@pulseflow/ui-dsl';

function eventNames(nodes: readonly UiNode[]): string[] {
  const names = nodes.flatMap((node) => [
    ...(node.type === 'Button' && typeof node.props.event === 'string' ? [node.props.event] : []),
    ...eventNames(node.children),
    ...node.slots.flatMap((slot) => slot.name === 'tags' ? eventNames(slot.children) : [])
  ]);
  return [...new Set(names)].sort();
}

export function generateEvents(dsl: PageDsl): string {
  return [
    '/* Generated event contract. Bind these handlers in your application. */',
    'export interface PageHandlers {',
    ...eventNames(dsl.nodes).map((name) => `  ${JSON.stringify(name)}?: () => void;`),
    '}', ''
  ].join('\n');
}
