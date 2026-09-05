import { esc } from '../views/layout.js';
import type { Status } from '../domain/attendance.js';
import type { GridData, GridSok } from './grid.js';
import { formatBirthYear } from '../domain/members.js';

// Compact single-glyph symbols for the dense grid.
const SYMBOL: Record<Status, string> = {
  before: '●',
  praise: '○',
  after: '◉',
  main: '본',
  etc: '기',
};

function md(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function ymd(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function nameCell(name: string, birth: number | null): string {
  const by = formatBirthYear(birth);
  return by ? `${esc(name)}(${esc(by)})` : esc(name);
}

export interface ReportMeta {
  title: string;
  from: string;
  to: string;
}

// 밴드(행)의 최다 인원 속에 맞춰 부족한 속은 빈 행으로 채워 높이를 통일한다.
function sokTable(sok: GridSok, dateHeaders: string, maxRows: number, emptyCells: string): string {
  const rows = sok.members
    .map((m) => {
      const cells = m.statuses.map((s) => `<td>${s ? SYMBOL[s] : ''}</td>`).join('');
      const nameCls = m.isLeader ? 'name leader' : 'name';
      return `<tr><td class="${nameCls}">${nameCell(m.name, m.birth_year)}</td>${cells}</tr>`;
    })
    .join('');
  const padCount = Math.max(0, maxRows - sok.members.length);
  const padRows = Array.from(
    { length: padCount },
    () => `<tr class="pad"><td class="name">&nbsp;</td>${emptyCells}</tr>`,
  ).join('');
  return (
    `<table class="sok">` +
    `<thead><tr><th class="name">${esc(sok.name)}</th>${dateHeaders}</tr></thead>` +
    `<tbody>${rows}${padRows}</tbody>` +
    `</table>`
  );
}

export function renderReportHTML(grid: GridData, meta: ReportMeta): string {
  const dateHeaders = grid.dates.map((d) => `<th class="date-col">${esc(md(d))}</th>`).join('');
  const emptyCells = grid.dates.map(() => '<td></td>').join('');

  // 4열 격자: 속을 4개씩 밴드(행)로 묶고, 밴드 내 최다 인원에 맞춰 빈 행으로 높이를 맞춘다.
  const COLS = 4;
  const bands: GridSok[][] = [];
  for (let i = 0; i < grid.soks.length; i += COLS) bands.push(grid.soks.slice(i, i + COLS));
  const blocks = bands
    .map((band) => {
      const maxRows = band.reduce((n, s) => Math.max(n, s.members.length), 0);
      const tables = band.map((s) => sokTable(s, dateHeaders, maxRows, emptyCells)).join('');
      const fillers = '<div class="band-filler"></div>'.repeat(COLS - band.length);
      return `<div class="band">${tables}${fillers}</div>`;
    })
    .join('');

  // 방문 섹션: 날짜별 이름 로그
  const visitRows = grid.visits
    .map(
      (v) =>
        `<div class="visit-row"><span class="visit-date">${esc(md(v.date))}:</span> ${esc(v.names.join(', '))}</div>`,
    )
    .join('');

  // 출석합계 표
  const sumHead = grid.summary.map((s) => `<th>${esc(md(s.date))}</th>`).join('');
  const sumYouth = grid.summary.map((s) => `<td>${s.youth}</td>`).join('');
  const sumNew = grid.summary.map((s) => `<td>${s.newBeliever}</td>`).join('');
  const sumTotal = grid.summary.map((s) => `<td>${s.total}</td>`).join('');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 8mm; }
  :root { --fs: 11px; }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: var(--fs); color: #000; margin: 0; }
  .report-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .report-head h1 { font-size: 1.3em; margin: 0; }
  .report-head .range { font-size: 1em; }
  .band { display: flex; gap: 6px; align-items: flex-start; margin-bottom: 6px; break-inside: avoid; }
  .band > table.sok, .band > .band-filler { flex: 1 1 0; min-width: 0; }
  table.sok { width: 100%; border-collapse: collapse; }
  table.sok th, table.sok td { border: 1px solid #999; padding: 1px 2px; text-align: center; white-space: nowrap; }
  table.sok th.name, table.sok td.name { text-align: left; max-width: 64px; overflow: hidden; text-overflow: ellipsis; }
  table.sok th.name { font-weight: 700; background: #e0e0e0; }
  table.sok td.name.leader { background: #e0e0e0; }
  .date-col { font-size: 0.8em; }
  .footer-sections { display: flex; gap: 6px; margin-top: 4px; break-inside: avoid; }
  .visits { flex: 2; border: 1px solid #999; }
  .visits h2, .summary h2 { font-size: 1em; margin: 0; padding: 2px 4px; background: #ece0f0; text-align: center; border-bottom: 1px solid #999; }
  .visit-row { padding: 1px 4px; }
  .visit-date { font-weight: 700; }
  .summary { flex: 1; }
  table.summary-tbl { width: 100%; border-collapse: collapse; }
  table.summary-tbl th, table.summary-tbl td { border: 1px solid #999; padding: 1px 3px; text-align: center; }
  table.summary-tbl th.rowlabel, table.summary-tbl td.rowlabel { text-align: center; background: #e8e8e8; white-space: nowrap; }
  table.summary-tbl tr.total td, table.summary-tbl tr.total th { font-weight: 700; background: #d8d8d8; }
  .legend { font-size: 0.85em; color: #222; margin-top: 8px; }
</style></head>
<body>
  <div class="report-head">
    <h1>[ ${esc(meta.title)} 출석부 ]</h1>
    <span class="range">${esc(ymd(meta.from))} ~ ${esc(ymd(meta.to))}</span>
  </div>
  <div class="grid">${blocks}</div>
  <div class="footer-sections">
    <div class="visits">
      <h2>방문</h2>
      ${visitRows}
    </div>
    <div class="summary">
      <table class="summary-tbl">
        <thead><tr><th class="rowlabel">출석합계</th>${sumHead}</tr></thead>
        <tbody>
          <tr><td class="rowlabel">청년</td>${sumYouth}</tr>
          <tr><td class="rowlabel">새신자</td>${sumNew}</tr>
          <tr class="total"><td class="rowlabel">합계</td>${sumTotal}</tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="legend">● 2시 이전 참석 / ○ 2시 이후 참석 / ◉ 찬양 이후 참석 / [본] 본당예배 참석 &nbsp;&nbsp; * 본당 예배는 출석인원에 포함 X</div>
</body></html>`;
}
