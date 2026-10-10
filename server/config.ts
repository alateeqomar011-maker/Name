// Runtime configuration from environment variables. Everything optional has a safe default so the
// app runs locally without any keys (AI features then report that they are not configured).

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal .env loader (no dependency): KEY=VALUE lines, # comments, optional quotes.
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const env = process.env;

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const config = {
  port: int(env.PORT, 8787),
  production: env.NODE_ENV === 'production',
  // RENDER_EXTERNAL_URL is set automatically on Render (see render.yaml).
  publicUrl: env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${int(env.PORT, 8787)}`,
  dataDir: resolve(env.DATA_DIR ?? './data'),
  sessionSecret: env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
  adminToken: env.ADMIN_TOKEN ?? '',

  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY ?? '',
    authToken: env.ANTHROPIC_AUTH_TOKEN ?? '',
    model: env.LLM_MODEL ?? 'claude-opus-5-5',
    /** Model for captions translation and video-greeting scripts. */
    utilityModel: env.LLM_UTILITY_MODEL ?? env.LLM_MODEL ?? 'claude-opus-5-5',
    /** Server-side refusal fallback (Claude API only). Set LLM_FALLBACKS=off to disable. */
    fallbacks: env.LLM_FALLBACKS !== 'off',
  },

  openai: {
    apiKey: env.OPENAI_API_KEY ?? '',
    ttsModel: env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
    sttModel: env.OPENAI_STT_MODEL ?? 'gpt-4o-mini-transcribe',
    moderation: env.OPENAI_MODERATION !== 'off',
  },

  elevenlabs: {
    apiKey: env.ELEVENLABS_API_KEY ?? '',
    model: env.ELEVENLABS_MODEL ?? 'eleven_flash_v2_5',
    // Stock library voices (not clones). Override with your own licensed or stock voice ids.
    maleVoices: list(env.ELEVENLABS_VOICES_MALE).length
      ? list(env.ELEVENLABS_VOICES_MALE)
      : ['nPczCjzI2devNBz1zQrb', 'TX3LPaxmHKxFdv7VOQHJ', 'iP95p4xoKVk53GoZ742B', 'JBFqnCBsd6RMkjVDRZzb', 'cjVigY5qzO86Huf0OWal', 'onwK4e9ZLuTAKqWW03F9'],
    femaleVoices: list(env.ELEVENLABS_VOICES_FEMALE).length
      ? list(env.ELEVENLABS_VOICES_FEMALE)
      : ['EXAVITQu4vr4xnSDxMaL', 'FGY2WhTYpPnrIDTdsKH5', 'XB0fDUnXU5powFXDhCwa', 'Xb7hH8MSUJpSbSDYk0k2', 'cgSgspJ2msm6clMCkdW9', 'pFZP5JQG7iQjIQuC4Bku'],
  },

  deepgram: {
    apiKey: env.DEEPGRAM_API_KEY ?? '',
    model: env.DEEPGRAM_MODEL ?? 'nova-3',
  },

  /** Preferred server TTS provider when several are configured. */
  ttsProvider: env.TTS_PROVIDER ?? '',

  did: {
    apiKey: env.DID_API_KEY ?? '',
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY ?? '',
    priceId: env.STRIPE_PRICE_ID ?? '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
  },

  limits: {
    free: {
      callSeconds: int(env.FREE_CALL_SECONDS, 15 * 60),
      messages: int(env.FREE_MESSAGES, 60),
      groupCalls: int(env.FREE_GROUP_CALLS, 3),
      greetings: int(env.FREE_GREETINGS, 2),
    },
    premium: {
      callSeconds: int(env.PREMIUM_CALL_SECONDS, 6 * 60 * 60),
      messages: int(env.PREMIUM_MESSAGES, 2000),
      groupCalls: int(env.PREMIUM_GROUP_CALLS, 100),
      greetings: int(env.PREMIUM_GREETINGS, 50),
    },
  },
};

export type Config = typeof config;

export function llmConfigured(): boolean {
  return Boolean(config.anthropic.apiKey || config.anthropic.authToken);
}
