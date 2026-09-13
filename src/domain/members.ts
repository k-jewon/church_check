import { db } from '../db/index.js';

export type Role = '속장' | '부속장' | '속원';
export const ROLES: Role[] = ['속장', '부속장', '속원'];
const ROLE_RANK: Record<Role, number> = { 속장: 0, 부속장: 1, 속원: 2 };

// 신분. 속은 정식 성도만 갖고, 새가족은 4주 과정을 마쳐야 성도가 된다.
// 방문자는 사람 레코드가 아니므로(visit_log) 여기에 없다.
export type Stage = '새가족' | '성도';
export const STAGES: Stage[] = ['새가족', '성도'];
const STAGE_RANK: Record<Stage, number> = { 성도: 0, 새가족: 1 };

export interface Member {
  id: number;
  name: string;
  birth_year: number | null; // 4-digit; 미입력이면 null
  stage: Stage;
  sok: string | null; // 성도만 갖는다
  role: Role | null; // 성도만 갖는다
  active: number; // 0 | 1
}
export interface NewMember {
  name: string;
  birth_year: number | null;
  stage: Stage;
  sok: string | null;
  role: Role | null;
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
// null(미입력) -> "".
export function formatBirthYear(year: number | null): string {
  if (year === null) return '';
  return String(year % 100).padStart(2, '0');
}

export function isRole(v: unknown): v is Role {
  return v === '속장' || v === '부속장' || v === '속원';
}

// 속장에서 파생되지 않는 두 속. 군인속은 속장이 없고, 새가족속은 이름이 속장에서 나오지 않는다.
export const SOLDIER_SOK = '군인';
export const NEW_FAMILY_SOK = '새가족속';
export const FIXED_SOKS: string[] = [NEW_FAMILY_SOK, SOLDIER_SOK];

// 속은 속장이 생기면서 생긴다. 이름은 속장 이름의 뒤 두 글자 + `속`이다
// (원본 최신본의 일반 속 13개 전부 이 규칙을 따른다 — 티켓 15 판독).
export function sokNameFromLeader(leaderName: string): string | null {
  const n = leaderName.trim();
  return n.length >= 2 ? n.slice(-2) + '속' : null;
}

export function isStage(v: unknown): v is Stage {
  return v === '새가족' || v === '성도';
}

// 직분이 없는 새가족은 속원 뒤로 보낸다.
export function roleRank(role: Role | null): number {
  return role === null ? ROLES.length : ROLE_RANK[role];
}

function sortMembers(rows: Member[]): Member[] {
  return rows.slice().sort(
    (a, b) =>
      STAGE_RANK[a.stage] - STAGE_RANK[b.stage] ||
      (a.sok ?? '').localeCompare(b.sok ?? '', 'ko') ||
      roleRank(a.role) - roleRank(b.role) ||
      (a.birth_year ?? Infinity) - (b.birth_year ?? Infinity) ||
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
    .prepare('INSERT INTO member (name, birth_year, stage, sok, role) VALUES (?, ?, ?, ?, ?)')
    .run(m.name, m.birth_year, m.stage, m.sok, m.role);
  return Number(info.lastInsertRowid);
}

export function updateMember(id: number, m: NewMember): void {
  db.prepare(
    'UPDATE member SET name = ?, birth_year = ?, stage = ?, sok = ?, role = ? WHERE id = ?',
  ).run(m.name, m.birth_year, m.stage, m.sok, m.role, id);
}

export function setActive(id: number, active: boolean): void {
  db.prepare('UPDATE member SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function insertMany(members: NewMember[]): number {
  db.exec('BEGIN');
  try {
    const stmt = db.prepare(
      'INSERT INTO member (name, birth_year, stage, sok, role) VALUES (?, ?, ?, ?, ?)',
    );
    for (const m of members) stmt.run(m.name, m.birth_year, m.stage, m.sok, m.role);
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
  const rows = db
    .prepare('SELECT DISTINCT sok FROM member WHERE sok IS NOT NULL')
    .all() as { sok: string }[];
  return rows.map((r) => r.sok).sort((a, b) => a.localeCompare(b, 'ko'));
}
