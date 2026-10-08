// Procedural vegetation assets: painted leaf atlas, bark texture and plant/tree/rock geometries.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TerrainTextures, GLSL_PHOTO, photoUniforms } from './materials.js';
import { mulberry32, Simplex } from '../core/noise.js';
import { addWind, foliageDepthMaterial, U } from './shaderlib.js';
import { atmospherePatch } from './atmosphere.js';

const TILE = 256;
export const TILES = { BROAD: 0, JUNGLE: 1, CONIFER: 2, FERN: 3, PALM: 4, MOSS: 5, TUFT: 6, BERRY: 7, SPRAY: 8, BROAD2: 9, TWIG: 10, NEEDLE: 11 };
const ROWS = 3;

function tileUV(t) {
  const tx = t % 4, ty = Math.floor(t / 4);
  return { u0: tx / 4, u1: (tx + 1) / 4, v0: 1 - (ty + 1) / ROWS, v1: 1 - ty / ROWS };
}

function makeLeafAtlas() {
  const cv = document.createElement('canvas');
  cv.width = TILE * 4; cv.height = TILE * ROWS;
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
  // 8: conifer spray, vertical with the base at the bottom: a woody axis, side branchlets and
  // dense needles, darker inside, fresh pale-green growth at the tips
  {
    const [ox, oy] = origin(8);
    ctx.lineCap = 'round';
    const needles = (x0, y0, x1, y1, nl, dens) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.floor(len / dens);
      const ang0 = Math.atan2(y1 - y0, x1 - x0);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const l = nl * (1 - t * 0.45);
        const tipK = Math.max(0, (t - 0.7) / 0.3);
        for (const side of [-1, 1]) {
          const a = ang0 + side * R(0.55, 1.05);
          ctx.strokeStyle = `hsl(${R(118, 138) - tipK * 30},${R(30, 48) + tipK * 15}%,${R(13, 24) + tipK * 18}%)`;
          ctx.lineWidth = R(1.1, 2.0);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
        }
      }
    };
    const cx = ox + 128;
    // main axis
    ctx.strokeStyle = 'hsl(28,30%,20%)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, oy + 254); ctx.lineTo(cx, oy + 6); ctx.stroke();
    for (let k = 0; k < 9; k++) {
      const t = 0.1 + k * 0.095;
      const y = oy + 254 - t * 248;
      const reach = Math.sin(Math.min(1, t * 1.25) * Math.PI) * 92 * (1 - t * 0.3) + 14;
      for (const side of [-1, 1]) {
        const x1 = cx + side * reach, y1 = y - reach * R(0.45, 0.7);
        ctx.strokeStyle = 'hsl(28,28%,22%)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x1, y1); ctx.stroke();
        needles(cx, y, x1, y1, R(11, 15), 2.0);
      }
    }
    needles(cx, oy + 254, cx, oy + 6, 15, 1.8);
  }
  // 9: dense broadleaf cluster, smaller overlapping leaves with sunlit rims
  {
    const [ox, oy] = origin(9);
    for (let i = 0; i < 230; i++) {
      const a = R(0, Math.PI * 2), r = Math.pow(rand(), 0.6) * 104;
      const x = ox + 128 + Math.cos(a) * r, y = oy + 128 + Math.sin(a) * r * 0.9;
      const edge = r / 104;
      const light = R(18, 34) + edge * 14;
      leaf(x, y, R(14, 24), R(5, 8.5), a + R(-1.1, 1.1), `hsl(${R(82, 108)},${R(35, 55)}%,${light}%)`, `hsla(85,30%,${light + 10}%,0.5)`);
    }
  }
  // 10: leafy twig spray (vertical, base at bottom) used to break up canopy silhouettes
  {
    const [ox, oy] = origin(10);
    const cx = ox + 128;
    ctx.strokeStyle = 'hsl(28,30%,24%)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, oy + 254); ctx.quadraticCurveTo(cx + 10, oy + 130, cx - 4, oy + 10); ctx.stroke();
    for (let k = 0; k < 16; k++) {
      const t = 0.12 + k * 0.055;
      const y = oy + 254 - t * 244;
      const side = k % 2 ? 1 : -1;
      const l = R(36, 70) * (1 - t * 0.35);
      const ex = cx + side * l, ey = y - l * 0.5;
      ctx.strokeStyle = 'hsl(30,28%,26%)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(ex, ey); ctx.stroke();
      for (let q = 0; q < 5; q++) {
        const u = 0.3 + q * 0.17;
        const lx = cx + (ex - cx) * u, ly = y + (ey - y) * u;
        const light = R(20, 40);
        leaf(lx, ly, R(18, 28), R(6, 10), Math.atan2(ey - y, ex - cx) + R(-0.9, 0.9), `hsl(${R(85, 110)},${R(38, 56)}%,${light}%)`, `hsla(85,30%,${light + 12}%,0.55)`);
      }
    }
  }
  // 11: fine needle clump (pine top / young growth)
  {
    const [ox, oy] = origin(11);
    for (let i = 0; i < 520; i++) {
      const a = R(-Math.PI * 0.95, -Math.PI * 0.05), r0 = R(0, 18), r1 = R(50, 120);
      ctx.strokeStyle = `hsl(${R(105, 135)},${R(32, 50)}%,${R(14, 32)}%)`;
      ctx.lineWidth = R(1.2, 2.4);
      ctx.beginPath();
      ctx.moveTo(ox + 128 + Math.cos(a) * r0, oy + 250 + Math.sin(a) * r0);
      ctx.lineTo(ox + 128 + Math.cos(a) * r1, oy + 250 + Math.sin(a) * r1 * 1.9);
      ctx.stroke();
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
  // furrowed bark: vertical ridges split by deep dark fissures, broken into plates by short
  // horizontal cracks, with pale lichen and green moss blotches
  const W = 256, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rand = mulberry32(7);
  const R = (a, b) => a + (b - a) * rand();
  ctx.fillStyle = '#6e5c4a'; ctx.fillRect(0, 0, W, H);
  // ridge plates
  for (let i = 0; i < 520; i++) {
    const x = rand() * W, w = R(4, 14), l = R(30, 110), y = rand() * H;
    const v = Math.floor(R(78, 132));
    ctx.fillStyle = `rgba(${v},${Math.floor(v * 0.86)},${Math.floor(v * 0.72)},0.5)`;
    for (const dy of [0, -H, H]) ctx.fillRect(x, y + dy, w, l);
  }
  // fissures
  ctx.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    let x = rand() * W;
    ctx.strokeStyle = `rgba(${R(18, 30)},${R(13, 20)},${R(9, 14)},${R(0.75, 0.95)})`;
    ctx.lineWidth = R(2, 5.5);
    ctx.beginPath(); ctx.moveTo(x, -10);
    for (let y = 0; y <= H + 10; y += 16) { x += R(-4, 4); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // horizontal plate cracks
  for (let i = 0; i < 150; i++) {
    const x = rand() * W, y = rand() * H, l = R(5, 16);
    ctx.strokeStyle = 'rgba(25,18,12,0.7)'; ctx.lineWidth = R(1, 2.2);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + R(-2, 2)); ctx.stroke();
  }
  // lichen and moss
  for (let i = 0; i < 70; i++) {
    const x = rand() * W, y = rand() * H, r = R(3, 12);
    const moss = rand() < 0.4;
    ctx.fillStyle = moss ? `rgba(${R(70, 95)},${R(95, 120)},${R(40, 55)},0.45)` : `rgba(${R(160, 190)},${R(170, 190)},${R(150, 165)},0.35)`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * R(0.6, 1.4), R(0, 3), 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const bump = new THREE.CanvasTexture(cv);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { tex, bump };
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

  // Continuous curved tube through several points (parallel-transported frame, slightly irregular section)
  tubePath(pts, rads, seg, col, sways, vScale = 1, uRep = 1) {
    const n = pts.length;
    const base = this.count;
    let prevU = null, acc = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const t = (i < n - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
      if (i > 0 && i < n - 1) t.add(p.clone().sub(pts[i - 1]).normalize()).normalize();
      let u;
      if (!prevU) {
        const tmp = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        u = new THREE.Vector3().crossVectors(t, tmp).normalize();
      } else u = prevU.clone().sub(t.clone().multiplyScalar(prevU.dot(t))).normalize();
      prevU = u;
      const w = new THREE.Vector3().crossVectors(t, u).normalize();
      if (i > 0) acc += p.distanceTo(pts[i - 1]);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = u.x * ca + w.x * sa, ny = u.y * ca + w.y * sa, nz = u.z * ca + w.z * sa;
        const r = rads[i] * (1 + 0.07 * Math.sin(a * 3 + i * 1.7));
        this.vert(p.x + nx * r, p.y + ny * r, p.z + nz * r, nx, ny, nz, (k / seg) * uRep, acc * vScale, col, sways[i]);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = base + i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1;
        this.tri(a, c, b); this.tri(b, c, d);
      }
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
  frond(base, dir, len, width, droop, tile, col, sway0, sway1, segs = 6, twist = 0, roll = 0) {
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
      const tw = roll + twist * s;
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
  const H = 17 + rand() * 5;
  const lx = (rand() - 0.5) * 0.7, lz = (rand() - 0.5) * 0.7;
  const bark = lin(0.72, 0.6, 0.5);
  const trunkAt = (y) => { const t = Math.max(0, (y + 0.8) / (H + 0.8)); return V3(lx * t * t + Math.sin(t * 5 + seed) * 0.08, y, lz * t * t + Math.cos(t * 4 + seed) * 0.08); };
  // trunk with a flared, rooted base
  const tp = [], tr = [], ts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const y = -0.8 + t * (H + 0.8);
    tp.push(trunkAt(y));
    tr.push((0.5 * (1 - t * 0.93) + 0.035) * (t < 0.12 ? 1 + (0.12 - t) * 5 : 1));
    ts.push(t * 0.5);
  }
  trunk.tubePath(tp, tr, 8, bark, ts, 0.22, 2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand();
    trunk.tubePath([V3(Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3), V3(Math.cos(a) * 0.9, -0.05, Math.sin(a) * 0.9), V3(Math.cos(a) * 1.5, -0.35, Math.sin(a) * 1.5)], [0.2, 0.13, 0.05], 5, bark, [0, 0, 0], 0.22, 1);
  }
  // dead, bare lower twigs
  for (let i = 0; i < 9; i++) {
    const y = 1.8 + rand() * H * 0.22;
    const a = rand() * Math.PI * 2;
    const c = trunkAt(y);
    const d = V3(Math.cos(a), -0.15 + rand() * 0.3, Math.sin(a)).normalize();
    trunk.cylinder(c, c.clone().addScaledVector(d, 0.7 + rand() * 1.5), 0.045, 0.012, 3, lin(0.48, 0.42, 0.36), 0.1, 0.3, 0.25);
  }
  // living tiers of drooping needle sprays; lower tiers sit in their own shade
  const tiers = 16;
  const crownBase = H * (0.27 + rand() * 0.08);
  for (let t = 0; t < tiers; t++) {
    const s = t / (tiers - 1);
    const y = crownBase + s * (H - crownBase - 0.8) + (rand() - 0.5) * 0.4;
    const c = trunkAt(y);
    const len = (1 - s) * 4.7 * (0.85 + rand() * 0.3) + 0.9;
    const n = s > 0.8 ? 4 : 6;
    const off = rand() * Math.PI * 2;
    const shade = 0.55 + 0.45 * s;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const d = V3(Math.cos(a), 0.14 - s * 0.06 + (rand() - 0.5) * 0.16, Math.sin(a));
      const g = shade * (0.85 + rand() * 0.25);
      leaves.frond(c, d, len, len * 0.42, 0.22 + (1 - s) * 0.26, TILES.SPRAY, [g, g * 1.02, g * 0.95], 0.12 + s * 0.5, 0.45 + s * 0.5, 3, (rand() - 0.5) * 0.8, (rand() - 0.5) * 1.1);
    }
  }
  // leader
  const top = trunkAt(H);
  const lb = top.clone().add(V3(0, -1.7, 0));
  leaves.frond(lb, V3(0.04, 1, 0), 2.3, 0.6, 0, TILES.SPRAY, [1.05, 1.05, 1], 0.6, 0.9, 2, 0, 0);
  leaves.frond(lb, V3(-0.04, 1, 0.02), 2.3, 0.6, 0, TILES.SPRAY, [1, 1, 1], 0.6, 0.9, 2, 0, Math.PI / 2);
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.5, height: H };
}

function oak(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const bark = lin(0.78, 0.7, 0.6);
  const H = 4.5 + rand() * 2;
  const lx = (rand() - 0.5) * 1.1, lz = (rand() - 0.5) * 1.1;
  const tp = [], tr = [], ts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    tp.push(V3(lx * t * t, -0.6 + t * (H + 0.6), lz * t * t));
    tr.push((0.62 - t * 0.2) * (t < 0.15 ? 1 + (0.15 - t) * 4 : 1));
    ts.push(t * 0.08);
  }
  trunk.tubePath(tp, tr, 9, bark, ts, 0.22, 2);
  const top = tp[tp.length - 1];
  const tips = [];
  // recursive, gently curving limbs
  const grow = (p, d, len, r, depth, sway) => {
    const mid = p.clone().addScaledVector(d, len * 0.5).add(V3((rand() - 0.5) * len * 0.15, len * 0.06, (rand() - 0.5) * len * 0.15));
    const nd = d.clone(); nd.y += 0.15; nd.normalize();
    const e = mid.clone().addScaledVector(nd, len * 0.5);
    trunk.tubePath([p, mid, e], [r, r * 0.8, r * 0.6], depth > 0 ? 6 : 4, bark, [sway, sway + 0.1, sway + 0.2], 0.22, 1);
    if (depth > 0) {
      const k = 2 + (rand() < 0.5 ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + rand();
        const dd = nd.clone().setY(nd.y * 0.5).add(V3(Math.cos(a) * 0.8, 0.05 + rand() * 0.25, Math.sin(a) * 0.8)).normalize();
        grow(e, dd, len * (0.6 + rand() * 0.15), r * 0.6, depth - 1, sway + 0.2);
      }
    } else tips.push(e);
  };
  const nb = 4 + Math.floor(rand() * 2);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rand() * 0.7;
    const d = V3(Math.cos(a), 0.28 + rand() * 0.3, Math.sin(a)).normalize();
    grow(top.clone().add(V3(0, -rand() * 1.2, 0)), d, 4.0 + rand() * 1.6, 0.32, 1, 0.08);
  }
  const center = top.clone().add(V3(0, 2.6, 0));
  let maxY = 0;
  for (const tip of tips) {
    const c = tip.clone().add(V3(0, 0.5, 0));
    maxY = Math.max(maxY, c.y + 2);
    leaves.cluster(c, 2.5 + rand() * 0.7, 10, rand() < 0.5 ? TILES.BROAD : TILES.BROAD2, [1, 1, 1], 0.6, rand);
    for (let k = 0; k < 2; k++) {
      const od = c.clone().sub(center).setY(0).normalize().add(V3((rand() - 0.5) * 0.6, -0.2 + rand() * 0.5, (rand() - 0.5) * 0.6)).normalize();
      leaves.frond(c, od, 1.8 + rand() * 0.8, 0.9, 0.35, TILES.TWIG, [0.95, 1, 0.95], 0.6, 0.95, 2, 0, rand() * 3);
    }
  }
  // shaded interior fill so the crown never looks hollow
  for (let i = 0; i < 6; i++) leaves.cluster(center.clone().add(V3((rand() - 0.5) * 6, (rand() - 0.5) * 2, (rand() - 0.5) * 6)), 2.8, 6, TILES.BROAD2, [0.6, 0.65, 0.6], 0.5, rand);
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 0.62, height: maxY };
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
  // curving limbs + umbrella canopy
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.5;
    const r = 6 + rand() * 4;
    const tip = V3(Math.cos(a) * r, H + 2 + rand() * 2, Math.sin(a) * r);
    const mid = V3(Math.cos(a) * r * 0.45, H + 1.6 + rand(), Math.sin(a) * r * 0.45);
    trunk.tubePath([V3(0, H - 2, 0), mid, tip], [0.55, 0.36, 0.18], 6, bark, [0.05, 0.18, 0.3], 0.2, 1);
    leaves.cluster(tip.clone().add(V3(0, 1, 0)), 4.2, 10, rand() < 0.6 ? TILES.JUNGLE : TILES.BROAD2, [1, 1, 1], 0.4, rand);
    leaves.frond(tip.clone().add(V3(0, 0.6, 0)), V3(Math.cos(a), -0.3, Math.sin(a)), 2.6, 1.2, 0.4, TILES.TWIG, [0.9, 1, 0.9], 0.4, 0.8, 2, 0, rand() * 3);
    // vines
    const vb = tip.clone().add(V3(0, -0.5, 0));
    leaves.card(vb.clone().add(V3(0, -4, 0)), V3(1.2, 0, 0), V3(0, 4, 0), TILES.MOSS, [0.75, 0.9, 0.7], 0.5, vb, [0.9, 0.3]);
  }
  leaves.cluster(V3(0, H + 3, 0), 5, 10, TILES.JUNGLE, [0.95, 1, 0.95], 0.4, rand);
  return { trunk: trunk.build(), leaves: leaves.build(), radius: 1.75, height: H + 6 };
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
  for (let i = 0; i < 13; i++) {
    const a = rand() * Math.PI * 2;
    const y = H * (0.42 + rand() * 0.58);
    const r = 1.5 + rand() * 3.4;
    const c = V3(Math.cos(a) * r, y, Math.sin(a) * r);
    trunk.tubePath([V3(0, y - 1.5, 0), V3(c.x * 0.5, y - 0.4, c.z * 0.5), c], [0.22, 0.15, 0.08], 5, bark, [0.1, 0.25, 0.4], 0.25, 1);
    for (let k = 0; k < 7; k++) {
      const fa = (k / 7) * Math.PI * 2 + rand();
      const g = 0.75 + rand() * 0.2;
      leaves.frond(c, V3(Math.cos(fa), 0.2 + rand() * 0.35, Math.sin(fa)), 2.6 + rand() * 0.8, 1.15, 0.45, TILES.SPRAY, [g * 0.95, g, g * 0.75], 0.5, 0.8, 3, 0, (rand() - 0.5) * 1.2);
    }
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
  return { leaves: leaves.build(), radius: 0.5 };
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
  // a noise-displaced sphere cut by a few random fracture planes: flat split faces, sharp edges
  // and rounded weathered crowns, like real boulders
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const nz = new Simplex(seed);
  const rand = mulberry32(seed * 7919 + 13);
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  const cuts = [];
  const nCuts = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < nCuts; i++) {
    const a = rand() * Math.PI * 2, y = rand() * 1.4 - 0.5;
    cuts.push({ n: new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize(), d: 0.62 + rand() * 0.25 });
  }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = nz.fbm(v.x * 1.3 + seed, v.y * 1.3 + v.z * 0.7, 4) * 0.3;
    const ridge = (1 - Math.abs(nz.noise(v.x * 3.1 + seed, v.y * 3.1 + v.z * 2.3))) ** 3 * 0.05;
    v.multiplyScalar(1 + n + ridge + nz.noise(v.x * 6, v.z * 6 + v.y * 5) * 0.02);
    // fracture planes flatten whatever pokes through them
    for (const c of cuts) {
      const t = v.dot(c.n) - c.d;
      if (t > 0) v.addScaledVector(c.n, -t * 0.88);
    }
    v.y *= squash;
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
    let c = 0.44 + n * 0.45 + (v.y > 0.3 ? 0.05 : 0);
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

// Fallen log: a broken, slightly bowed trunk lying on the ground with snapped branch stubs, a
// splintered end, moss along the top and a few ferns sprouting beside it
function fallenLog(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const L = 4.5 + rand() * 4, R = 0.32 + rand() * 0.22;
  const bark = lin(0.58, 0.52, 0.46), mossy = lin(0.42, 0.5, 0.3);
  const pts = [], rads = [], sw = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    pts.push(V3((t - 0.5) * L, R * 0.85 - Math.sin(t * Math.PI) * 0.06, Math.sin(t * 2.4 + seed) * 0.15));
    rads.push(R * (1.08 - t * 0.3));
    sw.push(0);
  }
  trunk.tubePath(pts, rads, 10, bark, sw, 0.22, 2);
  // moss strip along the top
  trunk.tubePath(pts.map((p) => p.clone().add(V3(0, R * 0.62, 0))), rads.map((r) => r * 0.5), 8, mossy, sw, 0.22, 1);
  // snapped branch stubs
  for (let k = 0; k < 4; k++) {
    const t = 0.2 + rand() * 0.65;
    const p = V3((t - 0.5) * L, R * 0.9, 0);
    const d = V3((rand() - 0.5) * 0.6, 0.5 + rand() * 0.6, (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5)).normalize();
    trunk.cylinder(p, p.clone().addScaledVector(d, 0.35 + rand() * 0.5), R * 0.28, R * 0.12, 5, bark, 0, 0, 0.3);
  }
  // splintered root end: a flared crown of short broken roots
  const re = V3(-L * 0.5, R * 0.85, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rand() * 0.4;
    const d = V3(-0.5, Math.cos(a), Math.sin(a)).normalize();
    trunk.cylinder(re, re.clone().addScaledVector(d, R * (1.4 + rand())), R * 0.32, R * 0.06, 4, bark, 0, 0, 0.3);
  }
  // ferns and moss tufts growing along it
  for (let k = 0; k < 5; k++) {
    const x = (rand() - 0.5) * L * 0.9, side = rand() < 0.5 ? -1 : 1;
    const c = V3(x, 0.32, side * (R + 0.25));
    leaves.card(c, V3(0.4, 0, 0), V3(0, 0.38, side * 0.12), rand() < 0.6 ? TILES.FERN : TILES.MOSS, [0.5, 0.62, 0.32], 0.25, V3(x, 0, side * R));
  }
  return { trunk: trunk.build(), leaves: leaves.build(), radius: R + 0.15, height: R * 2 };
}

// Old stump: a short jagged trunk with buttress roots, sometimes hollow-topped
function stump(seed) {
  const rand = mulberry32(seed);
  const trunk = new GeoBuilder(), leaves = new GeoBuilder();
  const R = 0.4 + rand() * 0.25, H = 0.5 + rand() * 0.6;
  const bark = lin(0.56, 0.5, 0.44), wood = lin(0.62, 0.5, 0.36);
  trunk.cylinder(V3(0, -0.3, 0), V3(0, H, 0), R * 1.1, R, 10, bark, 0, 0, 0.25, 2);
  // jagged broken top: splinters around the rim
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rand() * 0.3;
    const p = V3(Math.cos(a) * R * 0.75, H, Math.sin(a) * R * 0.75);
    trunk.cylinder(p, p.clone().add(V3(0, 0.1 + rand() * 0.35, 0)), R * 0.22, 0.01, 4, k % 2 ? wood : bark, 0, 0, 0.3);
  }
  trunk.cylinder(V3(0, H - 0.02, 0), V3(0, H + 0.01, 0), R * 0.86, R * 0.86, 10, wood, 0, 0, 0.3);
  // buttress roots
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rand() * 0.5;
    const p0 = V3(Math.cos(a) * R * 0.6, H * 0.45, Math.sin(a) * R * 0.6);
    trunk.cylinder(p0, V3(Math.cos(a) * R * 2.0, -0.1, Math.sin(a) * R * 2.0), R * 0.34, R * 0.08, 5, bark, 0, 0, 0.3);
  }
  leaves.card(V3(R * 0.8, 0.25, 0), V3(0.3, 0, 0), V3(0, 0.3, 0), TILES.MOSS, [0.5, 0.6, 0.3], 0.2, V3(0, 0, 0));
  return { trunk: trunk.build(), leaves: leaves.build(), radius: R * 1.1, height: H };
}

// Boulders: photographed rock in world-space triplanar projection. The rock type follows the
// ground it sits on (granite, desert sandstone, volcanic basalt, wet coastal rock), damp forests
// grow moss over the tops and winter settles snow into the upper faces.
function photoRock(m) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, photoUniforms());
    shader.uniforms.uWinter = U.uWinter;
    shader.uniforms.uSurfTex = { get value() { return TerrainTextures.world ? TerrainTextures.world.surfTex : null; } };
    shader.uniforms.uSurfTex2 = { get value() { return TerrainTextures.world ? TerrainTextures.world.surfTex2 : null; } };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 rwp = vec4(transformed, 1.0); vec3 rwn = objectNormal;
        #ifdef USE_INSTANCING
          rwp = instanceMatrix * rwp; rwn = mat3(instanceMatrix) * rwn;
        #endif
          vRW = (modelMatrix * rwp).xyz; vRN = normalize(mat3(modelMatrix) * rwn);
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWinter; uniform sampler2D uSurfTex; uniform sampler2D uSurfTex2;
        varying vec3 vRW; varying vec3 vRN;
        ${GLSL_PHOTO}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 rn = normalize(vRN);
        vec3 rdx = dFdx(vRW), rdy = dFdy(vRW);
        vec3 rNrm = rn; float rRough = 0.85;
        if (uTexOK > 0.5) {
          vec3 rbw = pow(abs(rn), vec3(4.0)); rbw /= (rbw.x + rbw.y + rbw.z);
          vec2 sUV = ((vRW.xz + 2048.0) / 4.0 + 0.5) / 1025.0;
          vec4 sf = texture2D(uSurfTex, sUV), sf2 = texture2D(uSurfTex2, sUV);
          float Lr = L_ROCK;
          if (sf2.a > 0.5) Lr = L_SANDSTONE; else if (sf2.b > 0.5) Lr = L_BASALT; else if (vRW.y < 3.5) Lr = L_COASTROCK;
          vec3 rA, rN; float rH;
          float s = 1.0 / 2.8;
          photoTri(Lr, vRW, rn, rbw, s, rdx, rdy, rA, rN, rH);
          vec3 rM = textureLod(uTA, vec3(0.5, 0.5, Lr), 12.0).rgb;
          rRough = ROUGH[int(Lr)];
          // moss creeping over the tops in damp forests
          float mossK = clamp(sf2.g * 1.4 + sf.r * 0.6, 0.0, 1.0) * smoothstep(-0.1, 0.8, rn.y) * step(sf2.a + sf2.b, 0.5);
          if (mossK > 0.03) {
            vec3 mA, mN; float mH;
            photoTri(L_MOSSGROUND, vRW + 5.3, rn, rbw, s * 1.3, rdx, rdy, mA, mN, mH);
            float a1 = rH + (1.0 - mossK), a2 = mH + mossK; float mm = max(a1, a2) - 0.2;
            float t = max(a2 - mm, 0.0) / max(max(a1 - mm, 0.0) + max(a2 - mm, 0.0), 1e-4);
            rA = mix(rA, mA, t); rN = normalize(mix(rN, mN, t)); rM = mix(rM, textureLod(uTA, vec3(0.5, 0.5, L_MOSSGROUND), 12.0).rgb, t);
            rRough = mix(rRough, 0.9, t);
          }
          vec3 vcR = diffuseColor.rgb;
          float lumP = max(dot(rM, LUMA), 1e-4), lumV = max(dot(vcR, LUMA), 1e-4);
          vec3 tint = pow(vec3(clamp(lumV / lumP, 0.3, 3.0)), vec3(0.55)) * pow(clamp((vcR / lumV) / max(rM / lumP, vec3(1e-3)), vec3(0.5), vec3(2.0)), vec3(0.3));
          diffuseColor.rgb = rA * tint;
          rNrm = rN;
          // winter: snow settles on the upper faces, deepest in the hollows of the rock
          float snowR = uWinter * smoothstep(0.25, 0.7, rn.y - (rH - 0.5) * 0.35);
          if (snowR > 0.01) {
            vec3 sA, sN; float sH;
            photoTri(L_SNOW, vRW, rn, rbw, s * 0.8, rdx, rdy, sA, sN, sH);
            diffuseColor.rgb = mix(diffuseColor.rgb, sA / max(dot(sA, LUMA), 1e-3) * 0.68, snowR);
            rNrm = normalize(mix(rNrm, sN, snowR)); rRough = mix(rRough, 0.6, snowR);
          }
        } else {
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.71, 0.76), smoothstep(0.3, 0.75, rn.y) * uWinter * 0.95);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = rRough;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(rNrm, 0.0)).xyz);`);
    atmospherePatch(shader);
  };
  m.customProgramCacheKey = () => 'photoRock';
  return m;
}

// ---------- Library ----------
export class FloraLibrary {
  constructor() {
    // drawn foliage atlas with leaf relief when it loaded during boot, painted canvas otherwise
    this.atlas = TerrainTextures.foliageMap || makeLeafAtlas();
    const bark = makeBark();
    this.bark = bark.tex;
    this.leafMat = addWind(new THREE.MeshStandardMaterial({
      map: this.atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, envMapIntensity: 0.5,
      ...(TerrainTextures.foliageNormal ? { normalMap: TerrainTextures.foliageNormal, normalScale: new THREE.Vector2(0.6, 0.6), color: new THREE.Color(1.32, 1.36, 1.15) } : {}),
    }), 1.0, true, 'leaf');
    this.leafMat.alphaToCoverage = true;
    this.leafDepthMat = foliageDepthMaterial(this.atlas, 1.0);
    // photographed bark when available (loaded during boot), painted bark otherwise
    const photoBark = TerrainTextures.barkMap
      ? { map: TerrainTextures.barkMap, normalMap: TerrainTextures.barkNormal, normalScale: new THREE.Vector2(1.6, 1.6), vertexColors: true, roughness: 0.92 }
      : { map: this.bark, bumpMap: bark.bump, bumpScale: 2.5, vertexColors: true, roughness: 0.95 };
    if (TerrainTextures.barkMap) this.bark = TerrainTextures.barkMap;
    this.trunkMat = addWind(new THREE.MeshStandardMaterial(photoBark), 0.6, false, 'bark');
    this.rockMat = photoRock(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    this.oreMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    this.types = {
      conifer: conifer(11), conifer2: conifer(12), oak: oak(21), oak2: oak(22), kapok: kapok(31), palm: palm(41), palm2: palm(42),
      treefern: treeFern(51), cypress: cypress(61), araucaria: araucaria(71), dead: deadTree(81), cycad: cycad(91),
      fern: fernBush(101), shrub: shrub(111), berry: shrub(121, TILES.BERRY), horsetail: horsetail(131), scrub: scrub(141),
      jungleshrub: shrub(151, TILES.JUNGLE),
      log: fallenLog(161), log2: fallenLog(162), stump: stump(171), stump2: stump(172),
    };
    this.rocks = [rockGeometry(1, 3, 0.75), rockGeometry(2, 3, 0.6), rockGeometry(3, 2, 0.9)];
    this.oreRock = rockGeometry(9, 3, 0.8, true);
  }
}
