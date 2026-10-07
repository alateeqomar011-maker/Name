// Species definitions: anatomy (spine / limbs / ornaments), colouring and behaviour parameters.
// Creature space: +Z forward, +Y up, X to the left/right. Origin = ground under the hips (fliers/swimmers: body centre).
import * as THREE from 'three';
import { CreatureGeometryBuilder, chainOwner } from './builder.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function hashN(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const h = (a, b, c) => hashN(xi + a, yi + b, zi + c);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

// Skin colouring: countershading + species patterns
function skinColor(pal) {
  return (u, s, sn, side, p) => {
    const dorsal = Math.cos(u * Math.PI * 2);
    let c = mix3(pal.belly, pal.back, sstep(-0.65, 0.25, dorsal));
    const n = vnoise(p.x * 1.3, p.y * 1.3, p.z * 1.3);
    if (pal.stripes && dorsal > -0.3) {
      const st = Math.sin(p.z * pal.stripes + n * 3.0);
      const k = sstep(0.55, 0.85, st) * sstep(-0.3, 0.3, dorsal);
      c = mix3(c, pal.stripe, k * 0.75);
    }
    if (pal.spots && dorsal > -0.2) {
      const sp = vnoise(p.x * pal.spots, p.y * pal.spots, p.z * pal.spots);
      c = mix3(c, pal.stripe, sstep(0.68, 0.78, sp) * 0.7);
    }
    if (pal.ridgeCol && dorsal > 0.92) c = mix3(c, pal.ridgeCol, 0.6);
    const m = (0.88 + n * 0.24) * (pal.gain ?? 0.62);
    // saturate a little
    const l = (c[0] + c[1] + c[2]) / 3;
    return [(l + (c[0] - l) * 1.25) * m, (l + (c[1] - l) * 1.25) * m, (l + (c[2] - l) * 1.25) * m];
  };
}

// Builds spine + limbs from a compact spec
function buildFromSpec(spec) {
  const B = new CreatureGeometryBuilder();
  const root = B.addBone('root', null, V(0, 0, 0));
  void root;
  const nodes = spec.spine.map((n) => ({ ...n, p: V(0, n.y, n.z) }));
  const pi = spec.pelvis;
  // bones for spine nodes (tips excluded)
  B.addBone(nodes[pi].name, 'root', nodes[pi].p);
  for (let i = pi + 1; i < nodes.length - 1; i++) B.addBone(nodes[i].name, nodes[i - 1].name, nodes[i].p);
  for (let i = pi - 1; i >= 1; i--) B.addBone(nodes[i].name, nodes[i + 1].name, nodes[i].p);
  const boneOf = (i) => (i >= 1 && i <= nodes.length - 2 ? B.bi(nodes[i].name) : null);
  const colorFn = skinColor(spec.palette);
  B.loft(nodes, {
    ring: spec.ring || 16,
    perSeg: spec.perSeg || 4,
    tile: spec.tile,
    owners: (seg, f) => {
      if (seg < pi) {
        // tail: owner = node closer to pelvis (seg+1)
        const owner = boneOf(seg + 1);
        const parent = seg + 2 <= pi ? boneOf(seg + 2) : null;
        const child = boneOf(seg);
        return chainOwner(owner, parent, child)(1 - f);
      }
      const owner = boneOf(seg);
      const parent = seg > pi ? boneOf(seg - 1) : null;
      const child = boneOf(seg + 1);
      return chainOwner(owner, parent, child)(f);
    },
    colorFn,
  });

  // limbs
  for (const leg of spec.legs || []) {
    for (const side of [-1, 1]) {
      const sfx = side < 0 ? 'L' : 'R';
      const names = leg.joints.map((_, j) => `${leg.name}${j}${sfx}`);
      const pts = leg.joints.map((j) => V(j[0] * side, j[1], j[2]));
      // bones for all but the tip
      for (let j = 0; j < pts.length - 1; j++) B.addBone(names[j], j === 0 ? leg.attach : names[j - 1], pts[j]);
      const lnodes = pts.map((p, j) => ({ p, w: leg.radii[j], h: leg.radii[j] * (leg.flatten ? leg.flatten[j] || 1 : 1), belly: 1 }));
      B.loft(lnodes, {
        ring: leg.ring || 10,
        perSeg: 3,
        tile: spec.tile,
        owners: (seg, f) => {
          const owner = B.bi(names[Math.min(seg, pts.length - 2)]);
          const parent = seg === 0 ? B.bi(leg.attach) : B.bi(names[seg - 1]);
          const child = seg + 1 <= pts.length - 2 ? B.bi(names[seg + 1]) : null;
          return chainOwner(owner, parent, child)(f);
        },
        colorFn: (u, s, sn, sd, p) => colorFn(u, s, sn, sd, p).map((v) => v * (leg.dark || 0.92)),
      });
      // toes / claws on the last bone
      if (leg.toes) {
        const footBone = B.bi(names[pts.length - 2]);
        const fp = pts[pts.length - 2];
        for (const t of leg.toes) {
          const tip = V(fp.x + t[0] * side, t[1], fp.z + t[2]);
          const g = new THREE.ConeGeometry(t[3], fp.distanceTo(tip), 5);
          const dir = tip.clone().sub(fp);
          g.translate(0, dir.length() / 2, 0);
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
          g.translate(fp.x, Math.max(fp.y, t[3]), fp.z);
          B.addRigid(g, footBone, spec.palette.claw || [0.15, 0.13, 0.11]);
        }
      }
    }
  }
  return { B, nodes };
}

function cone(base, tip, r, segs = 7) {
  const dir = tip.clone().sub(base);
  const g = new THREE.ConeGeometry(r, dir.length(), segs);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
  g.translate(base.x, base.y, base.z);
  return g;
}
function curvedHorn(base, dir, len, r, bend, segs = 6) {
  const parts = [];
  let p = base.clone();
  const d = dir.clone().normalize();
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const nd = d.clone().add(V(0, bend * t1, 0)).normalize();
    const np = p.clone().addScaledVector(nd, len / segs);
    const g = new THREE.CylinderGeometry(r * (1 - t1) + 0.005, r * (1 - t0) + 0.005, len / segs, 7);
    g.translate(0, len / segs / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nd));
    g.translate(p.x, p.y, p.z);
    parts.push(g);
    p = np;
  }
  return parts;
}
function eye(B, headBone, pos, r) {
  for (const side of [-1, 1]) {
    const g = new THREE.SphereGeometry(r, 8, 6);
    g.translate(pos.x * side, pos.y, pos.z);
    B.addRigid(g, headBone, [0.03, 0.025, 0.02]);
    const ir = new THREE.SphereGeometry(r * 0.55, 6, 4);
    ir.translate(pos.x * side + side * r * 0.6, pos.y, pos.z + r * 0.15);
    B.addRigid(ir, headBone, [0.55, 0.32, 0.06]);
  }
}
function jaw(B, spec, hinge, tip, w0, h0, palette) {
  B.addBone('jaw', 'head', hinge);
  const ji = B.bi('jaw');
  const mid = hinge.clone().lerp(tip, 0.5);
  B.loft([
    { p: hinge, w: w0, h: h0, belly: 1 },
    { p: mid.clone().add(V(0, -h0 * 0.15, 0)), w: w0 * 0.85, h: h0 * 0.8, belly: 1 },
    { p: tip, w: w0 * 0.35, h: h0 * 0.4, belly: 1 },
  ], {
    ring: 12, perSeg: 3, tile: spec.tile,
    owners: () => [[ji, 1]],
    colorFn: (u) => {
      const dorsal = Math.cos(u * Math.PI * 2);
      return dorsal > 0.6 ? [0.45, 0.12, 0.1] : palette.belly;
    },
  });
  return ji;
}
function teeth(B, bone, from, to, n, size, up, width) {
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = from.clone().lerp(to, t);
      p.x = width * (1 - t * 0.6) * side;
      const g = cone(p, p.clone().add(V(0, up * size * (1 - t * 0.4), size * 0.15)), size * 0.28, 4);
      B.addRigid(g, bone, [0.85, 0.8, 0.68]);
    }
  }
}

// ---------------------------------------------------------------- species
export const SPECIES = {};

SPECIES.trex = {
  id: 'trex', name: 'Tyrannosaurus rex', icon: '🦖', diet: 'carnivore', length: 12.3,
  tile: 0.9, texture: 'scales', scaleRange: [0.9, 1.1],
  palette: { back: [0.2, 0.17, 0.11], belly: [0.52, 0.46, 0.34], stripe: [0.08, 0.07, 0.05], stripes: 2.2, claw: [0.12, 0.1, 0.08] },
  spine: [
    { name: 'tail6', z: -6.6, y: 2.4, w: 0.05, h: 0.06 },
    { name: 'tail5', z: -5.3, y: 2.75, w: 0.17, h: 0.22 },
    { name: 'tail4', z: -4.0, y: 3.1, w: 0.3, h: 0.4 },
    { name: 'tail3', z: -2.6, y: 3.45, w: 0.47, h: 0.6 },
    { name: 'tail2', z: -1.3, y: 3.7, w: 0.68, h: 0.85, ridge: 0.08 },
    { name: 'pelvis', z: 0, y: 3.85, w: 0.85, h: 1.05, ridge: 0.1 },
    { name: 'spine1', z: 1.2, y: 3.8, w: 0.95, h: 1.15, belly: 1.05, ridge: 0.08 },
    { name: 'chest', z: 2.3, y: 3.6, w: 0.85, h: 1.05, belly: 1.05 },
    { name: 'neck0', z: 3.15, y: 3.65, w: 0.58, h: 0.7 },
    { name: 'neck1', z: 3.75, y: 3.95, w: 0.48, h: 0.6 },
    { name: 'head', z: 4.45, y: 4.05, w: 0.52, h: 0.62, belly: 0.55 },
    { name: 'snout', z: 5.85, y: 3.75, w: 0.24, h: 0.3, belly: 0.5 },
  ],
  pelvis: 5,
  legs: [
    { name: 'hind', attach: 'pelvis', joints: [[0.55, 3.5, 0.2], [0.68, 2.2, 0.95], [0.62, 0.85, -0.3], [0.62, 0.16, 0.3], [0.62, 0.06, 0.95]], radii: [0.6, 0.36, 0.2, 0.17, 0.1],
      toes: [[0.0, 0.05, 1.05, 0.09], [0.18, 0.05, 0.85, 0.08], [-0.18, 0.05, 0.85, 0.08]] },
    { name: 'arm', attach: 'chest', joints: [[0.52, 3.1, 2.5], [0.62, 2.7, 2.75], [0.56, 2.62, 3.15], [0.55, 2.5, 3.32]], radii: [0.13, 0.09, 0.06, 0.03], ring: 8 },
  ],
  extras(B) {
    const hb = B.bi('head');
    jaw(B, this, V(0, 3.62, 4.15), V(0, 3.38, 5.7), 0.44, 0.3, this.palette);
    teeth(B, hb, V(0, 3.62, 4.55), V(0, 3.5, 5.75), 9, 0.1, -1, 0.3);
    teeth(B, B.bi('jaw'), V(0, 3.62, 4.6), V(0, 3.45, 5.6), 8, 0.08, 1, 0.27);
    eye(B, hb, V(0.33, 4.25, 4.6), 0.07);
    // brow bosses
    for (const s of [-1, 1]) B.addRigid(new THREE.SphereGeometry(0.12, 6, 4).scale(1, 0.6, 1.4).translate(0.28 * s, 4.38, 4.65), hb, this.palette.back);
  },
  stats: { hp: 900, speed: 3.2, run: 9.0, turn: 1.0, bite: 45, aggro: 95, sight: 140, stride: 3.6, hip: 3.85, mass: 8000 },
  sound: { pitch: 0.55, roar: 1.0 },
  behavior: 'apex',
  journal: 'The tyrant lizard. Hunts alone, patrols vast territories and announces itself with a bone-shaking roar. It cannot squeeze into caves or climb steep rock — use that.',
};

SPECIES.triceratops = {
  id: 'triceratops', name: 'Triceratops', icon: '🦏', diet: 'herbivore', length: 8.5,
  tile: 0.8, texture: 'scales', scaleRange: [0.75, 1.1],
  palette: { back: [0.3, 0.24, 0.15], belly: [0.58, 0.5, 0.37], stripe: [0.15, 0.11, 0.07], spots: 1.6, claw: [0.2, 0.17, 0.13] },
  spine: [
    { name: 'tail5', z: -4.8, y: 1.25, w: 0.05, h: 0.06 },
    { name: 'tail4', z: -3.7, y: 1.6, w: 0.2, h: 0.26 },
    { name: 'tail3', z: -2.5, y: 2.05, w: 0.4, h: 0.48 },
    { name: 'tail2', z: -1.2, y: 2.45, w: 0.72, h: 0.8 },
    { name: 'pelvis', z: 0, y: 2.65, w: 1.0, h: 1.05, ridge: 0.08 },
    { name: 'spine1', z: 1.2, y: 2.6, w: 1.12, h: 1.2, belly: 1.05 },
    { name: 'chest', z: 2.3, y: 2.3, w: 0.98, h: 1.05 },
    { name: 'neck0', z: 3.0, y: 2.0, w: 0.62, h: 0.68 },
    { name: 'head', z: 3.55, y: 1.9, w: 0.55, h: 0.62, belly: 0.7 },
    { name: 'snout', z: 4.95, y: 1.3, w: 0.16, h: 0.28, belly: 0.6 },
  ],
  pelvis: 4,
  legs: [
    { name: 'hind', attach: 'pelvis', joints: [[0.72, 2.35, 0.0], [0.82, 1.4, 0.38], [0.8, 0.52, -0.1], [0.8, 0.1, 0.12], [0.8, 0.03, 0.42]], radii: [0.52, 0.34, 0.23, 0.25, 0.15],
      toes: [[0.0, 0.05, 0.45, 0.08], [0.15, 0.05, 0.38, 0.07], [-0.15, 0.05, 0.38, 0.07]] },
    { name: 'fore', attach: 'chest', joints: [[0.76, 1.95, 2.35], [0.98, 1.15, 2.2], [0.86, 0.42, 2.45], [0.86, 0.08, 2.6], [0.86, 0.03, 2.85]], radii: [0.4, 0.28, 0.21, 0.22, 0.13],
      toes: [[0.0, 0.05, 0.32, 0.07], [0.13, 0.05, 0.28, 0.06], [-0.13, 0.05, 0.28, 0.06]] },
  ],
  extras(B) {
    const hb = B.bi('head');
    jaw(B, this, V(0, 1.55, 3.7), V(0, 1.12, 4.85), 0.36, 0.25, this.palette);
    eye(B, hb, V(0.36, 2.15, 3.95), 0.06);
    const hornCol = [0.78, 0.72, 0.58];
    for (const s of [-1, 1]) for (const g of curvedHorn(V(0.26 * s, 2.3, 3.85), V(0.12 * s, 0.55, 1.0), 1.15, 0.12, -0.25)) B.addRigid(g, hb, (x, y, z) => mix3([0.42, 0.36, 0.26], hornCol, sstep(2.3, 2.8, y)));
    for (const g of curvedHorn(V(0, 1.85, 4.6), V(0, 1, 0.35), 0.38, 0.08, 0.1)) B.addRigid(g, hb, hornCol);
    // frill: a curved fan with a decorative border
    const frillC = V(0, 2.25, 3.3);
    B.addSheet(6, 14, (a, b) => {
      const ang = (b - 0.5) * Math.PI * 1.15;
      const r = 0.25 + a * 1.35;
      const x = Math.sin(ang) * r;
      const y = Math.cos(ang) * r * 0.95;
      const z = -a * 0.75 - Math.abs(Math.sin(ang)) * 0.15 * a;
      return V(frillC.x + x, frillC.y + y * 0.92, frillC.z + z + 0.2);
    }, () => [[hb], [1]], (a, b) => {
      const edge = sstep(0.82, 0.95, a);
      const band = Math.sin(b * 28) > 0.6 && a > 0.55 ? 1 : 0;
      let c = mix3([0.42, 0.3, 0.17], [0.7, 0.28, 0.12], sstep(0.3, 0.8, a));
      c = mix3(c, [0.15, 0.1, 0.06], band * 0.6);
      return mix3(c, [0.85, 0.75, 0.55], edge);
    });
    // epoccipitals (bony knobs) along the frill edge
    for (let i = 0; i <= 16; i++) {
      const ang = (i / 16 - 0.5) * Math.PI * 1.15;
      const r = 1.62;
      const p = V(Math.sin(ang) * r, frillC.y + Math.cos(ang) * r * 0.87, frillC.z - 0.55 - Math.abs(Math.sin(ang)) * 0.15 + 0.2);
      B.addRigid(cone(p, p.clone().add(V(Math.sin(ang) * 0.12, Math.cos(ang) * 0.12, -0.04)), 0.07, 5), hb, [0.8, 0.72, 0.55]);
    }
  },
  stats: { hp: 650, speed: 1.8, run: 7.0, turn: 1.2, bite: 30, aggro: 14, sight: 70, stride: 2.4, hip: 2.65, mass: 6000 },
  sound: { pitch: 0.9, roar: 0.6 },
  behavior: 'herd-defensive',
  herd: [5, 8],
  journal: 'Three-horned grazers that move in tight herds. Peaceful unless crowded or wounded — then they lower their horns and charge. Adults form a wall around juveniles when raptors appear.',
};

SPECIES.brachio = {
  id: 'brachio', name: 'Brachiosaurus', icon: '🦕', diet: 'herbivore', length: 22,
  tile: 1.4, texture: 'scales', scaleRange: [0.8, 1.05],
  palette: { back: [0.33, 0.35, 0.3], belly: [0.55, 0.55, 0.47], stripe: [0.25, 0.25, 0.2], spots: 0.7, claw: [0.25, 0.23, 0.2] },
  spine: [
    { name: 'tail6', z: -11, y: 3.4, w: 0.06, h: 0.07 },
    { name: 'tail5', z: -8.6, y: 4.2, w: 0.25, h: 0.3 },
    { name: 'tail4', z: -6.2, y: 5.0, w: 0.5, h: 0.6 },
    { name: 'tail3', z: -3.9, y: 5.6, w: 0.85, h: 0.95 },
    { name: 'tail2', z: -1.8, y: 5.95, w: 1.25, h: 1.35 },
    { name: 'pelvis', z: 0, y: 6.15, w: 1.55, h: 1.65 },
    { name: 'spine1', z: 2.0, y: 6.55, w: 1.75, h: 1.9, belly: 1.05 },
    { name: 'chest', z: 3.9, y: 7.0, w: 1.62, h: 1.85 },
    { name: 'neck0', z: 5.3, y: 8.0, w: 0.95, h: 1.0 },
    { name: 'neck1', z: 6.1, y: 9.6, w: 0.62, h: 0.66 },
    { name: 'neck2', z: 6.7, y: 11.2, w: 0.46, h: 0.5 },
    { name: 'neck3', z: 7.15, y: 12.6, w: 0.36, h: 0.4 },
    { name: 'head', z: 7.5, y: 13.4, w: 0.36, h: 0.42, belly: 0.6 },
    { name: 'snout', z: 8.6, y: 13.05, w: 0.17, h: 0.18, belly: 0.6 },
  ],
  pelvis: 5,
  legs: [
    { name: 'hind', attach: 'pelvis', joints: [[1.05, 5.8, 0.0], [1.15, 3.3, 0.45], [1.12, 0.95, -0.1], [1.12, 0.1, 0.12], [1.12, 0.03, 0.5]], radii: [0.9, 0.58, 0.45, 0.48, 0.3] },
    { name: 'fore', attach: 'chest', joints: [[1.12, 6.4, 3.9], [1.28, 3.8, 3.75], [1.18, 0.95, 4.0], [1.18, 0.08, 4.08], [1.18, 0.03, 4.35]], radii: [0.75, 0.52, 0.42, 0.44, 0.28] },
  ],
  extras(B) {
    const hb = B.bi('head');
    jaw(B, this, V(0, 13.2, 7.6), V(0, 12.95, 8.5), 0.24, 0.13, this.palette);
    eye(B, hb, V(0.26, 13.6, 7.75), 0.05);
    // nasal crest
    B.addRigid(new THREE.SphereGeometry(0.22, 8, 6).scale(0.8, 0.9, 1.4).translate(0, 13.75, 7.8), hb, this.palette.back);
  },
  stats: { hp: 2500, speed: 1.6, run: 3.6, turn: 0.5, bite: 0, aggro: 0, sight: 90, stride: 4.5, hip: 6.15, mass: 40000 },
  sound: { pitch: 0.35, roar: 0.5 },
  behavior: 'giant',
  herd: [3, 5],
  journal: 'Living towers. They browse the crowns of the tallest trees and their footsteps can be felt before they are seen. Harmless — unless you stand underfoot.',
};

SPECIES.raptor = {
  id: 'raptor', name: 'Velociraptor', icon: '🦎', diet: 'carnivore', length: 3.4,
  tile: 0.35, texture: 'feathers', scaleRange: [0.9, 1.1],
  palette: { gain: 0.8, back: [0.36, 0.2, 0.09], belly: [0.72, 0.62, 0.45], stripe: [0.1, 0.07, 0.05], stripes: 9, ridgeCol: [0.2, 0.25, 0.35], claw: [0.1, 0.09, 0.08] },
  spine: [
    { name: 'tail5', z: -2.05, y: 0.98, w: 0.03, h: 0.05 },
    { name: 'tail4', z: -1.55, y: 0.97, w: 0.06, h: 0.08 },
    { name: 'tail3', z: -1.05, y: 0.96, w: 0.09, h: 0.11 },
    { name: 'tail2', z: -0.5, y: 0.96, w: 0.13, h: 0.15 },
    { name: 'pelvis', z: 0, y: 0.97, w: 0.17, h: 0.21, ridge: 0.03 },
    { name: 'spine1', z: 0.35, y: 1.0, w: 0.19, h: 0.23, ridge: 0.03 },
    { name: 'chest', z: 0.65, y: 1.03, w: 0.17, h: 0.21 },
    { name: 'neck0', z: 0.85, y: 1.18, w: 0.09, h: 0.1 },
    { name: 'neck1', z: 0.96, y: 1.4, w: 0.075, h: 0.08 },
    { name: 'head', z: 1.06, y: 1.51, w: 0.085, h: 0.095, belly: 0.6 },
    { name: 'snout', z: 1.38, y: 1.47, w: 0.03, h: 0.038, belly: 0.6 },
  ],
  pelvis: 4,
  legs: [
    { name: 'hind', attach: 'pelvis', joints: [[0.13, 0.92, 0.03], [0.16, 0.6, 0.19], [0.15, 0.23, -0.09], [0.15, 0.04, 0.03], [0.15, 0.015, 0.17]], radii: [0.12, 0.07, 0.04, 0.035, 0.02],
      toes: [[0.0, 0.02, 0.2, 0.018], [0.04, 0.02, 0.16, 0.016], [-0.03, 0.09, 0.1, 0.02]] },
    { name: 'arm', attach: 'chest', joints: [[0.13, 0.98, 0.62], [0.18, 0.84, 0.52], [0.16, 0.78, 0.74], [0.15, 0.74, 0.88]], radii: [0.05, 0.04, 0.028, 0.012], ring: 8 },
  ],
  extras(B) {
    const hb = B.bi('head');
    jaw(B, this, V(0, 1.45, 1.06), V(0, 1.42, 1.34), 0.06, 0.028, this.palette);
    teeth(B, hb, V(0, 1.45, 1.12), V(0, 1.44, 1.35), 7, 0.018, -1, 0.045);
    eye(B, hb, V(0.065, 1.55, 1.12), 0.018);
    // arm feathers (wing-like vanes)
    for (const side of [-1, 1]) {
      const sfx = side < 0 ? 'L' : 'R';
      const b0 = B.bi('arm1' + sfx), b1 = B.bi('arm2' + sfx);
      B.addSheet(1, 6, (a, b) => V(side * (0.17 + 0.0 * a), 0.84 - b * 0.08 - a * 0.16, 0.52 + b * 0.36 - a * 0.1),
        (a, b) => (b < 0.5 ? [[b0], [1]] : [[b1], [1]]), (a) => mix3([0.3, 0.17, 0.08], [0.12, 0.08, 0.05], a));
    }
    // tail feather fan
    const tb = B.bi('tail2');
    B.addSheet(1, 6, (a, b) => V((b - 0.5) * 0.18 * (1 + a), 0.98, -1.4 - a * 0.7), (a) => (a > 0.5 ? [[B.bi('tail4')], [1]] : [[B.bi('tail3')], [1]]), (a, b) => mix3([0.35, 0.2, 0.09], [0.08, 0.06, 0.04], Math.sin(b * 12) > 0 ? a : 0.2));
    void tb;
  },
  stats: { hp: 110, speed: 2.4, run: 11.5, turn: 3.2, bite: 12, aggro: 60, sight: 80, stride: 1.4, hip: 0.97, mass: 70 },
  sound: { pitch: 1.9, roar: 0.4 },
  behavior: 'pack',
  herd: [4, 6],
  journal: 'Feathered pack hunters, larger than their cousins on the mainland fossils suggest. They stalk through cover, flank in silence and strike together. Fearless in numbers, skittish alone.',
};

SPECIES.ptero = {
  id: 'ptero', name: 'Pteranodon', icon: '🪽', diet: 'piscivore', length: 2.0,
  tile: 0.3, texture: 'smooth', scaleRange: [0.85, 1.15], flying: true,
  palette: { back: [0.36, 0.33, 0.3], belly: [0.82, 0.8, 0.74], stripe: [0.2, 0.18, 0.16], claw: [0.15, 0.12, 0.1] },
  spine: [
    { name: 'tail2', z: -0.62, y: 0.0, w: 0.02, h: 0.02 },
    { name: 'tail1', z: -0.42, y: 0.0, w: 0.06, h: 0.06 },
    { name: 'pelvis', z: -0.2, y: 0.0, w: 0.12, h: 0.12 },
    { name: 'spine1', z: 0.05, y: 0.02, w: 0.16, h: 0.16 },
    { name: 'chest', z: 0.3, y: 0.04, w: 0.17, h: 0.18 },
    { name: 'neck0', z: 0.55, y: 0.12, w: 0.07, h: 0.07 },
    { name: 'neck1', z: 0.78, y: 0.2, w: 0.055, h: 0.06 },
    { name: 'head', z: 0.98, y: 0.24, w: 0.07, h: 0.085, belly: 0.7 },
    { name: 'snout', z: 1.85, y: 0.16, w: 0.012, h: 0.018, belly: 0.7 },
  ],
  pelvis: 2,
  legs: [
    { name: 'arm', attach: 'chest', joints: [[0.14, 0.06, 0.3], [0.85, 0.09, 0.15], [1.55, 0.07, 0.36], [3.45, 0.0, -0.25]], radii: [0.07, 0.05, 0.035, 0.008], ring: 8 },
    { name: 'leg', attach: 'pelvis', joints: [[0.1, -0.05, -0.2], [0.15, -0.12, -0.42], [0.15, -0.14, -0.62], [0.15, -0.14, -0.72]], radii: [0.05, 0.03, 0.02, 0.01], ring: 6 },
  ],
  extras(B) {
    const hb = B.bi('head');
    eye(B, hb, V(0.055, 0.27, 1.0), 0.016);
    // crest
    B.addRigid(cone(V(0, 0.28, 0.92), V(0, 0.62, 0.35), 0.06, 4).scale(0.4, 1, 1).translate(0, 0, 0), hb, [0.65, 0.18, 0.1]);
    // wing membranes
    for (const side of [-1, 1]) {
      const sfx = side < 0 ? 'L' : 'R';
      const arm = [B.bi('arm0' + sfx), B.bi('arm1' + sfx), B.bi('arm2' + sfx)];
      const lead = [V(0.14 * side, 0.06, 0.3), V(0.85 * side, 0.09, 0.15), V(1.55 * side, 0.07, 0.36), V(3.45 * side, 0, -0.25)];
      const leadAt = (a) => {
        const f = a * 3, i = Math.min(2, Math.floor(f)), t = f - i;
        return lead[i].clone().lerp(lead[i + 1], t);
      };
      const pelv = B.bi('pelvis'), legb = B.bi('leg1' + sfx);
      B.addSheet(10, 4, (a, b) => {
        const L = leadAt(a);
        const trail = V((0.15 + a * 2.9) * side, -0.02, -0.45 - Math.sin(a * Math.PI) * 0.35 + a * 0.3);
        if (a > 0.97) trail.copy(L);
        const p = L.clone().lerp(trail, b);
        p.y -= Math.sin(b * Math.PI) * 0.06;
        return p;
      }, (a, b) => {
        const i = Math.min(2, Math.floor(a * 3));
        const wa = 1 - b * (1 - a);
        return [[arm[i], b * (1 - a) > 0.5 ? legb : pelv], [wa, 1 - wa]];
      }, (a, b) => mix3([0.42, 0.33, 0.28], [0.25, 0.18, 0.15], b * 0.6 + a * 0.2));
    }
  },
  stats: { hp: 60, speed: 14, run: 22, turn: 1.2, bite: 6, aggro: 0, sight: 120, stride: 1, hip: 0, mass: 20 },
  sound: { pitch: 2.4, roar: 0.3 },
  behavior: 'flyer',
  journal: 'Great gliders of the coast and cliffs. They ride thermals for hours with barely a wingbeat, then fold and plunge to snatch fish from the surf.',
};

SPECIES.mosa = {
  id: 'mosa', name: 'Mosasaurus', icon: '🐊', diet: 'carnivore', length: 13.5,
  tile: 0.8, texture: 'smooth', scaleRange: [0.85, 1.1], swimming: true,
  palette: { back: [0.1, 0.13, 0.16], belly: [0.72, 0.72, 0.68], stripe: [0.05, 0.07, 0.09], spots: 1.2, claw: [0.1, 0.1, 0.1] },
  spine: [
    { name: 'tail6', z: -7.2, y: -0.2, w: 0.04, h: 0.6 },
    { name: 'tail5', z: -6.0, y: 0, w: 0.16, h: 0.4 },
    { name: 'tail4', z: -4.6, y: 0, w: 0.32, h: 0.45 },
    { name: 'tail3', z: -3.1, y: 0, w: 0.52, h: 0.62 },
    { name: 'tail2', z: -1.5, y: 0, w: 0.76, h: 0.82 },
    { name: 'pelvis', z: 0, y: 0, w: 0.88, h: 0.92 },
    { name: 'spine1', z: 1.8, y: 0, w: 0.95, h: 0.98 },
    { name: 'chest', z: 3.4, y: 0, w: 0.86, h: 0.9 },
    { name: 'neck0', z: 4.5, y: 0.05, w: 0.62, h: 0.62 },
    { name: 'head', z: 5.3, y: 0.08, w: 0.5, h: 0.45, belly: 0.6 },
    { name: 'snout', z: 6.9, y: 0.0, w: 0.14, h: 0.14, belly: 0.6 },
  ],
  pelvis: 5,
  legs: [
    { name: 'flip', attach: 'chest', joints: [[0.7, -0.35, 3.2], [1.4, -0.55, 2.9], [2.0, -0.6, 2.4]], radii: [0.2, 0.14, 0.03], flatten: [0.35, 0.3, 0.3], ring: 8 },
    { name: 'rflip', attach: 'pelvis', joints: [[0.7, -0.35, 0.2], [1.2, -0.5, -0.15], [1.6, -0.55, -0.6]], radii: [0.16, 0.11, 0.03], flatten: [0.35, 0.3, 0.3], ring: 8 },
  ],
  extras(B) {
    const hb = B.bi('head');
    jaw(B, this, V(0, -0.15, 5.0), V(0, -0.18, 6.75), 0.42, 0.18, this.palette);
    teeth(B, hb, V(0, -0.1, 5.4), V(0, -0.12, 6.8), 10, 0.08, -1, 0.3);
    teeth(B, B.bi('jaw'), V(0, -0.1, 5.4), V(0, -0.14, 6.6), 9, 0.07, 1, 0.28);
    eye(B, hb, V(0.33, 0.25, 5.6), 0.05);
    // crescent tail fluke
    const t5 = B.bi('tail5');
    B.addSheet(4, 8, (a, b) => {
      const ang = (b - 0.5) * 2.4;
      return V(0, -0.15 + Math.sin(ang) * (0.3 + a * 1.1), -6.2 - a * 0.9 - Math.cos(ang) * 0.4 * a);
    }, () => [[t5], [1]], () => this.palette.back);
  },
  stats: { hp: 900, speed: 4, run: 10, turn: 0.9, bite: 50, aggro: 40, sight: 60, stride: 1, hip: 0, mass: 10000 },
  sound: { pitch: 0.5, roar: 0.5 },
  behavior: 'sea',
  journal: 'The terror of the deep water. Mosasaurs patrol beyond the reef where the seabed drops away. Swimmers who stray too far from shore rarely notice the shadow beneath them.',
};

SPECIES.plesio = {
  id: 'plesio', name: 'Elasmosaurus', icon: '🐉', diet: 'piscivore', length: 10,
  tile: 0.6, texture: 'smooth', scaleRange: [0.85, 1.1], swimming: true,
  palette: { back: [0.2, 0.24, 0.24], belly: [0.7, 0.72, 0.66], stripe: [0.1, 0.13, 0.13], spots: 2.0, claw: [0.1, 0.1, 0.1] },
  spine: [
    { name: 'tail3', z: -3.2, y: 0, w: 0.04, h: 0.06 },
    { name: 'tail2', z: -2.2, y: 0, w: 0.25, h: 0.25 },
    { name: 'pelvis', z: -0.9, y: 0, w: 0.75, h: 0.6 },
    { name: 'spine1', z: 0.4, y: 0, w: 0.95, h: 0.7 },
    { name: 'chest', z: 1.5, y: 0, w: 0.8, h: 0.62 },
    { name: 'neck0', z: 2.6, y: 0.1, w: 0.32, h: 0.3 },
    { name: 'neck1', z: 3.8, y: 0.35, w: 0.2, h: 0.2 },
    { name: 'neck2', z: 4.9, y: 0.7, w: 0.16, h: 0.16 },
    { name: 'neck3', z: 5.8, y: 1.15, w: 0.14, h: 0.14 },
    { name: 'head', z: 6.4, y: 1.4, w: 0.15, h: 0.13, belly: 0.7 },
    { name: 'snout', z: 6.95, y: 1.32, w: 0.05, h: 0.05, belly: 0.7 },
  ],
  pelvis: 2,
  legs: [
    { name: 'flip', attach: 'chest', joints: [[0.6, -0.25, 1.4], [1.4, -0.35, 1.1], [2.3, -0.4, 0.6]], radii: [0.2, 0.15, 0.03], flatten: [0.3, 0.3, 0.3], ring: 8 },
    { name: 'rflip', attach: 'pelvis', joints: [[0.55, -0.25, -0.9], [1.2, -0.35, -1.25], [1.9, -0.4, -1.7]], radii: [0.17, 0.12, 0.03], flatten: [0.3, 0.3, 0.3], ring: 8 },
  ],
  extras(B) {
    const hb = B.bi('head');
    eye(B, hb, V(0.11, 1.48, 6.5), 0.025);
    teeth(B, hb, V(0, 1.33, 6.45), V(0, 1.3, 6.92), 6, 0.04, -1, 0.06);
  },
  stats: { hp: 400, speed: 3, run: 6, turn: 0.8, bite: 15, aggro: 0, sight: 50, stride: 1, hip: 0, mass: 3000 },
  sound: { pitch: 1.1, roar: 0.4 },
  behavior: 'sea-gentle',
  journal: 'Impossibly long necks lift tiny heads above the swell. Elasmosaurs drift in the warm lagoons around the Azure Isles, snapping at fish shoals.',
};

export const SPECIES_ORDER = ['brachio', 'triceratops', 'raptor', 'trex', 'ptero', 'mosa', 'plesio'];

export function buildSpeciesGeometry(spec) {
  const { B } = buildFromSpec(spec);
  if (spec.extras) spec.extras.call(spec, B);
  const geo = B.build();
  return { geometry: geo, bones: B.bones, boneByName: B.boneByName };
}
