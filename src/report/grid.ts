import { listMembers } from '../domain/members.js';
import {
  attendanceInRange,
  countAttended,
  hasConsecutiveAbsence,
  type Status,
} from '../domain/attendance.js';
import { sundaysInRange } from '../domain/sundays.js';

export interface GridMember {
  id: number;
  name: string;
  birth_year: number;
  role: string;
  statuses: (Status | null)[]; // aligned to dates
  attended: number;
  total: number;
  longAbsence: boolean; // 연속 3주 이상 결석
}

export interface GridSok {
  name: string;
  members: GridMember[];
  avgRatePct: number; // 속 평균 출석률 %
}

export interface GridData {
  dates: string[];
  soks: GridSok[];
  memberCount: number;
}

const LONG_ABSENCE_WEEKS = 3;

// Build the printable grid model for a Sunday range (current-속 grouping).
export function buildGrid(fromISO: string, toISO: string): GridData {
  const dates = sundaysInRange(fromISO, toISO);
  const members = listMembers({ activeOnly: true }); // sorted: sok, role, name

  // member_id -> (date -> status)
  const byMember = new Map<number, Map<string, Status>>();
  for (const r of attendanceInRange(dates)) {
    let m = byMember.get(r.member_id);
    if (!m) byMember.set(r.member_id, (m = new Map()));
    m.set(r.service_date, r.status);
  }

  const sokMap = new Map<string, GridMember[]>();
  for (const m of members) {
    const marks = byMember.get(m.id);
    const statuses = dates.map((d) => marks?.get(d) ?? null);
    const gm: GridMember = {
      id: m.id,
      name: m.name,
      birth_year: m.birth_year,
      role: m.role,
      statuses,
      attended: countAttended(statuses),
      total: dates.length,
      longAbsence: hasConsecutiveAbsence(statuses, LONG_ABSENCE_WEEKS),
    };
    const arr = sokMap.get(m.sok) ?? [];
    arr.push(gm);
    sokMap.set(m.sok, arr);
  }

  const soks: GridSok[] = [...sokMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    .map(([name, ms]) => {
      const denom = ms.length * dates.length;
      const numer = ms.reduce((s, m) => s + m.attended, 0);
      return { name, members: ms, avgRatePct: denom ? Math.round((numer / denom) * 100) : 0 };
    });

  return { dates, soks, memberCount: members.length };
}
