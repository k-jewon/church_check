@echo off
chcp 65001 >nul
REM 백그라운드/다른 창에서 도는 서버와 cloudflared 터널을 강제 종료
echo 서버(node/exe) 종료 중...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='church_check.exe'\" | Where-Object { $_.CommandLine -like '*church_check*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

echo cloudflared 터널 종료 중...
powershell -NoProfile -Command "Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force"

echo.
echo 완료. (포트 확인)
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue) { '경고: 포트 3000 아직 사용 중' } else { '포트 3000 해제 확인' }"
pause
