# church_check — 교회 청년부 출석 프로그램

청년부 주일 출석을 **폰 웹으로 현장 입력**하고, 최근 기간 출석을 **A4 격자 PDF**로 뽑는 로컬 셀프호스팅 웹앱. 속(屬) 단위로 관리하며, 새신자 속 팀이 입력을 담당한다. 설계 배경은 Obsidian 볼트 `04-Projects/교회 청년부 출석 프로그램 개발 (church_check).md` 참고.

## 주요 기능
- 속별 성도 명단 관리 (엑셀 업로드 초기 적재 + 웹 CRUD)
- 주일 출석 입력: 상태 드롭다운 + 미출석자 검색-추가(칩) + "오늘 입력 현황"
- 출석 상태 6종: `● 예배전 · ◉ 찬양후 · ○ 찬양중 · 본 본당 · 기 기타 · (빈칸) 결석`
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
- **출석합계**(주차별): `청년`(일반 속·군인·새가족 속) / `새신자`(새가족 속 + 기타 인원, 청년과 중복 집계 가능) / `합계`(청년 + 기타 인원, 새가족 중복 제외).
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

`build.mjs` 가 **빌드에 사용한 Node 바이너리를 복사**해 단일 실행파일을 만든다(Node SEA). **크로스 컴파일은 불가** — Windows용은 Windows에서, macOS용은 macOS에서 **각각** 빌드해야 한다. `npm run build:exe` 는 현재 OS를 감지해 알맞은 산출물을 만든다.

| 대상 | 산출물 | 처리 |
|---|---|---|
| **Windows** | `church_check.exe` + `start.bat` | Authenticode 서명 제거 → blob 주입 |
| **macOS** | `church_check` + `start.command` | 유니버설→호스트 arch로 thin → blob 주입 → ad-hoc 재서명 |

### 사전 준비 (1회)
1. **Node.js 24.x 설치** — 빌드하려는 OS에서(개발·검증 버전, `node:sqlite` 무플래그 동작, 최소 22.5+). [nodejs.org](https://nodejs.org) → `node -v` 확인.
2. **macOS만**: `codesign`·`lipo` 필요(Xcode Command Line Tools). 대개 설치돼 있고, 없으면 `xcode-select --install`.
3. 소스 가져오기 + **빌드 도구 포함** 의존성 설치:
   ```
   git clone https://github.com/k-jewon/church_check.git
   cd church_check
   npm install
   ```

### 빌드
```
npm run build:exe
```
esbuild 번들 → SEA blob 생성 → 런타임 복사·서명 → blob 주입 순으로 진행된다. 완료되면 `dist/` 에 배포 세트가 생성된다:
```
dist/
├── church_check(.exe)          # Node 런타임 내장 (Chromium 미포함, ~90–130MB)
├── start.bat / start.command   # 더블클릭 실행 (OS별)
├── public/  template/          # 정적 자산 (실행파일 옆에 있어야 함)
└── config.example.json
```

**PDF는 PC에 설치된 Chrome/Edge를 사용**한다(Windows는 Edge 기본 탑재, macOS는 Chrome 등 필요). 실행파일에 Chromium을 넣지 않아 용량을 줄였다. 표준 경로에 없으면 `config.json` 의 `chromePath` 로 지정한다.

> **macOS 실행파일은 빌드한 아키텍처 전용**이다. Apple Silicon(arm64)에서 빌드하면 arm64 맥에서만 실행된다. Intel 맥 대상이면 Intel 맥에서(또는 `arch -x86_64` 환경으로) 빌드한다.

### 빌드 문제 해결
| 증상 | 원인 / 해결 |
|---|---|
| `Unsupported build OS` | Linux 등에서 빌드 → Windows 또는 macOS에서 빌드 |
| (win) 실행 시 `node:sqlite` 오류 | Node 버전이 낮음 → 22.5+ (권장 24)로 다시 빌드 |
| (mac) `codesign`/`lipo` 없음 | Xcode CLT 미설치 → `xcode-select --install` |
| (mac) "개발자를 확인할 수 없어 열 수 없음" | Gatekeeper. 실행파일 **우클릭 → 열기** 로 1회 허용(`start.command` 가 격리 속성 자동 해제 시도) |
| `postject`/`esbuild` 없음 | `npm install` 을 `--production` 으로 함 → 그냥 `npm install` |
| 실행은 되는데 화면이 깨짐 | `public/`·`template/` 이 실행파일 옆에 없음 → `dist/` 통째로 복사 |

### 대상 PC에서 최초 설정
1. `dist/` 폴더를 통째로 대상 PC에 복사.
2. **실행**: Windows는 `start.bat`, macOS는 `start.command` 더블클릭.
   - macOS에서 **다운로드로 받았다면** 첫 실행 시 Gatekeeper 경고가 날 수 있다 → 실행파일 우클릭 → **열기** 1회(`start.command` 가 격리 속성 해제를 시도한다).
   - **최초 1회**: 콘솔(터미널) 창에서 **입력용 암호**·**관리자 암호**를 물어본다(입력 글자는 안 보임). 입력하면 `config.json` 이 자동 생성된다. 미리 만든 `config.json` 을 넣어두면 이 단계는 건너뛴다.
   - 이후 실행부터는 바로 서버가 뜬다. `http://localhost:3000` 접속. **창을 닫으면 서버가 종료**된다.

### 폰에서 접속 (외부 터널 + QR 자동)
[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) 만 있으면 서버가 **자동으로 터널을 열고 접속용 QR을 만든다**. 설치(PATH 등록) 하거나 **`cloudflared`(Windows는 `cloudflared.exe`) 를 실행파일 옆에 두면** 된다.

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
