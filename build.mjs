// Build a single Windows executable via Node SEA.
// Chromium is NOT bundled — the app uses the system Chrome/Edge at runtime.
// Assets (public/, template/, config.json) ship alongside the exe, not inside it.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
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

const root = process.cwd();
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });

console.log('[1/5] bundling with esbuild...');
await esbuild.build({
  entryPoints: [resolve(root, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: resolve(dist, 'app.cjs'),
  // ws optional native speedups — not needed, keep them external.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});

console.log('[2/5] writing sea-config.json...');
writeFileSync(
  resolve(dist, 'sea-config.json'),
  JSON.stringify({ main: 'dist/app.cjs', output: 'dist/sea-prep.blob', disableExperimentalSEAWarning: true }),
);

console.log('[3/5] generating SEA blob...');
execFileSync(process.execPath, ['--experimental-sea-config', 'dist/sea-config.json'], { stdio: 'inherit' });

console.log('[4/5] copying node runtime + stripping signature...');
const exeOut = resolve(dist, 'church_check.exe');
copyFileSync(process.execPath, exeOut);
stripPeSignature(exeOut);

console.log('[5/5] injecting blob with postject...');
// The fuse sentinel is build-specific — read it out of this node binary.
const fuse = readFileSync(exeOut).toString('latin1').match(/NODE_SEA_FUSE_[0-9a-f]{32}/)?.[0];
if (!fuse) throw new Error('SEA fuse sentinel not found in the node binary');
execFileSync(
  process.execPath,
  [
    resolve(root, 'node_modules/postject/dist/cli.js'),
    exeOut,
    'NODE_SEA_BLOB',
    'dist/sea-prep.blob',
    '--sentinel-fuse',
    fuse,
  ],
  { stdio: 'inherit' },
);

console.log('[+] assembling distributable folder...');
cpSync(resolve(root, 'public'), resolve(dist, 'public'), { recursive: true });
cpSync(resolve(root, 'template'), resolve(dist, 'template'), { recursive: true });
copyFileSync(resolve(root, 'config.example.json'), resolve(dist, 'config.example.json'));

const startBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist config.json (
  echo [최초 실행] config.json 이 없습니다. config.example.json 을 복사한 뒤
  echo 암호를 설정해야 합니다. README 를 참고하세요.
  pause
  exit /b
)
echo church_check 서버를 시작합니다...
start "church_check" church_check.exe
timeout /t 2 >nul
echo.
echo  서버:  http://localhost:3000
echo  외부(폰) 접속용 터널을 열려면 새 창에서:
echo     cloudflared tunnel --url http://localhost:3000
echo.
echo  이 창을 닫아도 서버는 계속 실행됩니다. 종료하려면 작업 관리자에서 church_check.exe 를 끝내세요.
pause
`;
writeFileSync(resolve(dist, 'start.bat'), startBat);

console.log(`\nDone. Distributable folder: ${dist}`);
console.log('  church_check.exe · start.bat · public/ · template/ · config.example.json');
console.log('First run: copy config.example.json to config.json and set passwords.');
