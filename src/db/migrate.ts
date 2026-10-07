import type { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, SCHEMA_V2_SQL, SCHEMA_V3_SQL } from './schema.js';

export type Migration = {
  version: number;
  up: (db: DatabaseSync) => void;
  // 올리기 전에 운영자에게 보일 설명. 지우는 데이터가 있으면 몇 건인지까지 센다.
  describe?: (db: DatabaseSync) => string;
};

// Append-only. Version 1 is the schema as it stood before this runner existed;
// it is all CREATE ... IF NOT EXISTS, so re-running it on an existing DB is a no-op.
export const MIGRATIONS: Migration[] = [
  { version: 1, up: (db) => db.exec(SCHEMA_SQL), describe: () => '기본 표를 만든다' },
  {
    version: 2,
    up: (db) => db.exec(SCHEMA_V2_SQL),
    describe: () => '신분·속 스키마로 다시 만든다 — 기존 명단·출석·방문자를 모두 지운다',
  },
  {
    version: 3,
    up: (db) => db.exec(SCHEMA_V3_SQL),
    describe: (db) => {
      const { n } = db.prepare("SELECT COUNT(*) AS n FROM attendance WHERE status = 'etc'").get() as { n: number };
      return `출석 종류 \`기타\`를 없앤다 — 기타로 찍힌 출석 ${n}건을 지운다`;
    },
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

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

// 데이터가 든 DB를 자동으로 올리지 않는다(소유자 결정 2026-10-07). 마이그레이션은 데이터를
// 지울 수 있고 되돌릴 수 없으므로, 백업한 뒤 `--migrate`로만 올린다. 표가 하나도 없는
// 빈 DB(첫 설치·테스트·시드)는 지울 것이 없으므로 바로 최신 스키마로 만든다.
export class SchemaBehindError extends Error {
  constructor(
    readonly from: number,
    readonly to: number,
  ) {
    super(
      `DB 스키마가 v${from}입니다. 이 실행파일은 v${to}가 필요합니다.\n` +
        '  서버를 켜기 전에 마이그레이션.bat(개발 환경은 npm run migrate)으로 DB를 올리세요.\n' +
        '  마이그레이션은 데이터를 지울 수 있으므로 README 「마이그레이션 주의 사항」을 먼저 읽으세요.',
    );
    this.name = 'SchemaBehindError';
  }
}

export function isEmpty(db: DatabaseSync): boolean {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number };
  return n === 0;
}

/** 빈 DB는 최신으로 만들고, 버전이 낮은 DB는 건드리지 않고 SchemaBehindError 를 던진다. */
export function ensureCurrent(db: DatabaseSync): void {
  if (isEmpty(db)) {
    migrate(db);
    return;
  }
  const from = userVersion(db);
  if (from < LATEST_VERSION) throw new SchemaBehindError(from, LATEST_VERSION);
}

/** 이 DB에 아직 적용되지 않은 단계와, 각 단계가 하는 일. */
export function pendingSteps(db: DatabaseSync): { version: number; describe: string }[] {
  const from = userVersion(db);
  return MIGRATIONS.filter((m) => m.version > from).map((m) => ({
    version: m.version,
    describe: m.describe?.(db) ?? '',
  }));
}
