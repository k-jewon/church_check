@echo off
chcp 65001 >nul
REM 서버 실행 (파일 변경 시 자동 재시작). 이 창을 닫거나 Ctrl+C 하면 종료됩니다.
cd /d "%~dp0.."

echo 서버 시작 : http://localhost:3000
echo (이 창을 닫거나 Ctrl+C 를 누르면 서버가 종료됩니다)
echo.
call npm run dev
