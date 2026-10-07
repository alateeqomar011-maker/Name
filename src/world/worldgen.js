// Pure, deterministic world generation. Shared by the generation workers and the main thread.
// The world is a 4096m x 4096m continent surrounded by ocean with offshore islands.
import { Simplex, clamp, lerp, smoothstep } from '../core/noise.js';

export const WORLD_SIZE = 4096;
export const HALF = WORLD_SIZE / 2;
export const GRID = 1024; // heightfield resolution (cells per side)
export const CELL = WORLD_SIZE / GRID; // 4m per cell
export const SEA_LEVEL = 0;

export const BIOME = {
  OCEAN: 0, BEACH: 1, GRASSLAND: 2, FOREST: 3, JUNGLE: 4, MOUNTAIN: 5, SNOW: 6,
  VOLCANIC: 7, DESERT: 8, CANYON: 9, SWAMP: 10, ISLAND: 11, RIVER: 12, PINEFOREST: 13,
};
export const BIOME_NAMES = [
  'Ocean', 'Beach', 'Grassland', 'Forest', 'Jungle', 'Mountains', 'Snowfields',
  'Volcanic Wastes', 'Desert', 'Canyon', 'Swamp', 'Tropical Island', 'River', 'Pine Forest',
];

// Macro regions. Each has a biome type, a centre, a radius of influence and a display name.
export const REGIONS = [
  { id: 'plains', type: BIOME.GRASSLAND, x: 0, z: 150, r: 720, name: 'Verdant Plains' },
  { id: 'meadows', type: BIOME.GRASSLAND, x: 720, z: 820, r: 430, name: 'Sunset Meadows' },
  { id: 'pines', type: BIOME.PINEFOREST, x: -700, z: -650, r: 520, name: 'Whispering Pines' },
  { id: 'elder', type: BIOME.FOREST, x: 560, z: -330, r: 420, name: 'Elder Woods' },
  { id: 'fernhollow', type: BIOME.FOREST, x: -760, z: 960, r: 440, name: 'Fernhollow' },
  { id: 'jungle', type: BIOME.JUNGLE, x: -1300, z: 140, r: 600, name: 'Emerald Jungle' },
  { id: 'titan', type: BIOME.MOUNTAIN, x: -180, z: -1380, r: 640, name: 'Titan Range' },
  { id: 'ember', type: BIOME.VOLCANIC, x: 1060, z: -1040, r: 440, name: 'Ember Wastes' },
  { id: 'badlands', type: BIOME.DESERT, x: 1340, z: 430, r: 600, name: 'Red Canyon Badlands' },
  { id: 'mirefen', type: BIOME.SWAMP, x: 140, z: 1340, r: 500, name: 'Mirefen Marsh' },
];

export const VOLCANO = { x: 1080, z: -1080 };

export const ISLANDS = [
  { id: 'isla-sombra', x: -1720, z: 1560, r: 210, peak: 120, name: 'Isla Sombra', mystery: true },
  { id: 'coral-key', x: 1760, z: 1500, r: 150, peak: 30, name: 'Coral Key' },
  { id: 'gull-rock', x: -1820, z: -1520, r: 150, peak: 60, name: 'Gull Rock' },
  { id: 'ash-isle', x: 1700, z: -1700, r: 130, peak: 45, name: 'Ash Isle' },
  { id: 'turtle-isle', x: 40, z: 1930, r: 110, peak: 26, name: 'Turtle Isle' },
  { id: 'palm-atoll', x: 1940, z: -180, r: 100, peak: 22, name: 'Palm Atoll' },
];

// River control points (from source to sea).
const RIVER_DEFS = [
  { name: 'Serpent River', pts: [[-300, -1120], [-260, -820], [-160, -470], [-40, -170], [150, 180], [300, 560], [260, 930], [150, 1250], [90, 1500], [80, 1900]] },
  { name: 'Jade River', pts: [[-520, -1180], [-800, -900], [-1060, -620], [-1250, -260], [-1360, 120], [-1560, 400], [-1760, 520], [-2000, 560]] },
  { name: 'Rust River', pts: [[600, -620], [840, -260], [1040, 100], [1280, 360], [1560, 600], [1780, 720], [2040, 760]] },
  { name: 'Fern Creek', pts: [[-560, 640], [-880, 1120], [-1100, 1480], [-1260, 1800], [-1340, 2040]] },
];

export class WorldGen {
  constructor(seed = 1337) {
    this.seed = seed;
    this.n1 = new Simplex(seed);
    this.n2 = new Simplex(seed + 101);
    this.n3 = new Simplex(seed + 202);
    this.n4 = new Simplex(seed + 303);
    this.weights = new Float32Array(REGIONS.length);
    this._buildRivers();
  }

  // ---------- Base terrain (without rivers) ----------
  base(x, z, out) {
    const n1 = this.n1, n2 = this.n2, n3 = this.n3;
    // domain warp for organic region borders
    const wx = x + n2.fbm(x * 0.0007, z * 0.0007, 3) * 240;
    const wz = z + n2.fbm(x * 0.0007 + 31.7, z * 0.0007 - 17.3, 3) * 240;

    // Region weights
    const w = this.weights;
    let wsum = 0.015, best = -1, bestW = 0;
    for (let i = 0; i < REGIONS.length; i++) {
      const R = REGIONS[i];
      const dx = wx - R.x, dz = wz - R.z;
      const d2 = (dx * dx + dz * dz) / (R.r * R.r);
      const wi = Math.exp(-d2 * 1.6);
      w[i] = wi;
      wsum += wi;
      if (wi > bestW) { bestW = wi; best = i; }
    }

    let land = 0.015 * this._grass(wx, wz);
    for (let i = 0; i < REGIONS.length; i++) {
      if (w[i] < 0.002) continue;
      land += w[i] * this._regionHeight(REGIONS[i].type, x, z, wx, wz);
    }
    land /= wsum;
    land += n1.fbm(x * 0.021, z * 0.021, 2) * 1.2;

    // Volcano cone (additive)
    const dvx = x - VOLCANO.x, dvz = z - VOLCANO.z;
    const dv = Math.sqrt(dvx * dvx + dvz * dvz);
    if (dv < 640) {
      let cone = 330 * Math.pow(1 - dv / 640, 1.55);
      cone += n3.fbm(x * 0.01, z * 0.01, 3) * 10 * (1 - dv / 640);
      if (dv < 95) cone -= Math.pow(1 - dv / 95, 1.6) * 90; // crater
      land += cone;
    }

    // Continent mask
    const d = Math.sqrt(wx * wx + wz * wz);
    const landR = 1630 + n1.fbm(wx * 0.0011, wz * 0.0011, 4) * 280;
    let cont = smoothstep(0, 1, (landR - d) / 220 + 0.35);

    let h;
    const oceanFloor = -6 - clamp((d - landR) * 0.12, 0, 70) + n3.noise(x * 0.004, z * 0.004) * 3;
    h = lerp(oceanFloor, land, cont);

    // Islands
    let islandW = 0;
    for (let i = 0; i < ISLANDS.length; i++) {
      const I = ISLANDS[i];
      const dx = x - I.x, dz = z - I.z;
      const di = Math.sqrt(dx * dx + dz * dz);
      if (di > I.r * 1.8) continue;
      const shape = 1 - di / (I.r * (1 + 0.28 * n2.fbm(x * 0.008, z * 0.008, 3)));
      if (shape <= -0.6) continue;
      const lift = smoothstep(-0.35, 0.45, shape);
      let ih = -6 + lift * (8 + I.peak * Math.pow(clamp(shape, 0, 1), 1.4));
      ih += n3.fbm(x * 0.02, z * 0.02, 3) * 3 * lift;
      if (I.mystery) ih += Math.pow(n1.ridged(x * 0.01, z * 0.01, 3), 2) * 40 * lift;
      if (ih > h) { h = ih; islandW = lift; }
    }

    if (out) {
      out.region = best;
      out.cont = cont;
      out.island = islandW;
      out.wx = wx; out.wz = wz;
    }
    return h;
  }

  _grass(wx, wz) {
    return 14 + this.n1.fbm(wx * 0.0018, wz * 0.0018, 4) * 20 + this.n2.fbm(wx * 0.006, wz * 0.006, 3) * 4;
  }

  _regionHeight(type, x, z, wx, wz) {
    const n1 = this.n1, n2 = this.n2, n3 = this.n3, n4 = this.n4;
    switch (type) {
      case BIOME.GRASSLAND:
        return this._grass(wx, wz);
      case BIOME.FOREST:
        return 30 + n1.fbm(wx * 0.0025, wz * 0.0025, 5) * 34 + n2.ridged(wx * 0.004, wz * 0.004, 4) * 26;
      case BIOME.PINEFOREST:
        return 50 + n1.fbm(wx * 0.0022, wz * 0.0022, 5) * 45 + n2.ridged(wx * 0.0035, wz * 0.0035, 4) * 50;
      case BIOME.JUNGLE: {
        const k = n3.ridged(wx * 0.0065, wz * 0.0065, 4);
        return 20 + n1.fbm(wx * 0.003, wz * 0.003, 4) * 22 + Math.pow(k, 3.2) * 120;
      }
      case BIOME.MOUNTAIN: {
        const r = n4.ridged(wx * 0.0013, wz * 0.0013, 6);
        return 70 + Math.pow(r, 1.5) * 470 + n1.fbm(wx * 0.01, wz * 0.01, 3) * 8;
      }
      case BIOME.VOLCANIC:
        return 40 + n1.fbm(wx * 0.003, wz * 0.003, 4) * 22 + n2.ridged(wx * 0.009, wz * 0.009, 3) * 10;
      case BIOME.DESERT: {
        const m = n3.fbm(wx * 0.0021, wz * 0.0021, 4) * 0.5 + 0.5;
        const v = 20 + m * 150;
        const step = 24;
        const f = v / step;
        const fl = Math.floor(f);
        const terr = fl * step + smoothstep(0.78, 1, f - fl) * step;
        const c = Math.abs(n4.fbm(wx * 0.0017 + 5.1, wz * 0.0017 - 3.3, 3));
        const carve = smoothstep(0.015, 0.11, c);
        return lerp(9 + n1.noise(wx * 0.02, wz * 0.02) * 1.5, terr, carve);
      }
      case BIOME.SWAMP:
        return 1.1 + n1.fbm(wx * 0.008, wz * 0.008, 4) * 2.8 + n2.fbm(wx * 0.03, wz * 0.03, 2) * 0.6;
      default:
        return this._grass(wx, wz);
    }
  }

  // ---------- Rivers ----------
  _buildRivers() {
    this.rivers = [];
    const tmp = {};
    for (let ri = 0; ri < RIVER_DEFS.length; ri++) {
      const def = RIVER_DEFS[ri];
      const pts = def.pts;
      const samples = [];
      // Catmull-Rom densify
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const steps = Math.max(2, Math.ceil(segLen / 10));
        for (let s = 0; s < steps; s++) {
          const t = s / steps, t2 = t * t, t3 = t2 * t;
          const cx = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
          const cz = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
          samples.push([cx, cz]);
        }
      }
      samples.push(pts[pts.length - 1].slice());
      // meander
      for (let i = 1; i < samples.length - 1; i++) {
        const a = samples[i - 1], b = samples[i + 1];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l, nz = dx / l;
        const m = this.n3.fbm(i * 0.035 + ri * 10, ri * 3.3, 3) * 38;
        samples[i][0] += nx * m;
        samples[i][1] += nz * m;
      }
      // Level profile: non-increasing, below the terrain
      const n = samples.length;
      const level = new Float32Array(n);
      const width = new Float32Array(n);
      let prev = Infinity;
      let end = n;
      for (let i = 0; i < n; i++) {
        const [x, z] = samples[i];
        const hb = this.base(x, z, tmp);
        let L = Math.min(prev, hb - 2.2);
        if (L < 0.15) L = 0.15;
        level[i] = L;
        prev = L;
        width[i] = lerp(7, 30, Math.pow(i / (n - 1), 0.8));
        if (hb < -3 && end === n) end = Math.min(n, i + 3);
      }
      const river = {
        name: def.name,
        x: new Float32Array(end), z: new Float32Array(end),
        level: level.slice(0, end), width: width.slice(0, end),
        waterfalls: [],
      };
      for (let i = 0; i < end; i++) { river.x[i] = samples[i][0]; river.z[i] = samples[i][1]; }
      // Waterfalls: steep drops
      let i = 1;
      while (i < end) {
        const drop = river.level[i - 1] - river.level[i];
        if (drop > 2.5) {
          const top = river.level[i - 1];
          let j = i;
          while (j + 1 < end && river.level[j] - river.level[j + 1] > 1.5) j++;
          const total = top - river.level[j];
          if (total >= 7) {
            river.waterfalls.push({ i0: i - 1, i1: j, top, bottom: river.level[j], x: river.x[i], z: river.z[i], height: total });
          }
          i = j + 1;
        } else i++;
      }
      this.rivers.push(river);
    }
    // Segment bucket grid for fast distance queries
    this.rbCell = 128;
    this.rbN = Math.ceil(WORLD_SIZE / this.rbCell);
    this.rbuckets = new Array(this.rbN * this.rbN);
    for (let ri = 0; ri < this.rivers.length; ri++) {
      const R = this.rivers[ri];
      for (let i = 0; i < R.x.length - 1; i++) {
        const reach = R.width[i] * 0.5 + 30 + R.width[i] + 12;
        const minx = Math.min(R.x[i], R.x[i + 1]) - reach, maxx = Math.max(R.x[i], R.x[i + 1]) + reach;
        const minz = Math.min(R.z[i], R.z[i + 1]) - reach, maxz = Math.max(R.z[i], R.z[i + 1]) + reach;
        const cx0 = clamp(Math.floor((minx + HALF) / this.rbCell), 0, this.rbN - 1);
        const cx1 = clamp(Math.floor((maxx + HALF) / this.rbCell), 0, this.rbN - 1);
        const cz0 = clamp(Math.floor((minz + HALF) / this.rbCell), 0, this.rbN - 1);
        const cz1 = clamp(Math.floor((maxz + HALF) / this.rbCell), 0, this.rbN - 1);
        for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
          const k = cz * this.rbN + cx;
          (this.rbuckets[k] || (this.rbuckets[k] = [])).push(ri, i);
        }
      }
    }
  }

  // Nearest river info: {dist, level, width, river, t}
  riverQuery(x, z, out) {
    out.dist = Infinity;
    const cx = Math.floor((x + HALF) / this.rbCell), cz = Math.floor((z + HALF) / this.rbCell);
    if (cx < 0 || cz < 0 || cx >= this.rbN || cz >= this.rbN) return out;
    const b = this.rbuckets[cz * this.rbN + cx];
    if (!b) return out;
    for (let k = 0; k < b.length; k += 2) {
      const R = this.rivers[b[k]], i = b[k + 1];
      const ax = R.x[i], az = R.z[i], bx = R.x[i + 1], bz = R.z[i + 1];
      const abx = bx - ax, abz = bz - az;
      const l2 = abx * abx + abz * abz || 1;
      let t = ((x - ax) * abx + (z - az) * abz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + abx * t - x, pz = az + abz * t - z;
      const d = Math.sqrt(px * px + pz * pz);
      if (d < out.dist) {
        out.dist = d;
        out.level = R.level[i] + (R.level[i + 1] - R.level[i]) * t;
        out.width = R.width[i] + (R.width[i + 1] - R.width[i]) * t;
        out.river = b[k];
        out.seg = i;
        out.t = t;
        out.dirx = abx / Math.sqrt(l2);
        out.dirz = abz / Math.sqrt(l2);
      }
    }
    return out;
  }

  // ---------- Full sample ----------
  // Returns height; fills out.biome and out.veg (0..1 tree density)
  sample(x, z, out) {
    let h = this.base(x, z, out);
    const region = out.region;
    let biome = region >= 0 ? REGIONS[region].type : BIOME.GRASSLAND;
    if (out.island > 0.5) biome = BIOME.ISLAND;

    // River carving
    const rq = this._rq || (this._rq = {});
    this.riverQuery(x, z, rq);
    out.river = false;
    if (rq.dist < Infinity) {
      const half = rq.width * 0.5;
      const bank = 30 + rq.width;
      if (rq.dist < half + bank) {
        const depth = 1.8 + rq.width * 0.09;
        let target;
        if (rq.dist < half) target = rq.level - depth * (1 - (rq.dist / half) ** 2) - 0.3;
        else target = rq.level + (rq.dist - half) * 0.32 - 0.3;
        const carved = Math.min(h, target);
        const k = smoothstep(half + bank * 0.55, half + bank, rq.dist);
        h = lerp(carved, h, k);
        if (rq.dist < half + 2) { biome = BIOME.RIVER; out.river = true; }
      }
    }

    // Biome refinements
    if (biome !== BIOME.RIVER) {
      if (h < -1.5 && (biome !== BIOME.SWAMP || out.cont < 0.6)) biome = BIOME.OCEAN;
      else if (h < 3.2 && out.cont < 0.995 && biome !== BIOME.SWAMP && biome !== BIOME.VOLCANIC) biome = BIOME.BEACH;
      else if (biome === BIOME.ISLAND && h < 2.5) biome = BIOME.BEACH;
      if ((biome === BIOME.MOUNTAIN || biome === BIOME.PINEFOREST) && h > 255 + this.n1.noise(x * 0.01, z * 0.01) * 25) biome = BIOME.SNOW;
      if (biome === BIOME.DESERT && h < 14) biome = BIOME.CANYON;
    }

    // Vegetation density
    const fn = this.n2.fbm(x * 0.006 + 40, z * 0.006 - 20, 3) * 0.5 + 0.5;
    let veg = 0;
    switch (biome) {
      case BIOME.FOREST: veg = 0.45 + fn * 0.55; break;
      case BIOME.PINEFOREST: veg = 0.35 + fn * 0.65 - clamp((h - 200) / 80, 0, 1) * 0.6; break;
      case BIOME.JUNGLE: veg = 0.7 + fn * 0.3; break;
      case BIOME.GRASSLAND: veg = smoothstep(0.62, 0.9, fn) * 0.55 + 0.04; break;
      case BIOME.SWAMP: veg = h > 0.2 ? 0.35 + fn * 0.5 : 0.04; break;
      case BIOME.ISLAND: veg = 0.3 + fn * 0.5; break;
      case BIOME.MOUNTAIN: veg = clamp(1 - (h - 90) / 120, 0, 1) * 0.5 * fn; break;
      case BIOME.BEACH: veg = h > 1.2 ? 0.08 : 0; break;
      case BIOME.DESERT: case BIOME.CANYON: veg = 0.025; break;
      case BIOME.VOLCANIC: veg = 0.02; break;
      default: veg = 0;
    }
    out.biome = biome;
    out.veg = clamp(veg, 0, 1);
    return h;
  }
}

// Fill rows [z0, z1) of the grid. Returns typed arrays for that slice.
export function generateRows(seed, z0, z1) {
  const gen = new WorldGen(seed);
  const rows = z1 - z0;
  const heights = new Float32Array(rows * (GRID + 1));
  const biomes = new Uint8Array(rows * (GRID + 1));
  const veg = new Uint8Array(rows * (GRID + 1));
  const out = {};
  for (let r = 0; r < rows; r++) {
    const z = -HALF + (z0 + r) * CELL;
    for (let c = 0; c <= GRID; c++) {
      const x = -HALF + c * CELL;
      const h = gen.sample(x, z, out);
      const k = r * (GRID + 1) + c;
      heights[k] = h;
      biomes[k] = out.biome;
      veg[k] = Math.round(out.veg * 255);
    }
  }
  return { heights, biomes, veg };
}
