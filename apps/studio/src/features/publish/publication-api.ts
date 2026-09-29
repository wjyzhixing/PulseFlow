import { getToken } from '../auth/auth-store';
import type { Diagnostic } from '@pulseflow/ui-dsl';

export type GateId = 'dsl' | 'preview-compile' | 'template-build';
export interface GateResult { id: GateId; status: 'passed' | 'failed'; blocking: boolean; diagnostics: Diagnostic[] }
export interface Publication { pageId: string; versionId: string; createdAt: string; manifest: Record<string, unknown>; files: Array<{ path: string; content: string }>; gates: GateResult[] }
export interface ProjectPageResult { pageId: string; status: 'passed' | 'failed'; gates: GateResult[]; versionId?: string }
export interface StudioProjectPublication { fileId: string; title: string; publications: Publication[] }

export class PublicationGateError extends Error {
  constructor(public readonly gates: GateResult[], message = '发布门槛未通过') { super(message); }
}

export class PublicationProjectGateError extends Error {
  constructor(public readonly pages: ProjectPageResult[], message = '一个或多个页面未通过发布检查') { super(message); }
}

export async function publishStudioProject(fileId: string, revision: number): Promise<StudioProjectPublication> {
  const token = getToken();
  if (!token) throw new Error('会话已过期，请重新登录');
  let response: Response;
  try {
    response = await fetch('/api/publications/projects', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, revision })
    });
  } catch { throw new Error('网络连接失败，请稍后重试'); }
  let payload: { ok: boolean; data?: StudioProjectPublication; error?: { message: string }; pages?: ProjectPageResult[] };
  try { payload = await response.json() as typeof payload; }
  catch { throw new Error('服务响应无效，请稍后重试'); }
  if (!response.ok || !payload.ok || !payload.data) {
    if (response.status === 422 && payload.pages) throw new PublicationProjectGateError(payload.pages, payload.error?.message);
    throw new Error(payload.error?.message ?? '发布失败，请稍后重试');
  }
  return payload.data;
}

export async function publishDraft(draftId: string): Promise<Publication> {
  const token = getToken();
  if (!token) throw new Error('会话已过期，请重新登录');
  let response: Response;
  try {
    response = await fetch('/api/publications', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId })
    });
  } catch { throw new Error('网络连接失败，请稍后重试'); }
  let payload: { ok: boolean; data?: Publication; error?: { message: string }; gates?: GateResult[] };
  try { payload = await response.json() as typeof payload; }
  catch { throw new Error('服务响应无效，请稍后重试'); }
  if (!response.ok || !payload.ok || !payload.data) {
    if (response.status === 422 && payload.gates) throw new PublicationGateError(payload.gates, payload.error?.message);
    throw new Error(payload.error?.message ?? '发布失败，请稍后重试');
  }
  return payload.data;
}
