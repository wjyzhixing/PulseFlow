import type { Draft } from '@pulseflow/contracts';
import { InvalidDraftError } from '../db/draft-repository.js';

export function parseDraft(value: unknown, id?: string): Draft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidDraftError();
  const draft = value as Draft;
  if (id !== undefined && draft.id !== id) throw new InvalidDraftError();
  return draft;
}
