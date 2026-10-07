@echo off
chcp 65001 >nul
setlocal
REM 데이터가 든 DB의 스키마를 올린다. 서버는 스키마가 낮은 DB로는 켜지지 않는다.
REM 먼저 백업.bat 으로 지금 DB와 실행파일을 남기고, 그다음 church_check.exe --migrate 가
REM 바뀔 내용(지울 데이터 건수 포함)을 보여 주고 '업데이트'를 입력받아야 올린다.
cd /d "%~dp0"

tasklist /fi "imagename eq church_check.exe" | find /i "church_check.exe" >nul
if not errorlevel 1 (
  echo [중단] 서버가 실행 중입니다. 서버 창을 닫은 뒤 다시 실행하세요.
  goto :fail
)
if not exist "church_check.exe" (
  echo [중단] church_check.exe 가 없습니다. 이 파일을 church_check.exe 옆에서 실행하세요.
  goto :fail
)
if not exist "data\church.db" (
  echo 올릴 DB가 없습니다. 첫 설치라면 서버실행.bat 으로 바로 켜면 DB가 만들어집니다.
  goto :fail
)

call "%~dp0백업.bat" auto -before-migrate || (
  echo [중단] 지금 DB를 백업하지 못해 마이그레이션하지 않았습니다.
  goto :fail
)

church_check.exe --migrate
if errorlevel 1 goto :fail

echo.
echo 이제 서버실행.bat 으로 서버를 켜세요.
pause
exit /b 0

:fail
pause
exit /b 1
