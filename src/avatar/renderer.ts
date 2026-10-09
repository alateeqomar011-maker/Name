// Real-time avatar renderer: animates a stylised holographic bust in its virtual set at up to 60fps.
// Natural behaviour: blinking, micro-saccades, eye contact, idle head motion, breathing, listening
// nods, thinking glances, emotion-driven expressions and audio-driven lip sync.

import type { EnvironmentId } from '../../shared/types.ts';
import { emotionOf } from '../../shared/text.ts';
import { hashString, rgba } from './color.ts';
import { drawEnvironmentLive, drawEnvironmentStatic, type EnvColors } from './environments.ts';
import { drawFigure, shapeFor, type FaceShape } from './figure.ts';
import { paletteFor, type Palette } from './palette.ts';
import type { AvatarProfile, AvatarState, Emotion, FaceParams, Framing, MouthShape } from './types.ts';

const NEUTRAL: FaceParams = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  gazeX: 0,
  gazeY: 0,
  eyeOpen: 1,
  squint: 0,
  browRaise: 0,
  browFurrow: 0,
  browAsym: 0,
  smile: 0.12,
  jaw: 0,
  wide: 0,
  round: 0,
  teeth: 0,
  breath: 0,
};

const EMOTIONS: Record<Emotion, Partial<FaceParams>> = {
  neutral: { smile: 0.12 },
  happy: { smile: 0.55, squint: 0.25, browRaise: 0.12 },
  excited: { smile: 0.75, browRaise: 0.5, squint: 0.15 },
  curious: { browAsym: 0.6, browRaise: 0.2, roll: 0.06, smile: 0.12 },
  thinking: { browFurrow: 0.35, smile: 0, round: 0.15 },
  concerned: { browFurrow: 0.45, browRaise: 0.15, smile: -0.18 },
  laugh: { smile: 0.95, squint: 0.55, browRaise: 0.25 },
  proud: { smile: 0.5, pitch: -0.06, browRaise: 0.1 },
};

export interface RendererOptions {
  framing?: Framing;
  watermark?: string;
  quality?: 'high' | 'medium' | 'low';
  fps?: number;
  interactive?: boolean;
  /** Fixed backing-store size in pixels (e.g. for recording); otherwise follows the element size. */
  size?: [number, number];
  /** Extra drawing on top of each frame (captions, labels for recordings). */
  overlay?: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | null;
}

// One shared animation loop for every visible renderer.
const active = new Set<AvatarRenderer>();
let rafId = 0;
function tick(now: number): void {
  for (const r of active) r.frame(now);
  rafId = active.size ? requestAnimationFrame(tick) : 0;
}
function schedule(r: AvatarRenderer, on: boolean): void {
  if (on) active.add(r);
  else active.delete(r);
  if (active.size && !rafId) rafId = requestAnimationFrame(tick);
}

function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export class AvatarRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private profile: AvatarProfile;
  private palette: Palette;
  private shape: FaceShape;
  private environment: EnvironmentId;
  private backgroundImage: HTMLImageElement | null = null;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private layer: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private opts: Required<RendererOptions>;
  private seed: number;

  private params: FaceParams = { ...NEUTRAL };
  private state: AvatarState = 'idle';
  private emotion: Emotion = 'neutral';
  private emotionUntil = 0;
  private mouthSource: (() => MouthShape) | null = null;
  private listenLevel = 0;
  private look = { x: 0, y: 0 };
  private saccade = { x: 0, y: 0, next: 0 };
  private blink = { next: 0, start: -1, double: false };
  private lastFrame = 0;
  private lastDraw = 0;
  private t0 = performance.now();
  private running = false;
  private glitchAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private visible = true;
  private intersection: IntersectionObserver | null = null;

  constructor(canvas: HTMLCanvasElement, profile: AvatarProfile, options: RendererOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.layer = document.createElement('canvas');
    this.lctx = this.layer.getContext('2d')!;
    this.profile = profile;
    this.palette = paletteFor(profile);
    this.shape = shapeFor(profile);
    this.environment = profile.environment;
    this.seed = hashString(profile.id);
    this.opts = {
      framing: options.framing ?? 'call',
      watermark: options.watermark ?? 'AI SIMULATION',
      quality: options.quality ?? 'high',
      fps: options.fps ?? 60,
      interactive: options.interactive ?? true,
      size: options.size ?? (undefined as unknown as [number, number]),
      overlay: options.overlay ?? null,
    };
    this.blink.next = performance.now() + 1200 + Math.random() * 2000;
  }

  // ------------------------------------------------------------------ public API

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.intersection = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
    });
    this.intersection.observe(this.canvas);
    this.resize();
    schedule(this, true);
  }

  stop(): void {
    this.running = false;
    schedule(this, false);
    this.resizeObserver?.disconnect();
    this.intersection?.disconnect();
  }

  setProfile(profile: AvatarProfile): void {
    this.profile = profile;
    this.palette = paletteFor(profile);
    this.shape = shapeFor(profile);
    this.seed = hashString(profile.id);
    this.bgKey = '';
  }

  setEnvironment(env: EnvironmentId): void {
    this.environment = env;
    this.bgKey = '';
  }

  setBackgroundImage(img: HTMLImageElement | null): void {
    this.backgroundImage = img;
    this.bgKey = '';
  }

  setState(state: AvatarState): void {
    this.state = state;
  }

  getState(): AvatarState {
    return this.state;
  }

  setEmotion(emotion: Emotion, holdMs = 3500): void {
    this.emotion = emotion;
    this.emotionUntil = performance.now() + holdMs;
  }

  /** Reacts to the sentence being spoken. */
  react(sentence: string): void {
    this.setEmotion(emotionOf(sentence), 2500 + sentence.length * 40);
  }

  setMouthSource(source: (() => MouthShape) | null): void {
    this.mouthSource = source;
  }

  setListenLevel(level: number): void {
    this.listenLevel = level;
  }

  /** Where to look, in -1..1 screen space (0,0 = camera / eye contact). */
  lookAt(x: number, y: number): void {
    this.look = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  setFramingOptions(opts: Partial<RendererOptions>): void {
    this.opts = { ...this.opts, ...opts } as Required<RendererOptions>;
    this.resize();
  }

  captureStream(fps = 30): MediaStream {
    return this.canvas.captureStream(fps);
  }

  // ------------------------------------------------------------------ internals

  private resize(): void {
    const dprCap = this.opts.quality === 'high' ? 2 : this.opts.quality === 'medium' ? 1.5 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const rect = this.canvas.getBoundingClientRect();
    const fixed = this.opts.size;
    const w = fixed ? fixed[0] : Math.max(2, Math.round((rect.width || this.canvas.width) * dpr));
    const h = fixed ? fixed[1] : Math.max(2, Math.round((rect.height || this.canvas.height) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.layer.width !== w || this.layer.height !== h) {
      this.layer.width = w;
      this.layer.height = h;
    }
    this.bgKey = '';
  }

  private ensureBackground(w: number, h: number): void {
    const key = `${this.environment}|${w}x${h}|${this.backgroundImage?.src ?? ''}|${this.palette.accent}`;
    if (key === this.bgKey && this.bg) return;
    this.bgKey = key;
    const raw = document.createElement('canvas');
    raw.width = w;
    raw.height = h;
    const rctx = raw.getContext('2d')!;
    if (this.backgroundImage && this.backgroundImage.complete && this.backgroundImage.naturalWidth) {
      const img = this.backgroundImage;
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      rctx.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      const v = rctx.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h / 2, Math.max(w, h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0.15)');
      v.addColorStop(1, 'rgba(0,0,0,0.65)');
      rctx.fillStyle = v;
      rctx.fillRect(0, 0, w, h);
    } else {
      drawEnvironmentStatic(rctx, this.environment, w, h, this.envColors(), this.seed);
    }
    const bg = this.bg ?? document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const bctx = bg.getContext('2d')!;
    // Depth of field: the set sits softly out of focus behind the presenter.
    const blur = Math.round(Math.min(w, h) * (this.opts.framing === 'portrait' ? 0.006 : 0.009));
    if ('filter' in bctx && blur > 0) {
      bctx.filter = `blur(${blur}px)`;
      bctx.drawImage(raw, -blur * 2, -blur * 2, w + blur * 4, h + blur * 4);
      bctx.filter = 'none';
    } else {
      bctx.drawImage(raw, 0, 0);
    }
    this.bg = bg;
  }

  private envColors(): EnvColors {
    return { accent: this.palette.accent, secondary: this.palette.secondary === '#ffffff' ? this.palette.primary : this.palette.secondary };
  }

  private layout(w: number, h: number): { cx: number; cy: number; r: number } {
    switch (this.opts.framing) {
      case 'portrait':
        return { cx: w / 2, cy: h * 0.41, r: Math.min(w * 0.235, h * 0.18) };
      case 'tile':
        return { cx: w / 2, cy: h * 0.43, r: Math.min(w * 0.17, h * 0.19) };
      case 'orb':
        return { cx: w / 2, cy: h * 0.44, r: Math.min(w, h) * 0.2 };
      case 'call':
      default:
        if (h > w) return { cx: w / 2, cy: h * 0.4, r: w * 0.24 };
        return { cx: w / 2, cy: h * 0.43, r: Math.min(w * 0.13, h * 0.165) };
    }
  }

  /** Advances the animation by dt seconds. */
  step(now: number, dt = 1 / 60): void {
    const t = (now - this.t0) / 1000;
    const p = this.params;
    const target: FaceParams = { ...NEUTRAL };
    const emo = now < this.emotionUntil ? this.emotion : this.state === 'thinking' ? 'thinking' : 'neutral';
    Object.assign(target, EMOTIONS[emo]);

    // Idle head motion: layered slow sines, unique per character.
    const ph = (this.seed % 1000) / 100;
    target.yaw += Math.sin(t * 0.33 + ph) * 0.06 + Math.sin(t * 0.71 + ph * 2) * 0.03;
    target.pitch += Math.sin(t * 0.27 + ph * 3) * 0.035;
    target.roll += Math.sin(t * 0.21 + ph) * 0.025;
    target.breath = Math.sin(t * 1.35 + ph);

    // Eye contact with occasional saccades.
    if (now > this.saccade.next) {
      const wander = this.state === 'speaking' ? 0.35 : 0.2;
      this.saccade = {
        x: (Math.random() - 0.5) * wander,
        y: (Math.random() - 0.5) * wander * 0.6,
        next: now + 500 + Math.random() * (this.state === 'speaking' ? 1400 : 2600),
      };
      if (Math.random() < 0.55) this.saccade.x = this.saccade.y = 0;
    }
    target.gazeX = this.look.x * 0.9 + this.saccade.x;
    target.gazeY = this.look.y * 0.8 + this.saccade.y;
    target.yaw += this.look.x * 0.25;
    target.pitch += this.look.y * 0.12;

    let mouth: MouthShape = { open: 0, wide: 0, round: 0, teeth: 0 };
    switch (this.state) {
      case 'speaking': {
        mouth = this.mouthSource ? this.mouthSource() : mouth;
        // Emphasis: small nods and brow lifts on loud syllables.
        target.pitch += mouth.open * 0.05 + Math.sin(t * 2.1) * 0.02;
        target.yaw += Math.sin(t * 0.9 + ph) * 0.05;
        target.browRaise += mouth.open * 0.25;
        break;
      }
      case 'listening': {
        const l = Math.min(1, this.listenLevel * 1.8);
        target.pitch += Math.sin(t * 3.2) * 0.045 * l + 0.02;
        target.smile = Math.max(target.smile, 0.22);
        target.browRaise += l * 0.12;
        target.roll += 0.03;
        break;
      }
      case 'thinking':
        target.gazeX = -0.55 + this.saccade.x * 0.3;
        target.gazeY = -0.6;
        target.yaw -= 0.08;
        target.pitch -= 0.04;
        break;
      case 'connecting':
        target.smile = 0.3;
        break;
      default:
        break;
    }
    if (emo === 'laugh') mouth = { ...mouth, open: Math.max(mouth.open, 0.25 + Math.abs(Math.sin(t * 9)) * 0.2), teeth: 0.8 };

    // Blinks (sometimes doubled), faster while speaking.
    if (this.blink.start < 0 && now > this.blink.next) {
      this.blink.start = now;
      this.blink.double = Math.random() < 0.2;
    }
    let lid = 1;
    if (this.blink.start >= 0) {
      const e = (now - this.blink.start) / 150;
      if (e >= (this.blink.double ? 2.2 : 1)) {
        this.blink.start = -1;
        this.blink.next = now + 1600 + Math.random() * (this.state === 'speaking' ? 2500 : 4200);
      } else {
        const phase = e % 1.1;
        lid = phase < 1 ? Math.abs(Math.cos(Math.min(1, phase) * Math.PI)) : 1;
      }
    }

    const fast = 14;
    const slow = 5;
    p.yaw = approach(p.yaw, target.yaw, slow, dt);
    p.pitch = approach(p.pitch, target.pitch, slow, dt);
    p.roll = approach(p.roll, target.roll, slow * 0.7, dt);
    p.gazeX = approach(p.gazeX, target.gazeX, 30, dt);
    p.gazeY = approach(p.gazeY, target.gazeY, 30, dt);
    p.squint = approach(p.squint, target.squint, 6, dt);
    p.browRaise = approach(p.browRaise, target.browRaise, 8, dt);
    p.browFurrow = approach(p.browFurrow, target.browFurrow, 6, dt);
    p.browAsym = approach(p.browAsym, target.browAsym, 5, dt);
    p.smile = approach(p.smile, target.smile, 5, dt);
    p.jaw = approach(p.jaw, mouth.open, fast * 1.6, dt);
    p.wide = approach(p.wide, mouth.wide, fast, dt);
    p.round = approach(p.round, mouth.round + (target.round ?? 0), fast, dt);
    p.teeth = approach(p.teeth, mouth.teeth, fast, dt);
    p.breath = target.breath;
    p.eyeOpen = lid * (1 - p.squint * 0.25);
  }

  frame(now: number): void {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    this.step(now, dt);
    const interval = 1000 / this.opts.fps;
    if (!this.visible || document.hidden || now - this.lastDraw < interval - 1) return;
    this.lastDraw = now;
    this.draw(now);
  }

  /** Draws one frame (also used for still portraits). */
  draw(now = performance.now()): void {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;
    const t = (now - this.t0) / 1000;
    if (this.layer.width !== w || this.layer.height !== h) {
      this.layer.width = w;
      this.layer.height = h;
    }
    this.ensureBackground(w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Canvas text inherits the page direction; the in-frame labels are always laid out LTR.
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.drawImage(this.bg!, 0, 0);
    if (!this.backgroundImage) drawEnvironmentLive(ctx, this.environment, w, h, t, this.envColors(), this.seed);

    const { cx, cy, r } = this.layout(w, h);
    const pal = this.palette;

    // Soft key light / halo behind the presenter.
    const halo = ctx.createRadialGradient(cx, cy + r * 0.4, r * 0.3, cx, cy + r * 0.4, r * 3.2);
    halo.addColorStop(0, rgba(pal.rim, 0.32));
    halo.addColorStop(1, rgba(pal.rim, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // Character layer
    const l = this.lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, w, h);
    l.setTransform(r, 0, 0, r, cx, cy);
    drawFigure(l, this.profile, pal, this.params, t, this.shape);

    // Holographic finish: fine scanlines and a cool top light, clipped to the figure.
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-atop';
    if (this.opts.quality !== 'low') {
      const gap = Math.max(2, Math.round(h / 260));
      const offset = (t * 14) % (gap * 2);
      l.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = -gap * 2 + offset; y < h; y += gap * 2) l.fillRect(0, y, w, gap * 0.5);
    }
    const sheen = l.createLinearGradient(0, cy - r * 1.6, 0, cy + r * 3);
    sheen.addColorStop(0, 'rgba(210,240,255,0.12)');
    sheen.addColorStop(0.5, 'rgba(210,240,255,0)');
    sheen.addColorStop(1, rgba(pal.rim, 0.12));
    l.fillStyle = sheen;
    l.fillRect(0, 0, w, h);
    l.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.shadowColor = rgba(pal.rim, 0.55);
    ctx.shadowBlur = r * 0.35;
    ctx.drawImage(this.layer, 0, 0);
    ctx.restore();

    // Rare, subtle signal glitch — a reminder this is a simulation.
    if (this.opts.quality !== 'low') {
      if (now > this.glitchAt + 9000 + (this.seed % 5000)) this.glitchAt = now;
      const g = now - this.glitchAt;
      if (g < 120) {
        const y = cy - r + ((this.seed + Math.floor(now / 40)) % 100) / 100 * r * 3;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(this.layer, 0, y, w, r * 0.08, r * 0.05, y, w, r * 0.08);
        ctx.globalAlpha = 1;
      }
    }

    // Floating light specks
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const a = (i * 2.399 + this.seed) % (Math.PI * 2);
      const rr = r * (1.4 + ((i * 37) % 10) / 6);
      const x = cx + Math.cos(a + t * 0.05) * rr;
      const y = cy + r * 0.6 + Math.sin(a * 1.3 + t * 0.07) * rr * 0.7 - ((t * 8 + i * 30) % (r * 3)) * 0.2;
      const s = Math.max(1, r * 0.012);
      ctx.fillStyle = rgba(pal.rim, 0.25 + 0.2 * Math.sin(t * 2 + i));
      ctx.fillRect(x, y, s, s);
    }
    ctx.restore();

    if (this.opts.watermark) this.drawWatermark(w, h);
    if (this.opts.overlay) {
      ctx.save();
      this.opts.overlay(ctx, w, h);
      ctx.restore();
    }
  }

  private drawWatermark(w: number, h: number): void {
    const ctx = this.ctx;
    const s = Math.max(9, Math.min(w, h) * (this.opts.framing === 'portrait' ? 0.036 : 0.022));
    ctx.save();
    ctx.font = `700 ${s}px Manrope, system-ui, sans-serif`;
    const text = this.opts.watermark;
    const tw = ctx.measureText(text).width;
    const pad = s * 0.6;
    const x = s * 0.9;
    // Calls keep the bottom free for controls/captions; the label sits under the title instead.
    const y = this.opts.framing === 'call' ? h * 0.115 : this.opts.framing === 'tile' ? s * 0.9 : h - s * 2.4;
    ctx.fillStyle = 'rgba(5,8,14,0.55)';
    ctx.beginPath();
    ctx.roundRect(x, y, tw + pad * 2 + s * 0.9, s * 1.7, s * 0.85);
    ctx.fill();
    ctx.fillStyle = '#5ce1ff';
    ctx.beginPath();
    ctx.arc(x + pad + s * 0.25, y + s * 0.85, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad + s * 0.75, y + s * 0.88);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ still portraits for cards

const portraitCache = new Map<string, string>();

export function renderPortrait(profile: AvatarProfile, width: number, height: number, framing: Framing = 'portrait'): string {
  const key = `${profile.id}|${width}x${height}|${framing}|${profile.environment}`;
  const cached = portraitCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new AvatarRenderer(canvas, profile, { framing, watermark: '', quality: 'medium' });
  renderer.setEmotion('happy', 10_000);
  // Settle the expression before drawing.
  for (let i = 0; i < 40; i++) renderer.step(performance.now() + i * 16);
  renderer.draw(performance.now());
  const url = canvas.toDataURL('image/jpeg', 0.86);
  portraitCache.set(key, url);
  return url;
}
