import type { RequirementSection } from '@pulseflow/requirement-import';
import { request } from '../../shared/api/client';
export async function parseRequirement(source: string | File): Promise<RequirementSection[]> {
  const body = typeof source === 'string' ? { text: source } : new FormData();
  if (body instanceof FormData) body.append('file', source);
  const data = await request<{ sections: RequirementSection[] }>('/api/requirements/parse', body);
  return data.sections;
}
