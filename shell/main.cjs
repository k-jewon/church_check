// Electron 운영 창 껍질. 서버 코드는 실행하지 않는다 — 배포 폴더의 church_check.exe를
// 자식 프로세스로 시작/멈춤하고, --setpw와 업데이트.ps1만 같은 폴더에서 호출한다.
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const isWin = process.platform === 'win32';
// 설치 폴더({app}) = shell의 상위 폴더. electron.exe는 {app}\electron, appPath는 {app}\shell.
const dir = process.env.CHURCH_DIR || path.resolve(__dirname, '..');
const exe = isWin ? 'church_check.exe' : './church_check';
let server = null;
let pageWin = null;

function readPort() {
  // config.json이 없거나 깨져도 3000 — 서버가 스스로 정하는 기본값과 같다.
  try {
    return JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8')).port || 3000;
  } catch {
    return 3000;
  }
}

function statusText() {
  return server ? `서버 실행 중 (포트 ${readPort()})` : '서버 정지';
}

function start() {
  if (server) return '서버는 이미 실행 중입니다.';
  if (!existsSync(path.join(dir, exe))) return `[중단] ${exe} 을 찾을 수 없습니다: ${dir}`;
  // windowsHide: 콘솔 창을 열지 않는다. stdio ignore — 서버 출력(QR)은 관리자 화면 /admin/tunnel 에 있다.
  server = spawn(exe, [], { cwd: dir, stdio: 'ignore', windowsHide: true });
  server.on('exit', () => {
    server = null;
  });
  return `서버를 시작했습니다 (포트 ${readPort()}).`;
}

function stop() {
  if (!server) return '서버는 실행 중이 아닙니다.';
  const pid = server.pid;
  server = null;
  // Windows는 /T로 터널 자식(cloudflared.exe)까지 함께 죽인다. macOS는 프로세스 이름으로 정리한다.
  if (isWin) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    spawnSync('kill', [String(pid)]);
    spawnSync('pkill', ['-f', 'cloudflared']);
  }
  return '서버를 멈췄습니다.';
}

function setPassword(which, pw) {
  if (which !== 'input' && which !== 'admin') return '[중단] which는 input 또는 admin 이어야 합니다.';
  if (!pw) return '[중단] 암호를 입력하세요.';
  // 마법사와 같은 제약: 따옴표는 인자 전달에서 다시 해석된다.
  if (pw.includes('"')) return '[중단] 암호에 따옴표(")는 쓸 수 없습니다.';
  stop();
  const r = spawnSync(exe, ['--setpw', which, pw], { cwd: dir, windowsHide: true, encoding: 'utf8' });
  if (r.error) return `[중단] ${exe} 실행 실패: ${r.error.message}`;
  const cfg = existsSync(path.join(dir, 'config.json'));
  // 암호 글자는 남기지 않는다 — 길이만 표시한다.
  if (r.status === 0 && cfg) return `${which} 암호를 config.json 에 저장했습니다 (${pw.length}자).`;
  return `[중단] ${which} 암호 저장 실패: exit=${r.status}, config.json=${cfg ? '있음' : '없음'}`;
}

function update() {
  if (!isWin) return '[중단] 업데이트는 Windows 에서만 같습니다 (업데이트.ps1).';
  stop();
  if (!existsSync(path.join(dir, '업데이트.ps1'))) return `[중단] 업데이트.ps1 을 찾을 수 없습니다: ${dir}`;
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '업데이트.ps1'], {
    cwd: dir,
    windowsHide: true,
    encoding: 'utf8',
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.error) return `[중단] powershell 실행 실패: ${r.error.message}`;
  // 업데이트.ps1 exit code: 0=교체 완료, 2=릴리스 없음(최신), 그 외=실패
  if (r.status === 2) return '최신입니다 — 교체할 새 릴리스가 없습니다.';
  if (r.status === 0) return out.replace('Update done:', '업데이트 완료:') || '업데이트 완료';
  return `[중단] 업데이트 실패 (exit=${r.status})\n${out}`;
}

function openPage(pathname, title) {
  if (!server) return '[중단] 서버가 실행 중이 아닙니다. 먼저 서버를 시작하세요.';
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.loadURL(`http://localhost:${readPort()}${pathname}`);
  pageWin = win;
  return `${title} 화면을 열었습니다.`;
}

function openAttendance() {
  return openPage('/login', 'church_check 출석');
}

// 관리자 화면이라 로그인되지 않았으면 이 창에서 /login으로 이어진다. 터널 주소가 아직 없으면 서버가 준비 중이라고 안내한다.
function openTunnel() {
  return openPage('/admin/tunnel', 'church_check 폰 접속(QR)');
}

ipcMain.handle('control', (_event, action, arg) => {
  if (action === 'start') return start();
  if (action === 'stop') return stop();
  if (action === 'status') return statusText();
  if (action === 'update') return update();
  if (action === 'open') return openAttendance();
  if (action === 'qr') return openTunnel();
  if (action === 'setpw') return setPassword(arg?.which, arg?.pw);
  return '[중단] 알 수 없는 요청입니다.';
});

async function runSelfTest() {
  const port = readPort();
  start();
  for (let i = 0; i < 30; i++) {
    // 최대 15초 대기 — 서버가 포트 바인딩과 터널을 여는 데 걸리는 시간
    try {
      const res = await fetch(`http://localhost:${port}/login`, { signal: AbortSignal.timeout(2000) });
      if (res.status === 200) {
        console.log(`SELFTEST PASS ${port}`);
        stop();
        app.quit();
        process.exit(0);
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('SELFTEST FAIL');
  stop();
  process.exit(1);
}

if (process.env.CHURCH_SELFTEST === '1') {
  runSelfTest();
} else if (process.env.CHURCH_UI_CHECK === '1') {
  // GUI 렌더 검증: 창을 숨겨 열고 DOM 상태를 stdout으로 출력한다 (PrintWindow가 Chromium 내용을 못 담는다).
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 480, height: 460, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    win.loadFile(path.join(__dirname, 'control.html'));
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await new Promise((r) => setTimeout(r, 600));
    const out = await win.webContents.executeJavaScript(`
      const s = document.getElementById('status');
      const before = { status: s.textContent, pill: s.className, start: document.getElementById('start').disabled, stop: document.getElementById('stop').disabled, attendance: document.getElementById('attendance').disabled, qr: document.getElementById('qr').disabled, msg: document.getElementById('msg').textContent };
      s.textContent = '서버 실행 중 (포트 3000)'; paint();
      const after = { pill: s.className, start: document.getElementById('start').disabled, stop: document.getElementById('stop').disabled, attendance: document.getElementById('attendance').disabled, qr: document.getElementById('qr').disabled };
      JSON.stringify({ before, after });
    `);
    console.log('UICHECK ' + out);
    // QR 창 실물 경로: 서버를 실제로 켜고 폰 접속(QR) 창을 열어 어떤 화면이 뜨는지 확인한다.
    start();
    const port = readPort();
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://localhost:${port}/login`, { signal: AbortSignal.timeout(2000) });
        if (res.status === 200) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('QRMSG ' + openTunnel());
    await new Promise((r) => pageWin.webContents.once('did-finish-load', r));
    const qrPage = await pageWin.webContents.executeJavaScript(`JSON.stringify({ hasQr: !!document.querySelector('img[alt="접속 QR"]'), h1: document.querySelector('h1') ? document.querySelector('h1').textContent : '' })`);
    console.log('QRPAGE ' + pageWin.webContents.getURL() + ' ' + qrPage);
    stop();
    console.log('UPDATEMSG ' + update());
    app.quit();
  });
} else {
  app.whenReady().then(() => {
    const win = new BrowserWindow({
      width: 480,
      height: 460,
      minWidth: 420,
      title: 'church_check 운영',
      autoHideMenuBar: true,
      // 로컬 신뢰 파일이라 preload 없이 바로 node를 쓴다. 서버가 멈춰 있어도 이 창은 열려 있어야 한다.
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    win.loadFile(path.join(__dirname, 'control.html'));
    app.on('window-all-closed', () => app.quit());
  });
}
