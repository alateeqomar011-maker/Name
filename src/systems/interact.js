// Context interaction (E): gathering resources, drinking, reading tracks, harvesting carcasses,
// sampling sedated dinosaurs, POIs and structures. Also hotbar item use (bandages, food, flares, darts).
import * as THREE from 'three';
import { ITEMS } from './data.js';
import { SPECIES } from '../dinos/species.js';

const CONIFERS = new Set(['conifer', 'conifer2', 'araucaria', 'cypress']);
const _v = new THREE.Vector3();

export class Interaction {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.hold = 0;
    this.holdTarget = null;
    this.flares = [];
    this.darts = [];
    this._t = 0;
    const g = game;
    // escape detection for missions
    this.huntedBy = new Set();
  }

  _gatherTime(it) {
    const inv = this.game.inventory;
    const gs = 1 - 0.08 * this.game.progress.skill('gathering');
    if (it.kind === 'tree') return [4.2, 2.2, 1.3, 0.75][inv.toolTier('axe')] * Math.min(1.6, 0.6 + it.scale * 0.5) * gs;
    if (it.kind === 'rock') return [3.0, 1.6, 1.0, 0.6][inv.toolTier('pick')] * gs;
    if (it.kind === 'ore') return [99, 2.4, 1.4, 0.8][inv.toolTier('pick')] * gs;
    return 0.8 * gs;
  }

  _candidates() {
    const g = this.game;
    const P = g.player.pos;
    const out = [];
    if (!g.player.alive || g.player.inVehicle) {
      const v = g.player.inVehicle;
      if (v) out.push({ d: 0, label: `Exit ${v.type === 'jeep' ? 'jeep' : v.type === 'boat' ? 'boat' : 'gyrocopter'}`, key: 'F', act: () => g.vehicles.exit() });
      return out;
    }
    if (g.caves.active) return g.caves.interactables(P);
    out.push(...g.pois.interactables(P));
    out.push(...g.build.interactables(P));
    // vehicles
    const v = g.vehicles.nearest(5);
    if (v) out.push({ d: Math.hypot(v.pos.x - P.x, v.pos.z - P.z), label: `Enter ${v.type === 'jeep' ? 'Off-Road Jeep' : v.type === 'boat' ? 'Motor Boat' : 'Gyrocopter'}${v.type !== 'boat' ? ` (fuel ${Math.round(v.fuel)}%)` : ''}`, key: 'F', act: () => g.vehicles.enter(v) });
    // dinosaurs: carcasses & sedated
    const d = g.dinos.nearest(P, 9, (o) => !o.alive || o.sedatedT > 0);
    if (d) {
      const dist = Math.max(0, Math.hypot(d.pos.x - P.x, d.pos.z - P.z) - d.radius);
      if (dist < 3.5) {
        if (!d.alive) {
          if (!d.harvested.meat) out.push({ d: dist, label: `Harvest ${d.spec.short} carcass`, hold: 2.5, act: () => this._harvestCarcass(d) });
          else if (!d.harvested.sample) out.push({ d: dist, label: `Take tissue sample (${d.spec.short})`, hold: 1.5, act: () => this._sample(d) });
        } else if (!d.harvested.sample) out.push({ d: dist, label: `Take research sample (${d.spec.short})`, hold: 2, act: () => this._sample(d) });
      }
    }
    // tracks
    const fp = g.dinos.nearestTrack(P, 2.5 + g.progress.skill('tracking') * 0.5);
    if (fp && !fp.read) out.push({ d: 2.4, label: 'Inspect tracks', act: () => this._readTrack(fp) });
    // water
    const wl = g.world.waterLevelAt(P.x, P.z);
    const fwd = g.cam.forward(_v);
    const ax = P.x + fwd.x * 1.6, az = P.z + fwd.z * 1.6;
    const nearWater = wl > g.world.getHeight(P.x, P.z) - 0.05 || g.world.waterLevelAt(ax, az) > g.world.getHeight(ax, az);
    if (nearWater && !g.player.swimming && g.player.thirst < 98) {
      const fresh = !!(g.world.riverAt(P.x, P.z) || g.world.riverAt(ax, az)) || g.world.getBiome(P.x, P.z) === 10;
      out.push({ d: 1.5, label: fresh ? 'Drink fresh water' : 'Drink seawater (brackish)', act: () => this._drink(!fresh) });
    }
    // resources
    const it = g.veg.nearestResource(P.x + fwd.x * 0.8, P.z + fwd.z * 0.8, 2.6);
    if (it) {
      const names = { wood: 'Chop tree', stone: 'Mine rock', ore: 'Mine ore', fiber: 'Gather fiber', berries: 'Pick berries' };
      const label = names[it.resource] + (it.resource === 'ore' && !g.inventory.toolTier('pick') ? ' (needs pickaxe)' : '');
      out.push({ d: Math.max(0.5, Math.hypot(it.x - P.x, it.z - P.z) - it.radius), label, hold: this._gatherTime(it), act: () => this._gather(it), node: it, disabled: it.resource === 'ore' && !g.inventory.toolTier('pick') });
    }
    return out;
  }

  update(dt, input) {
    const g = this.game;
    this._t -= dt;
    if (this._t <= 0) {
      this._t = 0.1;
      const c = this._candidates().filter((x) => x);
      c.sort((a, b) => (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0) || a.d - b.d);
      this.current = c[0] || null;
      this.vehicleOpt = c.find((x) => x.key === 'F') || null;
      if (this.current && this.current.key === 'F' && c.length > 1 && !g.player.inVehicle) this.current = c.find((x) => x.key !== 'F');
    }
    const cur = this.current;
    g.ui.prompt(cur, this.vehicleOpt, this.hold, this.holdTarget);
    if (!g.ui.menuOpen && input.hit('KeyF') && this.vehicleOpt) this.vehicleOpt.act();
    if (!cur || cur.disabled || g.ui.menuOpen || g.build.active || g.player.photoMode) { this.hold = 0; return; }
    if (cur.hold) {
      if (input.down('KeyE')) {
        if (this.holdTarget !== cur.label) { this.hold = 0; this.holdTarget = cur.label; }
        this.hold += dt;
        g.player.action = 0.3;
        if (cur.node && Math.random() < dt * 3) {
          const it = cur.node;
          if (it.kind === 'tree') { g.audio.play('chop', { pos: new THREE.Vector3(it.x, it.y + 1, it.z) }); g.fx.chips(new THREE.Vector3(it.x, it.y + 1.2, it.z), [0.6, 0.45, 0.3]); }
          else if (it.kind === 'rock' || it.kind === 'ore') { g.audio.play('mine', { pos: new THREE.Vector3(it.x, it.y + 0.5, it.z) }); g.fx.chips(new THREE.Vector3(it.x, it.y + 0.6, it.z), [0.5, 0.5, 0.5]); }
          else g.audio.play('rustle');
        }
        if (this.hold >= cur.hold) { this.hold = 0; this.holdTarget = null; cur.act(); this._t = 0; }
      } else { this.hold = 0; this.holdTarget = null; }
    } else if (input.hit('KeyE') && cur.key !== 'F') { cur.act(); this._t = 0; }
  }

  _gather(it) {
    const g = this.game;
    const inv = g.inventory;
    const gb = 1 + 0.2 * g.progress.skill('gathering');
    let n = 1;
    switch (it.resource) {
      case 'wood': n = Math.round((2 + inv.toolTier('axe') + Math.round(it.scale * 1.5)) * gb); inv.add('wood', n); if (CONIFERS.has(it.type) && Math.random() < 0.6) inv.add('resin', 1); g.veg.harvest(it, 900); g.audio.play('chop'); g.fx.dust(new THREE.Vector3(it.x, it.y, it.z), 1.5, [0.4, 0.35, 0.25]); break;
      case 'stone': n = Math.round((2 + inv.toolTier('pick') + Math.round(it.scale)) * gb); inv.add('stone', n); if (Math.random() < 0.1) inv.add('fossil', 1); g.veg.harvest(it, 1200); g.audio.play('mine'); break;
      case 'ore': n = Math.round((1 + inv.toolTier('pick')) * gb); inv.add('ore', n); inv.add('stone', 1); if (Math.random() < 0.08 * inv.toolTier('pick')) inv.add('crystal', 1); g.veg.harvest(it, 1500); g.audio.play('mine'); break;
      case 'fiber': n = Math.round((2 + (it.type === 'cycad' ? 2 : 0)) * gb); inv.add('fiber', n); g.veg.harvest(it, 600); g.audio.play('rustle'); break;
      case 'berries': n = Math.round(3 * gb); inv.add('berries', n); inv.add('fiber', 1); g.veg.harvest(it, 700); g.audio.play('rustle'); break;
    }
    g.progress.addXP(2, '');
  }

  _drink(salty) {
    const g = this.game;
    const p = g.player;
    if (salty) { p.thirst = Math.min(100, p.thirst + 6); g.ui.notify('Brackish water… find a river for fresh water.', 'warn', 2.5); }
    else p.thirst = Math.min(100, p.thirst + 30);
    g.audio.play('drink');
  }

  _readTrack(fp) {
    const g = this.game;
    fp.read = true;
    const spec = fp.spec;
    const age = Math.round((g.clock.elapsed - fp.t) / 60);
    const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((Math.atan2(Math.sin(fp.heading), -Math.cos(fp.heading)) * 180) / Math.PI + 360) % 360) / 45) % 8];
    g.ui.notify(`🐾 ${spec.short} tracks — about ${age < 1 ? 'a minute' : age + ' minutes'} old, heading ${dir}. Herd marked on your map.`, 'info', 5);
    g.journal.trackedHerd = fp.herd;
    g.progress.addXP(15, 'Tracking');
    g.emit('track', { species: spec.id });
  }

  _harvestCarcass(d) {
    const g = this.game;
    d.harvested.meat = true;
    const big = Math.max(1, Math.round(d.length / 3));
    g.inventory.add('meat', Math.min(8, 1 + big));
    g.inventory.add('hide', Math.min(6, 1 + Math.round(big * 0.7)));
    if (d.length > 8 && Math.random() < 0.5) g.inventory.add('fossil', 1);
    g.audio.play('eat');
    g.progress.addXP(10, 'Scavenging');
  }

  _sample(d) {
    const g = this.game;
    d.harvested.sample = true;
    g.inventory.add('sample', 1);
    g.journal.species[d.spec.id].sampled++;
    g.journal.spot(d);
    g.progress.addXP(80 + d.spec.rarity * 30, 'Research sample');
    g.audio.play('pickup');
    g.emit('sample', { species: d.spec.id });
  }

  // ---------- Hotbar ----------
  useSelected() {
    const g = this.game;
    const inv = g.inventory;
    const id = inv.hotbar[inv.selected];
    if (!id) return;
    if (id === 'dart') return this.fireDart();
    if (!inv.has(id)) { g.ui.notify(`No ${ITEMS[id] ? ITEMS[id].name : id} left.`, 'warn', 1.5); return; }
    const def = ITEMS[id];
    const p = g.player;
    if (def.heal) {
      if (p.health >= p.maxHealth - 1) { g.ui.notify('Already at full health.', 'info', 1.5); return; }
      inv.remove(id, 1); p.heal(def.heal); g.audio.play('pickup'); g.ui.notify(`Used ${def.name} (+${def.heal} health)`, 'good', 1.5);
    } else if (def.food) {
      if (p.hunger >= 99) { g.ui.notify('You are not hungry.', 'info', 1.5); return; }
      inv.remove(id, 1);
      p.hunger = Math.min(100, p.hunger + def.food);
      if (def.water) p.thirst = Math.min(100, p.thirst + def.water);
      if (def.sick && Math.random() < def.sick) { p.damage(8, 'Food poisoning'); g.ui.notify('That raw meat made you sick. Cook it at a campfire!', 'warn'); }
      g.audio.play('eat');
    } else if (id === 'flare') {
      inv.remove(id, 1);
      this.throwFlare();
    }
  }

  throwFlare() {
    const g = this.game;
    const cam = g.camera;
    const dir = g.cam.forward(new THREE.Vector3());
    const pos = cam.position.clone().addScaledVector(dir, 0.8);
    const vel = dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5, 0));
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xff3311, emissive: 0xff2200, emissiveIntensity: 3 }));
    g.scene.add(mesh);
    const light = g.fx.flash(pos, 0xff3322, 80, 45, 22);
    light.priority = 4;
    this.flares.push({ pos, vel, mesh, t: 0, light, landed: false });
    g.audio.play('flare');
  }

  fireDart() {
    const g = this.game;
    const inv = g.inventory;
    if (!inv.gear.has('dart_rifle')) { g.ui.notify('You need a Dart Rifle (craft at a workbench, level 5).', 'warn'); return; }
    if (!inv.has('dart')) { g.ui.notify('Out of tranquilizer darts.', 'warn'); return; }
    inv.remove('dart', 1);
    g.audio.play('dart');
    g.cam.shake(0.15);
    const cam = g.camera;
    const dir = g.cam.forward(new THREE.Vector3());
    // hitscan against dinosaur bounding spheres
    let best = null, bt = 120;
    for (const d of g.dinos.active) {
      if (!d.alive) continue;
      const c = new THREE.Vector3(d.pos.x, d.pos.y + d.hip * 0.8, d.pos.z);
      const oc = c.clone().sub(cam.position);
      const t = oc.dot(dir);
      if (t < 0 || t > bt) continue;
      const r = Math.max(0.6, d.length * 0.22);
      if (oc.lengthSq() - t * t < r * r) { bt = t; best = d; }
    }
    if (best) {
      const sedated = best.sedate(1);
      g.fx.sparkle(new THREE.Vector3(best.pos.x, best.pos.y + best.hip, best.pos.z), [0.6, 1, 0.6]);
      g.ui.notify(sedated ? `${best.spec.short} sedated! Take a sample (E) — you have about a minute.` : `Dart hit! ${best.spec.short} needs more sedative.`, sedated ? 'good' : 'info', 2.5);
    }
  }

  updateProjectiles(dt) {
    const g = this.game;
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.t += dt;
      if (!f.landed) {
        f.vel.y -= 14 * dt;
        f.pos.addScaledVector(f.vel, dt);
        const gh = g.caves.active ? f.pos.y - 1 : g.world.getHeight(f.pos.x, f.pos.z);
        if (f.pos.y <= gh + 0.05) { f.pos.y = gh + 0.05; f.landed = true; g.dinos.scareAround(f.pos, 50, 22); g.emit('flare', {}); }
      }
      f.mesh.position.copy(f.pos);
      f.light.pos.copy(f.pos).add(new THREE.Vector3(0, 0.6, 0));
      if (Math.random() < dt * 30) g.fx.fire(f.pos, 0.35);
      if (Math.random() < dt * 6) g.fx.smoke(f.pos, 0.3, 0.6, 1.2);
      if (f.landed && Math.random() < dt * 2) g.dinos.scareAround(f.pos, 40, 10);
      if (f.t > 20) { f.mesh.removeFromParent(); this.flares.splice(i, 1); }
    }
    // hunt-escape detection
    const hunters = g.dinos.active.filter((d) => d.state === 'hunt' && d.prey === 'player');
    for (const h of hunters) this.huntedBy.add(h);
    for (const h of [...this.huntedBy]) {
      if (!h.active || !h.alive) { this.huntedBy.delete(h); continue; }
      if (h.state !== 'hunt' && g.player.alive) {
        this.huntedBy.delete(h);
        if (h.spec.length > 2) { g.emit('hunt-escaped', { species: h.spec.id }); g.ui.notify(`You escaped the ${h.spec.short}!`, 'good'); }
      }
    }
  }
}
