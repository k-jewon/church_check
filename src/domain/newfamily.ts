import { getDb } from '../db/index.js';
import { createMember, updateMember, type Role } from './members.js';

// 새가족 등록정보와 회차. 둘 다 member(stage='새가족')에 매달린다.
// 근거: context/wayfinder/tickets/12-방문-새가족-등록-경로-통합.md

export type Route = '전도' | '지인소개' | '온라인' | '기타';
export const ROUTES: Route[] = ['전도', '지인소개', '온라인', '기타'];

export function isRoute(v: unknown): v is Route {
  return v === '전도' || v === '지인소개' || v === '온라인' || v === '기타';
}

// 새신자가 작성하는 정보. 이름·생년은 member가 들고 있다.
export interface Profile {
  member_id: number;
  phone: string | null;
  gender: string | null;
  inviter: string | null;
  route: Route | null;
  route_note: string | null;
  created_at: string;
}

export interface NewProfile {
  phone?: string | null;
  gender?: string | null;
  inviter?: string | null;
  route?: Route | null;
  route_note?: string | null;
}

export function getProfile(memberId: number): Profile | undefined {
  return getDb().prepare('SELECT * FROM newfamily_profile WHERE member_id = ?').get(memberId) as
    | unknown as Profile
    | undefined;
}

export function saveProfile(memberId: number, p: NewProfile): void {
  getDb().prepare(
    `INSERT INTO newfamily_profile (member_id, phone, gender, inviter, route, route_note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (member_id) DO UPDATE SET
       phone = excluded.phone, gender = excluded.gender, inviter = excluded.inviter,
       route = excluded.route, route_note = excluded.route_note`,
  ).run(
    memberId,
    p.phone ?? null,
    p.gender ?? null,
    p.inviter ?? null,
    p.route ?? null,
    p.route === '기타' ? (p.route_note ?? null) : null,
  );
}

// 새가족 등록 — 사람과 등록정보가 한 번에 생긴다. 방문에서 승격하는 경로가 아니다.
export function registerNewFamily(
  member: { name: string; birth_year: number | null },
  profile: NewProfile,
): number {
  getDb().exec('BEGIN');
  try {
    const memberId = createMember({ ...member, stage: '새가족', sok: null, role: null });
    saveProfile(memberId, profile);
    getDb().exec('COMMIT');
    return memberId;
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
}

// ---- 회차 ----
// 한 줄이 1회차다. 예배 출석이 아니라 예배 후 새가족 모임 참여를 뜻하므로
// 출석 행에서 유도할 수 없다.

export function listSessions(memberId: number): string[] {
  const rows = getDb()
    .prepare(
      'SELECT meeting_date FROM newfamily_session WHERE member_id = ? ORDER BY meeting_date',
    )
    .all(memberId) as { meeting_date: string }[];
  return rows.map((r) => r.meeting_date);
}

export function countSessions(memberId: number): number {
  return (
    getDb()
      .prepare('SELECT COUNT(*) AS n FROM newfamily_session WHERE member_id = ?')
      .get(memberId) as { n: number }
  ).n;
}

export function addSession(memberId: number, meetingDate: string): void {
  getDb().prepare(
    `INSERT INTO newfamily_session (member_id, meeting_date) VALUES (?, ?)
     ON CONFLICT (member_id, meeting_date) DO NOTHING`,
  ).run(memberId, meetingDate);
}

export function removeSession(memberId: number, meetingDate: string): void {
  getDb().prepare('DELETE FROM newfamily_session WHERE member_id = ? AND meeting_date = ?').run(
    memberId,
    meetingDate,
  );
}

export function sessionsOn(meetingDate: string): Set<number> {
  const rows = getDb()
    .prepare('SELECT member_id FROM newfamily_session WHERE meeting_date = ?')
    .all(meetingDate) as { member_id: number }[];
  return new Set(rows.map((r) => r.member_id));
}

export interface SessionRow {
  member_id: number;
  meeting_date: string;
}

// 출석부의 `1주`~`4주` 칸을 채울 때 한 번에 읽는다. 승격한 사람의 회차도 남아 있다.
export function allSessions(): SessionRow[] {
  return getDb()
    .prepare('SELECT member_id, meeting_date FROM newfamily_session ORDER BY meeting_date')
    .all() as unknown as SessionRow[];
}

// 출석부 비고에 새가족을 적을 때 이름 뒤 괄호에 드는 인도자.
export function inviterById(): Map<number, string> {
  const rows = getDb()
    .prepare(`SELECT member_id, inviter FROM newfamily_profile WHERE inviter IS NOT NULL AND inviter <> ''`)
    .all() as { member_id: number; inviter: string }[];
  return new Map(rows.map((r) => [r.member_id, r.inviter]));
}

// 목록 화면이 새가족마다 한 번씩 세지 않도록 한 번에 읽는다.
export function sessionCounts(): Map<number, number> {
  const rows = getDb()
    .prepare('SELECT member_id, COUNT(*) AS n FROM newfamily_session GROUP BY member_id')
    .all() as { member_id: number; n: number }[];
  return new Map(rows.map((r) => [r.member_id, r.n]));
}

// ---- 승격 ----
// 과정을 마친 새가족이 정식 성도가 되어 속을 배정받는다. 이 방향뿐이며 되돌리는
// 경로는 두지 않는다.
//
// **등록정보와 회차는 지우지 않는다.** 회차는 그 사람이 언제 무엇을 했는지의 기록이고,
// 등록정보는 새가족 담당 사역자의 연락처다. 과거 지면도 함께 지켜진다 —
// attendance 는 당시 신분을 스냅샷으로 들고 있어 승격이 소급하지 않는다.
export function promoteToBeliever(memberId: number, sok: string, role: Role): void {
  getDb()
    .prepare(`UPDATE member SET stage = '성도', sok = ?, role = ? WHERE id = ?`)
    .run(sok, role, memberId);
}

// ---- 수정·삭제 ----

// 이름·생년과 등록정보를 함께 고친다. 신분·속·직분은 이 경로로 바뀌지 않는다 —
// 성도가 되는 것은 승격의 일이다.
export function updateNewFamily(
  memberId: number,
  member: { name: string; birth_year: number | null },
  profile: NewProfile,
): void {
  getDb().exec('BEGIN');
  try {
    updateMember(memberId, { ...member, stage: '새가족', sok: null, role: null });
    saveProfile(memberId, profile);
    getDb().exec('COMMIT');
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
}

// 잘못 등록한 사람을 지운다. 등록정보·회차·출석이 CASCADE 로 함께 사라지므로
// 오등록을 되돌리는 일에만 쓴다. 성도는 이 경로로 지워지지 않는다 — 명단에서
// 사라질 사람은 비활성으로 남긴다.
export function deleteNewFamily(memberId: number): boolean {
  const info = getDb().prepare(`DELETE FROM member WHERE id = ? AND stage = '새가족'`).run(memberId);
  return Number(info.changes) > 0;
}
