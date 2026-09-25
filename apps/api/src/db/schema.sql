CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  pageId TEXT NOT NULL,
  pageDslJson TEXT NOT NULL,
  entityFieldsJson TEXT NOT NULL,
  semanticQuestionsJson TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed')),
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  draftId TEXT NOT NULL REFERENCES drafts(id),
  publishedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publication_versions (
  versionId TEXT PRIMARY KEY,
  pageId TEXT NOT NULL,
  draftId TEXT NOT NULL UNIQUE REFERENCES drafts(id),
  versionNumber INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  pageDslJson TEXT NOT NULL,
  entityFieldsJson TEXT NOT NULL,
  semanticQuestionsJson TEXT NOT NULL,
  manifestJson TEXT NOT NULL,
  filesJson TEXT NOT NULL,
  UNIQUE(pageId, versionNumber)
);
CREATE INDEX IF NOT EXISTS publication_versions_latest ON publication_versions(pageId, versionNumber DESC);
CREATE TRIGGER IF NOT EXISTS publication_versions_no_update BEFORE UPDATE ON publication_versions BEGIN SELECT RAISE(ABORT, 'publication.immutable'); END;
CREATE TRIGGER IF NOT EXISTS publication_versions_no_delete BEFORE DELETE ON publication_versions BEGIN SELECT RAISE(ABORT, 'publication.immutable'); END;
CREATE TRIGGER IF NOT EXISTS published_drafts_no_update BEFORE UPDATE ON drafts
  WHEN EXISTS (SELECT 1 FROM publication_versions WHERE draftId = OLD.id)
  BEGIN SELECT RAISE(ABORT, 'draft.published'); END;
CREATE TRIGGER IF NOT EXISTS published_drafts_no_delete BEFORE DELETE ON drafts
  WHEN EXISTS (SELECT 1 FROM publication_versions WHERE draftId = OLD.id)
  BEGIN SELECT RAISE(ABORT, 'draft.published'); END;
