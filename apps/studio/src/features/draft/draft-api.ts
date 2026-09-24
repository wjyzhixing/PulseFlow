import type { Draft, T2uiResult } from '@pulseflow/contracts';
import type { RequirementSection } from '@pulseflow/requirement-import';
import { request } from '../../shared/api/client';
export function generateDraft(sections: RequirementSection[]): Promise<T2uiResult> {
  return request<T2uiResult>('/api/drafts/generate', { sections });
}

export function saveDraft(draft: Draft, existing = false): Promise<Draft> {
  return request<Draft>(existing ? `/api/drafts/${draft.id}` : '/api/drafts', draft, true, existing ? 'PUT' : 'POST');
}
