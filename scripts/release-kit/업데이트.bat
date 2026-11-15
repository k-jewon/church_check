@echo off
chcp 65001 >nul
REM 최신 GitHub 릴리스 zip 을 받아 설치 폴더의 실행파일·자산을 교체한다.
REM zip 에는 config.json·data 가 들어 있지 않으므로(빌드가 막는다) 암호와 출석 데이터는 그대로 남는다.
REM 실제 로직은 같은 폴더의 업데이트.ps1 — cmd 배치 줄 길이 제한(1024자)에 임베디드 PowerShell 은 잘린다.
REM 인자: 로컬 zip 경로를 주면 그 파일로 교체한다(오프라인 확인·시험용).
REM 실행 중인 실행파일은 교체할 수 없다 — 먼저 서버 창을 닫고 실행하세요.
cd /d "%~dp0"

tasklist /fi "imagename eq church_check.exe" | find /i "church_check.exe" >nul
if not errorlevel 1 (
  echo [중단] 서버가 실행 중입니다. 서버 창을 닫은 뒤 다시 실행하세요.
  goto :eof
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0업데이트.ps1" %1
if errorlevel 2 echo 교체할 새 릴리스가 없습니다. 지금은 최신입니다.
if errorlevel 2 goto :eof
if errorlevel 1 echo 업데이트에 실패했습니다. 네트워크 확인 후 다시 실행하세요.
if errorlevel 1 goto :eof
echo 업데이트가 완료되었습니다.
pause
