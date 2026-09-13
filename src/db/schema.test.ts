import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrate.js';

// v2 스키마가 도메인 규칙을 DB 수준에서 지키는지 본다.
// 규칙의 출처: context/wayfinder/tickets/12-방문-새가족-등록-경로-통합.md

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

const insertMember = (db: DatabaseSync, stage: string, sok: string | null, role: string | null) =>
  db
    .prepare('INSERT INTO member (name, stage, sok, role) VALUES (?, ?, ?, ?)')
    .run('아무개', stage, sok, role);

test('성도는 속과 직분을 둘 다 갖는다', () => {
  const db = freshDb();
  insertMember(db, '성도', '길동속', '속장');
  assert.throws(() => insertMember(db, '성도', null, '속원'), /CHECK/);
  assert.throws(() => insertMember(db, '성도', '길동속', null), /CHECK/);
});

test('새가족은 속도 직분도 없다', () => {
  const db = freshDb();
  insertMember(db, '새가족', null, null);
  assert.throws(() => insertMember(db, '새가족', '길동속', null), /CHECK/);
  assert.throws(() => insertMember(db, '새가족', null, '속원'), /CHECK/);
});

test('신분은 새가족과 성도 둘뿐이다 — 방문은 사람 레코드가 아니다', () => {
  const db = freshDb();
  assert.throws(() => insertMember(db, '방문', null, null), /CHECK/);
});

test('새가족 등록정보는 member와 1:1이고 사람이 지워지면 함께 지워진다', () => {
  const db = freshDb();
  const id = Number(insertMember(db, '새가족', null, null).lastInsertRowid);
  db.prepare('INSERT INTO newfamily_profile (member_id, phone) VALUES (?, ?)').run(id, '010-0000-0000');
  assert.throws(
    () => db.prepare('INSERT INTO newfamily_profile (member_id) VALUES (?)').run(id),
    /UNIQUE|PRIMARY KEY/,
  );

  db.prepare('DELETE FROM member WHERE id = ?').run(id);
  const left = db.prepare('SELECT COUNT(*) AS n FROM newfamily_profile').get() as { n: number };
  assert.equal(left.n, 0);
});

test('회차는 같은 날짜로 두 번 세어지지 않는다', () => {
  const db = freshDb();
  const id = Number(insertMember(db, '새가족', null, null).lastInsertRowid);
  const add = (d: string) =>
    db.prepare('INSERT INTO newfamily_session (member_id, meeting_date) VALUES (?, ?)').run(id, d);
  add('2026-09-06');
  add('2026-09-13');
  assert.throws(() => add('2026-09-13'), /UNIQUE|PRIMARY KEY/);

  const n = db.prepare('SELECT COUNT(*) AS n FROM newfamily_session').get() as { n: number };
  assert.equal(n.n, 2);
});

test('방문 줄은 사람 레코드와 무관하고 같은 날 같은 이름도 두 줄이 된다', () => {
  const db = freshDb();
  const add = (name: string) =>
    db.prepare('INSERT INTO visit_log (visit_date, name) VALUES (?, ?)').run('2026-09-13', name);
  add('커플');
  add('커플');
  add('무명');
  const n = db.prepare('SELECT COUNT(*) AS n FROM visit_log').get() as { n: number };
  assert.equal(n.n, 3);
});

test('출석 행은 당시 신분을 반드시 박고, 속은 성도일 때만 박힌다', () => {
  const db = freshDb();
  const sinner = Number(insertMember(db, '성도', '길동속', '속원').lastInsertRowid);
  const newcomer = Number(insertMember(db, '새가족', null, null).lastInsertRowid);
  const add = (id: number, stageAt: string | null, sokAt: string | null) =>
    db
      .prepare(
        'INSERT INTO attendance (member_id, service_date, status, stage_at, sok_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, '2026-09-13', 'before', stageAt, sokAt);

  add(sinner, '성도', '길동속');
  add(newcomer, '새가족', null);
  assert.throws(() => add(sinner, null, '길동속'), /NOT NULL/);

  db.prepare('DELETE FROM member WHERE id = ?').run(sinner);
  const left = db.prepare('SELECT COUNT(*) AS n FROM attendance').get() as { n: number };
  assert.equal(left.n, 1);
});

test('속이 바뀌어도 이미 박힌 출석 행의 속은 따라 바뀌지 않는다', () => {
  const db = freshDb();
  const id = Number(insertMember(db, '새가족', null, null).lastInsertRowid);
  db.prepare(
    'INSERT INTO attendance (member_id, service_date, status, stage_at, sok_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, '2026-09-06', 'before', '새가족', null);

  db.prepare("UPDATE member SET stage = '성도', sok = '길동속', role = '속원' WHERE id = ?").run(id);

  const row = db.prepare('SELECT stage_at, sok_at FROM attendance WHERE member_id = ?').get(id) as {
    stage_at: string;
    sok_at: string | null;
  };
  assert.equal(row.stage_at, '새가족');
  assert.equal(row.sok_at, null);
});
