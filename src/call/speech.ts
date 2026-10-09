// Spoken output queue. Sentences are synthesized as soon as they stream in (neural server voices are
// prefetched in parallel) and played strictly one after another, so characters never talk over each
// other. Each sentence drives the speaking character's lip sync.

import { bcp47 } from '../../shared/countries.ts';
import { emotionOf, type Emotion } from '../../shared/text.ts';
import { BoundaryLipSync, SpectrumLipSync } from '../avatar/lipsync.ts';
import type { MouthShape } from '../avatar/types.ts';
import type { AudioEngine } from './audio.ts';

export type VoiceEngine = 'browser' | 'server';

export interface VoiceSpec {
  characterId: string;
  gender: 'm' | 'f';
  pitch: number;
  rate: number;
  seed: number;
}

export interface SpeechItem {
  id: number;
  speaker: string;
  text: string;
  lang: string;
  emotion: Emotion;
}

interface Pending extends SpeechItem {
  audio?: Promise<ArrayBuffer | null>;
}

export interface SpeechHooks {
  onStart(item: SpeechItem): void;
  onEnd(item: SpeechItem): void;
  onIdle(): void;
  onFallback?(reason: string): void;
}

const CLOSED: MouthShape = { open: 0, wide: 0, round: 0, teeth: 0 };

// Heuristic gender hints for common OS/browser voices.
const FEMALE = /(female|woman|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|heera|sabina|helena|laura|monica|paulina|luciana|joana|francisca|elvira|amelie|anna|alice|ellen|sara|hoda|zariyah|salma|mariam|lana|yuna|kyoko|ting-ting|mei-jia|google uk english female|google us english|nova|aria|jenny)/i;
const MALE = /(male|man|david|mark|daniel|alex|fred|george|james|thomas|diego|jorge|juan|pablo|felipe|antonio|luca|hamed|maged|tarik|naayf|google uk english male|guy|ryan|andrew|brian|christopher)/i;

let voicesCache: SpeechSynthesisVoice[] = [];
function voices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  const v = speechSynthesis.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', () => voices());
  voices();
}

export function browserSpeechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function pickBrowserVoice(lang: string, spec: VoiceSpec): SpeechSynthesisVoice | null {
  const tag = bcp47(lang).toLowerCase();
  const base = tag.slice(0, 2);
  const all = voices();
  let pool = all.filter((v) => v.lang.toLowerCase().replace('_', '-') === tag);
  if (!pool.length) pool = all.filter((v) => v.lang.toLowerCase().startsWith(base));
  if (!pool.length) return null;
  const gendered = pool.filter((v) => (spec.gender === 'f' ? FEMALE.test(v.name) && !/\bmale\b/i.test(v.name) : MALE.test(v.name) && !FEMALE.test(v.name)));
  const choices = gendered.length ? gendered : pool;
  // Prefer higher-quality natural/neural/online voices when present.
  const ranked = [...choices].sort((a, b) => score(b) - score(a));
  const top = ranked.filter((v) => score(v) === score(ranked[0]));
  return top[spec.seed % top.length] ?? ranked[0];
}

function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (/natural|neural|online|enhanced|premium/i.test(v.name)) s += 3;
  if (/google/i.test(v.name)) s += 2;
  if (!v.localService) s += 1;
  return s;
}

export class SpeechQueue {
  private readonly audio: AudioEngine;
  private readonly hooks: SpeechHooks;
  private readonly specs: Map<string, VoiceSpec>;
  engine: VoiceEngine;
  private queue: Pending[] = [];
  private current: Pending | null = null;
  private running = false;
  private generation = 0;
  private readonly spectrum: SpectrumLipSync;
  private readonly boundary = new BoundaryLipSync();
  /** Held so the engine can't garbage-collect an utterance mid-sentence (a known Chrome issue). */
  utterance: SpeechSynthesisUtterance | null = null;
  disclosure: 'synthetic' | 'licensed' = 'synthetic';

  constructor(audio: AudioEngine, specs: VoiceSpec[], engine: VoiceEngine, hooks: SpeechHooks) {
    this.audio = audio;
    this.specs = new Map(specs.map((s) => [s.characterId, s]));
    this.engine = engine;
    this.hooks = hooks;
    this.spectrum = new SpectrumLipSync(audio.analyser);
  }

  get speakingId(): string | null {
    return this.current?.speaker ?? null;
  }

  get busy(): boolean {
    return this.running || this.queue.length > 0;
  }

  /** Lip-sync source for one character: open mouth only while they are the one speaking. */
  mouthFor(speakerId: string): () => MouthShape {
    return () => {
      if (this.current?.speaker !== speakerId) return CLOSED;
      return this.engine === 'server' ? this.spectrum.sample() : this.boundary.sample();
    };
  }

  /** Loudness of the speech being played (server voices only). */
  outputLevel(): number {
    return this.engine === 'server' ? this.spectrum.level : this.current ? 0.5 : 0;
  }

  enqueue(item: Omit<SpeechItem, 'emotion'> & { emotion?: Emotion }): void {
    const full: Pending = { ...item, emotion: item.emotion ?? emotionOf(item.text) };
    if (this.engine === 'server') full.audio = this.fetchAudio(full);
    this.queue.push(full);
    if (!this.running) void this.run();
  }

  clear(): void {
    this.generation++;
    this.queue = [];
    this.audio.stop();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.boundary.stop();
    const was = this.current;
    this.current = null;
    this.running = false;
    if (was) this.hooks.onEnd(was);
  }

  private async fetchAudio(item: SpeechItem): Promise<ArrayBuffer | null> {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ characterId: item.speaker, text: item.text, lang: item.lang, emotion: item.emotion }),
      });
      if (!res.ok) return null;
      const disclosure = res.headers.get('x-voice-disclosure');
      if (disclosure === 'licensed') this.disclosure = 'licensed';
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  }

  private async run(): Promise<void> {
    this.running = true;
    const gen = this.generation;
    while (this.queue.length && gen === this.generation) {
      const item = this.queue.shift()!;
      this.current = item;
      try {
        if (this.engine === 'server') {
          const data = await item.audio;
          if (gen !== this.generation) return;
          if (!data) {
            // Neural voice unavailable: switch the rest of the call to the browser's voices.
            this.engine = 'browser';
            this.hooks.onFallback?.('server-tts-unavailable');
            await this.speakBrowser(item, gen);
          } else {
            const buffer = await this.audio.decode(data);
            if (gen !== this.generation) return;
            await this.audio.play(buffer, () => this.hooks.onStart(item));
          }
        } else {
          await this.speakBrowser(item, gen);
        }
      } catch {
        /* skip a sentence that failed to synthesize */
      }
      if (gen !== this.generation) return;
      this.current = null;
      this.hooks.onEnd(item);
    }
    if (gen === this.generation) {
      this.running = false;
      this.hooks.onIdle();
    }
  }

  /** True once the browser has shown it can't synthesize speech (no voices installed). */
  silent = false;

  private speakBrowser(item: SpeechItem, gen: number): Promise<void> {
    if (!browserSpeechSupported() || this.silent) {
      // No speech engine at all: show captions with a reading-time pause.
      this.hooks.onStart(item);
      this.boundary.start(1);
      return new Promise((r) => setTimeout(() => {
        this.boundary.stop();
        r();
      }, 600 + item.text.length * 55));
    }
    const spec = this.specs.get(item.speaker) ?? { characterId: item.speaker, gender: 'm', pitch: 1, rate: 1, seed: 0 };
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = bcp47(item.lang);
      const voice = pickBrowserVoice(item.lang, spec);
      if (voice) u.voice = voice;
      u.pitch = Math.max(0.5, Math.min(1.6, spec.pitch));
      u.rate = Math.max(0.7, Math.min(1.3, spec.rate));
      u.volume = 1;
      let started = false;
      let finished = false;
      const begin = () => {
        if (started) return;
        started = true;
        this.boundary.start(u.rate);
        if (gen === this.generation) this.hooks.onStart(item);
      };
      const done = () => {
        if (finished) return;
        finished = true;
        this.boundary.stop();
        clearTimeout(startTimer);
        clearTimeout(watchdog);
        resolve();
      };
      u.onstart = begin;
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        begin();
        const word = item.text.slice(e.charIndex, e.charIndex + (e.charLength || 8)).split(/\s/)[0];
        this.boundary.word(word || 'a');
      };
      u.onend = done;
      u.onerror = (e) => {
        if (started || e.error === 'interrupted' || e.error === 'canceled') return done();
        // No usable voice: keep the conversation going as captions with animated lips.
        this.silent = true;
        this.hooks.onFallback?.('no-browser-voice');
        begin();
        clearTimeout(watchdog);
        window.setTimeout(done, estimate);
      };
      // Some engines never report starting (or are silent): show the caption and animate anyway,
      // then move on after the estimated speaking time.
      const estimate = 900 + (item.text.length * 62) / u.rate;
      const startTimer = window.setTimeout(begin, 1200);
      const watchdog = window.setTimeout(done, 1200 + estimate + 2500);
      this.utterance = u;
      speechSynthesis.speak(u);
    });
  }

  dispose(): void {
    this.clear();
    this.utterance = null;
  }
}
