// Main-thread world data: heightfield, biomes, colours, water queries and map imagery.
import * as THREE from 'three';
import { WorldGen, generateRows, GRID, CELL, HALF, WORLD_SIZE, BIOME, REGIONS, ISLANDS, SEA_LEVEL } from './worldgen.js';
import { Simplex, clamp, lerp, smoothstep } from '../core/noise.js';

const N = GRID + 1;

const BIOME_COL = {
  [BIOME.OCEAN]: [176, 160, 118],
  [BIOME.BEACH]: [218, 200, 152],
  [BIOME.GRASSLAND]: [92, 116, 52],
  [BIOME.FOREST]: [74, 92, 40],
  [BIOME.PINEFOREST]: [84, 88, 54],
  [BIOME.JUNGLE]: [56, 86, 32],
  [BIOME.MOUNTAIN]: [98, 112, 64],
  [BIOME.SNOW]: [236, 240, 246],
  [BIOME.VOLCANIC]: [52, 46, 44],
  [BIOME.DESERT]: [206, 146, 92],
  [BIOME.CANYON]: [178, 108, 68],
  [BIOME.SWAMP]: [74, 74, 42],
  [BIOME.ISLAND]: [88, 118, 48],
  [BIOME.RIVER]: [124, 114, 92],
};
const GRASS_DENSITY = {
  [BIOME.GRASSLAND]: 1.0, [BIOME.FOREST]: 0.55, [BIOME.PINEFOREST]: 0.35, [BIOME.JUNGLE]: 0.75,
  [BIOME.MOUNTAIN]: 0.6, [BIOME.ISLAND]: 0.7, [BIOME.SWAMP]: 0.7, [BIOME.DESERT]: 0.05, [BIOME.BEACH]: 0.04,
};

const SRGB2LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB2LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export class World {
  constructor(seed = 1337) {
    this.seed = seed;
    this.gen = new WorldGen(seed);
    this.heights = new Float32Array(N * N);
    this.biomes = new Uint8Array(N * N);
    this.veg = new Uint8Array(N * N);
    this.colors = new Uint8Array(N * N * 3);
    this.grass = new Uint8Array(N * N);
    this.seaLevel = SEA_LEVEL;
    this.flood = 0; // extra water level during flood events
    this.noise = new Simplex(seed + 999);
    this._rq = {};
    this._bo = {};
    this.rivers = this.gen.rivers;
  }

  async generate(onProgress = () => {}) {
    const workers = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4)));
    const rowsPer = Math.ceil(N / (workers * 2));
    const jobs = [];
    for (let z0 = 0; z0 < N; z0 += rowsPer) jobs.push([z0, Math.min(N, z0 + rowsPer)]);
    let done = 0;
    const apply = (z0, data) => {
      this.heights.set(data.heights, z0 * N);
      this.biomes.set(data.biomes, z0 * N);
      this.veg.set(data.veg, z0 * N);
      done++;
      onProgress(0.8 * done / jobs.length);
    };
    let ok = true;
    try {
      const pool = [];
      for (let i = 0; i < workers; i++) pool.push(new Worker(new URL('./genWorker.js', import.meta.url), { type: 'module' }));
      await new Promise((resolve, reject) => {
        let next = 0, finished = 0;
        const feed = (w) => {
          if (next >= jobs.length) return;
          const [z0, z1] = jobs[next++];
          w.postMessage({ seed: this.seed, z0, z1, id: z0 });
        };
        for (const w of pool) {
          w.onmessage = (e) => {
            apply(e.data.z0, e.data);
            finished++;
            if (finished === jobs.length) resolve();
            else feed(w);
          };
          w.onerror = (err) => reject(err);
          feed(w);
        }
      });
      pool.forEach((w) => w.terminate());
    } catch (e) {
      console.warn('Worker generation failed, falling back to main thread', e);
      ok = false;
    }
    if (!ok) {
      done = 0;
      for (const [z0, z1] of jobs) {
        apply(z0, generateRows(this.seed, z0, z1));
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await this._erode((f) => onProgress(0.8 + 0.2 * f));
    this._computeColors();
    this._buildTextures();
    this._buildMapImage();
    this._buildWaterSpots();
  }

  // Erosion filter (after Fewes' "eroded terrain noise"): each octave lays gullies that run straight
  // down the local slope, and the slope it creates steers the next, finer octave, so the channels
  // branch into drainage networks with sharp ridges between them. Only slopes are touched: flats,
  // beaches, swamps, river corridors and the sea floor keep their shape.
  async _erode(onProgress = () => {}) {
    const H = this.heights, B = this.biomes;
    // river corridors and the shoreline are never reshaped (their profiles are carved by worldgen)
    const keep = new Float32Array(N * N);
    {
      const q = {};
      for (let r = 0; r < N; r++) {
        const z = -HALF + r * CELL;
        for (let c = 0; c < N; c++) {
          const k = r * N + c;
          let m = smoothstep(3, 12, H[k]);
          if (m > 0) {
            this.gen.riverQuery(-HALF + c * CELL, z, q);
            if (q.dist < Infinity) m *= smoothstep(q.width * 0.5 + 30, q.width * 1.5 + 70, q.dist);
          }
          keep[k] = m;
        }
      }
    }
    await new Promise((res) => setTimeout(res, 0));
    // talus: rock can't stand steeper than this (tan of the angle), so needle spires slump into
    // pyramidal peaks with scree aprons; badland mesas and jungle karst keep steeper walls
    const talus = new Float32Array(16).fill(1.05);
    talus[BIOME.MOUNTAIN] = 1.25; talus[BIOME.SNOW] = 1.2; talus[BIOME.PINEFOREST] = 1.15;
    talus[BIOME.JUNGLE] = 1.7; talus[BIOME.DESERT] = 2.1; talus[BIOME.CANYON] = 2.1; talus[BIOME.VOLCANIC] = 0.95;
    onProgress(0.15);
    await new Promise((res) => setTimeout(res, 0));
    this._thermal(keep, talus, 70);
    onProgress(0.3);
    await new Promise((res) => setTimeout(res, 0));
    // gradients come from a lightly blurred copy so 4 m noise doesn't steer the gullies
    const blur = new Float32Array(N * N), tmp = new Float32Array(N * N);
    const R = 2;
    for (let r = 0; r < N; r++) {
      let acc = 0;
      for (let c = -R; c <= R; c++) acc += H[r * N + clamp(c, 0, N - 1)];
      for (let c = 0; c < N; c++) {
        tmp[r * N + c] = acc / (2 * R + 1);
        acc += H[r * N + Math.min(N - 1, c + R + 1)] - H[r * N + Math.max(0, c - R)];
      }
    }
    for (let c = 0; c < N; c++) {
      let acc = 0;
      for (let r = -R; r <= R; r++) acc += tmp[clamp(r, 0, N - 1) * N + c];
      for (let r = 0; r < N; r++) {
        blur[r * N + c] = acc / (2 * R + 1);
        acc += tmp[Math.min(N - 1, r + R + 1) * N + c] - tmp[Math.max(0, r - R) * N + c];
      }
    }
    const skip = new Uint8Array(16);
    for (const b of [BIOME.OCEAN, BIOME.BEACH, BIOME.RIVER, BIOME.SWAMP]) skip[b] = 1;
    const TAU = Math.PI * 2;
    const OCT = [[118, 1], [56, 0.5], [27, 0.26], [13, 0.12]];
    const hash = (x, z, o) => {
      let h = (x * 374761393 + z * 668265263 + o * 1442695041) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return h;
    };
    const out = new Float32Array(H);
    for (let r = 2; r < N - 2; r++) {
      if ((r & 63) === 0) { onProgress(0.3 + 0.7 * r / N); await new Promise((res) => setTimeout(res, 0)); }
      const z = -HALF + r * CELL;
      for (let c = 2; c < N - 2; c++) {
        const k = r * N + c;
        if (skip[B[k]]) continue;
        const h0 = H[k];
        if (h0 < 4) continue;
        let gx = (blur[k + 1] - blur[k - 1]) / (2 * CELL);
        let gz = (blur[k + N] - blur[k - N]) / (2 * CELL);
        const slope = Math.hypot(gx, gz);
        let mask = smoothstep(0.1, 0.5, slope) * smoothstep(4, 16, h0);
        if (mask < 0.01) continue;
        mask *= keep[k];
        if (mask < 0.01) continue;
        const x = -HALF + c * CELL;
        const relief = Math.min(slope, 1.6) * 0.15;
        let hs = 0, as = 0;
        for (let o = 0; o < OCT.length; o++) {
          const tile = OCT[o][0], amp = OCT[o][1] * relief * OCT[0][0];
          const s = Math.hypot(gx, gz) || 1e-4;
          const kf = Math.min(1.2, s * 2.5);
          // perpendicular to the slope: the stripes then run downhill
          const dx = (gz / s) * kf, dz = (-gx / s) * kf;
          const px = x / tile, pz = z / tile;
          const ix = Math.floor(px), iz = Math.floor(pz);
          const fx = px - ix, fz = pz - iz;
          let va = 0, vx = 0, vz = 0, wt = 0;
          for (let i = -2; i <= 1; i++) {
            for (let j = -2; j <= 1; j++) {
              const hv = hash(ix - i, iz - j, o);
              const ox = ((hv & 1023) / 1023) * 0.5, oz = (((hv >>> 10) & 1023) / 1023) * 0.5;
              const ppx = fx + i - ox, ppz = fz + j - oz;
              const w = Math.exp(-(ppx * ppx + ppz * ppz) * 2);
              const m = (ppx * dx + ppz * dz) * TAU;
              const sn = -Math.sin(m) * w;
              va += Math.cos(m) * w; vx += sn * dx; vz += sn * dz; wt += w;
            }
          }
          va /= wt; vx /= wt; vz /= wt;
          hs += va * amp; as += amp;
          // this octave's own slope (m/m) bends the next octave's gullies: branching
          gx += vx * TAU / tile * amp * 0.85;
          gz += vz * TAU / tile * amp * 0.85;
        }
        out[k] = h0 + (hs - 0.3 * as) * mask;
      }
    }
    H.set(out);
    // knock down only the knife-edge fins where gully walls stack up (beyond ~60 degrees)
    for (let i = 0; i < 16; i++) talus[i] *= 1.45;
    this._thermal(keep, talus, 5);
  }

  // Thermal erosion (Gauss-Seidel over an active set): material above the talus slope slides to
  // the lower neighbours until every slope can stand.
  _thermal(keep, talus, iters) {
    const H = this.heights, B = this.biomes;
    const NB = [1, -1, N, -N, N + 1, N - 1, -N + 1, -N - 1];
    const DF = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
    let mark = new Uint8Array(N * N), next = new Uint8Array(N * N);
    let list = [];
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) { const k = r * N + c; if (keep[k] > 0.02) list.push(k); }
    const d = new Float32Array(8);
    for (let it = 0; it < iters && list.length; it++) {
      const nl = [];
      for (let li = 0; li < list.length; li++) {
        const k = list[li];
        const kp = keep[k];
        if (kp <= 0.02) continue;
        const h = H[k];
        // high bare rock stands steeper than the soil-covered lower slopes
        const T = talus[B[k]] * CELL * (1 + 0.55 * smoothstep(110, 330, h));
        let sum = 0, max = 0;
        for (let i = 0; i < 8; i++) {
          const j = k + NB[i];
          let e = 0;
          if (keep[j] > 0.02) { e = h - H[j] - T * DF[i]; if (e < 0) e = 0; }
          d[i] = e; sum += e; if (e > max) max = e;
        }
        if (max <= 0.02) continue;
        const move = max * 0.45 * kp;
        H[k] = h - move;
        for (let i = 0; i < 8; i++) {
          if (d[i] <= 0) continue;
          const j = k + NB[i];
          H[j] += move * d[i] / sum;
          if (!next[j]) { next[j] = 1; nl.push(j); }
        }
        if (!next[k]) { next[k] = 1; nl.push(k); }
      }
      for (let i = 0; i < nl.length; i++) { const j = nl[i]; next[j] = 0; }
      // keep the border rows out of the set
      list = nl.filter((j) => { const c = j % N, r = (j / N) | 0; return c > 0 && r > 0 && c < N - 1 && r < N - 1; });
    }
  }

  // ----- Grid helpers -----
  idx(c, r) { return r * N + c; }
  hAt(c, r) {
    c = c < 0 ? 0 : c > GRID ? GRID : c;
    r = r < 0 ? 0 : r > GRID ? GRID : r;
    return this.heights[r * N + c];
  }

  // Height matching the full-resolution terrain triangulation exactly.
  getHeight(x, z) {
    let gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0) gx = 0; else if (gx > GRID - 0.0001) gx = GRID - 0.0001;
    if (gz < 0) gz = 0; else if (gz > GRID - 0.0001) gz = GRID - 0.0001;
    const c = Math.floor(gx), r = Math.floor(gz);
    const fx = gx - c, fz = gz - r;
    const H = this.heights;
    const k = r * N + c;
    const ha = H[k], hb = H[k + 1], hc = H[k + N], hd = H[k + N + 1];
    if (fx + fz <= 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }

  getNormal(x, z, out = new THREE.Vector3()) {
    const e = 2;
    const hl = this.getHeight(x - e, z), hr = this.getHeight(x + e, z);
    const hd = this.getHeight(x, z - e), hu = this.getHeight(x, z + e);
    out.set(hl - hr, 2 * e, hd - hu).normalize();
    return out;
  }

  cellIndex(x, z) {
    const c = clamp(Math.round((x + HALF) / CELL), 0, GRID);
    const r = clamp(Math.round((z + HALF) / CELL), 0, GRID);
    return r * N + c;
  }
  getBiome(x, z) { return this.biomes[this.cellIndex(x, z)]; }
  getVeg(x, z) { return this.veg[this.cellIndex(x, z)] / 255; }
  inBounds(x, z) { return x > -HALF + 8 && x < HALF - 8 && z > -HALF + 8 && z < HALF - 8; }

  regionAt(x, z) {
    const o = this._bo;
    this.gen.base(x, z, o);
    for (const I of ISLANDS) {
      if (Math.hypot(x - I.x, z - I.z) < I.r * 1.25) return { id: I.id, name: I.name, island: true };
    }
    const h = this.getHeight(x, z);
    if (h < -2 && o.cont < 0.5) return { id: 'sea', name: 'Primordial Sea' };
    const R = REGIONS[o.region] || REGIONS[0];
    return { id: R.id, name: R.name, type: R.type };
  }

  // Water surface level at (x,z) (sea or river), or -Infinity where there is none.
  waterLevelAt(x, z) {
    let level = this.seaLevel + this.flood;
    const q = this.gen.riverQuery(x, z, this._rq);
    if (q.dist < q.width * 0.5 + 3) {
      const rl = q.level + this.flood * 0.6;
      if (rl > level) level = rl;
    }
    return level;
  }
  riverAt(x, z) {
    const q = this.gen.riverQuery(x, z, this._rq);
    if (q.dist < q.width * 0.5 + 1) return q;
    return null;
  }
  isUnderwater(x, y, z) { return y < this.waterLevelAt(x, z); }

  // ----- Colours -----
  _computeColors() {
    const H = this.heights, B = this.biomes, C = new Float32Array(N * N * 3);
    const gr = this.grass;
    const nz = this.noise;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const k = r * N + c;
        const h = H[k];
        const b = B[k];
        const x = -HALF + c * CELL, z = -HALF + r * CELL;
        // slope from neighbours
        const dx = this.hAt(c + 1, r) - this.hAt(c - 1, r);
        const dz = this.hAt(c, r + 1) - this.hAt(c, r - 1);
        const ny = (2 * CELL) / Math.sqrt(dx * dx + dz * dz + 4 * CELL * CELL);
        const n1 = nz.noise(x * 0.012, z * 0.012);
        const n2 = nz.noise(x * 0.05, z * 0.05);
        let col = BIOME_COL[b] || BIOME_COL[BIOME.GRASSLAND];
        let R = col[0], G = col[1], Bc = col[2];
        const v = 1 + n1 * 0.12 + n2 * 0.06;
        switch (b) {
          case BIOME.GRASSLAND: {
            const dry = smoothstep(-0.1, 0.6, n1);
            R = lerp(84, 138, dry); G = lerp(112, 128, dry); Bc = lerp(46, 66, dry);
            break;
          }
          case BIOME.FOREST: {
            const m = smoothstep(-0.3, 0.5, n2);
            R = lerp(66, 96, m); G = lerp(90, 82, m); Bc = lerp(36, 46, m);
            break;
          }
          case BIOME.MOUNTAIN: {
            const rk = smoothstep(120, 210, h + n1 * 30);
            R = lerp(96, 118, rk); G = lerp(112, 110, rk); Bc = lerp(62, 98, rk);
            break;
          }
          case BIOME.DESERT: case BIOME.CANYON: {
            const band = Math.sin(h * 0.35 + n2 * 0.6) * 0.5 + 0.5;
            R = lerp(R, 226, band * 0.35); G = lerp(G, 170, band * 0.3); Bc = lerp(Bc, 120, band * 0.3);
            break;
          }
          case BIOME.VOLCANIC: {
            const ash = smoothstep(0.1, 0.7, n1);
            R = lerp(44, 92, ash); G = lerp(40, 86, ash); Bc = lerp(38, 80, ash);
            break;
          }
          case BIOME.OCEAN: {
            const d = clamp(-h / 40, 0, 1);
            R = lerp(196, 120, d); G = lerp(180, 120, d); Bc = lerp(130, 100, d);
            break;
          }
          case BIOME.SWAMP: {
            const wet = smoothstep(1.5, -0.2, h);
            R = lerp(78, 58, wet); G = lerp(80, 56, wet); Bc = lerp(40, 34, wet);
            break;
          }
        }
        R *= v; G *= v; Bc *= v;
        // Rock on steep slopes
        const rock = smoothstep(0.8, 0.62, ny);
        if (rock > 0 && b !== BIOME.OCEAN && b !== BIOME.RIVER) {
          let rr = 108, rg = 100, rb = 90;
          if (b === BIOME.DESERT || b === BIOME.CANYON) {
            const band = Math.sin(h * 0.5 + n2) * 0.5 + 0.5;
            rr = lerp(160, 205, band); rg = lerp(84, 128, band); rb = lerp(56, 84, band);
          } else if (b === BIOME.VOLCANIC) { rr = 42; rg = 38; rb = 37; }
          else if (b === BIOME.JUNGLE) { rr = 96; rg = 100; rb = 84; }
          else if (b === BIOME.SNOW) { rr = 120; rg = 120; rb = 122; }
          const rv = 1 + n2 * 0.15;
          R = lerp(R, rr * rv, rock); G = lerp(G, rg * rv, rock); Bc = lerp(Bc, rb * rv, rock);
        }
        // Snow cap on flat high ground
        const snowLine = 270 + n1 * 30;
        if (h > snowLine - 40 && b !== BIOME.VOLCANIC) {
          const s = smoothstep(snowLine - 40, snowLine + 10, h) * smoothstep(0.55, 0.85, ny);
          R = lerp(R, 236, s); G = lerp(G, 240, s); Bc = lerp(Bc, 246, s);
        }
        C[k * 3] = R; C[k * 3 + 1] = G; C[k * 3 + 2] = Bc;
        let g = (GRASS_DENSITY[b] || 0) * (1 - rock);
        if (b === BIOME.SWAMP && h < 0.3) g = 0;
        if (h < 0.4) g = 0;
        if (h > 230) g *= clamp(1 - (h - 230) / 40, 0, 1);
        if (b === BIOME.MOUNTAIN) g *= 1 - smoothstep(110, 170, h + n1 * 30);
        gr[k] = Math.round(clamp(g, 0, 1) * 255);
      }
    }
    // soften biome borders
    const tmp = new Float32Array(C.length);
    for (let pass = 0; pass < 2; pass++) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const k = (r * N + c) * 3;
        for (let ch = 0; ch < 3; ch++) {
          const a = C[k + ch];
          const l = C[(r * N + Math.max(0, c - 1)) * 3 + ch], rr = C[(r * N + Math.min(GRID, c + 1)) * 3 + ch];
          tmp[k + ch] = (a * 2 + l + rr) * 0.25;
        }
      }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const k = (r * N + c) * 3;
        for (let ch = 0; ch < 3; ch++) {
          const a = tmp[k + ch];
          const u = tmp[(Math.max(0, r - 1) * N + c) * 3 + ch], d = tmp[(Math.min(GRID, r + 1) * N + c) * 3 + ch];
          C[k + ch] = (a * 2 + u + d) * 0.25;
        }
      }
    }
    // Baked ambient occlusion from the heightfield (hollows darker, crests lighter) and forest floor litter
    const H2 = this.heights, V = this.veg;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const k = r * N + c;
        const h = H2[k];
        let sum = 0, cnt = 0;
        for (let d = 2; d <= 6; d += 2) {
          sum += this.hAt(c + d, r) + this.hAt(c - d, r) + this.hAt(c, r + d) + this.hAt(c, r - d);
          cnt += 4;
        }
        const cav = sum / cnt - h; // >0 = hollow
        let ao = clamp(1 - cav * 0.035, 0.62, 1.08);
        const b = this.biomes[k];
        const v = V[k] / 255;
        let lr = 1, lg = 1, lb = 1, lit = 0;
        if (b === BIOME.FOREST || b === BIOME.PINEFOREST || b === BIOME.JUNGLE || b === BIOME.SWAMP) {
          lit = smoothstep(0.35, 0.85, v) * 0.55;
          ao *= 1 - lit * 0.25; // canopy shade
        }
        for (let ch = 0; ch < 3; ch++) {
          const litter = [92, 70, 44][ch];
          C[k * 3 + ch] = lerp(C[k * 3 + ch], litter, lit) * ao;
        }
        void lr; void lg; void lb;
      }
    }
    for (let i = 0; i < C.length; i++) this.colors[i] = clamp(Math.round(C[i]), 0, 255);
  }

  colorLinear(k, out) {
    out[0] = SRGB2LIN[this.colors[k * 3]];
    out[1] = SRGB2LIN[this.colors[k * 3 + 1]];
    out[2] = SRGB2LIN[this.colors[k * 3 + 2]];
    return out;
  }

  _buildTextures() {
    // Height texture (float) used by grass and water shaders
    this.heightTex = new THREE.DataTexture(this.heights, N, N, THREE.RedFormat, THREE.FloatType);
    this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.minFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    // Ground texture: rgb = terrain colour (sRGB), a = grass density
    const data = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      data[i * 4] = this.colors[i * 3];
      data[i * 4 + 1] = this.colors[i * 3 + 1];
      data[i * 4 + 2] = this.colors[i * 3 + 2];
      data[i * 4 + 3] = this.grass[i];
    }
    this.groundTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    this.groundTex.magFilter = THREE.LinearFilter;
    this.groundTex.minFilter = THREE.LinearFilter;
    this.groundTex.needsUpdate = true;
    // Swamp mask for murky water tint
    const sw = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const b = this.biomes[i];
      sw[i * 4] = b === BIOME.SWAMP ? 255 : 0;
      sw[i * 4 + 1] = b === BIOME.VOLCANIC ? 255 : 0;
      sw[i * 4 + 3] = 255;
    }
    this.maskTex = new THREE.DataTexture(sw, N, N, THREE.RGBAFormat);
    this.maskTex.magFilter = THREE.LinearFilter;
    this.maskTex.minFilter = THREE.LinearFilter;
    this.maskTex.needsUpdate = true;
    // Surface material weights for close-up terrain detail: r = leaf litter, g = sand, b = gravel/stones, a = dry cracked earth
    const sf = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const b = this.biomes[i];
      const v = this.veg[i] / 255;
      const h = this.heights[i];
      let lit = 0, sand = 0, grav = 0, dry = 0;
      if (b === BIOME.FOREST || b === BIOME.JUNGLE || b === BIOME.PINEFOREST) lit = Math.min(1, 0.35 + v * 1.2);
      else if (b === BIOME.SWAMP) lit = 0.15 + v * 0.25;
      else if (b === BIOME.GRASSLAND) lit = v * 0.35;
      if (b === BIOME.BEACH || b === BIOME.ISLAND && h < 4) sand = 1;
      else if (b === BIOME.DESERT) sand = 0.85;
      else if (b === BIOME.CANYON) sand = 0.35;
      if (h > -1 && h < 1.6 && b !== BIOME.SWAMP) sand = Math.max(sand, 0.8);
      if (b === BIOME.MOUNTAIN || b === BIOME.SNOW) grav = 0.75;
      else if (b === BIOME.VOLCANIC) grav = 0.9;
      else if (b === BIOME.RIVER) grav = 0.85;
      else if (b === BIOME.CANYON) grav = 0.5;
      else if (b === BIOME.DESERT) grav = 0.2;
      else if (b === BIOME.PINEFOREST) grav = 0.15;
      if (b === BIOME.DESERT) dry = 0.45;
      else if (b === BIOME.CANYON) dry = 0.8;
      else if (b === BIOME.VOLCANIC) dry = 0.35;
      sf[i * 4] = lit * 255; sf[i * 4 + 1] = sand * 255; sf[i * 4 + 2] = grav * 255; sf[i * 4 + 3] = dry * 255;
    }
    // second surface layer: r = swamp mud / standing water, g = moss & algae, b = volcanic, a = desert
    const s2 = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const b = this.biomes[i];
      const h = this.heights[i];
      let mud = 0, moss = 0;
      if (b === BIOME.SWAMP) { mud = h < 6 ? 1 : 0.6; moss = 0.7; }
      else if (b === BIOME.JUNGLE) { mud = 0.25; moss = 0.5; }
      else if (b === BIOME.FOREST) moss = 0.3;
      // b = volcanic ash fields, a = desert & canyon (photo material selection)
      const volc = b === BIOME.VOLCANIC ? 1 : 0;
      const des = b === BIOME.DESERT || b === BIOME.CANYON ? 1 : 0;
      s2[i * 4] = mud * 255; s2[i * 4 + 1] = moss * 255; s2[i * 4 + 2] = volc * 255; s2[i * 4 + 3] = des * 255;
    }
    this.surfTex2 = new THREE.DataTexture(s2, N, N, THREE.RGBAFormat);
    this.surfTex2.magFilter = THREE.LinearFilter;
    this.surfTex2.minFilter = THREE.LinearFilter;
    this.surfTex2.needsUpdate = true;
    this.surfTex = new THREE.DataTexture(sf, N, N, THREE.RGBAFormat);
    this.surfTex.magFilter = THREE.LinearFilter;
    this.surfTex.minFilter = THREE.LinearFilter;
    this.surfTex.needsUpdate = true;
  }

  _buildMapImage() {
    const S = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    const sc = N / S;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const c = Math.min(GRID, Math.floor(x * sc)), r = Math.min(GRID, Math.floor(y * sc));
        const k = r * N + c;
        const h = this.heights[k];
        let R = this.colors[k * 3], G = this.colors[k * 3 + 1], B = this.colors[k * 3 + 2];
        // hill shade (light from north-west)
        const dx = this.hAt(c + 1, r) - this.hAt(c - 1, r);
        const dz = this.hAt(c, r + 1) - this.hAt(c, r - 1);
        let shade = 1 + (-dx - dz) * 0.035;
        shade = clamp(shade, 0.55, 1.35);
        R *= shade; G *= shade; B *= shade;
        const wl = this.biomes[k] === BIOME.RIVER ? h + 1 : 0;
        if (h < wl || this.biomes[k] === BIOME.RIVER) {
          const d = clamp((wl - h) / 50, 0, 1);
          R = lerp(70, 18, d); G = lerp(150, 60, d); B = lerp(170, 110, d);
          if (this.biomes[k] === BIOME.SWAMP) { R = 70; G = 96; B = 74; }
        }
        // contour lines
        if (h > 5 && Math.abs((h % 40) - 20) < 0.9) { R *= 0.82; G *= 0.82; B *= 0.82; }
        const p = (y * S + x) * 4;
        img.data[p] = clamp(R, 0, 255); img.data[p + 1] = clamp(G, 0, 255); img.data[p + 2] = clamp(B, 0, 255); img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Rivers drawn on top
    ctx.strokeStyle = 'rgba(70,150,180,0.95)';
    ctx.lineCap = 'round';
    for (const R of this.rivers) {
      for (let i = 0; i < R.x.length - 1; i++) {
        ctx.lineWidth = Math.max(1.2, R.width[i] / 4 * (S / 1024));
        ctx.beginPath();
        ctx.moveTo((R.x[i] + HALF) / WORLD_SIZE * S, (R.z[i] + HALF) / WORLD_SIZE * S);
        ctx.lineTo((R.x[i + 1] + HALF) / WORLD_SIZE * S, (R.z[i + 1] + HALF) / WORLD_SIZE * S);
        ctx.stroke();
      }
    }
    this.mapCanvas = canvas;
  }

  // Drinking spots for wildlife: points along rivers and shores
  _buildWaterSpots() {
    const spots = [];
    for (const R of this.rivers) {
      for (let i = 0; i < R.x.length; i += 6) spots.push({ x: R.x[i], z: R.z[i] });
    }
    for (let r = 0; r < N; r += 12) for (let c = 0; c < N; c += 12) {
      const h = this.heights[r * N + c];
      if (h > 0.2 && h < 2.5) spots.push({ x: -HALF + c * CELL, z: -HALF + r * CELL });
    }
    this.waterSpots = spots;
    // spatial buckets
    this.wsCell = 256;
    this.wsN = WORLD_SIZE / this.wsCell;
    this.wsBuckets = Array.from({ length: this.wsN * this.wsN }, () => []);
    for (const s of spots) {
      const cx = clamp(Math.floor((s.x + HALF) / this.wsCell), 0, this.wsN - 1);
      const cz = clamp(Math.floor((s.z + HALF) / this.wsCell), 0, this.wsN - 1);
      this.wsBuckets[cz * this.wsN + cx].push(s);
    }
  }

  nearestWater(x, z, maxRings = 3) {
    const cx = Math.floor((x + HALF) / this.wsCell), cz = Math.floor((z + HALF) / this.wsCell);
    let best = null, bd = Infinity;
    for (let ring = 0; ring <= maxRings; ring++) {
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const X = cx + dx, Z = cz + dz;
        if (X < 0 || Z < 0 || X >= this.wsN || Z >= this.wsN) continue;
        for (const s of this.wsBuckets[Z * this.wsN + X]) {
          const d = (s.x - x) ** 2 + (s.z - z) ** 2;
          if (d < bd) { bd = d; best = s; }
        }
      }
      if (best && ring >= 1) break;
    }
    return best;
  }

  // Find a random land position satisfying a predicate
  findSpot(rand, pred, tries = 400) {
    for (let i = 0; i < tries; i++) {
      const x = (rand() * 2 - 1) * (HALF - 80);
      const z = (rand() * 2 - 1) * (HALF - 80);
      const h = this.getHeight(x, z);
      const b = this.getBiome(x, z);
      if (pred(x, z, h, b)) return { x, z, h, b };
    }
    return null;
  }
}

export { N as GRID_N, SRGB2LIN };
