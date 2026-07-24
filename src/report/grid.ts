import { listMembers, type Member, type Role } from '../domain/members.js';
import { attendanceInRange, isAttended, type Status } from '../domain/attendance.js';
import { sundaysInRange } from '../domain/sundays.js';

// 특수 속: PDF에서 별도 섹션으로 분리된다.
export const NEW_FAMILY = '새가족';
export const SOLDIER = '군인';
export const VISITOR = '방문';

export type SokKind = 'normal' | 'newfamily' | 'soldier';

export interface GridMember {
  id: number;
  name: string;
  birth_year: number | null;
  role: Role;
  statuses: (Status | null)[]; // aligned to dates
  isLeader: boolean; // 속장·부속장 → 회색 강조
}

export interface GridSok {
  name: string;
  kind: SokKind;
  members: GridMember[];
}

export interface VisitLog {
  date: string;
  names: string[]; // 그 주 status='etc' 인원 이름
}

export interface SummaryRow {
  date: string;
  youth: number; // 청년 (새가족·방문 제외, etc 제외)
  newEtc: number; // 새가족 + 기타(etc)
  total: number;
}

export interface GridData {
  dates: string[];
  soks: GridSok[]; // VISITOR 제외, 속장 생년순 정렬 + 새가족·군인 뒤로
  visits: VisitLog[];
  summary: SummaryRow[];
  memberCount: number;
}

const ROLE_RANK: Record<Role, number> = { 속장: 0, 부속장: 1, 속원: 2 };

function kindOf(sok: string): SokKind | 'visitor' {
  if (sok === NEW_FAMILY) return 'newfamily';
  if (sok === SOLDIER) return 'soldier';
  if (sok === VISITOR) return 'visitor';
  return 'normal';
}

// 대표자(속장 우선, 없으면 부속장·속원 순 최상위)의 생년/이름. 정렬 키로 쓴다.
function leaderKey(members: GridMember[]): { year: number; name: string } {
  // members는 이미 role, name 순으로 정렬되어 있어 [0]이 최상위 직분.
  const leader = members[0];
  return { year: leader?.birth_year ?? Infinity, name: leader?.name ?? '' };
}

// Build the printable grid model for a Sunday range (current-속 grouping).
export function buildGrid(fromISO: string, toISO: string): GridData {
  const dates = sundaysInRange(fromISO, toISO);
  const members = listMembers({ activeOnly: true }); // sorted: sok, role, name

  const memberById = new Map<number, Member>();
  for (const m of members) memberById.set(m.id, m);

  // member_id -> (date -> status)
  const byMember = new Map<number, Map<string, Status>>();
  const rows = attendanceInRange(dates);
  for (const r of rows) {
    let m = byMember.get(r.member_id);
    if (!m) byMember.set(r.member_id, (m = new Map()));
    m.set(r.service_date, r.status);
  }

  // ---- 속 테이블 (VISITOR 제외) ----
  const sokMap = new Map<string, { kind: SokKind; members: GridMember[] }>();
  for (const m of members) {
    const kind = kindOf(m.sok);
    if (kind === 'visitor') continue; // 방문자는 속 테이블에 그리지 않는다
    const marks = byMember.get(m.id);
    const gm: GridMember = {
      id: m.id,
      name: m.name,
      birth_year: m.birth_year,
      role: m.role,
      statuses: dates.map((d) => marks?.get(d) ?? null),
      isLeader: m.role !== '속원',
    };
    const entry = sokMap.get(m.sok) ?? { kind, members: [] };
    entry.members.push(gm);
    sokMap.set(m.sok, entry);
  }

  // 정렬: 일반 속(속장 생년 오름차순, 동일 생년이면 속장 이름 가나다) → 새가족 → 군인
  const KIND_ORDER: Record<SokKind, number> = { normal: 0, newfamily: 1, soldier: 2 };
  const soks: GridSok[] = [...sokMap.entries()]
    .map(([name, e]) => ({ name, kind: e.kind, members: e.members }))
    .sort((a, b) => {
      if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      const ka = leaderKey(a.members);
      const kb = leaderKey(b.members);
      return ka.year - kb.year || ka.name.localeCompare(kb.name, 'ko');
    });

  // ---- 방문 로그: status='etc' 를 날짜별로 ----
  const visitMap = new Map<string, string[]>();
  for (const d of dates) visitMap.set(d, []);
  for (const r of rows) {
    if (r.status !== 'etc') continue;
    const name = memberById.get(r.member_id)?.name;
    if (name) visitMap.get(r.service_date)?.push(name);
  }
  const visits: VisitLog[] = dates.map((d) => ({
    date: d,
    names: (visitMap.get(d) ?? []).sort((a, b) => a.localeCompare(b, 'ko')),
  }));

  // ---- 출석합계: 주차별 청년 / 새가족+기타 / 합계 ----
  const summary: SummaryRow[] = dates.map((d) => {
    let youth = 0;
    let newEtc = 0;
    for (const r of rows) {
      if (r.service_date !== d) continue;
      const m = memberById.get(r.member_id);
      if (!m) continue;
      const k = kindOf(m.sok);
      if (r.status === 'etc') {
        newEtc += 1; // 기타(방문 포함)
      } else if (isAttended(r.status)) {
        if (k === 'newfamily') newEtc += 1;
        else if (k !== 'visitor') youth += 1; // 일반 속 + 군인
      }
    }
    return { date: d, youth, newEtc, total: youth + newEtc };
  });

  return { dates, soks, visits, summary, memberCount: members.length };
}
