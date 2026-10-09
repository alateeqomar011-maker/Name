// Microphone input: echo-cancelled capture, live level metering and voice-activity detection (VAD).
// When segment capture is on, speech is buffered as PCM with a short pre-roll so the first syllable
// isn't lost, then handed over for server-side transcription.

export interface MicOptions {
  /** Capture PCM segments for server transcription. */
  segments?: boolean;
  /** Returns the current AI output level so its echo doesn't count as the user speaking. */
  outputLevel?: () => number;
  onSpeechStart?: () => void;
  onSpeechEnd?: (pcm: Float32Array, sampleRate: number) => void;
}

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('sc-tap', Tap);
`;

export class MicInput {
  readonly stream: MediaStream;
  private readonly ctx: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly data: Uint8Array<ArrayBuffer>;
  private readonly opts: MicOptions;
  private node: AudioWorkletNode | null = null;
  private timer = 0;
  private floor = 0.01;
  private speaking = false;
  private aboveSince = 0;
  private belowSince = 0;
  private preroll: Float32Array[] = [];
  private segment: Float32Array[] = [];
  private _level = 0;
  enabled = true;

  private constructor(stream: MediaStream, ctx: AudioContext, opts: MicOptions) {
    this.stream = stream;
    this.ctx = ctx;
    this.opts = opts;
    const src = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    src.connect(this.analyser);
    this.data = new Uint8Array(this.analyser.fftSize);
    if (opts.segments) void this.attachWorklet(src);
    this.timer = window.setInterval(() => this.tick(), 30);
  }

  static async open(opts: MicOptions = {}): Promise<MicInput> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    return new MicInput(stream, ctx, opts);
  }

  private async attachWorklet(src: MediaStreamAudioSourceNode): Promise<void> {
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.node = new AudioWorkletNode(this.ctx, 'sc-tap');
      this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data);
      src.connect(this.node);
      // Keep the graph pulling without making the mic audible.
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      this.node.connect(mute).connect(this.ctx.destination);
    } catch (err) {
      console.warn('Audio worklet unavailable; server transcription disabled', err);
    }
  }

  private onFrame(frame: Float32Array): void {
    if (this.speaking) {
      this.segment.push(frame);
    } else {
      this.preroll.push(frame);
      const maxFrames = Math.ceil((0.45 * this.ctx.sampleRate) / 128);
      if (this.preroll.length > maxFrames) this.preroll.splice(0, this.preroll.length - maxFrames);
    }
  }

  /** Smoothed input level 0..1. */
  get level(): number {
    return this._level;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  private tick(): void {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.data.length);
    this._level = this._level * 0.6 + Math.min(1, rms * 6) * 0.4;
    if (!this.enabled) {
      if (this.speaking) this.endSegment(false);
      return;
    }
    // Adaptive noise floor; raised while the AI is talking to ignore residual echo.
    if (!this.speaking) this.floor = Math.min(0.08, this.floor * 0.995 + rms * 0.005);
    const echo = this.opts.outputLevel?.() ?? 0;
    const threshold = Math.max(0.018, this.floor * 2.8, echo * 0.12);
    const now = performance.now();
    if (rms > threshold) {
      this.belowSince = 0;
      if (!this.speaking) {
        if (!this.aboveSince) this.aboveSince = now;
        if (now - this.aboveSince > 110) {
          this.speaking = true;
          this.segment = [...this.preroll];
          this.preroll = [];
          this.opts.onSpeechStart?.();
        }
      }
    } else {
      this.aboveSince = 0;
      if (this.speaking) {
        if (!this.belowSince) this.belowSince = now;
        if (now - this.belowSince > 700) this.endSegment(true);
      }
    }
  }

  private endSegment(emit: boolean): void {
    this.speaking = false;
    this.belowSince = 0;
    const frames = this.segment;
    this.segment = [];
    if (!emit || !this.opts.segments || !frames.length) return;
    const total = frames.reduce((n, f) => n + f.length, 0);
    if (total < this.ctx.sampleRate * 0.35) return; // too short to be speech
    const pcm = new Float32Array(total);
    let o = 0;
    for (const f of frames) {
      pcm.set(f, o);
      o += f.length;
    }
    this.opts.onSpeechEnd?.(pcm, this.ctx.sampleRate);
  }

  setMuted(muted: boolean): void {
    this.enabled = !muted;
    for (const t of this.stream.getAudioTracks()) t.enabled = !muted;
  }

  close(): void {
    clearInterval(this.timer);
    this.node?.disconnect();
    for (const t of this.stream.getTracks()) t.stop();
    void this.ctx.close().catch(() => undefined);
  }
}

/** Encodes mono PCM as a 16 kHz 16-bit WAV file. */
export function encodeWav(pcm: Float32Array, sampleRate: number, targetRate = 16000): Blob {
  const ratio = sampleRate / targetRate;
  const length = Math.floor(pcm.length / ratio);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    // Simple box-filter downsample.
    const start = Math.floor(i * ratio);
    const end = Math.min(pcm.length, Math.floor((i + 1) * ratio));
    let acc = 0;
    for (let j = start; j < end; j++) acc += pcm[j];
    const s = Math.max(-1, Math.min(1, acc / Math.max(1, end - start)));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
