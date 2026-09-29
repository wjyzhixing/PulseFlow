import type { UiNode } from '@pulseflow/ui-dsl';

type ArtboardNode = Pick<UiNode, 'type' | 'design'>;

export interface ArtboardBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Returns the complete top-level frame extent in DSL coordinates. */
export function getRootArtboardBounds(nodes: readonly ArtboardNode[]): ArtboardBounds | null {
  const extents = nodes.flatMap((node) => {
    const size = node.design?.size;
    if (typeof size?.width !== 'number' || typeof size.height !== 'number') return [];
    const x = node.design?.position?.mode === 'absolute' ? node.design.position.x : 0;
    const y = node.design?.position?.mode === 'absolute' ? node.design.position.y : 0;
    return [{ left: x, top: y, right: x + size.width, bottom: y + size.height }];
  });
  if (!extents.length) return null;
  const left = Math.min(...extents.map(({ left: value }) => value));
  const top = Math.min(...extents.map(({ top: value }) => value));
  const right = Math.max(...extents.map(({ right: value }) => value));
  const bottom = Math.max(...extents.map(({ bottom: value }) => value));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
