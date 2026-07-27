import { Hono } from 'hono';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { db, DB_PATH } from '../db/index.js';
import { html, page, raw } from '../views/layout.js';
import {
  countMembers,
  createMember,
  deleteAllMembers,
  formatBirthYear,
  getMember,
  insertMany,
  isRole,
  listMembers,
  normalizeBirthYear,
  ROLES,
  setActive,
  updateMember,
  type Member,
} from '../domain/members.js';
import { parseRoster } from '../import/excel.js';
import { buildGrid } from '../report/grid.js';
import { renderReportHTML } from '../report/template.js';
import { renderPdf } from '../report/pdf.js';
import { currentSunday, recentSundays } from '../domain/sundays.js';
import { getTunnelUrl } from '../setup/tunnel.js';
import QRCode from 'qrcode';

const REPORT_TITLE = '청년부';

export const adminRoutes = new Hono();

// ---- Dashboard ----
adminRoutes.get('/', (c) => {
  const total = countMembers();
  const body = html`
    <div class="card">
      <h1>관리</h1>
      <p>등록 성도: <strong>${total}</strong>명</p>
      <ul class="menu">
        <li><a href="/admin/members">명단 관리</a></li>
        <li><a href="/admin/upload">명단 엑셀 업로드</a></li>
        <li><a href="/admin/template">명단 템플릿 내려받기</a></li>
        <li><a href="/admin/report">출석부 PDF 만들기</a></li>
        <li><a href="/admin/backup">전체 백업 다운로드</a></li>
        <li><a href="/admin/tunnel">폰 접속(QR)</a></li>
      </ul>
    </div>`;
  return c.html(page({ title: '관리', section: 'admin', body }));
});

// ---- Member list + add form ----
adminRoutes.get('/members', (c) => {
  const members = listMembers();
  const soks = groupBySok(members);
  const list = soks.length
    ? soks.map(
        ([sok, rows]) => html`
          <div class="sok-block">
            <h3>${sok} <span class="muted">(${rows.length})</span></h3>
            <ul class="member-list">
              ${rows.map(
                (m) => html`
                  <li class="${m.active ? '' : 'inactive'}">
                    <span>${m.name}(${formatBirthYear(m.birth_year)}) · ${m.role}${m.active ? raw('') : html` · <em>비활성</em>`}</span>
                    <span class="row-actions">
                      <a href="/admin/members/${m.id}/edit">수정</a>
                      <form method="post" action="/admin/members/${m.id}/active" class="inline">
                        <input type="hidden" name="active" value="${m.active ? '0' : '1'}" />
                        <button class="linklike" type="submit">${m.active ? '비활성' : '활성'}</button>
                      </form>
                    </span>
                  </li>`,
              )}
            </ul>
          </div>`,
      )
    : html`<p class="muted">등록된 성도가 없습니다. <a href="/admin/upload">엑셀 업로드</a>로 시작하세요.</p>`;

  const body = html`
    <div class="card">
      <h1>명단 관리</h1>
      ${list}
    </div>
    <div class="card">
      <h2>성도 추가</h2>
      ${memberForm({ action: '/admin/members' })}
    </div>`;
  return c.html(page({ title: '명단 관리', section: 'admin', body }));
});

adminRoutes.post('/members', async (c) => {
  const parsed = parseMemberForm(await c.req.parseBody());
  if ('error' in parsed) return c.html(errorPage(parsed.error, '/admin/members'), 400);
  createMember(parsed.value);
  return c.redirect('/admin/members');
});

adminRoutes.get('/members/:id/edit', (c) => {
  const id = Number(c.req.param('id'));
  const m = getMember(id);
  if (!m) return c.html(errorPage('성도를 찾을 수 없습니다.', '/admin/members'), 404);
  const body = html`
    <div class="card">
      <h1>성도 수정</h1>
      ${memberForm({ action: `/admin/members/${m.id}`, member: m })}
    </div>`;
  return c.html(page({ title: '성도 수정', section: 'admin', body }));
});

adminRoutes.post('/members/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!getMember(id)) return c.html(errorPage('성도를 찾을 수 없습니다.', '/admin/members'), 404);
  const parsed = parseMemberForm(await c.req.parseBody());
  if ('error' in parsed) return c.html(errorPage(parsed.error, `/admin/members/${id}/edit`), 400);
  updateMember(id, parsed.value);
  return c.redirect('/admin/members');
});

adminRoutes.post('/members/:id/active', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  setActive(id, String(body.active) === '1');
  return c.redirect('/admin/members');
});

// ---- Template download ----
adminRoutes.get('/template', (c) => {
  const file = readFileSync(resolve(process.cwd(), 'template', 'roster-template.xlsx'));
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', 'attachment; filename="roster-template.xlsx"');
  return c.body(file);
});

// ---- Upload (initial only) + reset ----
adminRoutes.get('/upload', (c) => {
  const total = countMembers();
  const body =
    total > 0
      ? html`
          <div class="card">
            <h1>명단 업로드</h1>
            <p class="error">이미 ${total}명이 등록되어 있어 업로드가 차단됩니다.</p>
            <p>소규모 변경은 <a href="/admin/members">명단 관리</a>에서 하세요. 전체를 다시 올리려면 아래에서 초기화해야 합니다.</p>
            <form method="post" action="/admin/reset" onsubmit="return confirm('정말 전체 명단을 삭제합니까? 되돌릴 수 없습니다.');">
              <label>확인 문구에 <code>DELETE</code> 를 입력<input name="confirm" placeholder="DELETE" /></label>
              <button type="submit" class="danger">전체 초기화</button>
            </form>
          </div>`
      : html`
          <div class="card">
            <h1>명단 업로드</h1>
            <p><a href="/admin/template">템플릿(xlsx)</a>을 내려받아 <code>이름·출생연도·속·직분</code>을 채운 뒤 업로드하세요.</p>
            <form method="post" action="/admin/upload" enctype="multipart/form-data">
              <label>명단 파일<input type="file" name="file" accept=".xlsx" required /></label>
              <button type="submit">업로드</button>
            </form>
          </div>`;
  return c.html(page({ title: '명단 업로드', section: 'admin', body }));
});

adminRoutes.post('/upload', async (c) => {
  if (countMembers() > 0) {
    return c.html(errorPage('이미 명단이 있어 업로드할 수 없습니다.', '/admin/upload'), 409);
  }
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) {
    return c.html(errorPage('파일이 없습니다.', '/admin/upload'), 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const { members, errors } = await parseRoster(buf);

  if (errors.length) {
    const body2 = html`
      <div class="card">
        <h1>업로드 오류</h1>
        <p class="error">${errors.length}건의 오류로 업로드를 중단했습니다. (전부 통과해야 저장됩니다.)</p>
        <ul>${errors.map((e) => html`<li>${e}</li>`)}</ul>
        <a href="/admin/upload">다시 시도</a>
      </div>`;
    return c.html(page({ title: '업로드 오류', section: 'admin', body: body2 }), 400);
  }
  if (!members.length) {
    return c.html(errorPage('유효한 행이 없습니다.', '/admin/upload'), 400);
  }
  insertMany(members);
  return c.redirect('/admin/members');
});

adminRoutes.post('/reset', async (c) => {
  const body = await c.req.parseBody();
  if (String(body.confirm) !== 'DELETE') {
    return c.html(errorPage('확인 문구가 일치하지 않습니다.', '/admin/upload'), 400);
  }
  deleteAllMembers();
  return c.redirect('/admin/upload');
});

// ---- backup (full DB snapshot) ----
adminRoutes.get('/backup', (c) => {
  const tmp = resolve(dirname(DB_PATH), 'backup-tmp.db');
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  try {
    const file = readFileSync(tmp);
    const stamp = new Date().toISOString().slice(0, 10);
    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="church-backup-${stamp}.db"`);
    return c.body(file as unknown as ArrayBuffer);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
});

// ---- phone access (cloudflared tunnel QR) ----
adminRoutes.get('/tunnel', async (c) => {
  const url = getTunnelUrl();
  const body = url
    ? html`
        <div class="card">
          <h1>폰 접속 (QR)</h1>
          <p>폰 카메라로 아래 QR을 찍으면 이 화면에 접속됩니다.</p>
          <img src="${await QRCode.toDataURL(url, { margin: 1, width: 320 })}" alt="접속 QR" style="max-width:320px;width:100%;height:auto" />
          <p><a href="${url}">${url}</a></p>
          <p class="muted">이 주소는 서버를 끄면 사라지고, 다시 켜면 새 주소가 생깁니다.</p>
        </div>`
    : html`
        <div class="card">
          <h1>폰 접속 (QR)</h1>
          <p class="muted">아직 외부 접속 주소가 준비되지 않았습니다. cloudflared 가 설치돼 있으면 잠시 뒤 새로고침 하세요. 없으면 같은 Wi-Fi에서 이 PC의 IP로 접속하세요.</p>
        </div>`;
  return c.html(page({ title: '폰 접속(QR)', section: 'admin', body }));
});

// ---- report (PDF) ----
adminRoutes.get('/report', (c) => {
  const recent = recentSundays(new Date(), 4);
  const from = recent[0];
  const to = currentSunday(new Date());
  const body = html`
    <div class="card">
      <h1>출석부 PDF 만들기</h1>
      <form id="rf" method="get" action="/admin/report/pdf" target="_blank">
        <label>시작 주일<input type="date" name="from" id="from" value="${from}" required /></label>
        <label>종료 주일<input type="date" name="to" id="to" value="${to}" required /></label>
        <div class="btn-row">
          <button type="button" class="linklike" onclick="preset()">최근 4주</button>
          <button type="submit" formaction="/admin/report/preview">미리보기(HTML)</button>
          <button type="submit">PDF 다운로드</button>
        </div>
      </form>
      <p class="muted">범위 안의 모든 주일이 열로 표시됩니다. A4 1장에 맞게 축소되며, 너무 작아지면(7pt 미만) 여러 장으로 나뉩니다.</p>
    </div>
    <script>
      function preset(){
        var t=new Date();
        function sun(off){var d=new Date(t);d.setDate(t.getDate()-t.getDay()-off*7);return d.toISOString().slice(0,10);}
        document.getElementById('to').value=sun(0);
        document.getElementById('from').value=sun(3);
      }
    </script>`;
  return c.html(page({ title: '출석부 PDF', section: 'admin', body }));
});

adminRoutes.get('/report/preview', (c) => {
  const from = String(c.req.query('from') ?? '');
  const to = String(c.req.query('to') ?? '');
  const grid = buildGrid(from, to);
  return c.html(renderReportHTML(grid, { title: REPORT_TITLE, from, to }));
});

adminRoutes.get('/report/pdf', async (c) => {
  const from = String(c.req.query('from') ?? '');
  const to = String(c.req.query('to') ?? '');
  const grid = buildGrid(from, to);
  const htmlStr = renderReportHTML(grid, { title: REPORT_TITLE, from, to });
  const pdf = await renderPdf(htmlStr);
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', `attachment; filename="attendance_${from}_${to}.pdf"`);
  return c.body(pdf as unknown as ArrayBuffer);
});

// ---- helpers ----
function groupBySok(members: Member[]): [string, Member[]][] {
  const map = new Map<string, Member[]>();
  for (const m of members) {
    const arr = map.get(m.sok) ?? [];
    arr.push(m);
    map.set(m.sok, arr);
  }
  return [...map.entries()]; // listMembers already sorted by sok, role, name
}

function memberForm(opts: { action: string; member?: Member }) {
  const m = opts.member;
  return html`
    <form method="post" action="${opts.action}">
      <label>이름<input name="name" value="${m?.name ?? ''}" required /></label>
      <label>출생연도 (2자리 또는 4자리 · 방문자는 생략 가능)<input name="birth_year" value="${m ? formatBirthYear(m.birth_year) : ''}" /></label>
      <label>속<input name="sok" value="${m?.sok ?? ''}" required /></label>
      <label>직분
        <select name="role">
          ${ROLES.map((r) => html`<option value="${r}" ${m?.role === r ? raw('selected') : raw('')}>${r}</option>`)}
        </select>
      </label>
      <button type="submit">저장</button>
    </form>`;
}

type ParsedForm = { value: { name: string; birth_year: number | null; sok: string; role: Member['role'] } } | { error: string };
function parseMemberForm(body: Record<string, unknown>): ParsedForm {
  const name = String(body.name ?? '').trim();
  const sok = String(body.sok ?? '').trim();
  const role = String(body.role ?? '').trim();
  const birthRaw = String(body.birth_year ?? '').trim();
  const birth = birthRaw === '' ? null : normalizeBirthYear(birthRaw);
  if (!name) return { error: '이름을 입력하세요.' };
  if (birthRaw !== '' && birth === null) return { error: '출생연도가 올바르지 않습니다.' };
  if (!sok) return { error: '속을 입력하세요.' };
  if (!isRole(role)) return { error: '직분이 올바르지 않습니다.' };
  return { value: { name, birth_year: birth, sok, role } };
}

function errorPage(message: string, back: string) {
  return page({
    title: '오류',
    section: 'admin',
    body: html`<div class="card"><h1>오류</h1><p class="error">${message}</p><a href="${back}">돌아가기</a></div>`,
  });
}
