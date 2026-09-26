import type Database from 'better-sqlite3';

export interface AssetSummary {
  assetId: string;
  pageId: string;
  draftId?: string;
  mimeType: 'image/png';
  byteLength: number;
  width: number;
  height: number;
  sha256: string;
  createdAt: string;
}

interface AssetRow extends Omit<AssetSummary, 'draftId'> { draftId: string | null }

function toSummary(row: AssetRow): AssetSummary {
  const { draftId, ...summary } = row;
  return draftId ? { ...summary, draftId } : summary;
}

export class AssetRepository {
  constructor(private readonly db: Database.Database) {}

  create(asset: AssetSummary): AssetSummary {
    this.db.prepare(`INSERT INTO assets (assetId, pageId, draftId, mimeType, byteLength, width, height, sha256, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(asset.assetId, asset.pageId, asset.draftId ?? null, asset.mimeType,
      asset.byteLength, asset.width, asset.height, asset.sha256, asset.createdAt);
    return asset;
  }

  get(assetId: string): AssetSummary | null {
    const row = this.db.prepare('SELECT assetId, pageId, draftId, mimeType, byteLength, width, height, sha256, createdAt FROM assets WHERE assetId = ?')
      .get(assetId) as AssetRow | undefined;
    return row ? toSummary(row) : null;
  }
}
