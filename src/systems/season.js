// Seasons: summer (lush), autumn (amber canopies, drifting leaves, golden grass) and winter
// (snow over the whole land, bare broadleaf trees, frosted evergreens, flurries and breath fog).
// The look is driven by two global shader uniforms that ease toward the chosen season.
import * as THREE from 'three';
import { U } from '../world/shaderlib.js';

const TARGET = { summer: { a: 0, w: 0 }, autumn: { a: 1, w: 0 }, winter: { a: 0, w: 1 } };
const NAMES = { summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

export class Seasons {
  constructor(game) {
    this.game = game;
    this.current = TARGET[game.settings.season] ? game.settings.season : 'summer';
    const t = TARGET[this.current];
    U.uAutumn.value = t.a;
    U.uWinter.value = t.w;
    this._breathT = 0;
  }

  get winter() { return U.uWinter.value; }
  get autumn() { return U.uAutumn.value; }

  set(id) {
    if (!TARGET[id] || id === this.current) return;
    const g = this.game;
    this.current = id;
    g.settings.season = id;
    try { g.applySettings(); } catch (e) { /* settings persistence is best-effort */ }
    g.ui.notify(`${id === 'winter' ? '❄️' : id === 'autumn' ? '🍂' : '☀️'} ${NAMES[id]} has arrived.`, 'info', 3);
    if (g.ambient) g.ambient.onSeason(id);
  }

  update(dt) {
    const g = this.game;
    const t = TARGET[this.current];
    // the land changes over a few seconds rather than snapping
    const k = 1 - Math.exp(-dt * 0.9);
    U.uAutumn.value += (t.a - U.uAutumn.value) * k;
    U.uWinter.value += (t.w - U.uWinter.value) * k;
    if (Math.abs(U.uAutumn.value - t.a) < 0.002) U.uAutumn.value = t.a;
    if (Math.abs(U.uWinter.value - t.w) < 0.002) U.uWinter.value = t.w;
    // breath fogging in the cold
    const p = g.player;
    if (U.uWinter.value > 0.5 && p && p.alive && !g.caves.active && !p.swimming && g.cam.mode === 'third') {
      this._breathT -= dt;
      if (this._breathT <= 0) {
        this._breathT = p.sprinting ? 0.9 : 2.2;
        const fx = Math.sin(p.yaw || 0), fz = Math.cos(p.yaw || 0);
        const pos = new THREE.Vector3(p.pos.x + fx * 0.32, p.pos.y + (p.crouch ? 1.15 : 1.7), p.pos.z + fz * 0.32);
        g.fx._p(g.fx.alpha, { x: pos.x, y: pos.y, z: pos.z, vx: fx * 0.5, vy: 0.15, vz: fz * 0.5, life: 1.4, r: 0.9, g: 0.92, b: 0.95, a: 0.22, s0: 0.12, s1: 0.7, drag: 1.5 });
      }
    }
  }
}
