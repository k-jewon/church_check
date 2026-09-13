import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { migrate } from './migrate.js';

export const DB_PATH = resolve(process.cwd(), 'data', 'church.db');

// The connection is opened on first use, not on import. Importing a domain
// module to reach a pure helper must not touch the filesystem — that is how
// running the test suite once migrated (and emptied) the development DB.
let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!instance) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    instance = new DatabaseSync(DB_PATH);
    instance.exec('PRAGMA journal_mode = WAL');
    instance.exec('PRAGMA foreign_keys = ON');
    migrate(instance);
  }
  return instance;
}

/** Swap in another connection. For tests: `useDb(new DatabaseSync(':memory:'))`. */
export function useDb(db: DatabaseSync): void {
  instance = db;
}
