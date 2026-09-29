export const STUDIO_SKILL_SCOPES = ['pageGeneration', 'pageRefinement', 'imageToDsl', 'layoutOptimization'] as const;
export type StudioSkillScope = typeof STUDIO_SKILL_SCOPES[number];

export interface SkillInput {
  slug: string;
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  studio_scopes: StudioSkillScope[];
  studio_enabled: boolean;
  body: string;
}

export interface SkillSummary extends SkillInput { path: string }
