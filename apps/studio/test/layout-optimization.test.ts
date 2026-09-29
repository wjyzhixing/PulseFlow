import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageDsl } from '@pulseflow/ui-dsl';
const captureMocks = vi.hoisted(() => ({ toCanvas: vi.fn() }));
vi.mock('html-to-image', () => ({ toCanvas: captureMocks.toCanvas }));
import { applyLayoutGroupSuggestions, captureLayoutPreview } from '../src/features/design/layout-optimization';

const pageDsl: PageDsl = {
  schemaVersion: 1,
  pageId: 'robot-home',
  title: '机器人官网首页',
  pageKind: 'website',
  nodes: [
    { id: 'feature-a', type: 'Button', props: { label: '产品功能' }, children: [], slots: [], design: { position: { mode: 'absolute', x: 24, y: 24 }, size: { width: 120, height: 40 } } },
    { id: 'feature-b', type: 'Button', props: { label: '应用场景' }, children: [], slots: [], design: { position: { mode: 'absolute', x: 164, y: 24 }, size: { width: 120, height: 40 } } },
    { id: 'floating-cta', type: 'Button', props: { label: '咨询' }, children: [], slots: [], design: { position: { mode: 'absolute', x: 320, y: 520 }, size: { width: 120, height: 40 } } }
  ]
};
const geometry = (nodeId: string, x: number, y: number) => ({ nodeId, x, y, width: 120, height: 40, parentTransform: { a: 1, b: 0, c: 0, d: 1 } });

describe('AI export layout candidate', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('captures the rendered artboard as a PNG within the model image bounds', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    const source = document.createElement('canvas');
    source.width = 2_880;
    source.height = 1_600;
    const context = { drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,c2NyZWVuc2hvdA==');
    captureMocks.toCanvas.mockResolvedValue(source);
    const artboard = document.createElement('section');

    await expect(captureLayoutPreview(artboard)).resolves.toBe('data:image/png;base64,c2NyZWVuc2hvdA==');

    expect(captureMocks.toCanvas).toHaveBeenCalledWith(artboard, { pixelRatio: 1, cacheBust: true });
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 1_440, 800);
  });

  it('converts a measured regular row into a validated Flex Frame without mutating the source', () => {
    const original = structuredClone(pageDsl);
    const result = applyLayoutGroupSuggestions(pageDsl, [{ nodeIds: ['feature-a', 'feature-b'] }], new Map([
      ['feature-a', geometry('feature-a', 24, 24)],
      ['feature-b', geometry('feature-b', 164, 24)]
    ]));

    expect(result.appliedGroups, JSON.stringify(result.skippedGroups)).toEqual([['feature-a', 'feature-b']]);
    expect(result.pageDsl.nodes[0]).toMatchObject({
      type: 'Frame',
      design: { position: { mode: 'absolute', x: 24, y: 24 } },
      props: { direction: 'row', gap: 20 },
      children: [
        { id: 'feature-a', design: { position: { mode: 'flow' } } },
        { id: 'feature-b', design: { position: { mode: 'flow' } } }
      ]
    });
    expect(result.pageDsl.nodes[1]?.id).toBe('floating-cta');
    expect(pageDsl).toEqual(original);
  });

  it('skips irregular, overlapping, duplicate, or missing-node groups and leaves those nodes absolute', () => {
    const result = applyLayoutGroupSuggestions(pageDsl, [
      { nodeIds: ['feature-a', 'feature-b'] },
      { nodeIds: ['feature-a', 'floating-cta'] },
      { nodeIds: ['feature-a', 'missing-node'] }
    ], new Map([
      ['feature-a', geometry('feature-a', 24, 24)],
      ['feature-b', geometry('feature-b', 164, 90)],
      ['floating-cta', geometry('floating-cta', 320, 520)]
    ]));

    expect(result.appliedGroups).toEqual([]);
    expect(result.skippedGroups).toHaveLength(3);
    expect(result.pageDsl.nodes.map((node) => node.design?.position?.mode)).toEqual(['absolute', 'absolute', 'absolute']);
  });

  it('rejects transformed parent geometry instead of applying an unsafe candidate', () => {
    const result = applyLayoutGroupSuggestions(pageDsl, [{ nodeIds: ['feature-a', 'feature-b'] }], new Map([
      ['feature-a', geometry('feature-a', 24, 24)],
      ['feature-b', { ...geometry('feature-b', 164, 24), parentTransform: { a: 1.2, b: 0, c: 0, d: 1.2 } }]
    ]));

    expect(result.appliedGroups).toEqual([]);
    expect(result.skippedGroups[0]?.reason).toContain('父容器存在旋转或缩放');
    expect(result.pageDsl.nodes[0]?.design?.position?.mode).toBe('absolute');
  });
});
