@echo off
chcp 65001 >nul
setlocal
REM backup\ 에서 고른 백업으로 data\ 의 DB와 실행파일을 되돌린다.
REM 되돌리기 전에 지금 상태를 backup\<시각>-before-restore\ 로 먼저 백업하므로 복구도 되돌릴 수 있다.
cd /d "%~dp0"

tasklist /fi "imagename eq church_check.exe" | find /i "church_check.exe" >nul
if not errorlevel 1 (
  echo [중단] 서버가 실행 중입니다. 서버 창을 닫은 뒤 다시 실행하세요.
  goto :fail
)
if not exist "backup\" (
  echo [중단] backup 폴더가 없습니다. 먼저 백업.bat 으로 백업을 만드세요.
  goto :fail
)

echo 백업 목록 ^(최근 것이 위^):
dir /b /ad /o-n backup
echo.
set "PICK="
set /p "PICK=복구할 백업 이름 (엔터 = 가장 최근): "
if not defined PICK for /f "delims=" %%d in ('dir /b /ad /o-n backup') do if not defined PICK set "PICK=%%d"
set "SRC=backup\%PICK%"
if not exist "%SRC%\data\church.db" (
  echo [중단] %SRC%\data\church.db 가 없습니다.
  goto :fail
)

set "OK="
set /p "OK=%SRC% 로 되돌립니다. 계속할까요? (y/N): "
if /i not "%OK%"=="y" (
  echo 취소했습니다.
  goto :fail
)

if exist "data\church.db" (
  call "%~dp0백업.bat" auto -before-restore || (
    echo [중단] 지금 상태를 먼저 백업하지 못해 복구하지 않았습니다.
    goto :fail
  )
)

REM 백업에 없는 -wal/-shm 이 남으면 옛 DB에 새 로그가 덧씌워지므로 먼저 지운다.
if not exist "data\" mkdir "data"
for %%f in (church.db church.db-wal church.db-shm) do if exist "data\%%f" del /q "data\%%f"
for %%f in (church.db church.db-wal church.db-shm) do (
  if exist "%SRC%\data\%%f" copy /y "%SRC%\data\%%f" "data\" >nul || goto :broken
)
if exist "%SRC%\church_check.exe" copy /y "%SRC%\church_check.exe" "." >nul || goto :broken

for %%f in (data\church.db data\church.db-wal data\church.db-shm church_check.exe) do (
  if exist "%SRC%\%%f" fc /b "%SRC%\%%f" "%%f" >nul || goto :broken
)

echo 복구 완료: %SRC%
echo 이제 서버실행.bat 으로 서버를 켜세요.
pause
exit /b 0

:broken
echo [실패] 복구 중 파일 복사가 어긋났습니다. backup 폴더의 *-before-restore 백업으로 다시 복구하세요.
:fail
pause
exit /b 1
