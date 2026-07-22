// Set input/admin passwords into config.json (creates it from example if missing).
// Usage: npm run setpw -- <input|admin> <password>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../util/password.js';

const CONFIG_PATH = resolve(process.cwd(), 'config.json');
const EXAMPLE_PATH = resolve(process.cwd(), 'config.example.json');

const [which, password] = process.argv.slice(2);
if ((which !== 'input' && which !== 'admin') || !password) {
  console.error('Usage: npm run setpw -- <input|admin> <password>');
  process.exit(1);
}

const base = existsSync(CONFIG_PATH) ? CONFIG_PATH : EXAMPLE_PATH;
const cfg = JSON.parse(readFileSync(base, 'utf8')) as Record<string, unknown>;

if (!cfg.cookieSecret || cfg.cookieSecret === 'change-me-to-a-long-random-string') {
  cfg.cookieSecret = randomBytes(32).toString('hex');
}
cfg[which === 'input' ? 'inputPasswordHash' : 'adminPasswordHash'] = hashPassword(password);

writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log(`Set ${which} password in config.json`);
