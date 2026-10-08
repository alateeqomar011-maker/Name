// Streams instanced vegetation and rocks in 128m cells around the player.
// Every tree/rock/bush is also a gatherable resource node and (for big ones) a collider.
import * as THREE from 'three';
import { BIOME, HALF } from './worldgen.js';
import { hash2, mulberry32, clamp } from '../core/noise.js';

const CELL = 128;
const NC = 4096 / CELL; // 32

const TREE_SETS = {
  [BIOME.GRASSLAND]: [['oak', 0.4], ['oak2', 0.15], ['araucaria', 0.25], ['cycad', 0.1], ['treefern', 0.1]],
  [BIOME.FOREST]: [['oak', 0.35], ['oak2', 0.25], ['conifer', 0.12], ['treefern', 0.2], ['araucaria', 0.08]],
  [BIOME.PINEFOREST]: [['conifer', 0.5], ['conifer2', 0.38], ['araucaria', 0.12]],
  [BIOME.JUNGLE]: [['kapok', 0.22], ['palm', 0.12], ['treefern', 0.36], ['cycad', 0.12], ['oak2', 0.18]],
  [BIOME.MOUNTAIN]: [['conifer', 0.6], ['conifer2', 0.25], ['araucaria', 0.15]],
  [BIOME.SNOW]: [['conifer2', 1]],
  [BIOME.SWAMP]: [['cypress', 0.6], ['treefern', 0.22], ['dead', 0.18]],
  [BIOME.ISLAND]: [['palm', 0.45], ['palm2', 0.35], ['treefern', 0.2]],
  [BIOME.BEACH]: [['palm', 0.5], ['palm2', 0.5]],
  [BIOME.DESERT]: [['dead', 0.55], ['cycad', 0.45]],
  [BIOME.CANYON]: [['dead', 0.5], ['cycad', 0.5]],
  [BIOME.VOLCANIC]: [['dead', 1]],
};
const GROUND_SETS = {
  [BIOME.GRASSLAND]: [['shrub', 0.25], ['fern', 0.3], ['berry', 0.04], ['scrub', 0.02], ['horsetail', 0.05], [null, 1.6]],
  [BIOME.FOREST]: [['fern', 0.55], ['shrub', 0.2], ['berry', 0.05], ['horsetail', 0.1], [null, 0.4]],
  [BIOME.PINEFOREST]: [['fern', 0.5], ['shrub', 0.15], ['berry', 0.08], [null, 0.9]],
  [BIOME.JUNGLE]: [['jungleshrub', 0.4], ['fern', 0.45], ['horsetail', 0.12], ['berry', 0.08], [null, 0.2]],
  [BIOME.MOUNTAIN]: [['shrub', 0.2], ['fern', 0.15], ['scrub', 0.1], [null, 2.2]],
  [BIOME.SWAMP]: [['horsetail', 0.5], ['fern', 0.3], ['jungleshrub', 0.1], [null, 0.6]],
  [BIOME.ISLAND]: [['jungleshrub', 0.4], ['fern', 0.2], ['berry', 0.1], [null, 0.8]],
  [BIOME.BEACH]: [['scrub', 0.1], [null, 4]],
  [BIOME.DESERT]: [['scrub', 0.3], [null, 4]],
  [BIOME.CANYON]: [['scrub', 0.2], [null, 4]],
  [BIOME.VOLCANIC]: [['scrub', 0.05], [null, 6]],
  [BIOME.SNOW]: [[null, 1]],
};
const TREE_DENSITY = {
  [BIOME.GRASSLAND]: 1, [BIOME.FOREST]: 1, [BIOME.PINEFOREST]: 1, [BIOME.JUNGLE]: 1.15, [BIOME.MOUNTAIN]: 0.8,
  [BIOME.SNOW]: 0.2, [BIOME.SWAMP]: 0.9, [BIOME.ISLAND]: 0.8, [BIOME.BEACH]: 1, [BIOME.DESERT]: 1, [BIOME.CANYON]: 1, [BIOME.VOLCANIC]: 1,
};
const LEAF_TINT = {
  [BIOME.GRASSLAND]: [1.0, 1.0, 0.85], [BIOME.FOREST]: [0.85, 0.95, 0.8], [BIOME.PINEFOREST]: [0.8, 0.9, 0.85],
  [BIOME.JUNGLE]: [0.9, 1.08, 0.8], [BIOME.SWAMP]: [0.85, 0.88, 0.65], [BIOME.ISLAND]: [1, 1.05, 0.8],
  [BIOME.MOUNTAIN]: [0.8, 0.9, 0.85], [BIOME.DESERT]: [1.1, 0.95, 0.6], [BIOME.CANYON]: [1.1, 0.95, 0.6],
};
const ROCK_TINT = {
  [BIOME.DESERT]: [1.35, 0.85, 0.6], [BIOME.CANYON]: [1.3, 0.8, 0.55], [BIOME.VOLCANIC]: [0.45, 0.42, 0.42],
  [BIOME.JUNGLE]: [0.85, 1.0, 0.8], [BIOME.FOREST]: [0.9, 1.0, 0.88], [BIOME.SWAMP]: [0.8, 0.85, 0.7],
  [BIOME.BEACH]: [1.15, 1.1, 1.0], [BIOME.SNOW]: [1.05, 1.05, 1.1],
};

const RESOURCE_OF = {
  oak: 'wood', oak2: 'wood', conifer: 'wood', conifer2: 'wood', kapok: 'wood', palm: 'wood', palm2: 'wood', treefern: 'wood',
  cypress: 'wood', araucaria: 'wood', dead: 'wood', cycad: 'fiber', fern: 'fiber', shrub: 'fiber', jungleshrub: 'fiber',
  berry: 'berries', horsetail: 'fiber', scrub: 'fiber', rock: 'stone', ore: 'ore',
};

function pick(set, r) {
  let tot = 0;
  for (const [, w] of set) tot += w;
  let x = r * tot;
  for (const [t, w] of set) { x -= w; if (x <= 0) return t; }
  return set[set.length - 1][0];
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Vegetation {
  constructor(world, scene, flora, quality) {
    this.world = world;
    this.scene = scene;
    this.flora = flora;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);
    this.cells = new Map();
    this.depleted = new Map(); // key -> regrow time (game seconds), Infinity = permanently cleared
    this.exclusions = []; // {x,z,r}
    this.time = 0;
  }

  key(cx, cz) { return cz * NC + cx; }

  addExclusion(x, z, r) {
    this.exclusions.push({ x, z, r });
    // Clear existing items in that footprint
    this.forEachNear(x, z, r + 2, (it) => {
      if (Math.hypot(it.x - x, it.z - z) < r) this._deplete(it, Infinity);
    });
  }
  _excluded(x, z) {
    for (const e of this.exclusions) if ((x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r) return true;
    return false;
  }

  update(px, pz, dt, gameTime) {
    this.time = gameTime;
    const rFar = this.quality.treeDist;
    const rNear = this.quality.groundDist;
    const ccx = Math.floor((px + HALF) / CELL), ccz = Math.floor((pz + HALF) / CELL);
    const span = Math.ceil(rFar / CELL) + 1;
    let budget = 2;
    const want = [];
    for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < 0 || cz < 0 || cx >= NC || cz >= NC) continue;
      const wx = -HALF + (cx + 0.5) * CELL, wz = -HALF + (cz + 0.5) * CELL;
      const d = Math.max(0, Math.hypot(wx - px, wz - pz) - CELL * 0.7);
      want.push([d, cx, cz]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [d, cx, cz] of want) {
      const k = this.key(cx, cz);
      let cell = this.cells.get(k);
      if (d < rFar && !cell) {
        if (budget <= 0) continue;
        cell = this._buildCell(cx, cz);
        this.cells.set(k, cell);
        budget--;
      }
      if (cell) {
        if (d < rNear && !cell.ground) {
          if (budget <= 0) continue;
          this._buildGround(cell);
          budget--;
        } else if (d > rNear + 60 && cell.ground) {
          this._disposeLayer(cell.ground);
          cell.ground = null;
        }
        const shadow = d < 90;
        if (cell.shadow !== shadow) {
          cell.shadow = shadow;
          for (const m of cell.trees.meshes) m.castShadow = shadow;
        }
      }
    }
    // Unload far cells
    for (const [k, cell] of this.cells) {
      const wx = -HALF + (cell.cx + 0.5) * CELL, wz = -HALF + (cell.cz + 0.5) * CELL;
      const d = Math.hypot(wx - px, wz - pz) - CELL * 0.7;
      if (d > rFar + 120) {
        this._disposeLayer(cell.trees);
        if (cell.ground) this._disposeLayer(cell.ground);
        this.cells.delete(k);
      }
    }
    // Regrowth
    this._regrowTimer = (this._regrowTimer || 0) + dt;
    if (this._regrowTimer > 5) {
      this._regrowTimer = 0;
      for (const cell of this.cells.values()) {
        for (const layer of [cell.trees, cell.ground]) {
          if (!layer) continue;
          for (const it of layer.items) {
            if (!it.alive && it.regrowAt !== Infinity && gameTime >= it.regrowAt) this._restore(it);
          }
        }
      }
    }
  }

  _disposeLayer(layer) {
    for (const m of layer.meshes) {
      this.group.remove(m);
      m.dispose();
    }
  }

  _makeLayer(cell, placements, ground) {
    // placements: [{type, x,y,z, rot, scale, tint, tilt, kind}]
    const byType = new Map();
    for (const p of placements) {
      if (!byType.has(p.type)) byType.set(p.type, []);
      byType.get(p.type).push(p);
    }
    const layer = { meshes: [], items: [] };
    const F = this.flora;
    for (const [type, list] of byType) {
      let parts;
      if (type === 'rock' || type === 'ore') {
        // rocks can use 3 variants; split into sublists
        const variants = type === 'ore' ? [F.oreRock] : F.rocks;
        const groups = variants.map(() => []);
        list.forEach((p, i) => groups[p.variant % variants.length].push(p));
        groups.forEach((g, vi) => {
          if (!g.length) return;
          const mesh = new THREE.InstancedMesh(variants[vi], type === 'ore' ? F.oreMat : F.rockMat, g.length);
          g.forEach((p, i) => {
            _q.setFromEuler(_e.set(p.tilt, p.rot, p.tilt * 0.5));
            _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.scale * p.sx, p.scale, p.scale * p.sz));
            mesh.setMatrixAt(i, _m);
            mesh.setColorAt(i, _c.setRGB(p.tint[0], p.tint[1], p.tint[2]));
            layer.items.push(this._item(cell, p, mesh, i, null, ground));
          });
          mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
          this.group.add(mesh);
          layer.meshes.push(mesh);
        });
        continue;
      }
      parts = F.types[type];
      const meshes = [];
      if (parts.trunk) meshes.push(new THREE.InstancedMesh(parts.trunk, F.trunkMat, list.length));
      if (parts.leaves) { const lm = new THREE.InstancedMesh(parts.leaves, F.leafMat, list.length); lm.customDepthMaterial = F.leafDepthMat; meshes.push(lm); }
      list.forEach((p, i) => {
        _q.setFromEuler(_e.set(p.tilt, p.rot, -p.tilt * 0.6));
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.scale, p.scale, p.scale));
        for (const m of meshes) {
          m.setMatrixAt(i, _m);
          if (m.material === F.leafMat) m.setColorAt(i, _c.setRGB(p.tint[0], p.tint[1], p.tint[2]));
          else m.setColorAt(i, _c.setRGB(p.btint, p.btint, p.btint));
        }
        layer.items.push(this._item(cell, p, meshes, i, parts, ground));
      });
      for (const m of meshes) {
        m.castShadow = !ground && cell.shadow;
        m.receiveShadow = true;
        m.computeBoundingSphere();
        this.group.add(m);
        layer.meshes.push(m);
      }
    }
    // apply depletion state
    for (const it of layer.items) {
      const t = this.depleted.get(it.key);
      if (t !== undefined) {
        if (t === Infinity || t > this.time) this._hide(it, t);
        else this.depleted.delete(it.key);
      }
    }
    return layer;
  }

  _item(cell, p, mesh, i, parts, ground) {
    const res = RESOURCE_OF[p.type];
    return {
      key: `${cell.cx},${cell.cz}:${ground ? 'g' : 't'}:${p.idx}`,
      type: p.type, kind: p.kind, resource: res,
      x: p.x, y: p.y, z: p.z, scale: p.scale,
      radius: parts ? parts.radius * p.scale : (p.kind === 'rock' || p.kind === 'ore' ? p.scale * 0.85 : 0),
      height: parts && parts.height ? parts.height * p.scale : p.scale,
      meshes: Array.isArray(mesh) ? mesh : [mesh], index: i, alive: true, regrowAt: 0,
      matrix: null,
    };
  }

  _hide(it, regrowAt) {
    if (!it.alive) return;
    it.alive = false;
    it.regrowAt = regrowAt;
    for (const m of it.meshes) {
      if (!it.matrix) { it.matrix = new THREE.Matrix4(); m.getMatrixAt(it.index, it.matrix); }
      m.setMatrixAt(it.index, ZERO);
      m.instanceMatrix.needsUpdate = true;
    }
  }
  _restore(it) {
    it.alive = true;
    this.depleted.delete(it.key);
    for (const m of it.meshes) {
      m.setMatrixAt(it.index, it.matrix);
      m.instanceMatrix.needsUpdate = true;
    }
  }
  _deplete(it, regrowAt) {
    this.depleted.set(it.key, regrowAt);
    this._hide(it, regrowAt);
  }

  // Remove a resource node after gathering. Returns true if removed.
  harvest(it, regrowSeconds = 600) {
    if (!it.alive) return false;
    this._deplete(it, this.time + regrowSeconds);
    return true;
  }

  _buildCell(cx, cz) {
    const W = this.world;
    const cell = { cx, cz, trees: null, ground: null, shadow: false };
    const x0 = -HALF + cx * CELL, z0 = -HALF + cz * CELL;
    const placements = [];
    const rand = mulberry32((cx * 7919 + cz * 104729) ^ 0x5bd1e995);
    const density = this.quality.treeDensity;
    // Trees: jittered grid
    const sp = 7;
    let idx = 0;
    for (let gz = 0; gz < CELL / sp; gz++) {
      for (let gx = 0; gx < CELL / sp; gx++) {
        idx++;
        const x = x0 + (gx + rand()) * sp, z = z0 + (gz + rand()) * sp;
        const r1 = rand(), r2 = rand(), r3 = rand(), r4 = rand();
        const b = W.getBiome(x, z);
        const set = TREE_SETS[b];
        if (!set) continue;
        const veg = W.getVeg(x, z) * (TREE_DENSITY[b] || 1);
        if (r1 > veg * veg * 0.55 * density + 0.002) continue;
        const h = W.getHeight(x, z);
        if (h < 0.3 && b !== BIOME.SWAMP) continue;
        if (h < -0.5) continue;
        const wl = W.waterLevelAt(x, z);
        if (h < wl + 0.2 && b !== BIOME.SWAMP) continue;
        const n = W.getNormal(x, z, _p);
        if (n.y < 0.78) continue;
        if (this._excluded(x, z)) continue;
        const type = pick(set, r2);
        const lt = LEAF_TINT[b] || [1, 1, 1];
        const v = 0.85 + r4 * 0.3;
        placements.push({
          type, kind: 'tree', idx, x, y: h - 0.15, z, rot: r3 * Math.PI * 2, scale: 0.75 + r4 * 0.55, tilt: (r1 - 0.5) * 0.08,
          tint: [lt[0] * v, lt[1] * v * (0.95 + r2 * 0.1), lt[2] * v], btint: 0.8 + r3 * 0.3,
        });
      }
    }
    // Rocks & ore
    const rsp = 14;
    for (let gz = 0; gz < CELL / rsp; gz++) {
      for (let gx = 0; gx < CELL / rsp; gx++) {
        idx++;
        const x = x0 + (gx + rand()) * rsp, z = z0 + (gz + rand()) * rsp;
        const r1 = rand(), r2 = rand(), r3 = rand();
        const b = W.getBiome(x, z);
        const h = W.getHeight(x, z);
        if (h < -2) continue;
        const n = W.getNormal(x, z, _p);
        let p = 0.025;
        if (b === BIOME.MOUNTAIN || b === BIOME.SNOW) p = 0.12;
        else if (b === BIOME.DESERT || b === BIOME.CANYON || b === BIOME.VOLCANIC) p = 0.1;
        else if (b === BIOME.BEACH || b === BIOME.RIVER) p = 0.05;
        else if (b === BIOME.OCEAN) p = 0.01;
        p += (1 - n.y) * 0.25;
        if (r1 > p) continue;
        if (this._excluded(x, z)) continue;
        const oreChance = (b === BIOME.MOUNTAIN || b === BIOME.CANYON || b === BIOME.VOLCANIC || b === BIOME.DESERT || b === BIOME.SNOW) ? 0.16 : 0.03;
        const ore = r2 < oreChance;
        const big = r3 > 0.85;
        const scale = ore ? 0.9 + r3 * 0.5 : (big ? 2.4 + r3 * 2.5 : 0.6 + r3 * 1.4);
        const t = ROCK_TINT[b] || [1, 1, 1];
        placements.push({
          type: ore ? 'ore' : 'rock', kind: ore ? 'ore' : 'rock', idx, variant: Math.floor(r2 * 3 * 7) % 3,
          x, y: h - scale * 0.15, z, rot: r1 * 40, scale, sx: 0.8 + r2 * 0.6, sz: 0.8 + r3 * 0.5, tilt: (r2 - 0.5) * 0.3,
          tint: [t[0] * (0.9 + r3 * 0.2), t[1] * (0.9 + r3 * 0.2), t[2] * (0.9 + r3 * 0.2)],
        });
      }
    }
    cell.trees = this._makeLayer(cell, placements, false);
    return cell;
  }

  _buildGround(cell) {
    const W = this.world;
    const x0 = -HALF + cell.cx * CELL, z0 = -HALF + cell.cz * CELL;
    const rand = mulberry32((cell.cx * 3571 + cell.cz * 2903) ^ 0x1234567);
    const placements = [];
    const sp = 4.2 / Math.sqrt(this.quality.groundDensity);
    let idx = 0;
    for (let gz = 0; gz < CELL / sp; gz++) {
      for (let gx = 0; gx < CELL / sp; gx++) {
        idx++;
        const x = x0 + (gx + rand()) * sp, z = z0 + (gz + rand()) * sp;
        const r1 = rand(), r2 = rand(), r3 = rand();
        const b = W.getBiome(x, z);
        const set = GROUND_SETS[b];
        if (!set) continue;
        const type = pick(set, r1);
        if (!type) continue;
        const h = W.getHeight(x, z);
        if (h < 0.35 && !(b === BIOME.SWAMP && type === 'horsetail' && h > -0.4)) continue;
        if (b !== BIOME.SWAMP && h < W.waterLevelAt(x, z) + 0.1) continue;
        const n = W.getNormal(x, z, _p);
        if (n.y < 0.72) continue;
        if (this._excluded(x, z)) continue;
        const lt = LEAF_TINT[b] || [1, 1, 1];
        const v = 0.8 + r3 * 0.35;
        placements.push({
          type, kind: type === 'berry' ? 'bush' : 'plant', idx, x, y: h - 0.05, z, rot: r2 * Math.PI * 2,
          scale: 0.7 + r3 * 0.7, tilt: (r2 - 0.5) * 0.2, tint: [lt[0] * v, lt[1] * v, lt[2] * v], btint: 1,
        });
      }
    }
    cell.ground = this._makeLayer(cell, placements, true);
  }

  // Iterate items near a point
  forEachNear(x, z, r, fn) {
    const c0x = Math.floor((x - r + HALF) / CELL), c1x = Math.floor((x + r + HALF) / CELL);
    const c0z = Math.floor((z - r + HALF) / CELL), c1z = Math.floor((z + r + HALF) / CELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const cell = this.cells.get(this.key(cx, cz));
      if (!cell) continue;
      for (const layer of [cell.trees, cell.ground]) {
        if (!layer) continue;
        for (const it of layer.items) {
          if (Math.abs(it.x - x) > r || Math.abs(it.z - z) > r) continue;
          fn(it);
        }
      }
    }
  }

  nearestResource(x, z, maxD, filter) {
    let best = null, bd = maxD * maxD;
    this.forEachNear(x, z, maxD + 3, (it) => {
      if (!it.alive || !it.resource) return;
      if (filter && !filter(it)) return;
      const d = (it.x - x) ** 2 + (it.z - z) ** 2 - (it.radius * it.radius);
      if (d < bd) { bd = d; best = it; }
    });
    return best;
  }

  // Push a circle (x,z,r) out of solid trunks and rocks. Returns adjusted {x,z}
  collide(pos, r, yFeet = null, treesOnly = false) {
    this.forEachNear(pos.x, pos.z, r + 6, (it) => {
      if (!it.alive || it.radius < 0.25) return;
      const bush = (it.kind === 'plant' || it.kind === 'bush') && it.radius >= 0.3;
      if (treesOnly ? it.kind === 'tree' : (it.kind === 'tree' || it.kind === 'rock' || it.kind === 'ore' || bush)) {
        if (yFeet !== null && it.kind !== 'tree' && yFeet > it.y + it.scale * 0.9) return;
        const rr = (it.kind === 'tree' ? it.radius * 0.9 : bush ? it.radius * 0.8 : it.radius) + r;
        const dx = pos.x - it.x, dz = pos.z - it.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = it.x + (dx / d) * rr;
          pos.z = it.z + (dz / d) * rr;
          pos.hit = true;
        }
      }
    });
    return pos;
  }

  // Burn trees (forest fire): darken leaves of trees near point
  scorch(x, z, r) {
    this.forEachNear(x, z, r, (it) => {
      if (it.kind !== 'tree' || !it.alive) return;
      if (Math.hypot(it.x - x, it.z - z) > r) return;
      const m = it.meshes[it.meshes.length - 1];
      if (m.instanceColor) {
        m.setColorAt(it.index, _c.setRGB(0.18, 0.12, 0.08));
        m.instanceColor.needsUpdate = true;
      }
      it.burnt = true;
    });
  }

  serialize() {
    const out = [];
    for (const [k, t] of this.depleted) out.push([k, t === Infinity ? -1 : Math.round(t)]);
    return out;
  }
  deserialize(arr) {
    this.depleted.clear();
    for (const [k, t] of arr || []) this.depleted.set(k, t < 0 ? Infinity : t);
  }
}
