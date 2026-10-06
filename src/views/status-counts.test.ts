import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusCountsBar } from './status-counts.js';

// 「오늘 입력 현황」의 칸 줄. 입력됨 + 미출석 = 명단이 유지되어야 하고, 방문자는 명단 밖의 사람이다.

const D = '2026-10-04';
const base = {
  date: D,
  marked: 3,
  counts: { before: 1, praise: 1, after: 0, main: 1 },
  unmarked: 7,
  visits: 2,
  filter: null,
} as const;

test('방문 칸은 그날 방문 줄 수를 보이고 방문 기록으로 보낸다', () => {
  const out = statusCountsBar(base).value;

  assert.ok(out.includes(`href="/input/visits?date=${D}">방문 <strong>2</strong></a>`));
});

test('입력됨에는 방문을 더하지 않는다 — 입력됨 + 미출석 = 명단', () => {
  const out = statusCountsBar(base).value;

  assert.ok(out.includes('입력됨 <strong>3</strong>'));
  assert.ok(out.includes('미출석 <strong>7</strong> / 10'));
});

test('출석 종류는 넷이고 기타 칸은 없다', () => {
  const out = statusCountsBar(base).value;

  assert.deepEqual(
    [...out.matchAll(/filter=(\w+)/g)].map((m) => m[1]),
    ['before', 'praise', 'after', 'main', 'unmarked'],
  );
  assert.ok(!out.includes('기타'));
});
