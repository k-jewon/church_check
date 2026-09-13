import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeGrid } from './grid.js';
import type { Member } from '../domain/members.js';
import type { RangeRow, Status } from '../domain/attendance.js';
import type { Visit } from '../domain/visitlog.js';

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
const 출석 = (m: Member, date: string, status: Status): RangeRow => ({
  member_id: m.id,
  service_date: date,
  status,
});
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

test('속장이 없는 속은 최상위 직분자를 대표로 쓴다', () => {
  const members = [
    성도('권기묘', '기묘속', '부속장', 1999),
    성도('김갑자', '갑자속', '속장', 1985),
  ];
  const grid = composeGrid(D, members, [], []);

  assert.deepEqual(grid.soks.map((s) => s.name), ['갑자속', '기묘속']);
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
// 출석합계 — **현재 동작을 고정하는 테스트다.** 배분이 아직 틀려 있다.
//
// 소유자 정의(HANDOFF): 청년 = 일반 속 + 새가족속 / 새가족+기타 = 새가족 + 군인 + 방문.
// 지금 코드는 새가족(G9)과 군인(G10)을 `청년`에 넣는다. 합계는 맞고 배분만 틀린다 —
// 합이 같으면 검산이 통과해 버리는 그 모양이라, 아래 기대값을 눈으로 적어 둔다.
// **인쇄 경로를 고칠 때 이 테스트가 빨개져야 하고, 그때 기대값을 고쳐 넣는다.**
// ---------------------------------------------------------------------------
test('출석합계: 합계는 맞다', () => {
  const 일반 = 성도('김갑자', '갑자속', '속장', 1985);
  const 군인 = 성도('최한결', '군인', '속원', 1999);
  const nf = 새가족('정새봄');
  const rows = [출석(일반, D[0], 'before'), 출석(군인, D[0], 'before'), 출석(nf, D[0], 'after')];
  const grid = composeGrid([D[0]], [일반, nf, 군인], rows, [방문(D[0], '무명')]);

  assert.equal(grid.summary[0]!.total, 4, '성도 1 + 군인 1 + 새가족 1 + 방문 1');
});

test('출석합계: 배분은 G9·G10으로 아직 틀려 있다 (현재 동작 고정)', () => {
  const 일반 = 성도('김갑자', '갑자속', '속장', 1985);
  const 군인 = 성도('최한결', '군인', '속원', 1999);
  const nf = 새가족('정새봄');
  const rows = [출석(일반, D[0], 'before'), 출석(군인, D[0], 'before'), 출석(nf, D[0], 'after')];
  const grid = composeGrid([D[0]], [일반, nf, 군인], rows, [방문(D[0], '무명')]);

  assert.equal(grid.summary[0]!.youth, 3, '지금: 일반 + 군인 + 새가족 — 옳게는 1이어야 한다');
  assert.equal(grid.summary[0]!.newBeliever, 2, '지금: 새가족 + 방문 — 옳게는 3(새가족·군인·방문)');
});

test('예배 축의 `기타`는 다른 예배에 간 성도이지 방문이 아니다', () => {
  const m = 성도('김갑자', '갑자속', '속장', 1985);
  const grid = composeGrid([D[0]], [m], [출석(m, D[0], 'etc')], []);

  assert.deepEqual(grid.visits[0]!.names, [], '`기타` 성도가 방문 줄에 실리면 안 된다');
  assert.equal(grid.summary[0]!.total, 1);
});
