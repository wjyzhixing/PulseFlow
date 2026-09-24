import type Database from 'better-sqlite3';

export class PublicationRepository {
  constructor(private readonly db: Database.Database) {}

  isPublished(draftId: string): boolean {
    return this.db.prepare('SELECT 1 FROM publications WHERE draftId = ? LIMIT 1').get(draftId) !== undefined;
  }
}
