// Procedural creature builder: lofted, skinned bodies driven by a bone hierarchy.
// Body, limbs, horns, frills, wings and flippers are merged into ONE SkinnedMesh per species.
import * as THREE from 'three';

const _v = new THREE.Vector3();

// Catmull-Rom over an array of {p:Vector3, w, h, ...}
function sampleChain(nodes, perSeg) {
  const out = [];
  const n = nodes.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = nodes[Math.max(0, i - 1)].p, p1 = nodes[i].p, p2 = nodes[i + 1].p, p3 = nodes[Math.min(n - 1, i + 2)].p;
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t, t3 = t2 * t;
      const pt = new THREE.Vector3();
      for (const k of ['x', 'y', 'z']) {
        pt[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      }
      const sm = t * t * (3 - 2 * t);
      const lerp = (k) => nodes[i][k] + (nodes[i + 1][k] - nodes[i][k]) * sm;
      out.push({ p: pt, w: lerp('w'), h: lerp('h'), seg: i, f: t, ridge: lerp('ridge'), belly: lerp('belly'), keel: lerp('keel') });
    }
  }
  const last = nodes[n - 1];
  out.push({ p: last.p.clone(), w: last.w, h: last.h, seg: n - 2, f: 1, ridge: last.ridge, belly: last.belly, keel: last.keel });
  return out;
}

export class CreatureGeometryBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.idx = [];
    this.bones = [];
    this.boneByName = {};
  }

  addBone(name, parentName, worldPos) {
    const b = new THREE.Bone();
    b.name = name;
    const parent = parentName ? this.boneByName[parentName] : null;
    b.userData.world = worldPos.clone();
    if (parent) {
      b.position.copy(worldPos).sub(parent.userData.world);
      parent.add(b);
    } else b.position.copy(worldPos);
    b.userData.rest = b.position.clone();
    b.userData.index = this.bones.length;
    this.bones.push(b);
    this.boneByName[name] = b;
    return b;
  }

  bi(name) {
    return this.boneByName[name].userData.index;
  }

  _vertex(p, n, u, v, c, bones, weights) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    const bi = [0, 0, 0, 0], bw = [0, 0, 0, 0];
    for (let i = 0; i < Math.min(4, bones.length); i++) { bi[i] = bones[i]; bw[i] = weights[i]; }
    const sum = bw[0] + bw[1] + bw[2] + bw[3] || 1;
    this.skinIndex.push(...bi);
    this.skinWeight.push(bw[0] / sum, bw[1] / sum, bw[2] / sum, bw[3] / sum);
    return this.pos.length / 3 - 1;
  }

  /**
   * Loft a tube along nodes.
   * nodes: [{p, w, h, bone (index or null), ridge?, belly?}] ordered along the tube.
   * owners: function(seg, f) -> [[boneIndex, weight], ...]
   * colorFn(u_around(0..1, 0 = top), s_along_m, sideSign, pt) -> [r,g,b]
   */
  loft(nodes, { ring = 14, perSeg = 4, owners, colorFn, capStart = true, capEnd = true, tile = 0.5, flat = 0 }) {
    for (const n of nodes) { n.ridge = n.ridge || 0; n.belly = n.belly ?? 0.85; n.keel = n.keel || 0; }
    const samples = sampleChain(nodes, perSeg);
    // parallel transport frames
    let prevT = null, up = new THREE.Vector3(0, 1, 0);
    const frames = [];
    let along = 0;
    for (let i = 0; i < samples.length; i++) {
      const a = samples[Math.max(0, i - 1)].p, b = samples[Math.min(samples.length - 1, i + 1)].p;
      const T = _v.copy(b).sub(a).normalize().clone();
      if (prevT) {
        const axis = new THREE.Vector3().crossVectors(prevT, T);
        const ang = Math.asin(Math.min(1, axis.length()));
        if (ang > 1e-5) up.applyAxisAngle(axis.normalize(), ang);
      } else {
        up.set(0, 1, 0);
        if (Math.abs(T.y) > 0.95) up.set(0, 0, -1);
        up.sub(T.clone().multiplyScalar(up.dot(T))).normalize();
      }
      // keep "up" close to world up for a consistent dorsal side
      const wu = new THREE.Vector3(0, 1, 0).sub(T.clone().multiplyScalar(T.y));
      if (wu.lengthSq() > 0.05) up.lerp(wu.normalize(), 0.5).normalize();
      const side = new THREE.Vector3().crossVectors(up, T).normalize();
      up = new THREE.Vector3().crossVectors(T, side).normalize();
      frames.push({ T, up: up.clone(), side });
      prevT = T;
      if (i > 0) along += samples[i].p.distanceTo(samples[i - 1].p);
      samples[i].s = along;
    }
    const total = along;
    const base = this.pos.length / 3;
    const circ = 2 * Math.PI * Math.max(...nodes.map((n) => Math.max(n.w, n.h)));
    const uRep = Math.max(1, Math.round(circ / tile / 2));
    for (let i = 0; i < samples.length; i++) {
      const S = samples[i], F = frames[i];
      const ow = owners(S.seg, S.f, S.s / total);
      const bIdx = ow.map((o) => o[0]), bW = ow.map((o) => o[1]);
      for (let k = 0; k <= ring; k++) {
        const th = (k / ring) * Math.PI * 2;
        const c = Math.cos(th), sn = Math.sin(th);
        // th=0 -> top (dorsal), th=pi -> belly
        let y = c * S.h, x = sn * S.w;
        if (c < 0) y *= S.belly;
        y += S.ridge * Math.pow(Math.max(0, c), 12);
        y -= S.keel * Math.pow(Math.max(0, -c), 8);
        if (flat) x *= 1 + flat * (1 - Math.abs(c));
        const p = S.p.clone().addScaledVector(F.up, y).addScaledVector(F.side, x);
        const nrm = new THREE.Vector3().addScaledVector(F.up, c / Math.max(S.h, 0.01)).addScaledVector(F.side, sn / Math.max(S.w, 0.01)).normalize();
        const u = (k / ring) * uRep;
        const v = S.s / tile;
        const col = colorFn ? colorFn(k / ring, S.s, S.s / total, sn, p) : [1, 1, 1];
        this._vertex(p, nrm, u, v, col, bIdx, bW);
      }
    }
    for (let i = 0; i < samples.length - 1; i++) {
      for (let k = 0; k < ring; k++) {
        const a = base + i * (ring + 1) + k, b = a + 1, c = a + ring + 1, d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    const cap = (i, flip) => {
      const S = samples[i], F = frames[i];
      const ow = owners(S.seg, S.f, S.s / total);
      const center = this._vertex(S.p.clone().addScaledVector(F.T, flip ? 0.02 : -0.02), flip ? F.T : F.T.clone().negate(), 0, S.s / tile,
        colorFn ? colorFn(0.5, S.s, S.s / total, 0, S.p) : [1, 1, 1], ow.map((o) => o[0]), ow.map((o) => o[1]));
      const r0 = base + i * (ring + 1);
      for (let k = 0; k < ring; k++) {
        if (flip) this.idx.push(center, r0 + k, r0 + k + 1);
        else this.idx.push(center, r0 + k + 1, r0 + k);
      }
    };
    if (capStart) cap(0, false);
    if (capEnd) cap(samples.length - 1, true);
    return samples;
  }

  // Generic rigid mesh attached fully to one bone (geometry in creature space)
  addRigid(geo, boneIndex, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      const c = typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i)) : color;
      this._vertex(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)), new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)),
        uv ? uv.getX(i) * 2 : 0, uv ? uv.getY(i) * 2 : 0, c, [boneIndex], [1]);
    }
    for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  // Membrane / sheet with per-vertex skinning (for wings, frills, fins)
  addSheet(rows, cols, posFn, skinFn, colorFn, doubleSided = true) {
    const base = this.pos.length / 3;
    const grid = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const a = r / rows, b = c / cols;
        const p = posFn(a, b);
        const [bi, bw] = skinFn(a, b);
        grid.push(this._vertex(p, new THREE.Vector3(0, 1, 0), a * 3, b * 3, colorFn(a, b), bi, bw));
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = base + r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
        this.idx.push(a, d, b, b, d, e);
        if (doubleSided) this.idx.push(a, b, d, b, e, d);
      }
    }
  }

  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.boundingSphere.radius *= 1.6;
    return g;
  }
}

// Weight helper for chains: segment owned by `owner`, blending toward parent at the start and child at the end
export function chainOwner(owner, parent, child) {
  return (f) => {
    const out = [];
    if (f < 0.5) {
      if (parent != null) { out.push([owner, 0.5 + f]); out.push([parent, 0.5 - f]); }
      else out.push([owner, 1]);
    } else {
      if (child != null) { out.push([owner, 1.5 - f]); out.push([child, f - 0.5]); }
      else out.push([owner, 1]);
    }
    return out;
  };
}
