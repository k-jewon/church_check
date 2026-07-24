import { Hono } from 'hono';
import { html, page, raw } from '../views/layout.js';
import { currentRole, requireRole } from '../auth/middleware.js';
import {
  createVisitor,
  getVisitor,
  isRoute,
  listVisitors,
  promoteVisitor,
  ROUTES,
  type Visitor,
} from '../domain/visitors.js';
import {
  formatBirthYear,
  isRole,
  listSoks,
  normalizeBirthYear,
  ROLES,
} from '../domain/members.js';
import { currentSunday } from '../domain/sundays.js';

export const visitorRoutes = new Hono();

// ---- 방문자 대장 (list) ----
visitorRoutes.get('/', async (c) => {
  const role = await currentRole(c);
  const isAdmin = role === 'admin';
  const visitors = listVisitors();
  const soks = listSoks();

  const rows = visitors.length
    ? visitors.map((v) => visitorRow(v, isAdmin, soks))
    : html`<li class="muted">등록된 방문자가 없습니다.</li>`;

  const body = html`
    <div class="card">
      <h1>방문자 대장</h1>
      <p><a href="/visitors/new">+ 새 방문자 등록</a></p>
      <datalist id="sok-list">${soks.map((s) => html`<option value="${s}"></option>`)}</datalist>
      <ul class="member-list">${rows}</ul>
      ${isAdmin ? raw('') : html`<p class="muted">승격(속 배정)은 관리자만 할 수 있습니다.</p>`}
    </div>`;
  return c.html(page({ title: '방문자 대장', section: 'input', role, body }));
});

// ---- 등록 폼 ----
visitorRoutes.get('/new', async (c) => {
  const role = await currentRole(c);
  const today = currentSunday(new Date());
  const body = html`
    <div class="card">
      <h1>새 방문자 등록</h1>
      <form method="post" action="/visitors/new">
        <label>이름<input name="name" required /></label>
        <label>연락처<input name="phone" inputmode="tel" placeholder="010-0000-0000" /></label>
        <label>성별
          <select name="gender">
            <option value="">선택 안 함</option>
            <option value="남">남</option>
            <option value="여">여</option>
          </select>
        </label>
        <label>출생연도 (2자리 또는 4자리)<input name="birth_year" placeholder="예: 00 또는 2000" /></label>
        <label>인도자<input name="inviter" /></label>
        <label>방문경로
          <select name="route">
            <option value="">선택 안 함</option>
            ${ROUTES.map((r) => html`<option value="${r}">${r}</option>`)}
          </select>
        </label>
        <label>기타 상세 (방문경로가 '기타'일 때)<input name="route_note" /></label>
        <label>방문일<input type="date" name="visit_date" value="${today}" required /></label>
        <button type="submit">등록</button>
      </form>
    </div>`;
  return c.html(page({ title: '새 방문자 등록', section: 'input', role, body }));
});

visitorRoutes.post('/new', async (c) => {
  const b = await c.req.parseBody();
  const name = String(b.name ?? '').trim();
  if (!name) return c.html(errorPage('이름을 입력하세요.', '/visitors/new', await currentRole(c)), 400);
  const routeRaw = String(b.route ?? '').trim();
  const route = isRoute(routeRaw) ? routeRaw : null;
  const birth = b.birth_year ? normalizeBirthYear(b.birth_year) : null;
  createVisitor({
    name,
    phone: str(b.phone),
    gender: str(b.gender),
    birth_year: birth,
    inviter: str(b.inviter),
    route,
    route_note: str(b.route_note),
    visit_date: String(b.visit_date ?? '').trim() || currentSunday(new Date()),
  });
  return c.redirect('/visitors');
});

// ---- 승격 (관리자 전용) ----
visitorRoutes.post('/:id/promote', requireRole('admin'), async (c) => {
  const id = Number(c.req.param('id'));
  const v = getVisitor(id);
  if (!v) return c.html(errorPage('방문자를 찾을 수 없습니다.', '/visitors', 'admin'), 404);
  if (v.promoted_member_id) return c.redirect('/visitors');

  const b = await c.req.parseBody();
  const name = String(b.name ?? '').trim();
  const sok = String(b.sok ?? '').trim();
  const role = String(b.role ?? '').trim();
  const birth = normalizeBirthYear(b.birth_year);
  if (!name || !sok || !isRole(role) || birth === null) {
    return c.html(errorPage('이름·출생연도·속·직분을 올바르게 입력하세요.', '/visitors', 'admin'), 400);
  }
  promoteVisitor(id, { name, birth_year: birth, sok, role });
  return c.redirect('/visitors');
});

// ---- helpers ----
function visitorRow(v: Visitor, isAdmin: boolean, soks: string[]) {
  const info = [
    v.gender,
    v.birth_year !== null ? `${formatBirthYear(v.birth_year)}년생` : null,
    v.phone,
    v.inviter ? `인도자 ${v.inviter}` : null,
    v.route ? `경로 ${v.route}${v.route === '기타' && v.route_note ? `(${v.route_note})` : ''}` : null,
    v.visit_date,
  ]
    .filter(Boolean)
    .join(' · ');

  if (v.promoted_member_id) {
    return html`<li><span>${v.name} <span class="muted">→ 승격됨</span><br /><span class="muted">${info}</span></span></li>`;
  }

  const promote = isAdmin
    ? html`
        <form method="post" action="/visitors/${v.id}/promote" class="promote-form">
          <input name="name" value="${v.name}" required />
          <input name="birth_year" value="${v.birth_year !== null ? formatBirthYear(v.birth_year) : ''}" placeholder="출생연도" required />
          <input name="sok" list="sok-list" placeholder="속" required />
          <select name="role">${ROLES.map((r) => html`<option value="${r}" ${r === '속원' ? raw('selected') : raw('')}>${r}</option>`)}</select>
          <button type="submit">승격</button>
        </form>`
    : raw('');

  return html`
    <li class="visitor-row">
      <span>${v.name}<br /><span class="muted">${info}</span></span>
      ${promote}
    </li>`;
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function errorPage(message: string, back: string, role: 'input' | 'admin' | null) {
  return page({
    title: '오류',
    section: 'input',
    role,
    body: html`<div class="card"><h1>오류</h1><p class="error">${message}</p><a href="${back}">돌아가기</a></div>`,
  });
}
