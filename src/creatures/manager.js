// Creature population: templates, spawning, simulation LOD, interactions.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SPECIES, SPECIES_ORDER, buildSpeciesGeometry } from './species.js';
import { Creature } from './creature.js';
import { scaleTextures } from '../render/textures.js';
import { addCompileHook, patchSunVisibility, U } from '../render/common.js';
import { mulberry32 } from '../core/noise.js';
import { MIRROR_LAKE, ISLANDS, VOLCANO, PLAYER_START } from '../world/design.js';

const _v = new THREE.Vector3();
const _sep = new THREE.Vector3();

function skinMaterial(spec) {
  const tex = scaleTextures(spec.texture);
  const map = tex.map.clone();
  const nrm = tex.normal.clone();
  map.needsUpdate = nrm.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    normalMap: nrm,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: spec.texture === 'smooth' ? 0.42 : spec.texture === 'feathers' ? 0.9 : 0.72,
    metalness: 0,
    side: spec.flying ? THREE.DoubleSide : THREE.FrontSide,
  });
  addCompileHook(m, (shader) => {
    patchSunVisibility(shader, { terrainShadow: 'vertex', cloudShadow: true });
    shader.uniforms.uWetness = U.uWetness;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWetness;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor *= 1.0 - uWetness * 0.45;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    // soft rim / subsurface on thin skin
    vec3 Vw = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition) * -1.0), 0.0), 3.0);
    reflectedLight.indirectDiffuse += diffuseColor.rgb * rim * 0.15;
    reflectedLight.indirectSpecular *= 0.3;
    reflectedLight.directSpecular *= 0.5;
  }`);
  }, 'skin-' + spec.texture);
  return m;
}

export class CreatureManager {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'creatures';
    game.scene.add(this.group);
    this.templates = {};
    this.list = [];
    this.grid = new Map();
    this.hitTmp = [];
    this.rng = mulberry32(777);
    this.nextId = 1;
    for (const id of SPECIES_ORDER) {
      const spec = SPECIES[id];
      const { geometry, bones } = buildSpeciesGeometry(spec);
      const mat = skinMaterial(spec);
      const mesh = new THREE.SkinnedMesh(geometry, mat);
      mesh.add(bones[0]);
      mesh.bind(new THREE.Skeleton(bones));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      this.templates[id] = { spec, mesh, material: mat };
    }
  }

  spawn(id, x, z, opts = {}) {
    const T = this.templates[id];
    const mesh = SkeletonUtils.clone(T.mesh);
    mesh.material = T.material;
    const r = this.rng;
    const sr = T.spec.scaleRange;
    let scale = sr[0] + (sr[1] - sr[0]) * r();
    if (opts.juvenile) scale *= 0.45;
    const c = new Creature(this, T.spec, mesh, { ...opts, scale, id: this.nextId++ });
    const w = this.game.world;
    c.pos.set(x, w.height(x, z), z);
    if (c.isFlying) c.pos.y = Math.max(w.height(x, z), 0) + c.altitude;
    if (c.isSwimming) c.pos.y = w.waterLevel(x, z) - 4;
    if (!opts.home) c.home.set(x, 0, z);
    this.group.add(mesh);
    this.list.push(c);
    c.animate(0, true);
    return c;
  }

  findSpot(cx, cz, radius, test, tries = 60) {
    const r = this.rng;
    for (let i = 0; i < tries; i++) {
      const a = r() * Math.PI * 2, d = radius * Math.sqrt(r());
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (test(x, z)) return [x, z];
    }
    return null;
  }

  populate(quality) {
    const w = this.game.world;
    const dens = Math.max(0.6, Math.min(1.3, quality.creatureLod));
    const land = (spec) => (x, z) => this.walkable({ spec, isSwimming: false, isFlying: false }, x, z);
    const herd = (id, cx, cz, n, juveniles = 0) => {
      const spec = SPECIES[id];
      const at = this.findSpot(cx, cz, 250, land(spec));
      if (!at) return;
      const H = { center: new THREE.Vector3(at[0], 0, at[1]), members: [], leader: null };
      const count = Math.round(n * dens);
      for (let i = 0; i < count; i++) {
        const p = this.findSpot(at[0], at[1], 30 + spec.length * 2, land(spec)) || at;
        const c = this.spawn(id, p[0], p[1], { herd: H, home: H.center, juvenile: i >= count - juveniles });
        H.members.push(c);
        if (!H.leader) H.leader = c;
      }
    };
    // near the start so the world feels alive immediately
    herd('triceratops', PLAYER_START.x - 120, PLAYER_START.z + 330, 6, 2);
    herd('brachio', PLAYER_START.x + 420, PLAYER_START.z + 650, 4, 1);
    herd('triceratops', -700, -250, 7, 2);
    herd('triceratops', 650, -250, 6, 1);
    herd('triceratops', -1150, 550, 5, 1);
    herd('brachio', 1350, 650, 4, 1);
    herd('brachio', -950, 150, 3, 0);
    herd('raptor', 1700, 1500, 5);
    herd('raptor', 2250, 950, 4);
    herd('raptor', -350, 1750, 5);
    herd('raptor', 900, 2300, 4);
    for (const [x, z] of [[1250, 1850], [-1550, -650], [350, -750], [-600, 2200]]) {
      const p = this.findSpot(x, z, 300, land(SPECIES.trex));
      if (p) this.spawn('trex', p[0], p[1]);
    }
    // pterosaurs around cliffs, coast and the volcano
    const anchors = [[MIRROR_LAKE.x, MIRROR_LAKE.z + 500], [-2100, 1100], [VOLCANO.x - 600, VOLCANO.z + 500], [400, 3000], [2600, 3300], [-1200, 2900], [0, 500]];
    for (const [ax, az] of anchors) {
      for (let i = 0; i < Math.round(2.4 * dens); i++) {
        const c = this.spawn('ptero', ax + (this.rng() - 0.5) * 300, az + (this.rng() - 0.5) * 300, { home: new THREE.Vector3(ax, 0, az) });
        c.anchor = new THREE.Vector3(ax, 0, az);
      }
    }
    // marine reptiles
    const sea = (minDepth) => (x, z) => w.waterLevel(x, z) - w.height(x, z) > minDepth;
    for (const [x, z] of [[1200, 3700], [3100, 2400], [-2600, 3200], [-3600, 500], [2000, 3000]]) {
      const p = this.findSpot(x, z, 400, sea(16));
      if (p) this.spawn('mosa', p[0], p[1], { home: new THREE.Vector3(p[0], 0, p[1]) });
    }
    for (const I of ISLANDS.slice(0, 3)) {
      for (let i = 0; i < 2; i++) {
        const p = this.findSpot(I.x, I.z, I.r * 2.2, sea(6));
        if (p) this.spawn('plesio', p[0], p[1], { home: new THREE.Vector3(p[0], 0, p[1]) });
      }
    }
    console.log('[creatures]', this.list.length);
  }

  walkable(c, x, z) {
    const w = this.game.world;
    if (Math.abs(x) > 3950 || Math.abs(z) > 3950) return false;
    const h = w.height(x, z);
    const wl = w.waterLevel(x, z);
    if (c.isSwimming || c.spec.swimming) return wl - h > (c.spec.id === 'mosa' ? 8 : 4);
    if (c.isFlying || c.spec.flying) return true;
    const depth = wl - h;
    const maxDepth = c.spec.id === 'brachio' ? 3.5 : c.spec.id === 'trex' ? 1.5 : 0.7;
    if (depth > maxDepth) return false;
    if (h > 560) return false;
    const n = w.normal(x, z, _v);
    return n.y > (c.spec.id === 'raptor' ? 0.62 : 0.74);
  }

  separation(c) {
    _sep.set(0, 0, 0);
    if (c.isFlying) return _sep;
    const k = this._key(c.pos.x, c.pos.z);
    const cell = this.grid.get(k);
    if (!cell) return _sep;
    for (const o of cell) {
      if (o === c || !o.alive || o.isFlying) continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
      const min = (c.radius + o.radius) * 0.9;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        const f = (min - d) / min * 4;
        _sep.x += (dx / d) * f;
        _sep.z += (dz / d) * f;
      }
    }
    return _sep;
  }

  _key(x, z) { return (Math.floor(x / 48) + 200) * 1000 + Math.floor(z / 48) + 200; }

  findPrey(hunter, radius, kinds, preferYoung) {
    let best = null, bd = 1e9;
    for (const c of this.list) {
      if (!c.alive || c === hunter || !kinds.includes(c.spec.id)) continue;
      const d = c.pos.distanceTo(hunter.pos) * (preferYoung && c.juvenile ? 0.5 : 1);
      if (d < radius && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  nearestPredator(c, radius) {
    let best = null, bd = radius;
    for (const o of this.list) {
      if (!o.alive || o.spec.diet !== 'carnivore' || o.isSwimming) continue;
      if (o.spec.id === 'raptor' && c.spec.id === 'brachio') continue;
      const d = o.pos.distanceTo(c.pos);
      if (d < bd && (o.state === 'chase' || o.state === 'flank' || o.state === 'stalk' || d < radius * 0.4)) { bd = d; best = o; }
    }
    return best;
  }

  packAlert(raptor, target) {
    const pack = raptor.herd ? raptor.herd.members : [raptor];
    let i = 0;
    for (const r of pack) {
      if (!r.alive) continue;
      r.target = target;
      r.flankAngle = (i / pack.length) * Math.PI * 2;
      r.setState(i === 0 ? 'stalk' : 'flank', 8);
      i++;
    }
    if (target === 'player') this.game.hud && this.game.hud.toast('You hear chirping in the undergrowth…', 'warn');
    this.game.audio && this.game.audio.creatureCall(raptor.pos, SPECIES.raptor.sound, 0.6);
  }

  roar(c) {
    this.game.audio && this.game.audio.roar(c.pos, c.spec.sound, 1);
    const d = c.pos.distanceTo(this.game.player.pos);
    if (d < 120) this.game.player.shake = Math.max(this.game.player.shake, 0.6 * (1 - d / 120));
  }

  attackSound(c) {
    this.game.audio && this.game.audio.bite(c.pos, c.spec.sound);
  }

  footstep(c, k) {
    const g = this.game;
    const d = c.pos.distanceTo(g.player.pos);
    const big = c.spec.stats.mass > 3000;
    if (big && d < 140) {
      const s = Math.min(1, c.spec.stats.mass / 20000) * (1 - d / 140);
      g.player.shake = Math.max(g.player.shake, s * 0.5);
      g.audio && g.audio.thud(c.pos, s);
    }
    if (g.effects && d < 160 && c.speed > c.stats.speed * 1.2) {
      const b = g.world.biome(c.pos.x, c.pos.z);
      if (b !== 'jungle' && b !== 'snow') g.effects.dust(c.pos, c.spec.length * 0.12 * c.scale);
    }
    if (g.effects && d < 120 && g.world.waterLevel(c.pos.x, c.pos.z) > c.pos.y + 0.2) g.effects.splash(c.pos, 0.4 + c.spec.length * 0.05);
  }

  splash(pos, size) {
    const g = this.game;
    if (g.effects && pos.distanceTo(g.player.pos) < 300) g.effects.splash(pos, size);
  }

  onCreatureHurt(c, amount, from) {
    const g = this.game;
    if (g.effects && c.pos.distanceTo(g.player.pos) < 80) g.effects.blood(_v.copy(c.pos).setY(c.pos.y + c.spec.stats.hip * c.scale), amount);
    if (Math.random() < 0.5) g.audio && g.audio.creatureCall(c.pos, c.spec.sound, 0.8);
  }

  onCreatureDeath(c, from) {
    const g = this.game;
    c.carcass = { meat: Math.ceil(c.spec.stats.mass ** 0.33 * c.scale * 0.8), hide: Math.ceil(c.spec.stats.mass ** 0.25 * c.scale * 0.5), bone: Math.ceil(c.spec.stats.mass ** 0.2 * c.scale * 0.5) };
    if (from === 'player') g.onCreatureKilled && g.onCreatureKilled(c);
    // scavengers / pack feeding
    for (const o of this.list) {
      if (o.alive && o.target === c) { o.feedOn = c; o.setState('eat', 25 + Math.random() * 20); }
    }
  }

  // ---- queries for gameplay
  rayHit(origin, dir, maxDist, out = {}) {
    let best = null, bt = maxDist;
    for (const c of this.list) {
      const dx = c.pos.x - origin.x, dz = c.pos.z - origin.z;
      if (dx * dx + dz * dz > (maxDist + 30) ** 2) continue;
      for (const s of c.hitSpheres(this.hitTmp)) {
        const ox = s.x - origin.x, oy = s.y - origin.y, oz = s.z - origin.z;
        const t = ox * dir.x + oy * dir.y + oz * dir.z;
        if (t < 0 || t > bt) continue;
        const px = ox - dir.x * t, py = oy - dir.y * t, pz = oz - dir.z * t;
        if (px * px + py * py + pz * pz < s.r * s.r) { bt = t; best = c; out.part = s.part; }
      }
    }
    out.creature = best;
    out.t = bt;
    return best ? out : null;
  }

  sphereHit(p, radius) {
    for (const c of this.list) {
      if (!c.alive) continue;
      const dx = c.pos.x - p.x, dz = c.pos.z - p.z;
      if (dx * dx + dz * dz > 900) continue;
      for (const s of c.hitSpheres(this.hitTmp)) {
        const d = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
        if (d < s.r + radius) return { creature: c, part: s.part };
      }
    }
    return null;
  }

  // circles for player collision
  collide(pos, radius) {
    for (const c of this.list) {
      if (c.isFlying || c.isSwimming) continue;
      const dx = pos.x - c.pos.x, dz = pos.z - c.pos.z;
      if (dx * dx + dz * dz > 400) continue;
      if (pos.y > c.pos.y + c.spec.stats.hip * c.scale * 1.3) continue;
      // capsule along the body axis
      const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
      const halfL = c.spec.length * 0.3 * c.scale;
      const along = Math.max(-halfL, Math.min(halfL, dx * ch + dz * sh));
      const cx = c.pos.x + ch * along, cz = c.pos.z + sh * along;
      const ex = pos.x - cx, ez = pos.z - cz;
      const d = Math.hypot(ex, ez);
      const r = radius + c.radius * 0.45;
      if (d < r && d > 1e-3) {
        pos.x = cx + (ex / d) * r;
        pos.z = cz + (ez / d) * r;
        // giants trample
        if (c.spec.id === 'brachio' && c.speed > 0.8 && c.alive) this.game.player.damage(25 * 0.016, 'Brachiosaurus');
      }
    }
  }

  update(dt, camPos) {
    const g = this.game;
    // rebuild spatial grid
    this.grid.clear();
    for (const c of this.list) {
      const k = this._key(c.pos.x, c.pos.z);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(c);
    }
    const lod = g.quality.creatureLod;
    const frustum = this._frustum || (this._frustum = new THREE.Frustum());
    const pm = new THREE.Matrix4().multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    const look = g.camera.getWorldDirection(_v);
    for (const c of this.list) {
      const d = c.pos.distanceTo(camPos);
      // simulation LOD
      c.accum = (c.accum || 0) + dt;
      const rate = d < 300 ? 0 : d < 1200 ? 0.1 : 0.4;
      if (c.accum >= rate) {
        const sdt = Math.min(0.5, c.accum);
        c.accum = 0;
        c.think(sdt);
        c.move(sdt);
      }
      const vis = d < 1700 * lod;
      c.mesh.visible = vis;
      if (vis) {
        const sphere = c.mesh.geometry.boundingSphere;
        const inView = frustum.intersectsSphere(new THREE.Sphere(c.pos, sphere.radius * c.scale + 5));
        const detail = inView && d < 450 * lod;
        c.animate(dt, detail || (inView && d < 900 * lod && (c.frameSkip = ((c.frameSkip || 0) + 1) % 3) === 0));
        c.mesh.castShadow = d < 160;
      }
      // discovery
      if (!c.discovered && c.alive && d < 90 && g.discover) {
        const dir = _sep.copy(c.pos).sub(camPos).normalize();
        if (dir.dot(look) > 0.85) { c.discovered = true; g.discover(c.spec); }
      }
      // corpse removal
      if (!c.alive && c.deadTime > 600) { c.remove = true; }
    }
    if (this.list.some((c) => c.remove)) {
      for (const c of this.list) if (c.remove) this.group.remove(c.mesh);
      this.list = this.list.filter((c) => !c.remove);
    }
    // respawn to keep the world populated
    this.respawnTimer = (this.respawnTimer || 0) + dt;
    if (this.respawnTimer > 120) {
      this.respawnTimer = 0;
      const counts = {};
      for (const c of this.list) if (c.alive) counts[c.spec.id] = (counts[c.spec.id] || 0) + 1;
      if ((counts.trex || 0) < 3) {
        const p = this.findSpot(camPos.x, camPos.z, 1500, (x, z) => Math.hypot(x - camPos.x, z - camPos.z) > 700 && this.walkable({ spec: SPECIES.trex }, x, z));
        if (p) this.spawn('trex', p[0], p[1]);
      }
      if ((counts.raptor || 0) < 10) {
        const p = this.findSpot(camPos.x, camPos.z, 1500, (x, z) => Math.hypot(x - camPos.x, z - camPos.z) > 600 && this.walkable({ spec: SPECIES.raptor }, x, z));
        if (p) {
          const H = { center: new THREE.Vector3(p[0], 0, p[1]), members: [], leader: null };
          for (let i = 0; i < 4; i++) { const c = this.spawn('raptor', p[0] + i * 3, p[1], { herd: H, home: H.center }); H.members.push(c); H.leader = H.leader || c; }
        }
      }
    }
  }

  nearestCarcass(pos, maxD) {
    let best = null, bd = maxD;
    for (const c of this.list) {
      if (c.alive || !c.carcass) continue;
      const d = c.pos.distanceTo(pos) - c.radius * 0.6;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}
