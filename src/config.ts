import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AppConfig {
  port: number;
  cookieSecret: string;
  chromePath: string | null;
  inputPasswordHash: string;
  adminPasswordHash: string;
}

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      'config.json not found. Copy config.example.json to config.json and set passwords with: npm run setpw',
    );
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<AppConfig>;
  return {
    port: raw.port ?? 3000,
    cookieSecret: raw.cookieSecret ?? '',
    chromePath: raw.chromePath ?? null,
    inputPasswordHash: raw.inputPasswordHash ?? '',
    adminPasswordHash: raw.adminPasswordHash ?? '',
  };
}

export const config = loadConfig();

// Locate an installed Chromium-based browser (Edge ships with Windows).
const WINDOWS_BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

export function resolveChromePath(): string {
  if (config.chromePath && existsSync(config.chromePath)) return config.chromePath;
  const found = WINDOWS_BROWSER_PATHS.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      'No Chrome/Edge found. Install Chrome or set "chromePath" in config.json.',
    );
  }
  return found;
}
