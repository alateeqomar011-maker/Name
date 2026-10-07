// Procedural plant / rock geometry generators.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, makeNoise } from '../core/noise.js';

const TILE = { broad: [0, 0.5], needle: [0.5, 0.5], frond: [0, 0], blades: [0.5, 0] };
// atlas tile origin (u0, v0) with size 0.5. Note: canvas y is flipped in UV space (v=1 at top).

function card(w, h, tile, flipTip = false) {
  // vertical quad, base at y=0, centred on x
  const g = new THREE.PlaneGeometry(w, h, 1, 2);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  const [u0, v0] = TILE[tile];
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    u = u0 + 0.004 + u * 0.492;
    v = v0 + 0.004 + (flipTip ? 1 - v : v) * 0.492;
    uv.setXY(i, u, v);
  }
  return g;
}

function setNormalsFrom(g, center, blend = 0.75) {
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(center).normalize();
    o.fromBufferAttribute(n, i);
    if (o.dot(v) < 0) o.negate();
    o.lerp(v, blend).normalize();
    n.setXYZ(i, o.x, o.y, o.z);
  }
}

function colorize(g, r, gg, b) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function strip(g) {
  // keep only position/normal/uv/color for merging consistency
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g.index ? g.toNonIndexed() : g;
}

function trunk(height, r0, r1, segs = 7, bend = 0, rnd = Math.random, rings = 5) {
  const g = new THREE.CylinderGeometry(r1, r0, height, segs, rings, true);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / height;
    p.setX(i, p.getX(i) + Math.sin(t * 2.2) * bend * t);
    // buttress flare at the base
    const flare = Math.max(0, 1 - t * 6);
    p.setX(i, p.getX(i) * (1 + flare * 0.8));
    p.setZ(i, p.getZ(i) * (1 + flare * 0.8));
    uv.setXY(i, uv.getX(i) * 2, (y / (r0 * 6.28)) * 0.5);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------
// Each builder returns { parts: [{geo, kind:'bark'|'leaf'}], far: geo(with color), height, radius }
// ---------------------------------------------------------------
export function buildConifer(seed) {
  const rnd = mulberry32(seed);
  const H = 22;
  const parts = [];
  parts.push({ kind: 'bark', geo: trunk(H, 0.55, 0.12, 7, 0.2, rnd) });
  const leaves = [];
  const layers = 11;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);
    const y = H * (0.18 + t * 0.78);
    const R = (1 - t) * 5.2 + 0.7;
    const n = Math.max(4, Math.round(8 - t * 4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.5 + l * 0.7;
      const c = card(R * 0.95, R * 1.15, 'needle');
      c.rotateX(-Math.PI / 2 + 0.45 + rnd() * 0.25); // tilt outward/down
      c.rotateY(a);
      c.translate(Math.cos(a) * 0.15, y, -Math.sin(a) * 0.15);
      leaves.push(c);
    }
    // vertical filler cards
    const v = card(R * 1.6, R * 1.0, 'needle');
    v.rotateY(rnd() * Math.PI);
    v.translate(0, y - R * 0.4, 0);
    leaves.push(v);
  }
  const tip = card(1.4, 3.2, 'needle');
  tip.translate(0, H * 0.95, 0);
  leaves.push(tip);
  const lg = mergeGeometries(leaves.map(strip));
  setNormalsFrom(lg, new THREE.Vector3(0, H * 0.55, 0), 0.7);
  parts.push({ kind: 'leaf', geo: lg });

  const farTrunk = colorize(strip(new THREE.CylinderGeometry(0.12, 0.5, H * 0.4, 5, 1, true).translate(0, H * 0.2, 0)), 0.2, 0.13, 0.08);
  const cone1 = colorize(strip(new THREE.ConeGeometry(5.6, H * 0.62, 7, 1, true).translate(0, H * 0.42, 0)), 0.07, 0.13, 0.07);
  const cone2 = colorize(strip(new THREE.ConeGeometry(3.6, H * 0.45, 7, 1, true).translate(0, H * 0.75, 0)), 0.08, 0.15, 0.08);
  return { parts, far: mergeGeometries([farTrunk, cone1, cone2]), height: H, radius: 0.5 };
}

export function buildAraucaria(seed) {
  const rnd = mulberry32(seed);
  const H = 30;
  const parts = [];
  parts.push({ kind: 'bark', geo: trunk(H, 0.75, 0.2, 8, 0.4, rnd, 8) });
  const leaves = [];
  const branches = [];
  // umbrella crown: whorls of branches near the top
  const whorls = 6;
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = H * (0.66 + t * 0.32);
    const L = (1 - t) * 6.5 + 1.8;
    const n = 5 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + w * 0.6 + rnd() * 0.3;
      const br = new THREE.CylinderGeometry(0.06, 0.14, L, 4, 1, true);
      br.translate(0, L / 2, 0);
      br.rotateZ(-Math.PI / 2 + 0.25);
      br.rotateY(a);
      br.translate(0, y, 0);
      branches.push(br);
      // foliage tufts along branch, curling up at the end
      for (let s = 0; s < 4; s++) {
        const f = 0.3 + s * 0.24;
        const c = card(3.4, 2.8, 'needle');
        c.rotateX(-Math.PI / 2 + 0.2);
        c.rotateY(a + (rnd() - 0.5) * 0.6);
        c.translate(Math.cos(a) * L * f, y + L * f * 0.25 + 0.3, -Math.sin(a) * L * f);
        leaves.push(c);
        const c2 = card(3.0, 2.4, 'needle');
        c2.rotateY(a + Math.PI / 2);
        c2.translate(Math.cos(a) * L * f, y + L * f * 0.25 - 0.4, -Math.sin(a) * L * f);
        leaves.push(c2);
      }
    }
  }
  const bgeo = mergeGeometries([parts[0].geo, ...branches].map(strip));
  parts[0].geo = bgeo;
  const lg = mergeGeometries(leaves.map(strip));
  setNormalsFrom(lg, new THREE.Vector3(0, H * 0.82, 0), 0.75);
  parts.push({ kind: 'leaf', geo: lg });
  const farTrunk = colorize(strip(new THREE.CylinderGeometry(0.2, 0.7, H * 0.75, 5, 1, true).translate(0, H * 0.375, 0)), 0.22, 0.15, 0.1);
  const crown = new THREE.SphereGeometry(6.5, 7, 4);
  crown.scale(1, 0.45, 1);
  crown.translate(0, H * 0.85, 0);
  return { parts, far: mergeGeometries([farTrunk, colorize(strip(crown), 0.08, 0.14, 0.07)]), height: H, radius: 0.7 };
}

export function buildBroadleaf(seed) {
  const rnd = mulberry32(seed);
  const H = 20;
  const parts = [];
  const bark = [trunk(H * 0.62, 0.9, 0.32, 8, 0.6, rnd, 6)];
  const leaves = [];
  const clusters = [];
  const nb = 7;
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * Math.PI * 2 + rnd() * 0.6;
    const L = 4.5 + rnd() * 3.5;
    const y0 = H * (0.4 + rnd() * 0.22);
    const br = new THREE.CylinderGeometry(0.1, 0.28, L, 5, 1, true);
    br.translate(0, L / 2, 0);
    br.rotateZ(-0.85 + rnd() * 0.35);
    br.rotateY(a);
    br.translate(0, y0, 0);
    bark.push(br);
    clusters.push(new THREE.Vector3(Math.cos(a) * L * 0.72, y0 + L * 0.62, -Math.sin(a) * L * 0.72));
  }
  for (let k = 0; k < 3; k++) {
    const a = rnd() * Math.PI * 2;
    clusters.push(new THREE.Vector3(Math.cos(a) * 1.8, H * (0.8 + rnd() * 0.12), Math.sin(a) * 1.8));
  }
  for (const c of clusters) {
    const R = 3.4 + rnd() * 1.3;
    for (let k = 0; k < 13; k++) {
      // cards distributed over a dome so the crown reads as a full rounded mass
      const u = rnd() * Math.PI * 2, v = Math.acos(rnd() * 1.6 - 0.6);
      const dir = new THREE.Vector3(Math.sin(v) * Math.cos(u), Math.cos(v) * 0.75, Math.sin(v) * Math.sin(u));
      const cd = card(R * 1.7, R * 1.7, 'broad');
      cd.translate(0, -R * 0.85, 0);
      cd.rotateX((rnd() - 0.5) * 2.4);
      cd.rotateY(rnd() * Math.PI * 2);
      cd.translate(c.x + dir.x * R * 0.7, c.y + dir.y * R * 0.7, c.z + dir.z * R * 0.7);
      leaves.push(cd);
    }
  }
  parts.push({ kind: 'bark', geo: mergeGeometries(bark.map(strip)) });
  const lg = mergeGeometries(leaves.map(strip));
  setNormalsFrom(lg, new THREE.Vector3(0, H * 0.7, 0), 0.85);
  parts.push({ kind: 'leaf', geo: lg });
  const farTrunk = colorize(strip(new THREE.CylinderGeometry(0.32, 0.9, H * 0.62, 5, 1, true).translate(0, H * 0.31, 0)), 0.2, 0.15, 0.1);
  const crowns = clusters.map((c, i) => {
    const s = new THREE.IcosahedronGeometry(4.4, 1);
    s.scale(1, 0.8, 1);
    s.translate(c.x, c.y, c.z);
    const g = 0.85 + (i % 3) * 0.12;
    return colorize(strip(s), 0.07 * g, 0.16 * g, 0.035 * g);
  });
  const far = mergeGeometries([farTrunk, ...crowns]);
  setNormalsFrom(far, new THREE.Vector3(0, H * 0.55, 0), 0.6);
  return { parts, far, height: H, radius: 0.9 };
}

function frond(len, width, droop, tile = 'frond', segs = 5) {
  const g = new THREE.PlaneGeometry(width, len, 1, segs);
  g.translate(0, len / 2, 0);
  const uv = g.attributes.uv;
  const [u0, v0] = TILE[tile];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, u0 + 0.004 + uv.getX(i) * 0.492, v0 + 0.004 + uv.getY(i) * 0.492);
    const t = p.getY(i) / len;
    // arc: lie it along +z and bend down
    const ang = t * droop;
    const y = Math.sin(Math.PI / 2 - ang * 0.9) * len * t;
    const z = Math.cos(Math.PI / 2 - ang * 0.9) * len * t;
    p.setY(i, y * 0.6 + t * 0.2);
    p.setZ(i, z + t * len * 0.35);
    // slight V fold
    p.setY(i, p.getY(i) - Math.abs(p.getX(i)) * 0.25);
  }
  g.computeVertexNormals();
  return g;
}

export function buildPalm(seed) {
  const rnd = mulberry32(seed);
  const H = 13;
  const parts = [];
  // curved trunk built from rings along a curve
  const lean = 0.8 + rnd() * 2.4;
  const tr = new THREE.CylinderGeometry(0.22, 0.38, H, 7, 10, true);
  tr.translate(0, H / 2, 0);
  const p = tr.attributes.position, uv = tr.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / H;
    p.setX(i, p.getX(i) + lean * t * t);
    const ring = Math.sin(t * 90) * 0.02;
    p.setX(i, p.getX(i) * (1 + ring));
    uv.setXY(i, uv.getX(i) * 2, t * 6);
  }
  tr.computeVertexNormals();
  parts.push({ kind: 'bark', geo: tr });
  const top = new THREE.Vector3(lean, H, 0);
  const leaves = [];
  const n = 13;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
    const f = frond(5.5 + rnd() * 1.5, 2.6, 1.3 + rnd() * 0.6);
    f.rotateX(-0.3 + rnd() * 0.3);
    f.rotateY(a);
    f.translate(top.x, top.y - 0.2, top.z);
    leaves.push(f);
  }
  const lg = mergeGeometries(leaves.map(strip));
  setNormalsFrom(lg, top.clone().add(new THREE.Vector3(0, -1.5, 0)), 0.5);
  parts.push({ kind: 'leaf', geo: lg });
  const farTrunk = colorize(strip(new THREE.CylinderGeometry(0.2, 0.35, H, 4, 1, true).translate(lean * 0.5, H / 2, 0)), 0.3, 0.24, 0.16);
  const star = [];
  for (let k = 0; k < 6; k++) {
    const b = new THREE.BoxGeometry(0.4, 0.15, 6);
    b.translate(0, 0, 3);
    b.rotateX(0.35);
    b.rotateY((k / 6) * Math.PI * 2);
    b.translate(top.x, top.y - 0.6, top.z);
    star.push(colorize(strip(b), 0.12, 0.2, 0.06));
  }
  return { parts, far: mergeGeometries([farTrunk, ...star]), height: H, radius: 0.35 };
}

export function buildTreeFern(seed) {
  const rnd = mulberry32(seed);
  const H = 5.5;
  const parts = [];
  parts.push({ kind: 'bark', geo: trunk(H, 0.28, 0.2, 6, 0.3, rnd, 4) });
  const leaves = [];
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.4;
    const f = frond(3.6 + rnd(), 1.8, 1.6 + rnd() * 0.4);
    f.rotateX(-0.5 + rnd() * 0.3);
    f.rotateY(a);
    f.translate(0, H, 0);
    leaves.push(f);
  }
  const lg = mergeGeometries(leaves.map(strip));
  setNormalsFrom(lg, new THREE.Vector3(0, H - 1, 0), 0.5);
  parts.push({ kind: 'leaf', geo: lg });
  const farTrunk = colorize(strip(new THREE.CylinderGeometry(0.2, 0.28, H, 4, 1, true).translate(0, H / 2, 0)), 0.18, 0.13, 0.09);
  const crown = new THREE.ConeGeometry(3.4, 1.6, 6, 1, true);
  crown.rotateX(Math.PI);
  crown.translate(0, H + 0.2, 0);
  return { parts, far: mergeGeometries([farTrunk, colorize(strip(crown), 0.1, 0.18, 0.06)]), height: H, radius: 0.28 };
}

export function buildCycad(seed) {
  const rnd = mulberry32(seed);
  const H = 1.6;
  const parts = [];
  const t = new THREE.CylinderGeometry(0.45, 0.55, H, 8, 3, true);
  t.translate(0, H / 2, 0);
  t.computeVertexNormals();
  const uv = t.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
  parts.push({ kind: 'bark', geo: t });
  const leaves = [];
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
    const f = frond(2.2 + rnd() * 0.6, 1.2, 0.9 + rnd() * 0.5);
    f.rotateX(-0.25 - rnd() * 0.35);
    f.rotateY(a);
    f.translate(0, H, 0);
    leaves.push(f);
  }
  const lg = mergeGeometries(leaves.map(strip));
  setNormalsFrom(lg, new THREE.Vector3(0, H, 0), 0.5);
  parts.push({ kind: 'leaf', geo: lg });
  const crown = new THREE.ConeGeometry(2.2, 1.4, 6, 1, true);
  crown.rotateX(Math.PI);
  crown.translate(0, H + 0.5, 0);
  return {
    parts,
    far: mergeGeometries([colorize(strip(new THREE.CylinderGeometry(0.4, 0.5, H, 5, 1, true).translate(0, H / 2, 0)), 0.2, 0.15, 0.1), colorize(strip(crown), 0.1, 0.17, 0.05)]),
    height: H + 1.5,
    radius: 0.5,
  };
}

export function buildFern(seed) {
  const rnd = mulberry32(seed);
  const leaves = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
    const f = frond(1.2 + rnd() * 0.5, 0.75, 1.0 + rnd() * 0.6, 'frond', 4);
    f.rotateX(-0.2 - rnd() * 0.4);
    f.rotateY(a);
    leaves.push(f);
  }
  const lg = mergeGeometries(leaves.map(strip));
  setNormalsFrom(lg, new THREE.Vector3(0, -0.5, 0), 0.6);
  return { parts: [{ kind: 'leaf', geo: lg }], far: null, height: 1.2, radius: 0 };
}

export function buildBush(seed, berries = true) {
  const rnd = mulberry32(seed);
  const leaves = [];
  for (let k = 0; k < 10; k++) {
    const c = card(1.7, 1.7, 'broad');
    c.translate(0, -0.85, 0);
    c.rotateX((rnd() - 0.5) * 2);
    c.rotateY(rnd() * Math.PI * 2);
    c.translate((rnd() - 0.5) * 0.8, 0.9 + rnd() * 0.3, (rnd() - 0.5) * 0.8);
    leaves.push(c);
  }
  const lg = mergeGeometries(leaves.map(strip));
  setNormalsFrom(lg, new THREE.Vector3(0, 0.6, 0), 0.8);
  const parts = [{ kind: 'leaf', geo: lg }];
  if (berries) {
    const bs = [];
    for (let k = 0; k < 26; k++) {
      const s = new THREE.IcosahedronGeometry(0.06, 0);
      const a = rnd() * Math.PI * 2, r = 0.5 + rnd() * 0.45, y = 0.6 + rnd() * 0.7;
      s.translate(Math.cos(a) * r, y, Math.sin(a) * r);
      bs.push(colorize(strip(s), 0.55, 0.03, 0.06));
    }
    parts.push({ kind: 'berry', geo: mergeGeometries(bs) });
  }
  return { parts, far: null, height: 1.4, radius: 0.6 };
}

const rockNoise = makeNoise(4242);
export function buildRock(seed, detail = 2, sx = 1, sy = 0.7, sz = 1) {
  const rnd = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const ox = rnd() * 100, oz = rnd() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let d = 1 + rockNoise.fbm3(x * 1.3 + ox, y * 1.3, z * 1.3 + oz, 4) * 0.35;
    // flatten bottom & facet
    let ny = y * sy * d;
    if (ny < -0.25) ny = -0.25 + (ny + 0.25) * 0.2;
    p.setXYZ(i, x * sx * d, ny, z * sz * d);
  }
  g.computeVertexNormals();
  const ng = strip(g);
  ng.computeVertexNormals();
  return ng;
}

export function buildDeadTree(seed) {
  const rnd = mulberry32(seed);
  const H = 9;
  const parts = [trunk(H, 0.4, 0.08, 6, 1.2, rnd, 5)];
  for (let b = 0; b < 4; b++) {
    const L = 2 + rnd() * 2.5;
    const br = new THREE.CylinderGeometry(0.04, 0.12, L, 4, 1, true);
    br.translate(0, L / 2, 0);
    br.rotateZ(-0.7 - rnd() * 0.4);
    br.rotateY(rnd() * Math.PI * 2);
    br.translate(0, H * (0.4 + rnd() * 0.5), 0);
    parts.push(br);
  }
  const geo = mergeGeometries(parts.map(strip));
  return {
    parts: [{ kind: 'bark', geo }],
    far: colorize(strip(new THREE.CylinderGeometry(0.1, 0.35, H, 4, 1, true).translate(0, H / 2, 0)), 0.18, 0.15, 0.12),
    height: H,
    radius: 0.35,
  };
}

export function buildLog(seed) {
  const g = new THREE.CylinderGeometry(0.45, 0.55, 7, 8, 3, false);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.35, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3);
  return { parts: [{ kind: 'bark', geo: strip(g) }], far: null, height: 1, radius: 0.6 };
}
