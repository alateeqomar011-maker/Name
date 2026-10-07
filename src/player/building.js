// Base building: ghost placement with snapping, campfires & shelters.
import * as THREE from 'three';
import { barkTextures, foliageTexture } from '../render/textures.js';
import { addCompileHook, patchSunVisibility } from '../render/common.js';

const S = 4; // grid size (m)
const WALL_H = 3;

function woodMat() {
  const b = barkTextures();
  const m = new THREE.MeshStandardMaterial({ color: 0x9a7a55, map: b.map, normalMap: b.normal, roughness: 0.85 });
  addCompileHook(m, (s) => patchSunVisibility(s, { terrainShadow: 'vertex', cloudShadow: true }), 'wood');
  return m;
}
function thatchMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xa08a50, map: foliageTexture(), roughness: 0.95, side: THREE.DoubleSide });
  addCompileHook(m, (s) => patchSunVisibility(s, { terrainShadow: 'vertex', cloudShadow: true }), 'thatch');
  return m;
}

// piece geometry definitions: list of boxes [cx,cy,cz,sx,sy,sz,rx] in local space (y=0 at base) + collider boxes
const PIECES = {
  foundation: { boxes: [[0, -0.6, 0, S, 1.6, S]], col: [[0, -0.6, 0, S / 2, 0.8, S / 2]], h: 0.2 },
  wall: { boxes: [[0, WALL_H / 2, 0, S, WALL_H, 0.25]], col: [[0, WALL_H / 2, 0, S / 2, WALL_H / 2, 0.15]] },
  doorway: {
    boxes: [[-1.5, WALL_H / 2, 0, 1, WALL_H, 0.25], [1.5, WALL_H / 2, 0, 1, WALL_H, 0.25], [0, WALL_H - 0.4, 0, 2, 0.8, 0.25]],
    col: [[-1.5, WALL_H / 2, 0, 0.5, WALL_H / 2, 0.15], [1.5, WALL_H / 2, 0, 0.5, WALL_H / 2, 0.15], [0, WALL_H - 0.4, 0, 1, 0.4, 0.15]],
  },
  roof: { boxes: [[0, 0.1, 0, S + 0.6, 0.2, S + 0.6]], col: [[0, 0.1, 0, S / 2 + 0.3, 0.1, S / 2 + 0.3]], thatch: true },
  stairs: { stairs: true, col: [] },
  campfire: { campfire: true, col: [] },
  shelter: { shelter: true, col: [[0, 1.2, -0.6, 1.6, 1.2, 0.2]] },
};

export class Building {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'structures';
    game.scene.add(this.group);
    this.wood = woodMat();
    this.thatch = thatchMat();
    this.pieces = []; // {type, x,y,z, yaw, mesh, colliders, extra}
    this.ghost = null;
    this.ghostType = null;
    this.rot = 0;
    this.valid = false;
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.35, depthWrite: false });
  }

  _mesh(type, ghost = false) {
    const def = PIECES[type];
    const g = new THREE.Group();
    const mat = ghost ? this.ghostMat : this.wood;
    if (def.boxes) {
      for (const b of def.boxes) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(b[3], b[4], b[5]), def.thatch && !ghost ? this.thatch : mat);
        m.position.set(b[0], b[1], b[2]);
        g.add(m);
      }
      if (type === 'wall' || type === 'doorway') {
        // log detailing
        if (!ghost) for (let i = 0; i < 6; i++) {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, S, 6), this.wood);
          log.rotation.z = Math.PI / 2;
          log.position.set(0, 0.25 + i * 0.5, 0.12);
          if (type === 'doorway' && i < 5) continue;
          g.add(log);
        }
      }
    }
    if (def.stairs) {
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.67), mat);
        m.position.set(0, 0.25 + i * 0.5, -1.67 + i * 0.67);
        g.add(m);
      }
    }
    if (def.campfire) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), ghost ? mat : new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.9 }));
        s.position.set(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7);
        g.add(s);
      }
      for (let i = 0; i < 4; i++) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 5), mat);
        l.rotation.z = 1.1;
        l.rotation.y = (i / 4) * Math.PI * 2;
        l.position.y = 0.3;
        g.add(l);
      }
    }
    if (def.shelter) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 3.2), ghost ? mat : this.thatch);
      roof.rotation.x = -0.75;
      roof.position.set(0, 1.25, 0);
      g.add(roof);
      for (const x of [-1.6, 1.6]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6), mat);
        p.position.set(x, 1.3, -1.1);
        g.add(p);
      }
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 1.2), ghost ? mat : this.thatch);
      bed.position.set(0, 0.08, 0.1);
      g.add(bed);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !ghost; o.receiveShadow = !ghost; } });
    return g;
  }

  setGhost(type) {
    if (this.ghostType === type) return;
    if (this.ghost) { this.game.scene.remove(this.ghost); this.ghost = null; }
    this.ghostType = type;
    if (type) {
      this.ghost = this._mesh(type, true);
      this.game.scene.add(this.ghost);
    }
  }

  rotate() { this.rot = (this.rot + Math.PI / 2) % (Math.PI * 2); }

  _sockets(type) {
    const out = [];
    for (const p of this.pieces) {
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const loc = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
      if (p.type === 'foundation') {
        const top = p.y + 0.2;
        if (type === 'foundation') {
          for (const [lx, lz] of [[S, 0], [-S, 0], [0, S], [0, -S]]) { const [x, z] = loc(lx, lz); out.push({ x, y: p.y, z, yaw: p.yaw }); }
        } else if (type === 'wall' || type === 'doorway') {
          for (const [lx, lz, a] of [[0, S / 2, 0], [0, -S / 2, 0], [S / 2, 0, Math.PI / 2], [-S / 2, 0, Math.PI / 2]]) { const [x, z] = loc(lx, lz); out.push({ x, y: top, z, yaw: p.yaw + a }); }
        } else if (type === 'roof') {
          out.push({ x: p.x, y: top + WALL_H, z: p.z, yaw: p.yaw });
        } else if (type === 'stairs') {
          for (const [lx, lz, a] of [[0, S / 2 + 1.7, 0], [0, -S / 2 - 1.7, Math.PI], [S / 2 + 1.7, 0, Math.PI / 2], [-S / 2 - 1.7, 0, -Math.PI / 2]]) { const [x, z] = loc(lx, lz); out.push({ x, y: top - 3, z, yaw: p.yaw + a }); }
        } else if (type === 'campfire' || type === 'shelter') {
          out.push({ x: p.x, y: top, z: p.z, yaw: p.yaw + this.rot });
        }
      }
      if ((p.type === 'wall' || p.type === 'doorway') && (type === 'wall' || type === 'doorway')) out.push({ x: p.x, y: p.y + WALL_H, z: p.z, yaw: p.yaw });
      if (p.type === 'roof' && type === 'foundation') out.push({ x: p.x, y: p.y + 0.4, z: p.z, yaw: p.yaw });
    }
    return out;
  }

  // update ghost from camera ray; returns placement or null
  updateGhost(origin, dir) {
    if (!this.ghost) return null;
    const g = this.game;
    const w = g.world;
    const dist = w.raycast(origin, dir, 12, 0.25);
    let hit;
    if (dist > 0) hit = origin.clone().addScaledVector(dir, dist);
    else hit = origin.clone().addScaledVector(dir, 7);
    let place = { x: hit.x, y: w.height(hit.x, hit.z), z: hit.z, yaw: g.player.yaw + Math.PI + this.rot };
    // snapping
    let best = null, bd = 3.2;
    for (const s of this._sockets(this.ghostType)) {
      const d = Math.hypot(s.x - hit.x, s.z - hit.z) + Math.abs(s.y - hit.y) * 0.3;
      if (d < bd && !this.pieces.some((p) => p.type === this.ghostType && Math.abs(p.x - s.x) < 0.3 && Math.abs(p.z - s.z) < 0.3 && Math.abs(p.y - s.y) < 0.3 && Math.abs(Math.sin(p.yaw - s.yaw)) < 0.1)) { bd = d; best = s; }
    }
    let valid = true;
    if (best) place = { ...best };
    else {
      if (this.ghostType === 'foundation') {
        // sit on the highest corner
        let mx = -1e9, mn = 1e9;
        for (const [cx, cz] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]]) {
          const c = Math.cos(place.yaw), s = Math.sin(place.yaw);
          const h = w.height(place.x + cx * c + cz * s, place.z - cx * s + cz * c);
          mx = Math.max(mx, h); mn = Math.min(mn, h);
        }
        place.y = mx;
        if (mx - mn > 1.3) valid = false;
      } else if (['wall', 'doorway', 'roof', 'stairs'].includes(this.ghostType)) valid = false;
      if (w.waterLevel(place.x, place.z) > place.y + 0.2) valid = false;
      const n = w.normal(place.x, place.z);
      if ((this.ghostType === 'campfire' || this.ghostType === 'shelter') && n.y < 0.8) valid = false;
    }
    if (hit.distanceTo(origin) > 12) valid = false;
    this.ghost.position.set(place.x, place.y, place.z);
    this.ghost.rotation.y = place.yaw;
    this.ghostMat.color.set(valid ? 0x66ff88 : 0xff5544);
    this.valid = valid;
    this.place = place;
    return valid ? place : null;
  }

  build(type, place, fromSave = false) {
    const def = PIECES[type];
    const mesh = this._mesh(type);
    mesh.position.set(place.x, place.y, place.z);
    mesh.rotation.y = place.yaw;
    this.group.add(mesh);
    const cols = [];
    const c = Math.cos(place.yaw), s = Math.sin(place.yaw);
    for (const b of def.col) {
      cols.push(this.game.features.colliders.addBox(place.x + b[0] * c + b[2] * s, place.y + b[1], place.z - b[0] * s + b[2] * c, b[3], b[4], b[5], place.yaw, 'structure'));
    }
    if (def.stairs) {
      for (let i = 0; i < 6; i++) {
        const lz = -1.67 + i * 0.67;
        cols.push(this.game.features.colliders.addBox(place.x + lz * s, place.y + 0.25 + i * 0.5, place.z + lz * c, 1, 0.25 + 0.0, 0.34, place.yaw, 'structure'));
      }
    }
    const piece = { type, x: place.x, y: place.y, z: place.z, yaw: place.yaw, mesh, cols };
    if (def.campfire) {
      const fp = new THREE.Vector3(place.x, place.y + 0.25, place.z);
      piece.fire = this.game.effects.addEmitter({ type: 'fire', pos: fp, rate: 30, radius: 0.5, range: 200 });
      piece.light = this.game.features.lights.add({ pos: fp.clone().setY(fp.y + 0.8), color: new THREE.Color(1, 0.55, 0.22), intensity: 160, range: 22, flicker: true });
      piece.lit = true;
    }
    this.pieces.push(piece);
    if (!fromSave) { this.game.audio && this.game.audio.place(); this.game.effects.puff(new THREE.Vector3(place.x, place.y, place.z), [0.5, 0.45, 0.4], 6, 1.2); }
    return piece;
  }

  nearest(pos, types, maxD) {
    let best = null, bd = maxD;
    for (const p of this.pieces) {
      if (!types.includes(p.type)) continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z, (p.y - pos.y) * 0.5);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  toJSON() { return this.pieces.map((p) => ({ type: p.type, x: p.x, y: p.y, z: p.z, yaw: p.yaw })); }
  load(list) { for (const p of list || []) this.build(p.type, p, true); }
}
