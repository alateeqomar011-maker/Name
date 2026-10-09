// Photoreal streaming avatars through D-ID Talks Streams (WebRTC), proxied so the API key stays on the
// server. Only characters whose likeness is marked "licensed" (with a licence reference and an
// authorised source image) can use it; everyone else gets the built-in stylised avatar.

import express, { type Request, type Response, Router } from 'express';
import { ensureUser, requireAgeCleared } from '../auth.ts';
import { getCharacter } from '../catalog/catalog.ts';
import { config } from '../config.ts';
import type { Character } from '../../shared/types.ts';

export const avatarRouter = Router();
avatarRouter.use('/avatar', express.json({ limit: '64kb' }));

const DID_URL = 'https://api.d-id.com/talks/streams';

export function avatarProviders(): string[] {
  return config.did.apiKey ? ['did'] : [];
}

function licensedForDid(c: Character | undefined): c is Character {
  return Boolean(c && c.likeness.status === 'licensed' && c.likeness.provider === 'did' && c.likeness.sourceRef && c.likeness.licenseRef);
}

// stream id -> owner user id, so the proxy can't be used to drive other people's sessions.
const owners = new Map<string, { userId: string; characterId: string; created: number }>();

function didHeaders(): Record<string, string> {
  return { authorization: `Basic ${config.did.apiKey}`, 'content-type': 'application/json' };
}

async function did(path: string, method: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${DID_URL}${path}`, { method, headers: didHeaders(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

const MS_VOICES: Record<string, [string, string]> = {
  en: ['en-US-AndrewNeural', 'en-US-JennyNeural'],
  ar: ['ar-SA-HamedNeural', 'ar-SA-ZariyahNeural'],
  es: ['es-ES-AlvaroNeural', 'es-ES-ElviraNeural'],
  pt: ['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural'],
  fr: ['fr-FR-HenriNeural', 'fr-FR-DeniseNeural'],
  de: ['de-DE-ConradNeural', 'de-DE-KatjaNeural'],
  it: ['it-IT-DiegoNeural', 'it-IT-ElsaNeural'],
  tr: ['tr-TR-AhmetNeural', 'tr-TR-EmelNeural'],
};

function ownStream(req: Request, res: Response): { userId: string; characterId: string } | null {
  const entry = owners.get(String(req.params.id));
  if (!entry || entry.userId !== req.user!.id) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  return entry;
}

avatarRouter.post('/avatar/did/streams', ensureUser, requireAgeCleared, async (req: Request, res: Response) => {
  const c = getCharacter(String(req.body?.characterId ?? ''));
  if (!config.did.apiKey) return void res.status(501).json({ error: 'avatar_disabled', message: 'No photoreal avatar provider is configured.' });
  if (!licensedForDid(c)) return void res.status(403).json({ error: 'not_licensed', message: 'This character uses the stylised avatar.' });
  const { status, data } = await did('', 'POST', { source_url: c.likeness.sourceRef, stream_warmup: true });
  if (status >= 300) return void res.status(502).json({ error: 'provider', detail: data });
  const d = data as { id: string; offer: unknown; ice_servers: unknown; session_id: string };
  owners.set(d.id, { userId: req.user!.id, characterId: c.id, created: Date.now() });
  res.json({ id: d.id, offer: d.offer, iceServers: d.ice_servers, sessionId: d.session_id });
});

avatarRouter.post('/avatar/did/streams/:id/sdp', ensureUser, async (req: Request, res: Response) => {
  if (!ownStream(req, res)) return;
  const { status, data } = await did(`/${encodeURIComponent(String(req.params.id))}/sdp`, 'POST', {
    answer: req.body?.answer,
    session_id: req.body?.sessionId,
  });
  res.status(status >= 300 ? 502 : 200).json(data ?? {});
});

avatarRouter.post('/avatar/did/streams/:id/ice', ensureUser, async (req: Request, res: Response) => {
  if (!ownStream(req, res)) return;
  const b = req.body ?? {};
  const payload = b.candidate
    ? { candidate: b.candidate, sdpMid: b.sdpMid, sdpMLineIndex: b.sdpMLineIndex, session_id: b.sessionId }
    : { session_id: b.sessionId };
  const { status, data } = await did(`/${encodeURIComponent(String(req.params.id))}/ice`, 'POST', payload);
  res.status(status >= 300 ? 502 : 200).json(data ?? {});
});

avatarRouter.post('/avatar/did/streams/:id/talk', ensureUser, async (req: Request, res: Response) => {
  const entry = ownStream(req, res);
  if (!entry) return;
  const c = getCharacter(entry.characterId);
  if (!licensedForDid(c)) return void res.status(403).json({ error: 'not_licensed' });
  const text = String(req.body?.text ?? '').slice(0, 700);
  const lang = String(req.body?.lang ?? 'en').slice(0, 2);
  const voices = MS_VOICES[lang] ?? MS_VOICES.en;
  const { status, data } = await did(`/${encodeURIComponent(String(req.params.id))}`, 'POST', {
    script: { type: 'text', input: text, provider: { type: 'microsoft', voice_id: c.gender === 'f' ? voices[1] : voices[0] } },
    config: { stitch: true },
    session_id: req.body?.sessionId,
  });
  res.status(status >= 300 ? 502 : 200).json(data ?? {});
});

avatarRouter.delete('/avatar/did/streams/:id', ensureUser, async (req: Request, res: Response) => {
  if (!ownStream(req, res)) return;
  await did(`/${encodeURIComponent(String(req.params.id))}`, 'DELETE', { session_id: req.body?.sessionId });
  owners.delete(String(req.params.id));
  res.json({ ok: true });
});

// Forget abandoned streams after an hour.
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [id, e] of owners) if (e.created < cutoff) owners.delete(id);
}, 600_000).unref();
