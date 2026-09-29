import type { EntityField, PageDsl } from '@pulseflow/ui-dsl';
import { request } from '../../shared/api/client';
import type { ImageImportDetailTile, ImageImportRegion } from './image-import';

export type ImageImportPageType = 'auto' | 'website' | 'admin';
export interface ImageImportResult {
  pageDsl: PageDsl;
  entityFields: EntityField[];
  notes: string[];
  imageRegions: ImageImportRegion[];
}

export function convertImageToDsl(input: { imageDataUrl: string; detailImages?: ImageImportDetailTile[]; pageType: ImageImportPageType; instruction?: string }): Promise<ImageImportResult> {
  return request<ImageImportResult>('/api/drafts/import-image', input);
}

export function saveImportedImageRegions(input: {
  pageId: string;
  pageDsl: PageDsl;
  imageDataUrl: string;
  regions: ImageImportRegion[];
}): Promise<{ assets: Array<{ nodeId: string; assetId: string }> }> {
  return request<{ assets: Array<{ nodeId: string; assetId: string }> }>('/api/drafts/import-image/assets', input);
}
