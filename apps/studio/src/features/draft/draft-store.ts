import type { T2uiResult } from '@pulseflow/contracts';
import type { PageDsl, SemanticQuestion } from '@pulseflow/ui-dsl';
import { shallowRef } from 'vue';

export interface DraftSession {
  id: string;
  fieldsText: string;
  dslText: string;
  questions: SemanticQuestion[];
  revision: number;
  dirty: boolean;
  saved: boolean;
  saving: boolean;
}

type DraftEdits = Pick<DraftSession, 'fieldsText' | 'dslText' | 'questions'>;
const draft = shallowRef<DraftSession | null>(null);
export function getDraftSession(): DraftSession | null { return draft.value; }
export function setDraft(value: T2uiResult): void {
  draft.value = {
    id: `draft-${crypto.randomUUID()}`,
    fieldsText: JSON.stringify(value.entityFields, null, 2),
    dslText: JSON.stringify(value.pageDsl, null, 2),
    questions: value.semanticQuestions.map((question) => ({ ...question })),
    revision: 0,
    dirty: true,
    saved: false,
    saving: false
  };
}
export function setBlankDraft(title?: string): DraftSession {
  const pageDsl: PageDsl = {
    schemaVersion: 1,
    pageId: `page-${crypto.randomUUID()}`,
    title: title?.trim() || '未命名页面',
    nodes: []
  };
  const session: DraftSession = {
    id: `draft-${crypto.randomUUID()}`,
    fieldsText: '[]',
    dslText: JSON.stringify(pageDsl, null, 2),
    questions: [],
    revision: 0,
    dirty: true,
    saved: false,
    saving: false
  };
  draft.value = session;
  return { ...session, questions: session.questions.map((question) => ({ ...question })) };
}
export function editDraftSession(changes: Partial<DraftEdits>): void {
  if (draft.value) draft.value = { ...draft.value, ...changes, revision: draft.value.revision + 1, dirty: true };
}
export function beginDraftSave(expectedId: string): boolean {
  if (!draft.value || draft.value.id !== expectedId || draft.value.saving) return false;
  draft.value = { ...draft.value, saving: true };
  return true;
}
export function finishDraftSaveFailure(expectedId: string): void {
  if (draft.value?.id === expectedId) draft.value = { ...draft.value, saving: false };
}
export function markDraftSaved(expectedId: string, serverId: string, submittedRevision: number): boolean {
  if (!draft.value || draft.value.id !== expectedId) return false;
  const clean = draft.value.revision === submittedRevision;
  draft.value = { ...draft.value, id: serverId, saved: true, saving: false, dirty: !clean };
  return clean;
}
export function isDraftRevisionCurrent(expectedId: string, revision: number): boolean {
  return draft.value?.id === expectedId && draft.value.revision === revision;
}
export function clearDraft(): void { draft.value = null; }
