// Real-time lip sync. With access to the speech audio (server TTS), mouth shapes are derived from the
// live spectrum: loudness drives jaw opening, the low/mid/high balance approximates rounded vowels,
// open vowels and sibilants. Browser speech synthesis exposes no audio, so word-boundary events drive
// syllable-timed mouth pulses instead.

import { syllables } from '../../shared/text.ts';
import type { MouthShape } from './types.ts';

const CLOSED: MouthShape = { open: 0, wide: 0, round: 0, teeth: 0 };

function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class SpectrumLipSync {
  private readonly analyser: AnalyserNode;
  private readonly data: Uint8Array<ArrayBuffer>;
  private peak = 0.05;
  private shape: MouthShape = { ...CLOSED };

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    this.data = new Uint8Array(analyser.frequencyBinCount);
  }

  /** Current loudness 0..1 (also used for audio-reactive UI). */
  level = 0;

  sample(): MouthShape {
    this.analyser.getByteFrequencyData(this.data);
    const hz = this.analyser.context.sampleRate / this.analyser.fftSize;
    const band = (lo: number, hi: number) => {
      const a = Math.max(1, Math.floor(lo / hz));
      const b = Math.min(this.data.length - 1, Math.ceil(hi / hz));
      let sum = 0;
      for (let i = a; i <= b; i++) sum += this.data[i] * this.data[i];
      return Math.sqrt(sum / Math.max(1, b - a + 1)) / 255;
    };
    const low = band(90, 450);
    const mid = band(450, 2200);
    const high = band(2600, 7500);
    const total = low * 0.9 + mid + high * 0.6;
    // Automatic gain so quiet and loud voices both animate fully.
    this.peak = Math.max(total, this.peak * 0.995, 0.05);
    const level = clamp(total / this.peak);
    this.level = level;
    const voiced = clamp((level - 0.12) * 1.5);
    const sum = low + mid + high + 1e-6;
    const target: MouthShape = {
      open: voiced * (0.55 + 0.45 * clamp((low + mid) / sum * 1.4)),
      wide: clamp((mid - low) / sum * 2.2, -1, 1),
      round: clamp((low / sum - 0.45) * 2.5) * voiced,
      teeth: clamp((high / sum - 0.18) * 3) * 0.8 + voiced * 0.2,
    };
    const k = (a: number, b: number) => (b > a ? 0.55 : 0.28);
    this.shape = {
      open: this.shape.open + (target.open - this.shape.open) * k(this.shape.open, target.open),
      wide: this.shape.wide + (target.wide - this.shape.wide) * 0.35,
      round: this.shape.round + (target.round - this.shape.round) * 0.35,
      teeth: this.shape.teeth + (target.teeth - this.shape.teeth) * 0.4,
    };
    return this.shape;
  }
}

/** Syllable-timed mouth motion for engines that only report word boundaries. */
export class BoundaryLipSync {
  private pulses: { at: number; dur: number; strength: number; round: number }[] = [];
  private speakingSince = 0;
  private lastBoundary = 0;
  private active = false;
  private rate = 1;

  start(rate = 1): void {
    this.active = true;
    this.rate = rate;
    this.speakingSince = performance.now();
    this.lastBoundary = 0;
    this.pulses = [];
  }

  stop(): void {
    this.active = false;
    this.pulses = [];
  }

  word(word: string): void {
    const now = performance.now();
    this.lastBoundary = now;
    const n = Math.min(5, syllables(word));
    const per = (170 / this.rate) * (0.85 + Math.random() * 0.3);
    for (let i = 0; i < n; i++) {
      this.pulses.push({ at: now + i * per, dur: per * 0.9, strength: 0.55 + Math.random() * 0.45, round: /[ouw]/i.test(word) ? 0.5 : 0.1 });
    }
  }

  sample(): MouthShape {
    if (!this.active) return CLOSED;
    const now = performance.now();
    this.pulses = this.pulses.filter((p) => now < p.at + p.dur);
    let open = 0;
    let round = 0;
    for (const p of this.pulses) {
      if (now < p.at) continue;
      const x = (now - p.at) / p.dur;
      const v = Math.sin(Math.PI * x) * p.strength;
      if (v > open) {
        open = v;
        round = p.round;
      }
    }
    // Some voices never fire boundary events: fall back to a natural talking rhythm.
    if (!this.lastBoundary && now - this.speakingSince > 250) {
      const t = (now - this.speakingSince) / 1000;
      open = Math.max(0, Math.sin(t * 10.5 * this.rate) * 0.5 + Math.sin(t * 4.1) * 0.25 + 0.2);
    }
    return { open: open * 0.85, wide: 0.2 - round * 0.6, round, teeth: open * 0.4 };
  }
}
