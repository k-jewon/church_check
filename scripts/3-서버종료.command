#!/bin/bash
# 백그라운드/다른 창에서 도는 서버와 cloudflared 터널을 강제 종료
if pkill -f "tsx.*src/server.ts"; then
  echo "서버 종료됨"
else
  echo "실행 중인 서버가 없습니다"
fi

if pkill -x cloudflared 2>/dev/null; then
  echo "cloudflared 터널 종료됨"
fi

sleep 1
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "경고: 포트 3000 이 아직 사용 중입니다"
else
  echo "포트 3000 해제 확인"
fi
read -rp "엔터를 누르면 창이 닫힙니다..." _
