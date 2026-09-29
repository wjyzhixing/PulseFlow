import type { UiNode } from '@pulseflow/ui-dsl';

export type FrameDirection = 'row' | 'column';

/** Resolve Figma-style Fill sizing for a direct child of an auto-layout Frame. */
export function flowSizingStyle(node: UiNode, parentDirection?: FrameDirection): Record<string, string | number> {
  if (!parentDirection || node.design?.position?.mode === 'absolute') return {};

  const size = node.design?.size;
  const mainAxisSize = parentDirection === 'row' ? size?.width : size?.height;
  const crossAxisSize = parentDirection === 'row' ? size?.height : size?.width;
  const alignSelf = crossAxisSize === 'fill' ? 'stretch' : node.design?.alignSelf;
  const crossAxisAlignment = alignSelf ? {
    start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch'
  }[alignSelf] : undefined;

  return {
    ...(mainAxisSize === 'fill'
      ? parentDirection === 'row'
        ? { flex: '1 1 0%', minWidth: 0 }
        : { flex: '1 1 0%', minHeight: 0 }
      : {}),
    ...(crossAxisAlignment ? { alignSelf: crossAxisAlignment } : {})
  };
}
