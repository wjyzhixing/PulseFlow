import type Database from 'better-sqlite3';
import type { Draft } from '@pulseflow/contracts';
import type { GeneratedFile } from '@pulseflow/page-generator';

export interface Publication {
  pageId: string;
  versionId: string;
  createdAt: string;
  manifest: Record<string, unknown>;
  files: GeneratedFile[];
}

interface VersionRow {
  pageId: string;
  versionId: string;
  createdAt: string;
  manifestJson: string;
  filesJson: string;
}

interface CurrentDraftRow {
  pageId: string;
  status: string;
  pageDslJson: string;
  entityFieldsJson: string;
  semanticQuestionsJson: string;
}

export class PublicationStaleDraftError extends Error {
  constructor() { super('Draft changed during release checks'); }
}

function publication(row: VersionRow | undefined): Publication | null {
  return row ? { pageId: row.pageId, versionId: row.versionId, createdAt: row.createdAt,
    manifest: JSON.parse(row.manifestJson) as Record<string, unknown>, files: JSON.parse(row.filesJson) as GeneratedFile[] } : null;
}

export class PublicationRepository {
  constructor(private readonly db: Database.Database) {}

  isPublished(draftId: string): boolean {
    return this.db.prepare('SELECT 1 FROM publications WHERE draftId = ? UNION SELECT 1 FROM publication_versions WHERE draftId = ? LIMIT 1').get(draftId, draftId) !== undefined;
  }

  create(draft: Draft, files: GeneratedFile[]): Publication {
    return this.db.transaction(() => {
      const current = this.db.prepare(`SELECT pageId, status, pageDslJson, entityFieldsJson, semanticQuestionsJson
        FROM drafts WHERE id = ?`).get(draft.id) as CurrentDraftRow | undefined;
      if (!current || current.status !== 'confirmed' || current.pageId !== draft.pageId ||
        current.pageDslJson !== JSON.stringify(draft.pageDsl) ||
        current.entityFieldsJson !== JSON.stringify(draft.entityFields) ||
        current.semanticQuestionsJson !== JSON.stringify(draft.semanticQuestions)) {
        throw new PublicationStaleDraftError();
      }
      const previous = this.db.prepare('SELECT MAX(versionNumber) AS last FROM publication_versions WHERE pageId = ?').get(draft.pageId) as { last: number | null };
      const number = (previous.last ?? 0) + 1;
      const versionId = `${draft.pageId}-v${number}`;
      const createdAt = new Date().toISOString();
      const manifestFile = files.find((file) => file.path === 'src/generated/manifest.json');
      if (!manifestFile) throw new Error('Generated manifest missing');
      const manifest = JSON.parse(manifestFile.content) as Record<string, unknown>;
      this.db.prepare(`INSERT INTO publication_versions
        (versionId, pageId, draftId, versionNumber, createdAt, pageDslJson, entityFieldsJson, semanticQuestionsJson, manifestJson, filesJson)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(versionId, draft.pageId, draft.id, number, createdAt,
        JSON.stringify(draft.pageDsl), JSON.stringify(draft.entityFields), JSON.stringify(draft.semanticQuestions),
        JSON.stringify(manifest), JSON.stringify(files));
      return { pageId: draft.pageId, versionId, createdAt, manifest, files };
    }).immediate();
  }

  getVersion(versionId: string): Publication | null {
    return publication(this.db.prepare('SELECT pageId, versionId, createdAt, manifestJson, filesJson FROM publication_versions WHERE versionId = ?').get(versionId) as VersionRow | undefined);
  }

  getLatest(pageId: string): Publication | null {
    return publication(this.db.prepare('SELECT pageId, versionId, createdAt, manifestJson, filesJson FROM publication_versions WHERE pageId = ? ORDER BY versionNumber DESC LIMIT 1').get(pageId) as VersionRow | undefined);
  }
}
