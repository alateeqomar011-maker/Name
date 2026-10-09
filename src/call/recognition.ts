// Speech recognition: the browser's built-in engine (live interim results) or server transcription of
// VAD-detected utterances (works in every browser that can record audio).

import { bcp47 } from '../../shared/countries.ts';
import { encodeWav } from './mic.ts';

export interface RecognitionHooks {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(kind: 'denied' | 'unsupported' | 'network' | 'other', message?: string): void;
}

export interface Recognizer {
  readonly kind: 'browser' | 'server';
  start(): void;
  stop(): void;
  setLang(lang: string): void;
  dispose(): void;
}

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
};

function SpeechRecognitionCtor(): (new () => SR) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserRecognitionSupported(): boolean {
  return SpeechRecognitionCtor() !== null;
}

export class BrowserRecognizer implements Recognizer {
  readonly kind = 'browser' as const;
  private rec: SR | null = null;
  private active = false;
  private lang: string;
  private readonly hooks: RecognitionHooks;
  private restartTimer = 0;
  private failures = 0;

  constructor(lang: string, hooks: RecognitionHooks) {
    this.lang = lang;
    this.hooks = hooks;
  }

  private create(): SR | null {
    const Ctor = SpeechRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = bcp47(this.lang);
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      this.failures = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (r.isFinal) this.hooks.onFinal(text);
        else interim += `${text} `;
      }
      if (interim) this.hooks.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false;
        this.hooks.onError('denied', e.message);
      } else if (e.error === 'network') {
        this.failures++;
        if (this.failures > 2) {
          this.active = false;
          this.hooks.onError('network', e.message);
        }
      } else if (e.error === 'language-not-supported') {
        this.active = false;
        this.hooks.onError('unsupported', e.message);
      }
    };
    rec.onend = () => {
      // Engines stop after silence or ~60s; keep listening while the call is live.
      if (this.active) this.restartTimer = window.setTimeout(() => this.safeStart(), 150);
    };
    return rec;
  }

  private safeStart(): void {
    if (!this.active) return;
    try {
      this.rec = this.rec ?? this.create();
      this.rec?.start();
    } catch {
      /* already started */
    }
  }

  start(): void {
    if (!SpeechRecognitionCtor()) {
      this.hooks.onError('unsupported');
      return;
    }
    this.active = true;
    this.safeStart();
  }

  stop(): void {
    this.active = false;
    clearTimeout(this.restartTimer);
    try {
      this.rec?.stop();
    } catch {
      /* not running */
    }
  }

  setLang(lang: string): void {
    this.lang = lang;
    const wasActive = this.active;
    this.stop();
    try {
      this.rec?.abort();
    } catch {
      /* ignore */
    }
    this.rec = null;
    if (wasActive) this.start();
  }

  dispose(): void {
    this.stop();
    try {
      this.rec?.abort();
    } catch {
      /* ignore */
    }
    this.rec = null;
  }
}

/** Transcribes utterances delivered by the microphone VAD via /api/stt. */
export class ServerRecognizer implements Recognizer {
  readonly kind = 'server' as const;
  private lang: string;
  private readonly hooks: RecognitionHooks;
  private active = false;
  private inflight = 0;

  constructor(lang: string, hooks: RecognitionHooks) {
    this.lang = lang;
    this.hooks = hooks;
  }

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  setLang(lang: string): void {
    this.lang = lang;
  }

  dispose(): void {
    this.active = false;
  }

  /** Called by MicInput when the user starts talking. */
  speechStarted(): void {
    if (this.active) this.hooks.onInterim('…');
  }

  async transcribe(pcm: Float32Array, sampleRate: number): Promise<void> {
    if (!this.active) return;
    const wav = encodeWav(pcm, sampleRate);
    this.inflight++;
    try {
      const res = await fetch(`/api/stt?lang=${encodeURIComponent(this.lang)}`, {
        method: 'POST',
        headers: { 'content-type': 'audio/wav' },
        body: wav,
      });
      if (!res.ok) {
        if (res.status === 501) this.hooks.onError('unsupported');
        else this.hooks.onError('network');
        return;
      }
      const { text } = (await res.json()) as { text: string };
      if (text && this.active) this.hooks.onFinal(text);
      else this.hooks.onInterim('');
    } catch {
      this.hooks.onError('network');
    } finally {
      this.inflight--;
    }
  }
}
