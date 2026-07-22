import { db } from '../db/index.js';
import { createMember, type Role } from './members.js';

export type Route = '전도' | '지인소개' | '온라인' | '기타';
export const ROUTES: Route[] = ['전도', '지인소개', '온라인', '기타'];

export interface Visitor {
  id: number;
  name: string;
  phone: string | null;
  gender: string | null;
  birth_year: number | null;
  inviter: string | null;
  route: Route | null;
  route_note: string | null;
  visit_date: string;
  promoted_member_id: number | null;
  created_at: string;
}

export interface NewVisitor {
  name: string;
  phone?: string | null;
  gender?: string | null;
  birth_year?: number | null;
  inviter?: string | null;
  route?: Route | null;
  route_note?: string | null;
  visit_date: string;
}

export function isRoute(v: unknown): v is Route {
  return v === '전도' || v === '지인소개' || v === '온라인' || v === '기타';
}

export function createVisitor(v: NewVisitor): number {
  const info = db
    .prepare(
      `INSERT INTO visitor (name, phone, gender, birth_year, inviter, route, route_note, visit_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      v.name,
      v.phone ?? null,
      v.gender ?? null,
      v.birth_year ?? null,
      v.inviter ?? null,
      v.route ?? null,
      v.route === '기타' ? (v.route_note ?? null) : null,
      v.visit_date,
    );
  return Number(info.lastInsertRowid);
}

export function listVisitors(): Visitor[] {
  // Unpromoted first, then newest visit first.
  return db
    .prepare(
      `SELECT * FROM visitor
       ORDER BY (promoted_member_id IS NOT NULL) ASC, visit_date DESC, id DESC`,
    )
    .all() as unknown as Visitor[];
}

export function getVisitor(id: number): Visitor | undefined {
  return db.prepare('SELECT * FROM visitor WHERE id = ?').get(id) as unknown as Visitor | undefined;
}

// Promote a visitor into the roster; visitor record is kept and linked.
export function promoteVisitor(
  visitorId: number,
  member: { name: string; birth_year: number; sok: string; role: Role },
): number {
  db.exec('BEGIN');
  try {
    const memberId = createMember(member);
    db.prepare('UPDATE visitor SET promoted_member_id = ? WHERE id = ?').run(memberId, visitorId);
    db.exec('COMMIT');
    return memberId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
