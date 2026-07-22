import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAttended, countAttended, hasConsecutiveAbsence, type Status } from './attendance.js';

test('isAttended: only 예배전/찬양중/찬양후/본당 count; etc and absent do not', () => {
  assert.equal(isAttended('before'), true);
  assert.equal(isAttended('praise'), true);
  assert.equal(isAttended('after'), true);
  assert.equal(isAttended('main'), true);
  assert.equal(isAttended('etc'), false);
  assert.equal(isAttended(null), false);
});

test('countAttended', () => {
  const seq: (Status | null)[] = ['before', 'etc', null, 'after'];
  assert.equal(countAttended(seq), 2);
});

test('hasConsecutiveAbsence: 3 consecutive non-attended (etc/absent both count)', () => {
  assert.equal(hasConsecutiveAbsence(['before', null, null, null]), true);
  assert.equal(hasConsecutiveAbsence(['before', null, 'etc', null]), true); // 3 in a row
  assert.equal(hasConsecutiveAbsence(['before', null, 'before', null, null]), false); // max run 2
  assert.equal(hasConsecutiveAbsence(['before', 'praise', 'after', 'main']), false);
});
