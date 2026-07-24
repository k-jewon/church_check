import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAttended, countAttended, hasConsecutiveAbsence, type Status } from './attendance.js';

test('isAttended: 예배전/찬양중/찬양후/기타 count; 본당(표시는 유지) and absent do not', () => {
  assert.equal(isAttended('before'), true);
  assert.equal(isAttended('praise'), true);
  assert.equal(isAttended('after'), true);
  assert.equal(isAttended('etc'), true);
  assert.equal(isAttended('main'), false); // 본당예배는 출석인원에 포함 X (심볼 '본'으로 표시만)
  assert.equal(isAttended(null), false);
});

test('countAttended', () => {
  const seq: (Status | null)[] = ['before', 'main', null, 'after'];
  assert.equal(countAttended(seq), 2); // 본당·결석 제외
});

test('hasConsecutiveAbsence: 3 consecutive non-attended (main/absent both count)', () => {
  assert.equal(hasConsecutiveAbsence(['before', null, null, null]), true);
  assert.equal(hasConsecutiveAbsence(['before', null, 'main', null]), true); // 3 in a row
  assert.equal(hasConsecutiveAbsence(['before', null, 'before', null, null]), false); // max run 2
  assert.equal(hasConsecutiveAbsence(['before', 'praise', 'after', 'etc']), false);
});
