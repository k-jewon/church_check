// SQL schema kept inline (not a .sql file) so it bundles cleanly into a single exe.

// v1 — frozen history. Do not edit; migration 1 replays it on fresh DBs so that
// later migrations run against the same starting point everywhere.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS member (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  birth_year  INTEGER,
  sok         TEXT    NOT NULL,
  role        TEXT    NOT NULL CHECK (role IN ('속장','부속장','속원')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  service_date TEXT    NOT NULL,
  status       TEXT    NOT NULL CHECK (status IN ('before','praise','after','main','etc')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (member_id, service_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(service_date);

CREATE TABLE IF NOT EXISTS visitor (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  phone              TEXT,
  gender             TEXT,
  birth_year         INTEGER,
  inviter            TEXT,
  route              TEXT    CHECK (route IN ('전도','지인소개','온라인','기타')),
  route_note         TEXT,
  visit_date         TEXT    NOT NULL,
  promoted_member_id INTEGER REFERENCES member(id) ON DELETE SET NULL,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
`;

// v2 — 스키마 재설계 (구간 2). 신분(stage)과 속(sok)이 다른 축이라는 도메인 정정을 담는다.
// 기존 행은 버린다: 지금 든 것은 개발용 합성 샘플뿐이고 실 명단은 아직 적재되지 않았다.
// 근거: context/wayfinder/tickets/12-방문-새가족-등록-경로-통합.md
export const SCHEMA_V2_SQL = `
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS visitor;
DROP TABLE IF EXISTS member;

CREATE TABLE member (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  birth_year  INTEGER,
  stage       TEXT    NOT NULL CHECK (stage IN ('새가족','성도')),
  sok         TEXT,
  role        TEXT    CHECK (role IN ('속장','부속장','속원')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  -- 속은 정식 성도만 갖는다. 성도는 속·직분이 둘 다 있고, 새가족은 둘 다 NULL이다.
  CHECK (
    (stage = '성도'   AND sok IS NOT NULL AND role IS NOT NULL) OR
    (stage = '새가족' AND sok IS NULL     AND role IS NULL)
  )
);

-- 새가족 등록정보. member(stage='새가족')와 1:1이며 개인정보가 모이는 유일한 자리다.
-- 이름·생년은 member와 중복이므로 들지 않고, 방문일은 이 정보를 받는 시점과 무관하므로 없다.
CREATE TABLE newfamily_profile (
  member_id  INTEGER PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  phone      TEXT,
  gender     TEXT,
  inviter    TEXT,
  route      TEXT    CHECK (route IN ('전도','지인소개','온라인','기타')),
  route_note TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 새가족 회차. 한 줄이 1회차이며 예배가 아니라 예배 후 새가족 모임 참여를 뜻한다.
-- 출석 행에서 유도할 수 없으므로 별도로 기록한다.
CREATE TABLE newfamily_session (
  member_id    INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  meeting_date TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (member_id, meeting_date)
);

-- 방문. 사람 레코드가 아니라 (날짜, 이름) 줄이며 이력을 잇지 않는다.
-- 방문자에게는 예배 축이 없으므로 status 칸도 없다.
CREATE TABLE visit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_date TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_visit_log_date ON visit_log(visit_date);

-- 당시 신분과 당시 속을 함께 박는다. 나중에 속이 바뀌어도 과거 지면이 소급해 다시 그려지지 않는다.
CREATE TABLE attendance (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  service_date TEXT    NOT NULL,
  status       TEXT    NOT NULL CHECK (status IN ('before','praise','after','main','etc')),
  stage_at     TEXT    NOT NULL CHECK (stage_at IN ('새가족','성도')),
  sok_at       TEXT,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (member_id, service_date)
);
CREATE INDEX idx_attendance_date ON attendance(service_date);
`;
