import { db } from '../db/index.js';
import type { Member, Role } from './members.js';

export type Status = 'before' | 'praise' | 'after' | 'main' | 'etc';

export interface StatusDef {
  value: Status;
  label: string;
  symbol: string;
}

// Input dropdown order. Absence = no row (not selectable).
export const STATUSES: StatusDef[] = [
  { value: 'before', label: '예배전', symbol: '●' },
  { value: 'praise', label: '찬양중', symbol: '◉' },
  { value: 'after', label: '찬양후', symbol: '○' },
  { value: 'main', label: '본당', symbol: '본' },
  { value: 'etc', label: '기타', symbol: '기타' },
];

// 이분법 출석: 예배전·찬양중·찬양후·본당만 출석. etc·결석은 비출석.
const ATTENDED_SET = new Set<Status>(['before', 'praise', 'after', 'main']);

export function isStatus(v: unknown): v is Status {
  return v === 'before' || v === 'praise' || v === 'after' || v === 'main' || v === 'etc';
}

export function symbolOf(status: Status): string {
  return STATUSES.find((s) => s.value === status)?.symbol ?? '';
}
export function labelOf(status: Status): string {
  return STATUSES.find((s) => s.value === status)?.label ?? '';
}

// ---- pure computation (reused by report) ----
export function isAttended(status: Status | null): boolean {
  return status !== null && ATTENDED_SET.has(status);
}

export function countAttended(seq: (Status | null)[]): number {
  return seq.filter(isAttended).length;
}

// True if any run of >= n consecutive non-attended weeks exists (etc/absent both count).
export function hasConsecutiveAbsence(seqChrono: (Status | null)[], n = 3): boolean {
  let run = 0;
  for (const s of seqChrono) {
    if (isAttended(s)) {
      run = 0;
    } else {
      run += 1;
      if (run >= n) return true;
    }
  }
  return false;
}

// ---- persistence ----
export function mark(memberId: number, date: string, status: Status): void {
  db.prepare(
    `INSERT INTO attendance (member_id, service_date, status)
     VALUES (?, ?, ?)
     ON CONFLICT (member_id, service_date)
     DO UPDATE SET status = excluded.status, updated_at = datetime('now','localtime')`,
  ).run(memberId, date, status);
}

export function unmark(memberId: number, date: string): void {
  db.prepare('DELETE FROM attendance WHERE member_id = ? AND service_date = ?').run(memberId, date);
}

export function getStatus(memberId: number, date: string): Status | null {
  const row = db
    .prepare('SELECT status FROM attendance WHERE member_id = ? AND service_date = ?')
    .get(memberId, date) as { status: Status } | undefined;
  return row ? row.status : null;
}

export interface MarkedMember extends Member {
  status: Status;
}

// Members already marked on a date (any status), sorted by sok/role/name.
export function marksForDate(date: string): MarkedMember[] {
  const rows = db
    .prepare(
      `SELECT m.*, a.status AS status
       FROM attendance a JOIN member m ON m.id = a.member_id
       WHERE a.service_date = ?`,
    )
    .all(date) as unknown as MarkedMember[];
  return sortRoster(rows);
}

// Active members with NO mark on the date, matching a name query. Limited for the dropdown.
export function searchUnmarked(date: string, query: string, limit = 20): Member[] {
  const q = `%${query.trim()}%`;
  const rows = db
    .prepare(
      `SELECT m.* FROM member m
       WHERE m.active = 1
         AND m.name LIKE ?
         AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.member_id = m.id AND a.service_date = ?)
       LIMIT ?`,
    )
    .all(q, date, limit) as unknown as Member[];
  return sortRoster(rows);
}

export function unmarkedCount(date: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM member m
         WHERE m.active = 1
           AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.member_id = m.id AND a.service_date = ?)`,
      )
      .get(date) as { n: number }
  ).n;
}

export function statusCounts(date: string): Record<Status, number> {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS n FROM attendance WHERE service_date = ? GROUP BY status')
    .all(date) as { status: Status; n: number }[];
  const out: Record<Status, number> = { before: 0, praise: 0, after: 0, main: 0, etc: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export interface RangeRow {
  member_id: number;
  service_date: string;
  status: Status;
}
export function attendanceInRange(dates: string[]): RangeRow[] {
  if (!dates.length) return [];
  const placeholders = dates.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT member_id, service_date, status FROM attendance WHERE service_date IN (${placeholders})`,
    )
    .all(...dates) as unknown as RangeRow[];
}

const ROLE_RANK: Record<Role, number> = { 속장: 0, 부속장: 1, 속원: 2 };
function sortRoster<T extends Member>(rows: T[]): T[] {
  return rows.slice().sort(
    (a, b) =>
      a.sok.localeCompare(b.sok, 'ko') ||
      ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
      a.name.localeCompare(b.name, 'ko'),
  );
}
