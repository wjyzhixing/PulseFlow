import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export function openDatabase(path: string): Database.Database {
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  return db;
}
