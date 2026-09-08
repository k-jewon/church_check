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
  writeFileSync(resolve(out, launcher), startBat);
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

console.log('[+] cleaning intermediates...');
rmSync(work, { recursive: true, force: true });

const binName = isWin ? 'church_check.exe' : 'church_check';
const cfName = isWin ? 'cloudflared.exe' : 'cloudflared';
const cfPart = existsSync(resolve(out, cfName)) ? ` · ${cfName}` : '';
console.log(`\nDone. Release folder: ${out}`);
console.log(`  ${binName} · ${launcher} · public/ · template/ · config.example.json${cfPart}`);
console.log(`Hand this folder over as-is; the user runs ${launcher}.`);
console.log('First run: the app prompts for input/admin passwords and writes config.json.');

// If this release folder was ever used to run the server, it now holds real
// passwords and attendance data. Warn loudly — copying it would leak both.
const leaks = ['config.json', 'data'].filter((f) => existsSync(resolve(out, f)));
if (leaks.length) {
  console.warn(`\n[경고] release 폴더에 ${leaks.join(' / ')} 가 있습니다 (이 폴더에서 서버를 실행한 적이 있음).`);
  console.warn('       암호·출석 데이터가 들어 있으니 그대로 배포하지 마세요. 지우고 다시 빌드하세요.');
}
