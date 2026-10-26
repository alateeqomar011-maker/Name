"""SQLite storage. One connection per thread; WAL mode so API reads never block worker writes."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at REAL NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at REAL NOT NULL,
  expires_at REAL NOT NULL,
  last_seen REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT,
  surah INTEGER, ayah_from INTEGER, ayah_to INTEGER,
  reciter_id TEXT,
  source_recording_id TEXT,
  created_at REAL NOT NULL,
  duration_s REAL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  original_name TEXT,
  original_ext TEXT,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS recordings_user ON recordings(user_id, created_at);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  input TEXT NOT NULL,
  result TEXT,
  error TEXT,
  recording_id TEXT,
  output_recording_id TEXT,
  quota_day TEXT,
  created_at REAL NOT NULL,
  started_at REAL,
  finished_at REAL,
  cancel_requested INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
  note TEXT,
  created_at REAL NOT NULL,
  PRIMARY KEY (user_id, surah, ayah)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reciter_id TEXT NOT NULL,
  created_at REAL NOT NULL,
  PRIMARY KEY (user_id, reciter_id)
);
CREATE TABLE IF NOT EXISTS practice (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  surah INTEGER NOT NULL, ayah_from INTEGER NOT NULL, ayah_to INTEGER NOT NULL,
  job_id TEXT,
  recording_id TEXT,
  word_accuracy REAL,
  errors INTEGER, warnings INTEGER, tajweed_flags INTEGER,
  confidence REAL,
  mode TEXT,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS practice_user ON practice(user_id, created_at);
"""

_local = threading.local()
_init_lock = threading.Lock()
_initialised = False


def conn() -> sqlite3.Connection:
    global _initialised
    c = getattr(_local, "conn", None)
    if c is None:
        settings.var_dir.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(settings.db_path, timeout=30, isolation_level=None, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA busy_timeout=30000")
        with _init_lock:
            if not _initialised:
                c.executescript(SCHEMA)
                _initialised = True
        _local.conn = c
    return c


@contextmanager
def tx():
    c = conn()
    c.execute("BEGIN IMMEDIATE")
    try:
        yield c
        c.execute("COMMIT")
    except BaseException:
        c.execute("ROLLBACK")
        raise


def one(sql: str, *args) -> sqlite3.Row | None:
    return conn().execute(sql, args).fetchone()


def all_(sql: str, *args) -> list[sqlite3.Row]:
    return conn().execute(sql, args).fetchall()


def run(sql: str, *args) -> int:
    cur = conn().execute(sql, args)
    return cur.rowcount


def now() -> float:
    return time.time()


def jload(s: str | None, default=None):
    if not s:
        return default
    try:
        return json.loads(s)
    except ValueError:
        return default


def jdump(v) -> str:
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
