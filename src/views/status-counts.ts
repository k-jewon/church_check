import { html, raw, type Raw } from './layout.js';
import { STATUSES, type Status } from '../domain/attendance.js';

// 「오늘 입력 현황」의 칸 줄. 칸을 누르면 그 상태로 목록을 거르고, 방문 칸은 방문 기록으로 보낸다.
// 방문자는 명단 밖의 사람이라 `입력됨`에 더하지 않는다 — 입력됨 + 미출석 = 명단이 유지된다.
export function statusCountsBar(opts: {
  date: string;
  marked: number;
  counts: Record<Status, number>;
  unmarked: number;
  visits: number;
  filter: Status | 'unmarked' | null; // 없음 = 입력 전체
}): Raw {
  const { date, marked, counts, unmarked, visits, filter } = opts;
  const roster = marked + unmarked; // 활성 전체 명단 (입력됨 + 미출석)
  const pill = (href: string, active: boolean, label: Raw) =>
    html`<a class="count-pill ${active ? raw('active') : raw('')}" href="${href}">${label}</a>`;

  return html`
    <div class="counts">
      ${pill(`/input/status?date=${date}`, filter === null, html`입력됨 <strong>${marked}</strong>`)}
      ${STATUSES.map((s) =>
        pill(
          `/input/status?date=${date}&filter=${s.value}`,
          filter === s.value,
          html`${s.label} ${s.symbol} <strong>${counts[s.value]}</strong>`,
        ),
      )}
      ${pill(`/input/visits?date=${date}`, false, html`방문 <strong>${visits}</strong>`)}
      ${pill(`/input/status?date=${date}&filter=unmarked`, filter === 'unmarked', html`미출석 <strong>${unmarked}</strong> / ${roster}`)}
    </div>`;
}
