// Sessions and accounts. Every visitor gets a guest account (cookie session) so favourites, history and
// daily limits work immediately; signing up attaches an email/password to that same account.

import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ContentLevel, Me, Plan } from '../shared/types.ts';
import { config } from './config.ts';
import { all, get, now, run } from './db.ts';

export interface UserRow {
  id: string;
  email: string | null;
  pass_hash: string | null;
  display_name: string;
  birth_year: number | null;
  content_level: ContentLevel;
  plan: Plan;
  plan_until: string | null;
  stripe_customer: string | null;
  stripe_subscription: string | null;
  created_at: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRow;
  }
}

const COOKIE = 'sc_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365;

function sign(token: string): string {
  return createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readSessionToken(req: Request): string | null {
  const raw = parseCookies(req.headers.cookie)[COOKIE];
  if (!raw) return null;
  const [token, sig] = raw.split('.');
  if (!token || !sig) return null;
  const expected = sign(token);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  return token;
}

function setSessionCookie(res: Response, token: string): void {
  const secure = config.publicUrl.startsWith('https://');
  res.cookie(COOKIE, `${token}.${sign(token)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

function createSession(res: Response, userId: string): void {
  const token = randomBytes(24).toString('base64url');
  run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', token, userId, now());
  setSessionCookie(res, token);
}

export function userById(id: string): UserRow | undefined {
  return get<UserRow>('SELECT * FROM users WHERE id = ?', id);
}

function createGuest(): UserRow {
  const id = randomUUID();
  run('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)', id, '', now());
  return userById(id)!;
}

/** Attaches req.user when a valid session cookie is present. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = readSessionToken(req);
  if (token) {
    const row = get<{ user_id: string }>('SELECT user_id FROM sessions WHERE token = ?', token);
    if (row) req.user = userById(row.user_id);
  }
  next();
}

/** Ensures a user exists, creating a guest account on first visit. */
export function ensureUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    const user = createGuest();
    createSession(res, user.id);
    req.user = user;
  }
  next();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function signUp(req: Request, res: Response, email: string, password: string, displayName?: string): UserRow {
  const user = req.user!;
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw new AuthError('Please enter a valid email address.');
  if (password.length < 8) throw new AuthError('Password must be at least 8 characters.');
  if (get('SELECT 1 FROM users WHERE email = ?', normalized)) throw new AuthError('An account with this email already exists.', 409);
  if (user.email) throw new AuthError('You are already signed in.', 409);
  run(
    'UPDATE users SET email = ?, pass_hash = ?, display_name = COALESCE(NULLIF(?, \'\'), display_name) WHERE id = ?',
    normalized,
    hashPassword(password),
    (displayName ?? '').trim().slice(0, 40),
    user.id,
  );
  // Rotate the session after a privilege change.
  run('DELETE FROM sessions WHERE user_id = ?', user.id);
  createSession(res, user.id);
  return userById(user.id)!;
}

export function logIn(req: Request, res: Response, email: string, password: string): UserRow {
  const account = get<UserRow>('SELECT * FROM users WHERE email = ?', email.trim().toLowerCase());
  if (!account || !verifyPassword(password, account.pass_hash)) throw new AuthError('Email or password is incorrect.', 401);
  const guest = req.user;
  if (guest && !guest.email && guest.id !== account.id) mergeGuestInto(guest.id, account.id);
  createSession(res, account.id);
  return account;
}

/** Moves a guest's favourites and conversations into the account they log into. */
function mergeGuestInto(guestId: string, accountId: string): void {
  run('INSERT OR IGNORE INTO favorites (user_id, character_id, created_at) SELECT ?, character_id, created_at FROM favorites WHERE user_id = ?', accountId, guestId);
  run('UPDATE conversations SET user_id = ? WHERE user_id = ?', accountId, guestId);
  run('DELETE FROM users WHERE id = ? AND email IS NULL', guestId);
}

export function logOut(req: Request, res: Response): void {
  const token = readSessionToken(req);
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.clearCookie(COOKIE, { path: '/' });
}

export function ageBand(birthYear: number | null): Me['ageBand'] {
  if (!birthYear) return 'unknown';
  const age = new Date().getFullYear() - birthYear;
  if (age < 13) return 'blocked';
  if (age < 18) return 'teen';
  return 'adult';
}

export function effectivePlan(user: UserRow): Plan {
  if (user.plan !== 'premium') return 'free';
  if (user.plan_until && Date.parse(user.plan_until) < Date.now()) return 'free';
  return 'premium';
}

/** Teens are always in family mode regardless of their setting. */
export function effectiveContentLevel(user: UserRow): ContentLevel {
  return ageBand(user.birth_year) === 'adult' ? user.content_level : 'family';
}

export function toMe(user: UserRow): Me {
  const favorites = all<{ character_id: string }>(
    'SELECT character_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
    user.id,
  ).map((r) => r.character_id);
  return {
    id: user.id,
    isGuest: !user.email,
    email: user.email ?? undefined,
    displayName: user.display_name,
    birthYear: user.birth_year ?? undefined,
    ageBand: ageBand(user.birth_year),
    contentLevel: effectiveContentLevel(user),
    plan: effectivePlan(user),
    planUntil: user.plan_until ?? undefined,
    favorites,
  };
}

/** Blocks under-13s and visitors who haven't passed the age check from AI features. */
export function requireAgeCleared(req: Request, res: Response, next: NextFunction): void {
  const band = ageBand(req.user?.birth_year ?? null);
  if (band === 'unknown') {
    res.status(403).json({ error: 'age_required', message: 'Please confirm your age to continue.' });
    return;
  }
  if (band === 'blocked') {
    res.status(403).json({ error: 'age_blocked', message: 'Starcall is only available to people aged 13 and over.' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!config.adminToken) {
    res.status(503).json({ error: 'admin_disabled', message: 'Set ADMIN_TOKEN on the server to enable the admin API.' });
    return;
  }
  const a = Buffer.from(token);
  const b = Buffer.from(config.adminToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}
