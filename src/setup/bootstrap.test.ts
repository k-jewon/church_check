import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPassword } from '../util/password.js';

// CONFIG_PATH는 모듈 로드 시 cwd를 고정하므로, 임포트 전에 임시 폴더로 이동한다.
test('--setpw는 config.json에 두 암호를 넣고 서버를 띄우지 않는다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'church_check-setpw-'));
  process.chdir(dir);
  const { setPasswordFromArg } = await import('./bootstrap.js');

  setPasswordFromArg('input', 'alpha123');
  setPasswordFromArg('admin', 'adminpw456');

  const cfg = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  assert.match(cfg.inputPasswordHash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.ok(verifyPassword('alpha123', cfg.inputPasswordHash));
  assert.ok(verifyPassword('adminpw456', cfg.adminPasswordHash));
  assert.notEqual(cfg.adminPasswordHash, cfg.inputPasswordHash);
  assert.equal(cfg.port, 3000);
  assert.equal(cfg.chromePath, null);
  assert.match(cfg.cookieSecret, /^[0-9a-f]{64}$/);

  // 두 번 호출해도 cookieSecret는 그대로(암호만 갱신)이고 다른 키는 만들지 않는다.
  setPasswordFromArg('input', 'alpha999');
  const again = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  assert.equal(again.cookieSecret, cfg.cookieSecret);
  assert.ok(verifyPassword('alpha999', again.inputPasswordHash));
  assert.ok(!verifyPassword('alpha123', again.inputPasswordHash));
  assert.deepEqual(Object.keys(again).sort(), ['adminPasswordHash', 'chromePath', 'cookieSecret', 'inputPasswordHash', 'port']);

  assert.throws(() => setPasswordFromArg('nope', 'x'), /usage: --setpw/);
  assert.throws(() => setPasswordFromArg('input', ''), /usage: --setpw/);
  assert.ok(existsSync(join(dir, 'config.json')));
});
