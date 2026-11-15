import { ensureConfig, setPasswordFromArg } from './setup/bootstrap.js';

// Bootstrap entry. First-run password setup MUST finish before config.js (and
// anything importing it: db, auth, routes) loads, so those are pulled in via
// dynamic import after ensureConfig(). No top-level await — the exe build
// targets CJS, which cannot represent it.
async function main(): Promise<void> {
  // DB 스키마를 명시적으로 올린다. 암호·설정과 무관하므로 ensureConfig 앞에서 끝낸다.
  if (process.argv.includes('--migrate')) {
    const { runMigrateCli } = await import('./db/migrate-cli.js');
    process.exit(await runMigrateCli());
  }

  // 설치 마법사(--setpw)는 서버를 띄우지 않고 config.json만 쓴다. 설치 위치를 cwd로 잡는다.
  const setpw = process.argv.indexOf('--setpw');
  if (setpw > 0) {
    setPasswordFromArg(process.argv[setpw + 1] ?? '', process.argv[setpw + 2] ?? '');
    console.log(`config.json에 ${process.argv[setpw + 1]} 암호를 저장했습니다.`);
    process.exit(0);
  }

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
  // 스키마가 낮은 것은 고장이 아니라 안내할 일이다 — 스택 대신 할 일만 보인다.
  console.error(err instanceof Error && err.name === 'SchemaBehindError' ? `
[중단] ${err.message}
` : err);
  process.exit(1);
});
