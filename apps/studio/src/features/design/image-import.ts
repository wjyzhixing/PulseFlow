const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;
const MAX_EDGE = 1_800;
const MAX_ARTBOARD_WIDTH = 1_440;
const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_CROP_COUNT = 24;
const MAX_CROP_PIXELS = 50_000_000;
const MAX_CROP_BYTES = 20 * 1024 * 1024;

export interface ImageImportRegion {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  alt: string;
}

export interface ImageRegionPreview {
  nodeId: string;
  temporaryAssetId: string;
  objectUrl: string;
}

export interface ImageImportDetailTile {
  imageDataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function validateDesignReferenceFile(file: Pick<File, 'type' | 'size'>): void {
  if (!supportedTypes.has(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 格式的设计图。');
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error('图片文件需大于 0 且不超过 20 MB。');
}

export async function prepareDesignReferenceImage(file: File): Promise<string> {
  validateDesignReferenceFile(file);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('图片无法解码，请更换图片后重试。'); }
  try {
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error('图片尺寸过大，请先缩小后再导入。');
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理这张图片。');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片压缩失败，请重试。')), 'image/jpeg', 0.82));
    if (blob.size > 5 * 1024 * 1024) throw new Error('处理后的图片仍超过 5 MB，请换一张较小的图片。');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败，请重试。'));
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('读取图片失败，请重试。'));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

/** Adds two full-resolution strips so vision can read details lost in the overview resize. */
export async function prepareDesignReferenceDetailTiles(file: File): Promise<ImageImportDetailTile[]> {
  validateDesignReferenceFile(file);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('图片无法解码，请更换图片后重试。'); }
  try {
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error('图片尺寸过大，请先缩小后再导入。');
    }
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    if (longestEdge <= MAX_EDGE) return [];
    const fullScale = MAX_EDGE / longestEdge;
    const referenceWidth = Math.max(1, Math.round(bitmap.width * fullScale));
    const referenceHeight = Math.max(1, Math.round(bitmap.height * fullScale));
    const splitVertically = bitmap.width >= bitmap.height;
    const splitSource = Math.floor((splitVertically ? bitmap.width : bitmap.height) / 2);
    const splitReference = Math.round(splitSource * fullScale);
    const regions = splitVertically
      ? [
        { sx: 0, sy: 0, sw: splitSource, sh: bitmap.height, x: 0, y: 0, width: splitReference, height: referenceHeight },
        { sx: splitSource, sy: 0, sw: bitmap.width - splitSource, sh: bitmap.height, x: splitReference, y: 0, width: referenceWidth - splitReference, height: referenceHeight }
      ]
      : [
        { sx: 0, sy: 0, sw: bitmap.width, sh: splitSource, x: 0, y: 0, width: referenceWidth, height: splitReference },
        { sx: 0, sy: splitSource, sw: bitmap.width, sh: bitmap.height - splitSource, x: 0, y: splitReference, width: referenceWidth, height: referenceHeight - splitReference }
      ];
    return regions.map((region) => {
      const tileScale = Math.min(1, MAX_EDGE / Math.max(region.sw, region.sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(region.sw * tileScale));
      canvas.height = Math.max(1, Math.round(region.sh * tileScale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法生成高清细节图。');
      context.drawImage(bitmap, region.sx, region.sy, region.sw, region.sh, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      if (imageDataUrl.length > Math.ceil(4 * 1024 * 1024 * 4 / 3) + 64) {
        throw new Error('高清细节图超过 4 MB，请先缩小原图后再导入。');
      }
      return { imageDataUrl, x: region.x, y: region.y, width: region.width, height: region.height };
    });
  } finally {
    bitmap.close();
  }
}

export async function createImageRegionPreviews(imageDataUrl: string, regions: readonly ImageImportRegion[]): Promise<ImageRegionPreview[]> {
  if (!regions.length) return [];
  if (regions.length > MAX_CROP_COUNT) throw new Error('可预览的图片区域不能超过 24 个。');
  const imageResponse = await fetch(imageDataUrl);
  if (!imageResponse.ok) throw new Error('读取参考图裁片失败。');
  const bitmap = await createImageBitmap(await imageResponse.blob());
  const previews: ImageRegionPreview[] = [];
  try {
    const artboardWidth = Math.min(bitmap.width, MAX_ARTBOARD_WIDTH);
    const sourceScale = bitmap.width / artboardWidth;
    let totalPixels = 0;
    let totalBytes = 0;
    for (const [index, region] of regions.entries()) {
      if (![region.x, region.y, region.width, region.height].every(Number.isSafeInteger) ||
        region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1 ||
        region.x >= artboardWidth || region.y >= Math.round(bitmap.height / sourceScale) ||
        region.width > artboardWidth - region.x || region.height > Math.round(bitmap.height / sourceScale) - region.y) {
        throw new Error('参考图图片区域坐标无效，请重新生成页面。');
      }
      const left = Math.round(region.x * sourceScale);
      const top = Math.round(region.y * sourceScale);
      const right = Math.min(bitmap.width, Math.round((region.x + region.width) * sourceScale));
      const bottom = Math.min(bitmap.height, Math.round((region.y + region.height) * sourceScale));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      totalPixels += width * height;
      if (totalPixels > MAX_CROP_PIXELS) throw new Error('参考图图片区过多，无法安全生成裁片预览。');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法生成图片裁片预览。');
      context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value
        ? resolve(value)
        : reject(new Error('生成图片裁片预览失败。')), 'image/png'));
      totalBytes += blob.size;
      if (totalBytes > MAX_CROP_BYTES) throw new Error('图片裁片预览超过大小限制，请减少参考图中的图片区。');
      previews.push({
        nodeId: region.nodeId,
        temporaryAssetId: `asset-preview-${crypto.randomUUID()}-${index}`,
        objectUrl: URL.createObjectURL(blob)
      });
    }
    return previews;
  } catch (error) {
    previews.forEach((preview) => URL.revokeObjectURL(preview.objectUrl));
    throw error;
  } finally {
    bitmap.close();
  }
}
