// SQLite storage via Node's built-in driver (no native dependency to compile).

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

export type Row = Record<string, unknown>;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  pass_hash TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  birth_year INTEGER,
  content_level TEXT NOT NULL DEFAULT 'family',
  plan TEXT NOT NULL DEFAULT 'free',
  plan_until TEXT,
  stripe_customer TEXT,
  stripe_subscription TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, character_id)
);

CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, metric)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  scenario TEXT NOT NULL,
  character_ids TEXT NOT NULL,
  title TEXT NOT NULL,
  lang TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  last_heartbeat INTEGER
);
CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_id, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  interrupted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS call_stats (
  character_id TEXT NOT NULL,
  day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, day)
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '',
  votes INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_votes (
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY (request_id, user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  character_id TEXT,
  conversation_id TEXT,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rights_requests (
  id TEXT PRIMARY KEY,
  character_id TEXT,
  subject_name TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  email TEXT NOT NULL,
  request_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opt_outs (
  name TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  character_id TEXT,
  category TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

let instance: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (!instance) {
    const file = process.env.DB_FILE ?? join(config.dataDir, 'starcall.db');
    if (file !== ':memory:') mkdirSync(config.dataDir, { recursive: true });
    instance = new DatabaseSync(file);
    instance.exec(SCHEMA);
  }
  return instance;
}

export function all<T = Row>(sql: string, ...params: SqlParam[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T = Row>(sql: string, ...params: SqlParam[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SqlParam[]): { changes: number | bigint; lastInsertRowid: number | bigint } {
  return db().prepare(sql).run(...params);
}

export type SqlParam = string | number | bigint | null | Uint8Array;

export function now(): string {
  return new Date().toISOString();
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
