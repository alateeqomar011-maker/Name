// Base building: placement with a ghost preview, upgrades, stations, defenses, farms, towers and beacons.
import * as THREE from 'three';
import { STRUCTURES } from './data.js';
import { buildStructure } from '../world/props.js';

const GOOD = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.35, depthWrite: false });
const BAD = new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0.35, depthWrite: false });

export class Building {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    this.group.name = 'structures';
    game.scene.add(this.group);
    this.active = false;
    this.types = Object.keys(STRUCTURES);
    this.sel = 0;
    this.rot = 0;
    this.ghost = null;
    this.ghostType = null;
    this.valid = false;
    this.target = new THREE.Vector3();
    this.nextId = 1;
    this.lastShelter = null;
  }

  get maxStructures() {
    let tier = 0;
    for (const s of this.list) if (s.type === 'tent') tier = Math.max(tier, s.tier);
    return [12, 30, 55, 90][tier];
  }
  count(type) { return this.list.filter((s) => s.type === type).length; }

  toggle() {
    const g = this.game;
    if (g.caves.active || g.player.inVehicle) { g.ui.notify('You can’t build here.', 'warn'); return; }
    this.active = !this.active;
    if (!this.active) this._clearGhost();
    g.ui.buildBar(this.active);
    if (this.active) g.ui.notify('Build mode: mouse wheel / [ ] to choose, R to rotate, left-click to place, B to exit.', 'info', 4);
  }

  select(i) { this.sel = (i + this.types.length) % this.types.length; this._clearGhost(); this.game.ui.buildBar(true); this.game.audio.play('ui'); }

  _clearGhost() { if (this.ghost) { this.ghost.removeFromParent(); this.ghost = null; this.ghostType = null; } }

  _raycastGround() {
    const g = this.game;
    const cam = g.camera;
    const dir = g.cam.forward(new THREE.Vector3());
    const p = cam.position.clone();
    for (let t = 0; t < 26; t += 0.25) {
      p.copy(cam.position).addScaledVector(dir, t);
      const h = g.world.getHeight(p.x, p.z);
      if (p.y <= h) return new THREE.Vector3(p.x, h, p.z);
    }
    // fallback: in front of the player
    const P = g.player.pos;
    const x = P.x + Math.sin(g.cam.yaw) * 6, z = P.z + Math.cos(g.cam.yaw) * 6;
    return new THREE.Vector3(x, g.world.getHeight(x, z), z);
  }

  check(type, x, z, tierCheck = true) {
    const g = this.game;
    const def = STRUCTURES[type];
    const w = g.world;
    if (g.progress.level < def.level) return `Requires level ${def.level}`;
    if (this.list.length >= this.maxStructures) return `Base limit reached (${this.maxStructures}). Upgrade your shelter to build more.`;
    const n = w.getNormal(x, z);
    if (n.y < (def.wall || type === 'torch' || type === 'flag' ? 0.75 : 0.86)) return 'Ground too steep';
    if (w.waterLevelAt(x, z) > w.getHeight(x, z) - 0.2) return 'Can’t build in water';
    for (const s of this.list) {
      const d = Math.hypot(s.x - x, s.z - z);
      const min = (STRUCTURES[s.type].r + def.r) * (def.wall && STRUCTURES[s.type].wall ? 0.45 : 0.9);
      if (d < min) return 'Too close to another structure';
    }
    for (const p of g.pois.list) {
      if (p.type === 'crate' || p.type === 'treasure') continue;
      if (Math.hypot(p.x - x, p.z - z) < (p.type === 'camp' ? 26 : 14)) return 'Too close to a landmark';
    }
    if (tierCheck && !g.inventory.affordable(def.cost)) return 'Missing materials';
    return null;
  }

  update(dt, input) {
    const g = this.game;
    // structure animations, fires, farms
    const t = performance.now() * 0.001;
    for (const s of this.list) {
      const U = s.group.userData;
      const d = Math.hypot(s.x - g.player.pos.x, s.z - g.player.pos.z);
      if (U.fire && d < 120) {
        if (Math.random() < dt * (U.small ? 10 : 25)) g.fx.fire(s.group.localToWorld(U.fire.clone()), U.small ? 0.4 : 0.9);
        if (Math.random() < dt * (U.smoke ? 6 : 2)) g.fx.smoke(s.group.localToWorld(U.fire.clone()).add(new THREE.Vector3(0, 0.8, 0)), U.small ? 0.3 : 0.6, 0.35, 1.6);
      }
      if (U.cloth) { const pos = U.cloth.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + 0.6; pos.setZ(i, Math.sin(t * 4 + x * 3) * 0.12 * x); } pos.needsUpdate = true; }
      if (U.spin) U.spin.rotation.y += dt;
      if (s.type === 'farm') {
        s.growth = Math.min(1, (s.growth || 0) + dt / 420);
        for (const c of U.crops.children) if (c.userData.berry) c.visible = s.growth >= 1;
      }
    }
    if (!this.active) return;
    // wheel / brackets select
    if (input.mouse.wheel) this.select(this.sel + input.mouse.wheel);
    if (input.hit('BracketRight')) this.select(this.sel + 1);
    if (input.hit('BracketLeft')) this.select(this.sel - 1);
    if (input.hit('KeyR')) this.rot += Math.PI / 4;
    const type = this.types[this.sel];
    if (this.ghostType !== type) {
      this._clearGhost();
      this.ghost = buildStructure(type, 1);
      this.ghost.traverse((o) => { if (o.isMesh) { o.material = GOOD; o.castShadow = false; } });
      this.ghostType = type;
      g.scene.add(this.ghost);
    }
    const p = this._raycastGround();
    if (STRUCTURES[type].wall && !input.down('ShiftLeft')) { p.x = Math.round(p.x / 2) * 2; p.z = Math.round(p.z / 2) * 2; p.y = g.world.getHeight(p.x, p.z); }
    this.target.copy(p);
    const err = this.check(type, p.x, p.z);
    this.valid = !err;
    this.error = err;
    this.ghost.position.copy(p);
    this.ghost.rotation.y = this.rot;
    const mat = this.valid ? GOOD : BAD;
    this.ghost.traverse((o) => { if (o.isMesh) o.material = mat; });
    if (input.mouse.leftPressed) {
      if (!this.valid) { g.ui.notify(err, 'warn'); g.audio.play('error'); }
      else this.place(type, p.x, p.z, this.rot, 1, true);
    }
  }

  place(type, x, z, rot, tier = 1, pay = false) {
    const g = this.game;
    const def = STRUCTURES[type];
    if (pay) g.inventory.consume(def.cost);
    const s = { id: this.nextId++, type, tier, x, z, rot, y: g.world.getHeight(x, z), growth: 0 };
    this._spawn(s);
    this.list.push(s);
    g.veg.addExclusion(x, z, def.r + 0.8);
    if (pay) {
      g.audio.play('build', { pos: new THREE.Vector3(x, s.y, z) });
      g.fx.dust(new THREE.Vector3(x, s.y, z), 1.5);
      g.progress.addXP(10 + def.level * 4, 'Building');
      g.progress.stats.built++;
      g.emit('built', { type, tier });
      if (def.shelter) { this.lastShelter = s; g.ui.notify('Shelter built — this is now your respawn point.', 'good'); }
    }
    return s;
  }

  _spawn(s) {
    const g = this.game;
    if (s.group) { s.group.removeFromParent(); for (const L of s.lights || []) g.fx.removeLight(L); }
    const grp = buildStructure(s.type, s.tier);
    grp.position.set(s.x, s.y - 0.05, s.z);
    grp.rotation.y = s.rot;
    this.group.add(grp);
    grp.updateMatrixWorld(true);
    s.group = grp;
    s.lights = (grp.userData.lights || []).map((L) => g.fx.addLight({ pos: grp.localToWorld(L.pos.clone()), color: L.color, intensity: L.intensity, dist: L.dist, flicker: L.flicker }));
    const def = STRUCTURES[s.type];
    s.colliders = [];
    if (def.wall) {
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      for (const o of [-1.5, -0.5, 0.5, 1.5]) s.colliders.push({ x: s.x + o * c, z: s.z - o * sn, r: 0.55, top: s.y + 3.5 });
    } else if (!['flag', 'torch', 'lamp', 'farm', 'hide', 'campfire'].includes(s.type)) {
      s.colliders.push({ x: s.x, z: s.z, r: def.r * (s.type === 'tower' ? 0.9 : 0.75), top: s.y + (s.type === 'tower' ? 2 : 4) });
    }
    if (s.type === 'tower') s.deck = s.y + grp.userData.deck;
  }

  upgrade(s) {
    const g = this.game;
    const def = STRUCTURES[s.type];
    if (!def.tiers || s.tier >= def.tiers.length) return;
    const next = def.tiers[s.tier];
    if (next.level && g.progress.level < next.level) { g.ui.notify(`Requires level ${next.level}`, 'warn'); return; }
    if (!g.inventory.affordable(next.cost)) { g.ui.notify('Missing materials for the upgrade.', 'warn'); g.audio.play('error'); return; }
    g.inventory.consume(next.cost);
    s.tier++;
    this._spawn(s);
    g.audio.play('build');
    g.fx.dust(new THREE.Vector3(s.x, s.y, s.z), 2);
    g.progress.addXP(40 * s.tier, 'Upgrade');
    g.ui.notify(`Upgraded to ${next.name}!`, 'good');
    g.emit('upgraded', { type: s.type, tier: s.tier });
  }

  demolish(s) {
    const g = this.game;
    const def = STRUCTURES[s.type];
    for (const [k, n] of Object.entries(def.cost)) g.inventory.add(k, Math.floor(n * 0.5), true);
    s.group.removeFromParent();
    for (const L of s.lights || []) g.fx.removeLight(L);
    this.list.splice(this.list.indexOf(s), 1);
    g.ui.notify(`${def.name} dismantled (50% refunded).`, 'info');
  }

  nearest(maxD = 6) {
    const P = this.game.player.pos;
    let best = null, bd = maxD;
    for (const s of this.list) {
      const d = Math.hypot(s.x - P.x, s.z - P.z) - STRUCTURES[s.type].r * 0.6;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  interactables(P) {
    const g = this.game;
    const out = [];
    const s = this.nearest(4.5);
    if (!s) return out;
    const def = STRUCTURES[s.type];
    const d = Math.hypot(s.x - P.x, s.z - P.z);
    const name = def.tiers ? def.tiers[s.tier - 1].name : def.name;
    switch (s.type) {
      case 'tent': out.push({ d, label: `Sleep in ${name}`, act: () => { this.lastShelter = s; g.sleep(); } }); break;
      case 'storage': out.push({ d, label: 'Open storage', act: () => g.ui.openMenu('inventory') }); break;
      case 'workbench': case 'forge': case 'garage': case 'campfire': out.push({ d, label: `Use ${name} (crafting)`, act: () => g.ui.openMenu('inventory') }); break;
      case 'research': out.push({ d, label: g.inventory.has('sample') ? 'Analyse research samples' : 'Research Station (crafting)', act: () => (g.inventory.has('sample') ? this.analyse() : g.ui.openMenu('inventory')) }); break;
      case 'farm': out.push({ d, label: s.growth >= 1 ? 'Harvest berries' : `Berries growing (${Math.floor((s.growth || 0) * 100)}%)`, act: () => this.harvestFarm(s), disabled: s.growth < 1 }); break;
      case 'tower': out.push({ d, label: 'Climb the tower', act: () => this.climb(s) }); break;
      case 'beacon': out.push({ d, label: 'Fast travel (open map)', act: () => g.ui.openMenu('map') }); break;
      case 'trophy': out.push({ d, label: 'Admire fossil display', act: () => g.ui.notify('A fine specimen. Visitors would be impressed.', 'info') }); break;
      default: out.push({ d, label: name, act: () => {} , disabled: true });
    }
    out[0].structure = s;
    return out;
  }

  analyse() {
    const g = this.game;
    const n = g.inventory.count('sample');
    if (!n) return;
    g.inventory.remove('sample', n);
    g.progress.addXP(120 * n, 'Research');
    g.progress.stats.samples += n;
    g.audio.play('discover');
    const pool = ['jeep', 'boat', 'glider', 'gyro'].filter((u) => !g.inventory.unlocked.has(u));
    if (pool.length && Math.random() < 0.25 * n) {
      const u = pool[0];
      g.inventory.unlocked.add(u);
      g.ui.notify(`📐 Research breakthrough! Blueprint unlocked: ${u}`, 'gold');
    } else g.ui.notify(`Analysed ${n} sample${n > 1 ? 's' : ''}. Genome data added to the journal.`, 'good');
    g.emit('samples-analysed', { n });
  }

  harvestFarm(s) {
    if (s.growth < 1) return;
    s.growth = 0;
    this.game.inventory.add('berries', 6 + this.game.progress.skill('gathering'));
    this.game.audio.play('rustle');
  }

  climb(s) {
    const g = this.game;
    g.player.pos.set(s.x + 0.5, s.deck + 0.1, s.z + 0.5);
    g.player.vel.set(0, 0, 0);
    g.journal.revealAround(s.x, s.z, s.tier >= 2 ? 750 : 450);
    g.ui.notify('A breathtaking view. The surrounding area is revealed on your map.', 'good');
    g.emit('tower-climbed');
  }

  // Walkable platform heights (tower decks)
  platformAt(x, z, y) {
    let h = -Infinity;
    for (const s of this.list) {
      if (s.type !== 'tower') continue;
      if (Math.abs(x - s.x) < 2.0 && Math.abs(z - s.z) < 2.0 && y > s.deck - 1.0) h = Math.max(h, s.deck);
    }
    return h;
  }

  collide(pos, r, y) {
    for (const s of this.list) {
      if (Math.abs(s.x - pos.x) > 12 || Math.abs(s.z - pos.z) > 12) continue;
      for (const c of s.colliders) {
        if (y !== null && y > c.top) continue;
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const rr = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = c.x + (dx / d) * rr; pos.z = c.z + (dz / d) * rr; pos.hit = true; }
      }
    }
    return pos;
  }

  repelAt(x, z) {
    let r = 0;
    for (const s of this.list) {
      const rep = STRUCTURES[s.type].repel;
      if (!rep) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < 28) r += rep * (s.tier || 1) * (1 - d / 28) * 1.6;
    }
    return Math.min(1, r);
  }
  nearStation(type) {
    const P = this.game.player.pos;
    if (this.game.pois.nearestStationCamp(type)) return true;
    return this.list.some((s) => s.type === type && Math.hypot(s.x - P.x, s.z - P.z) < 9);
  }
  inBase(x, z) { return this.list.some((s) => s.type === 'tent' && Math.hypot(s.x - x, s.z - z) < 18) && this.repelAt(x, z) > 0.4; }
  inBlind(x, z) { return this.list.some((s) => s.type === 'hide' && Math.hypot(s.x - x, s.z - z) < 1.8); }
  shelterNear(x, z, r) { return this.list.some((s) => s.type === 'tent' && Math.hypot(s.x - x, s.z - z) < r); }
  respawnPoint() {
    const s = this.lastShelter && this.list.includes(this.lastShelter) ? this.lastShelter : this.list.find((q) => q.type === 'tent');
    if (s) return { x: s.x + 3, z: s.z + 3 };
    const c = this.game.pois.camp;
    return { x: c.x + 4, z: c.z + 4 };
  }
  fastTravelPoints() {
    const g = this.game;
    const pts = [{ name: 'Base Camp Echo', x: g.pois.camp.x + 3, z: g.pois.camp.z + 3 }];
    for (const s of this.list) if (s.type === 'beacon') pts.push({ name: 'Signal Beacon', x: s.x + 2, z: s.z + 2 });
    for (const s of this.list) if (s.type === 'tent') pts.push({ name: STRUCTURES.tent.tiers[s.tier - 1].name, x: s.x + 3, z: s.z + 3 });
    for (const p of g.pois.list) if (p.type === 'outpost' && p.state.restored) pts.push({ name: p.name, x: p.x + 5, z: p.z + 5 });
    return pts;
  }

  serialize() {
    return { list: this.list.map((s) => ({ t: s.type, tier: s.tier, x: s.x, z: s.z, r: s.rot, g: s.growth })), last: this.lastShelter ? this.list.indexOf(this.lastShelter) : -1 };
  }
  deserialize(o) {
    for (const s of this.list) { s.group.removeFromParent(); for (const L of s.lights || []) this.game.fx.removeLight(L); }
    this.list = [];
    for (const d of o.list || []) {
      const s = this.place(d.t, d.x, d.z, d.r, d.tier, false);
      s.growth = d.g || 0;
    }
    this.lastShelter = o.last >= 0 ? this.list[o.last] : null;
  }
}
