// Real-time conversation endpoints: streamed replies, speech, captions translation, call heartbeats.

import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, Router } from 'express';
import { isScenario, SCENARIO_MAP } from '../../shared/scenarios.ts';
import type { CallMode, Character, ChatRequest, ChatStreamEvent } from '../../shared/types.ts';
import { buildMessages, stripSpeakerLabel } from '../ai/conversation.ts';
import { describeLlmError, isAbort, llmConfigured, streamReply } from '../ai/llm.ts';
import { moderate } from '../ai/moderation.ts';
import { offlineReply, streamOffline } from '../ai/offline.ts';
import { buildSystemPrompt } from '../ai/persona.ts';
import { SpeechError, synthesize, transcribe } from '../ai/speech.ts';
import { greetingScript, translate } from '../ai/utility.ts';
import { ageBand, effectiveContentLevel, ensureUser, requireAgeCleared } from '../auth.ts';
import { getCharacter, recordCall } from '../catalog/catalog.ts';
import { config } from '../config.ts';
import { get, now, run, today } from '../db.ts';
import { consume, hasAllowance, remaining, snapshot } from '../usage.ts';

export const chatRouter = Router();

const MODES: CallMode[] = ['video', 'voice', 'text', 'group'];

function sse(res: Response, event: ChatStreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function bad(res: Response, message: string, status = 400): void {
  res.status(status).json({ error: 'bad_request', message });
}

interface ConversationRow {
  id: string;
  user_id: string;
  mode: CallMode;
  character_ids: string;
}

function conversationTitle(chars: Character[], mode: CallMode): string {
  const names = chars.map((c) => c.name);
  const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(' & ');
  const kind = mode === 'text' ? 'Chat' : mode === 'voice' ? 'Voice call' : mode === 'group' ? 'Group call' : 'Video call';
  return `${kind} with ${who}`;
}

chatRouter.post('/chat', ensureUser, requireAgeCleared, express.json({ limit: '256kb' }), async (req: Request, res: Response) => {
  const user = req.user!;
  const body = req.body as ChatRequest;
  const ids = Array.isArray(body.characterIds) ? body.characterIds.slice(0, 6).map(String) : [];
  const chars = ids.map((id) => getCharacter(id)).filter((c): c is Character => Boolean(c));
  if (!chars.length || chars.length !== ids.length) return bad(res, 'Unknown or unavailable character.');
  const mode = MODES.includes(body.mode) ? body.mode : 'video';
  const scenarioId = isScenario(body.scenario) ? body.scenario : 'hangout';
  const scenario = SCENARIO_MAP[scenarioId];
  if (scenario.groupOnly && chars.length < 2) return bad(res, 'That scenario needs a group call.');
  const speaker = chars.find((c) => c.id === (body.speakerId ?? chars[0].id));
  if (!speaker) return bad(res, 'Speaker is not on this call.');
  const lang = typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'en';
  const transcript = Array.isArray(body.transcript)
    ? body.transcript
        .filter((l) => l && typeof l.text === 'string' && typeof l.speaker === 'string')
        .map((l) => ({ speaker: l.speaker, text: l.text.slice(0, 4000), interrupted: Boolean(l.interrupted) }))
    : [];
  const teen = ageBand(user.birth_year) === 'teen';

  // Usage limits: text chats count messages; calls are metered by heartbeat seconds.
  const isText = mode === 'text';
  const lastLine = transcript[transcript.length - 1];
  const isUserTurn = lastLine?.speaker === 'user' && !body.cue;
  if (isText && isUserTurn && !hasAllowance(user, 'messages')) {
    res.status(200).setHeader('content-type', 'text/event-stream');
    sse(res, { type: 'limit', metric: 'messages', usage: snapshot(user) });
    return res.end();
  }
  if (!isText && remaining(user, 'callSeconds') <= 0) {
    res.status(200).setHeader('content-type', 'text/event-stream');
    sse(res, { type: 'limit', metric: 'callSeconds', usage: snapshot(user) });
    return res.end();
  }

  // Conversation record (created on the first request of a call/chat).
  let conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
  const existing = conversationId
    ? get<ConversationRow>('SELECT id, user_id, mode, character_ids FROM conversations WHERE id = ?', conversationId)
    : undefined;
  if (!existing || existing.user_id !== user.id) {
    if (mode === 'group') {
      if (!hasAllowance(user, 'groupCalls')) {
        res.status(200).setHeader('content-type', 'text/event-stream');
        sse(res, { type: 'limit', metric: 'groupCalls', usage: snapshot(user) });
        return res.end();
      }
      consume(user, 'groupCalls');
    }
    conversationId = randomUUID();
    run(
      'INSERT INTO conversations (id, user_id, mode, scenario, character_ids, title, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      conversationId,
      user.id,
      mode,
      scenarioId,
      JSON.stringify(ids),
      conversationTitle(chars, mode),
      lang,
      now(),
      now(),
    );
    recordCall(ids);
  }

  res.status(200);
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('x-accel-buffering', 'no');
  res.flushHeaders();
  const provider = llmConfigured() ? 'anthropic' : 'offline';
  sse(res, { type: 'meta', conversationId, provider });

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  if (isUserTurn) {
    const verdict = await moderate(lastLine.text, { lang, userId: user.id, characterId: speaker.id });
    if (verdict.action !== 'allow') {
      sse(res, { type: 'moderated', reason: verdict.category ?? verdict.action, text: verdict.reply ?? '' });
      sse(res, { type: 'done', text: verdict.reply ?? '' });
      return res.end();
    }
    if (isText) consume(user, 'messages');
  }

  const system = buildSystemPrompt({
    character: speaker,
    mode,
    scenario: scenarioId,
    lang,
    contentLevel: effectiveContentLevel(user),
    teen,
    userName: user.display_name || undefined,
    others: chars.filter((c) => c.id !== speaker.id),
    sceneSetup: typeof body.sceneSetup === 'string' ? body.sceneSetup : undefined,
    today: today(),
  });
  const messages = buildMessages({
    speaker,
    participants: chars,
    transcript,
    cue: body.cue,
    userLabel: user.display_name || 'User',
  });

  // In group calls, hold back the first characters so a "Name:" label can be stripped.
  const group = chars.length > 1;
  let held = '';
  let released = !group;
  const emit = (delta: string) => {
    if (released) return sse(res, { type: 'delta', text: delta });
    held += delta;
    if (held.length > 48 || /[.!?\n]/.test(held)) {
      released = true;
      const clean = stripSpeakerLabel(held, speaker);
      if (clean) sse(res, { type: 'delta', text: clean });
    }
  };

  try {
    let full = '';
    if (provider === 'anthropic') {
      const result = await streamReply(
        { system, messages, effort: 'low', maxTokens: isText ? 8192 : 4096, signal: controller.signal },
        (delta) => {
          full += delta;
          emit(delta);
        },
      );
      if (result.stopReason === 'refusal' && !full.trim()) {
        full = lang === 'ar' ? 'خلّينا نغيّر الموضوع — اسألني عن شيء ثاني!' : "Let's switch topics — ask me something else!";
        emit(full);
      }
    } else {
      const turn = transcript.filter((l) => l.speaker === speaker.id).length;
      const text = offlineReply({
        character: speaker,
        scenario: scenarioId,
        lang,
        userText: body.cue === 'greet' ? '' : (lastLine?.text ?? ''),
        turn,
        userName: user.display_name || undefined,
        others: chars.filter((c) => c.id !== speaker.id),
      });
      await streamOffline(text, (d) => {
        full += d;
        emit(d);
      }, controller.signal);
    }
    if (!released && held) {
      released = true;
      sse(res, { type: 'delta', text: stripSpeakerLabel(held, speaker) });
    }
    run('UPDATE conversations SET updated_at = ? WHERE id = ?', now(), conversationId);
    sse(res, { type: 'done', text: group ? stripSpeakerLabel(full, speaker) : full });
  } catch (err) {
    if (!isAbort(err)) {
      console.error('chat stream failed:', err);
      sse(res, { type: 'error', message: describeLlmError(err) });
    }
  }
  res.end();
});

// Call metering: the client pings every ~15s while a call is live.
chatRouter.post('/calls/:id/heartbeat', ensureUser, (req: Request, res: Response) => {
  const user = req.user!;
  const row = get<{ id: string; user_id: string; last_heartbeat: number | null; mode: CallMode }>(
    'SELECT id, user_id, last_heartbeat, mode FROM conversations WHERE id = ?',
    String(req.params.id),
  );
  if (!row || row.user_id !== user.id) return void res.status(404).json({ error: 'not_found' });
  if (row.mode === 'text') return void res.json({ ok: true, usage: snapshot(user) });
  const nowMs = Date.now();
  const last = row.last_heartbeat ? Number(row.last_heartbeat) : nowMs;
  const delta = Math.min(30, Math.max(0, Math.round((nowMs - last) / 1000)));
  consume(user, 'callSeconds', delta);
  run('UPDATE conversations SET last_heartbeat = ?, duration_sec = duration_sec + ?, updated_at = ? WHERE id = ?', nowMs, delta, now(), row.id);
  const usage = snapshot(user);
  res.json({ ok: true, usage, exhausted: usage.used.callSeconds >= usage.limits.callSeconds });
});

chatRouter.post('/tts', ensureUser, requireAgeCleared, express.json({ limit: '16kb' }), async (req: Request, res: Response) => {
  const { characterId, text, lang, emotion } = req.body as { characterId?: string; text?: string; lang?: string; emotion?: string };
  const character = characterId ? getCharacter(String(characterId)) : undefined;
  if (!character) return bad(res, 'Unknown character.');
  const clean = String(text ?? '').trim().slice(0, 700);
  if (!clean) return bad(res, 'Nothing to say.');
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    const audio = await synthesize(character, clean, { lang: String(lang ?? 'en'), emotion: String(emotion ?? 'neutral'), signal: controller.signal });
    res.setHeader('content-type', audio.contentType);
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-voice-provider', audio.provider);
    res.setHeader('x-voice-disclosure', audio.disclosure);
    const reader = audio.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) return;
    const status = err instanceof SpeechError ? err.status : 502;
    if (!res.headersSent) res.status(status).json({ error: 'tts_failed', message: err instanceof Error ? err.message : 'Speech failed.' });
    else res.end();
  }
});

chatRouter.post(
  '/stt',
  ensureUser,
  requireAgeCleared,
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '12mb' }),
  async (req: Request, res: Response) => {
    const audio = req.body as Buffer;
    if (!Buffer.isBuffer(audio) || audio.length < 1000) return void res.json({ text: '' });
    try {
      const text = await transcribe(audio, String(req.headers['content-type'] ?? 'audio/webm'), String(req.query.lang ?? 'en'));
      res.json({ text });
    } catch (err) {
      const status = err instanceof SpeechError ? err.status : 502;
      res.status(status).json({ error: 'stt_failed', message: err instanceof Error ? err.message : 'Transcription failed.' });
    }
  },
);

chatRouter.post('/translate', ensureUser, express.json({ limit: '64kb' }), async (req: Request, res: Response) => {
  const { texts, target } = req.body as { texts?: string[]; target?: string };
  if (!Array.isArray(texts) || !texts.length || typeof target !== 'string') return bad(res, 'texts and target are required.');
  const lines = texts.slice(0, 20).map((t) => String(t).slice(0, 800));
  const out = await translate(lines, target.slice(0, 5));
  if (!out) return void res.status(501).json({ error: 'translate_unavailable', message: 'Translation needs an AI provider.' });
  res.json({ translations: out });
});

chatRouter.post('/greetings/script', ensureUser, requireAgeCleared, express.json({ limit: '16kb' }), async (req: Request, res: Response) => {
  const user = req.user!;
  const b = req.body as { characterId?: string; recipient?: string; occasion?: string; lang?: string; tone?: string; details?: string };
  const character = b.characterId ? getCharacter(String(b.characterId)) : undefined;
  if (!character) return bad(res, 'Unknown character.');
  if (!hasAllowance(user, 'greetings')) {
    return void res.status(429).json({ error: 'limit', metric: 'greetings', usage: snapshot(user) });
  }
  const recipient = String(b.recipient ?? '').trim();
  if (!recipient) return bad(res, 'Who is the greeting for?');
  const details = String(b.details ?? '');
  const verdict = await moderate(`${recipient} ${details}`, { lang: String(b.lang ?? 'en'), userId: user.id, characterId: character.id });
  if (verdict.action !== 'allow') return void res.status(422).json({ error: 'moderated', message: verdict.reply });
  const result = await greetingScript(character, {
    recipient,
    occasion: String(b.occasion ?? 'hello'),
    lang: String(b.lang ?? 'en'),
    tone: String(b.tone ?? 'warm'),
    details,
  });
  consume(user, 'greetings');
  res.json({ ...result, usage: snapshot(user), provider: result.ai ? 'anthropic' : 'offline' });
});

export function chatConfigured(): { llm: boolean; model: string } {
  return { llm: llmConfigured(), model: config.anthropic.model };
}
