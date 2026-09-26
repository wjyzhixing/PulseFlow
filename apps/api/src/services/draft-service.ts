import type { Draft } from '@pulseflow/contracts';
import { InvalidDraftError } from '../db/draft-repository.js';

export function parseDraft(value: unknown, id?: string): Draft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidDraftError();
  const draft = value as Partial<Draft>;
  if (Object.keys(value).some((key) => !['id', 'pageId', 'pageDsl', 'entityFields', 'semanticQuestions', 'status', 'rawRequirement', 'sourcePath'].includes(key)) ||
      typeof draft.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(draft.id) ||
      (id !== undefined && draft.id !== id) ||
      typeof draft.pageId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(draft.pageId) ||
      !draft.pageDsl || typeof draft.pageDsl !== 'object' || draft.pageDsl.pageId !== draft.pageId ||
      !Array.isArray(draft.entityFields) || !Array.isArray(draft.semanticQuestions) ||
      !['draft', 'confirmed'].includes(String(draft.status))) throw new InvalidDraftError();
  return {
    id: draft.id as string,
    pageId: draft.pageId as string,
    pageDsl: draft.pageDsl,
    entityFields: draft.entityFields,
    semanticQuestions: draft.semanticQuestions,
    status: draft.status as Draft['status']
  };
}
