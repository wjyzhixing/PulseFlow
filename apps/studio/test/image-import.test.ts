import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImageRegionPreviews, prepareDesignReferenceImage, validateDesignReferenceFile, type ImageImportRegion } from '../src/features/design/image-import';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('validateDesignReferenceFile', () => {
  it('accepts PNG, JPEG, and WebP files within the size limit', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(() => validateDesignReferenceFile({ type, size: 1 })).not.toThrow();
    }
  });

  it('rejects unsupported file formats', () => {
    expect(() => validateDesignReferenceFile({ type: 'image/svg+xml', size: 100 })).toThrow('请选择 PNG、JPEG 或 WebP');
    expect(() => validateDesignReferenceFile({ type: 'application/pdf', size: 100 })).toThrow('请选择 PNG、JPEG 或 WebP');
  });

  it('rejects empty and oversized image files', () => {
    expect(() => validateDesignReferenceFile({ type: 'image/png', size: 0 })).toThrow('不超过 20 MB');
    expect(() => validateDesignReferenceFile({ type: 'image/png', size: 20 * 1024 * 1024 + 1 })).toThrow('不超过 20 MB');
  });

  it('resizes large reference images and sends JPEG data instead of the full source file', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3600, height: 1800, close })));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage } as unknown as CanvasRenderingContext2D));
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['compressed'], { type: 'image/jpeg' })));
    const dataUrl = await prepareDesignReferenceImage(new File(['source'], 'screen.png', { type: 'image/png' }));
    const canvas = HTMLCanvasElement.prototype;
    expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ width: 3600, height: 1800 }), 0, 0, 1800, 900);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.82);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes and rejects images whose pixel dimensions exceed the safety budget', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10_000, height: 10_000, close })));
    await expect(prepareDesignReferenceImage(new File(['source'], 'huge.png', { type: 'image/png' }))).rejects.toThrow('尺寸过大');
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects undecodable images and always closes successfully decoded bitmaps', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValueOnce(new Error('decode')));
    await expect(prepareDesignReferenceImage(new File(['source'], 'bad.png', { type: 'image/png' })))
      .rejects.toThrow('图片无法解码');

    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(prepareDesignReferenceImage(new File(['source'], 'small.png', { type: 'image/png' })))
      .rejects.toThrow('浏览器无法处理');
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects images when canvas compression or output sizing fails', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementationOnce((callback) => callback(null));
    await expect(prepareDesignReferenceImage(new File(['source'], 'small.png', { type: 'image/png' })))
      .rejects.toThrow('图片压缩失败');

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' })));
    await expect(prepareDesignReferenceImage(new File(['source'], 'large.png', { type: 'image/png' })))
      .rejects.toThrow('仍超过 5 MB');
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('creates bounded image-region previews and closes the decoded source bitmap', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2880, height: 1440, close })));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['source']) })));
    vi.stubGlobal('crypto', { randomUUID: () => 'preview-id' });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['crop'], { type: 'image/png' })));
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:crop');
    const regions: ImageImportRegion[] = [{ nodeId: 'hero', x: 10, y: 5, width: 20, height: 10, alt: '机器人' }];

    await expect(createImageRegionPreviews('data:image/png;base64,source', regions)).resolves.toEqual([
      { nodeId: 'hero', temporaryAssetId: 'asset-preview-preview-id-0', objectUrl: 'blob:crop' }
    ]);
    expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ width: 2880 }), 20, 10, 40, 20, 0, 0, 40, 20);
    expect(createUrl).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects invalid crop input and revokes previews created before a later failure', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close })));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['source']) })));
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:first');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    let callCount = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callCount += 1;
      callback(callCount === 1 ? new Blob(['crop'], { type: 'image/png' }) : null);
    });
    const region: ImageImportRegion = { nodeId: 'hero', x: 0, y: 0, width: 20, height: 20, alt: '机器人' };
    await expect(createImageRegionPreviews('data:image/png;base64,source', [region, { ...region, nodeId: 'logo', x: 20 }]))
      .rejects.toThrow('生成图片裁片预览失败');
    expect(revoke).toHaveBeenCalledWith('blob:first');
    expect(close).toHaveBeenCalledOnce();
  });

  it('short-circuits empty crops and rejects unavailable or invalid crop sources', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createImageRegionPreviews('', [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(createImageRegionPreviews('source', Array.from({ length: 25 }, (_, index) => ({
      nodeId: String(index), x: 0, y: 0, width: 1, height: 1, alt: '区域'
    })))).rejects.toThrow('不能超过 24 个');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, blob: async () => new Blob() })));
    await expect(createImageRegionPreviews('source', [{ nodeId: 'x', x: 0, y: 0, width: 1, height: 1, alt: '区域' }]))
      .rejects.toThrow('读取参考图裁片失败');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob() })));
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 20, height: 20, close: vi.fn() })));
    await expect(createImageRegionPreviews('source', [{ nodeId: 'x', x: 0.5, y: 0, width: 1, height: 1, alt: '区域' }]))
      .rejects.toThrow('坐标无效');
  });
});
