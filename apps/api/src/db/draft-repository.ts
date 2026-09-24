import type Database from 'better-sqlite3';
import type { Draft } from '@pulseflow/contracts';
import { validatePageDsl } from '@pulseflow/ui-dsl';

export interface DraftRecord { id: string; pageId: string; pageDslJson: string; entityFieldsJson: string; semanticQuestionsJson: string; status: 'draft' | 'confirmed'; updatedAt: string }

export class InvalidDraftError extends Error {
  constructor(public readonly diagnostics: Array<{ code: string; path: string; message: string }> = []) { super('Draft is invalid'); }
}

function storedDraft(draft: Draft): Draft {
  return {
    id: draft.id,
    pageId: draft.pageId,
    pageDsl: draft.pageDsl,
    entityFields: draft.entityFields,
    semanticQuestions: draft.semanticQuestions,
    status: draft.status
  };
}

export class DraftRepository {
  constructor(private readonly db: Database.Database) {}

  get(id: string): Draft | null {
    const row = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRecord | undefined;
    return row ? { id: row.id, pageId: row.pageId, pageDsl: JSON.parse(row.pageDslJson), entityFields: JSON.parse(row.entityFieldsJson), semanticQuestions: JSON.parse(row.semanticQuestionsJson), status: row.status } : null;
  }

  create(draft: Draft): Draft {
    this.validate(draft);
    const stored = storedDraft(draft);
    this.db.prepare('INSERT INTO drafts (id, pageId, pageDslJson, entityFieldsJson, semanticQuestionsJson, status, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(stored.id, stored.pageId, JSON.stringify(stored.pageDsl), JSON.stringify(stored.entityFields), JSON.stringify(stored.semanticQuestions), stored.status, new Date().toISOString());
    return stored;
  }

  update(draft: Draft): Draft | null {
    this.validate(draft);
    const stored = storedDraft(draft);
    const changed = this.db.prepare('UPDATE drafts SET pageId = ?, pageDslJson = ?, entityFieldsJson = ?, semanticQuestionsJson = ?, status = ?, updatedAt = ? WHERE id = ?')
      .run(stored.pageId, JSON.stringify(stored.pageDsl), JSON.stringify(stored.entityFields), JSON.stringify(stored.semanticQuestions), stored.status, new Date().toISOString(), stored.id);
    return changed.changes ? stored : null;
  }

  private validate(draft: Draft): void {
    if (!draft || typeof draft.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(draft.id) || typeof draft.pageId !== 'string' || draft.pageId !== draft.pageDsl?.pageId || !Array.isArray(draft.entityFields) || !Array.isArray(draft.semanticQuestions) || !['draft', 'confirmed'].includes(draft.status)) throw new InvalidDraftError();
    const result = validatePageDsl(draft.pageDsl, draft.entityFields);
    if (!result.ok) throw new InvalidDraftError(result.diagnostics);
    if (draft.semanticQuestions.some((question) =>
      !question || typeof question !== 'object' || Array.isArray(question) ||
      Object.keys(question).some((key) => !['id', 'question', 'answer'].includes(key)) ||
      typeof question.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(question.id) ||
      typeof question.question !== 'string' || !question.question.trim() ||
      (question.answer !== undefined && typeof question.answer !== 'string')
    )) throw new InvalidDraftError();
  }
}
