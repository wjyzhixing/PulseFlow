import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { validatePngBytes } from '@pulseflow/model-adapter';
import { AssetRepository, type AssetSummary } from '../db/asset-repository.js';

const MAX_BYTES = 20 * 1024 * 1024;

function validScope(value: string): boolean { return /^[A-Za-z0-9_-]+$/.test(value); }
function assetPath(root: string, assetId: string): string {
  if (!/^asset-[A-Za-z0-9_-]+$/.test(assetId)) throw new Error('Invalid asset ID');
  const directory = resolve(root);
  const path = resolve(directory, `${assetId}.png`);
  const pathFromRoot = relative(directory, path);
  if (!pathFromRoot || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) throw new Error('Invalid asset path');
  return path;
}

export class AssetStore {
  constructor(private readonly repository: AssetRepository, private readonly directory: string) {}

  async savePng(input: { bytes: Uint8Array; pageId: string; draftId?: string }): Promise<AssetSummary> {
    if (!validScope(input.pageId) || (input.draftId !== undefined && !validScope(input.draftId))) throw new Error('Invalid asset ownership scope');
    if (input.bytes.byteLength > MAX_BYTES) throw new Error('PNG asset bytes exceed limits');
    const { width, height } = validatePngBytes(input.bytes);
    const assetId = `asset-${randomUUID()}`;
    const target = assetPath(this.directory, assetId);
    const temporary = assetPath(this.directory, `${assetId}-${randomUUID()}`);
    await mkdir(resolve(this.directory), { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let renamed = false;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(input.bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, target);
      renamed = true;
      const summary: AssetSummary = {
        assetId, pageId: input.pageId, ...(input.draftId ? { draftId: input.draftId } : {}),
        mimeType: 'image/png', byteLength: input.bytes.byteLength, width, height,
        sha256: createHash('sha256').update(input.bytes).digest('hex'), createdAt: new Date().toISOString()
      };
      this.repository.create(summary);
      return summary;
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      if (renamed) await rm(target, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async read(assetId: string): Promise<{ bytes: Uint8Array; mimeType: 'image/png'; sha256: string } | null> {
    if (!/^asset-[A-Za-z0-9_-]+$/.test(assetId)) return null;
    const summary = this.repository.get(assetId);
    if (!summary) return null;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(assetPath(this.directory, assetId), 'r');
      const info = await handle.stat();
      if (!info.isFile() || info.size !== summary.byteLength || info.size <= 0 || info.size > MAX_BYTES) return null;
      const boundedBytes = Buffer.alloc(summary.byteLength + 1);
      const { bytesRead } = await handle.read(boundedBytes, 0, boundedBytes.byteLength, 0);
      if (bytesRead !== summary.byteLength) return null;
      const bytes = boundedBytes.subarray(0, bytesRead);
      if (createHash('sha256').update(bytes).digest('hex') !== summary.sha256) return null;
      const dimensions = validatePngBytes(bytes);
      if (dimensions.width !== summary.width || dimensions.height !== summary.height) return null;
      return { bytes, mimeType: 'image/png', sha256: summary.sha256 };
    } catch {
      return null;
    } finally {
      if (handle) await handle.close().catch(() => undefined);
    }
  }
}
