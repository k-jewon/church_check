import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ensureCurrent } from './migrate.js';

export const DB_PATH = resolve(process.cwd(), 'data', 'church.db');

// The connection is opened on first use, not on import. Importing a domain
// module to reach a pure helper must not touch the filesystem — that is how
// running the test suite once migrated (and emptied) the development DB.
let instance: DatabaseSync | null = null;

// 빈 DB는 최신 스키마로 만들지만, 버전이 낮은 DB는 올리지 않고 SchemaBehindError 로 멈춘다.
// 데이터가 든 DB는 `--migrate`(src/db/migrate-cli.ts)로만 올린다.
export function getDb(): DatabaseSync {
  if (!instance) {
    const db = openDbFile();
    try {
      ensureCurrent(db);
    } catch (err) {
      db.close();
      throw err;
    }
    instance = db;
  }
  return instance;
}

/** DB 파일을 스키마 확인 없이 연다. `--migrate` 만 쓴다. */
export function openDbFile(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/** Swap in another connection. For tests: `useDb(new DatabaseSync(':memory:'))`. */
export function useDb(db: DatabaseSync): void {
  instance = db;
}
