import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { useDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { createMember, deleteAllMembers, listMembers, listSoks } from './members.js';
import { attendanceInRange, getStatus, lastSeenUpTo, mark, markFirst } from './attendance.js';
import {
  addSession,
  allSessions,
  countSessions,
  eraseProfile,
  getProfile,
  inviterById,
  listSessions,
  promoteToBeliever,
  registerNewFamily,
  sessionCounts,
  sessionsOn,
  updateNewFamily,
} from './newfamily.js';
import { addVisit, listVisits, visitsInRange } from './visitlog.js';

// 도메인 함수를 **실제 SQLite** 위에서 검증한다. 가짜가 아니라 진짜 엔진이라
// 제약·CASCADE·NULL 처럼 SQL 안에 있는 판단까지 잡힌다.
// 파일은 열지 않는다 — useDb 가 매 테스트마다 :memory: 로 갈아 끼운다.

const D1 = '2026-08-09';
const D2 = '2026-08-16';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  useDb(db);
});

const 성도 = (name: string, sok: string, role: '속장' | '부속장' | '속원', birth: number | null) =>
  createMember({ name, birth_year: birth, stage: '성도', sok, role });

test('출석을 찍으면 당시 신분과 당시 속이 함께 박힌다', () => {
  const id = 성도('김갑자', '갑자속', '속장', 1985);
  mark(id, D1, 'before');

  const row = snapshotOf(id);
  assert.equal(row.stage_at, '성도');
  assert.equal(row.sok_at, '갑자속');
});

test('새가족의 출석에는 속이 없다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: 2001 }, {});
  mark(id, D1, 'after');

  const row = snapshotOf(id);
  assert.equal(row.stage_at, '새가족');
  assert.equal(row.sok_at, null);
});

test('속이 바뀌어도 이미 찍힌 출석의 스냅샷은 그날을 가리킨다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: 2001 }, {});
  mark(id, D1, 'before');

  // 새가족 과정을 마치고 속을 배정받았다.
  promote(id);
  mark(id, D2, 'before'); // 그 뒤 주일

  assert.deepEqual(snapshotOf(id, D1), { stage_at: '새가족', sok_at: null });
  assert.deepEqual(snapshotOf(id, D2), { stage_at: '성도', sok_at: '갑자속' });
});

test('같은 주일을 다시 찍으면 상태만 바뀌고 스냅샷은 그대로다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: 2001 }, {});
  mark(id, D1, 'before');
  promote(id);

  mark(id, D1, 'praise'); // 같은 날짜를 정정한다

  assert.equal(getStatus(id, D1), 'praise');
  assert.deepEqual(snapshotOf(id, D1), { stage_at: '새가족', sok_at: null });
});

test('현장 입력은 먼저 찍힌 출석을 덮지 않는다', () => {
  const id = 성도('김갑자', '갑자속', '속장', 1985);
  markFirst(id, D1, 'before');
  markFirst(id, D1, 'after'); // 다른 폰에서 화면이 갱신되기 전에 또 눌렀다

  assert.equal(getStatus(id, D1), 'before');
});

test('현장 입력이 먼저 찍혀도 현황 화면의 정정은 덮어쓴다', () => {
  const id = 성도('김갑자', '갑자속', '속장', 1985);
  markFirst(id, D1, 'before');
  mark(id, D1, 'after');

  assert.equal(getStatus(id, D1), 'after');
});

test('새가족 등록은 사람과 등록정보를 한 번에 만든다', () => {
  const id = registerNewFamily(
    { name: '정새봄', birth_year: 2001 },
    { phone: '010-1111-2222', gender: '여', inviter: '김갑자', route: '지인소개' },
  );

  const profile = getProfile(id)!;
  assert.equal(profile.phone, '010-1111-2222');
  assert.equal(profile.inviter, '김갑자');
  assert.equal(profile.route, '지인소개');
  assert.equal(profile.route_note, null);

  const m = listMembers().find((x) => x.id === id)!;
  assert.equal(m.stage, '새가족');
  assert.equal(m.sok, null, '새가족은 속이 없다');
  assert.equal(m.role, null);
});

test('방문경로 상세는 경로가 `기타`일 때만 남는다', () => {
  const a = registerNewFamily({ name: '갑', birth_year: null }, { route: '전도', route_note: '버려질 값' });
  const b = registerNewFamily({ name: '을', birth_year: null }, { route: '기타', route_note: '교회 앞 현수막' });

  assert.equal(getProfile(a)!.route_note, null);
  assert.equal(getProfile(b)!.route_note, '교회 앞 현수막');
});

test('회차는 같은 날짜로 두 번 세어지지 않는다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: null }, {});
  addSession(id, D1);
  addSession(id, D1); // 두 번 눌렀다
  addSession(id, D2);

  assert.equal(countSessions(id), 2);
  assert.deepEqual(listSessions(id), [D1, D2]);
});

test('회차는 예배 출석과 별개다 — 출석 행을 세어 구할 수 없다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: null }, {});
  mark(id, D1, 'before');
  mark(id, D2, 'before'); // 예배는 두 주 다 왔다
  addSession(id, D1); // 모임까지 한 것은 한 주뿐이다

  assert.equal(attendanceInRange([D1, D2]).length, 2);
  assert.equal(countSessions(id), 1);
});

test('방문 줄은 사람 레코드 없이 쌓이고 같은 이름도 날짜마다 따로 남는다', () => {
  addVisit(D1, '권을미');
  addVisit(D2, '권을미');
  addVisit(D2, '무명');

  assert.equal(listMembers().length, 0, '방문은 명단에 들어가지 않는다');
  assert.deepEqual(listVisits(D2).map((v) => v.name), ['권을미', '무명']);
  assert.equal(visitsInRange([D1, D2]).length, 3);
});

test('속 목록은 새가족의 빈 속을 넣지 않는다', () => {
  성도('김갑자', '갑자속', '속장', 1985);
  성도('이가온', '갑자속', '속원', 1990);
  성도('최한결', '군인', '속원', 1999);
  registerNewFamily({ name: '정새봄', birth_year: null }, {});

  assert.deepEqual(listSoks(), ['갑자속', '군인']);
});

test('명단은 성도를 먼저, 새가족을 뒤에 둔다', () => {
  성도('이가온', '을축속', '속원', 1990);
  registerNewFamily({ name: '정새봄', birth_year: null }, {});
  성도('김갑자', '갑자속', '속장', 1985);

  assert.deepEqual(listMembers().map((m) => m.name), ['김갑자', '이가온', '정새봄']);
});

test('명단 전체 초기화는 등록정보·회차·출석까지 함께 지운다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: null }, { phone: '010-0000-0000' });
  mark(id, D1, 'before');
  addSession(id, D1);

  deleteAllMembers();

  assert.equal(listMembers().length, 0);
  assert.equal(getProfile(id), undefined, '등록정보가 남으면 지운 사람의 개인정보가 남는다');
  assert.equal(countSessions(id), 0);
  assert.equal(attendanceInRange([D1]).length, 0);
});

test('승격은 등록정보와 회차를 지우지 않는다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: 2001 }, { phone: '010-1111-2222' });
  addSession(id, D1);
  addSession(id, D2);

  promote(id);

  const m = listMembers().find((x) => x.id === id)!;
  assert.equal(m.stage, '성도');
  assert.equal(m.sok, '갑자속');
  assert.equal(m.role, '속원');
  assert.equal(getProfile(id)!.phone, '010-1111-2222', '연락처는 담당 사역자의 것이라 남는다');
  assert.equal(countSessions(id), 2, '회차는 그 사람이 무엇을 했는지의 기록이라 남는다');
});

test('그 주일의 모임 참여자만 돌려준다', () => {
  const a = registerNewFamily({ name: '정새봄', birth_year: null }, {});
  const b = registerNewFamily({ name: '한여울', birth_year: null }, {});
  addSession(a, D1);
  addSession(a, D2);
  addSession(b, D2);

  assert.deepEqual([...sessionsOn(D1)], [a]);
  assert.deepEqual([...sessionsOn(D2)].sort(), [a, b].sort());
  assert.deepEqual([...sessionCounts()].sort(), [[a, 2], [b, 1]].sort());
});

test('출석부가 읽는 회차는 승격한 사람 것까지 날짜순이다', () => {
  const a = registerNewFamily({ name: '정새봄', birth_year: null }, {});
  const b = registerNewFamily({ name: '한여울', birth_year: null }, {});
  addSession(a, D2);
  addSession(b, D1);
  promote(a);

  assert.deepEqual(
    allSessions().map((s) => [s.member_id, s.meeting_date]),
    [
      [b, D1],
      [a, D2],
    ],
  );
});

test('비고가 읽는 마지막 출석은 본당을 포함하고 기준일 뒤를 보지 않으며, 기록이 없으면 등록일이다', () => {
  const a = 성도('김갑자', '갑자속', '속장', 1985);
  const b = 성도('이가온', '갑자속', '속원', 1990);
  mark(a, D1, 'main'); // 본당도 교회에 나온 것이다
  mark(a, '2026-08-23', 'before'); // 기준일(D2) 뒤
  db.prepare(`UPDATE member SET created_at = '2026-03-01 10:00:00' WHERE id = ?`).run(b);

  const byId = new Map(lastSeenUpTo(D2).map((r) => [r.member_id, r.last_seen]));
  assert.equal(byId.get(a), D1);
  assert.equal(byId.get(b), '2026-03-01');
});

test('인도자는 적혀 있는 새가족만 돌려준다', () => {
  const a = registerNewFamily({ name: '정새봄', birth_year: null }, { inviter: '김갑자' });
  registerNewFamily({ name: '한여울', birth_year: null }, {});

  assert.deepEqual([...inviterById()], [[a, '김갑자']]);
});

// ---- helpers ----
// ---- 등록정보 수정·삭제 (G24) ----
// 근거: context/wayfinder/tickets/13-보관-개인정보-범위.md 3번

test('등록정보 수정은 이름·생년과 등록정보를 함께 고친다', () => {
  const id = registerNewFamily(
    { name: '정새봄', birth_year: 2001 },
    { phone: '010-1111-2222', gender: '여', inviter: '김갑자', route: '기타', route_note: '현수막' },
  );

  updateNewFamily(id, { name: '정새봄이', birth_year: 2002 }, { phone: '010-3333-4444', route: '전도', route_note: '버려질 값' });

  const m = listMembers().find((x) => x.id === id)!;
  assert.equal(m.name, '정새봄이');
  assert.equal(m.birth_year, 2002);
  assert.equal(m.stage, '새가족', '수정은 신분을 바꾸지 않는다');
  const p = getProfile(id)!;
  assert.equal(p.phone, '010-3333-4444');
  assert.equal(p.gender, null, '비운 칸은 비워진다');
  assert.equal(p.inviter, null);
  assert.equal(p.route, '전도');
  assert.equal(p.route_note, null, '상세는 `기타`일 때만 남는다');
});

test('승격한 성도의 등록정보도 고칠 수 있고 속·직분은 그대로다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: 2001 }, { phone: '010-1111-2222' });
  promote(id);

  updateNewFamily(id, { name: '정새봄', birth_year: 2001 }, { phone: '010-9999-0000' });

  const m = listMembers().find((x) => x.id === id)!;
  assert.equal(m.stage, '성도');
  assert.equal(m.sok, '갑자속');
  assert.equal(m.role, '속원');
  assert.equal(getProfile(id)!.phone, '010-9999-0000');
});

test('등록정보 삭제는 인도자만 남기고 개인정보를 비운다', () => {
  const id = registerNewFamily(
    { name: '정새봄', birth_year: 2001 },
    { phone: '010-1111-2222', gender: '여', inviter: '김갑자', route: '기타', route_note: '현수막' },
  );

  eraseProfile(id);

  const p = getProfile(id)!;
  assert.equal(p.phone, null);
  assert.equal(p.gender, null);
  assert.equal(p.route, null);
  assert.equal(p.route_note, null);
  assert.equal(p.inviter, '김갑자', '인도자는 출석부 지면의 일부라 남는다');
  assert.equal(inviterById().get(id), '김갑자');
});

test('등록정보를 지워도 사람·회차·출석은 남는다', () => {
  const id = registerNewFamily({ name: '정새봄', birth_year: 2001 }, { phone: '010-1111-2222' });
  addSession(id, D1);
  mark(id, D1, 'after');

  eraseProfile(id);

  assert.ok(listMembers().some((x) => x.id === id));
  assert.equal(countSessions(id), 1);
  assert.equal(getStatus(id, D1), 'after');
});

function promote(memberId: number): void {
  promoteToBeliever(memberId, '갑자속', '속원');
}

// 스냅샷 칸은 도메인이 읽지 않으므로(인쇄 경로의 몫) 여기서 직접 확인한다.
function snapshotOf(memberId: number, date = D1): { stage_at: string; sok_at: string | null } {
  const row = db
    .prepare('SELECT stage_at, sok_at FROM attendance WHERE member_id = ? AND service_date = ?')
    .get(memberId, date) as { stage_at: string; sok_at: string | null };
  // node:sqlite 는 null 프로토타입 객체를 돌려준다. deepEqual 이 프로토타입까지 보므로 옮겨 담는다.
  return { stage_at: row.stage_at, sok_at: row.sok_at };
}
