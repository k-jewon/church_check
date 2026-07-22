# church_check — 교회 청년부 출석 프로그램

청년부 주일 출석을 **폰 웹으로 현장 입력**하고, 최근 기간 출석을 **A4 격자 PDF**로 뽑는 로컬 셀프호스팅 웹앱. 속(屬) 단위로 관리하며, 새신자 속 팀이 입력을 담당한다. 설계 배경은 Obsidian 볼트 `04-Projects/교회 청년부 출석 프로그램 개발 (church_check).md` 참고.

## 주요 기능
- 속별 성도 명단 관리 (엑셀 업로드 초기 적재 + 웹 CRUD)
- 주일 출석 입력: 상태 드롭다운 + 미출석자 검색-추가(칩) + "오늘 입력 현황"
- 출석 상태 6종: `● 예배전 · ◉ 찬양중 · ○ 찬양후 · 본 본당 · 기 기타 · (빈칸) 결석`
- 출석부 PDF: 사람별 출석수·속 평균 출석률 + **연속 3주 이상 결석 강조**, A4 1장 축소(과밀 시 다중 페이지)
- 최초 방문자 대장 + 관리자 승격(속 배정)
- 전체 백업 다운로드
- 2단계 암호(입력용 / 관리자용)

## 출석률 규칙
출석 = `예배전·찬양중·찬양후·본당`. **기타·결석은 비출석**(분모는 기간 내 주일 수 유지). 속 이동 이력은 추적하지 않고 **현재 속** 기준으로 묶는다.

---

## 개발 (소스에서 실행)

> 서버를 띄우고 화면을 눈으로 확인하며 테스트하는 상세 순서는 [RUNNING.md](RUNNING.md) 참고.

요구: Node.js 22+ (내장 `node:sqlite` 사용), PDF 생성 시 시스템 Chrome 또는 Edge.

```bash
npm install
cp config.example.json config.json
npm run setpw -- input <입력용암호>
npm run setpw -- admin <관리자암호>
npm run dev          # http://localhost:3000
```

명령:
- `npm run dev` / `npm start` — 서버 실행
- `npm test` — 단위 테스트
- `npm run gen-template` — `template/roster-template.xlsx` 재생성
- `npm run build:exe` — 단일 실행파일 빌드(아래)

## 명단 초기 적재
1. 관리자로 로그인 → **명단 템플릿 내려받기**.
2. `이름 · 출생연도(2자리/4자리) · 속 · 직분(속장/부속장/속원)` 를 채운다.
3. **명단 엑셀 업로드**. (안전을 위해 명단이 비었을 때만 업로드 가능. 이후 소규모 변경은 웹에서, 전면 교체는 관리자 "전체 초기화" 후 재업로드.)

---

## 배포 (단일 실행파일)

```bash
npm run build:exe
```

`dist/` 폴더에 배포 세트가 생성된다:

```
dist/
├── church_check.exe     # Node 런타임 내장 (Chromium 미포함)
├── start.bat            # 더블클릭 실행
├── public/  template/   # 정적 자산 (exe 옆에 있어야 함)
└── config.example.json
```

**PDF는 PC에 설치된 Chrome/Edge를 사용**한다(Windows는 Edge 기본 탑재). exe에 Chromium을 넣지 않아 용량을 줄였다. Chrome/Edge가 표준 경로에 없으면 `config.json` 의 `chromePath` 로 지정한다.

### 교회 PC에서 최초 설정
1. `dist/` 폴더를 통째로 PC에 복사.
2. `config.example.json` → `config.json` 복사 후 암호 설정. (개발 PC에서 `npm run setpw` 로 만든 `config.json` 을 그대로 복사해도 됨.)
3. `start.bat` 더블클릭 → `http://localhost:3000` 에서 서버 실행.

### 폰에서 접속 (외부 터널)
로컬 서버를 인터넷에 노출하지 않고 폰에서 접속하려면 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) 를 설치하고:

```bash
cloudflared tunnel --url http://localhost:3000
```

출력되는 `https://xxxx.trycloudflare.com` 링크를 폰에서 연다. **이 URL은 실행할 때마다 바뀌므로** 매주 QR로 새로 공유한다. URL이 공개되므로 앱 로그인(암호)이 유일한 접근 통제다.

### 백업
- 관리자 → **전체 백업 다운로드** 로 DB 스냅샷(`.db`)을 받는다.
- 권장: `data/` 폴더(또는 dist 전체)를 OneDrive/Google Drive 동기화 폴더에 두면 자동 백업이 된다. 매주 PDF도 그 자체로 스냅샷 역할을 한다.

---

## 기술 스택
Node.js + TypeScript · Hono · htmx · `node:sqlite` · puppeteer-core · exceljs. 단일 exe는 esbuild 번들 + Node SEA(postject).
