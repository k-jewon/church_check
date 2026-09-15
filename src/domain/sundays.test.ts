import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSunday, recentSundays, sundaysInRange, isSunday } from './sundays.js';

// 2025-08-24, 08-31, 09-07, 09-14 are Sundays (from the sample sheet).
test('currentSunday: snaps to the week Sunday', () => {
  assert.equal(currentSunday(new Date(2025, 7, 24)), '2025-08-24'); // Sunday itself
  assert.equal(currentSunday(new Date(2025, 7, 27)), '2025-08-24'); // Wednesday -> prev Sunday
  assert.equal(currentSunday(new Date(2025, 7, 30)), '2025-08-24'); // Saturday -> same week Sunday
});

test('recentSundays: chronological, includes current', () => {
  assert.deepEqual(recentSundays(new Date(2025, 8, 14), 4), [
    '2025-08-24',
    '2025-08-31',
    '2025-09-07',
    '2025-09-14',
  ]);
});

test('sundaysInRange: inclusive Sundays', () => {
  assert.deepEqual(sundaysInRange('2025-08-24', '2025-09-14'), [
    '2025-08-24',
    '2025-08-31',
    '2025-09-07',
    '2025-09-14',
  ]);
});

test('isSunday', () => {
  assert.equal(isSunday('2025-08-24'), true);
  assert.equal(isSunday('2025-08-25'), false);
});
