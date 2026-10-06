@echo off
chcp 65001 >nul
setlocal
REM 서버를 끈 상태에서 data\ 의 DB와 지금 실행파일을 backup\<시각>\ 에 복사한다.
REM 실행파일까지 담는 까닭: 새 버전은 첫 실행 때 DB 스키마를 올리므로, 옛 DB는 옛 실행파일로
REM 열어야 그대로 돌아온다. 복구는 복구.bat 이 한다.
REM 인자: 첫째가 auto 면 멈추지 않는다(복구.bat 이 부른다). 둘째는 폴더 이름 뒤에 붙는다.
cd /d "%~dp0"

tasklist /fi "imagename eq church_check.exe" | find /i "church_check.exe" >nul
if not errorlevel 1 (
  echo [중단] 서버가 실행 중입니다. 서버 창을 닫은 뒤 다시 실행하세요.
  goto :fail
)
if not exist "data\church.db" (
  echo [중단] data\church.db 가 없습니다. 이 파일을 church_check.exe 옆에서 실행하세요.
  goto :fail
)

set "STAMP="
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%t"
if not defined STAMP (
  echo [중단] 현재 시각을 읽지 못했습니다.
  goto :fail
)
set "NAME=%STAMP%%~2"
set "DEST=backup\%NAME%"
mkdir "%DEST%\data" || goto :fail

for %%f in (church.db church.db-wal church.db-shm) do (
  if exist "data\%%f" copy /y "data\%%f" "%DEST%\data\" >nul || goto :fail
)
if exist "church_check.exe" copy /y "church_check.exe" "%DEST%\" >nul || goto :fail

REM 복사본이 원본과 바이트 단위로 같은지 확인한다.
for %%f in (data\church.db data\church.db-wal data\church.db-shm church_check.exe) do (
  if exist "%%f" fc /b "%%f" "%DEST%\%%f" >nul || (
    echo [실패] 복사본이 원본과 다릅니다: %DEST%\%%f
    goto :fail
  )
)

echo 백업 완료: %DEST%
if /i not "%~1"=="auto" pause
exit /b 0

:fail
if /i not "%~1"=="auto" pause
exit /b 1
