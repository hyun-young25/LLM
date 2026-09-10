import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const digest = text => createHash('sha256').update(text).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [, salt, expected] = (stored || '').split(':');
  const key = await derive(password, salt || 'unregistered-account', 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return !!expected && expected.length === 128 && timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) throw new Error('지원하지 않는 데이터베이스 버전입니다.');
  if (version === 0) db.exec(`BEGIN;
    CREATE TABLE users (id TEXT PRIMARY KEY, student_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','admin')), password_hash TEXT, created_at TEXT NOT NULL, last_login TEXT);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE INDEX idx_sessions_user ON sessions(user_id);
    CREATE TABLE progress (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, state TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_key TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL, UNIQUE(user_id,event_key));
    CREATE INDEX idx_events_user_id ON events(user_id,id);
    CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    PRAGMA user_version = 1;
    COMMIT;`);
  return db;
}
