import { Hono } from 'hono';
import { html, page, raw, type Raw } from '../views/layout.js';
import { formatBirthYear, getMember, listMembers, type Member } from '../domain/members.js';
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
import { addSession, countSessions, removeSession, sessionsOn } from '../domain/newfamily.js';
import { addVisit, listVisits, removeVisit } from '../domain/visitlog.js';
import { currentRole } from '../auth/middleware.js';

export const inputRoutes = new Hono();

function memberLabel(m: Member): string {
  const by = formatBirthYear(m.birth_year);
  const group = m.sok ?? m.stage; // 새가족은 속이 없다
  return by ? `${m.name}(${by}) - ${group}` : `${m.name} - ${group}`;
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
      <p><a href="/input/visits?date=${date}">방문 기록 →</a></p>
    </div>
    ${newFamilyCard(date)}`;
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
              <span>${m.name}(${formatBirthYear(m.birth_year)}) · ${m.sok ?? m.stage}${m.role ? ` · ${m.role}` : ''}</span>
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
              <span>${m.name}(${formatBirthYear(m.birth_year)}) · ${m.sok ?? m.stage}${m.role ? ` · ${m.role}` : ''}</span>
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

// ---- 새가족 모임 회차 ----
// 회차는 예배가 아니라 **예배 후 새가족 모임** 참여이므로 출석 행에서 유도할 수
// 없다. 예배 축(출석 상태)에 값을 더하는 대신 체크 한 칸을 따로 둔다 — 한 사람이
// 같은 주일에 예배도 오고 모임도 하므로 하나의 드롭다운에 담기지 않는다.
// 근거: context/wayfinder/tickets/12-방문-새가족-등록-경로-통합.md
inputRoutes.post('/input/session', async (c) => {
  const body = await c.req.parseBody();
  const memberId = Number(body.memberId);
  const date = resolveDate(String(body.date));
  const m = memberId ? getMember(memberId) : undefined;
  if (!m || m.stage !== '새가족') return c.text('bad request', 400);

  if (String(body.on) === '1') addSession(memberId, date);
  else removeSession(memberId, date);

  return c.html(fragment(sessionRow(m, date)));
});

// 그 주일의 체크 상태와 지금까지의 회차를 함께 그린다. 토글하면 이 <li> 가
// 통째로 갈린다.
function sessionRow(m: Member, date: string): Raw {
  const checked = sessionsOn(date).has(m.id);
  const done = countSessions(m.id);
  return html`
    <li id="nf-${m.id}">
      <label class="nf-check">
        <input type="checkbox" ${checked ? raw('checked') : raw('')}
          hx-post="/input/session"
          hx-vals='${raw(JSON.stringify({ memberId: m.id, date, on: checked ? '0' : '1' }))}'
          hx-target="#nf-${m.id}" hx-swap="outerHTML" />
        <span>${m.name}(${formatBirthYear(m.birth_year)})</span>
      </label>
      <span class="muted">${done === 0 ? '회차 없음' : `${Math.min(done, 4)}주차`}</span>
    </li>`;
}

function newFamilyCard(date: string): Raw {
  const rows = listMembers({ activeOnly: true }).filter((m) => m.stage === '새가족');
  if (!rows.length) return raw('');
  return html`
    <div class="card">
      <h2>새가족 모임</h2>
      <p class="muted">예배 뒤 모임까지 참여한 사람을 체크하세요. 예배 출석과는 별개입니다.</p>
      <ul class="member-list">${rows.map((m) => sessionRow(m, date))}</ul>
    </div>`;
}

// ---- 방문 ----
// 방문은 사람 레코드가 아니라 (날짜, 이름) 줄이다. 이력을 잇지 않으므로 같은
// 이름이 다시 와도 새 줄이고, 무명·별명도 그냥 한 줄이다. 방문자에게는 예배 축이
// 없어 출석 상태를 묻지 않는다.
inputRoutes.get('/input/visits', async (c) => {
  const role = await currentRole(c);
  const date = resolveDate(c.req.query('date'));
  const sundays = recentSundays(new Date(), 8).reverse();
  if (!sundays.includes(date)) sundays.unshift(date);
  const visits = listVisits(date);

  const list = visits.length
    ? html`${visits.map(
        (v) => html`
          <li>
            <span>${v.name}</span>
            <span class="row-actions">
              <form method="post" action="/input/visits/remove" class="inline">
                <input type="hidden" name="id" value="${v.id}" />
                <input type="hidden" name="date" value="${date}" />
                <button type="submit" class="linklike">삭제</button>
              </form>
            </span>
          </li>`,
      )}`
    : html`<li class="muted">이 주일에 적힌 방문자가 없습니다.</li>`;

  const body = html`
    <div class="card">
      <h1>방문 기록</h1>
      <form method="get" action="/input/visits" class="date-form">
        <label>주일
          <select name="date" onchange="this.form.submit()">
            ${sundays.map((s) => html`<option value="${s}" ${s === date ? raw('selected') : raw('')}>${s}</option>`)}
          </select>
        </label>
      </form>

      <form method="post" action="/input/visits">
        <input type="hidden" name="date" value="${date}" />
        <label>방문자 이름<input name="name" placeholder="이름을 모르면 무명" autocomplete="off" required autofocus /></label>
        <button type="submit">추가</button>
      </form>
      <p class="muted">이름만 적습니다. 온 사람을 기억해 두는 것이 목적이라 연락처나 출석 시간은 묻지 않습니다.</p>

      <ul class="member-list">${list}</ul>
      <p><a href="/?date=${date}">← 입력으로</a></p>
    </div>`;
  return c.html(page({ title: '방문 기록', section: 'input', role, body }));
});

inputRoutes.post('/input/visits', async (c) => {
  const body = await c.req.parseBody();
  const date = resolveDate(String(body.date));
  const name = String(body.name ?? '').trim();
  if (name) addVisit(date, name);
  return c.redirect(`/input/visits?date=${date}`);
});

inputRoutes.post('/input/visits/remove', async (c) => {
  const body = await c.req.parseBody();
  const date = resolveDate(String(body.date));
  const id = Number(body.id);
  if (id) removeVisit(id);
  return c.redirect(`/input/visits?date=${date}`);
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
