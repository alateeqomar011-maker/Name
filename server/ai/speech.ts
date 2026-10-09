// Speech synthesis (OpenAI / ElevenLabs stock voices, or a licensed replica when one is on file) and
// speech recognition (OpenAI transcription / Deepgram). When nothing is configured, the browser's own
// speech engines are used on the client instead.

import { hash } from '../catalog/define.ts';
import { config } from '../config.ts';
import type { Character } from '../../shared/types.ts';

export type TtsProvider = 'openai' | 'elevenlabs';
export type SttProvider = 'openai' | 'deepgram';

export function ttsProviders(): TtsProvider[] {
  const out: TtsProvider[] = [];
  if (config.elevenlabs.apiKey) out.push('elevenlabs');
  if (config.openai.apiKey) out.push('openai');
  const preferred = config.ttsProvider as TtsProvider;
  return out.includes(preferred) ? [preferred, ...out.filter((p) => p !== preferred)] : out;
}

export function sttProviders(): SttProvider[] {
  const out: SttProvider[] = [];
  if (config.deepgram.apiKey) out.push('deepgram');
  if (config.openai.apiKey) out.push('openai');
  return out;
}

export interface SpeechAudio {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  provider: TtsProvider;
  disclosure: 'synthetic' | 'licensed';
}

export class SpeechError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function styleInstructions(c: Character, emotion: string): string {
  const parts = [
    `Voice for a fictional AI character inspired by a ${c.role.toLowerCase()} (${c.traits.slice(0, 3).join(', ')}).`,
    `Energy: ${c.voice.energy}.`,
  ];
  if (c.voice.accent) parts.push(`Speak with a light ${c.voice.accent} accent.`);
  if (emotion && emotion !== 'neutral') parts.push(`Emotion for this line: ${emotion}.`);
  parts.push('Natural, conversational pacing like a friendly video call. This is an original synthetic voice: do not imitate any real person.');
  return parts.join(' ');
}

function licensedVoice(c: Character): string | null {
  return c.voice.authorized && c.voice.licenseRef && c.voice.elevenVoiceId ? c.voice.elevenVoiceId : null;
}

export async function synthesize(
  c: Character,
  text: string,
  opts: { lang: string; emotion?: string; signal?: AbortSignal },
): Promise<SpeechAudio> {
  const providers = ttsProviders();
  if (!providers.length) throw new SpeechError('No server speech provider is configured.', 501);
  const licensed = licensedVoice(c);
  // A licensed replica is only ever served from the provider it was licensed on.
  const order: TtsProvider[] = licensed && config.elevenlabs.apiKey ? ['elevenlabs'] : providers;
  let lastError: unknown;
  for (const provider of order) {
    try {
      if (provider === 'elevenlabs') return await elevenlabs(c, text, opts, licensed);
      return await openaiTts(c, text, opts);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof SpeechError ? lastError : new SpeechError('Speech synthesis failed.');
}

async function openaiTts(c: Character, text: string, opts: { lang: string; emotion?: string; signal?: AbortSignal }): Promise<SpeechAudio> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.openai.apiKey}` },
    body: JSON.stringify({
      model: config.openai.ttsModel,
      voice: c.voice.openaiVoice ?? (c.gender === 'f' ? 'coral' : 'ash'),
      input: text,
      instructions: styleInstructions(c, opts.emotion ?? 'neutral'),
      response_format: 'mp3',
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new SpeechError(`OpenAI speech failed (${res.status}).`);
  return { body: res.body, contentType: 'audio/mpeg', provider: 'openai', disclosure: 'synthetic' };
}

async function elevenlabs(
  c: Character,
  text: string,
  opts: { lang: string; emotion?: string; signal?: AbortSignal },
  licensed: string | null,
): Promise<SpeechAudio> {
  const pool = c.gender === 'f' ? config.elevenlabs.femaleVoices : config.elevenlabs.maleVoices;
  const voiceId = licensed ?? pool[hash(c.id) % pool.length];
  const energetic = c.voice.energy === 'energetic' || c.voice.energy === 'intense';
  const body: Record<string, unknown> = {
    text,
    model_id: config.elevenlabs.model,
    voice_settings: { stability: energetic ? 0.35 : 0.55, similarity_boost: 0.75, style: energetic ? 0.45 : 0.15, use_speaker_boost: true },
  };
  if (/flash|turbo/.test(config.elevenlabs.model)) body.language_code = opts.lang.slice(0, 2);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': config.elevenlabs.apiKey, accept: 'audio/mpeg' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new SpeechError(`ElevenLabs speech failed (${res.status}).`);
  return { body: res.body, contentType: 'audio/mpeg', provider: 'elevenlabs', disclosure: licensed ? 'licensed' : 'synthetic' };
}

export async function transcribe(audio: Buffer, contentType: string, lang: string, signal?: AbortSignal): Promise<string> {
  const providers = sttProviders();
  if (!providers.length) throw new SpeechError('No server speech recognition provider is configured.', 501);
  let lastError: unknown;
  for (const provider of providers) {
    try {
      return provider === 'deepgram' ? await deepgram(audio, contentType, lang, signal) : await openaiStt(audio, contentType, lang, signal);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof SpeechError ? lastError : new SpeechError('Transcription failed.');
}

async function openaiStt(audio: Buffer, contentType: string, lang: string, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  const ext = contentType.includes('wav') ? 'wav' : contentType.includes('ogg') ? 'ogg' : contentType.includes('mp4') ? 'mp4' : 'webm';
  form.append('file', new Blob([new Uint8Array(audio)], { type: contentType }), `speech.${ext}`);
  form.append('model', config.openai.sttModel);
  if (lang) form.append('language', lang.slice(0, 2));
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openai.apiKey}` },
    body: form,
    signal,
  });
  if (!res.ok) throw new SpeechError(`OpenAI transcription failed (${res.status}).`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

async function deepgram(audio: Buffer, contentType: string, lang: string, signal?: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ model: config.deepgram.model, smart_format: 'true', punctuate: 'true' });
  if (lang) params.set('language', lang.slice(0, 2));
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { authorization: `Token ${config.deepgram.apiKey}`, 'content-type': contentType },
    body: new Uint8Array(audio),
    signal,
  });
  if (!res.ok) throw new SpeechError(`Deepgram transcription failed (${res.status}).`);
  const data = (await res.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
  return (data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim();
}
