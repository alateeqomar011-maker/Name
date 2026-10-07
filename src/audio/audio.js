// Fully procedural audio: ambience beds, positional creature voices, footsteps, weather and a soft music pad.
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.amb = {};
    this.birdTimer = 2;
    this.insectTimer = 1;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.settings.volume ?? 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.9;
    this.ambBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.12 * (this.settings.music ?? 0.5);
    this.musicBus.connect(this.master);
    // reverb (generated impulse)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.2);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.25;
    this.revSend.connect(this.reverb).connect(this.master);
    this.noise = { white: this._noise('white'), pink: this._noise('pink'), brown: this._noise('brown') };
    this._beds();
    this._music();
    this.ready = true;
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  _noise(kind) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _loop(buf, filterType, freq, q = 0.7) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.ambBus);
    src.start(0, Math.random() * 3);
    return { src, f, g };
  }

  _beds() {
    this.amb.wind = this._loop(this.noise.brown, 'lowpass', 500);
    this.amb.windHi = this._loop(this.noise.pink, 'bandpass', 1200, 0.5);
    this.amb.rain = this._loop(this.noise.white, 'highpass', 1400);
    this.amb.rainLow = this._loop(this.noise.pink, 'lowpass', 900);
    this.amb.surf = this._loop(this.noise.brown, 'lowpass', 700);
    this.amb.river = this._loop(this.noise.pink, 'bandpass', 900, 0.4);
    this.amb.falls = this._loop(this.noise.white, 'lowpass', 2200);
    this.amb.rumble = this._loop(this.noise.brown, 'lowpass', 90);
    this.amb.cave = this._loop(this.noise.brown, 'bandpass', 160, 2);
  }

  _music() {
    // slow evolving pad (Dorian-ish chords), very quiet
    const ctx = this.ctx;
    const out = ctx.createBiquadFilter();
    out.type = 'lowpass';
    out.frequency.value = 900;
    out.connect(this.musicBus);
    out.connect(this.revSend);
    this.padVoices = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.detune.value = 7;
      const g = ctx.createGain();
      g.gain.value = 0.0;
      o.connect(g); o2.connect(g);
      g.connect(out);
      o.start(); o2.start();
      this.padVoices.push({ o, o2, g });
    }
    const chords = [[50, 57, 62, 65], [48, 55, 60, 64], [45, 52, 57, 60], [43, 50, 55, 59], [46, 53, 58, 62]];
    let ci = 0;
    const next = () => {
      if (!this.ctx) return;
      const ch = chords[ci++ % chords.length];
      const t = ctx.currentTime;
      this.padVoices.forEach((v, i) => {
        const f = 440 * Math.pow(2, (ch[i] - 69) / 12);
        v.o.frequency.setTargetAtTime(f, t, 2.5);
        v.o2.frequency.setTargetAtTime(f * 1.002, t, 2.5);
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setTargetAtTime(this.musicOn ? 0.05 + Math.random() * 0.03 : 0, t, 3);
      });
      setTimeout(next, 14000 + Math.random() * 8000);
    };
    this.musicOn = true;
    next();
  }

  // listener update + ambience mix
  update(dt, game) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cam = game.camera;
    const L = ctx.listener;
    const p = cam.position;
    const fwd = cam.getWorldDirection(this._f || (this._f = new cam.position.constructor()));
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.05); L.positionY.setTargetAtTime(p.y, t, 0.05); L.positionZ.setTargetAtTime(p.z, t, 0.05);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.05); L.forwardY.setTargetAtTime(fwd.y, t, 0.05); L.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    const w = game.world;
    const P = game.player;
    const under = P.headUnder;
    const cave = !!P.inCave;
    const alt = Math.max(0, p.y);
    const windAmt = (this.windLevel ?? 0.4) * (cave ? 0.15 : 1) * (0.5 + Math.min(1, alt / 600)) * (under ? 0.1 : 1);
    const set = (bed, v, tc = 0.4) => bed.g.gain.setTargetAtTime(v, t, tc);
    set(this.amb.wind, windAmt * 0.35);
    this.amb.wind.f.frequency.setTargetAtTime(250 + windAmt * 500 + Math.sin(t * 0.3) * 100, t, 0.5);
    set(this.amb.windHi, windAmt * windAmt * 0.06);
    set(this.amb.rain, (this.rainLevel || 0) * 0.16 * (under ? 0.1 : 1));
    set(this.amb.rainLow, (this.rainLevel || 0) * 0.22 * (under ? 0.1 : 1));
    // proximity sampling (cheap, every ~0.5 s)
    this._probe = (this._probe || 0) - dt;
    if (this._probe <= 0) {
      this._probe = 0.5;
      let sea = 0, river = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        for (const r of [15, 60, 150]) {
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
          const h = w.height(x, z);
          if (h < -0.5 && !w.isRiverOrLake(x, z)) sea = Math.max(sea, 1 - r / 200);
          if (w.isRiverOrLake(x, z)) river = Math.max(river, 1 - r / 180);
        }
      }
      this.seaNear = sea;
      this.riverNear = river;
      let falls = 0;
      for (const f of game.water.falls) falls = Math.max(falls, 1 - f.bottom.distanceTo(p) / 450);
      this.fallsNear = falls;
      this.volcNear = Math.max(0, 1 - Math.hypot(p.x - 2450, p.z + 950) / 1600);
    }
    set(this.amb.surf, (this.seaNear || 0) * (0.22 + 0.12 * Math.sin(t * 0.45)) * (cave ? 0 : 1));
    set(this.amb.river, (this.riverNear || 0) * 0.12);
    set(this.amb.falls, Math.pow(this.fallsNear || 0, 1.5) * 0.4);
    set(this.amb.rumble, (this.volcNear || 0) * 0.5 + (game.volcanoShake || 0) * 0.8);
    set(this.amb.cave, cave ? 0.18 : 0, 1);
    this.revSend.gain.setTargetAtTime(cave ? 0.9 : 0.22, t, 0.5);
    if (under) { this.ambBus.gain.setTargetAtTime(0.35, t, 0.1); }
    else this.ambBus.gain.setTargetAtTime(0.9, t, 0.3);

    // creature-less life: birds by day, insects & frogs at night
    const day = game.sky.dayFactor;
    const biome = this._biomeCache && this._biomeT > 0 ? this._biomeCache : (this._biomeCache = w.biome(p.x, p.z));
    this._biomeT = (this._biomeT || 0) > 0 ? this._biomeT - dt : 2;
    const lush = biome === 'jungle' || biome === 'grass' || biome === 'island' || biome === 'forest';
    if (!cave && !under && (this.rainLevel || 0) < 0.5) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0 && day > 0.4 && lush) {
        this.birdTimer = 1.2 + Math.random() * (biome === 'jungle' ? 2 : 5);
        this._bird(biome === 'jungle');
      }
      this.insectTimer -= dt;
      if (this.insectTimer <= 0 && day < 0.5 && lush) {
        this.insectTimer = 0.25 + Math.random() * 0.6;
        this._cricket();
      }
    }
    this.musicOn = !game.paused && (this.settings.music ?? 0.5) > 0;
  }

  setWeather(rain, wind, snow) {
    this.rainLevel = snow ? rain * 0.15 : rain;
    this.windLevel = Math.min(1.4, 0.25 + wind * 0.8 + (snow ? 0.3 : 0));
  }

  // ---- positional helper
  _panner(pos) {
    const pn = this.ctx.createPanner();
    pn.panningModel = 'HRTF';
    pn.distanceModel = 'inverse';
    pn.refDistance = 8;
    pn.maxDistance = 3000;
    pn.rolloffFactor = 1;
    if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; }
    else pn.setPosition(pos.x, pos.y, pos.z);
    pn.connect(this.sfx);
    const send = this.ctx.createGain();
    send.gain.value = 0.35;
    pn.connect(send).connect(this.revSend);
    return pn;
  }

  _burst(dest, { buf = 'white', type = 'bandpass', freq = 1000, q = 1, dur = 0.12, gain = 0.3, attack = 0.005, freqEnd = null, delay = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise[buf];
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 3);
    s.stop(t + dur + 0.05);
  }

  _tone(dest, { type = 'sine', f0 = 200, f1 = null, dur = 0.2, gain = 0.2, attack = 0.01, delay = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- one-shots
  footstep(surface, intensity = 0.6, wet = false) {
    if (!this.ready) return;
    const v = 0.08 * intensity;
    if (wet || surface === 'water') return this._burst(this.sfx, { buf: 'white', type: 'bandpass', freq: 900, q: 0.6, dur: 0.25, gain: v * 1.6, freqEnd: 2500 });
    if (surface === 'snow') return this._burst(this.sfx, { buf: 'white', type: 'lowpass', freq: 2500, dur: 0.18, gain: v * 1.5, freqEnd: 900 });
    if (surface === 'sand') return this._burst(this.sfx, { buf: 'white', type: 'bandpass', freq: 2200, q: 0.5, dur: 0.12, gain: v });
    if (surface === 'rock') { this._burst(this.sfx, { buf: 'white', type: 'bandpass', freq: 3200, q: 2, dur: 0.05, gain: v * 1.2 }); return this._tone(this.sfx, { f0: 180, f1: 90, dur: 0.06, gain: v * 0.8 }); }
    this._burst(this.sfx, { buf: 'pink', type: 'highpass', freq: 1400, dur: 0.14, gain: v * 1.1 });
    this._burst(this.sfx, { buf: 'brown', type: 'lowpass', freq: 300, dur: 0.08, gain: v * 0.8 });
  }
  climbStep() { if (this.ready) this._burst(this.sfx, { buf: 'white', type: 'bandpass', freq: 2600, q: 1.5, dur: 0.08, gain: 0.05 }); }
  swimStroke(under) { if (this.ready) this._burst(this.sfx, { buf: 'pink', type: under ? 'lowpass' : 'bandpass', freq: under ? 500 : 1100, q: 0.7, dur: 0.45, gain: 0.08, attack: 0.08 }); }
  jump() { if (this.ready) this._burst(this.sfx, { buf: 'pink', type: 'bandpass', freq: 600, dur: 0.1, gain: 0.04 }); }
  hurt() {
    if (!this.ready) return;
    this._tone(this.sfx, { type: 'sine', f0: 120, f1: 50, dur: 0.25, gain: 0.35 });
    this._burst(this.sfx, { buf: 'brown', type: 'lowpass', freq: 400, dur: 0.3, gain: 0.3 });
  }
  chop(hard) {
    if (!this.ready) return;
    this._tone(this.sfx, { type: 'triangle', f0: hard ? 900 : 260, f1: hard ? 600 : 140, dur: hard ? 0.12 : 0.1, gain: 0.18 });
    this._burst(this.sfx, { buf: 'white', type: 'bandpass', freq: hard ? 4000 : 1800, q: 1.5, dur: 0.08, gain: 0.12 });
  }
  pickup() { if (this.ready) { this._tone(this.sfx, { type: 'sine', f0: 660, f1: 990, dur: 0.12, gain: 0.07 }); } }
  ui() { if (this.ready) this._tone(this.sfx, { type: 'sine', f0: 880, dur: 0.06, gain: 0.04 }); }
  craft() {
    if (!this.ready) return;
    [0, 0.09, 0.18].forEach((d, i) => this._tone(this.sfx, { type: 'triangle', f0: 523 * Math.pow(1.26, i), dur: 0.25, gain: 0.06, delay: d }));
  }
  discover() {
    if (!this.ready) return;
    [0, 0.15, 0.3, 0.5].forEach((d, i) => this._tone(this.revSend, { type: 'sine', f0: [392, 523, 659, 784][i], dur: 1.2, gain: 0.12, delay: d, attack: 0.05 }));
  }
  eat() { if (this.ready) for (let i = 0; i < 3; i++) this._burst(this.sfx, { buf: 'pink', type: 'bandpass', freq: 1500, q: 2, dur: 0.07, gain: 0.08, delay: i * 0.12 }); }
  drink() { if (this.ready) for (let i = 0; i < 3; i++) this._tone(this.sfx, { type: 'sine', f0: 300, f1: 500, dur: 0.1, gain: 0.06, delay: i * 0.18 }); }
  place() { if (this.ready) this._tone(this.sfx, { type: 'triangle', f0: 200, f1: 120, dur: 0.15, gain: 0.2 }); }
  throwWhoosh() { if (this.ready) this._burst(this.sfx, { buf: 'white', type: 'bandpass', freq: 600, freqEnd: 2500, q: 1, dur: 0.3, gain: 0.08, attack: 0.05 }); }
  hit() { if (this.ready) { this._tone(this.sfx, { type: 'sine', f0: 160, f1: 60, dur: 0.15, gain: 0.25 }); this._burst(this.sfx, { buf: 'pink', type: 'lowpass', freq: 900, dur: 0.12, gain: 0.2 }); } }

  roar(pos, voice, power = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const pn = this._panner(pos);
    const t = ctx.currentTime;
    const dur = 1.6 + power * 1.4;
    const base = 70 * voice.pitch;
    const mix = ctx.createGain();
    mix.gain.setValueAtTime(0.0001, t);
    mix.gain.exponentialRampToValueAtTime(0.9 * power, t + 0.25);
    mix.gain.setValueAtTime(0.9 * power, t + dur * 0.6);
    mix.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // formant filter bank
    const formants = [[300, 6], [750, 8], [1600, 10]].map(([f, q]) => {
      const b = ctx.createBiquadFilter();
      b.type = 'bandpass';
      b.frequency.value = f * Math.sqrt(voice.pitch);
      b.Q.value = q;
      b.connect(mix);
      return b;
    });
    const dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3); }
    dist.curve = curve;
    for (const det of [0, 9, -13]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 0.7, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.15, t + dur * 0.3);
      o.frequency.exponentialRampToValueAtTime(base * 0.6, t + dur);
      o.detune.value = det;
      // vibrato / growl
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 22 + Math.random() * 10;
      const lg = ctx.createGain();
      lg.gain.value = base * 0.08;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur);
      o.connect(dist);
      o.start(t); o.stop(t + dur);
    }
    const n = ctx.createBufferSource();
    n.buffer = this.noise.pink;
    const ng = ctx.createGain();
    ng.gain.value = 0.6;
    n.connect(ng).connect(dist);
    n.start(t, Math.random()); n.stop(t + dur);
    formants.forEach((f) => dist.connect(f));
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 220 * voice.pitch;
    dist.connect(low).connect(mix);
    mix.connect(pn);
  }

  creatureCall(pos, voice, power = 0.6) {
    if (!this.ready) return;
    const pn = this._panner(pos);
    const f = 140 * voice.pitch;
    if (voice.pitch > 1.5) {
      // chirps / barks for small predators
      for (let i = 0; i < 3; i++) this._tone(pn, { type: 'sawtooth', f0: f * 2.2, f1: f * 1.2, dur: 0.12, gain: 0.25 * power, delay: i * 0.16 + Math.random() * 0.05 });
      this._burst(pn, { buf: 'white', type: 'bandpass', freq: f * 6, q: 4, dur: 0.25, gain: 0.15 * power });
    } else {
      // honks / bellows for big herbivores
      this._tone(pn, { type: 'triangle', f0: f, f1: f * 0.8, dur: 0.9, gain: 0.4 * power, attack: 0.1 });
      this._tone(pn, { type: 'sine', f0: f * 0.5, f1: f * 0.45, dur: 1.1, gain: 0.35 * power, attack: 0.15 });
    }
  }

  bite(pos, voice) {
    if (!this.ready) return;
    const pn = this._panner(pos);
    this._burst(pn, { buf: 'white', type: 'bandpass', freq: 1800 * voice.pitch, q: 3, dur: 0.07, gain: 0.5 });
    this._tone(pn, { type: 'square', f0: 90 * voice.pitch, f1: 50, dur: 0.12, gain: 0.25 });
  }

  thud(pos, s) {
    if (!this.ready) return;
    const pn = this._panner(pos);
    this._tone(pn, { type: 'sine', f0: 55, f1: 30, dur: 0.4, gain: 0.8 * s + 0.1 });
    this._burst(pn, { buf: 'brown', type: 'lowpass', freq: 200, dur: 0.3, gain: 0.5 * s });
  }

  thunder(delay, intensity) {
    if (!this.ready) return;
    const near = intensity > 0.8;
    if (near) this._burst(this.master, { buf: 'white', type: 'highpass', freq: 1500, dur: 0.25, gain: 0.5 * intensity, delay });
    this._burst(this.master, { buf: 'brown', type: 'lowpass', freq: 160, freqEnd: 60, dur: 4 + intensity * 3, gain: 0.9 * intensity, attack: 0.08, delay: delay + 0.05 });
    for (let i = 0; i < 5; i++) this._burst(this.master, { buf: 'brown', type: 'lowpass', freq: 300, dur: 1.2, gain: 0.4 * intensity * Math.random(), attack: 0.05, delay: delay + 0.3 + Math.random() * 2.5 });
  }

  splash(pos, s = 1) {
    if (!this.ready) return;
    const pn = this._panner(pos);
    this._burst(pn, { buf: 'white', type: 'bandpass', freq: 800, freqEnd: 3000, q: 0.5, dur: 0.6 * s + 0.2, gain: 0.5 * s, attack: 0.01 });
  }

  eruption(pos) {
    if (!this.ready) return;
    const pn = this._panner(pos);
    this._burst(pn, { buf: 'brown', type: 'lowpass', freq: 120, dur: 6, gain: 1.5, attack: 0.1 });
    this._burst(pn, { buf: 'pink', type: 'lowpass', freq: 600, dur: 3, gain: 0.6, attack: 0.05 });
  }

  _bird(jungle) {
    const ctx = this.ctx;
    const ang = Math.random() * Math.PI * 2;
    const pos = { x: Math.cos(ang) * 40, y: 10 + Math.random() * 10, z: Math.sin(ang) * 40 };
    const p = this._f ? { x: this.ctx.listener.positionX ? this.ctx.listener.positionX.value + pos.x : pos.x, y: pos.y + (this.ctx.listener.positionY ? this.ctx.listener.positionY.value : 0), z: (this.ctx.listener.positionZ ? this.ctx.listener.positionZ.value : 0) + pos.z } : pos;
    const pn = this._panner(p);
    const base = jungle ? 1400 + Math.random() * 2000 : 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 5);
    const style = Math.random();
    for (let i = 0; i < n; i++) {
      const d = i * (0.09 + Math.random() * 0.06);
      if (style < 0.5) this._tone(pn, { type: 'sine', f0: base * (1 + Math.random() * 0.3), f1: base * (0.7 + Math.random() * 0.6), dur: 0.08 + Math.random() * 0.06, gain: 0.05, delay: d });
      else this._tone(pn, { type: 'triangle', f0: base * 0.6, f1: base * 1.3, dur: 0.12, gain: 0.04, delay: d * 1.6 });
    }
    void ctx;
  }

  _cricket() {
    const f = 4200 + Math.random() * 800;
    for (let i = 0; i < 3; i++) this._tone(this.ambBus, { type: 'sine', f0: f, dur: 0.03, gain: 0.012 + Math.random() * 0.01, delay: i * 0.05 });
    if (Math.random() < 0.08) this._tone(this.ambBus, { type: 'triangle', f0: 260, f1: 180, dur: 0.18, gain: 0.03 }); // frog
  }
}
