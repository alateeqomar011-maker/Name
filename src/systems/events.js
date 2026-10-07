// Large unpredictable world events: volcanic eruptions, earthquakes, massive storms, migrations,
// rare dinosaur encounters, floods and forest fires.
import * as THREE from 'three';
import { VOLCANO, BIOME, REGIONS } from '../world/worldgen.js';
import { SPECIES } from '../dinos/species.js';
import { clamp, lerp } from '../core/noise.js';

const _v = new THREE.Vector3();

export const EVENT_INFO = {
  eruption: { name: 'Volcanic Eruption', icon: '🌋' },
  quake: { name: 'Earthquake', icon: '🫨' },
  storm: { name: 'Massive Storm', icon: '⛈️' },
  migration: { name: 'Great Migration', icon: '🦕' },
  rare: { name: 'Rare Encounter', icon: '⭐' },
  flood: { name: 'Flash Flood', icon: '🌊' },
  fire: { name: 'Forest Fire', icon: '🔥' },
};

export class WorldEvents {
  constructor(game) {
    this.game = game;
    this.active = [];
    this.timer = 240 + Math.random() * 180;
    this.shake = 0;
    this.fires = [];
    this.history = [];
    this.lavaBombs = [];
    this.ashTint = 0;
  }

  // External trigger from lightning strikes
  lightningStrike(x, z) {
    const b = this.game.world.getBiome(x, z);
    if ([BIOME.FOREST, BIOME.PINEFOREST, BIOME.GRASSLAND, BIOME.JUNGLE].includes(b) && !this.active.some((e) => e.type === 'fire')) this.start('fire', { x, z });
  }

  lavaHeat(P) {
    let h = 0;
    for (const e of this.active) if (e.type === 'eruption') {
      const d = Math.hypot(P.x - VOLCANO.x, P.z - VOLCANO.z);
      h = Math.max(h, clamp(1 - d / 260, 0, 1) * e.intensity);
    }
    for (const f of this.fires) {
      const d = Math.hypot(P.x - f.x, P.z - f.z);
      if (d < f.r) h = Math.max(h, (1 - d / f.r) * 0.8);
    }
    return h;
  }

  pickEvent() {
    const g = this.game;
    const P = g.player.pos;
    const opts = [['quake', 2], ['storm', 2], ['migration', 3], ['rare', 2], ['eruption', 1.5]];
    if (g.weather.local.rain > 0.4 || g.weather.type === 'heavyrain' || g.weather.type === 'storm') opts.push(['flood', 3]);
    const b = g.world.getBiome(P.x, P.z);
    if (g.weather.local.rain < 0.1 && [BIOME.FOREST, BIOME.PINEFOREST, BIOME.GRASSLAND].includes(b)) opts.push(['fire', 1.5]);
    const avail = opts.filter(([t]) => !this.active.some((e) => e.type === t));
    let tot = 0;
    for (const [, w] of avail) tot += w;
    let r = Math.random() * tot;
    for (const [t, w] of avail) { r -= w; if (r <= 0) return t; }
    return null;
  }

  start(type, opts = {}) {
    const g = this.game;
    const P = g.player.pos;
    const e = { type, t: 0, intensity: 0, done: false, ...opts };
    switch (type) {
      case 'eruption': {
        e.dur = 150;
        g.ui.radio('Dr. Vargas', 'Seismographs are going wild — Ember Peak is erupting! Stay clear of the volcano and watch for falling ash.');
        g.audio.play('eruption');
        e.x = VOLCANO.x; e.z = VOLCANO.z;
        g.dinos.scareAround(new THREE.Vector3(VOLCANO.x, 0, VOLCANO.z), 900, 40);
        break;
      }
      case 'quake': {
        e.dur = 22;
        const a = Math.random() * Math.PI * 2;
        e.x = P.x + Math.cos(a) * 300; e.z = P.z + Math.sin(a) * 300;
        g.audio.play('quake');
        g.ui.notify('🫨 Earthquake! The ground is shaking!', 'warn', 5);
        g.dinos.scareAround(P, 600, 15);
        break;
      }
      case 'storm': {
        e.dur = 260;
        g.weather.override = { cloud: 1, dark: 1, rain: 1, wind: 1.55, fog: 3, lightning: 0.55 };
        g.ui.radio('Dr. Vargas', 'A massive storm front is rolling in from the sea. Find shelter — lightning has been striking the forests.');
        break;
      }
      case 'migration': {
        const ids = ['parasaur', 'brachio', 'galli', 'triceratops', 'iguanodon'];
        const id = ids[Math.floor(Math.random() * ids.length)];
        const spec = SPECIES[id];
        // a path passing near the player through suitable land
        const a = Math.random() * Math.PI * 2;
        const from = { x: P.x + Math.cos(a) * 340, z: P.z + Math.sin(a) * 340 };
        const to = { x: P.x - Math.cos(a) * 600, z: P.z - Math.sin(a) * 600 };
        const w = g.world;
        if (w.getHeight(from.x, from.z) < 2 || !w.inBounds(from.x, from.z)) { from.x = P.x + Math.cos(a + Math.PI) * 340; from.z = P.z + Math.sin(a + Math.PI) * 340; }
        to.x = clamp(to.x, -1500, 1500); to.z = clamp(to.z, -1500, 1500);
        const n = id === 'brachio' ? 7 : id === 'galli' ? 18 : 12;
        e.herd = g.dinos.startMigration(id, from, to, n);
        e.dur = 400;
        e.species = id;
        g.ui.radio('Dr. Vargas', `Incredible! A huge herd of ${spec.short} is migrating right past your position. This is a once-in-a-lifetime photo opportunity!`);
        break;
      }
      case 'rare': {
        const pool = [['giga', 1], ['theriz', 1], ['quetzal', 1], ['trex', 0.6]];
        const id = pool[Math.floor(Math.random() * pool.length)][0];
        const h = g.dinos.spawnRare(id, P, 320, 170);
        if (!h) return;
        if (id === 'trex') h.morphs = ['albino'];
        e.herd = h; e.species = id; e.dur = 420;
        const dir = this._dirName(h.x - P.x, h.z - P.z);
        g.ui.radio('Dr. Vargas', `Unconfirmed sighting of a ${id === 'trex' ? 'white Tyrannosaurus' : SPECIES[id].short} ${dir} of you. Approach with extreme caution — and get a photo!`);
        break;
      }
      case 'flood': {
        e.dur = 220;
        g.ui.notify('🌊 Flash flood! Rivers and lowlands are flooding.', 'warn', 5);
        g.ui.radio('Dr. Vargas', 'The rivers are bursting their banks. Get to high ground!');
        break;
      }
      case 'fire': {
        if (e.x === undefined) {
          const s = g.world.findSpot(Math.random, (x, z, h, b) => [BIOME.FOREST, BIOME.PINEFOREST].includes(b) && Math.hypot(x - P.x, z - P.z) < 700 && Math.hypot(x - P.x, z - P.z) > 150);
          if (!s) return;
          e.x = s.x; e.z = s.z;
        }
        e.dur = 240;
        this.fires.push({ x: e.x, z: e.z, r: 12, age: 0, light: g.fx.addLight({ pos: new THREE.Vector3(e.x, g.world.getHeight(e.x, e.z) + 4, e.z), color: 0xff6622, intensity: 120, dist: 90, flicker: true, priority: 3 }) });
        const dir = this._dirName(e.x - P.x, e.z - P.z);
        g.ui.radio('Dr. Vargas', `Smoke on the horizon ${dir} of you — a forest fire! Wildlife will be fleeing. Keep your distance.`);
        break;
      }
    }
    this.active.push(e);
    this.history.push(type);
    g.ui.eventBanner(EVENT_INFO[type]);
    g.emit('world-event', { type });
  }

  _dirName(dx, dz) {
    const a = Math.atan2(dx, -dz) * 180 / Math.PI;
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return dirs[(Math.round(((a + 360) % 360) / 45)) % 8];
  }

  end(e) {
    const g = this.game;
    e.done = true;
    if (e.type === 'storm') g.weather.override = null, g.weather.set('rain', 120);
    if (e.type === 'flood') g.world.flood = 0;
    if (e.type === 'fire') { for (const f of this.fires) g.fx.removeLight(f.light); this.fires = []; }
    if (['eruption', 'quake', 'storm', 'flood', 'fire'].includes(e.type) && g.player.alive) g.emit('event-survived', { type: e.type });
  }

  update(dt) {
    const g = this.game;
    const P = g.player.pos;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 360 + Math.random() * 420;
      const t = this.pickEvent();
      if (t) this.start(t);
    }
    this.shake = 0;
    let ashTint = 0;
    for (const e of this.active) {
      e.t += dt;
      const k = clamp(Math.min(e.t / 8, (e.dur - e.t) / 10), 0, 1);
      e.intensity = k;
      switch (e.type) {
        case 'eruption': {
          const top = new THREE.Vector3(VOLCANO.x, g.world.getHeight(VOLCANO.x, VOLCANO.z) + 20, VOLCANO.z);
          const d = Math.hypot(P.x - VOLCANO.x, P.z - VOLCANO.z);
          // smoke column & lava fountains (only spawn when reasonably close / visible)
          if (d < 2600) {
            for (let i = 0; i < 4; i++) if (Math.random() < dt * 20 * k) g.fx.smoke(top.clone().add(new THREE.Vector3(0, Math.random() * 60, 0)), 12, 0.12, 14);
            for (let i = 0; i < 3; i++) if (Math.random() < dt * 30 * k) g.fx.ember(top, 6);
          }
          if (Math.random() < dt * 0.6 * k) { g.fx.flash(top.clone().add(new THREE.Vector3(0, 30, 0)), 0xff4411, 400, 500, 2); }
          this.shake = Math.max(this.shake, k * clamp(1 - d / 2200, 0, 1) * 0.7);
          ashTint = Math.max(ashTint, k * clamp(1 - d / 1800, 0, 0.8));
          // lava bombs near the volcano
          if (d < 700 && Math.random() < dt * 0.8 * k) {
            const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 250;
            const x = VOLCANO.x + Math.cos(a) * r, z = VOLCANO.z + Math.sin(a) * r;
            this.lavaBombs.push({ p: top.clone(), v: new THREE.Vector3((x - top.x) / 4, 40, (z - top.z) / 4), t: 0 });
          }
          if (e.t > e.dur) this.end(e);
          break;
        }
        case 'quake': {
          const d = Math.hypot(P.x - e.x, P.z - e.z);
          const s = k * clamp(1.2 - d / 1500, 0, 1) * (0.6 + 0.4 * Math.sin(e.t * 3));
          this.shake = Math.max(this.shake, s);
          g.audio.rumble = s;
          if (Math.random() < dt * 4 * s) g.fx.dust(new THREE.Vector3(P.x + (Math.random() - 0.5) * 40, g.world.getHeight(P.x, P.z), P.z + (Math.random() - 0.5) * 40), 2);
          if (s > 0.6 && Math.random() < dt * 0.3 && !g.player.inVehicle) g.player.damage(3, 'Falling rocks');
          if (e.t > e.dur) { g.audio.rumble = 0; this.end(e); }
          break;
        }
        case 'storm': if (e.t > e.dur) this.end(e); break;
        case 'migration': {
          if (!e.herd || e.t > e.dur || (!e.herd.migrating && e.t > 60)) this.end(e);
          break;
        }
        case 'rare': if (e.t > e.dur) this.end(e); break;
        case 'flood': {
          g.world.flood = lerp(0, 1.8, k);
          if (e.t > e.dur) this.end(e);
          break;
        }
        case 'fire': {
          const rain = g.weather.local.rain;
          for (const f of this.fires) {
            f.age += dt;
            f.r = Math.min(70, f.r + dt * (rain > 0.3 ? -0.8 : 0.35));
            const fy = g.world.getHeight(f.x, f.z);
            const d = Math.hypot(P.x - f.x, P.z - f.z);
            if (d < 900) {
              const n = Math.ceil(f.r / 6);
              for (let i = 0; i < n; i++) {
                if (Math.random() > dt * 14) continue;
                const a = Math.random() * Math.PI * 2, r = f.r * Math.sqrt(Math.random());
                const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
                const y = g.world.getHeight(x, z);
                g.fx.fire(_v.set(x, y + Math.random() * 3, z), 2.5);
                if (Math.random() < 0.3) g.fx.smoke(_v.set(x, y + 4, z), 3, 0.15, 5);
              }
            }
            if (Math.random() < dt * 2) g.veg.scorch(f.x, f.z, f.r);
            f.light.pos.set(f.x, fy + 6, f.z);
            if (Math.random() < dt * 0.4) g.dinos.scareAround(new THREE.Vector3(f.x, 0, f.z), f.r + 80, 12);
          }
          if (rain > 0.3) e.dur = Math.min(e.dur, e.t + 40);
          g.audio.fire = this.fires.length ? clamp(1 - (Math.hypot(P.x - this.fires[0].x, P.z - this.fires[0].z) - this.fires[0].r) / 150, 0, 1) : 0;
          if (e.t > e.dur || this.fires.every((f) => f.r < 3)) { g.audio.fire = 0; this.end(e); }
          break;
        }
      }
    }
    this.active = this.active.filter((e) => !e.done);
    // lava bombs
    for (let i = this.lavaBombs.length - 1; i >= 0; i--) {
      const b = this.lavaBombs[i];
      b.t += dt;
      b.v.y -= 15 * dt;
      b.p.addScaledVector(b.v, dt);
      if (Math.random() < 0.6) g.fx.ember(b.p, 1.5);
      const gh = g.world.getHeight(b.p.x, b.p.z);
      if (b.p.y < gh || b.t > 12) {
        g.fx.flash(new THREE.Vector3(b.p.x, gh + 3, b.p.z), 0xff4400, 80, 40, 3);
        for (let k = 0; k < 10; k++) g.fx.ember(new THREE.Vector3(b.p.x, gh + 0.5, b.p.z), 2);
        g.fx.smoke(new THREE.Vector3(b.p.x, gh + 2, b.p.z), 3, 0.2, 3);
        if (Math.hypot(P.x - b.p.x, P.z - b.p.z) < 10) g.player.damage(35, 'Lava bomb', b.p);
        this.lavaBombs.splice(i, 1);
      }
    }
    this.ashTint = ashTint;
  }

  serialize() { return { timer: this.timer }; }
  deserialize(o) { if (o && o.timer) this.timer = o.timer; }
}
