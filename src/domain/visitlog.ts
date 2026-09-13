import { db } from '../db/index.js';

// 방문. 사람 레코드가 아니라 (날짜, 이름) 줄이고, 이력을 잇지 않는다.
// 무명·별명 같은 미상 표기도 그냥 한 줄이다.
// 근거: context/wayfinder/tickets/12-방문-새가족-등록-경로-통합.md

export interface Visit {
  id: number;
  visit_date: string;
  name: string;
  created_at: string;
}

export function addVisit(visitDate: string, name: string): number {
  const info = db
    .prepare('INSERT INTO visit_log (visit_date, name) VALUES (?, ?)')
    .run(visitDate, name);
  return Number(info.lastInsertRowid);
}

export function removeVisit(id: number): void {
  db.prepare('DELETE FROM visit_log WHERE id = ?').run(id);
}

export function listVisits(visitDate: string): Visit[] {
  return db
    .prepare('SELECT * FROM visit_log WHERE visit_date = ? ORDER BY id')
    .all(visitDate) as unknown as Visit[];
}

export function visitsInRange(dates: string[]): Visit[] {
  if (!dates.length) return [];
  const placeholders = dates.map(() => '?').join(',');
  return db
    .prepare(`SELECT * FROM visit_log WHERE visit_date IN (${placeholders}) ORDER BY id`)
    .all(...dates) as unknown as Visit[];
}
