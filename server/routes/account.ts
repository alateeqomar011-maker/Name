// Account, profile, favourites, usage and saved conversations.

import express, { type Request, type Response, Router } from 'express';
import type { ConversationDetail, ConversationSummary, TranscriptLine } from '../../shared/types.ts';
import { AuthError, ensureUser, logIn, logOut, signUp, toMe, userById } from '../auth.ts';
import { getCharacter } from '../catalog/catalog.ts';
import { all, get, now, run } from '../db.ts';
import { snapshot } from '../usage.ts';

export const accountRouter = Router();
accountRouter.use(express.json({ limit: '512kb' }));

accountRouter.get('/me', ensureUser, (req: Request, res: Response) => {
  res.json({ me: toMe(req.user!), usage: snapshot(req.user!) });
});

accountRouter.patch('/me', ensureUser, (req: Request, res: Response) => {
  const user = req.user!;
  const b = req.body as { displayName?: string; birthYear?: number; contentLevel?: string };
  if (b.displayName !== undefined) {
    run('UPDATE users SET display_name = ? WHERE id = ?', String(b.displayName).trim().slice(0, 40), user.id);
  }
  if (b.birthYear !== undefined) {
    const year = Number(b.birthYear);
    const current = new Date().getFullYear();
    if (!Number.isInteger(year) || year < current - 120 || year > current) {
      return void res.status(400).json({ error: 'bad_request', message: 'Please enter a valid birth year.' });
    }
    // The age check is a one-way gate: once set it can't be lowered to dodge teen protections or raised past a block.
    if (user.birth_year && user.birth_year !== year) {
      return void res.status(409).json({ error: 'age_locked', message: 'Your age has already been confirmed. Contact support to change it.' });
    }
    run('UPDATE users SET birth_year = ? WHERE id = ?', year, user.id);
  }
  if (b.contentLevel === 'family' || b.contentLevel === 'standard') {
    run('UPDATE users SET content_level = ? WHERE id = ?', b.contentLevel, user.id);
  }
  const fresh = userById(user.id)!;
  res.json({ me: toMe(fresh), usage: snapshot(fresh) });
});

function authFail(res: Response, err: unknown): void {
  if (err instanceof AuthError) res.status(err.status).json({ error: 'auth', message: err.message });
  else {
    console.error(err);
    res.status(500).json({ error: 'server', message: 'Something went wrong.' });
  }
}

accountRouter.post('/auth/signup', ensureUser, (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body as { email?: string; password?: string; displayName?: string };
    const user = signUp(req, res, String(email ?? ''), String(password ?? ''), displayName);
    res.json({ me: toMe(user), usage: snapshot(user) });
  } catch (err) {
    authFail(res, err);
  }
});

accountRouter.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    const user = logIn(req, res, String(email ?? ''), String(password ?? ''));
    res.json({ me: toMe(user), usage: snapshot(user) });
  } catch (err) {
    authFail(res, err);
  }
});

accountRouter.post('/auth/logout', (req: Request, res: Response) => {
  logOut(req, res);
  res.json({ ok: true });
});

accountRouter.get('/usage', ensureUser, (req: Request, res: Response) => {
  res.json(snapshot(req.user!));
});

accountRouter.put('/favorites/:id', ensureUser, (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!getCharacter(id)) return void res.status(404).json({ error: 'not_found' });
  run('INSERT OR IGNORE INTO favorites (user_id, character_id, created_at) VALUES (?, ?, ?)', req.user!.id, id, now());
  res.json({ me: toMe(req.user!) });
});

accountRouter.delete('/favorites/:id', ensureUser, (req: Request, res: Response) => {
  run('DELETE FROM favorites WHERE user_id = ? AND character_id = ?', req.user!.id, String(req.params.id));
  res.json({ me: toMe(req.user!) });
});

// ---------------------------------------------------------------------------------------------
// Conversation history and transcripts.

interface ConvRow {
  id: string;
  user_id: string;
  mode: ConversationSummary['mode'];
  scenario: ConversationSummary['scenario'];
  character_ids: string;
  title: string;
  lang: string;
  created_at: string;
  updated_at: string;
  duration_sec: number;
  message_count?: number;
  preview?: string | null;
}

function toSummary(r: ConvRow): ConversationSummary {
  return {
    id: r.id,
    mode: r.mode,
    scenario: r.scenario,
    characterIds: JSON.parse(r.character_ids) as string[],
    title: r.title,
    lang: r.lang,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    durationSec: Number(r.duration_sec),
    messageCount: Number(r.message_count ?? 0),
    preview: r.preview ?? '',
  };
}

accountRouter.get('/conversations', ensureUser, (req: Request, res: Response) => {
  const rows = all<ConvRow>(
    `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
            (SELECT m.text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS preview
       FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC LIMIT 200`,
    req.user!.id,
  );
  res.json({ items: rows.map(toSummary).filter((s) => s.messageCount > 0) });
});

function ownConversation(req: Request): ConvRow | undefined {
  const row = get<ConvRow>('SELECT * FROM conversations WHERE id = ?', String(req.params.id));
  return row && row.user_id === req.user!.id ? row : undefined;
}

accountRouter.get('/conversations/:id', ensureUser, (req: Request, res: Response) => {
  const row = ownConversation(req);
  if (!row) return void res.status(404).json({ error: 'not_found' });
  const lines = all<{ speaker: string; text: string; interrupted: number; created_at: string }>(
    'SELECT speaker, text, interrupted, created_at FROM messages WHERE conversation_id = ? ORDER BY id',
    row.id,
  ).map((m): TranscriptLine => ({ speaker: m.speaker, text: m.text, interrupted: Boolean(m.interrupted), at: Date.parse(m.created_at) }));
  const detail: ConversationDetail = { ...toSummary({ ...row, message_count: lines.length }), lines };
  res.json(detail);
});

/** The client is the source of truth for what was actually said (interruptions truncate lines). */
accountRouter.put('/conversations/:id', ensureUser, (req: Request, res: Response) => {
  const row = ownConversation(req);
  if (!row) return void res.status(404).json({ error: 'not_found' });
  const lines = Array.isArray(req.body?.lines) ? (req.body.lines as TranscriptLine[]).slice(-500) : [];
  const allowed = new Set(['user', 'safety', ...(JSON.parse(row.character_ids) as string[])]);
  run('DELETE FROM messages WHERE conversation_id = ?', row.id);
  for (const l of lines) {
    if (!l || typeof l.text !== 'string' || !allowed.has(String(l.speaker))) continue;
    const at = typeof l.at === 'number' && Number.isFinite(l.at) ? new Date(l.at).toISOString() : now();
    run(
      'INSERT INTO messages (conversation_id, speaker, text, interrupted, created_at) VALUES (?, ?, ?, ?, ?)',
      row.id,
      String(l.speaker),
      l.text.slice(0, 4000),
      l.interrupted ? 1 : 0,
      at,
    );
  }
  run('UPDATE conversations SET updated_at = ? WHERE id = ?', now(), row.id);
  res.json({ ok: true });
});

accountRouter.delete('/conversations/:id', ensureUser, (req: Request, res: Response) => {
  const row = ownConversation(req);
  if (!row) return void res.status(404).json({ error: 'not_found' });
  run('DELETE FROM conversations WHERE id = ?', row.id);
  res.json({ ok: true });
});

accountRouter.delete('/conversations', ensureUser, (req: Request, res: Response) => {
  run('DELETE FROM conversations WHERE user_id = ?', req.user!.id);
  res.json({ ok: true });
});
