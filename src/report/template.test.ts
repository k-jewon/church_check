import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeGrid } from './grid.js';
import { renderReportHTML } from './template.js';
import type { Member } from '../domain/members.js';

// 인쇄 HTML 가운데 격자 모델만으로는 보이지 않는 표기를 확인한다.

const D = ['2026-08-09', '2026-08-16'];
const META = { title: '청년부', from: D[0]!, to: D[1]! };

function 새가족(id: number, name: string, birth: number | null): Member {
  return { id, name, birth_year: birth, stage: '새가족', sok: null, role: null, active: 1 };
}

test('새가족 이름 옆에는 생년 대신 인도자 이름의 뒤 두 글자가 첨자로 붙는다', () => {
  const a = 새가족(1, '정새봄', 2001);
  const b = 새가족(2, '한여울', 2002);
  const grid = composeGrid(D, [a, b], [], [], [], [], new Map([[a.id, '김갑자']]));
  const html = renderReportHTML(grid, META);

  assert.ok(html.includes('정새봄<span class="inviter">(갑자)</span>'));
  assert.ok(html.includes('>한여울</td>'), '인도자가 없으면 이름만 적고 생년도 적지 않는다');
});

test('비고의 새가족에도 인도자를 뒤 두 글자로 적는다', () => {
  const a = 새가족(1, '정새봄', null);
  const b = 새가족(2, '한여울', null);
  const old = '2026-05-01';
  const grid = composeGrid(
    D,
    [a, b],
    [],
    [],
    [],
    [
      { member_id: a.id, last_seen: old },
      { member_id: b.id, last_seen: old },
    ],
    new Map([
      [a.id, '김갑자'],
      [b.id, '샘'], // 두 글자 이하는 그대로
    ]),
  );
  const html = renderReportHTML(grid, META);

  assert.ok(html.includes('정새봄(갑자), 한여울(샘)'));
  assert.ok(!html.includes('김갑자'));
});
