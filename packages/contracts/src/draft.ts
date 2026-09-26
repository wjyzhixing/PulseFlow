import type { EntityField, PageDsl, SemanticQuestion } from '@pulseflow/ui-dsl';

export interface T2uiResult {
  entityFields: EntityField[];
  pageDsl: PageDsl;
  semanticQuestions: SemanticQuestion[];
}

export type PageType = 'auto' | 'website' | 'admin';

export interface DraftRefinementInput {
  instruction: string;
  entityFields: EntityField[];
  pageDsl: PageDsl;
  semanticQuestions: SemanticQuestion[];
}

export interface Draft {
  id: string;
  pageId: string;
  pageDsl: PageDsl;
  entityFields: EntityField[];
  semanticQuestions: SemanticQuestion[];
  status: 'draft' | 'confirmed';
}

export function getUnresolvedQuestions(questions: readonly SemanticQuestion[]): SemanticQuestion[] {
  return questions.filter((question) => !question.answer?.trim());
}

export function createDraft(draft: Draft): Draft {
  if (draft.pageId !== draft.pageDsl.pageId) {
    throw new Error('Draft pageId must match pageDsl.pageId');
  }
  return draft;
}
