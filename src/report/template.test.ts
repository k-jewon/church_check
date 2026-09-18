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

test('비고의 새가족에는 인도자 전체 이름을 적는다', () => {
  const a = 새가족(1, '정새봄', null);
  const grid = composeGrid(D, [a], [], [], [], [{ member_id: a.id, last_seen: '2026-05-01' }], new Map([[a.id, '김갑자']]));
  const html = renderReportHTML(grid, META);

  assert.ok(html.includes('정새봄(김갑자)'));
});
