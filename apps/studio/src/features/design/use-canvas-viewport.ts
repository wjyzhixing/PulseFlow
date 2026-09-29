import { computed, readonly, shallowRef, type ComputedRef, type Ref } from 'vue';

export type CanvasDevice = 'desktop' | 'tablet' | 'mobile';
export interface CanvasPan { x: number; y: number }
export interface CanvasPoint { x: number; y: number }
export interface CanvasViewport {
  device: Readonly<Ref<CanvasDevice>>;
  width: ComputedRef<number>;
  zoom: Readonly<Ref<number>>;
  pan: Readonly<Ref<CanvasPan>>;
  setDevice(device: CanvasDevice): void;
  setZoom(zoom: number): void;
  zoomBy(amount: number, anchor?: CanvasPoint): void;
  fitToViewport(availableWidth: number, frameWidth?: number, availableHeight?: number, frameHeight?: number): void;
  panBy(x: number, y: number): void;
  resetPan(): void;
}

const DEVICE_WIDTHS: Readonly<Record<CanvasDevice, number>> = Object.freeze({ desktop: 1280, tablet: 768, mobile: 390 });
export const CANVAS_ZOOM_MIN = 10;
export const CANVAS_ZOOM_MAX = 400;

export function clampCanvasZoom(value: number): number {
  return Math.round(Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, value)));
}

export function getCanvasPanCorrection(input: { fromOrigin: CanvasPoint; toOrigin: CanvasPoint; fromZoom: number; toZoom: number }): CanvasPan {
  const { fromOrigin, toOrigin, fromZoom, toZoom } = input;
  if (![fromOrigin.x, fromOrigin.y, toOrigin.x, toOrigin.y, fromZoom, toZoom].every(Number.isFinite) || fromZoom <= 0) {
    return { x: 0, y: 0 };
  }
  const ratio = toZoom / fromZoom;
  const round = (value: number) => Math.round(value * 1_000) / 1_000;
  return {
    x: round(fromOrigin.x * ratio - toOrigin.x),
    y: round(fromOrigin.y * ratio - toOrigin.y)
  };
}

export function useCanvasViewport(): CanvasViewport {
  const device = shallowRef<CanvasDevice>('desktop');
  const zoom = shallowRef(100);
  const pan = shallowRef<CanvasPan>({ x: 0, y: 0 });
  const width = computed(() => DEVICE_WIDTHS[device.value]);

  return {
    device: readonly(device), width, zoom: readonly(zoom), pan: readonly(pan),
    setDevice(nextDevice) {
      if (Object.hasOwn(DEVICE_WIDTHS, nextDevice)) device.value = nextDevice;
    },
    setZoom(nextZoom) {
      if (Number.isFinite(nextZoom)) zoom.value = clampCanvasZoom(nextZoom);
    },
    zoomBy(amount, anchor) {
      if (!Number.isFinite(amount)) return;
      const previousZoom = zoom.value;
      const nextZoom = clampCanvasZoom(previousZoom + amount);
      if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && previousZoom !== nextZoom) {
        const ratio = nextZoom / previousZoom;
        const roundCanvasOffset = (value: number) => Math.round(value * 1000) / 1000;
        pan.value = {
          x: roundCanvasOffset(anchor.x - (anchor.x - pan.value.x) * ratio),
          y: roundCanvasOffset(anchor.y - (anchor.y - pan.value.y) * ratio)
        };
      }
      zoom.value = nextZoom;
    },
    fitToViewport(availableWidth, frameWidth = width.value, availableHeight, frameHeight) {
      if (!Number.isFinite(availableWidth) || !Number.isFinite(frameWidth) || availableWidth <= 0 || frameWidth <= 0) return;
      const widthScale = availableWidth / frameWidth;
      const hasHeightBounds = Number.isFinite(availableHeight) && Number.isFinite(frameHeight) &&
        (availableHeight ?? 0) > 0 && (frameHeight ?? 0) > 0;
      const heightScale = hasHeightBounds ? (availableHeight as number) / (frameHeight as number) : Number.POSITIVE_INFINITY;
      zoom.value = clampCanvasZoom(Math.min(widthScale, heightScale) * 100);
      pan.value = { x: 0, y: 0 };
    },
    panBy(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      pan.value = { x: pan.value.x + x, y: pan.value.y + y };
    },
    resetPan() { pan.value = { x: 0, y: 0 }; }
  };
}
