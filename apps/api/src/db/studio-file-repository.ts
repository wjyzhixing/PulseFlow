import type Database from 'better-sqlite3';
import type { StudioFile, StudioFilePage, StudioFileSummary } from '@pulseflow/contracts';
import { validatePageDsl, type SemanticQuestion, type UiNode } from '@pulseflow/ui-dsl';

export type StudioFileInput = Omit<StudioFile, 'revision' | 'updatedAt'>;

export class InvalidStudioFileError extends Error {
  constructor(public readonly diagnostics: Array<{ code: string; path: string; message: string }> = []) {
    super('Studio file is invalid');
  }
}

export class StudioFileConflictError extends Error {
  constructor() { super('Studio file revision conflict'); }
}

interface StudioFileRow {
  id: string;
  title: string;
  activePageId: string;
  pagesJson: string;
  revision: number;
  updatedAt: string;
}

function isSemanticQuestion(value: unknown): value is SemanticQuestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const question = value as Record<string, unknown>;
  return Object.keys(question).every((key) => ['id', 'question', 'answer'].includes(key)) &&
    typeof question.id === 'string' && /^[A-Za-z0-9_-]+$/.test(question.id) &&
    typeof question.question === 'string' && Boolean(question.question.trim()) && question.question.length <= 1_000 &&
    (question.answer === undefined || (typeof question.answer === 'string' && question.answer.length <= 1_000));
}

function countNodes(nodes: readonly UiNode[]): number {
  const pending: UiNode[] = [...nodes];
  let count = 0;
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    count += 1;
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return count;
}

function clonePage(page: StudioFilePage): StudioFilePage {
  return {
    id: page.id,
    pageDsl: page.pageDsl,
    entityFields: page.entityFields,
    semanticQuestions: page.semanticQuestions.map((question) => ({ ...question }))
  };
}

export class StudioFileRepository {
  constructor(private readonly db: Database.Database) {}

  get(id: string): StudioFile | null {
    const row = this.db.prepare('SELECT * FROM studio_files WHERE id = ?').get(id) as StudioFileRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  latest(): StudioFile | null {
    const row = this.db.prepare('SELECT * FROM studio_files ORDER BY updatedAt DESC, id DESC LIMIT 1').get() as StudioFileRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  listRecent(limit = 12): StudioFileSummary[] {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    return this.db.prepare('SELECT id, title, revision, updatedAt FROM studio_files ORDER BY updatedAt DESC, id DESC LIMIT ?')
      .all(safeLimit) as StudioFileSummary[];
  }

  create(input: StudioFileInput): StudioFile {
    const pages = this.validate(input);
    const updatedAt = new Date().toISOString();
    this.db.prepare('INSERT INTO studio_files (id, title, activePageId, pagesJson, revision, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.id, input.title, input.activePageId, JSON.stringify(pages), 1, updatedAt);
    return { ...input, pages, revision: 1, updatedAt };
  }

  update(input: StudioFileInput, expectedRevision: number): StudioFile {
    const pages = this.validate(input);
    const updatedAt = new Date().toISOString();
    const result = this.db.prepare(`UPDATE studio_files SET title = ?, activePageId = ?, pagesJson = ?, revision = revision + 1, updatedAt = ?
      WHERE id = ? AND revision = ?`).run(input.title, input.activePageId, JSON.stringify(pages), updatedAt, input.id, expectedRevision);
    if (!result.changes) {
      if (!this.get(input.id)) throw new StudioFileConflictError();
      throw new StudioFileConflictError();
    }
    return { ...input, pages, revision: expectedRevision + 1, updatedAt };
  }

  private fromRow(row: StudioFileRow): StudioFile {
    return {
      id: row.id,
      title: row.title,
      activePageId: row.activePageId,
      pages: JSON.parse(row.pagesJson) as StudioFilePage[],
      revision: row.revision,
      updatedAt: row.updatedAt
    };
  }

  private validate(input: StudioFileInput): StudioFilePage[] {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !['id', 'title', 'activePageId', 'pages'].includes(key)) ||
      typeof input.id !== 'string' || !/^file-[A-Za-z0-9_-]+$/.test(input.id) ||
      typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 ||
      typeof input.activePageId !== 'string' || !Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 50) {
      throw new InvalidStudioFileError();
    }
    const pageTabIds = new Set<string>();
    const pageDslIds = new Set<string>();
    const normalized = input.pages.map((page, index) => {
      if (!page || typeof page !== 'object' || Array.isArray(page) ||
        Object.keys(page).some((key) => !['id', 'pageDsl', 'entityFields', 'semanticQuestions'].includes(key)) ||
        typeof page.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(page.id) || pageTabIds.has(page.id) ||
        !Array.isArray(page.entityFields) || page.entityFields.length > 100 ||
        !Array.isArray(page.semanticQuestions) || page.semanticQuestions.length > 50 ||
        !page.semanticQuestions.every(isSemanticQuestion)) throw new InvalidStudioFileError();
      const result = validatePageDsl(page.pageDsl, page.entityFields);
      if (!result.ok) throw new InvalidStudioFileError(result.diagnostics.map((item) => ({ ...item, path: `pages[${index}].${item.path}` })));
      if (pageDslIds.has(result.dsl.pageId) || countNodes(result.dsl.nodes) > 500) throw new InvalidStudioFileError();
      pageTabIds.add(page.id);
      pageDslIds.add(result.dsl.pageId);
      return { ...clonePage(page), pageDsl: result.dsl };
    });
    if (!pageTabIds.has(input.activePageId) || JSON.stringify(normalized).length > 3_500_000) throw new InvalidStudioFileError();
    return normalized;
  }
}
