import { db } from '../db/index.js';

export type Role = '속장' | '부속장' | '속원';
export const ROLES: Role[] = ['속장', '부속장', '속원'];
const ROLE_RANK: Record<Role, number> = { 속장: 0, 부속장: 1, 속원: 2 };

export interface Member {
  id: number;
  name: string;
  birth_year: number; // 4-digit
  sok: string;
  role: Role;
  active: number; // 0 | 1
}
export interface NewMember {
  name: string;
  birth_year: number;
  sok: string;
  role: Role;
}

// Accept 2-digit (90, 00) or 4-digit (1990) input; store as 4-digit.
// 2-digit: <=25 -> 2000s, else 1900s (fits a young-adult ministry range).
export function normalizeBirthYear(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 1900 && n <= 2100) return n;
  if (n >= 0 && n < 100) return n <= 25 ? 2000 + n : 1900 + n;
  return null;
}

// Display as 2-digit with leading zero: 2000 -> "00", 1997 -> "97".
export function formatBirthYear(year: number): string {
  return String(year % 100).padStart(2, '0');
}

export function isRole(v: unknown): v is Role {
  return v === '속장' || v === '부속장' || v === '속원';
}

function sortMembers(rows: Member[]): Member[] {
  return rows.slice().sort(
    (a, b) =>
      a.sok.localeCompare(b.sok, 'ko') ||
      ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
      a.name.localeCompare(b.name, 'ko'),
  );
}

export function countMembers(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM member').get() as { n: number }).n;
}

export function listMembers(opts?: { activeOnly?: boolean }): Member[] {
  const sql = opts?.activeOnly ? 'SELECT * FROM member WHERE active = 1' : 'SELECT * FROM member';
  return sortMembers(db.prepare(sql).all() as unknown as Member[]);
}

export function getMember(id: number): Member | undefined {
  return db.prepare('SELECT * FROM member WHERE id = ?').get(id) as unknown as Member | undefined;
}

export function createMember(m: NewMember): number {
  const info = db
    .prepare('INSERT INTO member (name, birth_year, sok, role) VALUES (?, ?, ?, ?)')
    .run(m.name, m.birth_year, m.sok, m.role);
  return Number(info.lastInsertRowid);
}

export function updateMember(id: number, m: NewMember): void {
  db.prepare('UPDATE member SET name = ?, birth_year = ?, sok = ?, role = ? WHERE id = ?').run(
    m.name,
    m.birth_year,
    m.sok,
    m.role,
    id,
  );
}

export function setActive(id: number, active: boolean): void {
  db.prepare('UPDATE member SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function insertMany(members: NewMember[]): number {
  db.exec('BEGIN');
  try {
    const stmt = db.prepare('INSERT INTO member (name, birth_year, sok, role) VALUES (?, ?, ?, ?)');
    for (const m of members) stmt.run(m.name, m.birth_year, m.sok, m.role);
    db.exec('COMMIT');
    return members.length;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Wipe the whole roster (explicit admin reset before re-upload).
export function deleteAllMembers(): void {
  db.exec('DELETE FROM member');
}

export function listSoks(): string[] {
  const rows = db.prepare('SELECT DISTINCT sok FROM member').all() as { sok: string }[];
  return rows.map((r) => r.sok).sort((a, b) => a.localeCompare(b, 'ko'));
}
