import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSokStates, resolveAssignment, rosterErrors, type Member, type Role, type RosterRow } from './members.js';

// 속 배정 규칙만 본다. DB도 화면도 없다.
//
//   속은 속장이 생기면서 생기고 이름은 속장 이름에서 나온다.
//   속장 한 명·부속장 한 명. 군인속만 속장이 없다.

let nextId = 1;
const 성도 = (name: string, sok: string, role: Role): Member => ({
  id: nextId++,
  name,
  birth_year: 1990,
  stage: '성도',
  sok,
  role,
  active: 1,
});

// 갑자속: 속장 김갑자 · 부속장 이갑축 · 속원 둘
const 김갑자 = 성도('김갑자', '갑자속', '속장');
const 이갑축 = 성도('이갑축', '갑자속', '부속장');
const 박갑인 = 성도('박갑인', '갑자속', '속원');
const 최갑묘 = 성도('최갑묘', '갑자속', '속원');
// 을축속: 속장만 있다
const 서을축 = 성도('서을축', '을축속', '속장');
// 새가족속·군인
const 정무진 = 성도('정무진', '새가족속', '속장');
const 한결 = 성도('한결', '군인', '속원');

const ROSTER = [김갑자, 이갑축, 박갑인, 최갑묘, 서을축, 정무진, 한결];
const soks = () => buildSokStates(ROSTER);

const ask = (name: string, role: Role, sok: string | null, current?: Member) =>
  resolveAssignment({
    id: current?.id,
    name,
    role,
    sok,
    current: current?.sok ? { sok: current.sok, role: current.role! } : undefined,
    soks: soks(),
  });

test('속 현황을 명단에서 읽는다', () => {
  const st = soks().get('갑자속')!;
  assert.equal(st.leader?.name, '김갑자');
  assert.equal(st.deputy?.name, '이갑축');
  assert.equal(st.size, 4);
  assert.equal(soks().get('을축속')!.deputy, null);
});

// ---- 속이 생기는 길은 속장뿐이다 ----

test('속장은 속을 비워 두면 이름에서 새 속이 생긴다', () => {
  const r = ask('나병인', '속장', null);
  assert.deepEqual(r, { ok: true, sok: '병인속' });
});

test('속장이 아니면 속을 반드시 골라야 한다', () => {
  const r = ask('나병인', '속원', null);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /속을 고르세요/);
});

test('파생된 이름이 이미 있으면 거부하고 그 속을 고르라고 한다', () => {
  const r = ask('오갑자', '속장', null); // → 갑자속
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /이미 갑자속이 있습니다/);
});

test('속장 이름이 한 글자면 속 이름을 만들 수 없다', () => {
  const r = ask('갑', '속장', null);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /두 글자 이상/);
});

// ---- 남의 이름을 단 속의 속장이 될 수 없다 ----

test('기존 속의 속장으로는 들어갈 수 없다 — 그 이름은 그 속장의 이름이다', () => {
  const r = ask('나병인', '속장', '을축속'); // 을축속은 속장이 서을축 하나뿐
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /속장의 이름에서 나온 것이라/);
});

test('부속장은 자기 속의 속장이 될 수 없다', () => {
  const r = ask('이갑축', '속장', '갑자속', 이갑축);
  assert.equal(r.ok, false);
});

test('새가족속만 예외다 — 이름이 속장에서 나오지 않아 속장을 앉힐 수 있다', () => {
  const 빈새가족속 = buildSokStates(ROSTER.filter((m) => m !== 정무진));
  const r = resolveAssignment({ name: '나병인', role: '속장', sok: '새가족속', soks: 빈새가족속 });
  assert.deepEqual(r, { ok: true, sok: '새가족속' });
});

test('새가족속에도 속장은 한 명뿐이다', () => {
  const r = ask('나병인', '속장', '새가족속');
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /이미 속장 정무진/);
});

// ---- 속장 한 명, 부속장 한 명 ----

test('부속장이 이미 있는 속에 부속장을 더 둘 수 없다', () => {
  const r = ask('나병인', '부속장', '갑자속');
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /이미 부속장 이갑축/);
});

test('부속장이 없는 속에는 부속장을 둘 수 있다', () => {
  assert.deepEqual(ask('나병인', '부속장', '을축속'), { ok: true, sok: '을축속' });
});

test('군인속에는 속장도 부속장도 둘 수 없다', () => {
  assert.equal(ask('나병인', '부속장', '군인').ok, false);
  assert.deepEqual(ask('나병인', '속원', '군인'), { ok: true, sok: '군인' });
});

// ---- 속장·부속장은 직분을 단 채로 옮길 수 없다 ----

test('부속장인 채로는 다른 속으로 옮길 수 없다', () => {
  const r = ask('이갑축', '부속장', '을축속', 이갑축);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /먼저 직분을 속원으로/);
});

test('속원으로 내리면서 옮기는 것은 된다 — 빈 속 위험은 속장 규칙이 본다', () => {
  assert.deepEqual(ask('이갑축', '속원', '을축속', 이갑축), { ok: true, sok: '을축속' });
});

test('속원은 자유롭게 옮긴다', () => {
  assert.deepEqual(ask('박갑인', '속원', '을축속', 박갑인), { ok: true, sok: '을축속' });
});

test('부속장을 속원으로 내리는 것은 속원이 있어도 된다', () => {
  assert.deepEqual(ask('이갑축', '속원', '갑자속', 이갑축), { ok: true, sok: '갑자속' });
});

test('부속장이 속장이 되는 것은 이동이 아니라 새 속이 생기는 일이다', () => {
  const r = ask('이갑축', '속장', null, 이갑축);
  assert.deepEqual(r, { ok: true, sok: '갑축속' });
});

// ---- 속장이 자리를 뜨면 그 속이 사라진다 ----

test('사람이 남아 있는 속의 속장은 직분을 바꿀 수 없다', () => {
  const r = ask('김갑자', '속원', '갑자속', 김갑자);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /갑자속에 3명이 남아 있습니다/);
});

test('혼자 남은 속장은 직분을 바꿀 수 있다 — 그때 속이 사라진다', () => {
  const 혼자 = buildSokStates([서을축, 김갑자]);
  const r = resolveAssignment({
    id: 서을축.id,
    name: '서을축',
    role: '속원',
    sok: '갑자속',
    current: { sok: '을축속', role: '속장' },
    soks: 혼자,
  });
  assert.deepEqual(r, { ok: true, sok: '갑자속' });
});

test('속장이 이름만 고쳐 저장하는 것은 막지 않는다', () => {
  assert.deepEqual(ask('김갑자', '속장', '갑자속', 김갑자), { ok: true, sok: '갑자속' });
});

// ---- 속장 교체는 이 규칙들이 그리는 절차다 ----

test('속장 교체 — 새 속장을 세우고, 옮기고, 마지막에 구 속장이 따라간다', () => {
  // ① 부속장 이갑축이 속장이 되면서 갑축속이 생긴다
  assert.deepEqual(ask('이갑축', '속장', null, 이갑축), { ok: true, sok: '갑축속' });

  // ② 속원들이 옮겨 간다 (속원은 자유롭게 옮긴다)
  assert.deepEqual(ask('박갑인', '속원', '갑축속', 박갑인), { ok: true, sok: '갑축속' });

  // ③ 아직은 갑자속에 사람이 남아 있어 구 속장이 못 움직인다
  assert.equal(ask('김갑자', '속원', '갑축속', 김갑자).ok, false);

  // 전원이 빠진 뒤라면 통과한다
  const 비운뒤 = buildSokStates([김갑자, 성도('이갑축', '갑축속', '속장')]);
  const r = resolveAssignment({
    id: 김갑자.id,
    name: '김갑자',
    role: '속원',
    sok: '갑축속',
    current: { sok: '갑자속', role: '속장' },
    soks: 비운뒤,
  });
  assert.deepEqual(r, { ok: true, sok: '갑축속' });
});

// ---- 명단 적재는 같은 규칙을 파일 한 장에 건다 ----

const 행 = (row: number, name: string, sok: string, role: Role): RosterRow => ({ row, name, sok, role });

test('명단 — 규칙을 지키는 파일은 오류가 없다', () => {
  assert.deepEqual(
    rosterErrors([
      행(2, '김갑자', '갑자속', '속장'),
      행(3, '이갑축', '갑자속', '부속장'),
      행(4, '박갑인', '갑자속', '속원'),
      행(5, '한결', '군인', '속원'),
      행(6, '정무진', '새가족속', '속장'), // 새가족속의 이름은 속장에서 나오지 않는다
      행(7, '오새길', '새가족속', '속원'),
    ]),
    [],
  );
});

test('명단 — 새가족속에도 속장이 있어야 한다', () => {
  assert.deepEqual(rosterErrors([행(2, '오새길', '새가족속', '속원')]), [
    '2행: 새가족속에 속장이 없습니다. 속 이름이 속장 행과 한 글자라도 다르면 다른 속이 됩니다.',
  ]);
});

test('명단 — 속 이름 오타는 속장 없는 속으로 걸린다', () => {
  const errors = rosterErrors([
    행(2, '김갑자', '갑자속', '속장'),
    행(3, '박갑인', '갑자 속', '속원'),
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^3행: 갑자 속에 속장이 없습니다/);
});

test('명단 — 속 이름은 속장 이름에서 나와야 한다', () => {
  assert.deepEqual(rosterErrors([행(2, '김갑자', '을축속', '속장')]), [
    '2행: 속장 김갑자의 속 이름은 갑자속이어야 합니다.',
  ]);
});

test('명단 — 속장·부속장은 한 명씩이고 군인속에는 둘 다 없다', () => {
  const errors = rosterErrors([
    행(2, '김갑자', '갑자속', '속장'),
    행(3, '최갑자', '갑자속', '속장'),
    행(4, '이갑축', '갑자속', '부속장'),
    행(5, '박갑인', '갑자속', '부속장'),
    행(6, '한결', '군인', '부속장'),
  ]);
  assert.deepEqual(errors, [
    '2·3행: 갑자속에 속장이 둘 이상입니다.',
    '4·5행: 갑자속에 부속장이 둘 이상입니다.',
    '6행: 군인속에는 속장·부속장을 둘 수 없습니다.',
  ]);
});
