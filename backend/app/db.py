"""SQLite storage.

One file, no ORM, no migrations framework — the schema is small enough to
declare once and create if missing. Everything user-owned carries user_id so
every query can be scoped to the caller; there are no admin reads.
"""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("KANA_DB", ROOT / "backend" / "kana.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Replaces localStorage: the same {mode, script, font, best, bestTime} blob,
-- stored per account so a device change doesn't lose it.
CREATE TABLE IF NOT EXISTS state (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id     TEXT NOT NULL,
  mode        TEXT NOT NULL,
  script      TEXT,
  device      TEXT NOT NULL,          -- 'mobile' | 'desktop'
  is_drill    INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  correct     INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, device);

-- One row per card answered. user_id/device/mode/deck_id are denormalised off
-- the run so analytics can filter without a join on every query.
CREATE TABLE IF NOT EXISTS answers (
  id       INTEGER PRIMARY KEY,
  run_id   INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL,
  device   TEXT NOT NULL,
  mode     TEXT NOT NULL,
  deck_id  TEXT NOT NULL,
  q        TEXT NOT NULL,             -- prompt as shown
  a        TEXT NOT NULL,             -- canonical answer
  given    TEXT,                      -- what the user actually answered
  correct  INTEGER NOT NULL,
  revealed INTEGER NOT NULL,
  ms       INTEGER NOT NULL,          -- time on this card
  -- 0 when the time is not trustworthy: over the per-card cap, or revealed.
  -- Accuracy still counts these; only the timing is dropped.
  timed    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_user ON answers(user_id, device);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


@contextmanager
def session():
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
