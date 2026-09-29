CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  pageId TEXT NOT NULL,
  pageDslJson TEXT NOT NULL,
  entityFieldsJson TEXT NOT NULL,
  semanticQuestionsJson TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed')),
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_files (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  activePageId TEXT NOT NULL,
  pagesJson TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  assetId TEXT PRIMARY KEY CHECK (assetId GLOB 'asset-*'),
  pageId TEXT NOT NULL,
  draftId TEXT REFERENCES drafts(id) ON DELETE SET NULL,
  mimeType TEXT NOT NULL CHECK (mimeType = 'image/png'),
  byteLength INTEGER NOT NULL CHECK (byteLength > 0 AND byteLength <= 20971520),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_by_page ON assets(pageId, createdAt DESC);
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
