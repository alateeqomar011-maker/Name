// Operator API (Bearer ADMIN_TOKEN): add/import/edit/disable characters without a rebuild, moderate
// reports, triage celebrity requests and rights-holder requests, and grant plans.

import express, { type Request, type Response, Router } from 'express';
import { requireAdmin, userById } from '../auth.ts';
import {
  allCharacters,
  characterStats,
  deleteCharacter,
  getCharacter,
  importCharacters,
  optOut,
  setEnabled,
  upsertCharacter,
  ValidationError,
  type CharacterInput,
} from '../catalog/catalog.ts';
import { optOutList } from '../catalog/optout.ts';
import { all, get, run } from '../db.ts';

export const adminRouter = Router();
adminRouter.use(requireAdmin, express.json({ limit: '5mb' }));

adminRouter.get('/overview', (_req: Request, res: Response) => {
  const count = (sql: string) => Number(get<{ n: number }>(sql)?.n ?? 0);
  res.json({
    characters: characterStats(),
    users: count('SELECT COUNT(*) AS n FROM users'),
    accounts: count('SELECT COUNT(*) AS n FROM users WHERE email IS NOT NULL'),
    premium: count("SELECT COUNT(*) AS n FROM users WHERE plan = 'premium'"),
    conversations: count('SELECT COUNT(*) AS n FROM conversations'),
    openReports: count("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
    openRequests: count("SELECT COUNT(*) AS n FROM requests WHERE status = 'open'"),
    openRights: count("SELECT COUNT(*) AS n FROM rights_requests WHERE status = 'open'"),
    moderationLast24h: count(`SELECT COUNT(*) AS n FROM moderation_log WHERE created_at >= '${new Date(Date.now() - 86400_000).toISOString()}'`),
    optOuts: optOutList(),
  });
});

adminRouter.get('/characters', (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').toLowerCase();
  const items = allCharacters(true)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.includes(q))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 200);
  res.json({ items });
});

adminRouter.get('/characters/:id', (req: Request, res: Response) => {
  const c = getCharacter(String(req.params.id), true);
  if (!c) return void res.status(404).json({ error: 'not_found' });
  res.json({ character: c });
});

function fail(res: Response, err: unknown): void {
  if (err instanceof ValidationError) res.status(400).json({ error: 'invalid', message: err.message });
  else {
    console.error(err);
    res.status(500).json({ error: 'server', message: 'Could not save the character.' });
  }
}

adminRouter.post('/characters', (req: Request, res: Response) => {
  try {
    res.json({ character: upsertCharacter(req.body as CharacterInput) });
  } catch (err) {
    fail(res, err);
  }
});

adminRouter.put('/characters/:id', (req: Request, res: Response) => {
  try {
    res.json({ character: upsertCharacter({ ...(req.body as CharacterInput), id: String(req.params.id) }) });
  } catch (err) {
    fail(res, err);
  }
});

adminRouter.post('/characters/:id/enabled', (req: Request, res: Response) => {
  const c = setEnabled(String(req.params.id), Boolean(req.body?.enabled));
  if (!c) return void res.status(404).json({ error: 'not_found' });
  res.json({ character: c });
});

adminRouter.delete('/characters/:id', (req: Request, res: Response) => {
  const outcome = deleteCharacter(String(req.params.id));
  if (!outcome) return void res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, outcome });
});

adminRouter.post('/import', (req: Request, res: Response) => {
  const list = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.characters) ? req.body.characters : null;
  if (!list) return void res.status(400).json({ error: 'invalid', message: 'Send an array of characters or { characters: [...] }.' });
  res.json(importCharacters(list.slice(0, 5000) as CharacterInput[]));
});

adminRouter.get('/reports', (_req: Request, res: Response) => {
  res.json({ items: all('SELECT * FROM reports ORDER BY created_at DESC LIMIT 300') });
});

adminRouter.patch('/reports/:id', (req: Request, res: Response) => {
  const status = ['open', 'reviewing', 'resolved', 'dismissed'].includes(String(req.body?.status)) ? String(req.body.status) : 'resolved';
  run('UPDATE reports SET status = ? WHERE id = ?', status, String(req.params.id));
  res.json({ ok: true });
});

adminRouter.get('/requests', (_req: Request, res: Response) => {
  res.json({ items: all('SELECT * FROM requests ORDER BY votes DESC, created_at DESC LIMIT 300') });
});

adminRouter.patch('/requests/:id', (req: Request, res: Response) => {
  const status = ['open', 'planned', 'added', 'declined'].includes(String(req.body?.status)) ? String(req.body.status) : 'open';
  run('UPDATE requests SET status = ? WHERE id = ?', status, String(req.params.id));
  res.json({ ok: true });
});

adminRouter.get('/rights', (_req: Request, res: Response) => {
  res.json({ items: all('SELECT * FROM rights_requests ORDER BY created_at DESC LIMIT 300') });
});

/** Approving a removal disables the character and adds the name to the do-not-simulate list. */
adminRouter.patch('/rights/:id', (req: Request, res: Response) => {
  const row = get<{ id: string; character_id: string | null; subject_name: string; request_type: string }>(
    'SELECT * FROM rights_requests WHERE id = ?',
    String(req.params.id),
  );
  if (!row) return void res.status(404).json({ error: 'not_found' });
  const status = ['open', 'approved', 'rejected', 'resolved'].includes(String(req.body?.status)) ? String(req.body.status) : 'resolved';
  run('UPDATE rights_requests SET status = ? WHERE id = ?', status, row.id);
  if (status === 'approved' && row.request_type === 'removal') optOut(row.subject_name, row.character_id ?? undefined);
  res.json({ ok: true });
});

adminRouter.get('/moderation', (_req: Request, res: Response) => {
  res.json({ items: all('SELECT * FROM moderation_log ORDER BY id DESC LIMIT 300') });
});

adminRouter.post('/users/:id/plan', (req: Request, res: Response) => {
  const user = userById(String(req.params.id));
  if (!user) return void res.status(404).json({ error: 'not_found' });
  const plan = req.body?.plan === 'premium' ? 'premium' : 'free';
  const until = typeof req.body?.until === 'string' ? req.body.until : null;
  run('UPDATE users SET plan = ?, plan_until = ? WHERE id = ?', plan, until, user.id);
  res.json({ ok: true });
});
