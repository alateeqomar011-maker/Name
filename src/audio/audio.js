// Fully procedural WebAudio sound engine: ambience beds, weather, wildlife calls, dinosaur vocalisations,
// footsteps, vehicles and an adaptive musical pad.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.musicVolume = 0.5;
    this.listenerPos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this.engines = new Set();
    this.danger = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.32 * this.musicVolume; this.music.connect(this.master);
    // underwater / cave filter on the world bus
    this.world = ctx.createBiquadFilter();
    this.world.type = 'lowpass'; this.world.frequency.value = 20000;
    this.world.connect(this.sfx);
    // reverb send
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.2);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.18;
    this.reverb.connect(this.revGain).connect(this.sfx);
    // noise buffers
    this.white = this._noise('white');
    this.brown = this._noise('brown');
    this.pink = this._noise('pink');
    this._buildAmbience();
    this._buildMusic();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.music) this.music.gain.value = 0.32 * v; }

  _noise(kind) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; }
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _loop(buffer, filterType, freq, q = 0.7) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.amb);
    src.start(0, Math.random() * 3);
    return { src, f, g };
  }

  _buildAmbience() {
    this.A = {
      wind: this._loop(this.pink, 'bandpass', 500, 0.5),
      windHi: this._loop(this.white, 'highpass', 3000, 0.5),
      rain: this._loop(this.white, 'bandpass', 2800, 0.4),
      rainLow: this._loop(this.brown, 'lowpass', 400, 0.5),
      ocean: this._loop(this.brown, 'lowpass', 600, 0.5),
      river: this._loop(this.white, 'bandpass', 1200, 0.6),
      fall: this._loop(this.pink, 'lowpass', 1800, 0.5),
      cave: this._loop(this.brown, 'lowpass', 180, 0.5),
      fire: this._loop(this.white, 'bandpass', 900, 0.8),
      rumble: this._loop(this.brown, 'lowpass', 90, 0.7),
    };
    this.birdT = 1; this.insectT = 1; this.dripT = 1; this.callT = 4;
  }

  _buildMusic() {
    const ctx = this.ctx;
    this.pad = [];
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 900; this.padFilter.Q.value = 0.4;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.0;
    this.padFilter.connect(this.padGain).connect(this.music);
    this.musicDelay = ctx.createDelay(1.5);
    this.musicDelay.delayTime.value = 0.6;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    this.padGain.connect(this.musicDelay).connect(fb).connect(this.musicDelay);
    fb.connect(this.music);
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      const g = ctx.createGain(); g.gain.value = 0.22;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.detune.value = 7;
      o.connect(g); o2.connect(g); g.connect(this.padFilter);
      o.start(); o2.start();
      this.pad.push({ o, o2, g });
    }
    this.chordIdx = 0;
    this.chordT = 0;
    // tension pulse
    this.pulse = ctx.createOscillator(); this.pulse.type = 'sawtooth'; this.pulse.frequency.value = 55;
    this.pulseF = ctx.createBiquadFilter(); this.pulseF.type = 'lowpass'; this.pulseF.frequency.value = 220;
    this.pulseG = ctx.createGain(); this.pulseG.gain.value = 0;
    this.pulse.connect(this.pulseF).connect(this.pulseG).connect(this.music);
    this.pulse.start();
    this.beatT = 0;
  }

  // ---------- Per-frame ----------
  update(dt, env, camera) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // listener
    const L = ctx.listener;
    camera.getWorldPosition(this.listenerPos);
    camera.getWorldDirection(this._fwd);
    this._up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      L.positionX.setTargetAtTime(this.listenerPos.x, t, 0.02);
      L.positionY.setTargetAtTime(this.listenerPos.y, t, 0.02);
      L.positionZ.setTargetAtTime(this.listenerPos.z, t, 0.02);
      L.forwardX.setTargetAtTime(this._fwd.x, t, 0.02); L.forwardY.setTargetAtTime(this._fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(this._fwd.z, t, 0.02);
      L.upX.setTargetAtTime(this._up.x, t, 0.02); L.upY.setTargetAtTime(this._up.y, t, 0.02); L.upZ.setTargetAtTime(this._up.z, t, 0.02);
    } else {
      L.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
      L.setOrientation(this._fwd.x, this._fwd.y, this._fwd.z, this._up.x, this._up.y, this._up.z);
    }
    const A = this.A;
    const set = (n, v, tc = 0.4) => A[n].g.gain.setTargetAtTime(v, t, tc);
    const cave = env.inCave ? 1 : 0;
    const out = 1 - cave;
    const alt = clamp((env.altitude - 150) / 250, 0, 1);
    set('wind', (0.04 + env.wind * 0.22 + alt * 0.12) * out);
    A.wind.f.frequency.setTargetAtTime(350 + env.wind * 500 + Math.sin(t * 0.3) * 120, t, 0.5);
    set('windHi', (env.wind > 0.8 ? (env.wind - 0.8) * 0.06 : 0) * out);
    set('rain', env.rain * 0.16 * out * (env.underRoof ? 0.5 : 1));
    set('rainLow', env.rain * 0.12 * out);
    set('ocean', env.ocean * (0.22 + 0.12 * Math.sin(t * 0.35)) * out);
    A.ocean.f.frequency.setTargetAtTime(400 + 300 * Math.max(0, Math.sin(t * 0.35)), t, 0.3);
    set('river', env.river * 0.09 * out);
    set('fall', env.fall * 0.32 * out);
    set('cave', cave * 0.18);
    set('fire', env.fire * 0.12);
    set('rumble', clamp(env.rumble, 0, 1) * 0.6);
    this.world.frequency.setTargetAtTime(env.underwater ? 500 : 20000, t, 0.1);
    this.revGain.gain.setTargetAtTime(env.inCave ? 0.55 : 0.12, t, 0.5);

    // wildlife ambience
    if (!env.inCave && !env.underwater) {
      this.birdT -= dt;
      const day = env.dayFactor;
      const birdRate = { forest: 1, jungle: 1.6, grass: 0.7, swamp: 0.6, mountain: 0.25, desert: 0.15, beach: 0.4 }[env.biomeGroup] ?? 0.4;
      if (this.birdT <= 0) {
        this.birdT = (1 + Math.random() * 4) / Math.max(0.05, birdRate * day * (1 - env.rain * 0.8));
        if (day > 0.3 && env.rain < 0.6) this._bird(env.biomeGroup);
      }
      this.insectT -= dt;
      if (this.insectT <= 0) {
        this.insectT = 0.6 + Math.random() * 2;
        if (day < 0.4 || env.biomeGroup === 'jungle' || env.biomeGroup === 'swamp') this._insect(env.biomeGroup, 1 - day);
      }
      this.callT -= dt;
      if (this.callT <= 0) {
        this.callT = 12 + Math.random() * 25;
        if (env.distantCall) env.distantCall();
      }
    } else if (env.inCave) {
      this.dripT -= dt;
      if (this.dripT <= 0) { this.dripT = 0.5 + Math.random() * 2.5; this._drip(); }
    }

    // music: slow evolving pad, tension pulse when in danger
    this.chordT -= dt;
    const night = 1 - env.dayFactor;
    if (this.chordT <= 0) {
      this.chordT = 10 + Math.random() * 6;
      const dayCh = [[57, 64, 69, 72], [53, 60, 65, 69], [48, 55, 64, 67], [55, 62, 67, 71], [50, 57, 62, 65]];
      const nightCh = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 58], [40, 47, 52, 55]];
      const set2 = night > 0.5 ? nightCh : dayCh;
      this.chordIdx = (this.chordIdx + 1 + Math.floor(Math.random() * 2)) % set2.length;
      const ch = set2[this.chordIdx];
      this.pad.forEach((p, i) => {
        const f = 440 * Math.pow(2, (ch[i] - 69) / 12) * 0.5;
        p.o.frequency.setTargetAtTime(f, t, 2.5);
        p.o2.frequency.setTargetAtTime(f * 1.002, t, 2.5);
      });
    }
    const padLevel = (env.inCave ? 0.07 : 0.1) * (1 - this.danger * 0.5);
    this.padGain.gain.setTargetAtTime(padLevel, t, 2);
    this.padFilter.frequency.setTargetAtTime(500 + env.dayFactor * 700 + this.danger * 400, t, 2);
    this.danger += ((env.danger || 0) - this.danger) * Math.min(1, dt * 0.8);
    this.beatT -= dt;
    if (this.danger > 0.1 && this.beatT <= 0) {
      this.beatT = 0.5 - this.danger * 0.15;
      const g = this.pulseG.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.14 * this.danger, t + 0.02);
      g.exponentialRampToValueAtTime(0.0001, t + 0.3);
      this._heartbeat(this.danger);
    }
  }

  // ---------- Helpers ----------
  _spatial(pos, refDist = 10, rolloff = 1, maxDist = 2000) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist; p.rolloffFactor = rolloff; p.maxDistance = maxDist;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.world);
    const send = ctx.createGain(); send.gain.value = 0.4;
    p.connect(send).connect(this.reverb);
    return p;
  }

  _env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  _noiseBurst(dest, t, dur, type, freq, q, peak, buffer = this.white, attack = 0.005) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = buffer;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(dest);
    this._env(g, t, attack, peak, 0, dur);
    s.start(t, Math.random() * 3); s.stop(t + dur + attack + 0.1);
    return { s, f, g };
  }

  _bird(group) {
    const ctx = this.ctx, t = ctx.currentTime;
    const ang = Math.random() * Math.PI * 2;
    const pos = this.listenerPos.clone().add(new THREE.Vector3(Math.cos(ang) * 30, 8 + Math.random() * 10, Math.sin(ang) * 30));
    const dest = this._spatial(pos, 15, 1);
    const n = 2 + Math.floor(Math.random() * 5);
    const base = group === 'jungle' ? 1400 + Math.random() * 1800 : 2200 + Math.random() * 1800;
    const style = Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain();
      o.connect(g).connect(dest);
      const st = t + i * (0.09 + Math.random() * 0.12);
      const f0 = base * (0.9 + Math.random() * 0.25);
      if (style === 0) { o.frequency.setValueAtTime(f0, st); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, st + 0.07); }
      else if (style === 1) { o.frequency.setValueAtTime(f0 * 1.4, st); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, st + 0.1); }
      else { o.frequency.setValueAtTime(f0, st); o.frequency.linearRampToValueAtTime(f0 * 1.1, st + 0.04); o.frequency.linearRampToValueAtTime(f0 * 0.95, st + 0.09); }
      this._env(g, st, 0.01, 0.05, 0.02, 0.08);
      o.start(st); o.stop(st + 0.2);
    }
  }

  _insect(group, night) {
    const ctx = this.ctx, t = ctx.currentTime;
    const ang = Math.random() * Math.PI * 2;
    const pos = this.listenerPos.clone().add(new THREE.Vector3(Math.cos(ang) * 12, 0.5, Math.sin(ang) * 12));
    const dest = this._spatial(pos, 6, 1.4);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = 3800 + Math.random() * 1800;
    const am = ctx.createOscillator(); am.frequency.value = 25 + Math.random() * 30;
    const amg = ctx.createGain(); amg.gain.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const vca = ctx.createGain(); vca.gain.value = 0.5;
    am.connect(amg).connect(vca.gain);
    o.connect(vca).connect(g).connect(dest);
    const dur = 0.4 + Math.random() * 1.2;
    this._env(g, t, 0.05, 0.025 * (0.4 + night), dur, 0.1);
    o.start(t); am.start(t); o.stop(t + dur + 0.3); am.stop(t + dur + 0.3);
  }

  _drip() {
    const ctx = this.ctx, t = ctx.currentTime;
    const ang = Math.random() * Math.PI * 2;
    const dest = this._spatial(this.listenerPos.clone().add(new THREE.Vector3(Math.cos(ang) * 8, 3, Math.sin(ang) * 8)), 4, 1);
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = 900 + Math.random() * 900;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05);
    const g = ctx.createGain();
    o.connect(g).connect(dest);
    this._env(g, t, 0.002, 0.12, 0, 0.12);
    o.start(t); o.stop(t + 0.2);
  }

  _heartbeat(k) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, a] of [[0, 1], [0.16, 0.7]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.12);
      const g = ctx.createGain();
      o.connect(g).connect(this.music);
      this._env(g, t + dt, 0.01, 0.35 * k * a, 0, 0.15);
      o.start(t + dt); o.stop(t + dt + 0.25);
    }
  }

  // ---------- Public one-shots ----------
  play(name, opts = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = opts.pos ? this._spatial(opts.pos, opts.ref || 5, 1) : this.sfx;
    const vol = opts.vol ?? 1;
    switch (name) {
      case 'step': {
        const s = opts.surface || 'grass';
        const p = { grass: ['lowpass', 900, 0.08], sand: ['bandpass', 2500, 0.06], rock: ['bandpass', 1800, 0.07], snow: ['lowpass', 1500, 0.09], water: ['bandpass', 900, 0.14], mud: ['lowpass', 500, 0.12], wood: ['bandpass', 600, 0.1] }[s] || ['lowpass', 900, 0.08];
        this._noiseBurst(dest, t, p[2], p[0], p[1] * (0.85 + Math.random() * 0.3), 0.8, 0.22 * vol);
        if (s === 'wood' || s === 'rock') this._thump(dest, t, 120, 0.05, 0.08 * vol);
        break;
      }
      case 'footfall': {
        // heavy dinosaur footfall: sub-bass thump, ground crunch, and for giants a rolling rumble
        const m = opts.mass || 1;
        this._thump(dest, t, 70 / Math.sqrt(m), 0.18 + m * 0.06, Math.min(0.9, 0.25 * m) * vol);
        this._noiseBurst(dest, t, 0.12 + m * 0.05, 'lowpass', 260 + 200 / m, 0.8, Math.min(0.5, 0.12 * m) * vol, this.brown, 0.004);
        if (opts.surface === 'water') this._noiseBurst(dest, t, 0.45, 'bandpass', 700, 0.6, 0.25 * vol, this.white, 0.01);
        else if (opts.surface === 'leaves') this._noiseBurst(dest, t, 0.18, 'bandpass', 2600, 0.6, 0.08 * vol, this.white, 0.01);
        break;
      }
      case 'jump': this._noiseBurst(dest, t, 0.12, 'lowpass', 700, 0.7, 0.15 * vol); break;
      case 'land': this._noiseBurst(dest, t, 0.18, 'lowpass', 400, 0.7, 0.3 * vol); this._thump(dest, t, 80, 0.15, 0.25 * vol); break;
      case 'splash': this._noiseBurst(dest, t, 0.6, 'bandpass', 1200, 0.5, 0.35 * vol, this.white, 0.02); break;
      case 'swim': this._noiseBurst(dest, t, 0.35, 'bandpass', 800, 0.6, 0.12 * vol, this.white, 0.05); break;
      case 'chop': this._thump(dest, t, 180, 0.12, 0.45 * vol); this._noiseBurst(dest, t, 0.1, 'bandpass', 1600, 1.2, 0.2 * vol); break;
      case 'mine': this._tone(dest, t, 1900 + Math.random() * 400, 0.12, 0.12 * vol, 'triangle'); this._noiseBurst(dest, t, 0.08, 'highpass', 3000, 0.7, 0.2 * vol); break;
      case 'rustle': this._noiseBurst(dest, t, 0.3, 'bandpass', 3500, 0.5, 0.12 * vol, this.white, 0.05); break;
      case 'pickup': this._tone(dest, t, 880, 0.08, 0.1 * vol, 'sine', 1320); break;
      case 'craft': for (let i = 0; i < 3; i++) this._thump(dest, t + i * 0.12, 220, 0.06, 0.3 * vol); this._tone(dest, t + 0.4, 660, 0.25, 0.1 * vol, 'triangle', 990); break;
      case 'build': for (let i = 0; i < 4; i++) { this._thump(dest, t + i * 0.1, 160, 0.06, 0.35 * vol); this._noiseBurst(dest, t + i * 0.1, 0.05, 'bandpass', 1200, 1, 0.12 * vol); } break;
      case 'eat': for (let i = 0; i < 3; i++) this._noiseBurst(dest, t + i * 0.15, 0.08, 'bandpass', 1400, 1.5, 0.12 * vol); break;
      case 'drink': for (let i = 0; i < 4; i++) this._tone(dest, t + i * 0.18, 300 + Math.random() * 100, 0.08, 0.08 * vol, 'sine', 500); break;
      case 'hurt': this._thump(dest, t, 90, 0.2, 0.5 * vol); this._noiseBurst(dest, t, 0.2, 'lowpass', 600, 1, 0.25 * vol); break;
      case 'shutter': this._noiseBurst(dest, t, 0.03, 'highpass', 4000, 0.7, 0.3 * vol); this._noiseBurst(dest, t + 0.07, 0.04, 'bandpass', 2500, 1, 0.25 * vol); break;
      case 'zoom': this._tone(dest, t, 300, 0.12, 0.03 * vol, 'sawtooth', 340); break;
      case 'ui': this._tone(dest, t, 1200, 0.05, 0.05 * vol, 'sine'); break;
      case 'notify': this._tone(dest, t, 784, 0.15, 0.07 * vol, 'sine'); this._tone(dest, t + 0.12, 1047, 0.25, 0.07 * vol, 'sine'); break;
      case 'discover': [523, 659, 784, 1047].forEach((f, i) => this._tone(dest, t + i * 0.11, f, 0.5, 0.06 * vol, 'triangle')); break;
      case 'levelup': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(dest, t + i * 0.09, f, 0.7, 0.07 * vol, 'triangle')); break;
      case 'mission': [659, 784, 988, 1319].forEach((f, i) => this._tone(dest, t + i * 0.14, f, 0.8, 0.07 * vol, 'sine')); break;
      case 'error': this._tone(dest, t, 220, 0.18, 0.08 * vol, 'square', 180); break;
      case 'flare': this._noiseBurst(dest, t, 1.5, 'bandpass', 2200, 0.6, 0.3 * vol, this.white, 0.02); this._thump(dest, t, 100, 0.2, 0.3 * vol); break;
      case 'dart': this._noiseBurst(dest, t, 0.08, 'highpass', 2500, 0.8, 0.4 * vol); this._thump(dest, t, 200, 0.05, 0.2 * vol); break;
      case 'thunder': {
        const d = opts.dist || 500;
        const delay = Math.min(4, d / 343);
        const k = clamp(1 - d / 2500, 0.1, 1);
        if (d < 400) this._noiseBurst(this.sfx, t + delay, 0.4, 'highpass', 1500, 0.5, 0.5 * k, this.white, 0.001);
        this._noiseBurst(this.sfx, t + delay, 3.5 + Math.random() * 2, 'lowpass', 160 + k * 200, 0.6, 0.9 * k, this.brown, 0.05);
        this._noiseBurst(this.sfx, t + delay + 0.3, 2.5, 'lowpass', 90, 0.8, 0.7 * k, this.brown, 0.3);
        break;
      }
      case 'quake': this._noiseBurst(this.sfx, t, 6, 'lowpass', 70, 0.7, 1.0 * vol, this.brown, 0.8); break;
      case 'eruption': this._noiseBurst(this.sfx, t, 8, 'lowpass', 120, 0.6, 1.0 * vol, this.brown, 0.1); this._noiseBurst(this.sfx, t, 3, 'bandpass', 600, 0.5, 0.4 * vol, this.pink, 0.05); break;
      case 'radio': for (let i = 0; i < 2; i++) this._noiseBurst(dest, t + i * 0.12, 0.08, 'bandpass', 2000, 2, 0.12 * vol); this._tone(dest, t + 0.25, 1500, 0.08, 0.05 * vol, 'square'); break;
      case 'engineStart': this._tone(dest, t, 60, 0.6, 0.2 * vol, 'sawtooth', 110); break;
    }
  }

  _tone(dest, t, f, dur, peak, type = 'sine', f2 = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.6);
    const g = ctx.createGain();
    o.connect(g).connect(dest);
    this._env(g, t, 0.01, peak, dur * 0.3, dur * 0.7);
    o.start(t); o.stop(t + dur + 0.1);
  }
  _thump(dest, t, f, dur, peak) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.4, t + dur);
    const g = ctx.createGain();
    o.connect(g).connect(dest);
    this._env(g, t, 0.003, peak, 0, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------- Dinosaur voices ----------
  dinoSound(spec, pos, kind = 'call') {
    if (!this.ctx) return;
    const d = pos.distanceTo(this.listenerPos);
    if (d > 900) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.min(2, d / 343);
    const S = spec.sound;
    const big = Math.min(3, spec.length / 6);
    const dest = this._spatial(pos, 6 + big * 10, 1, 3000);
    const vol = 0.6 + big * 0.25;
    if (kind === 'bite') {
      this._noiseBurst(dest, t, 0.12, 'bandpass', 900 / Math.max(0.6, big), 1.2, 0.5 * vol);
      this._thump(dest, t, 90 / Math.max(0.7, big * 0.7), 0.12, 0.4 * vol);
      return;
    }
    let p = S.pitch * (0.92 + Math.random() * 0.16);
    let len = S.len * (0.85 + Math.random() * 0.3);
    if (kind === 'alarm') { p *= 1.25; len *= 0.6; }
    if (kind === 'death') { p *= 0.8; len *= 1.4; }
    if (kind === 'call') len *= 0.9;
    const k = S.kind;
    if (k === 'roar' || (k === 'bellow' && kind === 'roar') || kind === 'death') this._roar(dest, t, p, len, vol, k === 'bellow');
    else if (k === 'bellow') this._bellow(dest, t, p, len, vol);
    else if (k === 'honk') this._honk(dest, t, p, len, vol);
    else if (k === 'screech') this._screech(dest, t, p, len, vol);
    else if (k === 'grunt') this._grunt(dest, t, p, len, vol);
    else if (k === 'chirp') this._chirp(dest, t, p, len, vol);
    else if (k === 'caw') this._caw(dest, t, p, len, vol);
  }

  _shaper(amount) {
    const ctx = this.ctx;
    const ws = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
    ws.curve = curve;
    return ws;
  }

  _roar(dest, t, p, len, vol, soft) {
    const ctx = this.ctx;
    const f0 = 85 * p;
    const out = ctx.createGain();
    out.connect(dest);
    this._env(out, t, 0.18, 0.55 * vol, len * 0.45, len * 0.5);
    const sh = this._shaper(soft ? 2 : 8);
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    // growl tremolo
    const trem = ctx.createGain(); trem.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 16 + Math.random() * 10;
    const lfoG = ctx.createGain(); lfoG.gain.value = soft ? 0.15 : 0.35;
    lfo.connect(lfoG).connect(trem.gain);
    mix.connect(sh).connect(trem);
    // formants
    const forms = [[280, 4], [650, 5], [1200, 6], [2400, 8]];
    for (const [ff, q] of forms) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff * (0.7 + p * 0.5); bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = ff < 1000 ? 1.2 : 0.5;
      trem.connect(bp).connect(g).connect(out);
    }
    const lowp = ctx.createBiquadFilter(); lowp.type = 'lowpass'; lowp.frequency.value = 300;
    trem.connect(lowp).connect(out);
    const oscs = [];
    for (const [type, mul, det] of [['sawtooth', 1, 0], ['square', 1.005, 8], ['sawtooth', 0.5, -5]]) {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = det;
      o.frequency.setValueAtTime(f0 * mul * 0.8, t);
      o.frequency.linearRampToValueAtTime(f0 * mul * 1.15, t + len * 0.3);
      o.frequency.linearRampToValueAtTime(f0 * mul * 0.7, t + len);
      o.connect(mix);
      oscs.push(o);
    }
    const n = ctx.createBufferSource(); n.buffer = this.pink;
    const ng = ctx.createGain(); ng.gain.value = soft ? 0.25 : 0.6;
    n.connect(ng).connect(mix);
    for (const o of [...oscs, lfo, n]) { o.start(t); o.stop(t + len + 0.6); }
  }

  _bellow(dest, t, p, len, vol) {
    const ctx = this.ctx;
    const f0 = 60 * p;
    const out = ctx.createGain(); out.connect(dest);
    this._env(out, t, len * 0.3, 0.5 * vol, len * 0.3, len * 0.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 3;
    lp.connect(out);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.2, t + len * 0.4); o.frequency.linearRampToValueAtTime(f0 * 0.85, t + len);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f0 * 2.01;
    const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = f0 * 0.03;
    vib.connect(vg).connect(o.frequency);
    o.connect(lp); o2.connect(lp);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(t + len + 0.3); }
  }

  _honk(dest, t, p, len, vol) {
    const ctx = this.ctx;
    const f0 = 98 * p;
    const out = ctx.createGain(); out.connect(dest);
    this._env(out, t, 0.35, 0.45 * vol, len * 0.5, len * 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 3; bp.Q.value = 2.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    bp.connect(out); lp.connect(out);
    for (const [type, mul, g0] of [['triangle', 1, 0.8], ['sine', 2, 0.5], ['sawtooth', 3, 0.15]]) {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0 * mul * 0.95, t); o.frequency.linearRampToValueAtTime(f0 * mul, t + 0.4);
      const vib = ctx.createOscillator(); vib.frequency.value = 4.5; const vg = ctx.createGain(); vg.gain.value = f0 * mul * 0.012;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = g0;
      o.connect(g); g.connect(bp); g.connect(lp);
      o.start(t); vib.start(t); o.stop(t + len + 0.5); vib.stop(t + len + 0.5);
    }
  }

  _screech(dest, t, p, len, vol) {
    const ctx = this.ctx;
    const f0 = 900 * p;
    const out = ctx.createGain(); out.connect(dest);
    this._env(out, t, 0.03, 0.3 * vol, len * 0.4, len * 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 1.6; bp.Q.value = 1.5;
    bp.connect(out);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.4, t + len * 0.25); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + len);
    const vib = ctx.createOscillator(); vib.frequency.value = 28; const vg = ctx.createGain(); vg.gain.value = f0 * 0.08;
    vib.connect(vg).connect(o.frequency);
    const sh = this._shaper(4);
    o.connect(sh).connect(bp);
    const n = ctx.createBufferSource(); n.buffer = this.white; const ng = ctx.createGain(); ng.gain.value = 0.15;
    n.connect(ng).connect(bp);
    for (const x of [o, vib, n]) { x.start(t); x.stop(t + len + 0.2); }
  }

  _grunt(dest, t, p, len, vol) {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const st = t + i * (len / n);
      this._noiseBurst(dest, st, 0.18, 'lowpass', 260 * p, 4, 0.45 * vol, this.brown, 0.02);
      this._thump(dest, st, 70 * p, 0.18, 0.3 * vol);
    }
  }

  _chirp(dest, t, p, len, vol) {
    const ctx = this.ctx;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const st = t + i * 0.13;
      const o = ctx.createOscillator(); o.type = 'square';
      const f = 700 * p;
      o.frequency.setValueAtTime(f, st); o.frequency.exponentialRampToValueAtTime(f * 1.8, st + 0.06); o.frequency.exponentialRampToValueAtTime(f * 1.1, st + 0.11);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.5; bp.Q.value = 3;
      const g = ctx.createGain();
      o.connect(bp).connect(g).connect(dest);
      this._env(g, st, 0.005, 0.18 * vol, 0.04, 0.07);
      o.start(st); o.stop(st + 0.2);
    }
  }

  _caw(dest, t, p, len, vol) {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const st = t + i * len * 0.5;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = 520 * p;
      o.frequency.setValueAtTime(f * 1.2, st); o.frequency.exponentialRampToValueAtTime(f * 0.7, st + len * 0.4);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300 * p; bp.Q.value = 2;
      const g = ctx.createGain();
      const sh = this._shaper(3);
      o.connect(sh).connect(bp).connect(g).connect(dest);
      this._env(g, st, 0.01, 0.25 * vol, len * 0.15, len * 0.3);
      o.start(st); o.stop(st + len * 0.6);
    }
  }

  // ---------- Engines ----------
  engine(type) {
    if (!this.ctx) return { set() {}, stop() {} };
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(this.sfx);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    lp.connect(out);
    const base = type === 'boat' ? 45 : type === 'gyro' ? 32 : type === 'glider' ? 0 : 38;
    const nodes = [];
    if (type === 'glider') {
      const n = ctx.createBufferSource(); n.buffer = this.pink; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
      n.connect(bp).connect(out); n.start(); nodes.push(n);
      return {
        set: (rpm, load) => { out.gain.setTargetAtTime(0.05 + rpm * 0.2, ctx.currentTime, 0.2); bp.frequency.setTargetAtTime(400 + rpm * 900, ctx.currentTime, 0.2); },
        stop: () => { out.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => nodes.forEach((x) => x.stop()), 600); },
      };
    }
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    o1.connect(lp); o2.connect(g2).connect(lp);
    const n = ctx.createBufferSource(); n.buffer = this.brown; n.loop = true;
    const ng = ctx.createGain(); ng.gain.value = type === 'gyro' ? 0.6 : 0.25;
    n.connect(ng).connect(lp);
    const chop = ctx.createOscillator(); chop.frequency.value = 0;
    const chopG = ctx.createGain(); chopG.gain.value = type === 'gyro' ? 0.5 : 0;
    const vca = ctx.createGain(); vca.gain.value = 1;
    chop.connect(chopG).connect(vca.gain);
    lp.disconnect(); lp.connect(vca).connect(out);
    for (const x of [o1, o2, n, chop]) { x.start(); nodes.push(x); }
    return {
      set: (rpm, load = 0.5) => {
        const t = ctx.currentTime;
        const f = base * (1 + rpm * 2.2);
        o1.frequency.setTargetAtTime(f, t, 0.1);
        o2.frequency.setTargetAtTime(f * 0.5, t, 0.1);
        chop.frequency.setTargetAtTime(type === 'gyro' ? 8 + rpm * 14 : 0, t, 0.2);
        lp.frequency.setTargetAtTime(300 + rpm * 900 + load * 400, t, 0.1);
        out.gain.setTargetAtTime(0.06 + rpm * 0.12 + load * 0.05, t, 0.1);
      },
      stop: () => { out.gain.setTargetAtTime(0, ctx.currentTime, 0.15); setTimeout(() => nodes.forEach((x) => { try { x.stop(); } catch (e) { /* */ } }), 500); },
    };
  }
}
