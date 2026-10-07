// Field journal: species discoveries, behaviours observed, region discovery, map fog-of-war, photo album and lore.
import * as THREE from 'three';
import { SPECIES, SPECIES_LIST } from '../dinos/species.js';
import { HALF, WORLD_SIZE, REGIONS, ISLANDS } from '../world/worldgen.js';

const FOG_N = 256;
const _v = new THREE.Vector3();

export class Journal {
  constructor(game) {
    this.game = game;
    this.species = {};
    for (const s of SPECIES_LIST) this.species[s.id] = { seen: false, photos: 0, best: 0, sampled: 0, behaviors: [], morphs: [] };
    this.regions = new Set();
    this.lore = [];
    this.photos = [];
    this.fog = new Uint8Array(FOG_N * FOG_N);
    this.revealed = 0;
    this.waypoint = null;
    this.fogDirty = true;
    this._t = 0;
    this.lastRegion = null;
  }

  get speciesCount() { return Object.values(this.species).filter((s) => s.seen).length; }
  get mapPercent() { return (this.revealed / (FOG_N * FOG_N)) * 100; }

  revealAround(x, z, r) {
    const cell = WORLD_SIZE / FOG_N;
    const cx = Math.floor((x + HALF) / cell), cz = Math.floor((z + HALF) / cell);
    const rc = Math.ceil(r / cell);
    let changed = false;
    for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
      if (i * i + j * j > rc * rc) continue;
      const X = cx + i, Z = cz + j;
      if (X < 0 || Z < 0 || X >= FOG_N || Z >= FOG_N) continue;
      const k = Z * FOG_N + X;
      if (!this.fog[k]) { this.fog[k] = 1; this.revealed++; changed = true; }
    }
    if (changed) this.fogDirty = true;
  }
  isRevealed(x, z) {
    const cell = WORLD_SIZE / FOG_N;
    const X = Math.floor((x + HALF) / cell), Z = Math.floor((z + HALF) / cell);
    if (X < 0 || Z < 0 || X >= FOG_N || Z >= FOG_N) return false;
    return !!this.fog[Z * FOG_N + X];
  }

  spot(dino) {
    const g = this.game;
    const e = this.species[dino.spec.id];
    const beh = dino.behavior;
    if (!e.behaviors.includes(beh)) e.behaviors.push(beh);
    if (dino.morph && !e.morphs.includes(dino.morph)) {
      e.morphs.push(dino.morph);
      g.ui.notify(`Incredible! A rare ${dino.morph} ${dino.spec.short}!`, 'gold');
      g.progress.addXP(400, 'Rare morph');
    }
    if (e.seen) return;
    e.seen = true;
    g.audio.play('discover');
    g.ui.banner(dino.spec.short.toUpperCase(), `New species discovered — ${dino.spec.name}`);
    g.progress.addXP(dino.spec.xp, 'New species');
    g.emit('species-discovered', { id: dino.spec.id, dino });
  }

  addLore(id, title, text) {
    if (this.lore.some((l) => l.id === id)) return;
    this.lore.push({ id, title, text, day: this.game.clock.day });
  }

  addPhoto(p) {
    this.photos.unshift(p);
    if (this.photos.length > 36) this.photos.length = 36;
  }

  update(dt) {
    const g = this.game;
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.25;
    const P = g.player.inVehicle ? g.player.inVehicle.pos : g.player.pos;
    if (!g.caves.active) {
      // reveal map: further from high ground
      const ground = g.world.getHeight(P.x, P.z);
      const alt = Math.max(0, P.y - Math.max(ground, 0)) + Math.max(0, ground - 40) * 0.6;
      this.revealAround(P.x, P.z, 110 + Math.min(500, alt * 1.2));
      if (g.cam.binoculars) {
        const f = g.cam.forward(_v);
        for (let d = 100; d <= 600; d += 100) this.revealAround(P.x + f.x * d, P.z + f.z * d, 60);
      }
      // regions
      const reg = g.world.regionAt(P.x, P.z);
      if (reg && reg.id !== this.lastRegion) {
        this.lastRegion = reg.id;
        g.ui.regionLabel(reg.name);
        if (!this.regions.has(reg.id)) {
          this.regions.add(reg.id);
          g.ui.banner(reg.name.toUpperCase(), reg.island ? 'Island discovered' : 'New region discovered');
          g.progress.addXP(reg.island ? 200 : 100, 'Exploration');
          g.emit('region-discovered', { id: reg.id, island: !!reg.island });
        }
      }
    }
    // spot nearby dinosaurs that are in view
    const cam = g.camera;
    const fwd = g.cam.forward(_v);
    const range = g.cam.binoculars ? 380 : g.player.photoMode ? 300 : 70;
    for (const d of g.dinos.active) {
      if (!d.alive && this.species[d.spec.id].seen) continue;
      const dx = d.pos.x - cam.position.x, dy = d.pos.y + d.hip - cam.position.y, dz = d.pos.z - cam.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > range + d.length) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / (dist || 1);
      if (dot < 0.6 && dist > 20) continue;
      if (d.marine && d.pos.y < -2 && !g.cam.underwater && d.state !== 'breach') continue;
      this.spot(d);
    }
  }

  serialize() {
    let fog = '';
    // run-length encode the fog
    let run = 0, val = 0;
    const parts = [];
    for (let i = 0; i < this.fog.length; i++) {
      if (this.fog[i] === val) run++;
      else { parts.push(run); val = this.fog[i]; run = 1; }
    }
    parts.push(run);
    fog = parts.join(',');
    return { species: this.species, regions: [...this.regions], lore: this.lore, photos: this.photos.slice(0, 24), fog, waypoint: this.waypoint };
  }
  deserialize(o) {
    for (const [k, v] of Object.entries(o.species || {})) if (this.species[k]) Object.assign(this.species[k], v);
    this.regions = new Set(o.regions || []);
    this.lore = o.lore || [];
    this.photos = o.photos || [];
    this.waypoint = o.waypoint || null;
    if (o.fog) {
      const parts = o.fog.split(',').map(Number);
      let i = 0, val = 0;
      this.revealed = 0;
      for (const run of parts) { for (let k = 0; k < run && i < this.fog.length; k++) { this.fog[i++] = val; if (val) this.revealed++; } val = val ? 0 : 1; }
      this.fogDirty = true;
    }
  }
}

export { FOG_N };
