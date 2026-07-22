// SQL schema kept inline (not a .sql file) so it bundles cleanly into a single exe.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS member (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  birth_year  INTEGER NOT NULL,
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
