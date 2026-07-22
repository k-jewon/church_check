import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseRoster } from './excel.js';
import { normalizeBirthYear, formatBirthYear } from '../domain/members.js';

async function buildXlsx(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('s');
  ws.addRow(['이름', '출생연도', '속', '직분']);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('normalizeBirthYear: 2-digit and 4-digit', () => {
  assert.equal(normalizeBirthYear(90), 1990);
  assert.equal(normalizeBirthYear(0), 2000);
  assert.equal(normalizeBirthYear(25), 2025);
  assert.equal(normalizeBirthYear(26), 1926);
  assert.equal(normalizeBirthYear(1997), 1997);
  assert.equal(normalizeBirthYear('98'), 1998);
  assert.equal(normalizeBirthYear('abc'), null);
  assert.equal(normalizeBirthYear(''), null);
});

test('formatBirthYear: 2-digit padded', () => {
  assert.equal(formatBirthYear(2000), '00');
  assert.equal(formatBirthYear(1997), '97');
  assert.equal(formatBirthYear(1990), '90');
});

test('parseRoster: valid rows normalize and pass', async () => {
  const buf = await buildXlsx([
    ['유동훈', 90, '동훈속', '속장'],
    ['이수현', 0, '현동속', '속원'],
  ]);
  const { members, errors } = await parseRoster(buf);
  assert.equal(errors.length, 0);
  assert.equal(members.length, 2);
  assert.equal(members[0].birth_year, 1990);
  assert.equal(members[1].birth_year, 2000);
});

test('parseRoster: invalid role and missing fields are reported', async () => {
  const buf = await buildXlsx([
    ['홍길동', 95, '가나속', '리더'], // bad role
    ['', 95, '가나속', '속원'], // missing name
  ]);
  const { members, errors } = await parseRoster(buf);
  assert.equal(members.length, 0);
  assert.equal(errors.length, 2);
});

test('parseRoster: blank rows are skipped', async () => {
  const buf = await buildXlsx([
    ['유동훈', 90, '동훈속', '속장'],
    ['', '', '', ''],
  ]);
  const { members, errors } = await parseRoster(buf);
  assert.equal(errors.length, 0);
  assert.equal(members.length, 1);
});
