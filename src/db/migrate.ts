import type { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema.js';

export type Migration = { version: number; up: (db: DatabaseSync) => void };

// Append-only. Version 1 is the schema as it stood before this runner existed;
// it is all CREATE ... IF NOT EXISTS, so re-running it on an existing DB is a no-op.
export const MIGRATIONS: Migration[] = [
  { version: 1, up: (db) => db.exec(SCHEMA_SQL) },
];

export function userVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

/** Applies every migration newer than the DB's user_version, each in its own transaction. */
export function migrate(db: DatabaseSync, migrations: Migration[] = MIGRATIONS): number {
  const from = userVersion(db);
  for (const m of migrations) {
    if (m.version <= from) continue;
    db.exec('BEGIN');
    try {
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return userVersion(db);
}
