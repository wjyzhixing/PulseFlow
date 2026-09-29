export interface CanvasVisualRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function readCanvasVisualRect(
  size: { width?: unknown; height?: unknown } | undefined,
  element: HTMLElement
): CanvasVisualRect {
  const wrapper = element.getBoundingClientRect();
  const content = element.firstElementChild?.getBoundingClientRect();
  const hasContentBounds = Boolean(content && content.width > 0 && content.height > 0);
  const width = size?.width === undefined && hasContentBounds ? content!.width : wrapper.width;
  const height = size?.height === undefined && hasContentBounds ? content!.height : wrapper.height;
  const left = hasContentBounds && size?.width === undefined ? content!.left : wrapper.left;
  const top = hasContentBounds && size?.height === undefined ? content!.top : wrapper.top;
  return { left, top, width, height, right: left + width, bottom: top + height };
}
