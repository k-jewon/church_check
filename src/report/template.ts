import { esc } from '../views/layout.js';
import type { Status } from '../domain/attendance.js';
import type { GridData } from './grid.js';
import { formatBirthYear } from '../domain/members.js';

// Compact single-glyph symbols for the dense grid.
const SYMBOL: Record<Status, string> = {
  before: '●',
  praise: '◉',
  after: '○',
  main: '본',
  etc: '기',
};

function md(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export interface ReportMeta {
  title: string;
  from: string;
  to: string;
}

export function renderReportHTML(grid: GridData, meta: ReportMeta): string {
  const dateHeaders = grid.dates.map((d) => `<th class="date-col">${esc(md(d))}</th>`).join('');

  const blocks = grid.soks
    .map((sok) => {
      const rows = sok.members
        .map((m) => {
          const cells = m.statuses
            .map((s) => `<td>${s ? SYMBOL[s] : ''}</td>`)
            .join('');
          const cls = m.longAbsence ? ' class="absent"' : '';
          return (
            `<tr${cls}>` +
            `<td class="name">${esc(m.name)}(${esc(formatBirthYear(m.birth_year))})</td>` +
            cells +
            `<td class="tally">${m.attended}/${m.total}</td>` +
            `</tr>`
          );
        })
        .join('');
      return (
        `<table class="sok">` +
        `<caption>${esc(sok.name)} <span class="avg">평균 ${sok.avgRatePct}%</span></caption>` +
        `<thead><tr><th class="name">이름</th>${dateHeaders}<th class="tally">계</th></tr></thead>` +
        `<tbody>${rows}</tbody>` +
        `</table>`
      );
    })
    .join('');

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
  .legend { font-size: 0.8em; color: #333; margin-bottom: 6px; }
  .grid { column-count: 4; column-gap: 6px; }
  table.sok { width: 100%; border-collapse: collapse; margin: 0 0 6px; break-inside: avoid; }
  table.sok caption { text-align: left; font-weight: 700; background: #e8e8e8; padding: 2px 3px; border: 1px solid #999; border-bottom: none; }
  table.sok caption .avg { font-weight: 400; font-size: 0.85em; color: #444; float: right; }
  table.sok th, table.sok td { border: 1px solid #999; padding: 1px 2px; text-align: center; white-space: nowrap; }
  table.sok th.name, table.sok td.name { text-align: left; max-width: 64px; overflow: hidden; text-overflow: ellipsis; }
  .date-col { font-size: 0.8em; }
  .tally { font-size: 0.85em; }
  tr.absent td.name { color: #c00; font-weight: 700; }
</style></head>
<body>
  <div class="report-head">
    <h1>[ ${esc(meta.title)} 출석부 ]</h1>
    <span class="range">${esc(md(meta.from))} ~ ${esc(md(meta.to))} (${grid.dates.length}주 · ${grid.memberCount}명)</span>
  </div>
  <div class="legend">● 예배전 · ◉ 찬양중 · ○ 찬양후 · 본 본당 · 기 기타 · (빈칸) 결석 &nbsp;|&nbsp; <span style="color:#c00;font-weight:700;">빨강</span> = 연속 3주 이상 결석</div>
  <div class="grid">${blocks}</div>
</body></html>`;
}
