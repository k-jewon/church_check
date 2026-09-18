import ExcelJS from 'exceljs';
import { isRole, normalizeBirthYear, rosterErrors, type NewMember, type RosterRow } from '../domain/members.js';

export interface ParseResult {
  members: NewMember[];
  errors: string[];
}

// Roster template columns (row 1 is the header):
//   A: 이름  B: 출생연도  C: 속  D: 직분
export async function parseRoster(data: ArrayBuffer | Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  const members: NewMember[] = [];
  const errors: string[] = [];
  const roster: RosterRow[] = [];

  if (!ws) return { members, errors: ['시트를 찾을 수 없습니다.'] };

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const name = cellText(row.getCell(1));
    const birthRaw = row.getCell(2).value;
    const sok = cellText(row.getCell(3));
    const role = cellText(row.getCell(4));

    // Skip fully blank rows.
    if (!name && !sok && !role && (birthRaw === null || birthRaw === undefined || birthRaw === '')) {
      return;
    }

    // 속 규칙은 이름·속·직분만 본다. 출생연도만 틀린 속장 때문에 그 속이
    // 속장 없는 속으로 오보되지 않게 행 오류와 따로 모은다.
    if (name && sok && isRole(role)) roster.push({ row: rowNumber, name, sok, role });

    const rowErrors: string[] = [];
    if (!name) rowErrors.push('이름 없음');
    const birthYear = normalizeBirthYear(birthRaw);
    if (birthYear === null) rowErrors.push(`출생연도 오류(${String(birthRaw ?? '')})`);
    if (!sok) rowErrors.push('속 없음');
    if (!isRole(role)) rowErrors.push(`직분 오류(${role} — 속장/부속장/속원 중 하나)`);

    if (rowErrors.length) {
      errors.push(`${rowNumber}행: ${rowErrors.join(', ')}`);
      return;
    }

    // 명단 엑셀은 정식 성도만 담는다. 새가족은 앱의 등록 경로로 생긴다.
    members.push({
      name,
      birth_year: birthYear as number,
      stage: '성도',
      sok,
      role: role as NewMember['role'],
    });
  });

  errors.push(...rosterErrors(roster));
  return { members, errors };
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text).trim();
  return String(v).trim();
}
