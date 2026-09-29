import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizeUploadedImageDataUrl } from '../src/image-upload.js';

async function imageDataUrl(format: 'png' | 'jpeg' | 'webp', width = 8_193, height = 1): Promise<string> {
  const bytes = await sharp({ create: { width, height, channels: 3, background: '#1677ff' } })[format]().toBuffer();
  return `data:image/${format};base64,${bytes.toString('base64')}`;
}

describe('normalizeUploadedImageDataUrl', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('normalizes %s into PNG storage bytes', async (format) => {
    const output = await normalizeUploadedImageDataUrl(await imageDataUrl(format, 16, 12));
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(16);
    expect(metadata.height).toBe(12);
  });

  it('rotates metadata and constrains the normalized output dimensions', async () => {
    const output = await normalizeUploadedImageDataUrl(await imageDataUrl('jpeg', 3_000, 1_000));
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(2_400);
    expect(metadata.height).toBe(800);
  });

  it.each([
    '',
    'data:text/plain;base64,SGVsbG8=',
    'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==',
    'data:image/png;base64,not-base64!'
  ])('rejects unsupported or malformed data URLs', async (input) => {
    await expect(normalizeUploadedImageDataUrl(input)).rejects.toMatchObject({ code: 'input' });
  });

  it('rejects payloads that exceed the source byte limit before decoding', async () => {
    const input = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}`;
    await expect(normalizeUploadedImageDataUrl(input)).rejects.toMatchObject({ code: 'input' });
  });

  it('rejects invalid base64 bytes and image data that cannot be decoded', async () => {
    await expect(normalizeUploadedImageDataUrl('data:image/png;base64,SGVsbG8=')).rejects.toMatchObject({ code: 'input' });
    await expect(normalizeUploadedImageDataUrl('data:image/png;base64,bm90LWltYWdl')).rejects.toMatchObject({ code: 'input' });
  });

  it('rejects a declared format that does not match the encoded image', async () => {
    const png = await imageDataUrl('png', 8, 8);
    await expect(normalizeUploadedImageDataUrl(png.replace('image/png', 'image/jpeg'))).rejects.toMatchObject({ code: 'input' });
  });

  it('rejects images beyond edge and decoded pixel limits', async () => {
    await expect(normalizeUploadedImageDataUrl(await imageDataUrl('png', 8_193, 1))).rejects.toMatchObject({ code: 'input' });
    await expect(normalizeUploadedImageDataUrl(await imageDataUrl('png', 8_192, 8_192))).rejects.toMatchObject({ code: 'input' });
  });

  it('maps a truncated but identifiable image to a safe normalization error', async () => {
    const bytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const truncated = bytes.subarray(0, 40).toString('base64');
    await expect(normalizeUploadedImageDataUrl(`data:image/png;base64,${truncated}`)).rejects.toMatchObject({ code: 'input' });
  });
});
