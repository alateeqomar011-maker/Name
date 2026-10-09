// Typed client for the Starcall API.

import type {
  CelebrityRequest,
  CharacterSummary,
  ChatRequest,
  ChatStreamEvent,
  ConversationDetail,
  ConversationSummary,
  HealthInfo,
  Me,
  SearchParams,
  SearchResult,
  TranscriptLine,
  UsageSnapshot,
} from '../../shared/types.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  data: Record<string, unknown>;
  constructor(status: number, code: string, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? `Request failed (${res.status})`), data);
  }
  return data as T;
}

export interface CharacterProfile extends CharacterSummary {
  aliases: string[];
  traits: string[];
  catchphrases: string[];
  topics: string[];
  voice: { pitch: number; rate: number; energy: string; accent?: string; licensed: boolean };
  likenessDetail: { status: 'stylized' | 'licensed'; provider?: string };
}

export interface Rail {
  id: string;
  title: string;
  titleAr?: string;
  kind?: string;
  items: CharacterSummary[];
}

export const api = {
  health: () => request<HealthInfo>('GET', '/health'),
  me: () => request<{ me: Me; usage: UsageSnapshot }>('GET', '/me'),
  updateMe: (patch: { displayName?: string; birthYear?: number; contentLevel?: string }) =>
    request<{ me: Me; usage: UsageSnapshot }>('PATCH', '/me', patch),
  signUp: (email: string, password: string, displayName?: string) =>
    request<{ me: Me; usage: UsageSnapshot }>('POST', '/auth/signup', { email, password, displayName }),
  logIn: (email: string, password: string) => request<{ me: Me; usage: UsageSnapshot }>('POST', '/auth/login', { email, password }),
  logOut: () => request<{ ok: true }>('POST', '/auth/logout', {}),
  usage: () => request<UsageSnapshot>('GET', '/usage'),

  home: () => request<{ rails: Rail[] }>('GET', '/home'),
  search: (p: SearchParams) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') q.set(k, String(v));
    return request<SearchResult>('GET', `/characters?${q}`);
  },
  character: (id: string) => request<{ character: CharacterProfile; related: CharacterSummary[] }>('GET', `/characters/${encodeURIComponent(id)}`),
  characters: (ids: string[]) => request<{ items: CharacterProfile[] }>('POST', '/characters/batch', { ids }),
  categories: () => request<{ categories: { id: string; label: string; labelAr: string; count: number }[] }>('GET', '/categories'),

  favorite: (id: string, on: boolean) => request<{ me: Me }>(on ? 'PUT' : 'DELETE', `/favorites/${encodeURIComponent(id)}`),

  conversations: () => request<{ items: ConversationSummary[] }>('GET', '/conversations'),
  conversation: (id: string) => request<ConversationDetail>('GET', `/conversations/${encodeURIComponent(id)}`),
  saveTranscript: (id: string, lines: TranscriptLine[]) => request<{ ok: true }>('PUT', `/conversations/${encodeURIComponent(id)}`, { lines }),
  deleteConversation: (id: string) => request<{ ok: true }>('DELETE', `/conversations/${encodeURIComponent(id)}`),
  deleteAllConversations: () => request<{ ok: true }>('DELETE', '/conversations'),
  heartbeat: (id: string) => request<{ ok: true; usage: UsageSnapshot; exhausted?: boolean }>('POST', `/calls/${encodeURIComponent(id)}/heartbeat`, {}),

  translate: (texts: string[], target: string) => request<{ translations: string[] }>('POST', '/translate', { texts, target }),
  greetingScript: (b: { characterId: string; recipient: string; occasion: string; lang: string; tone: string; details?: string }) =>
    request<{ script: string; ai: boolean; usage: UsageSnapshot; provider: string }>('POST', '/greetings/script', b),

  requests: () => request<{ items: CelebrityRequest[] }>('GET', '/requests'),
  submitRequest: (b: { name: string; category: string; country: string; reason: string; links: string }) =>
    request<{ request: CelebrityRequest; merged: boolean }>('POST', '/requests', b),
  vote: (id: string) => request<{ request: CelebrityRequest }>('POST', `/requests/${encodeURIComponent(id)}/vote`, {}),
  report: (b: { characterId?: string; conversationId?: string; reason: string; details?: string; excerpt?: string }) =>
    request<{ ok: true }>('POST', '/reports', b),
  rights: (b: Record<string, string>) => request<{ ok: true }>('POST', '/rights', b),

  checkout: () => request<{ url: string }>('POST', '/billing/checkout', {}),
  portal: () => request<{ url: string }>('POST', '/billing/portal', {}),
  billingStatus: () => request<{ configured: boolean; me: Me }>('GET', '/billing/status'),
};

/** Streams a character's reply as server-sent events over a POST request. */
export async function streamChat(body: ChatRequest, onEvent: (e: ChatStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'Chat failed'), data);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as ChatStreamEvent);
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}
