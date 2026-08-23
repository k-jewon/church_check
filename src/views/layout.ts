// Minimal HTML templating with auto-escaping. Use raw() to opt out.
export class Raw {
  constructor(public readonly value: string) {}
}
export function raw(value: string): Raw {
  return new Raw(value);
}

export function esc(input: unknown): string {
  return String(input ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function render(value: unknown): string {
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += render(values[i]) + strings[i + 1];
  }
  return new Raw(out);
}

// 화면이 속한 기능 영역. 네비 색·배지·메뉴 구성을 결정한다.
type Section = 'admin' | 'input';

// 모드별 네비게이션. 각 모드는 자기 메뉴 + 반대 모드로 넘어가는 전환 링크만 노출한다.
function nav(section: Section, role: 'input' | 'admin' | null): Raw {
  if (section === 'admin') {
    return html`<nav class="topnav">
        <span class="brand">청년부 출석</span>
        <span class="mode-badge admin">관리자 모드</span>
        <span class="spacer"></span>
        <a href="/admin">관리 홈</a>
        <a class="mode-switch" href="/">입력 모드로 →</a>
        <form method="post" action="/logout" class="inline">
          <button class="linklike" type="submit">로그아웃</button>
        </form>
      </nav>`;
  }
  return html`<nav class="topnav">
      <span class="brand">청년부 출석</span>
      <span class="mode-badge input">입력 모드</span>
      <span class="spacer"></span>
      <a href="/">입력</a>
      <a href="/visitors">방문자</a>
      ${role === 'admin' ? html`<a class="mode-switch" href="/admin">관리자 모드로 →</a>` : raw('')}
      <form method="post" action="/logout" class="inline">
        <button class="linklike" type="submit">로그아웃</button>
      </form>
    </nav>`;
}

// Full HTML document with mobile viewport, shared CSS, and htmx.
// section: 화면 영역(색·배지). 생략 시 네비 없음(로그인 화면).
// role: 실제 세션 권한 — 입력 모드에서 관리자에게만 전환 링크를 보이는 데 쓴다.
export function page(opts: {
  title: string;
  section?: Section | null;
  role?: 'input' | 'admin' | null;
  body: Raw;
}): string {
  const section = opts.section ?? null;
  const topnav = section ? nav(section, opts.role ?? null) : raw('');
  const bodyClass = section ? `mode-${section}` : '';
  return (
    '<!doctype html>' +
    render(html`<html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <title>${opts.title}</title>
        <link rel="icon" href="data:image/svg+xml,${raw("%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%3E%3Ctext%20y='14'%20font-size='14'%3E%E2%9C%94%3C/text%3E%3C/svg%3E")}" />
        <link rel="stylesheet" href="/public/app.css" />
        <script src="/public/htmx.min.js" defer></script>
      </head>
      <body class="${bodyClass}">
        ${topnav}
        <main>${opts.body}</main>
      </body>
    </html>`)
  );
}
