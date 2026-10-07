// Dinosaur camera: zoomable viewfinder, shot evaluation (framing, rarity, behaviour, lighting) and the photo album.
import * as THREE from 'three';
import { BEHAVIORS } from '../dinos/species.js';
import { clamp } from '../core/noise.js';

const RARE_BEHAVIOR = { hunt: 2, attack: 2.2, eat: 1.8, fight: 2.2, roar: 1.7, fish: 1.8, breach: 3, sleep: 1.4, drink: 1.4, call: 1.5, migrate: 1.6, fly: 1.2, flee: 1.3, defend: 1.8, alert: 1.1, swim: 1.5, dead: 1.1 };
const _v = new THREE.Vector3();

export class PhotoMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.zoom = 1;
    this.cooldown = 0;
  }

  get maxZoom() { return this.game.inventory.gear.has('telephoto') ? 8 : 3; }

  toggle() {
    const g = this.game;
    if (g.player.inVehicle && g.player.inVehicle.type !== 'boat') { g.ui.notify('Can’t take photos while driving.', 'warn'); return; }
    this.active = !this.active;
    g.player.photoMode = this.active;
    this.zoom = 1;
    g.cam.zoomFov = this.active ? g.cam.baseFov : null;
    g.ui.viewfinder(this.active);
    g.audio.play('zoom');
  }

  update(dt, input) {
    if (!this.active) return;
    const g = this.game;
    this.cooldown -= dt;
    if (input.mouse.wheel) {
      this.zoom = clamp(this.zoom * (input.mouse.wheel < 0 ? 1.25 : 0.8), 1, this.maxZoom);
      g.audio.play('zoom');
    }
    if (input.mouse.right && this.zoom < 2) this.zoom = Math.min(this.maxZoom, 2);
    g.cam.zoomFov = g.cam.baseFov / this.zoom;
    // live subject readout
    const best = this.evaluate(true);
    g.ui.viewfinderInfo(this.zoom, best);
    if (input.mouse.leftPressed && this.cooldown <= 0) this.shoot();
  }

  // Score all visible subjects
  evaluate(preview = false) {
    const g = this.game;
    const cam = g.camera;
    cam.updateMatrixWorld();
    const subjects = [];
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const d of g.dinos.active) {
      const c = _v.set(d.pos.x, d.pos.y + d.hip * 0.9, d.pos.z);
      const dist = c.distanceTo(cam.position);
      if (dist > 450) continue;
      if (!frustum.containsPoint(c)) continue;
      if (!this._visible(cam.position, c)) continue;
      if (d.marine && d.pos.y < -1.5 && !g.cam.underwater) continue;
      const ndc = c.clone().project(cam);
      const center = Math.hypot(ndc.x, ndc.y);
      // projected size
      const size = (d.length * 0.6) / (dist * Math.tan((cam.fov * Math.PI) / 360));
      subjects.push({ d, dist, center, size, behavior: d.behavior });
    }
    if (!subjects.length) return null;
    // primary = largest well-centred subject
    for (const s of subjects) s.frame = clamp(1 - Math.abs(s.size - 0.45) * 1.4, 0.1, 1) * clamp(1.15 - s.center * 0.8, 0.2, 1);
    subjects.sort((a, b) => b.frame - a.frame);
    const p = subjects[0];
    const spec = p.d.spec;
    const sameSpecies = subjects.filter((s) => s.d.spec.id === spec.id).length;
    let score = 0;
    score += p.frame * 2.2;
    score += spec.rarity * 0.45;
    score += (RARE_BEHAVIOR[p.behavior] || 1) - 1;
    if (p.d.morph) score += 2;
    if (sameSpecies >= 3) score += 0.6;
    if (subjects.some((s) => s.d.spec.id !== spec.id)) score += 0.4;
    const hour = g.clock.hour;
    if ((hour > 5.5 && hour < 8) || (hour > 17 && hour < 19.5)) score += 0.5; // golden hour
    if (g.weather.local.lightning > 0.1 || g.weather.local.rain > 0.6) score += 0.3;
    score *= 1 + 0.06 * g.progress.skill('photography');
    if (g.inventory.gear.has('telephoto') && p.dist > 60) score += 0.3;
    const stars = clamp(Math.round(score), 1, 5);
    return { primary: p, subjects, stars, species: spec, behavior: p.behavior };
  }

  _visible(from, to) {
    const w = this.game.world;
    if (this.game.caves.active) return true;
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t, z = from.z + (to.z - from.z) * t;
      if (w.getHeight(x, z) > y + 0.5) return false;
    }
    return true;
  }

  shoot() {
    const g = this.game;
    this.cooldown = 0.8;
    g.audio.play('shutter');
    g.ui.shutterFlash();
    const res = this.evaluate();
    const P = g.player.pos;
    // Landscape shots of landmarks
    let landmark = null;
    if (!res) {
      const fwd = g.cam.forward(_v.clone());
      for (const p of g.pois.list) {
        if (!p.discovered || !['waterfall', 'ruin', 'peak', 'nest', 'cave', 'outpost'].includes(p.type)) continue;
        const dx = p.x - P.x, dz = p.z - P.z;
        const d = Math.hypot(dx, dz);
        if (d > 400 || d < 5) continue;
        if ((dx * fwd.x + dz * fwd.z) / d > 0.9) { landmark = p; break; }
      }
    }
    g.requestCapture((dataUrl) => {
      const photo = { img: dataUrl, day: g.clock.day, time: g.clock.label, stars: res ? res.stars : landmark ? 2 : 1 };
      if (res) {
        const spec = res.species;
        const beh = BEHAVIORS[res.behavior] || res.behavior;
        photo.title = `${res.primary.d.morph ? res.primary.d.morph[0].toUpperCase() + res.primary.d.morph.slice(1) + ' ' : ''}${spec.short} — ${beh}`;
        photo.species = spec.id;
        const e = g.journal.species[spec.id];
        const first = e.photos === 0;
        e.photos++;
        e.best = Math.max(e.best, res.stars);
        g.journal.spot(res.primary.d);
        const xp = (10 + spec.rarity * 12) * res.stars * (first ? 2 : 0.5) * (1 + 0.15 * g.progress.skill('photography'));
        g.progress.addXP(xp, first ? 'First photo!' : 'Photo');
        g.ui.photoResult(photo, res);
        g.emit('photo', { species: spec.id, stars: res.stars, behavior: res.behavior, morph: res.primary.d.morph, count: res.subjects.length, flying: res.primary.d.flyer });
      } else if (landmark) {
        photo.title = landmark.name;
        g.progress.addXP(25, 'Landscape photo');
        g.ui.photoResult(photo, null);
        g.emit('photo', { landmark: landmark.id, type: landmark.type, stars: 2 });
      } else {
        photo.title = 'Landscape';
        g.ui.photoResult(photo, null);
        g.emit('photo', { stars: 1 });
      }
      g.progress.stats.photos++;
      g.journal.addPhoto(photo);
    });
  }
}
