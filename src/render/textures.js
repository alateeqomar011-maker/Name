// Procedurally generated textures (no external assets required).
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

// ---------- tileable noise primitives ----------
function makeLattice(period, seed) {
  const r = mulberry32(seed);
  const a = new Float32Array(period * period);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}
function valueNoiseTile(lat, period, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = lat[y0 * period + x0], b = lat[y0 * period + x1], c = lat[y1 * period + x0], d = lat[y1 * period + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm over a tile of `size` pixels; base period in lattice cells
function tileFbm(size, basePeriod, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  const lats = [];
  for (let o = 0; o < octaves; o++) lats.push(makeLattice(basePeriod << o, seed + o * 101));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const p = basePeriod << o;
      s += valueNoiseTile(lats[o], p, (x / size) * p, (y / size) * p) * amp;
      norm += amp;
      amp *= gain;
    }
    out[y * size + x] = s / norm;
  }
  return out;
}
function tileWorley(size, cells, seed) {
  const r = mulberry32(seed);
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) { pts[i * 2] = r(); pts[i * 2 + 1] = r(); }
  const out = new Float32Array(size * size);
  const out2 = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    let d1 = 9, d2 = 9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox, gy = cy + oy;
      const wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells;
      const px = gx + pts[(wy * cells + wx) * 2], py = gy + pts[(wy * cells + wx) * 2 + 1];
      const d = Math.hypot(px - fx, py - fy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    out[y * size + x] = d1;
    out2[y * size + x] = d2 - d1;
  }
  return { f1: out, edge: out2 };
}

function heightToNormal(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    const k = (y * size + x) * 4;
    data[k] = (nx * 0.5 + 0.5) * 255;
    data[k + 1] = (ny * 0.5 + 0.5) * 255;
    data[k + 2] = (nz * 0.5 + 0.5) * 255;
    data[k + 3] = 255;
  }
  return data;
}

function dataTex(data, size, opts = {}) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = opts.anisotropy || 8;
  if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = {};

// R: low-freq fbm, G: high-freq fbm, B: worley edge, A: worley F1
export function noiseTexture() {
  if (cache.noise) return cache.noise;
  const size = 256;
  const a = tileFbm(size, 4, 5, 11);
  const b = tileFbm(size, 16, 4, 77);
  const w = tileWorley(size, 12, 5);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = a[i] * 255;
    data[i * 4 + 1] = b[i] * 255;
    data[i * 4 + 2] = Math.min(1, w.edge[i] * 3) * 255;
    data[i * 4 + 3] = Math.min(1, w.f1[i]) * 255;
  }
  return (cache.noise = dataTex(data, size));
}

// Generic ground/rock detail normal map
export function detailNormalTexture() {
  if (cache.detailN) return cache.detailN;
  const size = 512;
  const h = tileFbm(size, 8, 6, 31, 0.55);
  const w = tileWorley(size, 24, 9);
  for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.8 + Math.min(1, w.edge[i] * 2.5) * 0.2;
  return (cache.detailN = dataTex(heightToNormal(h, size, 9), size));
}

// Cloud weather map (R: large shapes, G: detail)
export function cloudMapTexture() {
  if (cache.cloud) return cache.cloud;
  const size = 512;
  const a = tileFbm(size, 4, 6, 123, 0.55);
  const b = tileFbm(size, 8, 5, 321, 0.5);
  const w = tileWorley(size, 10, 17);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const worley = 1 - Math.min(1, w.f1[i] * 1.3);
    data[i * 4] = Math.min(1, Math.max(0, (a[i] - 0.5) * 1.7 + 0.5) * 0.7 + worley * 0.3) * 255;
    data[i * 4 + 1] = b[i] * 255;
    data[i * 4 + 2] = worley * 255;
    data[i * 4 + 3] = 255;
  }
  const t = dataTex(data, size);
  t.anisotropy = 1;
  return (cache.cloud = t);
}

// 3D tileable noise for volumetric clouds (R: perlin-worley, G: worley fbm)
export function cloud3DTexture() {
  if (cache.cloud3d) return cache.cloud3d;
  const N = 64;
  const data = new Uint8Array(N * N * N * 4);
  const rnd = mulberry32(999);
  // value lattice 3D periodic
  const P = 8;
  const lat = new Float32Array(P * P * P * 4);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const vn = (x, y, z, p, off) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const idx = (a, b, c) => {
      a = ((a % p) + p) % p; b = ((b % p) + p) % p; c = ((c % p) + p) % p;
      return lat[(((a * 7 + b * 13 + c * 29 + off) % (P * P * P * 4)) + P * P * P * 4) % (P * P * P * 4)];
    };
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(idx(xi, yi, zi), idx(xi + 1, yi, zi), u), l(idx(xi, yi + 1, zi), idx(xi + 1, yi + 1, zi), u), v),
      l(l(idx(xi, yi, zi + 1), idx(xi + 1, yi, zi + 1), u), l(idx(xi, yi + 1, zi + 1), idx(xi + 1, yi + 1, zi + 1), u), v),
      w
    );
  };
  // worley 3D periodic
  const mkPts = (cells) => {
    const a = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    return a;
  };
  const wc = [4, 8, 16].map((c) => ({ c, p: mkPts(c) }));
  const worley = (x, y, z, W) => {
    const c = W.c;
    const fx = x * c, fy = y * c, fz = z * c;
    const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
    let d1 = 9;
    for (let oz = -1; oz <= 1; oz++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox, gy = cy + oy, gz = cz + oz;
      const wx = ((gx % c) + c) % c, wy = ((gy % c) + c) % c, wz = ((gz % c) + c) % c;
      const k = ((wz * c + wy) * c + wx) * 3;
      const dx = gx + W.p[k] - fx, dy = gy + W.p[k + 1] - fy, dz = gz + W.p[k + 2] - fz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < d1) d1 = d;
    }
    return 1 - Math.min(1, Math.sqrt(d1));
  };
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    let perlin = 0, amp = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      const p = 4 << o;
      perlin += vn(u * p, v * p, w * p, p, o * 17) * amp;
      norm += amp;
      amp *= 0.5;
    }
    perlin /= norm;
    const w1 = worley(u, v, w, wc[0]), w2 = worley(u, v, w, wc[1]), w3 = worley(u, v, w, wc[2]);
    const wfbm = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
    // perlin-worley remap
    const pw = Math.max(0, Math.min(1, (perlin - (1 - wfbm)) / (1 - (1 - wfbm) + 1e-4) * 0.5 + perlin * 0.5));
    const k = ((z * N + y) * N + x) * 4;
    data[k] = pw * 255;
    data[k + 1] = wfbm * 255;
    data[k + 2] = w2 * 255;
    data[k + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return (cache.cloud3d = t);
}

function canvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  return c;
}
function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Bark albedo + normal
export function barkTextures() {
  if (cache.bark) return cache.bark;
  const size = 256;
  const h = new Float32Array(size * size);
  const n1 = tileFbm(size, 4, 4, 55);
  const n2 = tileFbm(size, 32, 3, 56);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const ridges = Math.abs(Math.sin((x / size) * Math.PI * 14 + n1[i] * 9));
    h[i] = ridges * 0.6 + n2[i] * 0.4;
  }
  const albedo = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = 0.55 + h[i] * 0.45;
    albedo[i * 4] = 255 * v;
    albedo[i * 4 + 1] = 255 * v * 0.92;
    albedo[i * 4 + 2] = 255 * v * 0.85;
    albedo[i * 4 + 3] = 255;
  }
  const map = dataTex(albedo, size);
  const normal = dataTex(heightToNormal(h, size, 6), size);
  return (cache.bark = { map, normal });
}

// Foliage atlas: different leaf cluster styles drawn into a 2x2 atlas with alpha.
// 0: broadleaf cluster, 1: conifer needles, 2: palm/fern frond, 3: grass/fern leaflets
export function foliageTexture() {
  if (cache.foliage) return cache.foliage;
  const S = 1024, H = S / 2;
  const c = canvas(S);
  const g = c.getContext('2d');
  const rnd = mulberry32(42);
  g.clearRect(0, 0, S, S);
  const leafCol = (k) => {
    const l = 30 + rnd() * 22;
    const s = 45 + rnd() * 25;
    const hue = 85 + rnd() * 30;
    return `hsl(${hue},${s}%,${l * k}%)`;
  };
  // 0 broadleaf
  g.save();
  g.beginPath(); g.rect(0, 0, H, H); g.clip();
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * H * 0.42;
    const x = H / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r;
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI * 2);
    const L = 18 + rnd() * 26;
    g.fillStyle = leafCol(0.7 + (1 - r / (H * 0.42)) * 0.6);
    g.beginPath();
    g.ellipse(0, 0, L * 0.38, L, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(20,40,10,0.35)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -L); g.lineTo(0, L); g.stroke();
    g.restore();
  }
  g.restore();
  // 1 conifer needles: dense branch sprays
  g.save();
  g.beginPath(); g.rect(H, 0, H, H); g.clip();
  for (let b = 0; b < 26; b++) {
    const x0 = H + H * 0.5 + (rnd() - 0.5) * H * 0.2, y0 = H * 0.1 + rnd() * H * 0.8;
    const ang = (rnd() - 0.5) * 1.2 + (rnd() < 0.5 ? 0 : Math.PI);
    const len = H * (0.25 + rnd() * 0.25);
    for (let s = 0; s < 40; s++) {
      const t = s / 40;
      const px = x0 + Math.cos(ang) * len * t, py = y0 + Math.sin(ang) * len * t;
      for (let k = -1; k <= 1; k += 2) {
        g.strokeStyle = `hsl(${120 + rnd() * 25},${35 + rnd() * 20}%,${16 + rnd() * 16}%)`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(px, py);
        const na = ang + k * (0.9 + rnd() * 0.3);
        const nl = (1 - t * 0.6) * (12 + rnd() * 8);
        g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
        g.stroke();
      }
    }
  }
  g.restore();
  // 2 frond (palm / fern): central rachis with leaflets, pointing up (v=1 tip)
  g.save();
  g.beginPath(); g.rect(0, H, H, H); g.clip();
  {
    const cx = H / 2;
    g.strokeStyle = 'hsl(80,35%,22%)';
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx, S - 4); g.quadraticCurveTo(cx + 10, H + H * 0.5, cx, H + 6); g.stroke();
    for (let i = 0; i < 46; i++) {
      const t = i / 46;
      const y = S - 8 - t * (H - 16);
      const L = Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) * H * 0.46;
      for (let k = -1; k <= 1; k += 2) {
        g.fillStyle = `hsl(${88 + rnd() * 26},${45 + rnd() * 15}%,${22 + rnd() * 12}%)`;
        g.beginPath();
        g.moveTo(cx, y);
        g.quadraticCurveTo(cx + k * L * 0.5, y - 10, cx + k * L, y + 14 + t * 10);
        g.quadraticCurveTo(cx + k * L * 0.5, y + 4, cx, y + 5);
        g.fill();
      }
    }
  }
  g.restore();
  // 3 grass blades / small leaflets
  g.save();
  g.beginPath(); g.rect(H, H, H, H); g.clip();
  for (let i = 0; i < 90; i++) {
    const x = H + 20 + rnd() * (H - 40);
    const hgt = H * (0.5 + rnd() * 0.45);
    const bend = (rnd() - 0.5) * 60;
    const grd = g.createLinearGradient(0, S, 0, S - hgt);
    grd.addColorStop(0, `hsl(${70 + rnd() * 20},40%,14%)`);
    grd.addColorStop(1, `hsl(${75 + rnd() * 30},50%,${32 + rnd() * 18}%)`);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x - 5, S);
    g.quadraticCurveTo(x + bend * 0.5, S - hgt * 0.5, x + bend, S - hgt);
    g.quadraticCurveTo(x + bend * 0.5 + 2, S - hgt * 0.5, x + 5, S);
    g.fill();
  }
  g.restore();
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (cache.foliage = t);
}

// Reptile scale textures: albedo modulation (grey), normal, both tileable
export function scaleTextures(kind = 'scales') {
  const key = 'scales_' + kind;
  if (cache[key]) return cache[key];
  const size = 512;
  const cells = kind === 'feathers' ? 28 : kind === 'smooth' ? 40 : 22;
  const w = tileWorley(size, cells, kind.length * 13 + 3);
  const w2 = tileWorley(size, cells * 3, 91);
  const f = tileFbm(size, 8, 4, 12);
  const h = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let v;
    if (kind === 'feathers') {
      const streak = Math.abs(Math.sin((y / size) * Math.PI * 90 + f[i] * 6));
      v = Math.min(1, w.edge[i] * 2.2) * 0.4 + streak * 0.35 + f[i] * 0.25;
    } else if (kind === 'smooth') {
      v = Math.min(1, w.edge[i] * 4) * 0.3 + f[i] * 0.7;
    } else {
      const bump = Math.min(1, w.edge[i] * 3.5);
      const small = Math.min(1, w2.edge[i] * 3) * 0.35;
      v = Math.pow(bump, 0.6) * 0.7 + small + f[i] * 0.15;
    }
    h[i] = v;
    const a = 0.62 + v * 0.38 + (f[i] - 0.5) * 0.25;
    alb[i * 4] = alb[i * 4 + 1] = alb[i * 4 + 2] = Math.max(0, Math.min(255, a * 255));
    alb[i * 4 + 3] = 255;
  }
  const res = {
    map: dataTex(alb, size),
    normal: dataTex(heightToNormal(h, size, kind === 'smooth' ? 4 : 10), size),
  };
  return (cache[key] = res);
}

// Stone blocks for ruins (albedo + normal)
export function stoneTextures() {
  if (cache.stone) return cache.stone;
  const size = 512;
  const f = tileFbm(size, 8, 5, 202);
  const f2 = tileFbm(size, 32, 3, 203);
  const h = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  const rows = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const row = Math.floor((y / size) * rows);
    const off = (row % 2) * 0.5;
    const bx = ((x / size) * 2 + off) % 1, by = ((y / size) * rows) % 1;
    const edge = Math.min(bx, 1 - bx, (by) * 0.5, (1 - by) * 0.5) * 2;
    const mortar = Math.min(1, edge * 14);
    h[i] = mortar * (0.75 + f[i] * 0.25) + f2[i] * 0.08;
    const moss = Math.max(0, f[i] - 0.55) * 2.2 * (1 - mortar * 0.5);
    const base = 0.58 + f[i] * 0.3 + f2[i] * 0.1;
    let r = base * 0.86, g = base * 0.82, b = base * 0.72;
    r = r * (1 - moss) + 0.22 * moss;
    g = g * (1 - moss) + 0.32 * moss;
    b = b * (1 - moss) + 0.12 * moss;
    const m = 0.45 + mortar * 0.55;
    alb[i * 4] = r * m * 255;
    alb[i * 4 + 1] = g * m * 255;
    alb[i * 4 + 2] = b * m * 255;
    alb[i * 4 + 3] = 255;
  }
  return (cache.stone = { map: dataTex(alb, size, { srgb: true }), normal: dataTex(heightToNormal(h, size, 7), size) });
}

// Prehistoric cave painting (ochre silhouettes) with alpha
export function cavePaintingTexture(seed = 1) {
  const key = 'paint' + seed;
  if (cache[key]) return cache[key];
  const c = canvas(512, 256);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed * 77);
  g.clearRect(0, 0, 512, 256);
  const ochre = ['rgba(150,50,25,0.85)', 'rgba(120,35,20,0.8)', 'rgba(40,25,20,0.8)', 'rgba(170,95,40,0.8)'];
  // long-necked sauropod
  const sauropod = (x, y, s) => {
    g.beginPath();
    g.ellipse(x, y, 34 * s, 16 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 7 * s;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + 26 * s, y - 6 * s); g.quadraticCurveTo(x + 46 * s, y - 40 * s, x + 56 * s, y - 62 * s); g.stroke();
    g.beginPath(); g.ellipse(x + 59 * s, y - 64 * s, 7 * s, 4 * s, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - 30 * s, y); g.quadraticCurveTo(x - 60 * s, y + 4 * s, x - 82 * s, y + 18 * s); g.stroke();
    for (const lx of [-20, -8, 14, 24]) { g.beginPath(); g.moveTo(x + lx * s, y + 8 * s); g.lineTo(x + lx * s, y + 34 * s); g.stroke(); }
  };
  const theropod = (x, y, s) => {
    g.lineWidth = 6 * s;
    g.lineCap = 'round';
    g.beginPath(); g.ellipse(x, y, 22 * s, 11 * s, -0.15, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x + 16 * s, y - 6 * s); g.lineTo(x + 30 * s, y - 20 * s); g.stroke();
    g.beginPath(); g.ellipse(x + 36 * s, y - 22 * s, 11 * s, 6 * s, 0.1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - 18 * s, y); g.lineTo(x - 52 * s, y - 6 * s); g.stroke();
    g.beginPath(); g.moveTo(x - 4 * s, y + 8 * s); g.lineTo(x - 10 * s, y + 30 * s); g.stroke();
    g.beginPath(); g.moveTo(x + 6 * s, y + 8 * s); g.lineTo(x + 12 * s, y + 30 * s); g.stroke();
  };
  const hunter = (x, y, s) => {
    g.lineWidth = 3 * s;
    g.beginPath(); g.arc(x, y - 18 * s, 4 * s, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x, y - 14 * s); g.lineTo(x, y); g.lineTo(x - 5 * s, y + 12 * s); g.moveTo(x, y); g.lineTo(x + 5 * s, y + 12 * s);
    g.moveTo(x, y - 9 * s); g.lineTo(x + 10 * s, y - 14 * s); g.moveTo(x + 10 * s, y - 24 * s); g.lineTo(x + 6 * s, y + 2 * s); g.stroke();
  };
  for (let i = 0; i < 6; i++) {
    g.fillStyle = g.strokeStyle = ochre[Math.floor(rnd() * ochre.length)];
    const x = 50 + rnd() * 410, y = 70 + rnd() * 150, s = 0.6 + rnd() * 0.6;
    const k = rnd();
    if (k < 0.35) sauropod(x, y, s);
    else if (k < 0.7) theropod(x, y, s);
    else for (let j = 0; j < 3; j++) hunter(x + j * 16, y, s);
  }
  // handprints
  for (let i = 0; i < 5; i++) {
    g.fillStyle = 'rgba(160,60,30,0.7)';
    const x = 30 + rnd() * 450, y = 20 + rnd() * 60;
    g.beginPath(); g.ellipse(x, y, 7, 9, 0, 0, Math.PI * 2); g.fill();
    for (let f = 0; f < 5; f++) {
      const a = -Math.PI / 2 + (f - 2) * 0.38;
      g.beginPath(); g.ellipse(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 2, 5, a + Math.PI / 2, 0, Math.PI * 2); g.fill();
    }
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (cache[key] = t);
}

// Glyph texture for artifacts / altar
export function glyphTexture(seed = 3) {
  const key = 'glyph' + seed;
  if (cache[key]) return cache[key];
  const c = canvas(256);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed * 31);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 5;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    const a = rnd() * Math.PI * 2;
    const r1 = 20 + rnd() * 60;
    g.moveTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
    for (let k = 0; k < 3; k++) {
      const b = rnd() * Math.PI * 2, r2 = 10 + rnd() * 80;
      g.lineTo(128 + Math.cos(b) * r2, 128 + Math.sin(b) * r2);
    }
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.arc(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92, 5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  }
  const t = canvasTex(c, false);
  return (cache[key] = t);
}
