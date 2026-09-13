import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { useDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { createMember, deleteAllMembers, listMembers, listSoks } from './members.js';
import { attendanceInRange, getStatus, mark } from './attendance.js';
import { addSession, countSessions, getProfile, listSessions, registerNewFamily } from './newfamily.js';
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

// ---- helpers ----
// 새가족 → 성도 전환은 아직 도메인 함수가 없어 테스트가 직접 민다(화면 작업의 몫).
function promote(memberId: number): void {
  db.prepare("UPDATE member SET stage = '성도', sok = '갑자속', role = '속원' WHERE id = ?").run(memberId);
}

// 스냅샷 칸은 도메인이 읽지 않으므로(인쇄 경로의 몫) 여기서 직접 확인한다.
function snapshotOf(memberId: number, date = D1): { stage_at: string; sok_at: string | null } {
  const row = db
    .prepare('SELECT stage_at, sok_at FROM attendance WHERE member_id = ? AND service_date = ?')
    .get(memberId, date) as { stage_at: string; sok_at: string | null };
  // node:sqlite 는 null 프로토타입 객체를 돌려준다. deepEqual 이 프로토타입까지 보므로 옮겨 담는다.
  return { stage_at: row.stage_at, sok_at: row.sok_at };
}
