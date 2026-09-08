@echo off
chcp 65001 >nul
REM 최초 1회: 의존성 설치 + 설정 파일 생성 + cloudflared 설치 + 입력용/관리자 암호 설정
cd /d "%~dp0.."

echo === church_check 최초 실행 ===
echo 1) 의존성 설치
call npm install || (echo npm install 실패 & pause & exit /b 1)

if not exist config.json (
  copy config.example.json config.json >nul
  echo 2^) config.json 생성됨
) else (
  echo 2^) config.json 이미 있음 ^(건너뜀^)
)

if exist cloudflared.exe (
  echo 3^) cloudflared 이미 있음 ^(건너뜀^)
) else (
  echo 3^) cloudflared 내려받기 ^(폰 외부 접속용, 약 55MB^)
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = 'Tls12'; try { Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe' -UseBasicParsing } catch { exit 1 }"
  if errorlevel 1 (
    if exist cloudflared.exe del cloudflared.exe
    echo    [경고] 다운로드 실패 — 로컬 접속만 가능합니다.
    echo    [경고] https://github.com/cloudflare/cloudflared/releases 에서 받아
    echo    [경고] cloudflared.exe 로 프로젝트 폴더에 두면 됩니다.
  )
)

echo 4) 암호 설정 — 로그인 화면에 칠 값을 직접 정하세요.
set /p input_pw=   입력용 암호:
call npm run setpw -- input "%input_pw%"
set /p admin_pw=   관리자 암호:
call npm run setpw -- admin "%admin_pw%"

echo.
echo 완료! 이제 2-서버실행.bat 을 더블클릭하세요.
pause
