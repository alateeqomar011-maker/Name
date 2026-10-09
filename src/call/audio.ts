// Audio output for calls: plays synthesized speech through WebAudio so it can be analysed for lip sync,
// routed to a chosen output device, recorded (video greetings) and measured (echo-aware barge-in).

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  readonly master: GainNode;
  readonly recordDest: MediaStreamAudioDestinationNode;
  private current: AudioBufferSourceNode | null = null;
  private levelData: Uint8Array<ArrayBuffer>;
  private volume = 1;
  private muted = false;

  constructor() {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master = this.ctx.createGain();
    this.recordDest = this.ctx.createMediaStreamDestination();
    this.analyser.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.analyser.connect(this.recordDest);
    this.levelData = new Uint8Array(this.analyser.fftSize);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.ctx.decodeAudioData(data);
  }

  /** Plays a buffer; resolves when it ends or is stopped. */
  play(buffer: AudioBuffer, onStart?: () => void): Promise<void> {
    this.stop();
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.analyser);
      src.onended = () => {
        if (this.current === src) this.current = null;
        resolve();
      };
      this.current = src;
      src.start();
      onStart?.();
    });
  }

  stop(): void {
    const c = this.current;
    this.current = null;
    if (c) {
      try {
        c.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  get playing(): boolean {
    return this.current !== null;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1.5, v));
    this.apply();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.apply();
  }

  /** Briefly lowers playback (e.g. while checking whether the user is talking over the AI). */
  duck(on: boolean): void {
    this.master.gain.setTargetAtTime(this.muted ? 0 : on ? this.volume * 0.35 : this.volume, this.ctx.currentTime, 0.05);
  }

  private apply(): void {
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  async setOutputDevice(deviceId: string): Promise<boolean> {
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (!c.setSinkId) return false;
    try {
      await c.setSinkId(deviceId);
      return true;
    } catch {
      return false;
    }
  }

  /** Current output loudness 0..1. */
  level(): number {
    this.analyser.getByteTimeDomainData(this.levelData);
    let sum = 0;
    for (let i = 0; i < this.levelData.length; i++) {
      const v = (this.levelData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.levelData.length) * 4);
  }

  /** Soft synthesized ring-back tone. Returns a stop function. */
  ring(): () => void {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const oscs = [440, 554.37, 659.25].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });
    let stopped = false;
    const pulse = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.05);
      gain.gain.setValueAtTime(0.05, t + 0.9);
      gain.gain.linearRampToValueAtTime(0, t + 1.0);
      timer = window.setTimeout(pulse, 2200);
    };
    let timer = window.setTimeout(pulse, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => oscs.forEach((o) => o.stop()), 200);
    };
  }

  /** Short UI chime (connect / hang up). */
  chime(kind: 'connect' | 'end'): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.master);
    const notes = kind === 'connect' ? [523.25, 783.99] : [659.25, 392];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      const t = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t);
      o.stop(t + 0.3);
    });
  }

  close(): void {
    this.stop();
    void this.ctx.close().catch(() => undefined);
  }
}
