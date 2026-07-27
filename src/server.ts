import { ensureConfig } from './setup/bootstrap.js';

// Bootstrap entry. First-run password setup MUST finish before config.js (and
// anything importing it: db, auth, routes) loads, so those are pulled in via
// dynamic import after ensureConfig(). No top-level await — the exe build
// targets CJS, which cannot represent it.
async function main(): Promise<void> {
  await ensureConfig();

  const { serve } = await import('@hono/node-server');
  const { config } = await import('./config.js');
  const { createApp } = await import('./app.js');
  const { startTunnel } = await import('./setup/tunnel.js');

  const app = createApp();
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`church_check listening on http://localhost:${info.port}`);
    startTunnel(info.port);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
