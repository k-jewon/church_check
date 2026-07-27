// First-run interactive setup: make sure config.json holds both passwords.
// Runs before config.js/db load, so it depends only on node built-ins + the
// password hasher — never on config.js.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface, type Interface } from 'node:readline';
import { hashPassword } from '../util/password.js';

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

interface RawConfig {
  port?: number;
  cookieSecret?: string;
  chromePath?: string | null;
  inputPasswordHash?: string;
  adminPasswordHash?: string;
}

export async function ensureConfig(): Promise<void> {
  const cfg: RawConfig = existsSync(CONFIG_PATH)
    ? (JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as RawConfig)
    : {};

  const needInput = !cfg.inputPasswordHash;
  const needAdmin = !cfg.adminPasswordHash;
  if (!needInput && !needAdmin) return;

  console.log('\n=== 최초 설정: 로그인 암호를 만듭니다 ===');
  console.log('입력한 글자는 화면에 보이지 않습니다. 나중에 바꾸려면 config.json 을 지우고 다시 실행하세요.\n');

  // One interface for the whole session — a fresh one per question drops
  // buffered stdin (breaks piped input) and can hang on EOF.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (needInput) cfg.inputPasswordHash = hashPassword(await promptPassword(rl, '입력용 암호 (출석 입력자용): '));
    if (needAdmin) cfg.adminPasswordHash = hashPassword(await promptPassword(rl, '관리자 암호 (관리 화면용): '));
  } finally {
    rl.close();
  }

  if (!cfg.cookieSecret || cfg.cookieSecret === 'change-me-to-a-long-random-string') {
    cfg.cookieSecret = randomBytes(32).toString('hex');
  }
  if (cfg.port == null) cfg.port = 3000;
  if (cfg.chromePath === undefined) cfg.chromePath = null;

  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log('\n암호를 저장했습니다 (config.json).\n');
}

async function promptPassword(rl: Interface, label: string): Promise<string> {
  for (;;) {
    const pw = await askHidden(rl, label);
    if (pw) return pw;
    console.log('빈 값은 사용할 수 없습니다. 다시 입력하세요.');
  }
}

// Read one line without echoing what the user types.
function askHidden(rl: Interface, query: string): Promise<string> {
  return new Promise((resolvePw) => {
    // Mute the echo: only let the prompt itself through, swallow typed chars.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (s.includes(query)) process.stdout.write(s);
    };
    rl.question(query, (answer) => {
      process.stdout.write('\n');
      resolvePw(answer.trim());
    });
  });
}
