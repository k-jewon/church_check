// Generate template/roster-template.xlsx (초기 명단 업로드 양식).
// Run: npx tsx src/tools/gen-template.ts
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_DIR = resolve(process.cwd(), 'template');
const OUT_PATH = resolve(OUT_DIR, 'roster-template.xlsx');

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('명단');

ws.columns = [
  { header: '이름', key: 'name', width: 14 },
  { header: '출생연도', key: 'birth_year', width: 12 },
  { header: '속', key: 'sok', width: 14 },
  { header: '직분', key: 'role', width: 12 },
];

const header = ws.getRow(1);
header.font = { bold: true };
header.alignment = { horizontal: 'center' };

// Example rows (사용자는 이 예시를 지우고 실제 명단으로 채운다).
ws.addRow({ name: '홍길동', birth_year: 97, sok: '동훈속', role: '속장' });
ws.addRow({ name: '김철수', birth_year: 0, sok: '동훈속', role: '속원' });
ws.addRow({ name: '이영희', birth_year: 2001, sok: '수정속', role: '부속장' });

// 직분 dropdown on the data rows.
for (let r = 2; r <= 500; r++) {
  ws.getCell(`D${r}`).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"속장,부속장,속원"'],
  };
}

mkdirSync(OUT_DIR, { recursive: true });
await wb.xlsx.writeFile(OUT_PATH);
console.log(`Wrote ${OUT_PATH}`);
