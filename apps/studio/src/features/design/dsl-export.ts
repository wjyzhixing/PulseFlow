import { validatePageDsl, type Diagnostic, type EntityField, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';

export type DslExportResult =
  | { ok: true; dsl: PageDsl; jsonText: string; diagnostics: [] }
  | { ok: false; diagnostics: Diagnostic[] };

function assetReferences(nodes: readonly UiNode[], path = 'nodes'): Array<{ id: string; path: string }> {
  return nodes.flatMap((node, index) => {
    const nodePath = `${path}[${index}]`;
    const own = ['assetId', 'backgroundAssetId'].flatMap((key) => {
      const id = node.props[key];
      return typeof id === 'string' ? [{ id, path: `${nodePath}.props.${key}` }] : [];
    });
    const children = assetReferences(node.children, `${nodePath}.children`);
    const slots = node.slots.flatMap((slot, slotIndex) => 'children' in slot
      ? assetReferences(slot.children, `${nodePath}.slots[${slotIndex}].children`)
      : []);
    return [...own, ...children, ...slots];
  });
}

export function exportValidatedDsl(
  input: unknown,
  entityFields: readonly EntityField[],
  assetIds?: readonly string[]
): DslExportResult {
  const validation = validatePageDsl(input, entityFields);
  if (!validation.ok) return { ok: false, diagnostics: validation.diagnostics };
  if (assetIds) {
    const available = new Set(assetIds);
    const missing = assetReferences(validation.dsl.nodes)
      .filter((reference) => !available.has(reference.id))
      .map((reference) => ({ code: 'asset.unresolved', path: reference.path, message: `找不到图片素材：${reference.id}` }));
    if (missing.length) return { ok: false, diagnostics: missing };
  }
  return { ok: true, dsl: validation.dsl, jsonText: JSON.stringify(validation.dsl, null, 2), diagnostics: [] };
}
