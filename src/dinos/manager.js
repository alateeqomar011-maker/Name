// World-wide dinosaur population. Herds are simulated abstractly everywhere and become
// fully animated individuals when the player is near.
import * as THREE from 'three';
import { SPECIES, SPECIES_LIST } from './species.js';
import { buildTemplate, makeSkinMaterial } from './model.js';
import { Dino } from './dino.js';
import { mulberry32, clamp } from '../core/noise.js';
import { BIOME, HALF } from '../world/worldgen.js';

const ACTIVATE = 300, DEACTIVATE = 380;

class Herd {
  constructor(mgr, spec, x, z, count, rand) {
    this.mgr = mgr;
    this.id = mgr.nextHerdId++;
    this.spec = spec;
    this.x = x; this.z = z;
    this.count = count;
    this.maxCount = count;
    this.target = new THREE.Vector3(x, 0, z);
    this.mode = 'graze';
    this.modeT = 20 + rand() * 60;
    this.members = [];
    this.active = false;
    this.panicT = 0;
    this.panicFrom = new THREE.Vector3();
    this.juvenile = rand() < 0.4;
    this.morphs = [];
    for (let i = 0; i < count; i++) this.morphs.push(rand() < 0.012 ? (rand() < 0.5 ? 'albino' : 'melanistic') : null);
    this.tint = 0.9 + rand() * 0.2;
    this.lastSeen = -1e9;
    this.migrating = false;
    this.retarget = false;
  }
  panic(from, t) {
    this.panicT = t;
    this.panicFrom.set(from.x, 0, from.z);
  }
}

export class DinoManager {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.group = new THREE.Group();
    this.group.name = 'dinos';
    game.scene.add(this.group);
    this.templates = {};
    this.herds = [];
    this.active = [];
    this.nextId = 1;
    this.nextHerdId = 1;
    this.rand = mulberry32(777);
    this._fpInit();
  }

  // Build every species template (call during loading)
  async buildTemplates(onProgress) {
    let i = 0;
    for (const spec of SPECIES_LIST) {
      this.templates[spec.id] = buildTemplate(spec);
      i++;
      onProgress && onProgress(i / SPECIES_LIST.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  template(id) {
    if (!this.templates[id]) this.templates[id] = buildTemplate(SPECIES[id]);
    return this.templates[id];
  }

  // ---------- Population ----------
  populate() {
    const R = this.rand;
    const plan = {
      triceratops: 6, parasaur: 6, galli: 5, iguanodon: 5, stego: 5, brachio: 4, anky: 4, pachy: 4,
      trex: 3, raptor: 4, spino: 2, allo: 3, dilopho: 3, compy: 6, pteranodon: 7, mosa: 3, theriz: 1, quetzal: 1,
    };
    for (const [id, n] of Object.entries(plan)) for (let i = 0; i < n; i++) this.spawnHerd(SPECIES[id], R);
  }

  habitatOk(spec, x, z) {
    const w = this.world;
    const h = w.getHeight(x, z);
    const b = w.getBiome(x, z);
    if (spec.aquatic) return h < -14;
    if (spec.flyer) return spec.biomes.includes(b) || (b === BIOME.BEACH);
    if (h < 0.6 || w.waterLevelAt(x, z) > h + 0.3) return false;
    if (w.getNormal(x, z).y < 0.82) return false;
    return spec.biomes.includes(b) || (spec.biomes.includes(BIOME.RIVER) && b === BIOME.RIVER);
  }

  findHabitat(spec, R, near = null, radius = 600, minDistFromPlayer = 0) {
    const w = this.world;
    for (let t = 0; t < 600; t++) {
      let x, z;
      if (near) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * radius; x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r; }
      else { x = (R() * 2 - 1) * (HALF - 100); z = (R() * 2 - 1) * (HALF - 100); }
      if (!w.inBounds(x, z)) continue;
      if (minDistFromPlayer && this.game.player && Math.hypot(x - this.game.player.pos.x, z - this.game.player.pos.z) < minDistFromPlayer) continue;
      if (this.habitatOk(spec, x, z)) return { x, z };
    }
    return null;
  }

  spawnHerd(spec, R = this.rand, at = null, count = null) {
    const spot = at || this.findHabitat(spec, R, null, 0, 250);
    if (!spot) return null;
    const [a, b] = spec.herd;
    const n = count || Math.round(a + R() * (b - a));
    const h = new Herd(this, spec, spot.x, spot.z, n, R);
    this.herds.push(h);
    return h;
  }

  // ---------- Simulation ----------
  update(dt, ctx) {
    const P = this.game.player.pos;
    this._tick = (this._tick || 0) + 1;
    for (const h of this.herds) {
      h.panicT = Math.max(0, h.panicT - dt);
      h.modeT -= dt;
      const d = Math.hypot(h.x - P.x, h.z - P.z);
      // herd decisions
      if (h.modeT <= 0 || h.retarget) {
        h.retarget = false;
        if (h.migrating) {
          if (Math.hypot(h.target.x - h.x, h.target.z - h.z) < 40) { h.migrating = false; h.mode = 'graze'; h.modeT = 60; }
        } else if (h.mode === 'graze' || h.mode === 'rest') {
          const spot = this.findHabitat(h.spec, this.rand, { x: h.x, z: h.z }, h.spec.flyer ? 350 : 260);
          if (spot) { h.target.set(spot.x, 0, spot.z); h.mode = h.spec.flyer || h.spec.aquatic ? 'graze' : 'move'; }
          h.modeT = 30 + this.rand() * 50;
        } else {
          h.mode = 'graze';
          h.modeT = 40 + this.rand() * 90;
        }
      }
      if (h.spec.flyer || h.spec.aquatic) {
        if (h.modeT <= 0) h.retarget = true;
      }
      if (!h.active) {
        // abstract movement toward the target
        const dx = h.target.x - h.x, dz = h.target.z - h.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 5 && (h.mode === 'move' || h.mode === 'migrate' || h.spec.flyer || h.spec.aquatic)) {
          const sp = h.spec.speed.walk * (h.mode === 'migrate' ? 1.25 : 0.8) * dt;
          h.x += (dx / dist) * Math.min(sp, dist);
          h.z += (dz / dist) * Math.min(sp, dist);
        } else if (h.mode === 'move') { h.mode = 'graze'; h.modeT = 40 + this.rand() * 60; }
        if (d < ACTIVATE) this._activate(h);
      } else {
        // centre follows the alive members
        let cx = 0, cz = 0, n = 0;
        for (const m of h.members) if (m && m.alive) { cx += m.pos.x; cz += m.pos.z; n++; }
        if (n) { h.x = cx / n; h.z = cz / n; }
        if (h.mode === 'move' && Math.hypot(h.target.x - h.x, h.target.z - h.z) < 15) { h.mode = 'graze'; h.modeT = 40 + this.rand() * 60; }
        if (d > DEACTIVATE) this._deactivate(h);
      }
    }
    // Update active dinos
    const cam = this.game.camera.position;
    ctx.frameCheck = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const dn = this.active[i];
      const dc = dn.pos.distanceTo(cam);
      dn.lod = dc < 90 ? 0 : dc < 200 ? 1 : 2;
      dn.mesh.castShadow = dc < 110;
      ctx.frameCheck = (this._tick + dn.id) % 15 === 0;
      dn.update(dt, ctx);
      if (!dn.alive && dn.deadT > 300) this._removeDino(dn);
    }
    this._separate();
    this._fpUpdate(dt);
    // Population upkeep: replace empty herds far from the player
    this._upkeepT = (this._upkeepT || 0) - dt;
    if (this._upkeepT <= 0) {
      this._upkeepT = 30;
      for (let i = this.herds.length - 1; i >= 0; i--) {
        const h = this.herds[i];
        if (h.count <= 0 && !h.active) {
          this.herds.splice(i, 1);
          if (!h.temporary) this.spawnHerd(h.spec, this.rand);
        } else if (!h.active && h.count < h.maxCount && this.rand() < 0.1) h.count++;
        if (h.temporary && !h.active && Math.hypot(h.x - P.x, h.z - P.z) > 900) { this.herds.splice(i, 1); }
      }
    }
  }

  _activate(h) {
    h.active = true;
    h.members = [];
    const tpl = this.template(h.spec.id);
    for (let i = 0; i < h.count; i++) {
      const ang = (i / Math.max(1, h.count)) * Math.PI * 2 + this.rand();
      const r = h.count > 1 ? 4 + h.spec.length * 0.9 * Math.sqrt(i + 1) : 0;
      let x = h.x + Math.cos(ang) * r, z = h.z + Math.sin(ang) * r;
      const morph = h.morphs[i] || null;
      const colors = { ...h.spec.colors };
      const t = h.tint;
      colors.base = colors.base.map((c) => clamp(c * t, 0, 1));
      const mat = makeSkinMaterial(colors, morph, h.spec.length, h.spec.diet === 'carnivore' || h.spec.diet === 'piscivore');
      const d = new Dino(this, h, h.spec, tpl, mat, x, z, morph);
      d.active = true;
      d.heading = Math.atan2(h.target.x - h.x, h.target.z - h.z) + (this.rand() - 0.5);
      this.group.add(d.mesh);
      this.active.push(d);
      h.members.push(d);
    }
  }

  _deactivate(h) {
    let alive = 0;
    for (const m of h.members) {
      if (!m) continue;
      if (m.alive) alive++;
      m.active = false;
      m.dispose();
      const i = this.active.indexOf(m);
      if (i >= 0) this.active.splice(i, 1);
    }
    h.count = alive;
    h.members = [];
    h.active = false;
  }

  _removeDino(dn) {
    dn.active = false;
    dn.dispose();
    const i = this.active.indexOf(dn);
    if (i >= 0) this.active.splice(i, 1);
    const h = dn.herd;
    const j = h.members.indexOf(dn);
    if (j >= 0) { h.members.splice(j, 1); h.morphs.splice(j, 1); }
    h.count = h.members.filter((m) => m.alive).length;
  }

  _separate() {
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.flyer || a.marine || !a.alive) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j];
        if (b.flyer || b.marine || !b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-4) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          const ma = a.length, mb = b.length;
          const ka = mb / (ma + mb), kb = ma / (ma + mb);
          a.pos.x -= (dx / d) * push * ka * 2; a.pos.z -= (dz / d) * push * ka * 2;
          b.pos.x += (dx / d) * push * kb * 2; b.pos.z += (dz / d) * push * kb * 2;
        }
      }
    }
  }

  // ---------- Queries ----------
  nearestPredatorTo(dino, r) {
    let best = null, bd = r * r;
    for (const o of this.active) {
      if (!o.alive || !o.isPredator || o.flyer || o === dino || o.spec.id === 'compy') continue;
      if (o.state === 'sleep' || o.sedatedT > 0) continue;
      const d = (o.pos.x - dino.pos.x) ** 2 + (o.pos.z - dino.pos.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  findPrey(pred, r) {
    let best = null, bs = -Infinity;
    const packSize = pred.spec.temperament === 'pack' ? pred.herd.members.filter((m) => m && m.alive).length : 1;
    const power = pred.length * (1 + (packSize - 1) * 0.6);
    for (const o of this.active) {
      if (!o.alive || o.isPredator || o.flyer || o.marine || o === pred) continue;
      if (o.length > power * 1.1) continue;
      const d = Math.hypot(o.pos.x - pred.pos.x, o.pos.z - pred.pos.z);
      if (d > r) continue;
      const score = -d + (o.health < o.maxHealth ? 30 : 0) - o.length * 2;
      if (score > bs) { bs = score; best = o; }
    }
    // also scavenge carcasses
    const c = this.nearestCarcass(pred, r * 0.6);
    if (c && (!best || Math.hypot(c.pos.x - pred.pos.x, c.pos.z - pred.pos.z) < 40)) return c;
    return best;
  }

  nearestCarcass(dino, r) {
    let best = null, bd = r * r;
    for (const o of this.active) {
      if (o.alive || o === dino) continue;
      const d = (o.pos.x - dino.pos.x) ** 2 + (o.pos.z - dino.pos.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  nearest(pos, r, filter) {
    let best = null, bd = r * r;
    for (const o of this.active) {
      if (filter && !filter(o)) continue;
      const d = (o.pos.x - pos.x) ** 2 + (o.pos.y - pos.y) ** 2 * 0.25 + (o.pos.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  herdsNear(x, z, r) {
    return this.herds.filter((h) => h.count > 0 && Math.hypot(h.x - x, h.z - z) < r);
  }

  scareAround(pos, r, t = 18) {
    for (const d of this.active) {
      if (!d.alive || d.flyer || d.marine) continue;
      if (Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z) < r) d.scare(pos, t);
    }
  }

  // ---------- Events ----------
  spawnRare(id, nearPos, radius = 280, minDist = 160) {
    const spec = SPECIES[id];
    const spot = this.findHabitat(spec, this.rand, nearPos, radius, minDist) || this.findHabitat({ ...spec, biomes: [BIOME.GRASSLAND, BIOME.FOREST, BIOME.JUNGLE, BIOME.DESERT, BIOME.VOLCANIC] }, this.rand, nearPos, radius, minDist);
    if (!spot) return null;
    const h = this.spawnHerd(spec, this.rand, spot, 1);
    if (h) { h.temporary = true; h.rareEvent = true; }
    return h;
  }

  startMigration(id, from, to, count) {
    const spec = SPECIES[id];
    const h = new Herd(this, spec, from.x, from.z, count, this.rand);
    h.mode = 'migrate';
    h.migrating = true;
    h.modeT = 9999;
    h.target.set(to.x, 0, to.z);
    h.temporary = true;
    this.herds.push(h);
    return h;
  }

  // ---------- Footprints / tracks ----------
  _fpInit() {
    const N = 400;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const ctx = c.getContext('2d');
    // theropod print (left) & round print (right)
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 128, 64);
    const g = (x, y, r) => { const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(30,22,14,0.85)'); gr.addColorStop(1, 'rgba(30,22,14,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    g(32, 44, 11);
    for (const [dx, dy] of [[-14, -22], [0, -27], [14, -22]]) { for (let k = 0; k < 4; k++) g(32 + dx * (0.35 + k * 0.2), 44 + dy * (0.35 + k * 0.2), 5.5); }
    g(96, 32, 20);
    for (const dx of [-14, 0, 14]) g(96 + dx, 14, 6);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const uvs = geo.attributes.uv;
    this.fpGeoT = geo;
    const geoR = geo.clone();
    for (let i = 0; i < uvs.count; i++) { uvs.setX(i, uvs.getX(i) * 0.5); }
    const uvr = geoR.attributes.uv;
    for (let i = 0; i < uvr.count; i++) { uvr.setX(i, 0.5 + uvr.getX(i) * 0.5); }
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.fpMeshes = [new THREE.InstancedMesh(geo, mat, N), new THREE.InstancedMesh(geoR, mat, N)];
    for (const m of this.fpMeshes) {
      m.frustumCulled = false;
      m.count = 0;
      this.game.scene.add(m);
    }
    this.footprints = [[], []];
    this.fpIndex = [0, 0];
    this.fpN = N;
  }

  addFootprint(d) {
    if (d.flyer || d.marine || d.length < 1.5) return;
    const P = this.game.player.pos;
    if (Math.abs(d.pos.x - P.x) > 140 || Math.abs(d.pos.z - P.z) > 140) return;
    const w = this.world;
    if (w.waterLevelAt(d.pos.x, d.pos.z) > d.pos.y) return;
    const kind = d.spec.body && d.spec.body.biped ? 0 : 1;
    const side = d.footSide;
    const sx = Math.cos(d.heading) * d.radius * 0.6 * side, sz = -Math.sin(d.heading) * d.radius * 0.6 * side;
    const x = d.pos.x + sx, z = d.pos.z + sz;
    const size = Math.max(0.35, d.length * 0.09 * d.scale);
    const i = this.fpIndex[kind];
    this.fpIndex[kind] = (i + 1) % this.fpN;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, w.getHeight(x, z) + 0.04, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, d.heading + Math.PI, 0)), new THREE.Vector3(size, 1, size * (kind ? 1 : 1.2)));
    const mesh = this.fpMeshes[kind];
    mesh.setMatrixAt(i, m);
    mesh.count = Math.max(mesh.count, i + 1);
    mesh.instanceMatrix.needsUpdate = true;
    this.footprints[kind][i] = { x, z, heading: d.heading, spec: d.spec, herd: d.herd, t: this.game.clock.elapsed };
  }

  // Footfall feedback near the player: dust or splashes, ground thuds and camera shake for giants
  footfall(d) {
    if (d.flyer || d.marine || d.lod > 1) return;
    const g = this.game;
    const P = g.camera.position;
    const dx = d.pos.x - P.x, dz = d.pos.z - P.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 140) return;
    const size = d.length * d.scale;
    const mass = size / 6; // ~0.3 compy .. ~4 brachiosaurus
    const w = this.world;
    const side = d.footSide;
    const fx = d.pos.x + Math.cos(d.heading) * d.radius * 0.6 * side, fz = d.pos.z - Math.sin(d.heading) * d.radius * 0.6 * side;
    const gy = w.getHeight(fx, fz);
    const wl = w.waterLevelAt(fx, fz);
    const pos = this._ffPos || (this._ffPos = new THREE.Vector3());
    pos.set(fx, Math.max(gy, wl), fz);
    const fast = Math.min(1, d.speed / Math.max(1, d.spec.speed.walk * 1.5));
    let surface = 'ground';
    if (wl > gy + 0.05) {
      surface = 'water';
      if (size > 2) g.fx.splash(pos, Math.min(3, 0.4 + mass * 0.6) * (0.6 + fast * 0.6));
      g.water.addRipple(fx, fz, Math.min(2, 0.4 + mass * 0.5));
    } else if (size > 2.5) {
      const b = w.getBiome(fx, fz);
      const tint = {
        [BIOME.DESERT]: [0.72, 0.52, 0.36], [BIOME.CANYON]: [0.66, 0.44, 0.3], [BIOME.BEACH]: [0.8, 0.74, 0.6], [BIOME.ISLAND]: [0.78, 0.72, 0.58],
        [BIOME.VOLCANIC]: [0.3, 0.27, 0.25], [BIOME.SNOW]: [0.92, 0.94, 0.98], [BIOME.MOUNTAIN]: [0.6, 0.58, 0.54], [BIOME.SWAMP]: [0.3, 0.28, 0.2],
        [BIOME.FOREST]: [0.42, 0.34, 0.24], [BIOME.JUNGLE]: [0.38, 0.32, 0.22], [BIOME.PINEFOREST]: [0.45, 0.37, 0.27],
      }[b] || [0.58, 0.5, 0.38];
      if (b === BIOME.FOREST || b === BIOME.JUNGLE || b === BIOME.PINEFOREST) surface = 'leaves';
      const dry = b === BIOME.DESERT || b === BIOME.CANYON || b === BIOME.BEACH || b === BIOME.VOLCANIC || b === BIOME.SNOW ? 1.6 : 1;
      const wet = 1 - g.weather.local.rain * 0.7;
      const k = Math.min(2.2, 0.25 + mass * 0.45) * (0.5 + fast * 0.8) * dry * wet;
      if (k > 0.12) g.fx.dust(pos, k, tint);
    }
    // sub-bass thud and ground shake for the big ones
    if (size > 5 && dist < 110) {
      g.audio.play('footfall', { pos, ref: 4 + mass * 6, mass, surface, vol: Math.min(1, 0.4 + fast * 0.6) });
      if (size > 9) {
        const k = Math.max(0, 1 - dist / (25 + size * 3.5));
        if (k > 0) g.cam.shake(Math.min(0.3, k * k * (size - 8) * 0.04 * (0.6 + fast)));
      }
    }
  }

  _fpUpdate() {}

  nearestTrack(pos, r) {
    let best = null, bd = r * r;
    const now = this.game.clock.elapsed;
    for (const list of this.footprints) for (const f of list) {
      if (!f || now - f.t > 600) continue;
      const d = (f.x - pos.x) ** 2 + (f.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  serialize() {
    return this.herds.filter((h) => !h.temporary && h.count > 0).map((h) => ({ s: h.spec.id, x: Math.round(h.x), z: Math.round(h.z), c: h.count, m: h.morphs.slice(0, h.count) }));
  }
  deserialize(arr) {
    for (const h of this.herds) if (h.active) this._deactivate(h);
    this.herds = [];
    for (const o of arr) {
      const spec = SPECIES[o.s];
      if (!spec) continue;
      const h = new Herd(this, spec, o.x, o.z, o.c, this.rand);
      h.morphs = o.m || h.morphs;
      this.herds.push(h);
    }
  }
}
