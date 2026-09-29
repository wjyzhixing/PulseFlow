import type { SkillInput, SkillSummary } from './skill-types';
import { read, request } from '../../shared/api/client';

export type { StudioSkillScope, SkillInput, SkillSummary } from './skill-types';

export function listSkills(): Promise<SkillSummary[]> {
  return read<SkillSummary[]>('/api/skills');
}

export function createSkill(input: SkillInput): Promise<SkillSummary> {
  return request<SkillSummary>('/api/skills', input);
}

export function updateSkill(input: SkillInput): Promise<SkillSummary> {
  return request<SkillSummary>(`/api/skills/${encodeURIComponent(input.slug)}`, input, true, 'PUT');
}

export function deleteSkill(slug: string): Promise<null> {
  return request<null>(`/api/skills/${encodeURIComponent(slug)}`, {}, true, 'DELETE');
}
