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

// Full HTML document with mobile viewport, shared CSS, and htmx.
export function page(opts: { title: string; role?: string | null; body: Raw }): string {
  const nav = opts.role
    ? html`<nav class="topnav">
        <span class="brand">청년부 출석</span>
        <span class="spacer"></span>
        ${opts.role === 'admin' ? html`<a href="/admin">관리</a>` : raw('')}
        <a href="/">입력</a>
        <a href="/visitors">방문자</a>
        <form method="post" action="/logout" class="inline">
          <button class="linklike" type="submit">로그아웃</button>
        </form>
      </nav>`
    : raw('');
  return (
    '<!doctype html>' +
    render(html`<html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <title>${opts.title}</title>
        <link rel="stylesheet" href="/public/app.css" />
        <script src="/public/htmx.min.js" defer></script>
      </head>
      <body>
        ${nav}
        <main>${opts.body}</main>
      </body>
    </html>`)
  );
}
