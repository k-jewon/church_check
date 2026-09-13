import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, migrate, userVersion, type Migration } from './migrate.js';

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
