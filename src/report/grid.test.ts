import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeGrid } from './grid.js';
import type { Member } from '../domain/members.js';
import type { LastSeen, RangeRow, Status } from '../domain/attendance.js';
import type { Visit } from '../domain/visitlog.js';
import type { SessionRow } from '../domain/newfamily.js';

// composeGrid 는 DB를 보지 않는다. 이 파일은 배열만으로 격자의 판단을 검증한다 —
// 섹션 분류·밴드 정렬·출석합계가 그 판단이다.
//
// 입력 members 는 listMembers 가 정렬한 순서(신분 → 속 → 직분 → 생년 → 이름)로
// 들어온다는 계약이다. leaderKey 가 [0]을 최상위 직분으로 보기 때문이다.

const D = ['2026-08-09', '2026-08-16'];

let nextId = 1;
function 성도(name: string, sok: string, role: Member['role'], birth: number | null): Member {
  return { id: nextId++, name, birth_year: birth, stage: '성도', sok, role, active: 1 };
}
function 새가족(name: string): Member {
  return { id: nextId++, name, birth_year: null, stage: '새가족', sok: null, role: null, active: 1 };
}
// 스냅샷을 따로 주지 않으면 그날의 신분·속이 지금과 같다고 본다.
const 출석 = (
  m: Member,
  date: string,
  status: Status,
  at: Pick<RangeRow, 'stage_at' | 'sok_at'> = { stage_at: m.stage, sok_at: m.sok },
): RangeRow => ({
  member_id: m.id,
  service_date: date,
  status,
  ...at,
});
const 회차 = (m: Member, date: string): SessionRow => ({ member_id: m.id, meeting_date: date });
const 방문 = (date: string, name: string): Visit => ({
  id: nextId++,
  visit_date: date,
  name,
  created_at: '',
});

test('새가족은 속이 아니라 신분으로 갈린다', () => {
  const a = 성도('김갑자', '갑자속', '속장', 1985);
  const b = 새가족('정새봄');
  const grid = composeGrid(D, [a, b], [], []);

  assert.deepEqual(
    grid.soks.map((s) => [s.name, s.kind]),
    [
      ['갑자속', 'normal'],
      ['새가족', 'newfamily'],
    ],
  );
});

test('`새가족속`은 정식 성도의 속이므로 일반 속이다 — 이 모델의 시금석', () => {
  const a = 성도('정무진', '새가족속', '속장', 1991);
  const b = 새가족('정새봄');
  const grid = composeGrid(D, [a, b], [], []);

  const 새가족속 = grid.soks.find((s) => s.name === '새가족속')!;
  assert.equal(새가족속.kind, 'normal', '`새가족속`과 `새가족`은 이름만 닮은 별개다');
});

test('군인은 별도 섹션이고 맨 뒤에 선다', () => {
  const soldier = 성도('최한결', '군인', '속원', 1999);
  const normal = 성도('김갑자', '갑자속', '속장', 1985);
  const nf = 새가족('정새봄');
  const grid = composeGrid(D, [soldier, normal, nf], [], []);

  assert.deepEqual(
    grid.soks.map((s) => s.name),
    ['갑자속', '새가족', '군인'],
    '일반 속 → 새가족 → 군인 순이어야 한다',
  );
});

test('일반 속은 속장 생년 오름차순, 같은 생년이면 속장 이름 가나다순', () => {
  const members = [
    성도('임신미', '신미속', '속장', 1993),
    성도('서경오', '경오속', '속장', 1993),
    성도('김갑자', '갑자속', '속장', 1985),
  ];
  const grid = composeGrid(D, members, [], []);

  assert.deepEqual(
    grid.soks.map((s) => s.name),
    ['갑자속', '경오속', '신미속'],
    '1985 → 1993(서경오) → 1993(임신미)',
  );
});

// 속은 반드시 속장을 갖는다. 유일한 예외가 군인속이고, 그 속은 kind 로 이미 맨 뒤에
// 놓이므로 대표자 키가 자리를 정하지 않는다 — leaderKey 의 폴백은 정상 경로가 아니라
// 데이터가 깨졌을 때의 방어다. 아래는 그 방어가 터지지 않는다는 것만 확인한다.
test('속장이 없는 군인속도 자리를 잡는다 — 맨 뒤다', () => {
  const members = [
    성도('김갑자', '갑자속', '속장', 1985),
    성도('최한결', '군인', '속원', 1999),
    성도('한겨울', '군인', '속원', 1998),
  ];
  const grid = composeGrid(D, members, [], []);

  assert.deepEqual(grid.soks.map((s) => s.name), ['갑자속', '군인']);
  assert.equal(grid.soks[1]!.members.length, 2);
});

test('출석 상태는 날짜 축에 정렬되고 빠진 주는 null이다', () => {
  const m = 성도('김갑자', '갑자속', '속장', 1985);
  const grid = composeGrid(D, [m], [출석(m, D[1], 'praise')], []);

  assert.deepEqual(grid.soks[0]!.members[0]!.statuses, [null, 'praise']);
});

test('직분이 없는 새가족은 회색 강조 대상이 아니다', () => {
  const leader = 성도('김갑자', '갑자속', '속장', 1985);
  const member = 성도('이가온', '갑자속', '속원', 1990);
  const nf = 새가족('정새봄');
  const grid = composeGrid(D, [leader, member, nf], [], []);

  const [갑자속, 새가족섹션] = grid.soks;
  assert.deepEqual(갑자속!.members.map((m) => m.isLeader), [true, false]);
  assert.deepEqual(새가족섹션!.members.map((m) => m.isLeader), [false]);
});

test('방문 줄은 방문 로그에서 오고 적힌 순서를 지킨다', () => {
  const m = 성도('김갑자', '갑자속', '속장', 1985);
  const visits = [방문(D[1], '무명'), 방문(D[1], '커플'), 방문(D[0], '권을미')];
  const grid = composeGrid(D, [m], [], visits);

  assert.deepEqual(grid.visits, [
    { date: D[0], names: ['권을미'] },
    { date: D[1], names: ['무명', '커플'] },
  ]);
});

test('같은 사람이 여러 주에 방문해도 이력이 이어지지 않고 각 줄에 다시 적힌다', () => {
  const grid = composeGrid(D, [], [], [방문(D[0], '권을미'), 방문(D[1], '권을미')]);

  assert.deepEqual(grid.visits.map((v) => v.names), [['권을미'], ['권을미']]);
});

test('본당은 출석에 들지 않고 결석은 행 자체가 없다', () => {
  const a = 성도('김갑자', '갑자속', '속장', 1985);
  const b = 성도('이가온', '갑자속', '속원', 1990);
  const grid = composeGrid([D[0]], [a, b], [출석(a, D[0], 'main')], []);

  assert.equal(grid.summary[0]!.total, 0, '본당 1건, 결석 1명 → 출석 0');
});

// ---------------------------------------------------------------------------
// 출석합계 — 소유자 정의(HANDOFF): 청년 = 일반 속 + 새가족속 / 새가족+기타 = 새가족 + 군인 + 방문.
// 합이 같으면 검산이 통과해 버리므로 합계만이 아니라 배분을 본다.
// 원본 수기 합계가 군인 출석을 빠뜨린 주가 있으나 그것은 계산 오류다(소유자 확정 2026-09-16).
// ---------------------------------------------------------------------------
test('출석합계: 청년은 속회 인원뿐이고 새가족·군인·방문은 새가족+기타다', () => {
  const 일반 = 성도('김갑자', '갑자속', '속장', 1985);
  const 새가족속 = 성도('정무진', '새가족속', '속장', 1991);
  const 군인 = 성도('최한결', '군인', '속원', 1999);
  const nf = 새가족('정새봄');
  const rows = [
    출석(일반, D[0], 'before'),
    출석(새가족속, D[0], 'praise'),
    출석(군인, D[0], 'before'),
    출석(nf, D[0], 'after'),
  ];
  const grid = composeGrid([D[0]], [일반, 새가족속, nf, 군인], rows, [방문(D[0], '무명')]);

  assert.deepEqual(grid.summary[0], { date: D[0], youth: 2, newFamilyEtc: 3, total: 5 });
});

test('예배 축의 `기타`는 다른 예배에 간 성도이지 방문이 아니다', () => {
  const m = 성도('김갑자', '갑자속', '속장', 1985);
  const grid = composeGrid([D[0]], [m], [출석(m, D[0], 'etc')], []);

  assert.deepEqual(grid.visits, [], '`기타` 성도가 방문 줄에 실리면 안 된다');
  assert.equal(grid.summary[0]!.youth, 1, '성도의 `기타` 출석은 사람 축으로 청년이다');
  assert.equal(grid.summary[0]!.newFamilyEtc, 0);
});

// ---------------------------------------------------------------------------
// 스냅샷 — 출석 행은 지금이 아니라 그날의 신분·속 자리에 그려진다(G7).
// ---------------------------------------------------------------------------
test('기간 중에 승격한 사람은 그날의 자리에 각각 남는다', () => {
  const leader = 성도('김갑자', '갑자속', '속장', 1985);
  const 승격 = 성도('정새봄', '갑자속', '속원', 2001); // 지금은 성도다
  const rows = [
    출석(승격, D[0], 'before', { stage_at: '새가족', sok_at: null }),
    출석(승격, D[1], 'after'),
  ];
  const grid = composeGrid(D, [leader, 승격], rows, []);

  const 갑자속 = grid.soks.find((s) => s.name === '갑자속')!;
  const 새가족섹션 = grid.soks.find((s) => s.name === '새가족')!;
  assert.deepEqual(갑자속.members.find((m) => m.id === 승격.id)!.statuses, [null, 'after']);
  assert.deepEqual(새가족섹션.members.map((m) => m.id), [승격.id]);

  assert.deepEqual(
    grid.summary.map((s) => [s.youth, s.newFamilyEtc]),
    [
      [0, 1], // D0: 새가족으로 왔다
      [1, 0], // D1: 갑자속 성도로 왔다
    ],
  );
});

test('지난 기간을 다시 뽑으면 지금의 속이 아니라 그때의 자리에만 있다', () => {
  const leader = 성도('김갑자', '갑자속', '속장', 1985);
  const 승격 = 성도('정새봄', '갑자속', '속원', 2001);
  const then = { stage_at: '새가족', sok_at: null } as const;
  const grid = composeGrid(D, [leader, 승격], [출석(승격, D[0], 'before', then), 출석(승격, D[1], 'before', then)], []);

  const 갑자속 = grid.soks.find((s) => s.name === '갑자속')!;
  assert.deepEqual(갑자속.members.map((m) => m.id), [leader.id], '그 기간에 이 사람은 갑자속이 아니었다');
  assert.equal(grid.summary[0]!.youth, 0);
});

test('옛 자리에서는 지금의 직분으로 강조하지 않는다', () => {
  const 옛속장 = 성도('이가온', '을축속', '속원', 1990);
  const 새속장 = 성도('김갑자', '갑자속', '속장', 1985);
  const 옮긴이 = 성도('박병인', '갑자속', '부속장', 1992); // 지금은 갑자속 부속장, 그날은 을축속
  const rows = [출석(옮긴이, D[0], 'before', { stage_at: '성도', sok_at: '을축속' })];
  const grid = composeGrid(D, [옛속장, 새속장, 옮긴이], rows, []);

  const 을축속 = grid.soks.find((s) => s.name === '을축속')!;
  const 옛자리 = 을축속.members.find((m) => m.id === 옮긴이.id)!;
  assert.equal(옛자리.isLeader, false, '그때의 직분은 기록되지 않았다');
});

// ---------------------------------------------------------------------------
// 새가족 회차 — 원본 지면의 `1주`~`4주` 칸(G3)
// ---------------------------------------------------------------------------
test('새가족 행은 회차 날짜를 1주부터 채운다', () => {
  const nf = 새가족('정새봄');
  const grid = composeGrid(D, [nf], [], [], [회차(nf, D[1]), 회차(nf, D[0])]);

  assert.deepEqual(grid.soks[0]!.members[0]!.sessions, [D[0], D[1]]);
});

test('속을 배정받지 못한 채 4회를 넘기면 4주 칸이 가장 최근 날짜를 보인다', () => {
  const nf = 새가족('정새봄');
  const dates = ['2026-07-19', '2026-07-26', '2026-08-02', '2026-08-09', '2026-08-16'];
  const grid = composeGrid(D, [nf], [], [], dates.map((d) => 회차(nf, d)));

  assert.deepEqual(grid.soks[0]!.members[0]!.sessions, ['2026-07-19', '2026-07-26', '2026-08-02', '2026-08-16']);
});

test('출력 기간 뒤의 회차는 지면에 오르지 않는다', () => {
  const nf = 새가족('정새봄');
  const grid = composeGrid(D, [nf], [], [], [회차(nf, D[0]), 회차(nf, '2026-08-23')]);

  assert.deepEqual(grid.soks[0]!.members[0]!.sessions, [D[0]]);
});

test('새가족 행은 첫 회차 날짜순이고 회차가 없는 사람은 뒤에 선다', () => {
  const 가 = 새가족('가나다');
  const 나 = 새가족('나다라');
  const 다 = 새가족('다라마');
  const sessions = [회차(다, '2026-07-12'), 회차(가, D[1]), 회차(다, D[0])];
  const grid = composeGrid(D, [가, 나, 다], [], [], sessions);

  assert.deepEqual(grid.soks[0]!.members.map((m) => m.name), ['다라마', '가나다', '나다라']);
});

test('기간 안에 모임을 한 사람은 지금 성도여도 새가족 칸에 있다', () => {
  const leader = 성도('김갑자', '갑자속', '속장', 1985);
  const 승격 = 성도('정새봄', '갑자속', '속원', 2001);
  const grid = composeGrid(D, [leader, 승격], [], [], [회차(승격, D[0])]);

  const 새가족섹션 = grid.soks.find((s) => s.name === '새가족')!;
  assert.deepEqual(새가족섹션.members[0]!.sessions, [D[0]]);
});

// ---------------------------------------------------------------------------
// 방문 칸 — 출석 추적과 같은 주일 단위이고, 빈 줄이 없다(G18, 소유자 확정 2026-09-16)
// ---------------------------------------------------------------------------
test('방문 칸은 격자와 같은 주일 중 방문이 있었던 날만 적는다', () => {
  const before = '2026-08-02'; // 격자 첫 주보다 한 주 앞
  const grid = composeGrid(D, [], [], [방문(D[1], '무명'), 방문(before, '권을미'), 방문(D[1], '커플')]);

  assert.deepEqual(
    grid.visits,
    [{ date: D[1], names: ['무명', '커플'] }],
    '방문이 없던 D0도, 격자 밖의 주일도 줄이 없다',
  );
  assert.deepEqual(grid.summary.map((s) => s.newFamilyEtc), [0, 2]);
});

// ---------------------------------------------------------------------------
// 비고 — 기준일(출력 기간의 마지막 주일)에 마지막 출석에서 3개월 이상 6개월 미만 지난 사람.
// 마지막 출석은 본당을 포함하고 기록이 없으면 등록일이다(그 계산은 도메인 쪽).
// 3개월이 지나면 속·새가족 격자에서 빠지고, 6개월까지만 비고에 남는다.
// 군인은 이 규칙에서 제외한다(소유자 확정 2026-09-18).
// D 의 마지막 주일은 2026-08-16 이다.
// ---------------------------------------------------------------------------
const 마지막 = (m: Member, date: string): LastSeen => ({ member_id: m.id, last_seen: date });
const idsIn = (grid: ReturnType<typeof composeGrid>) => grid.soks.flatMap((s) => s.members.map((m) => m.id));

test('3개월 이상 6개월 미만 결석한 사람은 격자에서 빠지고 비고에 오른다', () => {
  const a = 성도('김갑자', '갑자속', '속장', 1985);
  const b = 성도('이가온', '갑자속', '속원', 1990);
  const grid = composeGrid(D, [a, b], [], [], [], [마지막(a, D[0]), 마지막(b, '2026-05-10')]);

  assert.deepEqual(grid.remarks, { believers: ['이가온'], newFamily: [] });
  assert.deepEqual(idsIn(grid), [a.id]);
});

test('3개월은 달력으로 센다 — 하루라도 모자라면 아직 격자에 있다', () => {
  const a = 성도('김갑자', '갑자속', '속장', 1985);
  const b = 성도('이가온', '갑자속', '속원', 1990);
  const grid = composeGrid(D, [a, b], [], [], [], [마지막(a, '2026-05-16'), 마지막(b, '2026-05-17')]);

  assert.deepEqual(grid.remarks.believers, ['김갑자']);
  assert.deepEqual(idsIn(grid), [b.id]);
});

test('6개월이 지나면 격자에도 비고에도 없다', () => {
  const a = 성도('김갑자', '갑자속', '속장', 1985);
  const b = 성도('이가온', '갑자속', '속원', 1990);
  const grid = composeGrid(D, [a, b], [], [], [], [마지막(a, D[0]), 마지막(b, '2026-02-16')]);

  assert.deepEqual(grid.remarks.believers, []);
  assert.deepEqual(idsIn(grid), [a.id]);
});

test('오래 결석한 새가족도 새가족 칸에서 빠지고, 빈 섹션은 그리지 않는다', () => {
  const a = 성도('김갑자', '갑자속', '속장', 1985);
  const nf = 새가족('정새봄');
  const grid = composeGrid(D, [a, nf], [], [], [], [마지막(a, D[0]), 마지막(nf, '2026-04-12')]);

  assert.deepEqual(grid.soks.map((s) => s.name), ['갑자속']);
  assert.deepEqual(grid.remarks.newFamily, [{ name: '정새봄', inviter: null }]);
});

test('군인은 오래 결석해도 군인 칸에 남고 비고에 오르지 않는다', () => {
  const soldier = 성도('최한결', '군인', '속원', 1999);
  const grid = composeGrid(D, [soldier], [], [], [], [마지막(soldier, '2026-04-12')]);

  assert.deepEqual(grid.remarks, { believers: [], newFamily: [] });
  assert.deepEqual(idsIn(grid), [soldier.id]);
});

test('비고는 성도를 격자 순서대로 먼저, 새가족을 뒤에 적고 새가족은 인도자를 든다', () => {
  const 을 = 성도('이을축', '을축속', '속장', 1990);
  const 갑 = 성도('김갑자', '갑자속', '속장', 1985);
  const nf1 = 새가족('한여울');
  const nf2 = 새가족('정새봄');
  const old = '2026-05-01';
  const grid = composeGrid(
    D,
    [을, 갑, nf1, nf2],
    [],
    [],
    [],
    [마지막(nf1, old), 마지막(nf2, old), 마지막(을, old), 마지막(갑, old)],
    new Map([[nf2.id, '김갑자']]),
  );

  assert.deepEqual(grid.remarks, {
    believers: ['김갑자', '이을축'], // 갑자속(1985)이 을축속(1990)보다 앞선다
    newFamily: [
      { name: '정새봄', inviter: '김갑자' },
      { name: '한여울', inviter: null },
    ],
  });
});
