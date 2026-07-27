# church_check — 교회 청년부 출석 프로그램

청년부 주일 출석을 **폰 웹으로 현장 입력**하고, 최근 기간 출석을 **A4 격자 PDF**로 뽑는 로컬 셀프호스팅 웹앱. 속(屬) 단위로 관리하며, 새신자 속 팀이 입력을 담당한다. 설계 배경은 Obsidian 볼트 `04-Projects/교회 청년부 출석 프로그램 개발 (church_check).md` 참고.

## 주요 기능
- 속별 성도 명단 관리 (엑셀 업로드 초기 적재 + 웹 CRUD)
- 주일 출석 입력: 상태 드롭다운 + 미출석자 검색-추가(칩) + "오늘 입력 현황"
- 출석 상태 6종: `● 예배전 · ◉ 찬양중 · ○ 찬양후 · 본 본당 · 기 기타 · (빈칸) 결석`
- 출석부 PDF: 속 단위 격자(속장 생년순 배치) + **새가족·군인·방문·출석합계 섹션 자동 분리**, A4 1장 축소(과밀 시 다중 페이지)
- 최초 방문자 대장 + 관리자 승격(속 배정)
- 전체 백업 다운로드
- 폰 접속용 QR: 서버가 cloudflared 터널을 자동으로 열고 접속 URL·QR을 콘솔과 **관리 → 폰 접속(QR)** 화면에 표시
- 2단계 암호(입력용 / 관리자용) — 최초 실행 시 콘솔에서 설정. **입력 모드**(파란 네비)와 **관리자 모드**(주황 네비)를 색·배지로 구별, 관리자는 모드 전환 링크로 이동

## 출석률 규칙
출석 = `예배전·찬양중·찬양후·기타`. **본당·결석은 비출석**(본당예배는 심볼 `본`으로 표시만 되고 출석인원에는 포함하지 않는다. 분모는 기간 내 주일 수 유지). 속 이동 이력은 추적하지 않고 **현재 속** 기준으로 묶는다.

## 특수 속 (PDF 섹션 자동 분리)
명단의 `속` 값이 아래와 같으면 PDF에서 별도로 처리된다.
- `새가족` · `군인`: 일반 속처럼 심볼로 출석 체크하되 PDF에서 별도 섹션으로 배치.
- `방문`: 속 격자에는 그리지 않고, 그 주 `기타(etc)`로 찍힌 인원을 **방문 섹션에 날짜별 이름**으로 출력. 방문자는 출생연도 없이 등록 가능.
- **출석합계**(주차별): `청년`(일반 속·군인) + `새가족+기타`(새가족 속 + 기타 인원) = `합계`.
- **속 배치 순서**: 속장(없으면 최상위 직분자) 생년이 이른 순, 동일 생년이면 속장 이름 가나다순. 새가족·군인은 뒤에.

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

> **exe는 반드시 Windows(또는 Windows용 node.exe)에서 빌드**해야 한다. `build.mjs` 가 실행 중인 Node 바이너리를 복사하는 구조라, macOS에서 돌리면 PE 서명 제거 단계에서 실패한다.

**PDF는 PC에 설치된 Chrome/Edge를 사용**한다(Windows는 Edge 기본 탑재). exe에 Chromium을 넣지 않아 용량을 줄였다. Chrome/Edge가 표준 경로에 없으면 `config.json` 의 `chromePath` 로 지정한다.

### 교회 PC에서 최초 설정
1. `dist/` 폴더를 통째로 PC에 복사.
2. `start.bat` 더블클릭 → 서버 실행.
   - **최초 1회**: 콘솔 창에서 **입력용 암호**·**관리자 암호**를 물어본다(입력 글자는 화면에 안 보임). 입력하면 `config.json` 이 자동 생성된다. 개발 PC에서 만든 `config.json` 을 미리 복사해 두면 이 단계는 건너뛴다.
   - 이후 실행부터는 바로 서버가 뜬다. `http://localhost:3000` 접속. **창을 닫으면 서버가 종료**된다.

### 폰에서 접속 (외부 터널 + QR 자동)
[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) 만 있으면 서버가 **자동으로 터널을 열고 접속용 QR을 만든다**. 설치(PATH 등록) 하거나 **`cloudflared.exe` 를 `church_check.exe` 옆에 두면** 된다.

- 서버를 켜면 콘솔 창에 접속 URL과 QR이 출력된다.
- 관리자로 로그인 → **관리 → 폰 접속(QR)** 화면에서도 QR·URL을 볼 수 있다(폰으로 스캔·공유하기 편함).
- cloudflared 가 없으면 터널은 건너뛰고 로컬(같은 Wi-Fi에서 이 PC의 IP)로만 접속 가능하다.

> **이 URL은 서버를 껐다 켤 때마다 바뀐다.** URL이 공개되므로 앱 로그인(암호)이 유일한 접근 통제다.

### 백업
- 관리자 → **전체 백업 다운로드** 로 DB 스냅샷(`.db`)을 받는다.
- 권장: `data/` 폴더(또는 dist 전체)를 OneDrive/Google Drive 동기화 폴더에 두면 자동 백업이 된다. 매주 PDF도 그 자체로 스냅샷 역할을 한다.

---

## 기술 스택
Node.js + TypeScript · Hono · htmx · `node:sqlite` · puppeteer-core · exceljs. 단일 exe는 esbuild 번들 + Node SEA(postject).
