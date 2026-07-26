# 실행 & 화면 확인 가이드 (개발/QA)

로컬에서 서버를 띄우고 폰 화면을 눈으로 확인하며 테스트하는 순서. 배포(exe)는 [README](README.md) 참고.

## 빠른 실행 (더블클릭 스크립트)
아래 수동 명령을 몰라도 `scripts/` 폴더의 파일을 더블클릭하면 된다. (macOS는 `.command`, Windows는 `.bat`)

| 단계 | 파일 | 하는 일 |
|---|---|---|
| 최초 1회 | `1-최초실행` | `npm install` + `config.json` 생성 + 입력용/관리자 암호 설정 |
| 서버 켜기 | `2-서버실행` | 서버 실행(자동 재시작). 창을 닫거나 `Ctrl+C` 로 종료 |
| 서버 끄기 | `3-서버종료` | 백그라운드로 남은 서버·cloudflared 터널 강제 종료 + 포트 확인 |

> macOS에서 처음 실행 시 "확인되지 않은 개발자" 경고가 뜨면 파일 우클릭 → **열기** 로 한 번 허용한다. 아래 절들은 스크립트가 대신 실행하는 명령의 상세 설명이다.

## 0. 준비 (최초 1회)
```bash
npm install
cp config.example.json config.json
npm run setpw -- input <입력용암호>     # 로그인 시 실제로 입력할 값
npm run setpw -- admin  <관리자암호>
```
> `<입력용암호>`/`<관리자암호>` 자리에 **직접 정한 값**을 넣는다. 로그인 화면에 칠 암호가 바로 그 값이다(예시 문자열을 그대로 쓰지 말 것).
> 암호를 잊었으면 같은 `setpw` 명령을 다시 실행하면 `config.json` 의 해시가 덮어써진다. `config.json` 은 git에 올라가지 않으므로(암호 유출 방지) PC마다 따로 설정한다.

PDF 확인까지 하려면 PC에 Chrome 또는 Edge가 있어야 한다(Windows는 Edge 기본 탑재).

## 1. 서버 실행
```bash
npm run dev      # 파일 변경 시 자동 재시작 (tsx watch)
```
콘솔에 `church_check listening on http://localhost:3000` 이 뜨면 브라우저로 접속.

- 입력용 암호로 로그인하면 **입력 모드**, 관리자 암호로 로그인하면 관리 화면(**관리자 모드**)까지 접근.
- **모드 구분(색·배지)**: 화면이 어느 영역인지 상단 네비 바로 구별된다.
  - **입력 모드**(파란 네비 + `입력 모드` 배지): `입력` · `방문자`. 관리자로 로그인했다면 `관리자 모드로 →` 전환 링크가 추가로 보인다.
  - **관리자 모드**(주황 네비 + `관리자 모드` 배지): `관리 홈` · `입력 모드로 →` 전환 링크.

## 2. 폰 화면으로 보기 (권장)
이 앱은 폰 우선 UI다. 브라우저 개발자도구로 폰 화면을 흉내내면 실제 사용 모습이 보인다.
1. `F12` → 좌상단 **기기 툴바 토글**(`Ctrl+Shift+M`).
2. 기기를 iPhone 등으로 바꾸면 폭이 좁아지며 실제 폰 레이아웃 확인 가능.

같은 Wi‑Fi의 진짜 폰으로 보려면 PC의 랜 IP로 접속(`http://<PC-IP>:3000`). 외부/터널은 README의 cloudflared 참고.

## 3. 테스트용 명단 넣기
샘플 명단(예시 이미지 이름 일부)을 만들어 업로드하면 바로 화면이 채워진다.
```bash
npx tsx src/tools/gen-sample.ts sample-roster.xlsx
```
`관리 → 명단 엑셀 업로드`에서 `sample-roster.xlsx` 업로드. (명단이 비어 있을 때만 업로드된다. 이미 있으면 같은 화면의 **전체 초기화**로 비운 뒤 재업로드.)

> 실제 양식을 보고 싶으면 `관리 → 명단 템플릿 내려받기`로 `roster-template.xlsx` 를 받는다.

## 4. 화면별 확인 포인트

### 입력 (`/`)
- 상단 **주일 드롭다운**: 기본은 이번 주일. 지난 주를 고르면 보정 입력.
- **출석 상태 드롭다운**(예배전/찬양중/찬양후/본당/기타)을 먼저 고른다.
- **이름 검색**에 한 글자 치면 *미출석자만* 자동완성으로 뜬다. 항목을 누르면 → 현재 상태로 입력되고 아래 **칩**으로 쌓인다. 칩의 `✕` 로 취소.
- 이미 찍은 사람은 검색에서 사라진다(중복 방지).

### 오늘 입력 현황 (`입력 → 오늘 입력 현황 보기`)
- 상태별 인원 집계 + **미출석 수**.
- 각 행에서 상태를 바꾸거나(드롭다운) **취소** 가능 — 잘못 찍은 것 교정용.

### 방문자 (`/visitors`)
- `+ 새 방문자 등록`: 이름·연락처·성별·출생연도·인도자·방문경로. 경로를 **기타**로 하면 상세 텍스트가 저장된다.
- 대장 목록 확인. **승격 폼(속·직분 배정)은 관리자로 로그인했을 때만** 보인다. 승격하면 명단에 편입되고 방문 이력은 대장에 그대로 남는다(→ 승격됨).

### 관리 → 출석부 PDF (`/admin/report`)
- 기간을 고르거나 **최근 4주** 버튼.
- **미리보기(HTML)**: 브라우저에서 격자 레이아웃을 바로 확인(PDF 안 만들고 빠르게 눈으로 검수).
- **PDF 다운로드**: 실제 A4 PDF. 속 단위 격자(속장 생년순 배치, 속장·부속장 이름 회색)와 **새가족·군인·방문·출석합계** 섹션이 자동 분리된다. 인원이 많아 7pt 미만으로 작아지면 자동으로 여러 장.

### 관리 → 전체 백업 다운로드
- 현재 DB 스냅샷(`.db`)을 내려받는다. 다른 곳에 열어 데이터가 온전한지 확인 가능.

## 5. 리포트를 의미 있게 보려면 (출석 데이터 시드)
빈 출석으로는 리포트가 밋밋하다. 몇 주치 출석을 빠르게 넣으려면 입력 화면에서 여러 주일·상태로 직접 찍거나, 아래처럼 직접 넣는다(연속 결석 강조도 확인 가능).
```bash
node -e '
const {DatabaseSync}=require("node:sqlite");
const db=new DatabaseSync("data/church.db");
const dates=["2026-06-28","2026-07-05","2026-07-12","2026-07-19"];
const ins=db.prepare("INSERT OR REPLACE INTO attendance(member_id,service_date,status) VALUES(?,?,?)");
// 예: 1번=개근, 3번=뒤 3주 비출석(연속결석 강조 대상)
[["before","before","after","before"]].forEach(a=>a.forEach((s,i)=>ins.run(1,dates[i],s)));
[["before","etc","etc",null]].forEach(a=>a.forEach((s,i)=>{if(s)ins.run(3,dates[i],s)}));
console.log("seeded");
'
```

## 6. 단위 테스트
```bash
npm test
```
출석률·연속 3주 결석·주일 계산·엑셀 파싱 로직을 검증한다(12개). 화면과 무관하게 계산 규칙만 빠르게 확인할 때 사용.

## 7. 처음부터 다시 (초기화)
```bash
# 서버를 끄고
rm -f data/church.db data/church.db-wal data/church.db-shm
```
다음 실행 때 빈 DB로 새로 시작된다. 명단·출석·방문자 전부 사라지니 주의.

## 8. 종료 (서버 · 터널 내리기)

### 개발 서버 (`npm run dev`)
실행한 터미널에서 **`Ctrl+C`**. 백그라운드로 띄웠거나 창을 닫아 못 찾겠으면 프로세스로 종료:
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*church_check*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```
배포용 exe로 띄운 경우엔 `church_check.exe` 를 작업 관리자에서 끝내거나, 위 명령의 `node.exe` 를 `church_check.exe` 로 바꿔 실행한다.

### cloudflared 터널
터널을 실행한 터미널에서 **`Ctrl+C`**. 백그라운드면:
```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
```
터널을 내리면 그 `https://….trycloudflare.com` 주소는 **즉시 무효**가 된다. 다시 열면 새 주소가 발급되므로, 실제 운영에선 매주 새 주소를 QR로 공유한다.

### 확인
포트가 아직 물려 있는지:
```powershell
netstat -ano | findstr :3000
```
아무것도 안 나오면 서버가 완전히 내려간 것이다.

## 자주 겪는 것
- **PDF가 안 만들어짐**: Chrome/Edge 경로를 못 찾는 경우. `config.json` 의 `chromePath` 에 브라우저 실행 파일 전체 경로를 넣는다. (Windows: `msedge.exe`/`chrome.exe` · macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`)
- **로그인이 안 됨 / "암호가 올바르지 않습니다"**: 로그인 암호는 `config.json` 에 설정된 값이지 문서의 예시가 아니다. 값을 모르면 `npm run setpw -- input <새암호>` 로 다시 설정(덮어쓰기)한 뒤 그 값으로 로그인.
- **포트 충돌**: 이미 3000을 쓰는 프로세스가 있으면 `config.json` 의 `port` 변경.
