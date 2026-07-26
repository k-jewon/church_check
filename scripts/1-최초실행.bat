@echo off
chcp 65001 >nul
REM 최초 1회: 의존성 설치 + 설정 파일 생성 + 입력용/관리자 암호 설정
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

echo 3) 암호 설정 — 로그인 화면에 칠 값을 직접 정하세요.
set /p input_pw=   입력용 암호:
call npm run setpw -- input "%input_pw%"
set /p admin_pw=   관리자 암호:
call npm run setpw -- admin "%admin_pw%"

echo.
echo 완료! 이제 2-서버실행.bat 을 더블클릭하세요.
pause
