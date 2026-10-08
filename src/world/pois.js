// Points of interest: base camp, peaks, caves, ancient ruins, research outposts, waterfalls,
// hidden treasures, lost explorers, fossil digs, nesting grounds and supply caches.
import * as THREE from 'three';
import { buildLandmark } from './props.js';
import { Avatar, EXPLORER_LOOKS } from '../player/avatar.js';
import { mulberry32, clamp } from '../core/noise.js';
import { BIOME, REGIONS, ISLANDS, VOLCANO, HALF } from './worldgen.js';

export const POI_TYPES = {
  camp: { icon: '⛺', label: 'Base Camp', xp: 0, r: 30 },
  peak: { icon: '🏔️', label: 'Summit', xp: 150, r: 22 },
  cave: { icon: '🕳️', label: 'Cave', xp: 150, r: 30 },
  ruin: { icon: '🏛️', label: 'Ancient Ruin', xp: 200, r: 45 },
  outpost: { icon: '📡', label: 'Research Outpost', xp: 120, r: 35 },
  waterfall: { icon: '💧', label: 'Waterfall', xp: 100, r: 60 },
  treasure: { icon: '💰', label: 'Hidden Cache', xp: 80, r: 10 },
  explorer: { icon: '🧭', label: 'Lost Explorer', xp: 50, r: 25 },
  fossil: { icon: '🦴', label: 'Fossil Site', xp: 60, r: 20 },
  nest: { icon: '🥚', label: 'Nesting Ground', xp: 80, r: 25 },
  crate: { icon: '📦', label: 'Supply Cache', xp: 0, r: 0 },
};

const RUINS = [
  { id: 'temple', model: 'temple', name: 'Temple of the Sun', region: 'jungle', lore: 'Carvings show figures riding long-necked beasts toward a burning mountain. The glyphs repeat one word: "Sombra".' },
  { id: 'circle', model: 'circle', name: 'Verdant Stone Circle', region: 'plains', lore: 'The monoliths align with the solstice sunrise. An inscription warns: "When the mountain wakes, the herds walk to the sea."' },
  { id: 'pillars', model: 'pillars', name: 'Sunken Pillars', region: 'mirefen', lore: 'A drowned colonnade. Engravings depict a great sail-backed hunter guarding the waters.' },
  { id: 'shrine', model: 'shrine', name: 'Cliffside Shrine', region: 'titan', lore: 'A shrine to the "Sky Father" — a winged giant that nests above the clouds of the Titan Range.' },
  { id: 'obelisk', model: 'obelisk', name: 'Badlands Obelisk', region: 'badlands', lore: 'Star maps cover the obelisk. One star is circled, positioned directly over a far western island.' },
  { id: 'ziggurat', model: 'ziggurat', name: 'Ziggurat of Isla Sombra', island: 'isla-sombra', lore: 'At the summit, a crystal pulses with light. The builders came here to study the giants — and never left. Their final record: "We were the visitors. They were always the masters of this land."', finale: true },
];
const OUTPOSTS = [
  { id: 'alpha', name: 'Outpost Alpha', region: 'elder', unlock: 'jeep' },
  { id: 'beta', name: 'Outpost Beta', region: 'fernhollow', unlock: 'boat' },
  { id: 'gamma', name: 'Outpost Gamma', region: 'meadows', unlock: 'glider' },
  { id: 'delta', name: 'Outpost Delta', region: 'pines', unlock: 'gyro' },
];
const CAVES = [
  { id: 'crystal-grotto', name: 'Crystal Grotto', region: 'titan', theme: 'crystal' },
  { id: 'jungle-sinkhole', name: 'Emerald Sinkhole', region: 'jungle', theme: 'jungle' },
  { id: 'canyon-caverns', name: 'Red Canyon Caverns', region: 'badlands', theme: 'canyon' },
  { id: 'lava-tubes', name: 'Ember Lava Tubes', region: 'ember', theme: 'lava' },
  { id: 'sea-grotto', name: 'Gull Rock Sea Grotto', island: 'gull-rock', theme: 'sea' },
  { id: 'whisper-hollow', name: 'Whispering Hollow', region: 'pines', theme: 'crystal' },
];
const EXPLORERS = [
  { id: 'exp-maya', name: 'Dr. Maya Okafor', note: 'Paleobotanist. Lost tracking a Brachiosaurus herd.' },
  { id: 'exp-luis', name: 'Luis Herrera', note: 'Expedition guide. Twisted an ankle in the badlands.' },
  { id: 'exp-anna', name: 'Anna Lindqvist', note: 'Photographer. Separated from her team in the jungle.' },
  { id: 'exp-kenji', name: 'Kenji Mori', note: 'Geologist. Went to study the volcano and never returned.' },
  { id: 'exp-sara', name: 'Sara Haddad', note: 'Ornithologist. Studying pterosaur colonies on the peaks.' },
  { id: 'exp-tom', name: 'Tom Brennan', note: 'Radio technician. Stranded near the marsh.' },
];

export class POIs {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.list = [];
    this.byId = {};
    this.group = new THREE.Group();
    this.group.name = 'pois';
    game.scene.add(this.group);
    this.rand = mulberry32(4242);
    this._t = 0;
    this.explorerFollowing = null;
  }

  regionCenter(id) { return REGIONS.find((r) => r.id === id); }

  // find a spot near (cx,cz) within radius satisfying predicate
  _spot(cx, cz, radius, pred, tries = 2500) {
    const w = this.world, R = this.rand;
    let best = null, bs = -Infinity;
    for (let i = 0; i < tries; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!w.inBounds(x, z)) continue;
      const h = w.getHeight(x, z);
      const s = pred(x, z, h, w.getBiome(x, z), w.getNormal(x, z));
      if (s === true) return { x, z, h };
      if (typeof s === 'number' && s > bs) { bs = s; best = { x, z, h }; }
    }
    return best;
  }
  _flat(x, z, r = 6) {
    const w = this.world;
    const h0 = w.getHeight(x, z);
    let m = 0;
    for (let a = 0; a < 8; a++) m = Math.max(m, Math.abs(w.getHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) - h0));
    return m;
  }
  _dry(x, z, h) { return h > 1.2 && this.world.waterLevelAt(x, z) < h - 0.5; }
  _farFromOthers(x, z, d = 120) { return this.list.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > d * d); }

  add(type, name, x, z, extra = {}) {
    const def = POI_TYPES[type];
    const p = { id: extra.id || `${type}-${this.list.length}`, type, name, x, z, y: this.world.getHeight(x, z), r: def.r, icon: def.icon, discovered: false, state: {}, colliders: [], ...extra };
    this.list.push(p);
    this.byId[p.id] = p;
    return p;
  }

  generate() {
    const w = this.world;
    // Base Camp Echo
    const camp = this._spot(180, 330, 220, (x, z, h, b, n) => this._dry(x, z, h) && b === BIOME.GRASSLAND && this._flat(x, z, 12) < 1.5 && n.y > 0.97);
    this.camp = this.add('camp', 'Base Camp Echo', camp.x, camp.z, { id: 'camp', discovered: true, station: ['workbench', 'campfire', 'storage'] });

    // Peaks: highest points
    const highest = (cx, cz, rad, pred = () => true) => this._spot(cx, cz, rad, (x, z, h, b) => (pred(x, z, h, b) ? h : -1e9), 5000);
    const titan = REGIONS.find((r) => r.id === 'titan');
    const p1 = highest(titan.x, titan.z, 520);
    this.add('peak', 'Mount Titan Summit', p1.x, p1.z, { id: 'peak-titan', major: true });
    const p2 = highest(VOLCANO.x, VOLCANO.z, 160, (x, z) => Math.hypot(x - VOLCANO.x, z - VOLCANO.z) > 70);
    this.add('peak', 'Ember Peak Rim', p2.x, p2.z, { id: 'peak-ember', major: true });
    const jg = REGIONS.find((r) => r.id === 'jungle');
    const p3 = highest(jg.x, jg.z, 420, (x, z, h, b) => b === BIOME.JUNGLE);
    this.add('peak', 'Sentinel Rock', p3.x, p3.z, { id: 'peak-sentinel' });
    const bd = REGIONS.find((r) => r.id === 'badlands');
    const p4 = highest(bd.x, bd.z, 420, (x, z, h, b) => b === BIOME.DESERT);
    this.add('peak', 'High Mesa', p4.x, p4.z, { id: 'peak-mesa' });
    const pines = REGIONS.find((r) => r.id === 'pines');
    const p5 = highest(pines.x, pines.z, 420);
    this.add('peak', 'Pinecrest Lookout', p5.x, p5.z, { id: 'peak-pinecrest' });
    const sombra = ISLANDS.find((i) => i.id === 'isla-sombra');

    // Caves
    for (const c of CAVES) {
      const ctr = c.island ? ISLANDS.find((i) => i.id === c.island) : this.regionCenter(c.region);
      const rad = c.island ? ctr.r * 0.8 : ctr.r * 0.7;
      const s = this._spot(ctr.x, ctr.z, rad, (x, z, h, b, n) => this._dry(x, z, h) && n.y > 0.72 && n.y < 0.9 && this._farFromOthers(x, z, 150) && h > 3);
      if (!s) continue;
      const n = w.getNormal(s.x, s.z);
      // entrance faces downhill
      const face = Math.atan2(n.x, n.z);
      this.add('cave', c.name, s.x, s.z, { id: c.id, theme: c.theme, face, major: true });
    }
    // Ruins
    for (const r of RUINS) {
      const ctr = r.island ? sombra : this.regionCenter(r.region);
      const rad = r.island ? 60 : ctr.r * 0.6;
      const s = this._spot(ctr.x, ctr.z, rad, (x, z, h, b, n) => (this._dry(x, z, h) && n.y > 0.9 && this._farFromOthers(x, z, 150) ? 10 - this._flat(x, z, r.model === 'ziggurat' ? 16 : 10) : -1e9), 4000);
      if (!s) continue;
      this.add('ruin', r.name, s.x, s.z, { id: r.id, model: r.model, lore: r.lore, finale: r.finale, major: true, face: this.rand() * Math.PI * 2 });
    }
    // Outposts
    for (const o of OUTPOSTS) {
      const ctr = this.regionCenter(o.region);
      const s = this._spot(ctr.x, ctr.z, ctr.r * 0.6, (x, z, h, b, n) => this._dry(x, z, h) && n.y > 0.95 && this._flat(x, z, 9) < 1.6 && this._farFromOthers(x, z, 150));
      if (!s) continue;
      this.add('outpost', o.name, s.x, s.z, { id: 'outpost-' + o.id, unlock: o.unlock, major: true, face: this.rand() * 6 });
    }
    // Waterfalls
    for (const f of this.game.water.waterfalls) {
      if (f.wf.height < 8) continue;
      const R = f.river;
      const ex = R.x[Math.max(0, f.wf.i0 - 1)], ez = R.z[Math.max(0, f.wf.i0 - 1)];
      if (!this._farFromOthers(ex, ez, 60)) continue;
      const names = ['Thundering Falls', 'Veil Falls', 'Mistfall Cascade', 'Jade Falls', 'Rust Falls', 'Echo Falls', 'Silver Steps'];
      this.add('waterfall', names[this.list.filter((p) => p.type === 'waterfall').length % names.length], (ex + f.bx) / 2, (ez + f.bz) / 2, { major: true, height: f.wf.height });
    }
    // Treasures
    const treasureNames = ['Smuggler’s Cache', 'Explorer’s Stash', 'Amber Hoard', 'Forgotten Satchel', 'Collector’s Trove', 'Old Supply Drop', 'Pirate Chest', 'Survey Lockbox'];
    for (let i = 0; i < 24; i++) {
      const s = this._spot(0, 0, HALF - 80, (x, z, h, b, n) => this._dry(x, z, h) && this._farFromOthers(x, z, 140) && (n.y < 0.85 || h > 120 || b === BIOME.ISLAND || b === BIOME.JUNGLE || b === BIOME.SWAMP));
      if (!s) continue;
      this.add('treasure', treasureNames[i % treasureNames.length], s.x, s.z, { id: 'treasure-' + i, hidden: true });
    }
    // Lost explorers
    const regionsForExplorers = ['meadows', 'badlands', 'jungle', 'ember', 'titan', 'mirefen'];
    EXPLORERS.forEach((e, i) => {
      const ctr = this.regionCenter(regionsForExplorers[i]);
      const s = this._spot(ctr.x, ctr.z, ctr.r * 0.75, (x, z, h, b, n) => this._dry(x, z, h) && n.y > 0.93 && this._farFromOthers(x, z, 120));
      if (s) this.add('explorer', e.name, s.x, s.z, { id: e.id, note: e.note, hidden: true });
    });
    // Fossil sites
    for (let i = 0; i < 9; i++) {
      const s = this._spot(0, 0, HALF - 100, (x, z, h, b, n) => this._dry(x, z, h) && (b === BIOME.CANYON || b === BIOME.DESERT || b === BIOME.MOUNTAIN || b === BIOME.BEACH) && n.y > 0.9 && this._farFromOthers(x, z, 150));
      if (s) this.add('fossil', ['Bone Bed', 'Fossil Quarry', 'Sauropod Graveyard', 'Raptor Bones', 'Ancient Skeleton'][i % 5], s.x, s.z, { id: 'fossil-' + i });
    }
    // Nests
    const nestSpecies = ['triceratops', 'parasaur', 'brachio', 'stego', 'galli', 'iguanodon'];
    nestSpecies.forEach((sp, i) => {
      const spec = this.game.dinoSpecies[sp];
      const s = this._spot(0, 0, HALF - 100, (x, z, h, b, n) => this._dry(x, z, h) && spec.biomes.includes(b) && n.y > 0.95 && this._farFromOthers(x, z, 120));
      if (s) this.add('nest', `${spec.short} Nesting Ground`, s.x, s.z, { id: 'nest-' + sp, species: sp });
    });
    // Supply caches
    for (let i = 0; i < 36; i++) {
      const s = this._spot(0, 0, HALF - 80, (x, z, h, b, n) => this._dry(x, z, h) && n.y > 0.9 && this._farFromOthers(x, z, 70));
      if (s) this.add('crate', 'Supply Cache', s.x, s.z, { id: 'crate-' + i });
    }
    // keep vegetation clear around POIs
    for (const p of this.list) {
      const clearR = { camp: 22, ruin: p.model === 'ziggurat' ? 26 : 20, outpost: 14, cave: 9, explorer: 7, fossil: 6, nest: 5, crate: 3, peak: 3, treasure: 2 }[p.type];
      if (clearR) this.game.veg.addExclusion(p.x, p.z, clearR);
    }
  }

  build() {
    for (const p of this.list) {
      if (p.type === 'waterfall') continue;
      const model = p.type === 'ruin' ? p.model : p.type;
      const { group, colliders } = buildLandmark(model, p.id.length * 31 + Math.floor(p.x));
      const rot = p.type === 'cave' ? p.face : (p.face || 0);
      group.position.set(p.x, p.y - (p.type === 'cave' ? 1.0 : p.type === 'ruin' ? 0.4 : 0.05), p.z);
      group.rotation.y = rot;
      this.group.add(group);
      p.group = group;
      const c = Math.cos(rot), s = Math.sin(rot);
      p.colliders = colliders.map((k) => ({ x: p.x + k.x * c + k.z * s, z: p.z - k.x * s + k.z * c, r: k.r, top: p.y + k.top }));
      p.lightSrcs = (group.userData.lights || []).map((L) => this.game.fx.addLight({ pos: group.localToWorld(L.pos.clone()), color: L.color, intensity: L.intensity, dist: L.dist, flicker: L.flicker }));
      if (p.type === 'explorer') {
        // every lost explorer has their own face, hair, outfit and signature gear
        const av = new Avatar({ ...(EXPLORER_LOOKS[p.id] || {}), npc: true });
        av.root.position.set(p.x + 1.5, p.y, p.z + 1.5);
        av.root.rotation.y = this.rand() * 6;
        this.group.add(av.root);
        p.npc = { avatar: av, pos: av.root.position, sitting: true, wave: 0 };
      }
      if (p.type === 'cave') {
        p.entrance = new THREE.Vector3(p.x + Math.sin(rot) * 3, p.y, p.z + Math.cos(rot) * 3);
        // glowing hint so caves read at distance
      }
      if (p.type === 'treasure') p.group.userData.sparkleT = 0;
    }
  }

  // ---------- runtime ----------
  update(dt) {
    const g = this.game;
    const P = g.player.pos;
    this._t += dt;
    const t = this._t;
    // discovery (throttled)
    this._disc = (this._disc || 0) - dt;
    if (this._disc <= 0 && !g.caves.active) {
      this._disc = 0.3;
      for (const p of this.list) {
        if (p.discovered || p.type === 'crate') continue;
        const d = Math.hypot(p.x - P.x, p.z - P.z);
        const vy = p.type === 'peak' ? Math.abs(P.y - p.y) < 25 : true;
        if (d < p.r && vy) this.discover(p);
      }
    }
    for (const p of this.list) {
      if (!p.group) continue;
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      const far = p.major ? 2200 : p.type === 'crate' || p.type === 'treasure' ? 260 : 700;
      p.group.visible = d < far && !g.caves.active;
      if (!p.group.visible) continue;
      const U = p.group.userData;
      if (U.cloth) { const pos = U.cloth.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + 0.6; pos.setZ(i, Math.sin(t * 4 + x * 3) * 0.12 * x); } pos.needsUpdate = true; }
      if (U.blink) U.blink.visible = Math.sin(t * 3) > 0;
      if (U.spin) U.spin.rotation.y += dt * 0.8;
      if (U.glyph) U.glyph.emissiveIntensity = p.state.investigated ? 0.8 + Math.sin(t * 2) * 0.3 : 0;
      if (U.lamp) U.lamp.emissiveIntensity = p.state.restored ? 3 : 0;
      if (U.fire && d < 120 && Math.random() < dt * 25) g.fx.fire(p.group.localToWorld(U.fire.clone()), 0.8);
      if (U.fire && d < 200 && Math.random() < dt * 3) g.fx.smoke(p.group.localToWorld(U.fire.clone()).add(new THREE.Vector3(0, 1, 0)), 0.5, 0.35, 1.5);
      if (p.type === 'treasure' && !p.state.looted && d < 40 && Math.random() < dt * 1.5) g.fx.sparkle(new THREE.Vector3(p.x, p.y + 0.8, p.z));
      if (p.type === 'treasure' && p.state.looted && U.lid) U.lid.rotation.x = Math.max(U.lid.rotation.x - dt * 2, -1.2);
      if (p.npc) this._npc(p, dt);
    }
  }

  _npc(p, dt) {
    const g = this.game;
    const n = p.npc;
    const av = n.avatar;
    const P = g.player.pos;
    if (p.state.rescued) { av.root.visible = false; return; }
    av.root.visible = !g.caves.active;
    if (p.state.following) {
      const dx = P.x - n.pos.x, dz = P.z - n.pos.z;
      const d = Math.hypot(dx, dz);
      let sp = 0;
      if (d > 60 || g.player.inVehicle) {
        // explorers ride along in vehicles / catch up
        const a = g.cam.yaw + Math.PI * 0.8;
        n.pos.set(P.x + Math.sin(a) * 2.5, 0, P.z + Math.cos(a) * 2.5);
      } else if (d > 3) {
        sp = Math.min(d > 8 ? 6.5 : 3.5, d);
        n.pos.x += (dx / d) * sp * dt; n.pos.z += (dz / d) * sp * dt;
        av.root.rotation.y = Math.atan2(dx, dz);
      }
      n.pos.y = Math.max(g.world.getHeight(n.pos.x, n.pos.z), g.world.waterLevelAt(n.pos.x, n.pos.z) - 1.4);
      av.update(dt, { speed: sp, onGround: true, swim: g.world.waterLevelAt(n.pos.x, n.pos.z) - g.world.getHeight(n.pos.x, n.pos.z) > 1.3, mood: 'happy' });
      // safe?
      const camp = this.camp;
      const safe = Math.hypot(camp.x - n.pos.x, camp.z - n.pos.z) < 30 || g.build.shelterNear(n.pos.x, n.pos.z, 25);
      if (safe) this.rescue(p);
    } else {
      // waiting to be found: worried, busy with their work; they stand and wave when you come close
      const dP = Math.hypot(P.x - n.pos.x, P.z - n.pos.z);
      const near = dP < 14;
      let lookYaw = 0;
      if (near) {
        const want = Math.atan2(P.x - n.pos.x, P.z - n.pos.z);
        let d = want - av.root.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        av.root.rotation.y += d * Math.min(1, dt * 2.5);
        lookYaw = Math.max(-0.6, Math.min(0.6, d));
      }
      av.update(dt, { speed: 0, onGround: true, crouch: !near, action: !near && dP < 30, wave: near && dP > 3, lookYaw, mood: near ? 'happy' : 'worried' });
    }
  }

  discover(p) {
    if (p.discovered) return;
    const g = this.game;
    p.discovered = true;
    const def = POI_TYPES[p.type];
    g.audio.play('discover');
    g.ui.banner(p.name.toUpperCase(), `${def.icon} ${def.label} discovered`);
    if (def.xp) g.progress.addXP(def.xp, 'Discovery');
    g.progress.stats.discoveries++;
    if (p.type === 'peak') g.progress.stats.peaks++;
    g.journal.revealAround(p.x, p.z, p.type === 'peak' ? 600 : 160);
    g.emit('poi-discovered', { poi: p });
    if (p.type === 'explorer') g.ui.radio('Dr. Vargas', `You found ${p.name}! ${p.note} Talk to them (E) and escort them back to Base Camp Echo or one of your shelters.`);
  }

  // Solid collision for POI structures
  collide(pos, r, y) {
    for (const p of this.list) {
      if (!p.colliders.length || !p.group || !p.group.visible) continue;
      if (Math.abs(p.x - pos.x) > 40 || Math.abs(p.z - pos.z) > 40) continue;
      for (const c of p.colliders) {
        if (y !== null && y > c.top) continue;
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const rr = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = c.x + (dx / d) * rr; pos.z = c.z + (dz / d) * rr; pos.hit = true;
        }
      }
    }
    return pos;
  }

  // ground height on top of POI platforms (ruins can be climbed)
  heightBonus(x, z, y) { return 0; }

  nearestStationCamp(type) {
    const P = this.game.player.pos;
    return this.camp && Math.hypot(this.camp.x - P.x, this.camp.z - P.z) < 25 && this.camp.station.includes(type);
  }

  // Interaction options near the player
  interactables(P) {
    const out = [];
    const g = this.game;
    for (const p of this.list) {
      const dx = p.x - P.x, dz = p.z - P.z;
      const d = Math.hypot(dx, dz);
      if (d > 30) continue;
      switch (p.type) {
        case 'cave': {
          const e = p.entrance;
          const de = Math.hypot(e.x - P.x, e.z - P.z);
          if (de < 7) out.push({ d: de, label: `Enter ${p.name}`, act: () => g.caves.enter(p) });
          break;
        }
        case 'ruin':
          if (d < (p.model === 'ziggurat' ? 22 : p.model === 'temple' ? 16 : 10)) out.push({ d, label: p.state.investigated ? `${p.name} (investigated)` : `Investigate ${p.name}`, act: () => this.investigate(p), disabled: p.state.investigated });
          break;
        case 'outpost':
          if (d < 9) out.push({ d, label: p.state.restored ? `${p.name}: Online` : `Restore power to ${p.name} (2 Metal)`, act: () => this.restore(p), disabled: p.state.restored });
          break;
        case 'treasure':
          if (d < 3) out.push({ d, label: p.state.looted ? 'Empty cache' : `Open ${p.name}`, act: () => this.loot(p), disabled: p.state.looted });
          break;
        case 'explorer':
          if (!p.state.rescued && !p.state.following && p.npc && Math.hypot(p.npc.pos.x - P.x, p.npc.pos.z - P.z) < 4) out.push({ d, label: `Talk to ${p.name}`, act: () => this.talk(p) });
          break;
        case 'fossil': {
          const ready = !p.state.dugAt || g.clock.elapsed - p.state.dugAt > 2400;
          if (d < 5) out.push({ d, label: ready ? 'Excavate fossils' : 'Fossils excavated (regrows later)', act: () => this.dig(p), disabled: !ready });
          break;
        }
        case 'nest':
          if (d < 5) out.push({ d, label: p.state.observed ? 'Nest observed' : 'Study the nest', act: () => this.observeNest(p), disabled: p.state.observed });
          break;
        case 'crate': {
          const ready = !p.state.lootedAt || g.clock.elapsed - p.state.lootedAt > 1500;
          if (d < 3) out.push({ d, label: ready ? 'Search supply cache' : 'Supply cache (empty)', act: () => this.searchCrate(p), disabled: !ready });
          break;
        }
        case 'camp':
          if (d < 12) out.push({ d: d + 2, label: 'Rest at Base Camp (sleep until morning)', act: () => g.sleep() });
          break;
      }
    }
    return out;
  }

  investigate(p) {
    const g = this.game;
    if (p.state.investigated) return;
    p.state.investigated = true;
    g.inventory.add('artifact', 1);
    g.progress.addXP(250, 'Investigation');
    g.audio.play('mission');
    g.ui.lore(p.name, p.lore);
    g.journal.addLore(p.id, p.name, p.lore);
    // reveal a treasure hint
    const hidden = this.list.filter((q) => q.type === 'treasure' && !q.discovered && !q.state.hinted);
    if (hidden.length) {
      hidden.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      hidden[0].state.hinted = true;
      g.ui.notify('The carvings point to a hidden cache. It is now marked on your map.', 'gold');
    }
    g.emit('ruin-investigated', { poi: p });
  }

  restore(p) {
    const g = this.game;
    if (p.state.restored) return;
    if (!g.inventory.has('metal', 2)) { g.ui.notify('You need 2 Metal Ingots to repair the generator.', 'warn'); g.audio.play('error'); return; }
    g.inventory.remove('metal', 2);
    p.state.restored = true;
    g.progress.addXP(200, 'Outpost restored');
    g.journal.revealAround(p.x, p.z, 520);
    g.audio.play('radio');
    if (p.unlock) {
      g.inventory.unlocked.add(p.unlock);
      const names = { jeep: 'Off-Road Jeep', boat: 'Motor Boat', glider: 'Hang Glider', gyro: 'Gyrocopter' };
      g.ui.notify(`📐 Blueprint recovered: ${names[p.unlock]}`, 'gold');
    }
    g.ui.radio('Dr. Vargas', `${p.name} is back online! The survey data revealed the surrounding region on your map, and it's now a fast-travel point.`);
    g.emit('outpost-restored', { poi: p });
  }

  loot(p) {
    const g = this.game;
    if (p.state.looted) return;
    p.state.looted = true;
    if (!p.discovered) this.discover(p);
    const R = this.rand;
    g.inventory.add('amber', 1 + Math.floor(R() * 2));
    g.inventory.add('crystal', 1 + Math.floor(R() * 2));
    g.inventory.add('metal', 2 + Math.floor(R() * 3));
    if (R() < 0.5) g.inventory.add('fossil', 1);
    if (R() < 0.4) g.inventory.add('dart', 3);
    g.progress.addXP(60, 'Treasure');
    g.audio.play('discover');
    g.emit('treasure-found', { poi: p });
  }

  talk(p) {
    const g = this.game;
    if (this.explorerFollowing && this.explorerFollowing !== p) { g.ui.notify('You are already escorting someone.', 'warn'); return; }
    p.state.following = true;
    p.npc.sitting = false;
    this.explorerFollowing = p;
    g.ui.radio(p.name, '"Thank goodness! I thought nobody would come. Lead the way — I\'ll stay close."');
    g.emit('explorer-found', { poi: p });
  }

  rescue(p) {
    const g = this.game;
    p.state.following = false;
    p.state.rescued = true;
    this.explorerFollowing = null;
    g.progress.addXP(300, 'Rescue');
    g.progress.stats.rescued++;
    g.inventory.add('bandage', 2);
    g.inventory.add('dart', 4);
    g.audio.play('mission');
    g.ui.radio(p.name, '"Safe at last. Thank you! Take these supplies — and here, my field notes."');
    g.journal.revealAround(p.x, p.z, 300);
    g.emit('explorer-rescued', { poi: p });
  }

  dig(p) {
    const g = this.game;
    if (!g.inventory.toolTier('pick')) { g.ui.notify('You need a pickaxe to excavate.', 'warn'); return; }
    p.state.dugAt = g.clock.elapsed;
    g.player.action = 1.5;
    g.audio.play('mine');
    g.inventory.add('fossil', 2 + g.inventory.toolTier('pick'));
    if (Math.random() < 0.35) g.inventory.add('amber', 1);
    g.progress.addXP(60, 'Excavation');
    g.emit('fossil-dug', { poi: p });
  }

  observeNest(p) {
    const g = this.game;
    p.state.observed = true;
    g.progress.addXP(120, 'Field research');
    g.journal.addLore(p.id, p.name, `Clutch of ${p.species} eggs, carefully tended. Adults are never far away.`);
    g.ui.notify('Nest documented in your journal. Photograph it for bonus research.', 'good');
    g.emit('nest-observed', { poi: p });
  }

  searchCrate(p) {
    const g = this.game;
    p.state.lootedAt = g.clock.elapsed;
    const R = Math.random;
    const loot = [['hide', 2, 4], ['rope', 1, 3], ['metal', 1, 2], ['fuel', 1, 2], ['bandage', 1, 2], ['resin', 1, 3], ['berries', 2, 4], ['dart', 2, 4], ['flare', 1, 2], ['cooked_meat', 1, 2]];
    const n = 2 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) {
      const [id, a, b] = loot[Math.floor(R() * loot.length)];
      if ((id === 'dart' || id === 'fuel') && g.progress.level < 4 && R() < 0.6) continue;
      g.inventory.add(id, a + Math.floor(R() * (b - a + 1)));
    }
    g.audio.play('pickup');
    g.progress.addXP(10, 'Scavenging');
  }

  serialize() {
    const o = {};
    for (const p of this.list) if (p.discovered || Object.keys(p.state).length) o[p.id] = { d: p.discovered, s: p.state, np: p.npc && p.state.following ? [p.npc.pos.x, p.npc.pos.z] : null };
    return o;
  }
  deserialize(o) {
    for (const [id, v] of Object.entries(o || {})) {
      const p = this.byId[id];
      if (!p) continue;
      p.discovered = v.d;
      p.state = v.s || {};
      if (p.state.following && p.npc) { this.explorerFollowing = p; if (v.np) p.npc.pos.set(v.np[0], 0, v.np[1]); }
    }
  }
}
