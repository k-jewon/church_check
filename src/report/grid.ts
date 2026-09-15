import { listMembers, roleRank, SOLDIER_SOK, type Member, type Role, type Stage } from '../domain/members.js';
import { attendanceInRange, isAttended, type RangeRow, type Status } from '../domain/attendance.js';
import { visitsInRange, type Visit } from '../domain/visitlog.js';
import { allSessions, type SessionRow } from '../domain/newfamily.js';
import { sundaysInRange } from '../domain/sundays.js';

// PDF에서 별도 섹션으로 분리된다. 새가족은 속이 아니라 신분이므로 속 이름이 아니라 섹션 이름이다.
export const NEW_FAMILY = '새가족';
export const SOLDIER = SOLDIER_SOK;

// 원본 지면의 새가족 회차 칸 수(`1주`~`4주`).
export const SESSION_COLS = 4;

export type SokKind = 'normal' | 'newfamily' | 'soldier';

export interface GridMember {
  id: number;
  name: string;
  birth_year: number | null;
  role: Role | null; // 새가족은 직분이 없고, 옛 자리에서는 그때의 직분을 모른다
  statuses: (Status | null)[]; // aligned to dates — 이 자리에 있던 주만 채운다
  sessions: string[]; // 회차 칸에 적을 모임 날짜(최대 SESSION_COLS). 새가족 섹션에서만 쓴다
  isLeader: boolean; // 속장·부속장 → 회색 강조
}

export interface GridSok {
  name: string;
  kind: SokKind;
  members: GridMember[];
}

export interface VisitLog {
  date: string;
  names: string[]; // 그 주일 visit_log 에 적힌 이름
}

export interface SummaryRow {
  date: string;
  youth: number; // 청년 = 일반 속 + 새가족속
  newFamilyEtc: number; // 새가족+기타 = 새가족 + 군인 + 방문
  total: number; // 청년 + 새가족+기타
}

export interface GridData {
  dates: string[];
  soks: GridSok[]; // 속장 생년순 정렬 + 새가족·군인 뒤로
  visits: VisitLog[]; // 방문이 있었던 주일만, 날짜순
  summary: SummaryRow[];
  memberCount: number;
}

const ROLE_RANK: Record<Role, number> = { 속장: 0, 부속장: 1, 속원: 2 };

// 사람 축의 자리 — 신분과, 성도만 갖는 속. 지금 자리(member)와 그날 자리(출석 스냅샷)가 같은 모양이다.
interface Place {
  stage: Stage;
  sok: string | null;
}

const placeOfRow = (r: RangeRow): Place => ({ stage: r.stage_at, sok: r.sok_at });

// 새가족은 속이 없으므로 신분으로 갈리고, 나머지는 속 이름으로 갈린다.
// `새가족속`은 정식 성도의 속이라 일반 속이며 집계에서 `청년`이다.
function kindOf(p: Place): SokKind {
  if (p.stage === NEW_FAMILY) return 'newfamily';
  if (p.sok === SOLDIER) return 'soldier';
  return 'normal';
}

// 격자에서 이 자리가 놓이는 섹션 이름. 새가족은 속이 없어 신분이 그대로 섹션이 된다.
function sectionOf(p: Place): string {
  return p.sok ?? p.stage;
}

// 회차 칸. 앞 세 칸은 1~3회차이고 넷째 칸은 가장 최근 회차다 — 속을 배정받지 못한 채
// 4회를 넘기면 계속 4주차로 표기해 배정이 늦어진 것이 드러나게 한다(티켓 12 결정 9).
function sessionCells(sortedDates: string[]): string[] {
  if (sortedDates.length <= SESSION_COLS) return sortedDates;
  return [...sortedDates.slice(0, SESSION_COLS - 1), sortedDates[sortedDates.length - 1]!];
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

// Build the printable grid model for a Sunday range.
// Only wiring lives here; the model itself is composed by the pure function below.
export function buildGrid(fromISO: string, toISO: string): GridData {
  const dates = sundaysInRange(fromISO, toISO);
  return composeGrid(
    dates,
    listMembers({ activeOnly: true }),
    attendanceInRange(dates),
    visitsInRange(dates),
    allSessions(),
  );
}

/**
 * 격자 모델을 만든다. DB를 보지 않으므로 배열만으로 검증할 수 있다 —
 * 섹션 분류·밴드 정렬·출석합계가 이 앱의 실제 판단이 들어 있는 자리다.
 */
export function composeGrid(
  dates: string[],
  members: Member[],
  rows: RangeRow[],
  visitRows: Visit[],
  sessionRows: SessionRow[] = [],
): GridData {
  const inRange = new Set(dates);
  const lastDate = dates[dates.length - 1] ?? '';

  const memberById = new Map<number, Member>();
  for (const m of members) memberById.set(m.id, m);

  const rowsByMember = new Map<number, RangeRow[]>();
  for (const r of rows) {
    const list = rowsByMember.get(r.member_id) ?? [];
    list.push(r);
    rowsByMember.set(r.member_id, list);
  }

  // 출력 기간 뒤의 회차는 그 지면에 없던 일이다.
  const sessionsByMember = new Map<number, string[]>();
  for (const s of sessionRows) {
    if (s.meeting_date > lastDate) continue;
    const list = sessionsByMember.get(s.member_id) ?? [];
    list.push(s.meeting_date);
    sessionsByMember.set(s.member_id, list);
  }
  for (const list of sessionsByMember.values()) list.sort();

  // ---- 속 테이블 ----
  // 출석은 그날의 신분·속 자리에 그린다(G7). 기간 중에 자리가 바뀐 사람은 두 자리에
  // 각각 그 주만 채워 서고, 기간 안에 흔적이 없는 사람은 지금 자리에 선다.
  const sokMap = new Map<string, { kind: SokKind; members: GridMember[] }>();
  for (const m of members) {
    const mine = rowsByMember.get(m.id) ?? [];
    const sessions = sessionsByMember.get(m.id) ?? [];

    const places = new Map<string, Place>();
    for (const r of mine) places.set(sectionOf(placeOfRow(r)), placeOfRow(r));
    if (sessions.some((d) => inRange.has(d))) places.set(NEW_FAMILY, { stage: '새가족', sok: null });
    if (places.size === 0) places.set(sectionOf(m), m);

    for (const [section, place] of places) {
      const kind = kindOf(place);
      const role = section === sectionOf(m) ? m.role : null;
      const marks = new Map<string, Status>();
      for (const r of mine) if (sectionOf(placeOfRow(r)) === section) marks.set(r.service_date, r.status);
      const gm: GridMember = {
        id: m.id,
        name: m.name,
        birth_year: m.birth_year,
        role,
        statuses: dates.map((d) => marks.get(d) ?? null),
        sessions: kind === 'newfamily' ? sessionCells(sessions) : [],
        isLeader: role !== null && role !== '속원',
      };
      const entry = sokMap.get(section) ?? { kind, members: [] };
      entry.members.push(gm);
      sokMap.set(section, entry);
    }
  }

  // 섹션 안의 순서: 직분 → 생년 → 이름. 옛 자리에서 온 사람이 섞이므로 입력 순서에 기대지 않는다.
  for (const e of sokMap.values()) {
    e.members.sort(
      (a, b) =>
        roleRank(a.role) - roleRank(b.role) ||
        (a.birth_year ?? Infinity) - (b.birth_year ?? Infinity) ||
        a.name.localeCompare(b.name, 'ko'),
    );
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

  // ---- 방문 칸: visit_log 를 날짜별로 ----
  // 출석 추적과 같은 주일만 싣고, 방문이 없던 주일은 줄을 두지 않는다(G18, 소유자 확정 2026-09-16).
  const visitMap = new Map<string, string[]>();
  for (const v of visitRows) {
    if (!inRange.has(v.visit_date)) continue;
    const names = visitMap.get(v.visit_date) ?? [];
    names.push(v.name);
    visitMap.set(v.visit_date, names);
  }
  const visits: VisitLog[] = [...visitMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, names]) => ({ date, names }));

  // ---- 출석합계: 주차별 청년 / 새가족+기타 / 합계 ----
  // 사람 축은 그날의 자리로만 가르고, 출석 상태는 출석 여부 판정에만 쓴다(G9·G10·G12·G13).
  const summary: SummaryRow[] = dates.map((d) => {
    let youth = 0;
    let newFamilyEtc = 0;
    for (const r of rows) {
      if (r.service_date !== d || !memberById.has(r.member_id) || !isAttended(r.status)) continue;
      if (kindOf(placeOfRow(r)) === 'normal') youth += 1;
      else newFamilyEtc += 1;
    }
    // 방문은 사람 레코드가 아니므로 출석 행이 아니라 방문 줄 수로 센다.
    newFamilyEtc += (visitMap.get(d) ?? []).length;
    return { date: d, youth, newFamilyEtc, total: youth + newFamilyEtc };
  });

  return { dates, soks, visits, summary, memberCount: members.length };
}
