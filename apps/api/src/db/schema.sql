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
