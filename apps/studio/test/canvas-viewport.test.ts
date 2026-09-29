import { describe, expect, it } from 'vitest';
import { getCanvasPanCorrection, useCanvasViewport } from '../src/features/design/use-canvas-viewport';

describe('useCanvasViewport', () => {
  it('switches device frame widths without changing document data', () => {
    const viewport = useCanvasViewport();
    expect(viewport.width.value).toBe(1280);
    viewport.setDevice('mobile');
    expect(viewport.width.value).toBe(390);
    expect(viewport.zoom.value).toBe(100);
  });

  it('clamps zoom and fits the page to the available canvas width', () => {
    const viewport = useCanvasViewport();
    viewport.setZoom(450);
    expect(viewport.zoom.value).toBe(400);
    viewport.setZoom(1);
    expect(viewport.zoom.value).toBe(10);
    viewport.fitToViewport(640, 1280);
    expect(viewport.zoom.value).toBe(50);
    viewport.fitToViewport(371, 1280);
    expect(viewport.zoom.value).toBe(29);
    viewport.fitToViewport(3000, 1280);
    expect(viewport.zoom.value).toBe(234);
  });

  it('updates pan immutably and ignores invalid movement', () => {
    const viewport = useCanvasViewport();
    const originalPan = viewport.pan.value;
    viewport.panBy(24, -8);
    expect(viewport.pan.value).toEqual({ x: 24, y: -8 });
    expect(viewport.pan.value).not.toBe(originalPan);
    viewport.panBy(Number.NaN, 4);
    expect(viewport.pan.value).toEqual({ x: 24, y: -8 });
  });

  it('zooms around a canvas point so the content under the pointer stays fixed', () => {
    const viewport = useCanvasViewport();
    viewport.panBy(20, 30);
    viewport.zoomBy(50, { x: 200, y: 100 });

    expect(viewport.zoom.value).toBe(150);
    expect(viewport.pan.value).toEqual({ x: -70, y: -5 });
    expect(viewport.pan.value.x + (200 - 20) * 1.5).toBe(200);
    expect(viewport.pan.value.y + (100 - 30) * 1.5).toBe(100);
  });

  it('compensates for the centered artboard shifting as zoom changes', () => {
    expect(getCanvasPanCorrection({ fromOrigin: { x: 180, y: 32 }, toOrigin: { x: 116, y: 32 }, fromZoom: 50, toZoom: 60 }))
      .toEqual({ x: 100, y: 6.4 });
    expect(getCanvasPanCorrection({ fromOrigin: { x: 116, y: 32 }, toOrigin: { x: 180, y: 32 }, fromZoom: 60, toZoom: 50 }))
      .toEqual({ x: -83.333, y: -5.333 });
    expect(getCanvasPanCorrection({ fromOrigin: { x: 0, y: 32 }, toOrigin: { x: 0, y: 32 }, fromZoom: 100, toZoom: 120 }))
      .toEqual({ x: 0, y: 6.4 });
  });
});
