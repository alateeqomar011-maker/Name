// Celebrity requests (with votes), content reports and rights-holder removal requests.

import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, Router } from 'express';
import type { CelebrityRequest } from '../../shared/types.ts';
import { normalize } from '../../shared/text.ts';
import { attachUser, ensureUser } from '../auth.ts';
import { getCharacter, search } from '../catalog/catalog.ts';
import { all, get, now, run } from '../db.ts';

export const communityRouter = Router();
communityRouter.use(express.json({ limit: '64kb' }));

interface RequestRow {
  id: string;
  name: string;
  category: string;
  country: string;
  reason: string;
  votes: number;
  status: CelebrityRequest['status'];
  created_at: string;
  voted?: number;
}

function toRequest(r: RequestRow): CelebrityRequest {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    country: r.country,
    reason: r.reason,
    votes: Number(r.votes),
    status: r.status,
    createdAt: r.created_at,
    voted: Boolean(r.voted),
  };
}

communityRouter.get('/requests', attachUser, (req: Request, res: Response) => {
  const rows = all<RequestRow>(
    `SELECT r.*, EXISTS(SELECT 1 FROM request_votes v WHERE v.request_id = r.id AND v.user_id = ?) AS voted
       FROM requests r WHERE r.status != 'declined' ORDER BY r.votes DESC, r.created_at DESC LIMIT 100`,
    req.user?.id ?? '',
  );
  res.json({ items: rows.map(toRequest) });
});

communityRouter.post('/requests', ensureUser, (req: Request, res: Response) => {
  const user = req.user!;
  const b = req.body as { name?: string; category?: string; country?: string; reason?: string; links?: string };
  const name = String(b.name ?? '').trim().slice(0, 80);
  if (name.length < 2) return void res.status(400).json({ error: 'bad_request', message: 'Please enter a name.' });
  const existingCharacter = search({ q: name, limit: 1 }).items[0];
  if (existingCharacter && normalize(existingCharacter.name) === normalize(name)) {
    return void res.status(409).json({ error: 'exists', message: `${existingCharacter.name} is already on Starcall.`, characterId: existingCharacter.id });
  }
  const key = normalize(name);
  const dup = get<RequestRow>('SELECT * FROM requests WHERE name_key = ?', key);
  if (dup) {
    const inserted = run('INSERT OR IGNORE INTO request_votes (request_id, user_id) VALUES (?, ?)', dup.id, user.id);
    if (Number(inserted.changes) > 0) run('UPDATE requests SET votes = votes + 1 WHERE id = ?', dup.id);
    const fresh = get<RequestRow>('SELECT *, 1 AS voted FROM requests WHERE id = ?', dup.id)!;
    return void res.json({ request: toRequest(fresh), merged: true });
  }
  const id = randomUUID();
  run(
    'INSERT INTO requests (id, user_id, name, name_key, category, country, reason, links, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    user.id,
    name,
    key,
    String(b.category ?? '').slice(0, 40),
    String(b.country ?? '').slice(0, 40),
    String(b.reason ?? '').slice(0, 500),
    String(b.links ?? '').slice(0, 500),
    now(),
  );
  run('INSERT OR IGNORE INTO request_votes (request_id, user_id) VALUES (?, ?)', id, user.id);
  res.json({ request: toRequest(get<RequestRow>('SELECT *, 1 AS voted FROM requests WHERE id = ?', id)!), merged: false });
});

communityRouter.post('/requests/:id/vote', ensureUser, (req: Request, res: Response) => {
  const row = get<RequestRow>('SELECT * FROM requests WHERE id = ?', String(req.params.id));
  if (!row) return void res.status(404).json({ error: 'not_found' });
  const inserted = run('INSERT OR IGNORE INTO request_votes (request_id, user_id) VALUES (?, ?)', row.id, req.user!.id);
  if (Number(inserted.changes) > 0) run('UPDATE requests SET votes = votes + 1 WHERE id = ?', row.id);
  res.json({ request: toRequest(get<RequestRow>('SELECT *, 1 AS voted FROM requests WHERE id = ?', row.id)!) });
});

const REPORT_REASONS = ['inappropriate', 'harmful', 'misleading', 'impersonation', 'hate', 'self-harm', 'other'];

communityRouter.post('/reports', ensureUser, (req: Request, res: Response) => {
  const b = req.body as { characterId?: string; conversationId?: string; reason?: string; details?: string; excerpt?: string };
  const reason = REPORT_REASONS.includes(String(b.reason)) ? String(b.reason) : 'other';
  const characterId = b.characterId && getCharacter(String(b.characterId), true) ? String(b.characterId) : null;
  run(
    'INSERT INTO reports (id, user_id, character_id, conversation_id, reason, details, excerpt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    randomUUID(),
    req.user!.id,
    characterId,
    b.conversationId ? String(b.conversationId).slice(0, 64) : null,
    reason,
    String(b.details ?? '').slice(0, 1000),
    String(b.excerpt ?? '').slice(0, 2000),
    now(),
  );
  res.json({ ok: true });
});

const RIGHTS_TYPES = ['removal', 'correction', 'licensing'];

communityRouter.post('/rights', attachUser, (req: Request, res: Response) => {
  const b = req.body as {
    characterId?: string;
    subjectName?: string;
    requesterName?: string;
    relationship?: string;
    email?: string;
    requestType?: string;
    details?: string;
  };
  const subject = String(b.subjectName ?? '').trim();
  const requester = String(b.requesterName ?? '').trim();
  const email = String(b.email ?? '').trim();
  if (!subject || !requester || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return void res.status(400).json({ error: 'bad_request', message: 'Please fill in the name, your name and a valid email.' });
  }
  run(
    'INSERT INTO rights_requests (id, character_id, subject_name, requester_name, relationship, email, request_type, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    randomUUID(),
    b.characterId ? String(b.characterId).slice(0, 64) : null,
    subject.slice(0, 120),
    requester.slice(0, 120),
    String(b.relationship ?? 'self').slice(0, 60),
    email.slice(0, 160),
    RIGHTS_TYPES.includes(String(b.requestType)) ? String(b.requestType) : 'removal',
    String(b.details ?? '').slice(0, 2000),
    now(),
  );
  res.json({ ok: true });
});
