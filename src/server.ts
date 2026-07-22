import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { config } from './config.js';
import './db/index.js'; // initialise DB + schema on boot
import { endSession, requireRole, roleForPassword, startSession } from './auth/middleware.js';
import { html, page, raw } from './views/layout.js';
import { adminRoutes } from './routes/admin.js';
import { inputRoutes } from './routes/input.js';
import { visitorRoutes } from './routes/visitors.js';

const app = new Hono();

app.use('/public/*', serveStatic({ root: './' }));

app.get('/login', (c) => {
  const error = c.req.query('e') ? html`<p class="error">암호가 올바르지 않습니다.</p>` : raw('');
  const next = c.req.query('next') ?? '/';
  const body = html`
    <div class="card login">
      <h1>청년부 출석</h1>
      ${error}
      <form method="post" action="/login">
        <input type="hidden" name="next" value="${next}" />
        <label>암호<input type="password" name="password" autocomplete="current-password" autofocus /></label>
        <button type="submit">로그인</button>
      </form>
    </div>`;
  return c.html(page({ title: '로그인', body }));
});

app.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const password = String(body.password ?? '');
  const next = String(body.next ?? '/') || '/';
  const role = roleForPassword(password);
  if (!role) return c.redirect(`/login?e=1&next=${encodeURIComponent(next)}`);
  await startSession(c, role);
  return c.redirect(next.startsWith('/') ? next : '/');
});

app.post('/logout', (c) => {
  endSession(c);
  return c.redirect('/login');
});

app.use('/admin', requireRole('admin'));
app.use('/admin/*', requireRole('admin'));
app.route('/admin', adminRoutes);

// Visitor log (register/list = input; promote = admin, guarded in the route).
app.use('/visitors', requireRole('input'));
app.use('/visitors/*', requireRole('input'));
app.route('/visitors', visitorRoutes);

// Input UI (home + /input/*), gated by input-level access.
app.use('/', requireRole('input'));
app.use('/input/*', requireRole('input'));
app.route('/', inputRoutes);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`church_check listening on http://localhost:${info.port}`);
});
