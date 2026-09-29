import { toCanvas } from 'html-to-image';
import { validatePageDsl, type EntityField, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';
import { request } from '../../shared/api/client';
import { autoLayoutNodesCommand, type GroupNodeGeometry } from './design-commands';
import { readCanvasVisualRect } from './canvas-geometry';

export interface LayoutGroupSuggestion { nodeIds: string[] }
export interface LayoutAnalysisResponse { groups: LayoutGroupSuggestion[] }
export interface LayoutOptimizationResult { pageDsl: PageDsl; appliedGroups: string[][]; skippedGroups: Array<{ nodeIds: string[]; reason: string }> }

function flattenNodes(nodes: readonly UiNode[]): UiNode[] {
  const result: UiNode[] = [];
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    result.push(node);
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return result;
}

function transformBetween(element: HTMLElement, panel: HTMLElement): { a: number; b: number; c: number; d: number } {
  let matrix = new DOMMatrix();
  let current = element.parentElement;
  while (current && current !== panel) {
    const transform = getComputedStyle(current).transform;
    if (transform && transform !== 'none') matrix = matrix.multiply(new DOMMatrix(transform));
    current = current.parentElement;
  }
  return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d };
}

export function measureLayoutGroupGeometries(pageDsl: PageDsl, panel: HTMLElement, nodeIds: readonly string[]): GroupNodeGeometry[] | null {
  const nodes = flattenNodes(pageDsl.nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const elements = new Map(Array.from(panel.querySelectorAll<HTMLElement>('[data-pf-node-id]')).map((element) => [element.dataset.pfNodeId ?? '', element]));
  const output: GroupNodeGeometry[] = [];
  for (const nodeId of nodeIds) {
    const node = byId.get(nodeId);
    const element = elements.get(nodeId);
    const position = node?.design?.position;
    if (!node || !element || position?.mode !== 'absolute') return null;
    const rect = readCanvasVisualRect(node.design?.size, element);
    const parentTransform = transformBetween(element, panel);
    if (![rect.width, rect.height, position.x, position.y, parentTransform.a, parentTransform.b, parentTransform.c, parentTransform.d].every(Number.isFinite)) return null;
    output.push({ nodeId, x: position.x, y: position.y, width: rect.width, height: rect.height, parentTransform });
  }
  return output;
}

export function applyLayoutGroupSuggestions(
  input: unknown,
  groups: unknown,
  geometriesByNodeId: ReadonlyMap<string, GroupNodeGeometry>,
  entityFields: readonly EntityField[] = []
): LayoutOptimizationResult {
  const validation = validatePageDsl(input, entityFields);
  if (!validation.ok) return { pageDsl: input as PageDsl, appliedGroups: [], skippedGroups: [{ nodeIds: [], reason: '页面 UI-DSL 无效，未应用 AI 布局。' }] };
  const sourceNodes = flattenNodes(validation.dsl.nodes);
  const sourceIds = new Set(sourceNodes.map((node) => node.id));
  const absoluteIds = new Set(sourceNodes.filter((node) => node.design?.position?.mode === 'absolute').map((node) => node.id));
  if (!Array.isArray(groups)) return { pageDsl: validation.dsl, appliedGroups: [], skippedGroups: [{ nodeIds: [], reason: 'AI 返回的布局分组格式无效。' }] };
  let candidate = validation.dsl;
  const claimed = new Set<string>();
  const appliedGroups: string[][] = [];
  const skippedGroups: LayoutOptimizationResult['skippedGroups'] = [];
  groups.slice(0, 40).forEach((group, index) => {
    if (!group || typeof group !== 'object' || Array.isArray(group) || Object.keys(group).some((key) => key !== 'nodeIds')) {
      skippedGroups.push({ nodeIds: [], reason: 'AI 返回了格式无效的分组，该组已跳过。' });
      return;
    }
    const nodeIds = (group as { nodeIds?: unknown }).nodeIds;
    if (!Array.isArray(nodeIds) || nodeIds.length < 2 || nodeIds.length > 20 ||
        !nodeIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id))) {
      skippedGroups.push({ nodeIds: [], reason: 'AI 返回的节点列表无效，该组已跳过。' });
      return;
    }
    const ids = [...nodeIds] as string[];
    if (new Set(ids).size !== ids.length || ids.some((id) => !sourceIds.has(id) || !absoluteIds.has(id) || claimed.has(id))) {
      skippedGroups.push({ nodeIds: ids, reason: '分组包含不存在、重复、非绝对定位或已被其他分组使用的图层；该组已跳过。' });
      return;
    }
    ids.forEach((id) => claimed.add(id));
    const geometries = ids.flatMap((id) => {
      const geometry = geometriesByNodeId.get(id);
      return geometry ? [geometry] : [];
    });
    const hasTransformedParent = geometries.some(({ parentTransform }) =>
      Math.abs(parentTransform.a - 1) > 0.001 || Math.abs(parentTransform.d - 1) > 0.001 ||
      Math.abs(parentTransform.b) > 0.001 || Math.abs(parentTransform.c) > 0.001);
    const groupIdBase = `ai-layout-${index + 1}`;
    const currentIds = new Set(flattenNodes(candidate.nodes).map((node) => node.id));
    let groupId = groupIdBase;
    let suffix = 2;
    while (currentIds.has(groupId)) groupId = `${groupIdBase}-${suffix++}`;
    const result = geometries.length === ids.length && !hasTransformedParent
      ? autoLayoutNodesCommand(candidate, ids, groupId, geometries, entityFields)
      : { ok: false as const, reason: hasTransformedParent ? '父容器存在旋转或缩放，无法安全转换此组。' : '无法读取此组所有图层的真实尺寸，该组已跳过。' };
    if (!result.ok) {
      skippedGroups.push({ nodeIds: ids, reason: result.reason });
      return;
    }
    candidate = result.dsl;
    appliedGroups.push(ids);
  });
  const checked = validatePageDsl(candidate, entityFields);
  if (!checked.ok) return { pageDsl: validation.dsl, appliedGroups: [], skippedGroups: [...skippedGroups, { nodeIds: [], reason: '合并后的页面未通过 UI-DSL 校验，已恢复原页面。' }] };
  return { pageDsl: checked.dsl, appliedGroups, skippedGroups };
}

export async function captureLayoutPreview(element: HTMLElement): Promise<string> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if ('fonts' in document) await document.fonts.ready;
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    if (typeof image.decode === 'function') await image.decode().catch(() => undefined);
  }));
  const bounds = element.querySelector<HTMLElement>('[data-editor-artboard="true"]') ?? element;
  const source = await toCanvas(bounds, { pixelRatio: 1, cacheBust: true });
  const scale = Math.min(1, 1_440 / source.width, 8_192 / source.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('页面截图无法生成，请重试。');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const screenshot = canvas.toDataURL('image/png');
  const encoded = screenshot.slice(screenshot.indexOf(',') + 1);
  if (encoded.length > Math.ceil(3 * 1024 * 1024 * 4 / 3)) throw new Error('页面截图超过 3 MB，无法发送给布局分析服务。');
  return screenshot;
}

export function analyzeLayoutPage(pageDsl: PageDsl, screenshotDataUrl: string): Promise<LayoutAnalysisResponse> {
  return request<LayoutAnalysisResponse>('/api/layout-optimization/analyze', { pageDsl, screenshotDataUrl });
}
