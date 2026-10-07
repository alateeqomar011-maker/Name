// World data: heightfield, water levels and material masks, plus queries used by gameplay.
import * as THREE from 'three';
import { WORLD, VOLCANO, MIRROR_LAKE, JADE_LAKE, REGIONS, ISLANDS, RUINS } from './design.js';
import { createGenerator, generateRows, NO_WATER } from './heightgen.js';
import HeightWorker from './heightgen.worker.js?worker&inline';
import { U } from '../render/common.js';

const S = WORLD.N + 1;

export class World {
  constructor() {
    this.gen = createGenerator();
    this.heights = new Float32Array(S * S);
    this.waters = new Float32Array(S * S);
    this.masks = new Uint8Array(S * S * 4);
    this.ready = false;
  }

  async generate(onProgress) {
    const BLOCK = 32;
    const jobs = [];
    for (let r = 0; r < S; r += BLOCK) jobs.push([r, Math.min(S, r + BLOCK)]);
    const total = jobs.length;
    let done = 0;
    const accept = (msg) => {
      const off = msg.r0 * S;
      this.heights.set(msg.height, off);
      this.waters.set(msg.water, off);
      this.masks.set(msg.masks, off * 4);
      done++;
      onProgress && onProgress(done / total);
    };

    let workers = [];
    try {
      const n = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));
      for (let i = 0; i < n; i++) workers.push(new HeightWorker());
    } catch (e) {
      console.warn('Workers unavailable, generating on main thread', e);
      workers = [];
    }

    if (workers.length) {
      try {
        await new Promise((resolve, reject) => {
          let next = 0;
          const feed = (w) => {
            if (next >= jobs.length) return;
            const [r0, r1] = jobs[next++];
            w.postMessage({ r0, r1, id: next });
          };
          for (const w of workers) {
            w.onmessage = (e) => {
              accept(e.data);
              if (done === total) resolve();
              else feed(w);
            };
            w.onerror = (err) => reject(err);
            feed(w);
          }
        });
      } catch (e) {
        console.warn('Worker generation failed, falling back', e);
        done = 0;
        workers.forEach((w) => w.terminate());
        workers = [];
      }
      workers.forEach((w) => w.terminate());
    }
    if (done < total) {
      for (const [r0, r1] of jobs) {
        accept({ r0, r1, ...generateRows(this.gen, r0, r1) });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    this._postProcess();
    this.ready = true;
  }

  _postProcess() {
    // GPU textures
    const hw = new Float32Array(S * S * 2);
    for (let i = 0; i < S * S; i++) {
      hw[i * 2] = this.heights[i];
      hw[i * 2 + 1] = this.waters[i] > NO_WATER + 1 ? this.waters[i] : -1000;
    }
    const ht = new THREE.DataTexture(hw, S, S, THREE.RGFormat, THREE.FloatType);
    ht.minFilter = ht.magFilter = THREE.LinearFilter;
    ht.wrapS = ht.wrapT = THREE.ClampToEdgeWrapping;
    ht.needsUpdate = true;
    this.heightTex = ht;
    const mt = new THREE.DataTexture(this.masks, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    mt.minFilter = mt.magFilter = THREE.LinearFilter;
    mt.needsUpdate = true;
    this.maskTex = mt;
    U.uHeightTex.value = ht;
    U.uMaskTex.value = mt;
    this.jadeLevel = this.gen.jadeLevel;
    this.pads = this.gen.pads;
  }

  // ---- queries ----
  inBounds(x, z) {
    return Math.abs(x) < WORLD.HALF - 1 && Math.abs(z) < WORLD.HALF - 1;
  }

  height(x, z) {
    const fx = (x + WORLD.HALF) / WORLD.CELL;
    const fz = (z + WORLD.HALF) / WORLD.CELL;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; else if (i > S - 2) i = S - 2;
    if (j < 0) j = 0; else if (j > S - 2) j = S - 2;
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const H = this.heights;
    const k = j * S + i;
    // triangle-consistent interpolation (matches mesh triangulation)
    const h00 = H[k], h10 = H[k + 1], h01 = H[k + S], h11 = H[k + S + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  normal(x, z, out = new THREE.Vector3()) {
    const e = WORLD.CELL;
    const hl = this.height(x - e, z), hr = this.height(x + e, z);
    const hd = this.height(x, z - e), hu = this.height(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // Water surface level (sea = 0); returns -Infinity when no water is present at all
  waterLevel(x, z) {
    const fx = (x + WORLD.HALF) / WORLD.CELL;
    const fz = (z + WORLD.HALF) / WORLD.CELL;
    const i = Math.max(0, Math.min(S - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(S - 2, Math.floor(fz)));
    const W = this.waters;
    const k = j * S + i;
    let m = Math.max(W[k], W[k + 1], W[k + S], W[k + S + 1]);
    if (m <= NO_WATER + 1) m = WORLD.SEA;
    return Math.max(m, WORLD.SEA);
  }

  isRiverOrLake(x, z) {
    const i = Math.round((x + WORLD.HALF) / WORLD.CELL), j = Math.round((z + WORLD.HALF) / WORLD.CELL);
    if (i < 0 || j < 0 || i >= S || j >= S) return false;
    return this.waters[j * S + i] > NO_WATER + 1;
  }

  mask(x, z, out = {}) {
    const i = Math.max(0, Math.min(S - 1, Math.round((x + WORLD.HALF) / WORLD.CELL)));
    const j = Math.max(0, Math.min(S - 1, Math.round((z + WORLD.HALF) / WORLD.CELL)));
    const k = (j * S + i) * 4;
    out.moist = this.masks[k] / 255;
    out.canyon = this.masks[k + 1] / 255;
    out.volc = this.masks[k + 2] / 255;
    out.wet = this.masks[k + 3] / 255;
    return out;
  }

  snowLine(x, z) {
    return 560 + this.gen.noise.noise2(x * 0.004, z * 0.004) * 45;
  }

  // Biome classification for vegetation & audio
  biome(x, z, m = this.mask(x, z, {}), h = this.height(x, z), ny = this.normal(x, z, _n).y) {
    const wl = this.waterLevel(x, z);
    if (h < wl - 0.3) return 'water';
    if (m.volc > 0.55) return 'volcanic';
    if (h > this.snowLine(x, z)) return ny > 0.72 ? 'snow' : 'rock';
    if (ny < 0.66) return 'rock';
    if (h < 3.2 && wl <= WORLD.SEA + 0.01) return 'beach';
    if (m.canyon > 0.45) return 'canyon';
    const cont = this.gen.continent(x, z);
    if (cont < -0.02 && h > 0) return 'island';
    if (h > 260) return 'forest';
    if (m.moist > 0.66) return 'jungle';
    return 'grass';
  }

  regionName(x, z) {
    const h = this.height(x, z);
    const dm = Math.hypot(x - MIRROR_LAKE.x, z - MIRROR_LAKE.z);
    if (dm < MIRROR_LAKE.plateauR * 0.75) return REGIONS.mirror;
    if (Math.abs(x - MIRROR_LAKE.x) < 200 && z > MIRROR_LAKE.z + MIRROR_LAKE.plateauR - 120 && z < MIRROR_LAKE.z + MIRROR_LAKE.plateauR + 260) return REGIONS.falls;
    if (Math.hypot(x - JADE_LAKE.x, z - JADE_LAKE.z) < JADE_LAKE.r + 120) return REGIONS.jade;
    const m = this.mask(x, z, {});
    if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.r * 0.9) return REGIONS.volcano;
    for (const I of ISLANDS) if (Math.hypot(x - I.x, z - I.z) < I.r * 1.3) return REGIONS.islands;
    if (h < -1.5) return REGIONS.ocean;
    if (m.canyon > 0.4) return REGIONS.canyon;
    if (h > 430) return REGIONS.mountain;
    if (h > 200) return REGIONS.forest;
    if (h < 4) return REGIONS.beach;
    if (m.moist > 0.66) return REGIONS.jungle;
    if (this.isRiverOrLake(x, z)) return REGIONS.river;
    return REGIONS.grass;
  }

  // Simple line-of-sight / ray vs heightfield. Returns distance or -1
  raycast(origin, dir, maxDist = 400, step = 1.0) {
    let t = 0.5;
    let prevAbove = origin.y - this.height(origin.x, origin.z);
    while (t < maxDist) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      const above = y - this.height(x, z);
      if (above < 0) {
        // refine
        const f = prevAbove / (prevAbove - above);
        return t - step + step * f;
      }
      prevAbove = above;
      t += step;
      if (t > 40) step = Math.min(8, step * 1.05);
    }
    return -1;
  }

  ruin(id) {
    return this.pads.find((p) => p.id === id);
  }
}

const _n = new THREE.Vector3();
export { RUINS };
