import { listMembers, type Member, type Role } from '../domain/members.js';
import { attendanceInRange, isAttended, type Status } from '../domain/attendance.js';
import { visitsInRange } from '../domain/visitlog.js';
import { sundaysInRange } from '../domain/sundays.js';

// PDF에서 별도 섹션으로 분리된다. 새가족은 속이 아니라 신분이므로 속 이름이 아니라 섹션 이름이다.
export const NEW_FAMILY = '새가족';
export const SOLDIER = '군인';

export type SokKind = 'normal' | 'newfamily' | 'soldier';

export interface GridMember {
  id: number;
  name: string;
  birth_year: number | null;
  role: Role | null; // 새가족은 직분이 없다
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
  youth: number; // 청년 (새가족 포함, 방문·etc 제외)
  newBeliever: number; // 새신자 = 새가족 + 기타(etc)
  total: number; // 청년 + 기타(etc) — 새가족은 청년에 포함되어 중복 집계하지 않음
}

export interface GridData {
  dates: string[];
  soks: GridSok[]; // VISITOR 제외, 속장 생년순 정렬 + 새가족·군인 뒤로
  visits: VisitLog[];
  summary: SummaryRow[];
  memberCount: number;
}

const ROLE_RANK: Record<Role, number> = { 속장: 0, 부속장: 1, 속원: 2 };

// 새가족은 속이 없으므로 신분으로 갈리고, 나머지는 속 이름으로 갈린다.
// `새가족속`은 정식 성도의 속이라 일반 속이며 집계에서 `청년`이다.
function kindOf(m: Member): SokKind {
  if (m.stage === NEW_FAMILY) return 'newfamily';
  if (m.sok === SOLDIER) return 'soldier';
  return 'normal';
}

// 격자에서 이 사람이 놓이는 섹션 이름. 새가족은 속이 없어 신분이 그대로 섹션이 된다.
function sectionOf(m: Member): string {
  return m.sok ?? m.stage;
}

// 속의 대표자(생년/이름). 일반 속 배치의 정렬 키다.
// **속은 반드시 속장을 갖는다**(소유자 확정 2026-09-13). 유일한 예외가 군인속인데
// 그 속은 kind 로 이미 맨 뒤에 놓이므로 이 키가 자리를 정하지 않는다.
// 따라서 아래 폴백은 정상 경로가 아니라 데이터가 깨졌을 때의 방어다.
function leaderKey(members: GridMember[]): { year: number; name: string } {
  // members는 이미 role, name 순으로 정렬되어 있어 [0]이 최상위 직분.
  const leader = members[0];
  return { year: leader?.birth_year ?? Infinity, name: leader?.name ?? '' };
}

// Build the printable grid model for a Sunday range (current-속 grouping).
export function buildGrid(fromISO: string, toISO: string): GridData {
  const dates = sundaysInRange(fromISO, toISO);
  const members = listMembers({ activeOnly: true }); // sorted: sok, role, birth_year, name

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

  // ---- 속 테이블 ----
  const sokMap = new Map<string, { kind: SokKind; members: GridMember[] }>();
  for (const m of members) {
    const kind = kindOf(m);
    const section = sectionOf(m);
    const marks = byMember.get(m.id);
    const gm: GridMember = {
      id: m.id,
      name: m.name,
      birth_year: m.birth_year,
      role: m.role,
      statuses: dates.map((d) => marks?.get(d) ?? null),
      isLeader: m.role !== null && m.role !== '속원',
    };
    const entry = sokMap.get(section) ?? { kind, members: [] };
    entry.members.push(gm);
    sokMap.set(section, entry);
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

  // ---- 방문 로그: visit_log 를 날짜별로 ----
  const visitMap = new Map<string, string[]>();
  for (const d of dates) visitMap.set(d, []);
  for (const v of visitsInRange(dates)) visitMap.get(v.visit_date)?.push(v.name);
  const visits: VisitLog[] = dates.map((d) => ({ date: d, names: visitMap.get(d) ?? [] }));

  // ---- 출석합계: 주차별 청년 / 새신자 / 합계 ----
  // 두 칸 사이의 배분은 아직 틀려 있다(G9 새가족·G10 군인이 `청년`에 들어간다).
  // 스키마가 아니라 인쇄 경로의 결함이라 구간 4에서 고친다.
  const summary: SummaryRow[] = dates.map((d) => {
    let youth = 0;
    let newFamily = 0;
    let etc = 0;
    for (const r of rows) {
      if (r.service_date !== d) continue;
      const m = memberById.get(r.member_id);
      if (!m) continue;
      if (r.status === 'etc') {
        etc += 1; // 기타
      } else if (isAttended(r.status)) {
        youth += 1; // 일반 속 + 군인 + 새가족
        if (kindOf(m) === 'newfamily') newFamily += 1;
      }
    }
    // 방문은 사람 레코드가 아니므로 출석 행이 아니라 방문 줄 수로 센다.
    etc += (visitMap.get(d) ?? []).length;
    return { date: d, youth, newBeliever: newFamily + etc, total: youth + etc };
  });

  return { dates, soks, visits, summary, memberCount: members.length };
}
