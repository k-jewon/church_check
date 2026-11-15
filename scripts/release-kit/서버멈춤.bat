@echo off
chcp 65001 >nul
REM 콘솔 창 없이 켜진 서버를 멈춘다. 업데이트.bat 은 서버가 멈춰 있어야 파일을 교체할 수 있다.
cd /d "%~dp0"

tasklist /fi "imagename eq church_check.exe" | find /i "church_check.exe" >nul
if errorlevel 1 (
  echo 서버는 실행 중이 아닙니다.
  pause
  exit /b 0
)

REM /t 로 터널 자식(cloudflared.exe)까지 함께 멈춘다.
taskkill /im church_check.exe /t /f >nul
if errorlevel 1 (
  echo [중단] 서버 프로세스를 멈추지 못했습니다. 작업 관리자로 확인하세요.
  pause
  exit /b 1
)

echo 서버를 멈췄습니다. 시작 메뉴의 church_check 열기 로 다시 켜면 됩니다.
pause
exit /b 0
