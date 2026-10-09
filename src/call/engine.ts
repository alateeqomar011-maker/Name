// CallEngine orchestrates a live conversation with one or more AI characters:
//   microphone → speech recognition → streamed Claude reply → sentence-by-sentence speech + lip sync.
// Users can interrupt at any time (barge-in); in group calls a director decides who answers and
// characters speak strictly one at a time.

import { followUp, planSpeakers, type Participant } from '../../shared/director.ts';
import { SentenceSplitter, wordOverlap } from '../../shared/text.ts';
import type { CallMode, ChatStreamEvent, ScenarioId, TranscriptLine, UsageMetric } from '../../shared/types.ts';
import { ApiError, api, streamChat, type CharacterProfile } from '../lib/api.ts';
import { AudioEngine } from './audio.ts';
import { MicInput } from './mic.ts';
import { BrowserRecognizer, browserRecognitionSupported, ServerRecognizer, type Recognizer } from './recognition.ts';
import { SpeechQueue, type SpeechItem, type VoiceEngine } from './speech.ts';

export type Phase = 'idle' | 'ringing' | 'live' | 'ended';
export type Activity = 'listening' | 'thinking' | 'speaking' | 'user';

export interface Caption {
  speaker: string;
  text: string;
  translation?: string;
}

export interface LiveLine extends TranscriptLine {
  key: number;
  sentences: string[];
  spoken: number;
  done: boolean;
}

export interface EngineOptions {
  mode: CallMode;
  scenario: ScenarioId;
  lang: string;
  characters: CharacterProfile[];
  voiceEngine: VoiceEngine;
  sttEngine: 'browser' | 'server' | 'none';
  interruptMode: 'auto' | 'tap' | 'ptt';
  captionLang: string;
  sceneSetup?: string;
  openingTopic?: string;
  voiceOnly?: boolean;
}

export interface EngineState {
  phase: Phase;
  activity: Activity;
  speakerId: string | null;
  thinkingId: string | null;
  caption: Caption | null;
  userInterim: string;
  lines: LiveLine[];
  conversationId: string | null;
  provider: 'anthropic' | 'offline' | null;
  micMuted: boolean;
  micError: string | null;
  sttKind: 'browser' | 'server' | 'none';
  voiceEngine: VoiceEngine;
  error: string | null;
  limit: UsageMetric | null;
  startedAt: number;
  pttActive: boolean;
  /** The device has no speech voices: replies are shown as captions only. */
  voiceless: boolean;
}

type Listener = (s: EngineState) => void;

const MAX_GROUP_TURNS = 4;

export class CallEngine {
  readonly opts: EngineOptions;
  readonly audio: AudioEngine;
  readonly speech: SpeechQueue;
  private mic: MicInput | null = null;
  private recognizer: Recognizer | null = null;
  private listeners = new Set<Listener>();
  private abort: AbortController | null = null;
  private lineKey = 0;
  private sentenceId = 0;
  private turnToken = 0;
  private heartbeatTimer = 0;
  private saveTimer = 0;
  private stopRing: (() => void) | null = null;
  private recentSpoken: string[] = [];
  private translations = new Map<string, string>();
  private readonly participants: Participant[];
  readonly byId: Map<string, CharacterProfile>;
  state: EngineState;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.byId = new Map(opts.characters.map((c) => [c.id, c]));
    this.participants = opts.characters.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases, nameAr: c.nameAr }));
    this.audio = new AudioEngine();
    this.speech = new SpeechQueue(
      this.audio,
      opts.characters.map((c, i) => ({
        characterId: c.id,
        gender: c.gender,
        pitch: c.voice.pitch,
        rate: c.voice.rate,
        seed: i + c.id.length,
      })),
      opts.voiceEngine,
      {
        onStart: (item) => this.onSentenceStart(item),
        onEnd: () => undefined,
        onIdle: () => this.onSpeechIdle(),
        onFallback: (reason) => this.set(reason === 'no-browser-voice' ? { voiceless: true } : { voiceEngine: 'browser' }),
      },
    );
    this.state = {
      phase: 'idle',
      activity: 'listening',
      speakerId: null,
      thinkingId: null,
      caption: null,
      userInterim: '',
      lines: [],
      conversationId: null,
      provider: null,
      micMuted: false,
      micError: null,
      sttKind: opts.sttEngine,
      voiceEngine: opts.voiceEngine,
      error: null,
      limit: null,
      startedAt: 0,
      pttActive: false,
      voiceless: false,
    };
  }

  // ---------------------------------------------------------------- subscription

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private updateLines(): void {
    this.set({ lines: [...this.state.lines] });
  }

  // ---------------------------------------------------------------- lifecycle

  /** Must be called from a user gesture (unlocks audio). */
  async start(): Promise<void> {
    await this.audio.resume();
    this.set({ phase: 'ringing' });
    this.stopRing = this.audio.ring();
    await Promise.all([this.setupInput(), new Promise((r) => setTimeout(r, 1600))]);
    this.stopRing?.();
    this.stopRing = null;
    this.audio.chime('connect');
    this.set({ phase: 'live', startedAt: Date.now() });
    this.heartbeatTimer = window.setInterval(() => void this.heartbeat(), 15_000);

    const first = this.opts.characters[0];
    if (this.opts.mode === 'group' && this.opts.openingTopic) {
      // The opening topic is the user's first line; the panel answers it in turn.
      this.sendUser(this.opts.openingTopic);
    } else if (this.opts.mode === 'group') {
      const greeters = this.opts.characters.slice(0, Math.min(2, this.opts.characters.length));
      await this.runTurns(greeters.map((c) => c.id), 'greet');
    } else {
      await this.runTurns([first.id], 'greet');
    }
  }

  private async setupInput(): Promise<void> {
    if (this.opts.sttEngine === 'none') return;
    const hooks = {
      onInterim: (text: string) => this.onInterim(text),
      onFinal: (text: string) => this.onFinal(text),
      onError: (kind: 'denied' | 'unsupported' | 'network' | 'other') => this.onRecognitionError(kind),
    };
    const useServer = this.opts.sttEngine === 'server' || !browserRecognitionSupported();
    try {
      const server = useServer ? new ServerRecognizer(this.opts.lang, hooks) : null;
      this.mic = await MicInput.open({
        segments: useServer,
        outputLevel: () => this.speech.outputLevel(),
        onSpeechStart: () => {
          server?.speechStarted();
          this.onVoiceActivity();
        },
        onSpeechEnd: (pcm, rate) => void server?.transcribe(pcm, rate),
      });
      this.recognizer = server ?? new BrowserRecognizer(this.opts.lang, hooks);
      this.set({ sttKind: this.recognizer.kind });
      if (this.opts.interruptMode !== 'ptt') this.recognizer.start();
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      this.set({ micError: denied ? 'denied' : 'unavailable', sttKind: 'none' });
    }
  }

  end(): void {
    if (this.state.phase === 'ended') return;
    this.stopRing?.();
    this.cancelTurns(true);
    this.speech.dispose();
    this.recognizer?.dispose();
    this.mic?.close();
    clearInterval(this.heartbeatTimer);
    if (this.state.phase === 'live') this.audio.chime('end');
    void this.heartbeat();
    this.set({ phase: 'ended', activity: 'listening', caption: null, speakerId: null, thinkingId: null });
    void this.save(true);
    setTimeout(() => this.audio.close(), 600);
  }

  get micLevel(): number {
    return this.mic?.level ?? 0;
  }

  setMicMuted(muted: boolean): void {
    this.mic?.setMuted(muted);
    if (muted) this.recognizer?.stop();
    else if (this.opts.interruptMode !== 'ptt') this.recognizer?.start();
    this.set({ micMuted: muted, userInterim: '' });
  }

  setLang(lang: string): void {
    this.opts.lang = lang;
    this.recognizer?.setLang(lang);
  }

  setCaptionLang(lang: string): void {
    this.opts.captionLang = lang;
  }

  /** Push-to-talk: hold to listen. */
  setPtt(active: boolean): void {
    if (this.opts.interruptMode !== 'ptt' || this.state.micMuted) return;
    if (active) {
      if (this.speech.busy || this.state.activity === 'thinking') this.interrupt();
      this.recognizer?.start();
    } else {
      // Give the recognizer a moment to deliver the final result.
      setTimeout(() => this.recognizer?.stop(), 600);
    }
    this.set({ pttActive: active });
  }

  // ---------------------------------------------------------------- user input

  private isEcho(text: string): boolean {
    if (!this.speech.busy && Date.now() - this.lastSpeechEnd > 1200) return false;
    return this.recentSpoken.some((s) => wordOverlap(text, s) > 0.6);
  }

  private lastSpeechEnd = 0;

  private duckTimer = 0;

  private onVoiceActivity(): void {
    // Quietly duck the AI while we confirm the user is really talking (and not our own echo).
    if (this.opts.interruptMode !== 'auto' || !this.speech.busy) return;
    this.audio.duck(true);
    clearTimeout(this.duckTimer);
    this.duckTimer = window.setTimeout(() => this.audio.duck(false), 1400);
  }

  private onInterim(text: string): void {
    if (this.state.phase !== 'live') return;
    if (!text) {
      this.audio.duck(false);
      return this.set({ userInterim: '' });
    }
    if (this.isEcho(text)) return;
    const busy = this.speech.busy || this.state.activity === 'thinking';
    if (busy && this.opts.interruptMode === 'tap') return;
    if (busy && this.opts.interruptMode === 'auto' && (text.split(/\s+/).length >= 2 || text.length >= 8)) {
      this.interrupt();
    }
    this.set({ userInterim: text, activity: busy && this.opts.interruptMode !== 'auto' ? this.state.activity : 'user' });
  }

  private onFinal(text: string): void {
    this.audio.duck(false);
    if (this.state.phase !== 'live') return;
    const clean = text.trim();
    if (!clean || this.isEcho(clean)) return this.set({ userInterim: '' });
    const busy = this.speech.busy || this.state.activity === 'thinking';
    if (busy && this.opts.interruptMode === 'tap') {
      // In tap mode speech during the AI's turn is ignored unless the user tapped interrupt.
      return this.set({ userInterim: '' });
    }
    this.sendUser(clean);
  }

  private onRecognitionError(kind: 'denied' | 'unsupported' | 'network' | 'other'): void {
    if (kind === 'denied') this.set({ micError: 'denied', sttKind: 'none' });
    else if (kind === 'unsupported' || kind === 'network') this.set({ micError: kind, sttKind: 'none' });
  }

  /** Text typed or spoken by the user. */
  sendUser(text: string): void {
    if (this.state.phase !== 'live' || !text.trim()) return;
    this.interrupt();
    this.state.lines.push({ key: ++this.lineKey, speaker: 'user', text: text.trim(), at: Date.now(), sentences: [], spoken: 0, done: true });
    this.set({ userInterim: '', activity: 'thinking' });
    this.updateLines();
    const plan =
      this.opts.mode === 'group'
        ? planSpeakers({ participants: this.participants, text, history: this.aiHistory(), maxSpeakers: 3 })
        : [this.opts.characters[0].id];
    void this.runTurns(plan);
  }

  private aiHistory(): string[] {
    return this.state.lines.filter((l) => l.speaker !== 'user' && l.speaker !== 'safety').map((l) => l.speaker);
  }

  /** Stops whatever the AI is doing; keeps only what was actually spoken. */
  interrupt(): void {
    const wasBusy = this.speech.busy || this.abort !== null;
    this.cancelTurns(false);
    if (wasBusy) this.set({ activity: 'listening', speakerId: null, thinkingId: null, caption: null });
  }

  private cancelTurns(final: boolean): void {
    this.turnToken++;
    this.abort?.abort();
    this.abort = null;
    this.speech.clear();
    this.audio.duck(false);
    let changed = false;
    this.state.lines = this.state.lines.filter((l) => {
      if (l.speaker === 'user' || l.speaker === 'safety') return true;
      if (l.spoken === 0 && l.sentences.length === 0 && !l.done) {
        changed = true;
        return false;
      }
      if (l.spoken < l.sentences.length || !l.done) {
        if (l.spoken === 0) {
          changed = true;
          return false;
        }
        l.text = l.sentences.slice(0, l.spoken).join(' ');
        l.interrupted = true;
        l.done = true;
        l.sentences = l.sentences.slice(0, l.spoken);
        changed = true;
      }
      return true;
    });
    if (changed) this.updateLines();
    if (!final) this.scheduleSave();
  }

  // ---------------------------------------------------------------- AI turns

  private transcriptForApi(): TranscriptLine[] {
    return this.state.lines.map((l) => ({ speaker: l.speaker, text: l.text, interrupted: l.interrupted }));
  }

  /** Runs a sequence of AI turns; each next turn starts generating as soon as the previous text is complete. */
  private async runTurns(queue: string[], cue?: 'greet'): Promise<void> {
    const token = ++this.turnToken;
    let budget = MAX_GROUP_TURNS;
    const pending = [...queue];
    while (pending.length && budget > 0 && token === this.turnToken) {
      const speakerId = pending.shift()!;
      budget--;
      const reply = await this.generate(speakerId, token, cue);
      if (token !== this.turnToken || reply === null) return;
      if (this.opts.mode === 'group') {
        const next = followUp(reply, speakerId, pending, this.participants, budget);
        pending.splice(0, pending.length, ...next);
      }
    }
    if (token === this.turnToken && !this.speech.busy) this.onSpeechIdle();
  }

  private async generate(speakerId: string, token: number, cue?: 'greet'): Promise<string | null> {
    const controller = new AbortController();
    this.abort = controller;
    if (!this.speech.busy) this.set({ activity: 'thinking', thinkingId: speakerId });
    else this.set({ thinkingId: speakerId });
    const line: LiveLine = { key: ++this.lineKey, speaker: speakerId, text: '', at: Date.now(), sentences: [], spoken: 0, done: false };
    this.state.lines.push(line);
    const splitter = new SentenceSplitter();
    const enqueue = (sentence: string) => {
      line.sentences.push(sentence);
      const item = { id: ++this.sentenceId, speaker: speakerId, text: sentence, lang: this.opts.lang };
      this.prefetchTranslation(sentence);
      this.speech.enqueue(item);
    };
    let moderated = false;
    try {
      await streamChat(
        {
          conversationId: this.state.conversationId ?? undefined,
          mode: this.opts.mode,
          scenario: this.opts.scenario,
          characterIds: this.opts.characters.map((c) => c.id),
          speakerId,
          lang: this.opts.lang,
          transcript: this.transcriptForApi().slice(0, -1),
          cue: cue ?? (this.state.lines.length <= 1 ? 'greet' : undefined),
          sceneSetup: this.opts.sceneSetup,
        },
        (e: ChatStreamEvent) => {
          if (token !== this.turnToken) return;
          switch (e.type) {
            case 'meta':
              this.set({ conversationId: e.conversationId, provider: e.provider });
              break;
            case 'delta':
              line.text += e.text;
              for (const s of splitter.push(e.text)) enqueue(s);
              break;
            case 'moderated':
              moderated = true;
              line.speaker = e.reason === 'self-harm' ? 'safety' : speakerId;
              line.text = e.text;
              for (const s of splitter.push(e.text)) enqueue(s);
              break;
            case 'limit':
              this.set({ limit: e.metric });
              break;
            case 'error':
              this.set({ error: e.message });
              break;
            case 'done':
              if (!moderated && e.text && e.text.length >= line.text.length) line.text = e.text;
              break;
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (controller.signal.aborted || token !== this.turnToken) return null;
      if (err instanceof ApiError && (err.code === 'age_required' || err.code === 'age_blocked')) this.set({ error: err.message });
      else this.set({ error: err instanceof Error ? err.message : 'Network error' });
    }
    if (this.abort === controller) this.abort = null;
    if (token !== this.turnToken) return null;
    for (const s of splitter.flush()) enqueue(s);
    line.text = line.text.trim();
    line.done = true;
    if (!line.text) {
      this.state.lines = this.state.lines.filter((l) => l !== line);
      this.updateLines();
      if (this.state.limit) this.end();
      return null;
    }
    this.set({ thinkingId: null });
    this.updateLines();
    this.scheduleSave();
    return line.text;
  }

  private prefetchTranslation(sentence: string): void {
    const target = this.opts.captionLang;
    if (!target || target === this.opts.lang || this.translations.has(sentence)) return;
    this.translations.set(sentence, '');
    api
      .translate([sentence], target)
      .then((r) => {
        this.translations.set(sentence, r.translations[0] ?? '');
        if (this.state.caption?.text === sentence) this.set({ caption: { ...this.state.caption, translation: r.translations[0] } });
      })
      .catch(() => this.translations.delete(sentence));
  }

  private onSentenceStart(item: SpeechItem): void {
    const line = [...this.state.lines].reverse().find((l) => l.speaker === item.speaker || (l.speaker === 'safety' && l.sentences.includes(item.text)));
    if (line) {
      const idx = line.sentences.indexOf(item.text, line.spoken > 0 ? line.spoken - 1 : 0);
      line.spoken = Math.max(line.spoken, idx + 1);
    }
    this.recentSpoken = [...this.recentSpoken.slice(-5), item.text];
    this.set({
      activity: 'speaking',
      speakerId: item.speaker,
      caption: { speaker: item.speaker, text: item.text, translation: this.translations.get(item.text) || undefined },
    });
  }

  private onSpeechIdle(): void {
    this.lastSpeechEnd = Date.now();
    this.audio.duck(false);
    if (this.state.phase !== 'live') return;
    if (this.abort) {
      // The next character is still composing their reply.
      this.set({ activity: 'thinking', speakerId: null });
      return;
    }
    this.set({ activity: 'listening', speakerId: null, thinkingId: null });
    window.setTimeout(() => {
      if (this.state.activity === 'listening' && !this.speech.busy) this.set({ caption: null });
    }, 2500);
    if (this.state.limit) this.end();
  }

  // ---------------------------------------------------------------- persistence & metering

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(false), 1500);
  }

  private async save(final: boolean): Promise<void> {
    const id = this.state.conversationId;
    if (!id) return;
    const lines = this.state.lines
      .filter((l) => l.text.trim() && (l.done || final))
      .map((l) => ({ speaker: l.speaker, text: l.text, interrupted: l.interrupted, at: l.at }));
    if (!lines.length) return;
    try {
      await api.saveTranscript(id, lines);
    } catch {
      /* retried on the next save */
    }
  }

  private async heartbeat(): Promise<void> {
    const id = this.state.conversationId;
    if (!id || this.opts.mode === 'text') return;
    try {
      const r = await api.heartbeat(id);
      if (r.exhausted && this.state.phase === 'live') {
        this.set({ limit: 'callSeconds' });
        if (!this.speech.busy) this.end();
      }
    } catch {
      /* offline for a moment */
    }
  }
}
