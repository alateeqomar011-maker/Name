import './env.ts';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { ChatStreamEvent } from '../shared/types.ts';
import { createApp } from '../server/index.ts';

let base = '';
let close: () => void = () => {};

before(async () => {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

/** A browser-like client that keeps the guest session cookie between requests. */
function client() {
  let cookie = '';
  return async (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const res = await fetch(base + path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { ...(init.body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? JSON.parse(text) : type.includes('event-stream') ? parseSse(text) : text;
    return { status: res.status, data, headers: res.headers };
  };
}

function parseSse(text: string): ChatStreamEvent[] {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)) as ChatStreamEvent);
}

function chatBody(text: string, extra: Record<string, unknown> = {}) {
  return { mode: 'text', scenario: 'hangout', characterIds: ['mohamed-salah'], lang: 'en', transcript: [{ speaker: 'user', text }], ...extra };
}

test('health reports offline mode and the catalogue size', async () => {
  const { status, data } = await client()('/api/health');
  assert.equal(status, 200);
  assert.equal(data.llm.provider, 'offline');
  assert.ok(data.catalogSize >= 400, `catalogue has ${data.catalogSize}`);
});

test('search matches aliases, Arabic names and filters', async () => {
  const api = client();
  const cr7 = await api('/api/characters?q=cr7');
  assert.equal(cr7.data.items[0].id, 'cristiano-ronaldo');
  const arabic = await api(`/api/characters?q=${encodeURIComponent('رونالدو')}`);
  assert.ok(arabic.data.items.some((c: { id: string }) => c.id === 'cristiano-ronaldo'));
  const mma = await api('/api/characters?category=mma&limit=100');
  assert.ok(mma.data.items.length >= 20);
  assert.ok(mma.data.items.every((c: { category: string }) => c.category === 'mma'));
  const gulf = await api('/api/characters?region=gulf&limit=100');
  assert.ok(gulf.data.total >= 20, `gulf has ${gulf.data.total}`);
});

test('public profiles never expose voice IDs or licence references', async () => {
  const { data } = await client()('/api/characters/lionel-messi');
  assert.equal(data.character.name, 'Lionel Messi');
  const json = JSON.stringify(data.character);
  assert.ok(!/elevenVoiceId|licenseRef/.test(json));
  assert.equal(data.character.likenessDetail.status, 'stylized');
  assert.equal(data.character.voice.licensed, false);
});

test('people on the do-not-simulate list are absent and cannot be requested', async () => {
  const api = client();
  const found = await api('/api/characters?q=taylor%20swift');
  assert.ok(!found.data.items.some((c: { name: string }) => c.name === 'Taylor Swift'));
  const req = await api('/api/requests', { body: { name: 'Taylor Swift' } });
  assert.equal(req.status, 422);
  assert.equal(req.data.error, 'opted_out');
});

test('celebrity requests dedupe existing characters and merge repeat requests into votes', async () => {
  const a = client();
  const b = client();
  assert.equal((await a('/api/requests', { body: { name: 'Lionel Messi' } })).status, 409);
  const first = await a('/api/requests', { body: { name: 'Zinedine Zidane Jr Test', category: 'football' } });
  assert.equal(first.status, 200);
  const second = await b('/api/requests', { body: { name: 'zinedine zidane jr test' } });
  assert.equal(second.data.merged, true);
  assert.equal(second.data.request.votes, 2);
});

test('conversations require an age check; under-13s are blocked and the age is locked', async () => {
  const api = client();
  const noAge = await api('/api/chat', { body: chatBody('hi') });
  assert.equal(noAge.status, 403);
  assert.equal(noAge.data.error, 'age_required');

  const child = client();
  const year = new Date().getFullYear();
  assert.equal((await child('/api/me', { method: 'PATCH', body: { birthYear: year - 10 } })).status, 200);
  const blocked = await child('/api/chat', { body: chatBody('hi') });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error, 'age_blocked');
  const relock = await child('/api/me', { method: 'PATCH', body: { birthYear: year - 30 } });
  assert.equal(relock.status, 409);
});

test('text chat streams a reply, saves the conversation and enforces the daily message limit', async () => {
  const api = client();
  await api('/api/me', { method: 'PATCH', body: { birthYear: 1995, displayName: 'Omar' } });

  const first = await api('/api/chat', { body: chatBody('Are you the real Salah?') });
  assert.equal(first.status, 200);
  const events = first.data as ChatStreamEvent[];
  const meta = events.find((e) => e.type === 'meta');
  const done = events.find((e) => e.type === 'done');
  assert.ok(meta && meta.type === 'meta' && meta.provider === 'offline');
  assert.ok(events.some((e) => e.type === 'delta'));
  assert.ok(done && done.type === 'done' && /AI simulation/.test(done.text));

  // The client owns the transcript (it knows what was actually spoken) and saves it.
  const saved = await api(`/api/conversations/${meta.conversationId}`, {
    method: 'PUT',
    body: { lines: [{ speaker: 'user', text: 'Are you the real Salah?' }, { speaker: 'mohamed-salah', text: done.text }, { speaker: 'lionel-messi', text: 'spoofed' }] },
  });
  assert.equal(saved.status, 200);
  const list = await api('/api/conversations');
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].id, meta.conversationId);
  const detail = await api(`/api/conversations/${meta.conversationId}`);
  // Lines from characters who weren't on the call are dropped.
  assert.equal(detail.data.lines.length, 2);
  // Other users can't read it.
  assert.equal((await client()(`/api/conversations/${meta.conversationId}`)).status, 404);

  // FREE_MESSAGES is 3 in tests: two more messages are allowed, the fourth hits the limit.
  for (let i = 0; i < 2; i++) {
    const ok = await api('/api/chat', { body: chatBody(`Message ${i}`, { conversationId: meta.conversationId }) });
    assert.ok((ok.data as ChatStreamEvent[]).some((e) => e.type === 'done'));
  }
  const limited = await api('/api/chat', { body: chatBody('One more', { conversationId: meta.conversationId }) });
  const limit = (limited.data as ChatStreamEvent[])[0];
  assert.equal(limit.type, 'limit');
  assert.ok(limit.type === 'limit' && limit.metric === 'messages');
});

test('self-harm messages get a crisis response instead of an in-character reply', async () => {
  const api = client();
  await api('/api/me', { method: 'PATCH', body: { birthYear: 1990 } });
  const res = await api('/api/chat', { body: chatBody('I want to kill myself') });
  const events = res.data as ChatStreamEvent[];
  const moderated = events.find((e) => e.type === 'moderated');
  assert.ok(moderated && moderated.type === 'moderated');
  assert.match(moderated.text, /AI/);
  assert.ok(!events.some((e) => e.type === 'delta'));
});

test('admin API requires the token and adds characters live without a rebuild', async () => {
  const api = client();
  assert.equal((await api('/api/admin/overview')).status, 401);
  const auth = { authorization: 'Bearer test-admin-token' };
  const created = await api('/api/admin/characters', {
    headers: auth,
    body: { name: 'Test Rising Star', category: 'creators', country: 'SA', gender: 'f', role: 'Creator', knownFor: 'testing the admin API', traits: ['curious'] },
  });
  assert.equal(created.status, 200);
  const id = created.data.character.id;
  assert.equal((await api(`/api/characters/${id}`)).status, 200);
  assert.ok((await api('/api/characters?q=test%20rising')).data.items.some((c: { id: string }) => c.id === id));

  // Without a licence reference, a "licensed" voice or likeness falls back to synthetic/stylised.
  const unlicensed = await api(`/api/admin/characters/${id}`, {
    method: 'PUT',
    headers: auth,
    body: { voice: { authorized: true, elevenVoiceId: 'abc' }, likeness: { status: 'licensed', provider: 'did', sourceRef: 'https://example.com/a.jpg' } },
  });
  assert.equal(unlicensed.status, 200);
  assert.equal(unlicensed.data.character.voice.authorized, false);
  assert.equal(unlicensed.data.character.likeness.status, 'stylized');

  // Opted-out people can't be added through the admin API either.
  const optedOut = await api('/api/admin/characters', { headers: auth, body: { name: 'Keanu Reeves', category: 'actors', country: 'CA', gender: 'm', role: 'Actor', knownFor: 'x', traits: ['calm'] } });
  assert.equal(optedOut.status, 400);

  const removed = await api(`/api/admin/characters/${id}`, { method: 'DELETE', headers: auth });
  assert.equal(removed.data.outcome, 'deleted');
  assert.equal((await api(`/api/characters/${id}`)).status, 404);
});
