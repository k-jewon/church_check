// Build a single-file executable via Node SEA. Runs on the OS it is built on:
// Windows (.exe, PE signature stripped) or macOS (Mach-O, ad-hoc re-signed).
// SEA cannot cross-compile — build on Windows for Windows, on macOS for macOS.
// Chromium is NOT bundled — the app uses the system Chrome/Edge at runtime.
// Assets (public/, template/, config.json) ship alongside the binary, not inside it.
//
// Folders: build/ holds throwaway intermediates (deleted at the end), release/ is
// the folder handed to the user. dist/ is left to `npm run build` (tsc output) so
// the two never mix — a release folder must contain nothing but the distributable.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, cpSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Remove the Authenticode signature from a copied node.exe so postject can find
// the SEA fuse sentinel (Windows-signed binaries otherwise block injection, and
// signtool is not available here). Zeroes the Certificate Table data directory
// entry and truncates the trailing signature blob.
function stripPeSignature(file) {
  const buf = readFileSync(file);
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error('not a PE file');
  const optStart = peOff + 24; // 4-byte PE sig + 20-byte COFF header
  const magic = buf.readUInt16LE(optStart);
  const dirStart = optStart + (magic === 0x20b ? 112 : 96); // PE32+ vs PE32
  const secEntry = dirStart + 4 * 8; // data directory index 4 = Security
  const certOff = buf.readUInt32LE(secEntry);
  const certSize = buf.readUInt32LE(secEntry + 4);
  if (!certOff || !certSize) {
    console.log('   (no signature present)');
    return;
  }
  buf.writeUInt32LE(0, secEntry);
  buf.writeUInt32LE(0, secEntry + 4);
  writeFileSync(file, buf.subarray(0, certOff));
  console.log(`   stripped signature (${certSize} bytes)`);
}

// cloudflared is a standalone Apache-2.0 binary; ship it next to the exe so the
// phone-access tunnel works with no extra setup on the target PC. Windows serves
// a bare .exe, macOS a .tgz. Downloads are cached in .cache/ so a rebuilt release
// folder does not re-fetch 50+ MB. A download failure is not fatal — the app falls
// back to local-only access and tells the user how to add cloudflared later.
async function fetchCloudflared() {
  const name = isWin ? 'cloudflared.exe' : 'cloudflared';
  const cached = resolve(cache, name);
  if (!existsSync(cached)) {
    const asset = isWin
      ? 'cloudflared-windows-amd64.exe'
      : `cloudflared-darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`;
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (isWin) {
        writeFileSync(cached, body);
      } else {
        const tgz = resolve(cache, asset);
        writeFileSync(tgz, body);
        execFileSync('tar', ['-xzf', tgz, '-C', cache], { stdio: 'inherit' });
        rmSync(tgz);
      }
      console.log(`   downloaded ${asset} (${(body.length / 1048576).toFixed(1)} MB)`);
    } catch (err) {
      console.warn(`   [warn] cloudflared download failed (${err.message}).`);
      console.warn('   [warn] 배포 폴더에 cloudflared 가 빠집니다. 폰 외부 접속(QR)을 쓰려면');
      console.warn('   [warn] https://github.com/cloudflare/cloudflared/releases 에서 내려받아');
      console.warn(`   [warn] ${name} 이름으로 실행파일 옆에 두세요.`);
      return;
    }
  } else {
    console.log('   using cached copy (.cache/)');
  }
  copyFileSync(cached, resolve(out, name));
  if (!isWin) chmodSync(resolve(out, name), 0o755);
}

const isWin = process.platform === 'win32';
if (!isWin && process.platform !== 'darwin') {
  throw new Error(`Unsupported build OS: ${process.platform}. Build on Windows or macOS.`);
}

const root = process.cwd();
const work = resolve(root, 'build');
const out = resolve(root, 'release');
const cache = resolve(root, '.cache');
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
mkdirSync(cache, { recursive: true });

console.log('[1/5] bundling with esbuild...');
await esbuild.build({
  entryPoints: [resolve(root, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: resolve(work, 'app.cjs'),
  // ws optional native speedups — not needed, keep them external.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});

console.log('[2/5] writing sea-config.json...');
writeFileSync(
  resolve(work, 'sea-config.json'),
  JSON.stringify({ main: 'build/app.cjs', output: 'build/sea-prep.blob', disableExperimentalSEAWarning: true }),
);

console.log('[3/5] generating SEA blob...');
execFileSync(process.execPath, ['--experimental-sea-config', 'build/sea-config.json'], { stdio: 'inherit' });

console.log('[4/5] copying node runtime...');
const exeOut = resolve(out, isWin ? 'church_check.exe' : 'church_check');
if (!isWin) {
  // macOS node is usually a universal (fat) binary; postject needs a single-arch
  // Mach-O or the fuse sentinel appears once per slice ("multiple occurrences").
  // Thin to the host arch — the resulting binary runs on that arch only.
  const macArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const archs = execFileSync('lipo', ['-archs', process.execPath]).toString().trim().split(/\s+/);
  if (archs.length > 1) {
    execFileSync('lipo', [process.execPath, '-thin', macArch, '-output', exeOut]);
    console.log(`   thinned universal binary to ${macArch}`);
  } else {
    copyFileSync(process.execPath, exeOut);
  }
} else {
  copyFileSync(process.execPath, exeOut);
}

// The fuse sentinel is build-specific — read it out of this node binary
// (it survives both PE signature stripping and macOS codesign).
const fuse = readFileSync(exeOut).toString('latin1').match(/NODE_SEA_FUSE_[0-9a-f]{32}/)?.[0];
if (!fuse) throw new Error('SEA fuse sentinel not found in the node binary');
const postjectArgs = [
  resolve(root, 'node_modules/postject/dist/cli.js'),
  exeOut,
  'NODE_SEA_BLOB',
  'build/sea-prep.blob',
  '--sentinel-fuse',
  fuse,
];

console.log('[5/5] injecting blob with postject...');
if (isWin) {
  // Windows: strip the Authenticode signature so postject can inject, then inject.
  stripPeSignature(exeOut);
  execFileSync(process.execPath, postjectArgs, { stdio: 'inherit' });
} else {
  // macOS: remove signature → inject into a Mach-O segment → ad-hoc re-sign.
  // An unsigned Mach-O will not launch on modern macOS.
  execFileSync('codesign', ['--remove-signature', exeOut], { stdio: 'inherit' });
  execFileSync(process.execPath, [...postjectArgs, '--macho-segment-name', 'NODE_SEA'], { stdio: 'inherit' });
  chmodSync(exeOut, 0o755);
  execFileSync('codesign', ['--sign', '-', exeOut], { stdio: 'inherit' });
}

console.log('[+] fetching cloudflared...');
await fetchCloudflared();

console.log('[+] assembling release folder...');
cpSync(resolve(root, 'public'), resolve(out, 'public'), { recursive: true });
cpSync(resolve(root, 'template'), resolve(out, 'template'), { recursive: true });
copyFileSync(resolve(root, 'config.example.json'), resolve(out, 'config.example.json'));

const launcher = isWin ? '서버실행.bat' : '서버실행.command';
if (isWin) {
  const startBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo church_check 서버를 시작합니다...
echo  - 최초 실행이면 입력용/관리자 암호를 물어봅니다.
echo  - 폰 접속용 QR이 아래에 표시됩니다.
echo  - 종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.
church_check.exe
echo.
echo 서버가 종료되었습니다.
pause
`;
  // cmd 배치는 CRLF가 필수: LF만 있으면 한글 줄이 줄 경계로 안 갈려 명령으로 오해된다
  // ('...' is not recognized). macOS .command는 LF 유지.
  writeFileSync(resolve(out, launcher), startBat.replace(/\n/g, '\r\n'));
  // 서버를 끈 채 DB와 실행파일을 backup/ 에 담고 되돌린다. 스키마는 마이그레이션.bat 으로만 올린다.
  // release-kit 배치는 CRLF 필수(LF면 cmd가 한글 줄을 명령으로 오해한다). 복사할 때 정규화한다.
  for (const f of ['백업.bat', '복구.bat', '마이그레이션.bat', '업데이트.bat', '업데이트.ps1', '서버시작.vbs', '서버멈춤.bat']) {
    const src = resolve(root, 'scripts', 'release-kit', f);
    writeFileSync(resolve(out, f), readFileSync(src, 'utf8').replace(/\r?\n/g, '\r\n'));
  }
} else {
  const startCommand = `#!/bin/bash
cd "$(dirname "$0")"
# 다운로드로 받았을 때 붙는 Gatekeeper 격리 속성 해제(있으면)
xattr -dr com.apple.quarantine "./church_check" "./cloudflared" 2>/dev/null
echo "church_check 서버를 시작합니다..."
echo "  - 최초 실행이면 입력용/관리자 암호를 물어봅니다."
echo "  - 폰 접속용 QR이 아래에 표시됩니다."
echo "  - 종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요."
echo ""
"./church_check"
echo ""
echo "서버가 종료되었습니다."
read -n1 -rp "아무 키나 누르면 창이 닫힙니다..."
`;
  const startPath = resolve(out, launcher);
  writeFileSync(startPath, startCommand);
  chmodSync(startPath, 0o755);
}

// If this release folder was ever used to run the server, it now holds real
// passwords and attendance data (backups included). Never wrap that into a distributable zip.
const leaks = ['config.json', 'data', 'backup'].filter((f) => existsSync(resolve(out, f)));

console.log('[+] packaging zip...');
const zipPath = leaks.length ? null : packageZip();

console.log('[+] bundling electron shell...');
const hasElectron = isWin ? bundleElectronShell() : false;

console.log('[+] building installer...');
const setupPath = isWin ? buildInstaller() : null;
if (!isWin) console.log('   macOS용 setup 은 macOS 에서 빌드하세요 (SEA 크로스 컴파일 불가).');

console.log('[+] cleaning intermediates...');
rmSync(work, { recursive: true, force: true });

// Zip the release folder for GitHub Releases. Staged under a versioned folder
// name so extracting anywhere yields one tidy folder instead of loose files.
// Uses the OS archiver (PowerShell on Windows, zip on macOS) — no dependency.
function packageZip() {
  const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const target = isWin ? 'win' : `mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
  const pkgName = `church_check-${version}-${target}`;
  const stage = resolve(work, pkgName);
  const zip = resolve(root, `${pkgName}.zip`);
  cpSync(out, stage, { recursive: true });
  // electron/ 은 zip에서 제외한다: 운영 창 실행파일은 창이 살아 있는 동안 잠겨 있어 교체가 안 된다.
  // 창 코드(shell/ )는 zip에 넣는다 — 재시작하면 새 코드가 적용된다. Electron 버전 변경은 setup.exe 재설치.
  cpSync(resolve(root, 'shell'), resolve(stage, 'shell'), { recursive: true });
  rmSync(resolve(stage, 'electron'), { recursive: true, force: true });
  rmSync(zip, { force: true });
  if (isWin) {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stage}' -DestinationPath '${zip}'`,
    ]);
  } else {
    // -y keeps symlinks as symlinks; run from work/ so the archive root is pkgName.
    execFileSync('zip', ['-rqy', zip, pkgName], { cwd: work });
  }
  const mb = (readFileSync(zip).length / 1048576).toFixed(1);
  console.log(`   ${pkgName}.zip (${mb} MB)`);
  return zip;
}

// Electron 운영 창 껍질을 release 폴더에 동봉한다. zip에는 electron을 넣지 않는다 — packageZip이
// stage에서 electron/ 을 지운다(이전 빌드의 잔여가 release/ 에 남아 있어도 제외된다).
// shortcut: electron 미동봉 시 setup.exe는 서버시작.vbs 런처로 폴백 (installer.nsi의 HAS_ELECTRON)
function bundleElectronShell() {
  const dist = resolve(root, 'node_modules', 'electron', 'dist');
  const has = existsSync(resolve(dist, 'electron.exe'));
  if (has) {
    cpSync(dist, resolve(out, 'electron'), { recursive: true });
    console.log('   electron/ 동봉 (운영 창)');
  } else {
    console.warn('   [warn] node_modules/electron/dist/electron.exe 를 찾지 못했습니다 — 운영 창 없이 vbs 런처로 폴백합니다.');
    console.warn('   [warn] npm install 한 번(electron devDependency) 하면 다음 빌드부터 운영 창이 설치됩니다.');
  }
  cpSync(resolve(root, 'shell'), resolve(out, 'shell'), { recursive: true });
  return has;
}

// Inno Setup 설치 마법사: release 폴더를 %LOCALAPPDATA%\church_check 에 까는 setup.exe.
// 대상 PC에서는 node·npm이 필요 없다(exe에 SEA 런타임 내장). 빌드 머신에 Inno Setup이
// 없으면 setup.exe를 만들지 않고 zip만 둔다.
// shortcut: ISCC가 있는 빌드 머신에서만 setup.exe, 없는 경우 zip 배포로 대체
function buildInstaller() {
  const iscc = findIscc();
  if (!iscc) {
    console.warn('   [warn] Inno Setup(ISCC.exe) 을 찾지 못했습니다 — setup.exe 를 만들지 않았습니다.');
    console.warn('   [warn] winget install --id JRSoftware.InnoSetup 한 번 설치하면 다음 빌드부터 만들어집니다.');
    return null;
  }
  const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  // HAS_ELECTRON이 시작 메뉴·설치 직후 런처를 electron 운영 창으로 고른다(없으면 기존 vbs).
  execFileSync(iscc, ['/DAPP_VERSION=' + version, ...(hasElectron ? ['/DHAS_ELECTRON=1'] : []), 'installer.nsi'], {
    stdio: 'inherit',
  });
  const setup = resolve(root, `church_check-${version}-win-setup.exe`);
  if (!existsSync(setup)) throw new Error(`installer compile finished but ${setup} is missing`);
  console.log(`   church_check-${version}-win-setup.exe (${(readFileSync(setup).length / 1048576).toFixed(1)} MB)`);
  return setup;
}

function findIscc() {
  // winget 은 사용자 설치로 %LOCALAPPDATA%\Programs 에 넣는다 — 신규 셸 PATH 갱신 전에도 찾는다.
  const known = [
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe') : null,
  ];
  const found = known.find((p) => p && existsSync(p));
  if (found) return found;
  try {
    return execFileSync('cmd.exe', ['/c', 'where', 'ISCC.exe'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .split('\n')[0];
  } catch {
    return null;
  }
}

const binName = isWin ? 'church_check.exe' : 'church_check';
const cfName = isWin ? 'cloudflared.exe' : 'cloudflared';
const cfPart = existsSync(resolve(out, cfName)) ? ` · ${cfName}` : '';
console.log(`\nDone. Release folder: ${out}`);
console.log(`  ${binName} · ${launcher} · public/ · template/ · config.example.json${cfPart}`);
console.log(`Hand this folder over as-is; the user runs ${launcher}.`);
if (zipPath) console.log(`Or upload the zip: gh release create v${JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version} "${zipPath}"`);
if (setupPath) console.log(`Or upload the installer: gh release upload v<버전> "${setupPath}" — 비개발자는 setup.exe 하나로 설치 끝(node·npm 설치 불필요)`);
console.log('First run: the app prompts for input/admin passwords and writes config.json.');

if (leaks.length) {
  console.warn(`\n[경고] release 폴더에 ${leaks.join(' / ')} 가 있습니다 (이 폴더에서 서버를 실행한 적이 있음).`);
  console.warn('       암호·출석 데이터가 들어 있으니 그대로 배포하지 마세요. 지우고 다시 빌드하세요.');
  console.warn('       (배포용 zip 은 만들지 않았습니다.)');
}
