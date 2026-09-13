import { getDb } from '../db/index.js';

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

// ---------------------------------------------------------------------------
// 속 배정 규칙 (소유자 확정 2026-09-13·14)
//
//   속은 속장이 생기면서 생기고, 이름은 속장 이름에서 나온다.
//   속장 한 명·부속장 한 명이며, 군인속만 속장이 없다.
//
// 여기서 따라 나오는 것들을 한자리에 모은다. DB를 보지 않으므로 배열만으로
// 검증할 수 있고, 화면은 이 판정을 그대로 쓴다.
// ---------------------------------------------------------------------------

export interface Person {
  id: number;
  name: string;
}
export interface SokState {
  leader: Person | null;
  deputy: Person | null;
  size: number;
}

export function buildSokStates(members: Member[]): Map<string, SokState> {
  const map = new Map<string, SokState>();
  for (const m of members) {
    if (m.stage !== '성도' || m.sok === null) continue;
    const st = map.get(m.sok) ?? { leader: null, deputy: null, size: 0 };
    st.size += 1;
    if (m.role === '속장') st.leader = { id: m.id, name: m.name };
    if (m.role === '부속장') st.deputy = { id: m.id, name: m.name };
    map.set(m.sok, st);
  }
  return map;
}

export interface AssignmentRequest {
  id?: number; // 수정이면 그 사람의 id
  name: string;
  role: Role;
  sok: string | null; // 고른 속. 비어 있으면 속장일 때만 이름에서 파생한다
  current?: { sok: string; role: Role }; // 수정이면 지금 상태
  soks: Map<string, SokState>;
}

export type Assignment = { ok: true; sok: string } | { ok: false; error: string };

export function resolveAssignment(req: AssignmentRequest): Assignment {
  const { id, name, role, sok, current, soks } = req;
  const fail = (error: string): Assignment => ({ ok: false, error });
  const isSelf = (p: Person | null) => p !== null && p.id === id;

  // 속장·부속장은 **직분을 단 채로** 속을 옮길 수 없다. 속원으로 내리면서 옮기는 것은
  // 된다 — 그때 남는 위험(빈 속)은 아래 규칙이 본다. 속장이 되는 것은 이동이 아니라
  // 새 속이 생기는 일이므로 여기서 걸리지 않는다.
  if (current && current.role !== '속원' && role !== '속원' && sok && sok !== current.sok) {
    return fail(`속장·부속장은 ${role}인 채로 속을 옮길 수 없습니다. 먼저 직분을 속원으로 바꾸세요.`);
  }

  // 속장이 자리를 뜨면 그 속이 사라진다. 남은 사람이 있으면 막는다.
  if (current?.role === '속장' && (role !== '속장' || (sok !== null && sok !== current.sok))) {
    const left = (soks.get(current.sok)?.size ?? 1) - 1;
    if (left > 0) {
      return fail(
        `${current.sok}에 ${left}명이 남아 있습니다. 새 속장을 세우고 그 사람들을 옮긴 뒤에 바꾸세요.`,
      );
    }
  }

  // 대상 속을 정한다.
  let target: string;
  if (role === '속장') {
    if (sok === null || sok === '') {
      const derived = sokNameFromLeader(name);
      if (!derived) return fail('속장 이름이 두 글자 이상이어야 속 이름을 만들 수 있습니다.');
      if (soks.has(derived) && derived !== current?.sok) {
        return fail(`이미 ${derived}이 있습니다. 그 속의 속장을 맡기려면 목록에서 ${derived}을 고르세요.`);
      }
      target = derived;
    } else if (sok === NEW_FAMILY_SOK) {
      // 새가족속만 예외다 — 이름이 속장에서 나오지 않으므로 속장을 새로 앉힐 수 있다.
      target = sok;
    } else if (sok === current?.sok) {
      target = sok; // 이미 그 속의 속장이다(이름 수정 등)
    } else {
      return fail(
        `${sok}이라는 이름은 그 속 속장의 이름에서 나온 것이라 다른 사람이 속장이 될 수 없습니다. ` +
          '속을 비워 두면 이름에서 새 속이 만들어집니다.',
      );
    }
  } else {
    if (sok === null || sok === '') return fail('속을 고르세요. 새 속은 속장을 넣을 때만 생깁니다.');
    target = sok;
  }

  // 군인속은 속장이 없는 유일한 속이다.
  if (target === SOLDIER_SOK && role !== '속원') {
    return fail('군인속에는 속장·부속장을 둘 수 없습니다.');
  }

  // 속장 한 명, 부속장 한 명.
  const st = soks.get(target);
  if (role === '속장' && st?.leader && !isSelf(st.leader)) {
    return fail(`${target}에는 이미 속장 ${st.leader.name}이 있습니다.`);
  }
  if (role === '부속장' && st?.deputy && !isSelf(st.deputy)) {
    return fail(`${target}에는 이미 부속장 ${st.deputy.name}이 있습니다.`);
  }

  return { ok: true, sok: target };
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
  return (getDb().prepare('SELECT COUNT(*) AS n FROM member').get() as { n: number }).n;
}

export function listMembers(opts?: { activeOnly?: boolean }): Member[] {
  const sql = opts?.activeOnly ? 'SELECT * FROM member WHERE active = 1' : 'SELECT * FROM member';
  return sortMembers(getDb().prepare(sql).all() as unknown as Member[]);
}

export function getMember(id: number): Member | undefined {
  return getDb().prepare('SELECT * FROM member WHERE id = ?').get(id) as unknown as Member | undefined;
}

export function createMember(m: NewMember): number {
  const info = getDb()
    .prepare('INSERT INTO member (name, birth_year, stage, sok, role) VALUES (?, ?, ?, ?, ?)')
    .run(m.name, m.birth_year, m.stage, m.sok, m.role);
  return Number(info.lastInsertRowid);
}

export function updateMember(id: number, m: NewMember): void {
  getDb().prepare(
    'UPDATE member SET name = ?, birth_year = ?, stage = ?, sok = ?, role = ? WHERE id = ?',
  ).run(m.name, m.birth_year, m.stage, m.sok, m.role, id);
}

export function setActive(id: number, active: boolean): void {
  getDb().prepare('UPDATE member SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function insertMany(members: NewMember[]): number {
  getDb().exec('BEGIN');
  try {
    const stmt = getDb().prepare(
      'INSERT INTO member (name, birth_year, stage, sok, role) VALUES (?, ?, ?, ?, ?)',
    );
    for (const m of members) stmt.run(m.name, m.birth_year, m.stage, m.sok, m.role);
    getDb().exec('COMMIT');
    return members.length;
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
}

// Wipe the whole roster (explicit admin reset before re-upload).
export function deleteAllMembers(): void {
  getDb().exec('DELETE FROM member');
}

export function listSoks(): string[] {
  const rows = getDb()
    .prepare('SELECT DISTINCT sok FROM member WHERE sok IS NOT NULL')
    .all() as { sok: string }[];
  return rows.map((r) => r.sok).sort((a, b) => a.localeCompare(b, 'ko'));
}
