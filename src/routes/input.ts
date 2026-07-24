import { Hono } from 'hono';
import { html, page, raw, type Raw } from '../views/layout.js';
import { formatBirthYear, type Member } from '../domain/members.js';
import {
  isStatus,
  labelOf,
  listUnmarked,
  marksForDate,
  mark,
  searchUnmarked,
  STATUSES,
  statusCounts,
  symbolOf,
  unmark,
  unmarkedCount,
  type Status,
} from '../domain/attendance.js';
import { currentSunday, isSunday, recentSundays } from '../domain/sundays.js';
import { currentRole } from '../auth/middleware.js';

export const inputRoutes = new Hono();

function memberLabel(m: Member): string {
  const by = formatBirthYear(m.birth_year);
  return by ? `${m.name}(${by}) - ${m.sok}` : `${m.name} - ${m.sok}`;
}

function resolveDate(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && isSunday(raw)) return raw;
  return currentSunday(new Date());
}

// ---- main input page ----
inputRoutes.get('/', async (c) => {
  const role = await currentRole(c);
  const date = resolveDate(c.req.query('date'));
  const sundays = recentSundays(new Date(), 8).reverse(); // most recent first
  if (!sundays.includes(date)) sundays.unshift(date);

  const body = html`
    <div class="card">
      <h1>출석 입력</h1>
      <form method="get" action="/" class="date-form">
        <label>주일
          <select name="date" onchange="this.form.submit()">
            ${sundays.map((s) => html`<option value="${s}" ${s === date ? raw('selected') : raw('')}>${s}</option>`)}
          </select>
        </label>
      </form>

      <label>출석 상태
        <select id="status" name="status">
          ${STATUSES.map((s) => html`<option value="${s.value}">${s.label} ${s.symbol}</option>`)}
        </select>
      </label>

      <label>이름 검색
        <input type="search" name="q" placeholder="이름 일부 입력" autocomplete="off"
          hx-get="/input/search" hx-target="#results" hx-swap="innerHTML"
          hx-trigger="keyup changed delay:250ms, search"
          hx-include="[name='sdate']" />
      </label>
      <input type="hidden" name="sdate" value="${date}" />
      <ul id="results" class="results"></ul>

      <h2>방금 입력됨</h2>
      <ul id="chips" class="chips"></ul>

      <p><a href="/input/status?date=${date}">오늘 입력 현황 보기 →</a></p>
    </div>`;
  return c.html(page({ title: '출석 입력', section: 'input', role, body }));
});

// ---- search-as-you-type (returns <li> list) ----
inputRoutes.get('/input/search', (c) => {
  const date = resolveDate(c.req.query('sdate'));
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.html('');
  const found = searchUnmarked(date, q, 20);
  const list = found.length
    ? found.map(
        (m) => html`
          <li>
            <button type="button" class="candidate"
              hx-post="/input/mark"
              hx-vals='${raw(JSON.stringify({ memberId: m.id, date }))}'
              hx-include="#status"
              hx-target="#chips" hx-swap="afterbegin"
              hx-on::after-request="this.closest('li').remove()">
              ${memberLabel(m)}
            </button>
          </li>`,
      )
    : html`<li class="muted">일치하는 미출석자가 없습니다.</li>`;
  return c.html(fragment(html`${list}`));
});

// ---- mark (returns a chip) ----
inputRoutes.post('/input/mark', async (c) => {
  const body = await c.req.parseBody();
  const memberId = Number(body.memberId);
  const date = resolveDate(String(body.date));
  const status = String(body.status);
  if (!memberId || !isStatus(status)) return c.text('bad request', 400);
  mark(memberId, date, status);
  const m = marksForDate(date).find((x) => x.id === memberId);
  if (!m) return c.text('', 200);
  return c.html(fragment(chip(m, m.status, date)));
});

// ---- unmark (from chip X) ----
inputRoutes.post('/input/unmark', async (c) => {
  const body = await c.req.parseBody();
  const memberId = Number(body.memberId);
  const date = resolveDate(String(body.date));
  if (memberId) unmark(memberId, date);
  return c.html(''); // empty replaces the chip
});

// ---- "오늘 입력 현황" (full page; corrections happen here) ----
inputRoutes.get('/input/status', async (c) => {
  const role = await currentRole(c);
  const date = resolveDate(c.req.query('date'));
  const marked = marksForDate(date);
  const counts = statusCounts(date);
  const unmarked = unmarkedCount(date);
  const roster = marked.length + unmarked; // 활성 전체 명단 (입력됨 + 미출석)

  // pill 클릭 시 필터: 상태값 | 'unmarked'(미출석 명단) | 없음(입력 전체)
  const filterQ = c.req.query('filter');
  const statusFilter = isStatus(filterQ) ? filterQ : null;
  const unmarkedView = filterQ === 'unmarked';

  const pill = (href: string, active: boolean, label: Raw) =>
    html`<a class="count-pill ${active ? raw('active') : raw('')}" href="${href}">${label}</a>`;

  const summary = html`
    <div class="counts">
      ${pill(`/input/status?date=${date}`, !unmarkedView && statusFilter === null, html`입력됨 <strong>${marked.length}</strong>`)}
      ${STATUSES.map((s) =>
        pill(
          `/input/status?date=${date}&filter=${s.value}`,
          !unmarkedView && statusFilter === s.value,
          html`${s.label} ${s.symbol} <strong>${counts[s.value]}</strong>`,
        ),
      )}
      ${pill(`/input/status?date=${date}&filter=unmarked`, unmarkedView, html`미출석 <strong>${unmarked}</strong> / ${roster}`)}
    </div>`;

  let rows: Raw;
  if (unmarkedView) {
    const list = listUnmarked(date);
    rows = list.length
      ? html`${list.map(
          (m) => html`
            <li>
              <span>${m.name}(${formatBirthYear(m.birth_year)}) · ${m.sok} · ${m.role}</span>
              <span class="row-actions">
                <form method="post" action="/input/status/set" class="inline">
                  <input type="hidden" name="memberId" value="${m.id}" />
                  <input type="hidden" name="date" value="${date}" />
                  <input type="hidden" name="filter" value="unmarked" />
                  <select name="status" onchange="this.form.submit()">
                    <option value="" selected disabled>출석 입력</option>
                    ${STATUSES.map((s) => html`<option value="${s.value}">${s.label} ${s.symbol}</option>`)}
                  </select>
                </form>
              </span>
            </li>`,
        )}`
      : html`<li class="muted">미출석 인원이 없습니다.</li>`;
  } else {
    const shown = statusFilter ? marked.filter((m) => m.status === statusFilter) : marked;
    rows = shown.length
      ? html`${shown.map(
          (m) => html`
            <li>
              <span>${m.name}(${formatBirthYear(m.birth_year)}) · ${m.sok} · ${m.role}</span>
              <span class="row-actions">
                <form method="post" action="/input/status/set" class="inline">
                  <input type="hidden" name="memberId" value="${m.id}" />
                  <input type="hidden" name="date" value="${date}" />
                  <input type="hidden" name="filter" value="${statusFilter ?? ''}" />
                  <select name="status" onchange="this.form.submit()">
                    ${STATUSES.map((s) => html`<option value="${s.value}" ${s.value === m.status ? raw('selected') : raw('')}>${s.label} ${s.symbol}</option>`)}
                  </select>
                </form>
                <form method="post" action="/input/status/unmark" class="inline">
                  <input type="hidden" name="memberId" value="${m.id}" />
                  <input type="hidden" name="date" value="${date}" />
                  <input type="hidden" name="filter" value="${statusFilter ?? ''}" />
                  <button type="submit" class="linklike">취소</button>
                </form>
              </span>
            </li>`,
        )}`
      : html`<li class="muted">${statusFilter ? '해당 상태로 입력된 사람이 없습니다.' : '아직 입력된 사람이 없습니다.'}</li>`;
  }

  const body = html`
    <div class="card">
      <h1>오늘 입력 현황</h1>
      <p class="muted">${date}</p>
      ${summary}
      <ul class="member-list">${rows}</ul>
      <p><a href="/?date=${date}">← 입력으로</a></p>
    </div>`;
  return c.html(page({ title: '오늘 입력 현황', section: 'input', role, body }));
});

// 처리 후 보고 있던 필터 뷰를 유지한다.
function statusBack(date: string, filter: string): string {
  return filter ? `/input/status?date=${date}&filter=${encodeURIComponent(filter)}` : `/input/status?date=${date}`;
}

inputRoutes.post('/input/status/set', async (c) => {
  const body = await c.req.parseBody();
  const memberId = Number(body.memberId);
  const date = resolveDate(String(body.date));
  const status = String(body.status);
  if (memberId && isStatus(status)) mark(memberId, date, status);
  return c.redirect(statusBack(date, String(body.filter ?? '')));
});

inputRoutes.post('/input/status/unmark', async (c) => {
  const body = await c.req.parseBody();
  const memberId = Number(body.memberId);
  const date = resolveDate(String(body.date));
  if (memberId) unmark(memberId, date);
  return c.redirect(statusBack(date, String(body.filter ?? '')));
});

// ---- fragment helpers ----
function fragment(r: Raw): string {
  return r.value;
}
function chip(m: Member, status: Status, date: string): Raw {
  return html`
    <li class="chip" id="chip-${m.id}">
      <span>${memberLabel(m)} · ${symbolOf(status)} <span class="muted">${labelOf(status)}</span></span>
      <button type="button" class="chip-x"
        hx-post="/input/unmark"
        hx-vals='${raw(JSON.stringify({ memberId: m.id, date }))}'
        hx-target="#chip-${m.id}" hx-swap="outerHTML">✕</button>
    </li>`;
}
