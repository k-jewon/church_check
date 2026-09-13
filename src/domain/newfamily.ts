import { db } from '../db/index.js';
import { createMember } from './members.js';

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
  return db.prepare('SELECT * FROM newfamily_profile WHERE member_id = ?').get(memberId) as
    | unknown as Profile
    | undefined;
}

export function saveProfile(memberId: number, p: NewProfile): void {
  db.prepare(
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
  db.exec('BEGIN');
  try {
    const memberId = createMember({ ...member, stage: '새가족', sok: null, role: null });
    saveProfile(memberId, profile);
    db.exec('COMMIT');
    return memberId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---- 회차 ----
// 한 줄이 1회차다. 예배 출석이 아니라 예배 후 새가족 모임 참여를 뜻하므로
// 출석 행에서 유도할 수 없다.

export function listSessions(memberId: number): string[] {
  const rows = db
    .prepare(
      'SELECT meeting_date FROM newfamily_session WHERE member_id = ? ORDER BY meeting_date',
    )
    .all(memberId) as { meeting_date: string }[];
  return rows.map((r) => r.meeting_date);
}

export function countSessions(memberId: number): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM newfamily_session WHERE member_id = ?')
      .get(memberId) as { n: number }
  ).n;
}

export function addSession(memberId: number, meetingDate: string): void {
  db.prepare(
    `INSERT INTO newfamily_session (member_id, meeting_date) VALUES (?, ?)
     ON CONFLICT (member_id, meeting_date) DO NOTHING`,
  ).run(memberId, meetingDate);
}

export function removeSession(memberId: number, meetingDate: string): void {
  db.prepare('DELETE FROM newfamily_session WHERE member_id = ? AND meeting_date = ?').run(
    memberId,
    meetingDate,
  );
}
