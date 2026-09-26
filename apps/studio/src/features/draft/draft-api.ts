import type { Draft, DraftRefinementInput, PageType, T2uiResult } from '@pulseflow/contracts';
import type { RequirementSection } from '@pulseflow/requirement-import';
import { request } from '../../shared/api/client';
import { getToken } from '../auth/auth-store';

export interface ImagePlan { prompt: string; targetNodeId?: string; placement: 'inline' | 'background' }
export interface GeneratedAsset { assetId: string; pageId: string; mimeType: 'image/png'; width: number; height: number; draftId?: string }
export interface DraftRefinementResult extends T2uiResult {
  intent?: 'page_edit' | 'image' | 'page_edit_and_image' | 'needs_confirmation';
  imagePlan?: ImagePlan;
  generatedAssets?: GeneratedAsset[];
  imageGeneration?: { status: 'failed'; error: { code: string; message: string } } |
    { status: 'generated'; asset: GeneratedAsset; applied: boolean; error?: { code: string; message: string } };
}
export interface GuardedDraftInput { draftId?: string; expectedRevision?: string }
export function generateDraft(sections: RequirementSection[], pageType: PageType = 'auto'): Promise<T2uiResult> {
  return request<T2uiResult>('/api/drafts/generate', { sections, pageType });
}

export function refineCurrentDraft(input: DraftRefinementInput & GuardedDraftInput): Promise<DraftRefinementResult> {
  return request<DraftRefinementResult>('/api/drafts/refine', input);
}

export function generateImageAsset(input: { pageId: string; imagePlan: ImagePlan } & GuardedDraftInput): Promise<GeneratedAsset> {
  return request<GeneratedAsset>('/api/assets/generate', input);
}

export async function getDraftRevision(draftId: string): Promise<string> {
  const token = getToken();
  if (!token) throw new Error('会话已过期，请重新登录');
  let response: Response;
  try { response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}`, { headers: { Authorization: `Bearer ${token}` } }); }
  catch { throw new Error('网络连接失败，请稍后重试'); }
  if (!response.ok) throw new Error('草稿版本读取失败，请重试');
  const revision = response.headers.get('etag')?.replace(/^"|"$/g, '');
  if (!revision) throw new Error('草稿版本不可用，请重试');
  return revision;
}

export function saveDraft(draft: Draft, existing = false): Promise<Draft> {
  return request<Draft>(existing ? `/api/drafts/${draft.id}` : '/api/drafts', draft, true, existing ? 'PUT' : 'POST');
}
