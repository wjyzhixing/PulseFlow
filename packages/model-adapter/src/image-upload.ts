import sharp, { type Metadata } from 'sharp';
import { ModelAdapterError } from './errors.js';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 50_000_000;
const MAX_SOURCE_EDGE = 8_192;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_EDGE = 2_400;

export async function normalizeUploadedImageDataUrl(imageDataUrl: string): Promise<Uint8Array> {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
  if (!match || imageDataUrl.length > Math.ceil(MAX_SOURCE_BYTES * 4 / 3) + 64) {
    throw new ModelAdapterError('input', 'Choose a PNG, JPEG, or WebP image under 5 MB');
  }
  const [, subtype, encoded] = match;
  const source = Buffer.from(encoded, 'base64');
  if (!source.byteLength || source.byteLength > MAX_SOURCE_BYTES || source.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new ModelAdapterError('input', 'The uploaded image data is invalid or exceeds the size limit');
  }
  let metadata: Metadata;
  try {
    metadata = await sharp(source, { limitInputPixels: MAX_SOURCE_PIXELS }).metadata();
  } catch {
    throw new ModelAdapterError('input', 'The uploaded image could not be decoded');
  }
  if (metadata.format !== subtype || !metadata.width || !metadata.height || metadata.width > MAX_SOURCE_EDGE || metadata.height > MAX_SOURCE_EDGE ||
    metadata.width * metadata.height > MAX_SOURCE_PIXELS) {
    throw new ModelAdapterError('input', 'The uploaded image format or dimensions are invalid');
  }
  try {
    const png = await sharp(source, { limitInputPixels: MAX_SOURCE_PIXELS })
      .rotate()
      .resize({ width: MAX_OUTPUT_EDGE, height: MAX_OUTPUT_EDGE, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    if (!png.byteLength || png.byteLength > MAX_OUTPUT_BYTES) {
      throw new ModelAdapterError('input', 'The normalized image exceeds the storage limit');
    }
    return png;
  } catch (error) {
    if (error instanceof ModelAdapterError) throw error;
    throw new ModelAdapterError('input', 'The uploaded image could not be normalized');
  }
}
