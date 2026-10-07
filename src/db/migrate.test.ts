import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, ensureCurrent, migrate, pendingSteps, SchemaBehindError, userVersion, type Migration } from './migrate.js';

const LATEST = MIGRATIONS[MIGRATIONS.length - 1]!.version;

const tableNames = (db: DatabaseSync) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
    .map((r) => r.name);

test('MIGRATIONS: versions are 1..N with no gaps or repeats', () => {
  assert.deepEqual(
    MIGRATIONS.map((m) => m.version),
    MIGRATIONS.map((_, i) => i + 1),
  );
});

test('fresh DB: migrates to the latest version and creates the schema', () => {
  const db = new DatabaseSync(':memory:');
  assert.equal(userVersion(db), 0);

  assert.equal(migrate(db), LATEST);
  assert.equal(userVersion(db), LATEST);
  for (const t of ['member', 'attendance', 'newfamily_profile', 'newfamily_session', 'visit_log']) {
    assert.ok(tableNames(db).includes(t), `${t} missing`);
  }
  assert.ok(!tableNames(db).includes('visitor'), 'visitor should be gone');
});

test('re-running applies nothing and keeps data', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  db.exec("INSERT INTO member (name, stage, sok, role) VALUES ('홍길동', '성도', '길동속', '속장')");

  assert.equal(migrate(db), LATEST);
  const row = db.prepare('SELECT COUNT(*) AS n FROM member').get() as { n: number };
  assert.equal(row.n, 1);
});

test('a DB already at the latest version skips the migration body', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA user_version = ${LATEST}`);

  const ran: number[] = [];
  const spied: Migration[] = MIGRATIONS.map((m) => ({ version: m.version, up: () => ran.push(m.version) }));
  migrate(db, spied);
  assert.deepEqual(ran, []);
});

test('a failing migration rolls back and leaves the version untouched', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);

  const broken: Migration[] = [
    {
      version: LATEST + 1,
      up: (d) => {
        d.exec('CREATE TABLE half_done (id INTEGER)');
        d.exec('THIS IS NOT SQL');
      },
    },
  ];
  assert.throws(() => migrate(db, broken));
  assert.equal(userVersion(db), LATEST);
  assert.ok(!tableNames(db).includes('half_done'));
});

test('v3: 예배 축의 `기타` 행은 지우고 다른 행은 남기며, 이후 `기타`를 받지 않는다', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, MIGRATIONS.filter((m) => m.version <= 2));
  db.exec("INSERT INTO member (id, name, stage, sok, role) VALUES (1, '홍길동', '성도', '길동속', '속장')");
  db.exec(`INSERT INTO attendance (member_id, service_date, status, stage_at, sok_at) VALUES
    (1, '2026-09-06', 'before', '성도', '길동속'),
    (1, '2026-09-13', 'etc',    '성도', '길동속'),
    (1, '2026-09-20', 'main',   '성도', '길동속')`);

  migrate(db);

  const rows = db.prepare('SELECT service_date, status FROM attendance ORDER BY service_date').all();
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    [
      { service_date: '2026-09-06', status: 'before' },
      { service_date: '2026-09-20', status: 'main' },
    ],
  );
  assert.throws(() =>
    db.exec("INSERT INTO attendance (member_id, service_date, status, stage_at, sok_at) VALUES (1, '2026-09-27', 'etc', '성도', '길동속')"),
  );
});

// ---------------------------------------------------------------------------
// 자동 마이그레이션은 빈 DB에서만 한다. 데이터가 든 DB는 명시적으로만 올린다(--migrate).
// ---------------------------------------------------------------------------
test('ensureCurrent: 빈 DB는 최신 스키마로 바로 만든다', () => {
  const db = new DatabaseSync(':memory:');

  ensureCurrent(db);
  assert.equal(userVersion(db), LATEST);
});

test('ensureCurrent: 버전이 낮은 DB는 올리지 않고 멈춘다', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, MIGRATIONS.filter((m) => m.version <= 2));
  db.exec("INSERT INTO member (name, stage, sok, role) VALUES ('홍길동', '성도', '길동속', '속장')");

  assert.throws(() => ensureCurrent(db), SchemaBehindError);
  assert.equal(userVersion(db), 2, '아무것도 바꾸지 않아야 한다');
});

test('ensureCurrent: 최신 DB는 그대로 연다', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);

  assert.doesNotThrow(() => ensureCurrent(db));
});

test('pendingSteps: 올라갈 단계마다 하는 일을 적고, v3은 지울 기타 행 수를 센다', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, MIGRATIONS.filter((m) => m.version <= 2));
  db.exec("INSERT INTO member (id, name, stage, sok, role) VALUES (1, '홍길동', '성도', '길동속', '속장')");
  db.exec(`INSERT INTO attendance (member_id, service_date, status, stage_at, sok_at) VALUES
    (1, '2026-09-06', 'etc', '성도', '길동속'),
    (1, '2026-09-13', 'etc', '성도', '길동속'),
    (1, '2026-09-20', 'before', '성도', '길동속')`);

  const steps = pendingSteps(db);
  assert.deepEqual(steps.map((s) => s.version), [3]);
  assert.match(steps[0]!.describe, /기타.*2건/);
});
