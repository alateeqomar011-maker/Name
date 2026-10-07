// Procedural vegetation assets: painted leaf atlas, bark texture and plant/tree/rock geometries.
import * as THREE from 'three';
import { mulberry32, Simplex } from '../core/noise.js';
import { addWind } from './shaderlib.js';

const TILE = 256;
export const TILES = { BROAD: 0, JUNGLE: 1, CONIFER: 2, FERN: 3, PALM: 4, MOSS: 5, TUFT: 6, BERRY: 7 };

function tileUV(t) {
  const tx = t % 4, ty = Math.floor(t / 4);
  return { u0: tx / 4, u1: (tx + 1) / 4, v0: 1 - (ty + 1) / 2, v1: 1 - ty / 2 };
}

function makeLeafAtlas() {
  const cv = document.createElement('canvas');
  cv.width = TILE * 4; cv.height = TILE * 2;
  const ctx = cv.getContext('2d');
  const rand = mulberry32(42);
  const R = (a, b) => a + (b - a) * rand();
  const leaf = (x, y, len, wid, ang, fill, rib) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
    ctx.fillStyle = fill; ctx.fill();
    if (rib) { ctx.strokeStyle = rib; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke(); }
    ctx.restore();
  };
  const origin = (t) => [(t % 4) * TILE, Math.floor(t / 4) * TILE];

  // 0: broadleaf cluster
  {
    const [ox, oy] = origin(0);
    for (let i = 0; i < 150; i++) {
      const a = R(0, Math.PI * 2), r = Math.sqrt(rand()) * 98;
      const x = ox + 128 + Math.cos(a) * r, y = oy + 128 + Math.sin(a) * r * 0.92;
      const l = R(20, 34);
      const light = R(22, 46);
      leaf(x, y, l, R(7, 11), a + R(-0.9, 0.9), `hsl(${R(88, 112)},${R(38, 58)}%,${light}%)`, `hsla(90,30%,${light + 12}%,0.6)`);
    }
  }
  // 1: jungle leaves (large, glossy)
  {
    const [ox, oy] = origin(1);
    for (let i = 0; i < 46; i++) {
      const a = R(0, Math.PI * 2), r = Math.sqrt(rand()) * 70;
      const x = ox + 128 + Math.cos(a) * r, y = oy + 128 + Math.sin(a) * r;
      const l = R(48, 70);
      const light = R(20, 40);
      leaf(x, y, l, R(14, 22), a + R(-0.5, 0.5), `hsl(${R(95, 125)},${R(45, 65)}%,${light}%)`, `hsla(80,40%,${light + 18}%,0.8)`);
    }
  }
  // 2: conifer branch (horizontal, base at left)
  {
    const [ox, oy] = origin(2);
    ctx.lineCap = 'round';
    const branch = (x0, y0, x1, y1, w, depth) => {
      ctx.strokeStyle = 'hsl(30,30%,22%)'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.floor(len / 2.2);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const nl = (1 - t * 0.6) * (depth ? 10 : 15);
        for (const side of [-1, 1]) {
          const ang = Math.atan2(y1 - y0, x1 - x0) + side * R(0.9, 1.3);
          ctx.strokeStyle = `hsl(${R(115, 140)},${R(30, 45)}%,${R(14, 28)}%)`;
          ctx.lineWidth = R(1.2, 2.2);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * nl, y + Math.sin(ang) * nl); ctx.stroke();
        }
      }
      if (depth > 0) {
        for (let k = 0; k < 7; k++) {
          const t = R(0.1, 0.85);
          const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
          const side = k % 2 ? 1 : -1;
          const l2 = (1 - t) * R(55, 85);
          branch(x, y, x + l2 * 0.8, y + side * l2 * 0.55, 1.5, depth - 1);
        }
      }
    };
    branch(ox + 4, oy + 128, ox + 250, oy + 128, 4, 1);
  }
  // 3: fern frond (vertical, base at bottom)
  {
    const [ox, oy] = origin(3);
    ctx.strokeStyle = 'hsl(85,40%,28%)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ox + 128, oy + 256); ctx.lineTo(ox + 128, oy + 4); ctx.stroke();
    for (let y = 250; y > 8; y -= 7) {
      const t = 1 - y / 256;
      const len = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 110 * (1 - t * 0.35) + 6;
      for (const side of [-1, 1]) {
        const steps = Math.floor(len / 7);
        for (let s = 0; s < steps; s++) {
          const px = ox + 128 + side * (s * 7 + 4), py = oy + y - s * 2.6;
          leaf(px, py, 9 - s * 0.2, 4.5, side > 0 ? -1.2 : Math.PI + 1.2, `hsl(${R(95, 115)},${R(45, 60)}%,${R(24, 38)}%)`);
          leaf(px, py, 9 - s * 0.2, 4.5, side > 0 ? 1.0 : Math.PI - 1.0, `hsl(${R(95, 115)},${R(45, 60)}%,${R(22, 34)}%)`);
        }
      }
    }
  }
  // 4: palm frond
  {
    const [ox, oy] = origin(4);
    ctx.strokeStyle = 'hsl(60,40%,35%)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ox + 128, oy + 256); ctx.lineTo(ox + 128, oy + 2); ctx.stroke();
    for (let y = 250; y > 6; y -= 5) {
      const t = 1 - y / 256;
      const len = (1 - Math.pow(t, 1.6)) * 115 + 10;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(ox + 128, oy + y);
        ctx.rotate(side * (Math.PI / 2 - 0.55));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-3, -len * 0.5, 0, -len);
        ctx.quadraticCurveTo(3, -len * 0.5, 0, 0);
        ctx.fillStyle = `hsl(${R(78, 100)},${R(45, 60)}%,${R(28, 42)}%)`;
        ctx.lineWidth = 4.5; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); ctx.fill();
        ctx.restore();
      }
    }
  }
  // 5: hanging moss strands
  {
    const [ox, oy] = origin(5);
    for (let i = 0; i < 70; i++) {
      const x = ox + R(10, 246);
      const len = R(80, 250);
      ctx.strokeStyle = `hsla(${R(70, 95)},${R(20, 35)}%,${R(28, 45)}%,0.95)`;
      ctx.lineWidth = R(1.5, 4);
      ctx.beginPath(); ctx.moveTo(x, oy);
      ctx.bezierCurveTo(x + R(-10, 10), oy + len * 0.3, x + R(-14, 14), oy + len * 0.7, x + R(-8, 8), oy + len);
      ctx.stroke();
    }
  }
  // 6: needle tuft (araucaria / cycad clumps)
  {
    const [ox, oy] = origin(6);
    for (let i = 0; i < 420; i++) {
      const a = R(0, Math.PI * 2), r0 = R(0, 30), r1 = R(60, 118);
      ctx.strokeStyle = `hsl(${R(100, 130)},${R(30, 50)}%,${R(15, 30)}%)`;
      ctx.lineWidth = R(2, 4);
      ctx.beginPath();
      ctx.moveTo(ox + 128 + Math.cos(a) * r0, oy + 128 + Math.sin(a) * r0);
      ctx.lineTo(ox + 128 + Math.cos(a) * r1, oy + 128 + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
  // 7: berry bush
  {
    const [ox, oy] = origin(7);
    for (let i = 0; i < 160; i++) {
      const a = R(0, Math.PI * 2), r = Math.sqrt(rand()) * 100;
      leaf(ox + 128 + Math.cos(a) * r, oy + 128 + Math.sin(a) * r, R(16, 24), R(6, 9), a + R(-1, 1), `hsl(${R(100, 125)},${R(35, 55)}%,${R(20, 36)}%)`);
    }
    for (let i = 0; i < 26; i++) {
      // small clusters of dark berries tucked between leaves
      const a = R(0, Math.PI * 2), r = Math.sqrt(rand()) * 85;
      const cx = ox + 128 + Math.cos(a) * r, cy = oy + 128 + Math.sin(a) * r;
      for (let k = 0; k < 4; k++) {
        const x = cx + R(-5, 5), y = cy + R(-5, 5);
        const g = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 3.2);
        g.addColorStop(0, '#e86a6a'); g.addColorStop(0.5, '#8a1020'); g.addColorStop(1, '#3a0510');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R(2.2, 3.2), 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function makeBark() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const ctx = cv.getContext('2d');
  const rand = mulberry32(7);
  ctx.fillStyle = '#6b5a48'; ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i++) {
    const x = rand() * 128, w = 1 + rand() * 4;
    const l = 30 + rand() * 120, y = rand() * 256;
    const v = Math.floor(60 + rand() * 70);
    ctx.fillStyle = `rgba(${v},${v * 0.85},${v * 0.7},0.55)`;
    ctx.fillRect(x, y, w, l);
    if (y + l > 256) ctx.fillRect(x, y - 256, w, l);
  }
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = 'rgba(30,22,16,0.7)'; ctx.lineWidth = 1 + rand() * 2;
    const x = rand() * 128;
    ctx.beginPath(); ctx.moveTo(x, rand() * 256);
    ctx.lineTo(x + (rand() - 0.5) * 8, rand() * 256); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ---------- Geometry builder ----------
export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.s = []; this.idx = []; this.count = 0; }
  vert(x, y, z, nx, ny, nz, u, v, col, sway) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v);
    this.c.push(col[0], col[1], col[2]); this.s.push(sway);
    return this.count++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }

  cylinder(p0, p1, r0, r1, seg, col, sway0, sway1, vScale = 1, uRep = 1) {
    const axis = new THREE.Vector3().subVectors(p1, p0);
    const len = axis.length();
    axis.normalize();
    const tmp = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(axis, tmp).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u).normalize();
    const base = this.count;
    for (let ring = 0; ring < 2; ring++) {
      const P = ring ? p1 : p0, r = ring ? r1 : r0;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = u.x * ca + w.x * sa, ny = u.y * ca + w.y * sa, nz = u.z * ca + w.z * sa;
        this.vert(P.x + nx * r, P.y + ny * r, P.z + nz * r, nx, ny, nz, (i / seg) * uRep, ring ? len * vScale : 0, col, ring ? sway1 : sway0);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i, b = base + i + 1, c = base + seg + 1 + i, d = c + 1;
      this.tri(a, c, b); this.tri(b, c, d);
    }
  }

  // Leaf card. center, U = half-extent vector across, V = half-extent vector along tile's vertical
  card(center, U, V, tile, col, sway, normCenter, swayV = null) {
    const t = tileUV(tile);
    const corners = [[-1, -1, t.u0, t.v0], [1, -1, t.u1, t.v0], [1, 1, t.u1, t.v1], [-1, 1, t.u0, t.v1]];
    const base = this.count;
    for (const [a, b, uu, vv] of corners) {
      const x = center.x + U.x * a + V.x * b, y = center.y + U.y * a + V.y * b, z = center.z + U.z * a + V.z * b;
      let nx = x - normCenter.x, ny = y - normCenter.y + 0.6, nz = z - normCenter.z;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.vert(x, y, z, nx / l, ny / l, nz / l, uu, vv, col, swayV ? (b > 0 ? swayV[1] : swayV[0]) : sway);
    }
    this.tri(base, base + 1, base + 2); this.tri(base, base + 2, base + 3);
  }

  cluster(center, radius, count, tile, col, sway, rand) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 1.2 - 0.4, rand() * 2 - 1).normalize();
      const c = center.clone().addScaledVector(dir, radius * 0.45 * rand());
      const a = rand() * Math.PI;
      const tilt = (rand() - 0.5) * 1.6;
      const U = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(radius);
      const V = new THREE.Vector3(-Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt)).multiplyScalar(radius);
      // canopy self-occlusion: inner and lower cards are darker
      const inner = c.distanceTo(center) / (radius * 0.45 + 1e-4);
      const below = (c.y - center.y) / radius;
      const ao = Math.min(1.08, 0.58 + 0.32 * inner + 0.18 * (below + 0.4));
      this.card(c, U, V, tile, [col[0] * ao, col[1] * ao, col[2] * ao], sway, center);
    }
  }

  // Curved frond strip; texture tile is vertical with base at the bottom
  frond(base, dir, len, width, droop, tile, col, sway0, sway1, segs = 6, twist = 0) {
    const t = tileUV(tile);
    const d = dir.clone().normalize();
    const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const start = this.count;
    for (let i = 0; i <= segs; i++) {
      const s = i / segs;
      const P = base.clone().addScaledVector(d, len * s);
      P.y -= droop * len * s * s;
      const tw = twist * s;
      const sd = side.clone().applyAxisAngle(d, tw);
      const w = width * (0.35 + 0.65 * Math.sin(Math.min(1, s * 1.1 + 0.08) * Math.PI));
      const tang = new THREE.Vector3().copy(d).setY(d.y - 2 * droop * s);
      const nrm = new THREE.Vector3().crossVectors(sd, tang).normalize();
      if (nrm.y < 0) nrm.negate();
      nrm.y += 0.5; nrm.normalize();
      const sw = sway0 + (sway1 - sway0) * s;
      const v = t.v0 + (t.v1 - t.v0) * s;
      this.vert(P.x - sd.x * w, P.y - sd.y * w, P.z - sd.z * w, nrm.x, nrm.y, nrm.z, t.u0, v, col, sw);
      this.vert(P.x + sd.x * w, P.y + sd.y * w, P.z + sd.z * w, nrm.x, nrm.y, nrm.z, t.u1, v, col, sw);
    }
    for (let i = 0; i < segs; i++) {
      const a = start + i * 2;
      this.tri(a, a + 1, a + 3); this.tri(a, a + 3, a + 2);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lin = (r, g, b) => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];

// ---------- Plant definitions ----------
function conifer(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 17 + rand() * 4;
  trunk.cylinder(V3(0, -0.6, 0), V3(0, H, 0), 0.5, 0.06, 7, lin(0.75, 0.62, 0.5), 0, 0.5, 0.25, 2);
  const tiers = 13;
  for (let t = 0; t < tiers; t++) {
    const s = t / tiers;
    const y = 3 + s * (H - 3.5);
    const len = (1 - s) * 4.8 + 0.8;
    const n = 7;
    const off = rand() * Math.PI;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.4;
      const d = V3(Math.cos(a), -0.25 - s * 0.1, Math.sin(a)).normalize();
      const center = V3(0, y, 0).addScaledVector(d, len * 0.5);
      const U = d.clone().multiplyScalar(len * 0.55);
      const side = V3(-Math.sin(a), 0.35, Math.cos(a)).normalize().multiplyScalar(len * 0.42);
      const g = 0.75 + rand() * 0.25;
      leaves.card(center, U, side, TILES.CONIFER, [g, g, g], 0.15 + s * 0.6, V3(0, y + 1, 0), null);
    }
  }
  // tip
  leaves.card(V3(0, H + 0.3, 0), V3(0.7, 0, 0), V3(0, 1.0, 0), TILES.TUFT, [1, 1, 1], 0.8, V3(0, H, 0));
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.5, height: H };
}

function oak(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 6 + rand() * 2;
  const bark = lin(0.8, 0.72, 0.62);
  trunk.cylinder(V3(0, -0.6, 0), V3(0, H, 0), 0.75, 0.45, 9, bark, 0, 0.1, 0.25, 2);
  const tips = [V3(0, H + 4.5, 0)];
  const nb = 5;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rand() * 0.6;
    const y0 = H - 1.5 + rand() * 1.5;
    const tip = V3(Math.cos(a) * (3.5 + rand() * 2), y0 + 2.5 + rand() * 2.5, Math.sin(a) * (3.5 + rand() * 2));
    trunk.cylinder(V3(0, y0, 0), tip, 0.38, 0.12, 6, bark, 0.1, 0.4, 0.25);
    tips.push(tip);
  }
  for (const tip of tips) {
    leaves.cluster(tip.clone().add(V3(0, 0.8, 0)), 3.0 + rand() * 0.8, 9, TILES.BROAD, [1, 1, 1], 0.6, rand);
  }
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2, r = 2 + rand() * 3;
    leaves.cluster(V3(Math.cos(a) * r, H + 2 + rand() * 3.5, Math.sin(a) * r), 2.6, 6, TILES.BROAD, [0.9, 0.95, 0.9], 0.7, rand);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.75, height: H + 7 };
}

function kapok(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 24 + rand() * 6;
  const bark = lin(0.85, 0.82, 0.72);
  trunk.cylinder(V3(0, -1, 0), V3(0, H, 0), 1.2, 0.6, 10, bark, 0, 0.1, 0.2, 3);
  // buttress roots
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.3;
    trunk.cylinder(V3(Math.cos(a) * 3.2, -0.8, Math.sin(a) * 3.2), V3(Math.cos(a) * 0.5, 4.5, Math.sin(a) * 0.5), 0.35, 0.25, 5, bark, 0, 0, 0.2);
  }
  // branches + umbrella canopy
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.5;
    const r = 6 + rand() * 4;
    const tip = V3(Math.cos(a) * r, H + 2 + rand() * 2, Math.sin(a) * r);
    trunk.cylinder(V3(0, H - 2, 0), tip, 0.5, 0.2, 6, bark, 0.05, 0.3, 0.2);
    leaves.cluster(tip.clone().add(V3(0, 1, 0)), 4.2, 9, TILES.JUNGLE, [1, 1, 1], 0.4, rand);
    // vines
    const vb = tip.clone().add(V3(0, -0.5, 0));
    leaves.card(vb.clone().add(V3(0, -4, 0)), V3(1.2, 0, 0), V3(0, 4, 0), TILES.MOSS, [0.75, 0.9, 0.7], 0.5, vb, [0.9, 0.3]);
  }
  leaves.cluster(V3(0, H + 3, 0), 5, 10, TILES.JUNGLE, [0.95, 1, 0.95], 0.4, rand);
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 1.3, height: H + 6 };
}

function palm(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 9 + rand() * 4;
  const bend = 1.5 + rand() * 2.5;
  const segs = 8;
  let prev = V3(0, -0.5, 0);
  for (let i = 1; i <= segs; i++) {
    const s = i / segs;
    const p = V3(bend * s * s, H * s, 0);
    trunk.cylinder(prev, p, 0.36 - s * 0.12 + 0.04, 0.34 - s * 0.12, 7, lin(0.82, 0.74, 0.6), (s - 1 / segs) * 0.25, s * 0.25, 0.6, 2);
    prev = p;
  }
  const top = prev;
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.3;
    const d = V3(Math.cos(a), 0.35 + rand() * 0.25, Math.sin(a));
    leaves.frond(top, d, 5.5 + rand() * 1.5, 1.4, 0.32 + rand() * 0.15, TILES.PALM, [1, 1, 1], 0.3, 1.0, 7, 0.3);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.4, height: H + 2 };
}

function treeFern(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 3 + rand() * 2.5;
  trunk.cylinder(V3(0, -0.4, 0), V3(0.2, H, 0), 0.35, 0.28, 7, lin(0.45, 0.35, 0.25), 0, 0.12, 0.5);
  const top = V3(0.2, H, 0);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const d = V3(Math.cos(a), 0.55 + rand() * 0.4, Math.sin(a));
    leaves.frond(top, d, 3.4 + rand() * 1.2, 0.85, 0.3, TILES.FERN, [1, 1, 1], 0.15, 0.9, 6);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.35, height: H + 2 };
}

function cypress(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 13 + rand() * 4;
  const bark = lin(0.66, 0.6, 0.52);
  trunk.cylinder(V3(0, -1, 0), V3(0, 2.5, 0), 1.6, 0.6, 9, bark, 0, 0, 0.25, 2);
  trunk.cylinder(V3(0, 2.5, 0), V3(0, H, 0), 0.6, 0.2, 8, bark, 0, 0.3, 0.25, 2);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const y = H * (0.45 + rand() * 0.55);
    const r = 1.5 + rand() * 3.2;
    const c = V3(Math.cos(a) * r, y, Math.sin(a) * r);
    trunk.cylinder(V3(0, y - 1.5, 0), c, 0.22, 0.08, 5, bark, 0.1, 0.4, 0.25);
    leaves.cluster(c, 2.4, 6, TILES.CONIFER, [0.8, 0.85, 0.65], 0.55, rand);
    leaves.card(c.clone().add(V3(0, -2.2, 0)), V3(0.9, 0, 0.3), V3(0, 2.2, 0), TILES.MOSS, [0.85, 0.85, 0.7], 0.6, c, [0.9, 0.4]);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.9, height: H + 2 };
}

function araucaria(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 22 + rand() * 6;
  const bark = lin(0.72, 0.62, 0.52);
  trunk.cylinder(V3(0, -0.8, 0), V3(0, H, 0), 0.65, 0.18, 8, bark, 0, 0.25, 0.2, 2);
  const tiers = 6;
  for (let t = 0; t < tiers; t++) {
    const y = H * 0.62 + (t / tiers) * H * 0.38;
    const len = 3.6 - t * 0.45;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.5;
      const tip = V3(Math.cos(a) * len, y + 0.6, Math.sin(a) * len);
      trunk.cylinder(V3(0, y, 0), tip, 0.13, 0.06, 4, bark, 0.2, 0.6, 0.2);
      leaves.card(tip.clone().add(V3(0, 0.25, 0)), V3(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7), V3(-Math.sin(a) * 1.4, 0.2, Math.cos(a) * 1.4), TILES.TUFT, [1, 1, 1], 0.7, V3(0, y - 2, 0));
      leaves.card(tip.clone().add(V3(0, 0.3, 0)), V3(-Math.sin(a) * 1.5, 0.1, Math.cos(a) * 1.5), V3(0, 0.9, 0), TILES.TUFT, [0.9, 0.9, 0.9], 0.7, V3(0, y - 2, 0));
    }
  }
  leaves.cluster(V3(0, H + 0.5, 0), 1.6, 4, TILES.TUFT, [1, 1, 1], 0.7, rand);
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.65, height: H + 2 };
}

function deadTree(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 5 + rand() * 4;
  const bark = lin(0.55, 0.5, 0.46);
  trunk.cylinder(V3(0, -0.5, 0), V3(0.3, H, 0.1), 0.45, 0.2, 7, bark, 0, 0.05, 0.25);
  const grow = (p, d, len, r, depth) => {
    const e = p.clone().addScaledVector(d, len);
    trunk.cylinder(p, e, r, r * 0.6, 5, bark, 0.05, 0.12, 0.25);
    if (depth > 0) {
      for (let k = 0; k < 2; k++) {
        const nd = d.clone().add(V3(rand() - 0.5, rand() * 0.5, rand() - 0.5)).normalize();
        grow(e, nd, len * 0.65, r * 0.6, depth - 1);
      }
    }
  };
  for (let i = 0; i < 3; i++) grow(V3(0.3, H * (0.6 + i * 0.15), 0.1), V3(rand() - 0.5, 0.7, rand() - 0.5).normalize(), 2.5, 0.2, 2);
  // a few dry tufts so the leaves mesh is never empty
  leaves.card(V3(0.3, H + 0.5, 0.1), V3(0.4, 0, 0), V3(0, 0.4, 0), TILES.TUFT, [0.55, 0.45, 0.3], 0.3, V3(0, H, 0));
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.45, height: H + 3 };
}

function cycad(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const H = 1.2 + rand() * 1.2;
  trunk.cylinder(V3(0, -0.3, 0), V3(0, H, 0), 0.5, 0.42, 8, lin(0.55, 0.45, 0.3), 0, 0.05, 0.6);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const d = V3(Math.cos(a), 0.7 + rand() * 0.5, Math.sin(a));
    leaves.frond(V3(0, H, 0), d, 2.2 + rand() * 0.6, 0.55, 0.12, TILES.FERN, [0.8, 0.95, 0.75], 0.1, 0.6, 4);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.5, height: H + 1.5 };
}

function fernBush(seed) {
  const rand = mulberry32(seed);
  const leaves = new GeoBuilder();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rand() * 0.5;
    const d = V3(Math.cos(a), 0.9 + rand() * 0.6, Math.sin(a));
    leaves.frond(V3(0, 0, 0), d, 1.3 + rand() * 0.6, 0.38, 0.35, TILES.FERN, [1, 1, 1], 0.05, 0.7, 4);
  }
  return { leaves: leaves.build(), radius: 0 };
}

function shrub(seed, tile = TILES.BROAD) {
  const rand = mulberry32(seed);
  const leaves = new GeoBuilder();
  leaves.cluster(V3(0, 0.8, 0), 1.2, 7, tile, [1, 1, 1], 0.3, rand);
  leaves.cluster(V3(0.6, 0.5, 0.3), 0.9, 4, tile, [0.92, 0.95, 0.9], 0.3, rand);
  leaves.cluster(V3(-0.5, 0.5, -0.4), 0.9, 4, tile, [0.92, 0.95, 0.9], 0.3, rand);
  return { leaves: leaves.build(), radius: 0 };
}

function horsetail(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder();
  for (let i = 0; i < 12; i++) {
    const x = (rand() - 0.5) * 1.4, z = (rand() - 0.5) * 1.4;
    const h = 1 + rand() * 1.4;
    const lean = V3((rand() - 0.5) * 0.4, h, (rand() - 0.5) * 0.4);
    trunk.cylinder(V3(x, -0.1, z), V3(x, -0.1, z).add(lean), 0.035, 0.018, 4, lin(0.45, 0.6, 0.3), 0, 0.5, 2, 1);
  }
  return { trunk: trunk.build(), radius: 0 };
}

function scrub(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder();
  const leaves = new GeoBuilder();
  for (let i = 0; i < 9; i++) {
    const d = V3(rand() - 0.5, 0.6 + rand() * 0.5, rand() - 0.5).normalize();
    trunk.cylinder(V3(0, 0, 0), d.clone().multiplyScalar(0.8 + rand() * 0.6), 0.04, 0.015, 3, lin(0.5, 0.42, 0.32), 0, 0.3, 1);
  }
  leaves.cluster(V3(0, 0.6, 0), 0.7, 4, TILES.TUFT, [0.7, 0.6, 0.35], 0.3, rand);
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0 };
}

export function rockGeometry(seed, detail = 3, squash = 0.7, ore = false) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const nz = new Simplex(seed);
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = nz.fbm(v.x * 1.3 + seed, v.y * 1.3 + v.z * 0.7, 4) * 0.32 + nz.noise(v.x * 4, v.z * 4 + v.y) * 0.05;
    const r = 1 + n;
    v.multiplyScalar(r);
    v.y *= squash;
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
    let c = 0.42 + n * 0.5 + (v.y > 0.3 ? 0.06 : 0);
    let rC = c, gC = c * 0.97, bC = c * 0.92;
    if (ore) {
      const vein = Math.abs(nz.noise(v.x * 3.5, v.y * 3.5 + v.z * 2));
      if (vein < 0.12) { rC = 0.75; gC = 0.45; bC = 0.2; }
      else if (vein < 0.2) { rC = 0.55; gC = 0.55; bC = 0.6; }
    }
    cols[i * 3] = Math.pow(rC, 2.2); cols[i * 3 + 1] = Math.pow(gC, 2.2); cols[i * 3 + 2] = Math.pow(bC, 2.2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---------- Library ----------
export class FloraLibrary {
  constructor() {
    this.atlas = makeLeafAtlas();
    this.bark = makeBark();
    this.leafMat = addWind(new THREE.MeshStandardMaterial({
      map: this.atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, metalness: 0,
    }), 1.0, true);
    this.leafMat.alphaToCoverage = true;
    this.trunkMat = addWind(new THREE.MeshStandardMaterial({ map: this.bark, vertexColors: true, roughness: 0.95 }), 0.6);
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.oreMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    this.types = {
      conifer: conifer(11), conifer2: conifer(12), oak: oak(21), oak2: oak(22), kapok: kapok(31), palm: palm(41), palm2: palm(42),
      treefern: treeFern(51), cypress: cypress(61), araucaria: araucaria(71), dead: deadTree(81), cycad: cycad(91),
      fern: fernBush(101), shrub: shrub(111), berry: shrub(121, TILES.BERRY), horsetail: horsetail(131), scrub: scrub(141),
      jungleshrub: shrub(151, TILES.JUNGLE),
    };
    this.rocks = [rockGeometry(1, 3, 0.75), rockGeometry(2, 3, 0.6), rockGeometry(3, 2, 0.9)];
    this.oreRock = rockGeometry(9, 3, 0.8, true);
  }
}
