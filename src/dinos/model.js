// Procedural, skinned dinosaur models. Each species is generated from anatomical parameters:
// a swept body along a spine curve, jointed legs/arms, and species features (horns, frills, sails, plates...).
import * as THREE from 'three';
import { atmospherePatch, TRANSLUCENCY } from '../world/atmosphere.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLSL_NOISE, U } from '../world/shaderlib.js';

const deg = Math.PI / 180;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const IVORY = [0.78, 0.72, 0.6];
const CLAW = [0.16, 0.13, 0.11];
const EYE = [0.03, 0.025, 0.02];
const TOOTH = [0.92, 0.88, 0.78];

// ---------- helpers ----------
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function finishPart(geo, color, mat, skinFn) {
  geo = geo.index ? geo : geo; // keep
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    geo.setIndex(idx);
  }
  // strip unneeded attributes so every part has the same layout
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3), am = new Float32Array(n), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const p = geo.attributes.position;
  const tmp = { i: [0, 0, 0, 0], w: [1, 0, 0, 0] };
  for (let i = 0; i < n; i++) {
    const c = typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i), i) : color;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    am[i] = mat;
    skinFn(p.getX(i), p.getY(i), p.getZ(i), tmp, i);
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = tmp.i[k]; sw[i * 4 + k] = tmp.w[k]; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(am, 1));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return geo;
}

function rigid(bone) {
  return (x, y, z, o) => { o.i[0] = bone; o.i[1] = 0; o.i[2] = 0; o.i[3] = 0; o.w[0] = 1; o.w[1] = 0; o.w[2] = 0; o.w[3] = 0; };
}

function coneAlong(base, dir, len, r, seg = 7, curve = null) {
  const g = new THREE.ConeGeometry(r, len, seg, 3);
  g.translate(0, len / 2, 0);
  if (curve) {
    // bend the cone tip along `curve` vector (claws/horns)
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / len;
      p.setXYZ(i, p.getX(i) + curve.x * t * t, p.getY(i) + curve.y * t * t, p.getZ(i) + curve.z * t * t);
    }
  }
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(base.x, base.y, base.z);
  return g;
}

function ellipsoid(c, rx, ry, rz, ws = 10, hs = 7) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(c.x, c.y, c.z);
  return g;
}

// Tube along a polyline of {p, r} with per-vertex skin function
function tube(points, radial = 10, ringsPerSeg = 3, flatten = 1) {
  const pos = [], idx = [], ts = [];
  const pts = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let k = 0; k < ringsPerSeg; k++) {
      const t = k / ringsPerSeg;
      pts.push({ p: points[i].p.clone().lerp(points[i + 1].p, t), r: points[i].r + (points[i + 1].r - points[i].r) * t, seg: i, t });
    }
  }
  const last = points[points.length - 1];
  pts.push({ p: last.p.clone(), r: last.r, seg: points.length - 2, t: 1 });
  let prevN = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(pts.length - 1, i + 1)].p;
    const T = b.clone().sub(a).normalize();
    let N = prevN ? prevN.clone() : (Math.abs(T.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0));
    N.sub(T.clone().multiplyScalar(N.dot(T))).normalize();
    prevN = N;
    const Bv = T.clone().cross(N).normalize();
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const c = Math.cos(ang), s = Math.sin(ang);
      const P = pts[i].p.clone().addScaledVector(N, c * pts[i].r).addScaledVector(Bv, s * pts[i].r * flatten);
      pos.push(P.x, P.y, P.z);
      ts.push(pts[i].seg + pts[i].t);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  // caps
  const capS = pos.length / 3;
  pos.push(pts[0].p.x, pts[0].p.y, pts[0].p.z); ts.push(0);
  const capE = pos.length / 3;
  const lp = pts[pts.length - 1].p;
  pos.push(lp.x, lp.y, lp.z); ts.push(points.length - 1);
  const lastRing = (pts.length - 1) * radial;
  for (let j = 0; j < radial; j++) {
    idx.push(capS, j, (j + 1) % radial);
    idx.push(capE, lastRing + ((j + 1) % radial), lastRing + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.ts = ts;
  return g;
}

// Flat double-faced polygon (plates, frills, sails). verts: array of Vector3 forming a fan around verts[0]
function fan(verts) {
  const pos = [];
  for (const v of verts) pos.push(v.x, v.y, v.z);
  const idx = [];
  for (let i = 1; i < verts.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- Template builders ----------
export function buildTemplate(spec) {
  if (spec.flyer) return buildFlyer(spec);
  if (spec.aquatic) return buildMarine(spec);
  return buildWalker(spec);
}

function buildWalker(spec) {
  const P = spec.body;
  const W = P.width || 1;
  const hipY = P.hip;
  const keys = [];
  // Tail (tip -> base)
  const nT = 8;
  for (let k = 0; k <= nT; k++) {
    const t = k / nT;
    const r = P.tailBase * (0.06 + 0.94 * Math.pow(t, 1.05));
    const tall = P.paddleTail ? 1.9 : 1.15;
    keys.push({ z: -P.tailLen * (1 - t), y: hipY + P.tailRaise * (1 - t) - 0.05 * P.hip * Math.sin(t * Math.PI), rw: r * 0.82 * W, rt: r * tall, rb: r * (P.paddleTail ? 1.5 : 1.05), part: 'tail' });
  }
  keys.pop(); // last tail key coincides with hip
  const chestY = hipY + P.shoulderDY;
  keys.push({ z: 0, y: hipY, rw: P.hipR * W, rt: P.hipR * 0.92, rb: P.hipR * 1.12, part: 'hip' });
  keys.push({ z: P.bodyLen * 0.5, y: hipY + P.shoulderDY * 0.5 + 0.02 * P.hip, rw: P.bellyR * W, rt: P.bellyR * 0.82, rb: P.bellyR * 1.22, part: 'belly' });
  keys.push({ z: P.bodyLen, y: chestY, rw: P.chestR * W, rt: P.chestR * 0.92, rb: P.chestR * 1.12, part: 'chest' });
  // Neck
  const nN = P.neckSegs || 3;
  let nz = P.bodyLen, ny = chestY;
  const neckPts = [];
  for (let k = 1; k <= nN; k++) {
    const t = k / nN;
    const a = P.neckAngle * deg * (1.08 - 0.3 * t);
    nz += Math.cos(a) * (P.neckLen / nN);
    ny += Math.sin(a) * (P.neckLen / nN);
    const r = P.neckR0 + (P.neckR1 - P.neckR0) * t;
    keys.push({ z: nz, y: ny, rw: r * 0.9 * W, rt: r, rb: r * 1.05, part: 'neck' });
    neckPts.push(keys.length - 1);
  }
  // Head
  const ha = P.headAngle * deg;
  const hd = v3(0, Math.sin(ha), Math.cos(ha));
  const hb = v3(0, ny, nz).addScaledVector(hd, P.headR * 0.35);
  const headProfile = [
    [0.0, 1.0, 1.0], [0.3, 0.96, 0.95], [0.6, 0.72, 0.75], [0.85, P.snoutR / P.headR, P.snoutR / P.headR * 0.9], [1.0, P.snoutR / P.headR * 0.55, P.snoutR / P.headR * 0.45],
  ];
  const headKeyStart = keys.length;
  for (const [s, rs, hs] of headProfile) {
    const c = hb.clone().addScaledVector(hd, s * P.headLen);
    let rw = P.headR * rs * 0.85 * (W > 1.3 ? 1.25 : 1);
    if (P.duckbill && s > 0.6) rw = P.headR * 0.62;
    keys.push({ z: c.z, y: c.y, rw, rt: P.headR * hs * P.headH * 0.82, rb: P.headR * hs * P.headH * 0.62, part: 'head' });
  }
  const headTip = hb.clone().addScaledVector(hd, P.headLen);

  // Arc lengths of keys
  const arcs = [0];
  for (let i = 1; i < keys.length; i++) arcs.push(arcs[i - 1] + Math.hypot(keys[i].z - keys[i - 1].z, keys[i].y - keys[i - 1].y));
  const total = arcs[arcs.length - 1];
  // Linear profile table, then blurred along the arc for smooth, fold-free transitions
  const TN = 400;
  const fields = ['z', 'y', 'rw', 'rt', 'rb'];
  const table = {};
  for (const f of fields) table[f] = new Float32Array(TN + 1);
  for (let m = 0; m <= TN; m++) {
    const a = (m / TN) * total;
    let i = 0;
    while (i < keys.length - 2 && arcs[i + 1] < a) i++;
    const t = Math.min(1, Math.max(0, (a - arcs[i]) / (arcs[i + 1] - arcs[i] || 1)));
    for (const f of fields) table[f][m] = keys[i][f] + (keys[i + 1][f] - keys[i][f]) * t;
  }
  const blurR = Math.max(2, Math.round(TN * 0.022));
  for (const f of fields) {
    let src = table[f];
    for (let pass = 0; pass < 3; pass++) {
      const dst = new Float32Array(TN + 1);
      for (let m = 0; m <= TN; m++) {
        let acc = 0, cnt = 0;
        const r = Math.min(blurR, m, TN - m) ;
        for (let k = -r; k <= r; k++) { acc += src[m + k]; cnt++; }
        dst[m] = acc / cnt;
      }
      src = dst;
    }
    table[f] = src;
  }
  const sampleAt = (a) => {
    const f = Math.min(TN, Math.max(0, (a / total) * TN));
    const m = Math.min(TN - 1, Math.floor(f)), t = f - m;
    const g = (n) => table[n][m] + (table[n][m + 1] - table[n][m]) * t;
    return { z: g('z'), y: g('y'), rw: Math.max(0.004, g('rw')), rt: Math.max(0.004, g('rt')), rb: Math.max(0.004, g('rb')) };
  };

  // ----- Bones -----
  const bones = []; // {name, parent, pos}
  const addBone = (name, parent, pos) => { bones.push({ name, parent, pos: pos.clone() }); return bones.length - 1; };
  const hipArc = arcs[nT];
  const chestKey = nT + 2;
  const root = addBone('root', -1, v3(0, hipY, 0));
  const spineChain = []; // [boneIndex, arc]
  // tail bones from base to tip
  const tailBones = [];
  let parent = root;
  const nTB = 6;
  for (let k = 1; k <= nTB; k++) {
    const a = hipArc * (1 - k / (nTB + 0.6));
    const s = sampleAt(a);
    parent = addBone('tail' + k, parent, v3(0, s.y, s.z));
    tailBones.push([parent, a]);
  }
  const midArc = arcs[nT + 1];
  const sm = sampleAt(midArc);
  const spine = addBone('spine', root, v3(0, sm.y, sm.z));
  const chestArc = arcs[chestKey];
  const sc = sampleAt(chestArc);
  const chest = addBone('chest', spine, v3(0, sc.y, sc.z));
  const neckBones = [];
  parent = chest;
  for (let k = 0; k < neckPts.length; k++) {
    const ki = neckPts[k];
    const a = (k === 0) ? (arcs[chestKey] + arcs[ki]) * 0.5 : arcs[neckPts[k - 1]];
    const s = sampleAt(a);
    parent = addBone('neck' + k, parent, v3(0, s.y, s.z));
    neckBones.push([parent, a]);
  }
  const headArc = arcs[headKeyStart];
  const head = addBone('head', parent, v3(0, hb.y, hb.z));
  const hUp = v3(0, hd.z, -hd.y);
  const hinge = hb.clone().addScaledVector(hd, P.headLen * 0.05).addScaledVector(hUp, -P.headR * P.headH * 0.3);
  const jaw = addBone('jaw', head, hinge);

  const chain = [...tailBones.slice().reverse(), [root, hipArc], [spine, midArc], [chest, chestArc], ...neckBones, [head, headArc]];
  const spineSkin = (a, o) => {
    let i = 0;
    if (a <= chain[0][1]) { o.i[0] = chain[0][0]; o.w[0] = 1; o.i[1] = 0; o.w[1] = 0; o.i[2] = o.i[3] = 0; o.w[2] = o.w[3] = 0; return; }
    while (i < chain.length - 1 && chain[i + 1][1] < a) i++;
    if (i >= chain.length - 1) { o.i[0] = chain[chain.length - 1][0]; o.w[0] = 1; o.i[1] = 0; o.w[1] = 0; o.i[2] = o.i[3] = 0; o.w[2] = o.w[3] = 0; return; }
    let t = (a - chain[i][1]) / (chain[i + 1][1] - chain[i][1]);
    t = t * t * (3 - 2 * t);
    o.i[0] = chain[i][0]; o.w[0] = 1 - t; o.i[1] = chain[i + 1][0]; o.w[1] = t; o.i[2] = o.i[3] = 0; o.w[2] = o.w[3] = 0;
  };

  // ----- Body sweep -----
  const parts = [];
  const RINGS = Math.max(70, Math.round(total / (spec.length / 90)));
  const RAD = 16;
  const pos = [], idx = [], ringArc = [], ringInfo = [];
  for (let m = 0; m <= RINGS; m++) {
    const a = (m / RINGS) * total;
    const s = sampleAt(a);
    const dA = Math.max(0.01, spec.length * 0.025);
    const s2 = sampleAt(Math.min(total, a + dA)), s1 = sampleAt(Math.max(0, a - dA));
    let tz = s2.z - s1.z, ty = s2.y - s1.y;
    const tl = Math.hypot(tz, ty) || 1; tz /= tl; ty /= tl;
    const upY = tz, upZ = -ty;
    ringInfo.push({ z: s.z, y: s.y, rt: s.rt, rb: s.rb, rw: s.rw, a });
    for (let j = 0; j < RAD; j++) {
      const ang = (j / RAD) * Math.PI * 2;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const vr = c >= 0 ? s.rt : s.rb;
      // slightly squarer cross-section for bulk
      const sq = 1 + 0.08 * Math.pow(Math.sin(2 * ang), 2);
      const x = sn * s.rw * sq;
      const up = c * vr * sq;
      pos.push(x, s.y + upY * up, s.z + upZ * up);
      ringArc.push(a);
    }
  }
  for (let m = 0; m < RINGS; m++) for (let j = 0; j < RAD; j++) {
    const a = m * RAD + j, b = m * RAD + ((j + 1) % RAD), c = a + RAD, d = b + RAD;
    idx.push(a, b, c, b, d, c);
  }
  const cs = pos.length / 3; pos.push(0, ringInfo[0].y, ringInfo[0].z - 0.01); ringArc.push(0);
  const ce = pos.length / 3; pos.push(0, ringInfo[RINGS].y, ringInfo[RINGS].z + 0.01); ringArc.push(total);
  for (let j = 0; j < RAD; j++) {
    idx.push(cs, (j + 1) % RAD, j);
    idx.push(ce, RINGS * RAD + j, RINGS * RAD + ((j + 1) % RAD));
  }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bodyGeo.setIndex(idx);
  bodyGeo.computeVertexNormals();
  parts.push(finishPart(bodyGeo, [1, 1, 1], 0, (x, y, z, o, i) => spineSkin(ringArc[i], o)));

  const ringAtZ = (z) => {
    let best = ringInfo[0], bd = Infinity;
    for (const r of ringInfo) { const d = Math.abs(r.z - z); if (d < bd && r.a < headArc) { bd = d; best = r; } }
    return best;
  };
  const skinAtZ = (z, o) => spineSkin(ringAtZ(z).a, o);

  // Head frame helper: a along head dir, b up, c side
  const headPt = (a, b, c) => hb.clone().addScaledVector(hd, a).addScaledVector(hUp, b).add(v3(c, 0, 0));
  const headR = (s) => {
    const sp = sampleAt(headArc + s * (total - headArc));
    return sp;
  };

  // ----- Jaw -----
  {
    const pts = [];
    for (const s of [0.0, 0.3, 0.6, 0.85, 0.98]) {
      const hr = headR(s);
      const c = headPt(s * P.headLen, -hr.rb * 0.55, 0);
      pts.push({ p: c, r: Math.max(0.01, hr.rw * 0.78) });
    }
    const jg = tube(pts, 10, 2, 0.45);
    parts.push(finishPart(jg, [1, 1, 1], 0, rigid(jaw)));
    if (P.teeth) {
      for (let k = 0; k < 9; k++) {
        const s = 0.32 + k * 0.075;
        const hr = headR(s);
        for (const side of [-1, 1]) {
          const tl = P.headR * 0.18;
          parts.push(finishPart(coneAlong(headPt(s * P.headLen, -hr.rb * 0.62, side * hr.rw * 0.78), v3(0, -1, 0.15), tl, tl * 0.25, 4), TOOTH, 1, rigid(head)));
          const hr2 = headR(s);
          parts.push(finishPart(coneAlong(headPt(s * P.headLen, -hr2.rb * 0.62, side * hr2.rw * 0.62), v3(0, 1, 0.1), tl * 0.8, tl * 0.22, 4), TOOTH, 1, rigid(jaw)));
        }
      }
    }
  }
  // ----- Eyes -----
  {
    const hr = headR(0.2);
    const er = Math.max(0.015, P.headR * 0.13);
    for (const side of [-1, 1]) {
      parts.push(finishPart(ellipsoid(headPt(P.headLen * 0.2, hr.rt * 0.42, side * hr.rw * 0.86), er, er, er, 8, 6), EYE, 3, rigid(head)));
    }
  }

  // ----- Legs -----
  const legs = [];
  const buildLeg = (side, j0, lens, angles, thick, footLen, parentBone, prefix, claws) => {
    const H = j0.y;
    const dirs = angles.map((a) => v3(0, -Math.cos(a * deg), Math.sin(a * deg)));
    let K = j0.clone().addScaledVector(dirs[0], lens[0] * H);
    let A = K.clone().addScaledVector(dirs[1], lens[1] * H);
    let T = A.clone().addScaledVector(dirs[2], lens[2] * H);
    // normalise so the toe touches the ground
    const ground = thick * 0.18;
    const sy = (j0.y - ground) / (j0.y - T.y);
    K = j0.clone().add(K.clone().sub(j0).multiplyScalar(sy));
    A = j0.clone().add(A.clone().sub(j0).multiplyScalar(sy));
    T = j0.clone().add(T.clone().sub(j0).multiplyScalar(sy));
    const F = T.clone().add(v3(0, -T.y + ground * 0.7, footLen));
    const b0 = addBone(prefix + 'U' + side, parentBone, j0);
    const b1 = addBone(prefix + 'L' + side, b0, K);
    const b2 = addBone(prefix + 'A' + side, b1, A);
    const b3 = addBone(prefix + 'T' + side, b2, T);
    const pts = [
      { p: j0.clone().add(v3(-Math.sign(j0.x) * thick * 0.2, -thick * 0.15, 0)), r: thick * 0.85 },
      { p: j0.clone().lerp(K, 0.45), r: thick * 0.95 },
      { p: K, r: thick * 0.52 },
      { p: K.clone().lerp(A, 0.5), r: thick * 0.4 },
      { p: A, r: thick * 0.3 },
      { p: T, r: thick * 0.26 },
      { p: F, r: thick * 0.12 },
    ];
    const g = tube(pts, 10, 3);
    const ts = g.userData.ts;
    const bmap = [b0, b0, b1, b1, b2, b3, b3];
    parts.push(finishPart(g, [1, 1, 1], 0, (x, y, z, o, i) => {
      const t = ts[i];
      const s0 = Math.min(5, Math.floor(t)), f = t - s0;
      const segB = [b0, b0, b1, b1, b2, b3];
      const ba = segB[s0], bb = bmap[s0 + 1];
      // blend near joints
      const w = f > 0.7 ? (f - 0.7) / 0.3 * 0.5 : 0;
      o.i[0] = ba; o.w[0] = 1 - w; o.i[1] = bb; o.w[1] = w; o.i[2] = o.i[3] = 0; o.w[2] = o.w[3] = 0;
    }));
    // muscle mass at the top of the limb
    const mz = prefix === 'leg' ? 1 : 0.8;
    parts.push(finishPart(ellipsoid(j0.clone().add(v3(-Math.sign(j0.x) * thick * 0.15, -thick * 0.7, (K.z - j0.z) * 0.25)), thick * 0.72 * mz, thick * 1.5 * mz, thick * 1.15 * mz, 12, 9), [1, 1, 1], 0, (x, y, z, o) => {
      const t = Math.min(1, Math.max(0, (j0.y + thick * 0.4 - y) / (thick * 3)));
      o.i[0] = parentBone; o.w[0] = 1 - t; o.i[1] = b0; o.w[1] = t; o.i[2] = o.i[3] = 0; o.w[2] = o.w[3] = 0;
    }));
    // toes/claws
    if (claws) {
      for (const cx of [-1, 0, 1]) {
        const base = F.clone().add(v3(cx * thick * 0.28, 0, -thick * 0.05));
        const dir = v3(cx * 0.3, -0.25, 1);
        parts.push(finishPart(coneAlong(base, dir, thick * 0.6, thick * 0.1, 5, v3(0, -thick * 0.25, 0)), CLAW, 1, rigid(b3)));
      }
    }
    return { side, upper: b0, lower: b1, ankle: b2, toe: b3 };
  };

  const hipX = P.hipR * W * 0.62;
  const hipJ = (s) => v3(s * hipX, hipY - P.hipR * 0.28, 0.05 * P.hip);
  if (P.biped) {
    for (const s of [-1, 1]) {
      const L = buildLeg(s, hipJ(s), [0.46, 0.44, 0.27], [-28, 38, -18], P.legThick, P.hip * 0.22, root, 'leg', true);
      legs.push(L);
      if (P.sickle) {
        parts.push(finishPart(coneAlong(v3(s * hipX * 0.85, P.legThick * 0.6, 0.12 * P.hip), v3(0, 1, 0.6), P.legThick * 0.9, P.legThick * 0.14, 5, v3(0, 0, P.legThick * 0.5)), CLAW, 1, rigid(L.toe)));
      }
    }
  } else {
    for (const s of [-1, 1]) legs.push(buildLeg(s, hipJ(s), [0.5, 0.42, 0.16], [-8, 14, -4], P.legThick, P.hip * 0.1, root, 'leg', P.length > 0));
  }
  const arms = [];
  const shoulder = (s) => v3(s * P.chestR * W * 0.6, chestY - P.chestR * 0.45, P.bodyLen * 0.92);
  if (!P.biped) {
    for (const s of [-1, 1]) {
      const sh = shoulder(s);
      const shY = P.shoulder || sh.y;
      sh.y = Math.min(sh.y, shY);
      arms.push(buildLeg(s, sh, [0.5, 0.42, 0.12], [12, -10, 4], P.armThick, P.armThick * 0.6, chest, 'arm', true));
      if (P.thumbSpikes) {
        const L = arms[arms.length - 1];
        const tp = bones[L.toe].pos.clone().add(v3(-s * P.armThick * 0.4, P.armThick * 0.4, P.armThick * 0.2));
        parts.push(finishPart(coneAlong(tp, v3(-s * 0.6, 0.6, 0.6), P.armThick * 0.9, P.armThick * 0.2, 5), IVORY, 1, rigid(L.toe)));
      }
    }
  } else {
    for (const s of [-1, 1]) {
      const sh = v3(s * P.chestR * W * 0.7, chestY - P.chestR * 0.35, P.bodyLen * 0.9);
      const al = P.armLen;
      const E = sh.clone().add(v3(s * al * 0.05, -al * 0.42, al * 0.12));
      const Wr = E.clone().add(v3(0, -al * 0.1, al * 0.36));
      const Hn = Wr.clone().add(v3(0, -al * 0.08, al * 0.16));
      const b0 = addBone('armU' + s, chest, sh), b1 = addBone('armL' + s, b0, E), b2 = addBone('armA' + s, b1, Wr);
      const g = tube([{ p: sh, r: P.armThick * 1.3 }, { p: E, r: P.armThick }, { p: Wr, r: P.armThick * 0.7 }, { p: Hn, r: P.armThick * 0.4 }], 7, 2);
      const ts = g.userData.ts;
      parts.push(finishPart(g, [1, 1, 1], 0, (x, y, z, o, i) => { const t = ts[i]; const b = t < 1 ? b0 : t < 2 ? b1 : b2; rigid(b)(x, y, z, o); }));
      const clawN = P.scythe ? 3 : 2;
      for (let c = 0; c < clawN; c++) {
        const cl = P.scythe ? al * 0.45 : P.armThick * 2.2;
        parts.push(finishPart(coneAlong(Hn.clone().add(v3((c - (clawN - 1) / 2) * P.armThick * 0.7, 0, 0)), v3(0, -0.6, 1), cl, P.armThick * (P.scythe ? 0.35 : 0.3), 5, v3(0, -cl * 0.5, -cl * 0.1)), P.scythe ? IVORY : CLAW, 1, rigid(b2)));
      }
      if (P.feathers) {
        for (let f = 0; f < 5; f++) {
          const t = f / 4;
          const base = sh.clone().lerp(Wr, 0.2 + t * 0.8);
          const tip = base.clone().add(v3(s * al * 0.05, -al * 0.12, -al * (0.18 + 0.1 * t)));
          const g2 = fan([base, base.clone().add(v3(0, al * 0.03, al * 0.06)), tip, base.clone().add(v3(0, -al * 0.03, -al * 0.02))]);
          parts.push(finishPart(g2, [1, 1, 1], 2, rigid(t < 0.4 ? b0 : b1)));
        }
      }
      arms.push({ side: s, upper: b0, lower: b1, ankle: b2, toe: b2 });
    }
  }

  // ----- Features -----
  const topAt = (z) => { const r = ringAtZ(z); return r.y + r.rt; };
  if (P.frill) {
    const hr = headR(0.0);
    const c = headPt(-P.headR * 0.35, hr.rt * 0.45, 0);
    const a = P.frill.angle * deg;
    const back = hd.clone().multiplyScalar(-1);
    const upv = hUp.clone().multiplyScalar(Math.sin(a)).addScaledVector(back, Math.cos(a)).normalize();
    const verts = [c.clone().addScaledVector(hd, P.headR * 0.4)];
    const N = 16;
    for (let k = 0; k <= N; k++) {
      const t = -1.1 + (k / N) * 2.2;
      const scallop = 1 + 0.07 * Math.cos(k * Math.PI);
      const p = c.clone().addScaledVector(upv, Math.cos(t) * P.frill.r * scallop).add(v3(Math.sin(t) * P.frill.r * 1.05 * scallop, 0, 0));
      p.addScaledVector(back, Math.pow(Math.abs(Math.sin(t)), 2) * 0.25 * P.frill.r);
      verts.push(p);
    }
    const g = fan(verts);
    parts.push(finishPart(g, [1, 1, 1], 2, rigid(head)));
    // frill epoccipitals (edge knobs)
    for (let k = 1; k < verts.length; k += 2) {
      parts.push(finishPart(coneAlong(verts[k], verts[k].clone().sub(c).normalize(), P.frill.r * 0.08, P.frill.r * 0.04, 4), IVORY, 1, rigid(head)));
    }
  }
  if (P.horns) {
    for (const [side, a, b, len, r] of P.horns) {
      const base = headPt(P.headLen * 0.12 + a * 0 , headR(0.15).rt * 0.75, side * 0.32 * P.headR / 0.62);
      const dir = hd.clone().multiplyScalar(0.8).addScaledVector(hUp, 0.75).add(v3(side * 0.12, 0, 0)).normalize();
      parts.push(finishPart(coneAlong(base, dir, len, r, 7, hd.clone().multiplyScalar(len * 0.15)), (x, y, z) => IVORY, 1, rigid(head)));
    }
  }
  if (P.noseHorn) {
    const hr = headR(0.82);
    parts.push(finishPart(coneAlong(headPt(P.headLen * 0.8, hr.rt * 0.8, 0), hUp.clone().addScaledVector(hd, 0.4).normalize(), P.noseHorn, P.noseHorn * 0.3, 6), IVORY, 1, rigid(head)));
  }
  if (P.browHorns) {
    const hr = headR(0.25);
    for (const s of [-1, 1]) parts.push(finishPart(coneAlong(headPt(P.headLen * 0.24, hr.rt * 0.9, s * hr.rw * 0.55), hUp.clone().add(v3(s * 0.2, 0, 0)), P.headR * 0.32, P.headR * 0.12, 5), [1, 1, 1], 2, rigid(head)));
  }
  if (P.headSpikes) {
    const hr = headR(0.05);
    for (const s of [-1, 1]) {
      parts.push(finishPart(coneAlong(headPt(0, hr.rt * 0.4, s * hr.rw * 0.95), v3(s, 0.3, -0.6), P.headR * 0.55, P.headR * 0.16, 5), IVORY, 1, rigid(head)));
      parts.push(finishPart(coneAlong(headPt(P.headLen * 0.3, -hr.rb * 0.2, s * hr.rw * 0.95), v3(s, -0.3, -0.3), P.headR * 0.4, P.headR * 0.13, 5), IVORY, 1, rigid(head)));
    }
  }
  if (P.dome) {
    const hr = headR(0.15);
    parts.push(finishPart(ellipsoid(headPt(P.headLen * 0.15, hr.rt * 0.55, 0), P.dome * 0.85, P.dome * 0.75, P.dome, 12, 8), (x, y, z) => [0.62 + Math.random() * 0.05, 0.55, 0.42], 1, rigid(head)));
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      const base = headPt(P.headLen * 0.15 - Math.cos(ang) * P.dome * 0.9, hr.rt * 0.2, Math.sin(ang) * P.dome * 0.8);
      parts.push(finishPart(coneAlong(base, v3(Math.sin(ang), 0.2, -Math.cos(ang)), P.dome * 0.3, P.dome * 0.1, 4), IVORY, 1, rigid(head)));
    }
  }
  if (P.crest) {
    const hr = headR(0.25);
    const base = headPt(P.headLen * 0.25, hr.rt * 0.7, 0);
    const dir = hd.clone().multiplyScalar(-1).addScaledVector(hUp, 0.35).normalize();
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pts.push({ p: base.clone().addScaledVector(dir, P.crest.len * t).addScaledVector(hUp, -0.12 * t * t * P.crest.len), r: P.crest.r * (1 - 0.35 * t) });
    }
    parts.push(finishPart(tube(pts, 8, 2), [1, 1, 1], 2, rigid(head)));
  }
  if (P.twinCrest) {
    for (const s of [-1, 1]) {
      const verts = [headPt(P.headLen * 0.45, headR(0.4).rt * 0.85, s * P.headR * 0.32)];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        verts.push(headPt(P.headLen * (0.85 - t * 0.85), headR(0.85 - t * 0.85).rt * 0.9 + Math.sin(t * Math.PI) * P.headR * 1.3, s * P.headR * 0.3));
      }
      parts.push(finishPart(fan(verts), [1, 1, 1], 2, rigid(head)));
    }
  }
  if (P.sail) {
    // Membrane sail supported by neural spines; spine tips poke above the scalloped edge
    const S = P.sail;
    const pos2 = [], idx2 = [], zs = [], cols = [];
    const n = 60;
    const ribs = Math.round((S.to - S.from) / 0.3);
    const hAt = (t) => S.h * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.03)), 0.65);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const z = S.from + (S.to - S.from) * t;
      const y0 = topAt(z) - 0.1;
      const ribPhase = Math.abs(Math.sin(t * ribs * Math.PI));
      const h = Math.max(0.05, hAt(t) * (0.9 + 0.1 * Math.pow(ribPhase, 6)));
      pos2.push(0, y0, z, 0, y0 + h * 0.5, z - 0.07, 0, y0 + h, z - 0.15);
      zs.push(z, z, z);
      const rib = Math.pow(ribPhase, 30) > 0.5 ? 0.45 : 1;
      cols.push(0.42 * rib, 0.38 * rib, 0.26 * rib, 1.0 * rib, 0.95 * rib, 0.9 * rib, 1.12 * rib, 1.0 * rib, 0.9 * rib);
    }
    for (let k = 0; k < n; k++) {
      const a = k * 3;
      idx2.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
    g.setIndex(idx2);
    g.computeVertexNormals();
    parts.push(finishPart(g, (x, y, z, i) => [cols[i * 3], cols[i * 3 + 1], cols[i * 3 + 2]], 2, (x, y, z, o, i) => skinAtZ(zs[i], o)));
    // spine tips
    for (let r = 0; r <= ribs; r++) {
      const t = (r + 0.5) / (ribs + 1);
      const z = S.from + (S.to - S.from) * t;
      const top = topAt(z) - 0.1 + hAt(t);
      const len = 0.12 + hAt(t) * 0.12;
      parts.push(finishPart(coneAlong(v3(0, top - len * 0.4, z - 0.15), v3(0, 1, -0.15), len, 0.035, 4), [0.86, 0.82, 0.7], 1, (x, y, zz, o) => skinAtZ(z, o)));
    }
  }
  if (P.backHorns) {
    // two large horns sweeping back from the top of the skull
    const hr = headR(0.12);
    for (const sd of [-1, 1]) {
      const base = headPt(P.headLen * 0.1, hr.rt * 0.75, sd * hr.rw * 0.55);
      const dir = hd.clone().multiplyScalar(-1.0).addScaledVector(hUp, 0.6).add(v3(sd * 0.35, 0, 0)).normalize();
      const L = P.headR * 2.2;
      parts.push(finishPart(coneAlong(base, dir, L, P.headR * 0.28, 8, hUp.clone().multiplyScalar(L * 0.25).addScaledVector(hd, -L * 0.15)), (x, y, z) => [0.72, 0.64, 0.5], 1, rigid(head)));
    }
  }
  if (P.headFan) {
    // display fan crest on the back of the head
    const hr = headR(0.1);
    const c = headPt(-P.headR * 0.2, hr.rt * 0.7, 0);
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = -0.9 + (k / (n - 1)) * 1.8;
      const dir = hUp.clone().multiplyScalar(Math.cos(a)).addScaledVector(hd, -Math.sin(a) * 0.9 - 0.25).normalize();
      const L = P.headR * (2.2 + 0.6 * Math.cos(a * 1.5));
      const tip = c.clone().addScaledVector(dir, L);
      const side = v3(0.0001, 0, 0);
      parts.push(finishPart(fan([c.clone().add(side), c.clone().addScaledVector(hd, P.headR * 0.18), tip, c.clone().addScaledVector(hd, -P.headR * 0.18)]), [0.9, 0.9, 0.9], 2, rigid(head)));
      parts.push(finishPart(coneAlong(c, dir, L * 1.02, P.headR * 0.05, 4), [0.3, 0.2, 0.12], 1, rigid(head)));
    }
  }
  if (P.nasalCrest) {
    const hr = headR(0.35);
    parts.push(finishPart(ellipsoid(headPt(P.headLen * 0.35, hr.rt * 0.75, 0), P.headR * 0.55, P.headR * 0.45, P.headR * 0.8, 10, 7), [1, 1, 1], 0, rigid(head)));
  }
  if (P.dorsalScutes) {
    // row of small bony scutes along neck, back and tail
    for (let z = -P.tailLen * 0.85; z < P.bodyLen + P.neckLen * 0.8; z += Math.max(0.12, P.hip * 0.07)) {
      if (P.sail && z > P.sail.from && z < P.sail.to) continue;
      const r = ringAtZ(z);
      const sz = Math.max(0.03, r.rt * 0.22);
      parts.push(finishPart(coneAlong(v3(0, r.y + r.rt * 0.92, z), v3(0, 1, -0.3), sz * 1.6, sz * 0.6, 4), [0.3, 0.26, 0.18], 1, (x, y, zz, o) => skinAtZ(z, o)));
    }
  }
  if (P.plates) {
    const S = P.plates;
    for (let k = 0; k < S.count; k++) {
      const t = k / (S.count - 1);
      const z = S.from + (S.to - S.from) * t;
      const side = k % 2 ? 1 : -1;
      const size = S.size * (0.35 + 0.75 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)));
      const y0 = topAt(z) - 0.06;
      const x0 = side * 0.12 * S.size;
      const verts = [v3(x0, y0, z), v3(x0, y0, z - size * 0.42), v3(x0 + side * 0.05, y0 + size * 0.55, z - size * 0.3), v3(x0 + side * 0.08, y0 + size, z), v3(x0 + side * 0.05, y0 + size * 0.55, z + size * 0.3), v3(x0, y0, z + size * 0.42)];
      parts.push(finishPart(fan(verts), (x, y, zz) => { const e = (y - y0) / size; return [1 - e * 0.1, 1 - e * 0.2, 1 - e * 0.25]; }, 2, (x, y, zz, o) => skinAtZ(z, o)));
    }
  }
  if (P.thagomizer) {
    const z0 = -P.tailLen * 0.78;
    for (let k = 0; k < 2; k++) {
      const z = z0 + k * 0.45;
      const y = topAt(z);
      for (const s of [-1, 1]) parts.push(finishPart(coneAlong(v3(s * 0.08, y - 0.05, z), v3(s * 0.8, 0.7, -0.5), 0.75, 0.07, 6), IVORY, 1, (x, yy, zz, o) => skinAtZ(z, o)));
    }
  }
  if (P.osteoderms) {
    for (let z = -P.tailLen * 0.5; z < P.bodyLen * 1.05; z += 0.32) {
      const r = ringAtZ(z);
      for (let k = -3; k <= 3; k++) {
        const ang = k * 0.38;
        const nx = Math.sin(ang), ny = Math.cos(ang);
        const base = v3(nx * r.rw * 0.98, r.y + ny * r.rt * 0.98, z + (k % 2) * 0.12);
        const len = (Math.abs(k) === 3 ? 0.35 : 0.13) * (z < 0 ? 0.8 : 1);
        parts.push(finishPart(coneAlong(base, v3(nx * 1.3, ny, 0), len, 0.09, 5), [0.42, 0.36, 0.27], 1, (x, y, zz, o) => skinAtZ(z, o)));
      }
    }
  }
  if (P.club) {
    const z = -P.tailLen * 0.97;
    const r = ringAtZ(z);
    parts.push(finishPart(ellipsoid(v3(0, r.y, z), P.club * 0.95, P.club * 0.5, P.club * 0.7, 10, 7), [0.45, 0.38, 0.28], 1, rigid(tailBones[tailBones.length - 1][0])));
  }
  if (P.feathers) {
    // head crest & tail fan
    const hr = headR(0.1);
    for (let k = 0; k < 5; k++) {
      const base = headPt(-P.headR * 0.1 - k * P.headR * 0.12, hr.rt * 0.8, 0);
      parts.push(finishPart(fan([base, base.clone().add(v3(0, P.headR * 0.9, -P.headR * 0.4)), base.clone().add(v3(0, P.headR * 0.4, -P.headR * 0.9))]), [1, 1, 1], 2, rigid(head)));
    }
    const tz = -P.tailLen;
    for (let k = 0; k < 7; k++) {
      const z = tz + k * P.tailLen * 0.06;
      const r = ringAtZ(z);
      for (const s of [-1, 1]) {
        const base = v3(s * r.rw, r.y, z);
        parts.push(finishPart(fan([base, base.clone().add(v3(s * P.tailBase * 1.8, 0.02, -P.tailBase * 0.6)), base.clone().add(v3(s * P.tailBase * 1.4, 0.02, P.tailBase * 0.8))]), [1, 1, 1], 2, (x, y, zz, o) => skinAtZ(z, o)));
      }
    }
  }

  let geometry = mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const sphere = geometry.boundingSphere.clone();
  sphere.radius *= 1.35;

  const boneInverses = bones.map((b) => new THREE.Matrix4().makeTranslation(-b.pos.x, -b.pos.y, -b.pos.z));
  const named = {};
  bones.forEach((b, i) => { named[b.name] = i; });
  return {
    spec, geometry, bones, boneInverses, sphere, named,
    info: {
      kind: 'walker', biped: P.biped, hip: hipY, legs, arms, tail: tailBones.map((t) => t[0]), neck: neckBones.map((n) => n[0]),
      root, spine, chest, head, jaw, headTip, bodyLen: P.bodyLen, length: spec.length, neckAngle: P.neckAngle,
      height: Math.max(headTip.y, hipY + P.hipR), mouth: headTip.clone(),
    },
  };
}

// ---------- Pterosaurs ----------
function buildFlyer(spec) {
  const P = spec.body;
  const s = P.span / 6.2;
  const parts = [];
  const bones = [];
  const addBone = (name, parent, pos) => { bones.push({ name, parent, pos: pos.clone() }); return bones.length - 1; };
  const root = addBone('root', -1, v3(0, 0, 0));
  const chest = addBone('chest', root, v3(0, 0.02 * s, 0.3 * s));
  const neck = addBone('neck0', chest, v3(0, 0.08 * s, 0.6 * s));
  const head = addBone('head', neck, v3(0, 0.18 * s, 0.85 * s));
  const jaw = addBone('jaw', head, v3(0, 0.15 * s, 0.9 * s));
  const tail = addBone('tail1', root, v3(0, 0, -0.35 * s));
  // body
  const bodyPts = [
    { p: v3(0, 0, -0.5 * s), r: 0.02 * s }, { p: v3(0, 0, -0.3 * s), r: 0.09 * s }, { p: v3(0, 0.02 * s, 0.05 * s), r: 0.16 * s },
    { p: v3(0, 0.03 * s, 0.35 * s), r: 0.14 * s }, { p: v3(0, 0.08 * s, 0.6 * s), r: 0.08 * s }, { p: v3(0, 0.16 * s, 0.82 * s), r: 0.07 * s },
  ];
  const bg = tube(bodyPts, 10, 3, 0.85);
  const bts = bg.userData.ts;
  parts.push(finishPart(bg, [1, 1, 1], 0, (x, y, z, o, i) => { const t = bts[i]; rigid(t < 1.5 ? tail : t < 3.2 ? root : t < 4.2 ? chest : neck)(x, y, z, o); }));
  // head + beak + crest
  const hp = v3(0, 0.18 * s, 0.85 * s);
  const beakDir = v3(0, -0.12, 1).normalize();
  parts.push(finishPart(ellipsoid(hp, 0.07 * s, 0.09 * s, 0.13 * s, 8, 6), [1, 1, 1], 0, rigid(head)));
  parts.push(finishPart(coneAlong(hp.clone().add(v3(0, 0.0, 0.08 * s)), beakDir, 0.7 * P.beak * s, 0.06 * s, 6), [0.75, 0.62, 0.42], 1, rigid(head)));
  parts.push(finishPart(coneAlong(hp.clone().add(v3(0, 0.02 * s, -0.04 * s)), v3(0, 0.5, -1).normalize(), P.crest * 0.7 * s, 0.05 * s, 5), [1, 1, 1], 2, rigid(head)));
  for (const sd of [-1, 1]) parts.push(finishPart(ellipsoid(hp.clone().add(v3(sd * 0.06 * s, 0.03 * s, 0.03 * s)), 0.015 * s, 0.015 * s, 0.015 * s, 6, 5), EYE, 3, rigid(head)));
  // wings
  const wings = [];
  for (const sd of [-1, 1]) {
    const S0 = v3(sd * 0.12 * s, 0.05 * s, 0.32 * s);
    const E = v3(sd * 0.9 * s, 0.1 * s, 0.35 * s);
    const Wr = v3(sd * 1.6 * s, 0.1 * s, 0.42 * s);
    const T = v3(sd * 3.1 * s, 0.05 * s, 0.05 * s);
    const b0 = addBone('wingU' + sd, chest, S0), b1 = addBone('wingL' + sd, b0, E), b2 = addBone('wingA' + sd, b1, Wr);
    wings.push({ side: sd, upper: b0, lower: b1, hand: b2 });
    // leading edge arm
    const ag = tube([{ p: S0, r: 0.05 * s }, { p: E, r: 0.035 * s }, { p: Wr, r: 0.025 * s }, { p: T, r: 0.006 * s }], 6, 2);
    const ats = ag.userData.ts;
    parts.push(finishPart(ag, [1, 1, 1], 0, (x, y, z, o, i) => { const t = ats[i]; rigid(t < 1 ? b0 : t < 2 ? b1 : b2)(x, y, z, o); }));
    // membrane grid
    const LE = [S0, E, Wr, T];
    const leAt = (u) => {
      const f = u * 3, i = Math.min(2, Math.floor(f)), t = f - i;
      return LE[i].clone().lerp(LE[i + 1], t);
    };
    const nu = 12, nv = 4;
    const mp = [], mi = [], mu = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const le = leAt(u);
      const te = v3(sd * (0.12 + u * 2.9) * s, 0, (-0.35 + u * 0.38) * s - Math.sin(u * Math.PI) * 0.55 * s);
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const p = le.clone().lerp(te, v);
        p.y -= Math.sin(v * Math.PI) * 0.06 * s;
        mp.push(p.x, p.y, p.z);
        mu.push(u, v);
      }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      mi.push(a, c, b, b, c, d);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
    mg.setIndex(mi);
    mg.computeVertexNormals();
    parts.push(finishPart(mg, (x, y, z, i) => { const v = mu[i * 2 + 1]; return [0.95 - v * 0.15, 0.9 - v * 0.2, 0.85 - v * 0.2]; }, 0, (x, y, z, o, i) => {
      const u = mu[i * 2], v = mu[i * 2 + 1];
      const f = u * 3;
      const bA = f < 1 ? b0 : f < 2 ? b1 : b2;
      const wBody = Math.max(0, (1 - u * 3)) * v;
      o.i[0] = bA; o.w[0] = 1 - wBody; o.i[1] = root; o.w[1] = wBody; o.i[2] = o.i[3] = 0; o.w[2] = o.w[3] = 0;
    }));
  }
  // legs (trailing)
  for (const sd of [-1, 1]) {
    parts.push(finishPart(tube([{ p: v3(sd * 0.08 * s, -0.05 * s, -0.25 * s), r: 0.03 * s }, { p: v3(sd * 0.12 * s, -0.08 * s, -0.6 * s), r: 0.012 * s }], 5, 2), [1, 1, 1], 0, rigid(tail)));
  }
  const geometry = mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere.clone();
  sphere.radius *= 1.3;
  const boneInverses = bones.map((b) => new THREE.Matrix4().makeTranslation(-b.pos.x, -b.pos.y, -b.pos.z));
  return { spec, geometry, bones, boneInverses, sphere, info: { kind: 'flyer', root, chest, neck: [neck], head, jaw, tail: [tail], wings, legs: [], arms: [], hip: 0, height: 0.5 * s, length: spec.length } };
}

// ---------- Marine reptile ----------
function buildMarine(spec) {
  const L = spec.body.len, R = spec.body.r;
  const parts = [];
  const bones = [];
  const addBone = (name, parent, pos) => { bones.push({ name, parent, pos: pos.clone() }); return bones.length - 1; };
  const keys = [];
  const n = 16;
  for (let k = 0; k <= n; k++) {
    const t = k / n; // 0 = tail tip, 1 = snout
    const z = -L * 0.55 + t * L;
    let r = R * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.98)), 0.75);
    if (t > 0.85) r *= 1 - (t - 0.85) * 3.2;
    keys.push({ z, r: Math.max(0.03, r) });
  }
  const root = addBone('root', -1, v3(0, 0, 0));
  const chain = [];
  let parent = root;
  const tailB = [];
  for (let k = 1; k <= 6; k++) { parent = addBone('tail' + k, parent, v3(0, 0, -k * L * 0.075)); tailB.push(parent); }
  const chest = addBone('chest', root, v3(0, 0, L * 0.12));
  const head = addBone('head', chest, v3(0, 0, L * 0.28));
  const jaw = addBone('jaw', head, v3(0, -R * 0.25, L * 0.3));
  const spineList = [...tailB.slice().reverse().map((b) => [b, bones[b].pos.z]), [root, 0], [chest, L * 0.12], [head, L * 0.28]];
  const skinZ = (z, o) => {
    let i = 0;
    if (z <= spineList[0][1]) { rigid(spineList[0][0])(0, 0, 0, o); return; }
    while (i < spineList.length - 1 && spineList[i + 1][1] < z) i++;
    if (i >= spineList.length - 1) { rigid(head)(0, 0, 0, o); return; }
    const t = (z - spineList[i][1]) / (spineList[i + 1][1] - spineList[i][1]);
    o.i[0] = spineList[i][0]; o.w[0] = 1 - t; o.i[1] = spineList[i + 1][0]; o.w[1] = t; o.i[2] = o.i[3] = 0; o.w[2] = o.w[3] = 0;
  };
  const body = tube(keys.map((k) => ({ p: v3(0, 0, k.z), r: k.r })), 14, 4, 0.85);
  parts.push(finishPart(body, [1, 1, 1], 0, (x, y, z, o) => skinZ(z, o)));
  // tail fin (crescent)
  const tz = -L * 0.55;
  parts.push(finishPart(fan([v3(0, 0, tz + L * 0.06), v3(0, -R * 1.4, tz - R * 0.4), v3(0, -R * 0.3, tz + 0.1), v3(0, R * 0.6, tz - R * 0.2)]), [1, 1, 1], 2, rigid(tailB[tailB.length - 1])));
  // flippers
  for (const [zf, size, b] of [[L * 0.1, 1.0, chest], [-L * 0.12, 0.8, root]]) {
    for (const sd of [-1, 1]) {
      const base = v3(sd * R * 0.8, -R * 0.3, zf);
      parts.push(finishPart(fan([base, base.clone().add(v3(sd * R * 1.8 * size, -R * 0.4, -R * 0.8 * size)), base.clone().add(v3(sd * R * 1.6 * size, -R * 0.35, -R * 1.5 * size)), base.clone().add(v3(0, 0, -R * 0.9 * size))]), [1, 1, 1], 0, rigid(b)));
    }
  }
  // teeth & eyes
  for (let k = 0; k < 8; k++) {
    const z = L * 0.32 + k * L * 0.018;
    for (const sd of [-1, 1]) parts.push(finishPart(coneAlong(v3(sd * R * 0.3 * (1 - k * 0.07), -R * 0.25, z), v3(0, -1, 0.2), R * 0.18, R * 0.05, 4), TOOTH, 1, rigid(head)));
  }
  for (const sd of [-1, 1]) parts.push(finishPart(ellipsoid(v3(sd * R * 0.42, R * 0.2, L * 0.33), R * 0.07, R * 0.07, R * 0.07, 6, 5), EYE, 3, rigid(head)));
  const geometry = mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere.clone();
  sphere.radius *= 1.3;
  const boneInverses = bones.map((b) => new THREE.Matrix4().makeTranslation(-b.pos.x, -b.pos.y, -b.pos.z));
  return { spec, geometry, bones, boneInverses, sphere, info: { kind: 'marine', root, chest, head, jaw, tail: tailB, neck: [], legs: [], arms: [], hip: 0, height: R, length: L } };
}

// ---------- Skin material ----------
const PATTERN_ID = { stripes: 0, spots: 1, blotch: 2, bands: 3, countershade: 4 };

export function makeSkinMaterial(colors, morph = null, size = 10) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  let base = lin(colors.base), belly = lin(colors.belly), pattern = lin(colors.pattern), display = lin(colors.display);
  if (morph === 'albino') {
    base = lin([0.88, 0.85, 0.8]); belly = lin([0.95, 0.93, 0.9]); pattern = lin([0.8, 0.74, 0.7]); display = lin([0.9, 0.55, 0.55]);
  } else if (morph === 'melanistic') {
    base = lin([0.08, 0.08, 0.09]); belly = lin([0.2, 0.19, 0.18]); pattern = lin([0.03, 0.03, 0.035]); display = lin([0.35, 0.05, 0.05]);
  }
  const uni = {
    uBase: { value: base }, uBelly: { value: belly }, uPattern: { value: pattern }, uDisplay: { value: display },
    uPatType: { value: PATTERN_ID[colors.type] ?? 0 }, uPatScale: { value: colors.scale || 1 }, uHurt: { value: 0 },
    uSkinF: { value: 7 * Math.sqrt(12 / Math.max(0.8, size)) },
  };
  m.userData.uniforms = uni;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uni);
    shader.uniforms.uWet = U.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aMat; varying vec3 vBind; varying vec3 vBindN; varying float vMat;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBind = position; vBindN = normal; vMat = aMat;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBind; varying vec3 vBindN; varying float vMat;
        uniform vec3 uBase; uniform vec3 uBelly; uniform vec3 uPattern; uniform vec3 uDisplay;
        uniform int uPatType; uniform float uPatScale; uniform float uWet; uniform float uHurt; uniform float uSkinF;
        ${GLSL_NOISE}
        float tri3(vec3 p){ return (vnoise(p.zy) + vnoise(p.xz + 7.1) + vnoise(p.xy + 3.7)) / 3.0; }`)
      .replace('#include <color_fragment>', `
        vec3 col;
        float top = smoothstep(-0.45, 0.3, vBindN.y);
        float pxF = length(fwidth(vBind)) * uSkinF;
        float aa1 = 1.0 - smoothstep(0.25, 0.6, pxF);
        float aa2 = 1.0 - smoothstep(0.25, 0.6, pxF * 2.7);
        float scaleN = 0.5 + (tri3(vBind * uSkinF) - 0.5) * 0.65 * aa1 + (tri3(vBind * uSkinF * 2.7) - 0.5) * 0.35 * aa2;
        if (vMat < 0.5) {
          col = mix(uBelly, uBase, top);
          float s = uPatScale;
          float pat = 0.0;
          vec2 q = vec2(vBind.z * s, vBind.y * s + vBind.x * s * 0.5);
          if (uPatType == 0) {
            // irregular tiger-like bands that wrap down the flanks and ring the tail
            float w = sin(vBind.z * s * 4.2 + fbm3(q * 1.3) * 4.5 + vBind.y * s * 0.7);
            float breakup = smoothstep(0.25, 0.55, fbm3(q * 2.6 + 7.0));
            pat = smoothstep(0.3, 0.72, w) * mix(0.55, 1.0, breakup) * smoothstep(-0.6, 0.15, vBindN.y);
            // pale cream speckles on the back and flanks
            float spk = smoothstep(0.78, 0.86, vnoise(vec2(vBind.z, vBind.y + vBind.x) * s * 16.0)) * aa1;
            col = mix(col, uBelly * 1.1, spk * 0.35 * top);
          } else if (uPatType == 1) {
            pat = smoothstep(0.62, 0.7, vnoise(vec2(vBind.z * s * 2.4 + vBind.x * s * 1.7, vBind.y * s * 2.4)));
            pat *= top;
          } else if (uPatType == 2) {
            pat = smoothstep(0.48, 0.62, fbm3(q * 1.2 + 3.1)) * top;
          } else if (uPatType == 3) {
            pat = smoothstep(0.1, 0.4, sin(vBind.z * s * 2.0 + fbm3(q) * 1.5)) * smoothstep(-0.1, 0.6, vBindN.y + 0.2);
          } else {
            col = mix(uBelly, uBase, smoothstep(-0.12, 0.05, vBindN.y));
          }
          col = mix(col, uPattern, pat * (uPatType == 0 ? 0.92 : 0.85));
          col *= 0.86 + 0.24 * scaleN;
          // large-scale mottling
          col *= 0.88 + 0.24 * fbm3(vBind.zy * 0.9 + vBind.x * 0.5);
          // darker dorsal ridge
          col *= mix(1.0, 0.82, smoothstep(0.85, 0.98, vBindN.y));
        } else if (vMat < 1.5 || vMat > 2.5) {
          col = vColor.rgb;
          col *= 0.9 + 0.15 * scaleN;
        } else {
          col = mix(uDisplay, uBase, 0.3) * vColor.rgb * (0.8 + 0.35 * fbm3(vBind.zy * 6.0));
          col = mix(col, uPattern, smoothstep(0.6, 0.8, fbm3(vBind.zy * 3.0)) * 0.15);
        }
        col = mix(col, vec3(0.5, 0.05, 0.03), uHurt * 0.5);
        diffuseColor.rgb = col;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = vMat > 2.5 ? 0.12 : (vMat > 0.5 && vMat < 1.5 ? 0.5 : roughnessFactor);
        roughnessFactor = mix(roughnessFactor, 0.35, uWet * 0.8);
        roughnessFactor *= 0.85 + 0.3 * scaleN;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (vMat < 0.5) {
          float pxB = length(fwidth(vBind)) * uSkinF;
          float hb = tri3(vBind * uSkinF * 1.3) * 0.7 * (1.0 - smoothstep(0.2, 0.5, pxB * 1.3)) + tri3(vBind * uSkinF * 3.1) * 0.3 * (1.0 - smoothstep(0.2, 0.5, pxB * 3.1));
          // skin folds and wrinkles running around the body
          float fold = sin(vBind.z * uSkinF * 1.1 + vnoise(vBind.xy * uSkinF * 0.35) * 4.0);
          hb += pow(abs(fold), 6.0) * 0.6 * (1.0 - smoothstep(0.2, 0.5, pxB * 1.1));
          float bumpK = 1.0;
          vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
          float dhx = dFdx(hb), dhy = dFdy(hb);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad * 0.011 * bumpK);
        }`);
  };
  m.customProgramCacheKey = () => 'dinoskin-v2';
  { const _obc = m.onBeforeCompile; m.onBeforeCompile = (s) => { _obc(s); atmospherePatch(s); s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n if (vMat > 1.5 && vMat < 2.5) { vec3 tSunV = normalize((viewMatrix * vec4(uSunDirA, 0.0)).xyz); reflectedLight.directDiffuse += diffuseColor.rgb * aSunDirect * pow(max(dot(normalize(-vViewPosition), tSunV), 0.0), 2.0) * 0.9; }'); }; }
  return m;
}

// ---------- Instancing ----------
export function createDinoMesh(template, material) {
  const bones = template.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  template.bones.forEach((b, i) => {
    if (b.parent >= 0) {
      bones[b.parent].add(bones[i]);
      bones[i].position.copy(b.pos).sub(template.bones[b.parent].pos);
    } else bones[i].position.copy(b.pos);
  });
  const mesh = new THREE.SkinnedMesh(template.geometry, material);
  mesh.add(bones[0]);
  const skeleton = new THREE.Skeleton(bones, template.boneInverses);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.boundingSphere = template.sphere.clone();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // store rest positions for animation
  for (const b of bones) b.userData.rest = b.position.clone();
  return { mesh, bones };
}
