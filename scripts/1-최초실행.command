#!/bin/bash
# 최초 1회: 의존성 설치 + 설정 파일 생성 + 입력용/관리자 암호 설정
cd "$(dirname "$0")/.." || exit 1

echo "=== church_check 최초 실행 ==="
echo "1) 의존성 설치"
npm install || { echo "npm install 실패"; read -r; exit 1; }

if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "2) config.json 생성됨"
else
  echo "2) config.json 이미 있음 (건너뜀)"
fi

echo "3) 암호 설정 — 로그인 화면에 칠 값을 직접 정하세요."
read -rsp "   입력용 암호: " input_pw; echo
npm run setpw -- input "$input_pw"
read -rsp "   관리자 암호: " admin_pw; echo
npm run setpw -- admin "$admin_pw"

echo ""
echo "완료! 이제 '2-서버실행.command' 를 더블클릭하세요."
read -rp "엔터를 누르면 창이 닫힙니다..." _
