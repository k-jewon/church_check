// Launch a cloudflared quick tunnel and expose its public URL. The URL is
// printed as a console QR and stored so the admin screen can show it too.
// cloudflared is NOT bundled: if it is missing we skip the tunnel and the app
// keeps serving locally.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

let tunnelUrl: string | null = null;
let warned = false;

export function getTunnelUrl(): string | null {
  return tunnelUrl;
}

// Prefer a cloudflared binary dropped next to the exe (easiest for non-technical
// users); otherwise fall back to one on PATH.
function findCloudflared(): string {
  const local = resolve(process.cwd(), process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  return existsSync(local) ? local : 'cloudflared';
}

export function startTunnel(port: number): void {
  let proc: ChildProcess;
  try {
    proc = spawn(findCloudflared(), ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    warnNoTunnel();
    return;
  }

  proc.on('error', warnNoTunnel); // ENOENT (cloudflared not installed) lands here

  // cloudflared prints the trycloudflare URL to stderr; scan both streams.
  const scan = (buf: Buffer): void => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m && !tunnelUrl) {
      tunnelUrl = m[0];
      void announce(tunnelUrl);
    }
  };
  proc.stdout?.on('data', scan);
  proc.stderr?.on('data', scan);

  process.on('exit', () => proc.kill());
}

async function announce(url: string): Promise<void> {
  let ascii = '';
  try {
    ascii = await QRCode.toString(url, { type: 'terminal', small: true });
  } catch {
    /* QR is a convenience; the URL text below is enough */
  }
  console.log('\n────────── 외부(폰) 접속 ──────────');
  console.log(url);
  if (ascii) console.log(ascii);
  console.log('관리자 화면 → "폰 접속(QR)" 에서도 볼 수 있습니다.');
  console.log('※ 이 주소는 서버를 끄면 사라집니다. 다시 켜면 새 주소가 생깁니다.\n');
}

function warnNoTunnel(): void {
  if (warned) return;
  warned = true;
  console.log('\n[알림] cloudflared 가 없어 외부 접속(터널)을 건너뜁니다.');
  console.log('       같은 Wi-Fi의 폰이라면 http://<이 PC의 IP>:<포트> 로 접속하세요.');
  console.log('       외부에서 접속하려면 cloudflared 를 설치한 뒤 다시 실행하세요.\n');
}
