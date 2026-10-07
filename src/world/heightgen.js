// Procedural heightfield generator. Pure functions so it can run in a worker or on the main thread.
import { makeNoise, clamp, lerp, smoothstep } from '../core/noise.js';
import {
  SEED, WORLD, VOLCANO, MIRROR_LAKE, JADE_LAKE, JUNGLE, PLATEAU,
  CANYON_PATH, RIVER_PATH, ISLANDS, RUINS,
} from './design.js';

const NO_WATER = -9999;

// ---------- polyline helpers ----------
function catmull(points, samplesPerSeg) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[n - 1].slice());
  return out;
}

function resample(pts, spacing) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    let d = spacing - carry;
    while (d <= len) {
      const t = d / len;
      out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      d += spacing;
    }
    carry = len - (d - spacing);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// Spatial index over polyline segments for fast nearest-distance queries
class PolyIndex {
  constructor(pts, maxDist, cell = 64) {
    this.pts = pts;
    this.cell = cell;
    this.map = new Map();
    this.s = new Float32Array(pts.length); // arc length
    for (let i = 1; i < pts.length; i++) this.s[i] = this.s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    this.length = this.s[pts.length - 1];
    const r = Math.ceil(maxDist / cell);
    for (let i = 0; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
      const cx = Math.floor(mx / cell), cz = Math.floor(mz / cell);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const k = (cx + dx) * 100003 + (cz + dz);
        let a = this.map.get(k);
        if (!a) { a = []; this.map.set(k, a); }
        a.push(i);
      }
    }
  }
  // returns {d, i, t, s} or null
  nearest(x, z, out) {
    const k = Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell);
    const segs = this.map.get(k);
    if (!segs) return null;
    let best = 1e9, bi = -1, bt = 0;
    const p = this.pts;
    for (let n = 0; n < segs.length; n++) {
      const i = segs[n];
      const ax = p[i][0], az = p[i][1];
      const dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ez = az + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    out.d = Math.sqrt(best);
    out.i = bi;
    out.t = bt;
    out.s = this.s[bi] + (this.s[bi + 1] - this.s[bi]) * bt;
    return out;
  }
}

export function createGenerator() {
  const N = makeNoise(SEED);
  const { noise2, fbm2, ridged2 } = N;

  const dist = (x, z, ax, az) => Math.hypot(x - ax, z - az);

  function continent(x, z) {
    const wx = x + fbm2(x * 0.00035 + 11, z * 0.00035 - 7, 4) * 520;
    const wz = z + fbm2(x * 0.00035 - 31, z * 0.00035 + 5, 4) * 520;
    const dx = wx / 3350, dz = (wz + 120) / 3250;
    const r = Math.sqrt(dx * dx + dz * dz);
    return 1 - r + fbm2(x * 0.0011, z * 0.0011, 3) * 0.12;
  }

  function islandField(x, z) {
    let best = -1e9, it = 0;
    for (let k = 0; k < ISLANDS.length; k++) {
      const I = ISLANDS[k];
      const d = dist(x, z, I.x, I.z);
      if (d > I.r * 1.6) continue;
      const nn = fbm2(x * 0.006 + k * 7, z * 0.006, 3);
      const t = clamp(1 - d / (I.r * (1 + nn * 0.25)), 0, 1);
      const h = lerp(-14, 3.2, smoothstep(0.0, 0.22, t)) + I.h * Math.pow(smoothstep(0.18, 1, t), 1.4) + fbm2(x * 0.02, z * 0.02, 2) * 3 * t;
      if (h > best) { best = h; it = t; }
    }
    return { h: best, t: it };
  }

  // Volcano cone height (or -1e9 outside)
  function volcanoH(x, z) {
    const V = VOLCANO;
    const dv0 = dist(x, z, V.x, V.z);
    if (dv0 > V.r * 1.1) return -1e9;
    const nv = fbm2(x * 0.0035, z * 0.0035, 3);
    const dv = dv0 * (1 + nv * 0.06);
    if (dv > V.r) return -1e9;
    let h;
    if (dv > V.craterR) {
      const u = (dv - V.craterR) / (V.r - V.craterR);
      h = V.peak * Math.pow(1 - u, 1.85);
      // erosion gullies on flanks
      const ang = Math.atan2(z - V.z, x - V.x);
      const gully = ridged2(Math.cos(ang) * 3 + dv * 0.004, Math.sin(ang) * 3 + dv * 0.004, 3);
      h -= gully * 38 * Math.sin(Math.PI * clamp(u * 1.3, 0, 1));
      h += fbm2(x * 0.012, z * 0.012, 2) * 6 * (1 - u);
    } else {
      const u = dv / V.craterR;
      h = V.craterFloor + (V.peak - V.craterFloor) * Math.pow(u, 3.2);
    }
    return h;
  }

  function canyonFloor(s, total) {
    return lerp(16, 1.5, s / total);
  }

  function terrace(h, step, sharp) {
    const k = h / step;
    const f = k - Math.floor(k);
    return (Math.floor(k) + smoothstep(0.5 - sharp, 0.5 + sharp, f)) * step;
  }

  const canyonPts = resample(catmull(CANYON_PATH, 12), 8);
  const canyonIdx = new PolyIndex(canyonPts, 220, 64);
  const tmpC = {};

  // Height before rivers, lakes and pads
  function preHeight(x, z, info) {
    const c = continent(x, z);
    const coastBlend = smoothstep(-0.07, 0.025, c);
    const inland = clamp(c, 0, 1);

    // rolling lowland
    const hills = fbm2(x * 0.0016, z * 0.0016, 4) * 30 + fbm2(x * 0.0065 + 3, z * 0.0065, 3) * 5;
    let land = 3 + inland * 85 + hills * smoothstep(0.0, 0.22, c);

    // jungle hills
    const dj = dist(x, z, JUNGLE.x, JUNGLE.z) + fbm2(x * 0.001, z * 0.001, 2) * 300;
    const J = smoothstep(JUNGLE.r, JUNGLE.r * 0.45, dj);
    if (J > 0) land += J * (ridged2(x * 0.0026, z * 0.0026, 4) * 85 + fbm2(x * 0.011, z * 0.011, 2) * 7) * smoothstep(0.02, 0.18, c);

    // northern mountains
    const mz = z + fbm2(x * 0.0007, 3.3, 3) * 380;
    const M = smoothstep(-1150, -2100, mz) * smoothstep(-0.2, 0.1, c);
    if (M > 0) {
      const wx = x + fbm2(x * 0.0009 + 5, z * 0.0009, 3) * 320;
      const wz = z + fbm2(x * 0.0009, z * 0.0009 - 9, 3) * 320;
      const massif = smoothstep(-0.35, 0.55, fbm2(x * 0.00042 + 3, z * 0.00042 + 1, 3));
      const r1 = ridged2(wx * 0.00078, wz * 0.00078, 6);
      const r2 = ridged2(wx * 0.0034, wz * 0.0034, 3);
      const broad = fbm2(x * 0.0011 + 7, z * 0.0011, 4) * 0.5 + 0.5;
      land += M * (130 + massif * (360 + Math.pow(r1, 1.8) * 1200 + broad * 220) + r1 * 90 + r2 * 40 * (0.4 + massif));
    }

    // ocean floor
    const sea = -8 - 80 * smoothstep(0.0, -0.32, c) + fbm2(x * 0.003, z * 0.003, 3) * 6;
    let h = lerp(sea, land, coastBlend);

    // islands
    const isl = islandField(x, z);
    if (isl.h > h) h = isl.h;

    // canyon plateau with terraced strata
    const dp0 = dist(x, z, PLATEAU.x, PLATEAU.z);
    const dp = dp0 < PLATEAU.r + 400 ? dp0 + fbm2(x * 0.0012, z * 0.0012, 3) * 260 : 1e9;
    const P = smoothstep(PLATEAU.r, PLATEAU.r * 0.82, dp) * smoothstep(0.0, 0.08, c);
    if (P > 0) {
      const ph = PLATEAU.h + fbm2(x * 0.002, z * 0.002, 3) * 22 + ridged2(x * 0.006, z * 0.006, 2) * 10;
      const hp = lerp(h, Math.max(h, ph), P);
      h = lerp(hp, terrace(hp, 17, 0.12), P * 0.85);
    }

    // canyon carve
    let canyonProx = 0;
    const cn = canyonIdx.nearest(x + fbm2(x * 0.004, z * 0.004, 2) * 25, z + fbm2(z * 0.004, x * 0.004, 2) * 25, tmpC);
    if (cn && cn.d < 210) {
      const floorH = canyonFloor(cn.s, canyonIdx.length);
      const u = smoothstep(26, 175, cn.d);
      let hc = floorH + Math.pow(u, 1.25) * 230;
      hc = lerp(hc, terrace(hc, 14, 0.1), 0.9);
      if (hc < h) h = hc;
      canyonProx = 1 - smoothstep(30, 200, cn.d);
    }

    // volcano
    const vh = volcanoH(x, z);
    if (vh > -1e8) {
      const k = 60; // smooth max
      const hh = Math.max(h, vh) + Math.max(0, k - Math.abs(h - vh)) ** 2 / (4 * k) * 0.5;
      h = hh;
    }

    // Mirror Lake highland plateau with a sharp southern cliff
    {
      const L = MIRROR_LAKE;
      const d0 = dist(x, z, L.x, L.z);
      const dl = d0 < L.plateauR + 320 ? d0 + fbm2(x * 0.004, z * 0.004, 3) * 45 : 1e9;
      if (dl < L.plateauR + 260) {
        const south = clamp((z - L.z) / L.plateauR, 0, 1);
        const ew = lerp(240, 14, Math.pow(south, 0.6));
        const m = smoothstep(L.plateauR + ew, L.plateauR, dl);
        const target = L.level + 14 + fbm2(x * 0.006, z * 0.006, 3) * 6;
        h = lerp(h, Math.max(h, target), m);
      }
    }

    if (info) {
      info.c = c;
      info.J = J;
      info.M = M;
      info.P = Math.max(P, canyonProx);
      info.isl = isl.t;
    }
    return h;
  }

  // ---------- river profile ----------
  const riverPts = resample(catmull(RIVER_PATH, 10), 4);
  // meander offset (not near the lake / falls)
  const riverOrig = riverPts.map((p) => p.slice());
  for (let i = 1; i < riverPts.length - 1; i++) {
    const p = riverPts[i];
    if (p[1] < -650) continue;
    const a = riverOrig[i - 1], b = riverOrig[i + 1];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const m = noise2(i * 0.012, 4.2) * 38 * smoothstep(-650, -450, p[1]);
    p[0] += -tz * m;
    p[1] += tx * m;
  }
  const riverIdx = new PolyIndex(riverPts, 90, 48);
  const riverSurface = new Float32Array(riverPts.length);
  {
    let runMin = 1e9;
    const L = MIRROR_LAKE;
    for (let i = 0; i < riverPts.length; i++) {
      const [x, z] = riverPts[i];
      const inLake = dist(x, z, L.x, L.z) < L.lakeR + 40;
      const h = preHeight(x, z);
      runMin = Math.min(runMin, h - 1.6);
      let s = inLake ? L.level : Math.min(L.level, runMin);
      riverSurface[i] = Math.max(s, -0.4);
    }
    // relax tiny bumps so the river slope is smooth except the falls
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < riverPts.length - 1; i++) {
        const a = riverSurface[i - 1], b = riverSurface[i], c2 = riverSurface[i + 1];
        if (a - c2 < 6) riverSurface[i] = Math.min(b, (a + b + c2) / 3);
      }
    }
  }
  function riverWidth(s) {
    return 7 + 10 * smoothstep(0, riverIdx.length, s);
  }

  // Jade lake level: lowest rim sample
  let jadeLevel;
  {
    let m = 1e9;
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      const x = JADE_LAKE.x + Math.cos(ang) * (JADE_LAKE.r + 30);
      const z = JADE_LAKE.z + Math.sin(ang) * (JADE_LAKE.r + 30);
      m = Math.min(m, preHeight(x, z));
    }
    jadeLevel = m - 1.5;
  }

  const tmpR = {};
  const info = {};

  // Full sample: writes into out {h, water, moist, canyon, volc, wet}
  function carvedHeight(x, z, out) {
    let h = preHeight(x, z, info);
    let water = NO_WATER;
    let wet = 0;

    // Mirror lake basin
    {
      const L = MIRROR_LAKE;
      const d0 = dist(x, z, L.x, L.z);
      const dl = d0 < L.lakeR + 80 ? d0 + fbm2(x * 0.01, z * 0.01, 2) * 22 : 1e9;
      if (dl < L.lakeR + 50) {
        const bowl = smoothstep(L.lakeR + 50, L.lakeR - 8, dl);
        const depth = 2 + 20 * Math.pow(smoothstep(L.lakeR, 0, dl), 0.7);
        h = lerp(h, Math.min(h, L.level - depth), bowl);
        if (dl < L.lakeR + 14) water = L.level;
        wet = Math.max(wet, bowl);
      }
    }
    // Jade lake basin
    {
      const d0 = dist(x, z, JADE_LAKE.x, JADE_LAKE.z);
      const dl = d0 < JADE_LAKE.r + 70 ? d0 + fbm2(x * 0.012, z * 0.012, 2) * 20 : 1e9;
      if (dl < JADE_LAKE.r + 40) {
        const bowl = smoothstep(JADE_LAKE.r + 40, JADE_LAKE.r - 6, dl);
        const depth = 1.5 + 12 * Math.pow(smoothstep(JADE_LAKE.r, 0, dl), 0.7);
        h = lerp(h, Math.min(h, jadeLevel - depth), bowl);
        if (dl < JADE_LAKE.r + 12) water = jadeLevel;
        wet = Math.max(wet, bowl);
      }
    }
    // River channel
    const rn = riverIdx.nearest(x, z, tmpR);
    if (rn && rn.d < 90) {
      const i = rn.i;
      const surf = riverSurface[i] + (riverSurface[i + 1] - riverSurface[i]) * rn.t;
      const W = riverWidth(rn.s);
      if (rn.d < W) {
        const depth = 2.2 + W * 0.13;
        const q = rn.d / W;
        h = Math.min(h, surf - depth * (1 - q * q) - 0.3);
      } else {
        const bank = lerp(surf + 0.5, h, smoothstep(W, W + 38, rn.d));
        if (bank < h) h = bank;
      }
      if (rn.d < W + 3 && surf > 0.05) water = Math.max(water, surf);
      wet = Math.max(wet, 1 - smoothstep(W, W + 70, rn.d));
    }
    out.h = h;
    out.water = water;
    out.wet = wet;
    return out;
  }

  // ruin pads: target heights computed on the carved terrain
  const pads = RUINS.map((r) => {
    const o = {};
    let acc = 0, n = 0;
    for (let a = 0; a < 9; a++) {
      const ang = (a / 9) * Math.PI * 2;
      const rr = a === 0 ? 0 : r.r * 0.6;
      carvedHeight(r.x + Math.cos(ang) * rr, r.z + Math.sin(ang) * rr, o);
      acc += o.h; n++;
    }
    let y = acc / n;
    if (y < 1.5) y = 1.5;
    return { ...r, y };
  });

  const tmpO = {};
  function sample(x, z, out) {
    carvedHeight(x, z, out);
    let h = out.h;
    for (let k = 0; k < pads.length; k++) {
      const p = pads[k];
      const d = dist(x, z, p.x, p.z);
      if (d < p.r * 1.9) {
        const w = smoothstep(p.r * 1.9, p.r * 1.05, d);
        h = lerp(h, p.y, w);
      }
    }
    out.h = h;
    // material masks
    const dv = dist(x, z, VOLCANO.x, VOLCANO.z);
    const volc = smoothstep(VOLCANO.r * 1.1, VOLCANO.r * 0.55, dv + fbm2(x * 0.003, z * 0.003, 2) * 200);
    let moist = 0.42 + fbm2(x * 0.0012 + 40, z * 0.0012, 3) * 0.3 + info.J * 0.55 + info.isl * 0.5
      - info.P * 0.6 - volc * 0.6 + out.wet * 0.25 - info.M * 0.1;
    out.moist = clamp(moist, 0, 1);
    out.canyon = clamp(info.P, 0, 1);
    out.volc = volc;
    out.cont = info.c;
    return out;
  }

  return {
    sample,
    continent,
    preHeight,
    riverPts,
    riverSurface,
    riverWidth,
    riverLength: riverIdx.length,
    riverS: riverIdx.s,
    canyonPts,
    canyonIdx,
    canyonFloor: (s) => canyonFloor(s, canyonIdx.length),
    jadeLevel,
    pads,
    noise: N,
    _tmp: tmpO,
  };
}

// Generate rows [r0, r1) of the world grid.
export function generateRows(gen, r0, r1) {
  const S = WORLD.N + 1;
  const rows = r1 - r0;
  const height = new Float32Array(rows * S);
  const water = new Float32Array(rows * S);
  const masks = new Uint8Array(rows * S * 4);
  const o = {};
  for (let j = r0; j < r1; j++) {
    const z = -WORLD.HALF + j * WORLD.CELL;
    for (let i = 0; i < S; i++) {
      const x = -WORLD.HALF + i * WORLD.CELL;
      gen.sample(x, z, o);
      const k = (j - r0) * S + i;
      height[k] = o.h;
      water[k] = o.water;
      masks[k * 4] = (o.moist * 255) | 0;
      masks[k * 4 + 1] = (o.canyon * 255) | 0;
      masks[k * 4 + 2] = (o.volc * 255) | 0;
      masks[k * 4 + 3] = (o.wet * 255) | 0;
    }
  }
  return { height, water, masks };
}

export { NO_WATER };
