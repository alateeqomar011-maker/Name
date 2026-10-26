// Microphone recorder: raw PCM through an AudioWorklet (no codec artefacts), resampled to 24 kHz and
// encoded as 16-bit WAV. Interruptions (device unplugged, permission revoked, the OS taking the
// audio session) stop the recording and keep what was captured.

export type RecorderError = 'permission' | 'no-device' | 'unsupported' | 'interrupted' | 'unknown';

export interface RecorderEvents {
  onLevel?: (peak: number) => void;
  onChunk?: (samples: Float32Array) => void;
  onAutoStop?: (reason: 'limit' | 'interrupted') => void;
}

export const TARGET_SR = 24000;

export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private length = 0;
  private stopping: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;
  sampleRate = 48000;
  startedAt = 0;

  constructor(private maxSeconds: number, private events: RecorderEvents = {}, private processing = false) {}

  static supported(): boolean {
    return !!(typeof navigator.mediaDevices?.getUserMedia === 'function' && (window.AudioContext || (window as any).webkitAudioContext) && 'AudioWorkletNode' in window);
  }

  async start(): Promise<void> {
    if (!MicRecorder.supported()) throw 'unsupported' as RecorderError;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: this.processing,
          noiseSuppression: this.processing,
          autoGainControl: this.processing,
        },
      });
    } catch (e: any) {
      const name = e?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw 'permission' as RecorderError;
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw 'no-device' as RecorderError;
      throw 'unknown' as RecorderError;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.sampleRate = this.ctx.sampleRate;
    await this.ctx.audioWorklet.addModule('/recorder-worklet.js');
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'murattil-recorder', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
    this.node.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'data') {
        this.chunks.push(m.samples);
        this.length += m.samples.length;
        this.events.onLevel?.(m.peak);
        this.events.onChunk?.(m.samples);
        if (this.length / this.sampleRate >= this.maxSeconds) {
          this.events.onAutoStop?.('limit');
          this.stop();
        }
      } else if (m.type === 'stopped') {
        this.resolveStop?.();
      }
    };
    src.connect(this.node);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.stream.getAudioTracks().forEach((tr) => {
      tr.onended = () => {
        this.events.onAutoStop?.('interrupted');
        this.stop();
      };
    });
    this.ctx.onstatechange = () => {
      const st = this.ctx?.state as string;
      if ((st === 'interrupted' || st === 'suspended') && !this.stopping) {
        this.events.onAutoStop?.('interrupted');
        this.stop();
      }
    };
    this.startedAt = performance.now();
  }

  get seconds(): number {
    return this.length / this.sampleRate;
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = new Promise<void>((resolve) => {
      this.resolveStop = resolve;
      if (this.node) this.node.port.postMessage('stop');
      else resolve();
      setTimeout(resolve, 500); // the worklet may already be gone if the context was interrupted
    }).then(() => {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.node?.disconnect();
      if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => undefined);
    });
    return this.stopping;
  }

  samples(): Float32Array {
    const out = new Float32Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

export async function resample(samples: Float32Array, from: number, to: number): Promise<Float32Array> {
  if (from === to || samples.length === 0) return samples;
  const len = Math.max(1, Math.round((samples.length * to) / from));
  const OAC = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const off = new OAC(1, len, to);
  const buf = off.createBuffer(1, samples.length, from);
  buf.copyToChannel(samples, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0).slice();
}

export function encodeWav(samples: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function peaksOf(samples: Float32Array, n = 400): number[] {
  if (!samples.length) return [];
  const step = Math.max(1, Math.floor(samples.length / n));
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < samples.length; i += step) {
    let p = 0;
    const end = Math.min(samples.length, i + step);
    for (let j = i; j < end; j++) p = Math.max(p, Math.abs(samples[j]));
    out.push(p);
    max = Math.max(max, p);
  }
  return out.map((p) => (max ? p / max : 0));
}
