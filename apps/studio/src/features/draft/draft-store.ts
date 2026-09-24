import type { T2uiResult } from '@pulseflow/contracts';
import type { SemanticQuestion } from '@pulseflow/ui-dsl';
import { shallowRef } from 'vue';

export interface DraftSession {
  id: string;
  fieldsText: string;
  dslText: string;
  questions: SemanticQuestion[];
  saved: boolean;
}

const draft = shallowRef<DraftSession | null>(null);
export function getDraftSession(): DraftSession | null { return draft.value; }
export function setDraft(value: T2uiResult): void {
  draft.value = {
    id: `draft-${crypto.randomUUID()}`,
    fieldsText: JSON.stringify(value.entityFields, null, 2),
    dslText: JSON.stringify(value.pageDsl, null, 2),
    questions: value.semanticQuestions,
    saved: false
  };
}
export function updateDraftSession(changes: Partial<Omit<DraftSession, 'id'>>): void {
  if (draft.value) draft.value = { ...draft.value, ...changes };
}
export function clearDraft(): void { draft.value = null; }
