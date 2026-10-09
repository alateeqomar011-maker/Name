// Signed-distance sculpting for the dinosaur bodies. Anatomical volumes (the swept trunk, limb
// segments, muscle masses, skull details) are blended with smooth unions into one continuous
// skin, carved with smooth subtractions (eye sockets, nostrils) and polygonised with surface
// nets evaluated only in a narrow band around the surface. Vertices are projected onto the
// surface, normals come from the field gradient and skin weights are blended from the volumes
// that shaped each vertex, so joints bend like flesh instead of like bolted-on tubes.
import * as THREE from 'three';

const BIG = 1e3;

function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
function smax(a, b, k) { return -smin(-a, -b, k); }

// exact distance to a cone with rounded ends (Quilez)
function roundConeD(px, py, pz, A, B, r1, r2) {
  const bax = B.x - A.x, bay = B.y - A.y, baz = B.z - A.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - A.x, pay = py - A.y, paz = pz - A.z;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

export class Sculpt {
  constructor() { this.prims = []; }

  // p: { d(x,y,z), box:[x0,y0,z0,x1,y1,z1], k, skin(x,y,z,o)|null, sub }
  add(p) { this.prims.push(p); return p; }

  roundCone(A, B, r1, r2, k, skin) {
    const a = A.clone(), b = B.clone();
    // keep the cone well-formed: the radius difference must stay below the length
    const L = a.distanceTo(b);
    if (L < 1e-5) return this.sphere(a, Math.max(r1, r2), k, skin);
    if (Math.abs(r1 - r2) > L * 0.95) { const m = (r1 + r2) / 2, d = L * 0.47; r1 = m + Math.sign(r1 - r2) * d; r2 = m - Math.sign(r1 - r2) * d; }
    const R = Math.max(r1, r2);
    return this.add({
      d: (x, y, z) => roundConeD(x, y, z, a, b, r1, r2), k, skin,
      box: [Math.min(a.x, b.x) - R, Math.min(a.y, b.y) - R, Math.min(a.z, b.z) - R, Math.max(a.x, b.x) + R, Math.max(a.y, b.y) + R, Math.max(a.z, b.z) + R],
    });
  }

  sphere(c, r, k, skin, sub = false) {
    const cc = c.clone();
    return this.add({ d: (x, y, z) => { const dx = x - cc.x, dy = y - cc.y, dz = z - cc.z; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; }, k, skin, sub, box: [cc.x - r, cc.y - r, cc.z - r, cc.x + r, cc.y + r, cc.z + r] });
  }

  // ellipsoid with semi-axes along the basis vectors ax (rx), ay (ry), az (rz); default world axes
  ellipsoid(c, rx, ry, rz, k, skin, ax = null, ay = null, az = null, sub = false) {
    const cc = c.clone();
    const X = (ax || new THREE.Vector3(1, 0, 0)).clone().normalize();
    const Y = (ay || new THREE.Vector3(0, 1, 0)).clone().normalize();
    const Z = (az || new THREE.Vector3().crossVectors(X, Y)).clone().normalize();
    const R = Math.max(rx, ry, rz);
    const irx = 1 / rx, iry = 1 / ry, irz = 1 / rz;
    const Xx = X.x, Xy = X.y, Xz = X.z, Yx = Y.x, Yy = Y.y, Yz = Y.z, Zx = Z.x, Zy = Z.y, Zz = Z.z;
    return this.add({
      d: (x, y, z) => {
        const dx = x - cc.x, dy = y - cc.y, dz = z - cc.z;
        const u = dx * Xx + dy * Xy + dz * Xz, v = dx * Yx + dy * Yy + dz * Yz, w = dx * Zx + dy * Zy + dz * Zz;
        const a = u * irx, b = v * iry, c = w * irz;
        const k0 = Math.sqrt(a * a + b * b + c * c);
        const a2 = a * irx, b2 = b * iry, c2 = c * irz;
        const k1 = Math.sqrt(a2 * a2 + b2 * b2 + c2 * c2);
        return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
      },
      k, skin, sub, box: [cc.x - R, cc.y - R, cc.z - R, cc.x + R, cc.y + R, cc.z + R],
    });
  }

  _bins(bmin, bmax, pad) {
    const N = 28;
    const sx = (bmax.x - bmin.x) / N, sy = (bmax.y - bmin.y) / N, sz = (bmax.z - bmin.z) / N;
    const bins = Array.from({ length: N * N * N }, () => []);
    const cl = (v) => Math.max(0, Math.min(N - 1, v));
    this.prims.forEach((p, pi) => {
      const e = p.k + pad;
      const x0 = cl(Math.floor((p.box[0] - e - bmin.x) / sx)), x1 = cl(Math.floor((p.box[3] + e - bmin.x) / sx));
      const y0 = cl(Math.floor((p.box[1] - e - bmin.y) / sy)), y1 = cl(Math.floor((p.box[4] + e - bmin.y) / sy));
      const z0 = cl(Math.floor((p.box[2] - e - bmin.z) / sz)), z1 = cl(Math.floor((p.box[5] + e - bmin.z) / sz));
      for (let k = z0; k <= z1; k++) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) bins[(k * N + j) * N + i].push(pi);
    });
    // unions first, then carving
    for (const b of bins) b.sort((a, c) => (this.prims[a].sub ? 1 : 0) - (this.prims[c].sub ? 1 : 0));
    this._B = { N, bmin, sx, sy, sz, bins };
  }

  _binOf(x, y, z) {
    const B = this._B;
    const i = Math.floor((x - B.bmin.x) / B.sx), j = Math.floor((y - B.bmin.y) / B.sy), k = Math.floor((z - B.bmin.z) / B.sz);
    if (i < 0 || j < 0 || k < 0 || i >= B.N || j >= B.N || k >= B.N) return null;
    return B.bins[(k * B.N + j) * B.N + i];
  }

  field(x, y, z) {
    const list = this._binOf(x, y, z);
    if (!list || !list.length) return BIG;
    let d = BIG;
    const P = this.prims;
    for (let n = 0; n < list.length; n++) {
      const p = P[list[n]];
      const v = p.d(x, y, z);
      d = p.sub ? smax(d, -v, p.k) : smin(d, v, p.k);
    }
    return d;
  }

  // h: voxel size. Returns { geometry (position, normal), skinIndex, skinWeight }
  mesh(h) {
    const P = this.prims;
    const bmin = new THREE.Vector3(Infinity, Infinity, Infinity), bmax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of P) {
      if (p.sub) continue;
      bmin.min(new THREE.Vector3(p.box[0], p.box[1], p.box[2]));
      bmax.max(new THREE.Vector3(p.box[3], p.box[4], p.box[5]));
    }
    const C = 4;
    bmin.subScalar(h * (C + 2)); bmax.addScalar(h * (C + 2));
    this._bins(bmin, bmax, h * C * 1.6);
    const nx = Math.ceil((bmax.x - bmin.x) / h) + 1, ny = Math.ceil((bmax.y - bmin.y) / h) + 1, nz = Math.ceil((bmax.z - bmin.z) / h) + 1;
    const F = new Float32Array(nx * ny * nz).fill(NaN);
    const id = (i, j, k) => (k * ny + j) * nx + i;
    const X = (i) => bmin.x + i * h, Y = (j) => bmin.y + j * h, Z = (k) => bmin.z + k * h;
    // coarse pass, then the fine band around the surface
    const cx = Math.ceil((nx - 1) / C), cy = Math.ceil((ny - 1) / C), cz = Math.ceil((nz - 1) / C);
    const cv = new Float32Array((cx + 1) * (cy + 1) * (cz + 1));
    const cid = (i, j, k) => (k * (cy + 1) + j) * (cx + 1) + i;
    for (let k = 0; k <= cz; k++) for (let j = 0; j <= cy; j++) for (let i = 0; i <= cx; i++) {
      const fi = Math.min(nx - 1, i * C), fj = Math.min(ny - 1, j * C), fk = Math.min(nz - 1, k * C);
      cv[cid(i, j, k)] = this.field(X(fi), Y(fj), Z(fk));
    }
    const band = C * h * 1.45;
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      let mn = Infinity, pos = false, neg = false;
      for (let c = 0; c < 8; c++) {
        const v = cv[cid(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
        mn = Math.min(mn, Math.abs(v)); if (v < 0) neg = true; else pos = true;
      }
      if (mn > band && !(pos && neg)) continue;
      const i1 = Math.min(nx - 1, (i + 1) * C), j1 = Math.min(ny - 1, (j + 1) * C), k1 = Math.min(nz - 1, (k + 1) * C);
      for (let fk = k * C; fk <= k1; fk++) for (let fj = j * C; fj <= j1; fj++) for (let fi = i * C; fi <= i1; fi++) {
        const q = id(fi, fj, fk);
        if (Number.isNaN(F[q])) F[q] = this.field(X(fi), Y(fj), Z(fk));
      }
    }
    // surface nets: one vertex per sign-changing cell at the mean of its edge crossings
    const VI = new Int32Array(nx * ny * nz).fill(-1);
    const verts = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cvals = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mask = 0, ok = true;
      for (let c = 0; c < 8; c++) {
        const v = F[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
        if (Number.isNaN(v)) { ok = false; break; }
        cvals[c] = v; if (v < 0) mask |= 1 << c;
      }
      if (!ok || mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of E) {
        const va = cvals[a], vb = cvals[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += (a & 1) + (((b & 1) - (a & 1)) * t);
        sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
        sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
        n++;
      }
      VI[id(i, j, k)] = verts.length / 3;
      verts.push(X(i) + (sx / n) * h, Y(j) + (sy / n) * h, Z(k) + (sz / n) * h);
    }
    const idx = [];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const v0 = F[id(i, j, k)];
      if (Number.isNaN(v0)) continue;
      const in0 = v0 < 0;
      const vx = F[id(i + 1, j, k)];
      if (!Number.isNaN(vx) && (vx < 0) !== in0) quad(VI[id(i, j - 1, k - 1)], VI[id(i, j, k - 1)], VI[id(i, j, k)], VI[id(i, j - 1, k)], !in0);
      const vy = F[id(i, j + 1, k)];
      if (!Number.isNaN(vy) && (vy < 0) !== in0) quad(VI[id(i - 1, j, k - 1)], VI[id(i - 1, j, k)], VI[id(i, j, k)], VI[id(i, j, k - 1)], !in0);
      const vz = F[id(i, j, k + 1)];
      if (!Number.isNaN(vz) && (vz < 0) !== in0) quad(VI[id(i - 1, j - 1, k)], VI[id(i, j - 1, k)], VI[id(i, j, k)], VI[id(i - 1, j, k)], !in0);
    }
    // project onto the surface and take normals from the field gradient
    const nv = verts.length / 3;
    const pos = new Float32Array(verts), nrm = new Float32Array(nv * 3);
    const e = h * 0.25;
    for (let v = 0; v < nv; v++) {
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let gx = 0, gy = 1, gz = 0;
      for (let it = 0; it < 2; it++) {
        const d = this.field(x, y, z);
        gx = this.field(x + e, y, z) - d;
        gy = this.field(x, y + e, z) - d;
        gz = this.field(x, y, z + e) - d;
        const g2 = (gx * gx + gy * gy + gz * gz) / (e * e);
        if (g2 < 1e-8) break;
        const st = Math.max(-h, Math.min(h, d)) / g2 / e;
        x -= gx * st; y -= gy * st; z -= gz * st;
      }
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nrm[v * 3] = gx / gl; nrm[v * 3 + 1] = gy / gl; nrm[v * 3 + 2] = gz / gl;
    }
    // skin weights: every volume near the vertex votes with its own bone weights, weighted by how
    // close it is to having shaped this point of the surface
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    const o = { i: [0, 0, 0, 0], w: [1, 0, 0, 0] };
    const acc = new Map();
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const list = this._binOf(x, y, z) || [];
      acc.clear();
      let dmin = Infinity;
      const ds = [];
      for (const pi of list) {
        const p = P[pi];
        if (p.sub || !p.skin) continue;
        const d = p.d(x, y, z);
        ds.push(pi, d);
        if (d < dmin) dmin = d;
      }
      for (let q = 0; q < ds.length; q += 2) {
        const p = P[ds[q]];
        const tau = Math.max(p.k * 0.4, h * 1.5);
        const wgt = Math.exp(-(ds[q + 1] - dmin) / tau);
        if (wgt < 0.02) continue;
        o.i[0] = o.i[1] = o.i[2] = o.i[3] = 0; o.w[0] = 1; o.w[1] = o.w[2] = o.w[3] = 0;
        p.skin(x, y, z, o);
        for (let c = 0; c < 4; c++) if (o.w[c] > 0) acc.set(o.i[c], (acc.get(o.i[c]) || 0) + o.w[c] * wgt);
      }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      let tot = top.reduce((s, t) => s + t[1], 0) || 1;
      if (!top.length) { top.push([0, 1]); tot = 1; }
      for (let c = 0; c < 4; c++) {
        si[v * 4 + c] = top[c] ? top[c][0] : 0;
        sw[v * 4 + c] = top[c] ? top[c][1] / tot : 0;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    return { geometry: geo, skinIndex: si, skinWeight: sw };
  }
}
