// Landmarks: volcano, caves, ruins & artifacts, waterfall mist, pooled point lights, generic box colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VOLCANO, CAVES, WORLD } from './design.js';
import { U, addCompileHook, patchSunVisibility } from '../render/common.js';
import { stoneTextures, detailNormalTexture, noiseTexture, cavePaintingTexture, glyphTexture } from '../render/textures.js';
import { mulberry32 } from '../core/noise.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

// ------------------------------------------------------------------ light pool
export class LightPool {
  constructor(scene, n = 6) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa66, 0, 20, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.sources = [];
  }
  add(src) { this.sources.push(src); return src; }
  remove(src) { this.sources = this.sources.filter((s) => s !== src); }
  update(cam, t) {
    const list = this.sources.filter((s) => s.on !== false).map((s) => ({ s, d: s.pos.distanceTo(cam) - s.range * 0.5 })).filter((o) => o.d < o.s.range * 2.5).sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const o = list[i];
      if (!o) { l.intensity = 0; return; }
      const s = o.s;
      l.position.copy(s.pos);
      l.color.copy(s.color);
      l.distance = s.range;
      const fl = s.flicker ? 0.82 + Math.sin(t * 13 + i) * 0.08 + Math.sin(t * 29 + i * 3) * 0.06 + Math.random() * 0.04 : 1;
      l.intensity = s.intensity * fl;
    });
  }
}

// ------------------------------------------------------------------ colliders
export class Colliders {
  constructor() { this.boxes = []; }
  // oriented box: centre, half extents, yaw
  addBox(cx, cy, cz, hx, hy, hz, yaw = 0, tag = null) {
    const b = { cx, cy, cz, hx, hy, hz, yaw, c: Math.cos(yaw), s: Math.sin(yaw), tag };
    this.boxes.push(b);
    return b;
  }
  remove(b) { this.boxes = this.boxes.filter((x) => x !== b); }
  _local(b, x, z) {
    const dx = x - b.cx, dz = z - b.cz;
    return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
  }
  resolve(pos, r, h) {
    for (const b of this.boxes) {
      if (Math.abs(pos.x - b.cx) > b.hx + b.hz + r + 2 || Math.abs(pos.z - b.cz) > b.hx + b.hz + r + 2) continue;
      const top = b.cy + b.hy, bot = b.cy - b.hy;
      if (pos.y >= top - 0.55 || pos.y + h <= bot) continue;
      let [lx, lz] = this._local(b, pos.x, pos.z);
      const ex = b.hx + r, ez = b.hz + r;
      if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
        const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
        if (px < pz) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
        // back to world
        pos.x = b.cx + lx * b.c + lz * b.s;
        pos.z = b.cz - lx * b.s + lz * b.c;
      }
    }
  }
  top(x, z, maxY, r = 0.3) {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (Math.abs(x - b.cx) > b.hx + b.hz + 2 || Math.abs(z - b.cz) > b.hx + b.hz + 2) continue;
      const [lx, lz] = this._local(b, x, z);
      if (Math.abs(lx) <= b.hx + r * 0.5 && Math.abs(lz) <= b.hz + r * 0.5) {
        const t = b.cy + b.hy;
        if (t <= maxY && t > best) best = t;
      }
    }
    return best;
  }
  overhead(x, z, y) {
    for (const b of this.boxes) {
      if (Math.abs(x - b.cx) > b.hx + b.hz + 1 || Math.abs(z - b.cz) > b.hx + b.hz + 1) continue;
      const [lx, lz] = this._local(b, x, z);
      if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz && b.cy - b.hy > y + 1.5 && b.cy - b.hy < y + 12) return true;
    }
    return false;
  }
}

// ------------------------------------------------------------------ materials
function stoneMaterial(tint = 0xb8ab94) {
  const st = stoneTextures();
  const m = new THREE.MeshStandardMaterial({ color: tint, map: st.map, normalMap: st.normal, roughness: 0.9 });
  addCompileHook(m, (shader) => {
    patchSunVisibility(shader, { terrainShadow: 'vertex', cloudShadow: true });
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.indirectSpecular *= 0.3;`);
  }, 'stone');
  return m;
}

function lavaMaterial() {
  const noise = noiseTexture();
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uNoise: { value: noise } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW;
      uniform float uTime;
      uniform sampler2D uNoise;
      void main() {
        vec2 p = vW.xz * 0.035;
        vec4 a = texture2D(uNoise, p + vec2(uTime * 0.004, uTime * 0.003));
        vec4 b = texture2D(uNoise, p * 2.7 - vec2(uTime * 0.007, -uTime * 0.002));
        float cells = a.b * 0.6 + b.b * 0.5;
        float crust = smoothstep(0.35, 0.65, a.r * 0.7 + b.g * 0.5);
        float glow = 1.0 - smoothstep(0.05, 0.45, cells);
        vec3 hot = mix(vec3(9.0, 2.2, 0.3), vec3(14.0, 7.0, 1.5), glow);
        vec3 crustC = vec3(0.05, 0.03, 0.025) + vec3(0.6, 0.12, 0.02) * (1.0 - crust) * 0.6;
        vec3 col = mix(hot, crustC, crust * (1.0 - glow * 0.8));
        col *= 0.8 + 0.2 * sin(uTime * 1.7 + a.g * 10.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function caveMaterial(holeCenter) {
  const det = detailNormalTexture();
  const noise = noiseTexture();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true, side: THREE.FrontSide });
  addCompileHook(m, (shader) => {
    shader.uniforms.uDetailN = { value: det };
    shader.uniforms.uNoiseTex = { value: noise };
    shader.uniforms.uMouth = { value: holeCenter };
    patchSunVisibility(shader, { terrainShadow: false, cloudShadow: false });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uDetailN; uniform sampler2D uNoiseTex; uniform vec3 uMouth;`)
      .replace('#include <map_fragment>', `
  vec4 nz = texture2D(uNoiseTex, vWorldPos.xz * 0.08 + vWorldPos.y * 0.05);
  diffuseColor.rgb *= 0.6 + nz.r * 0.6;
  float wetStreak = smoothstep(0.6, 0.9, texture2D(uNoiseTex, vec2(vWorldPos.x * 0.05 + vWorldPos.z * 0.05, vWorldPos.y * 0.01)).g);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.9, 0.25, wetStreak);`)
      .replace('#include <normal_fragment_maps>', `
  {
    vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    vec3 bl = pow(abs(wn), vec3(4.0)); bl /= dot(bl, vec3(1.0));
    vec2 a = texture2D(uDetailN, vWorldPos.zy * 0.3).xy * 2.0 - 1.0;
    vec2 b = texture2D(uDetailN, vWorldPos.xz * 0.3).xy * 2.0 - 1.0;
    vec2 c = texture2D(uDetailN, vWorldPos.xy * 0.3).xy * 2.0 - 1.0;
    wn = normalize(wn + (vec3(0.0, a.y, a.x) * bl.x + vec3(b.x, 0.0, b.y) * bl.y + vec3(c.x, c.y, 0.0) * bl.z) * 1.2);
    normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  }`)
      .replace('float sunVis = 1.0;', 'float sunVis = smoothstep(26.0, 4.0, length(vWorldPos - uMouth));')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  float mouthF = smoothstep(40.0, 3.0, length(vWorldPos - uMouth));
  reflectedLight.indirectDiffuse *= 0.02 + mouthF * 0.9;
  reflectedLight.indirectSpecular *= 0.05 + mouthF * 0.6;`);
  }, 'cave');
  return m;
}

// ------------------------------------------------------------------ helpers
class GeoBag {
  constructor() { this.list = []; }
  box(cx, cy, cz, sx, sy, sz, yaw = 0, rx = 0, rz = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    // world-scale UVs so stone blocks keep a constant size
    const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (ay > 0.5) uv.setXY(i, x / 2.4, z / 2.4);
      else if (ax > 0.5) uv.setXY(i, z / 2.4, y / 2.4);
      else uv.setXY(i, x / 2.4, y / 2.4);
    }
    g.rotateX(rx); g.rotateZ(rz);
    g.rotateY(yaw);
    g.translate(cx, cy, cz);
    this.list.push(g);
    return g;
  }
  cyl(cx, cy, cz, r0, r1, h, segs = 10, yaw = 0, rx = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(r1, r0, h, segs, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r0 * 2.6, uv.getY(i) * h / 2.4);
    g.rotateX(rx); g.rotateZ(rz); g.rotateY(yaw);
    g.translate(cx, cy, cz);
    this.list.push(g);
    return g;
  }
  merge() {
    const gs = this.list.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of gs) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return mergeGeometries(gs);
  }
}

// ------------------------------------------------------------------ features
export class Features {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.group = new THREE.Group();
    this.group.name = 'features';
    scene.add(this.group);
    this.lights = new LightPool(scene, game.quality.pixelRatio > 1 ? 8 : 6);
    this.colliders = new Colliders();
    this.artifacts = [];
    this.pickups = []; // {mesh, pos, item, count, label}
    this.harvestables = []; // crystals {mesh, pos, item}
    this.stoneMat = stoneMaterial();
    this.rng = mulberry32(31337);
    this.eruptTimer = 90 + Math.random() * 120;
    this.bombs = [];
    this._volcano();
    this._waterfalls();
    this.caves = new Caves(this);
    this._ruins();
  }

  // ---------------- volcano
  _volcano() {
    const V = VOLCANO;
    const lava = new THREE.Mesh(new THREE.CircleGeometry(110, 64).rotateX(-Math.PI / 2), lavaMaterial());
    lava.position.set(V.x, V.lavaLevel, V.z);
    this.group.add(lava);
    this.lavaMat = lava.material;
    const fx = this.game.effects;
    this.smoke = fx.addEmitter({ type: 'smoke', pos: new THREE.Vector3(V.x, V.lavaLevel + 20, V.z), rate: 3, radius: 60, range: 9000 });
    fx.addEmitter({ type: 'embers', pos: new THREE.Vector3(V.x, V.lavaLevel + 5, V.z), rate: 6, radius: 70, range: 1500 });
    this.lights.add({ pos: new THREE.Vector3(V.x, V.lavaLevel + 25, V.z), color: new THREE.Color(1, 0.35, 0.08), intensity: 60000, range: 400, flicker: true });
    // lava flows: follow steepest descent from the rim
    const w = this.game.world;
    const flowMat = lavaMaterial();
    this.lavaFlows = [];
    for (let k = 0; k < 3; k++) {
      const ang = 0.6 + k * 2.1;
      let x = V.x + Math.cos(ang) * (V.craterR + 6), z = V.z + Math.sin(ang) * (V.craterR + 6);
      const pts = [];
      for (let i = 0; i < 160; i++) {
        const h = w.height(x, z);
        pts.push(new THREE.Vector3(x, h + 0.25, z));
        const n = w.normal(x, z, _v);
        const len = Math.hypot(n.x, n.z) || 1;
        x += (n.x / len) * 5 + Math.cos(ang) * 1.5;
        z += (n.z / len) * 5 + Math.sin(ang) * 1.5;
        if (h < 380) break;
      }
      const pos = [], idx = [];
      pts.forEach((p, i) => {
        const nx = pts[Math.min(pts.length - 1, i + 1)], pv = pts[Math.max(0, i - 1)];
        const dx = nx.x - pv.x, dz = nx.z - pv.z, l = Math.hypot(dx, dz) || 1;
        const wdt = 5 * (1 - i / pts.length) + 1.5;
        for (const s of [-1, 1]) {
          const px = p.x - (dz / l) * wdt * s, pz = p.z + (dx / l) * wdt * s;
          pos.push(px, w.height(px, pz) + 0.3, pz);
        }
        if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, flowMat);
      this.group.add(mesh);
      this.lavaFlows.push(pts);
    }
    // lava bomb pool
    const bombGeo = new THREE.IcosahedronGeometry(1.4, 1);
    const bombMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 2.2, 0.3) });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(bombGeo, bombMat);
      m.visible = false;
      this.group.add(m);
      this.bombs.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
  }

  erupt() {
    const g = this.game;
    const V = VOLCANO;
    const vp = new THREE.Vector3(V.x, V.lavaLevel + 10, V.z);
    g.audio && g.audio.eruption(vp);
    this.eruptGlow = 1;
    for (const b of this.bombs) {
      if (b.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 60;
      b.mesh.position.copy(vp);
      b.vel.set(Math.cos(a) * sp * 0.45, 70 + Math.random() * 60, Math.sin(a) * sp * 0.45);
      b.life = 30;
      b.mesh.visible = true;
    }
    const d = g.player.pos.distanceTo(vp);
    if (d < 3000) {
      g.player.shake = Math.max(g.player.shake, 1 - d / 3000);
      g.hud && g.hud.toast('Mount Ignis erupts!', 'warn');
    }
    this.smoke.intensity = 4;
  }

  _waterfalls() {
    const fx = this.game.effects;
    for (const f of this.game.water.falls) {
      if (f.top.y - f.bottom.y < 15) continue;
      fx.addEmitter({ type: 'mist', pos: f.bottom.clone().add(new THREE.Vector3(0, 2, 0)), rate: 14, radius: f.width * 2.2, range: 700 });
      fx.addEmitter({ type: 'steam', pos: f.bottom.clone().add(new THREE.Vector3(0, 8, 0)), rate: 4, radius: f.width * 3, height: 10, range: 900 });
    }
  }

  // ---------------- ruins
  _ruins() {
    const w = this.game.world;
    for (const pad of w.pads) {
      const bag = new GeoBag();
      const fn = this['_ruin_' + pad.id];
      if (!fn) continue;
      fn.call(this, bag, pad);
      if (!bag.list.length) continue;
      const mesh = new THREE.Mesh(bag.merge(), this.stoneMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // block with collider
  _blk(bag, cx, cy, cz, sx, sy, sz, yaw = 0, collide = true) {
    bag.box(cx, cy, cz, sx, sy, sz, yaw);
    if (collide) this.colliders.addBox(cx, cy, cz, sx / 2, sy / 2, sz / 2, yaw);
  }
  _pillar(bag, x, y, z, h, r, broken = 0) {
    const hh = h * (1 - broken);
    bag.cyl(x, y + hh / 2, z, r, r * 0.9, hh, 10);
    bag.box(x, y + 0.3, z, r * 2.6, 0.6, r * 2.6);
    if (!broken) bag.box(x, y + hh + 0.3, z, r * 2.5, 0.6, r * 2.5);
    this.colliders.addBox(x, y + hh / 2, z, r * 1.1, hh / 2, r * 1.1);
  }
  _artifact(id, pos, name) {
    const tex = glyphTexture(id.length * 7 + 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3226, emissive: new THREE.Color(0.5, 1.6, 2.2), emissiveMap: tex, roughness: 0.5 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.12), mat);
    mesh.position.copy(pos);
    this.group.add(mesh);
    const light = this.lights.add({ pos: pos.clone(), color: new THREE.Color(0.4, 0.8, 1), intensity: 300, range: 18 });
    const sparkle = this.game.effects.addEmitter({ type: 'sparkle', pos: pos.clone(), rate: 4, radius: 1.2, range: 120 });
    const a = { id, name, mesh, pos: pos.clone(), base: pos.y, light, sparkle, taken: false };
    this.artifacts.push(a);
    return a;
  }

  _ruin_temple(bag, p) {
    const y = p.y;
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const s = 34 - i * 6.2;
      const h = 3.4;
      this._blk(bag, p.x, y + h * i + h / 2 - 0.4, p.z, s, h, s);
    }
    // grand stairs on the north face
    for (let i = 0; i < 34; i++) {
      const sy = y + i * 0.5;
      const sz = p.z - 17 + i * 0.5 * (6.2 / 2 / 3.4) * 2 * 0.5;
      this._blk(bag, p.x, sy + 0.25 - 0.4, p.z - 18 + i * 0.47, 6, 0.5 + 0.02, 0.6);
      void sz;
    }
    // top shrine
    const top = y + tiers * 3.4 - 0.4;
    for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) this._pillar(bag, p.x + dx, top, p.z + dz, 5, 0.45);
    this._blk(bag, p.x, top + 5.6, p.z, 9, 0.8, 9, 0, false);
    this._blk(bag, p.x, top + 0.6, p.z, 2.2, 1.2, 1.4);
    this._artifact('sun', new THREE.Vector3(p.x, top + 2.0, p.z), 'Sun Tablet');
    // fallen blocks & serpent heads
    const r = this.rng;
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 22 + r() * 16;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const s = 1 + r() * 1.6;
      bag.box(x, this.game.world.height(x, z) + s * 0.3, z, s * 1.6, s, s, r() * 3, r() * 0.4, r() * 0.4);
      this.colliders.addBox(x, this.game.world.height(x, z) + s * 0.3, z, s * 0.8, s * 0.5, s * 0.5, 0);
    }
    for (const [dx, dz] of [[-4.2, -19], [4.2, -19]]) {
      bag.box(p.x + dx, y + 1.2, p.z + dz, 1.8, 2.4, 2.4);
      bag.box(p.x + dx, y + 2.2, p.z + dz - 1.6, 1.4, 1.2, 1.6);
    }
    this.game.effects.addEmitter({ type: 'firefly', pos: new THREE.Vector3(p.x, y + 4, p.z), rate: 1.5, radius: 60, height: 6, range: 150 });
  }

  _ruin_sanctum(bag, p) {
    const y = p.y;
    this._blk(bag, p.x, y + 0.4, p.z, 22, 0.8, 22);
    const r = this.rng;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 9.5, z = p.z + Math.sin(a) * 9.5;
      const broken = r() < 0.4 ? 0.3 + r() * 0.5 : 0;
      this._pillar(bag, x, y + 0.8, z, 7, 0.55, broken);
    }
    // arches
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = p.x + Math.cos(a) * 15, z = p.z + Math.sin(a) * 15;
      const yaw = -a;
      this._blk(bag, x + Math.cos(a + Math.PI / 2) * 2.3, y + 3, z + Math.sin(a + Math.PI / 2) * 2.3, 1.2, 6, 1.6, yaw);
      this._blk(bag, x - Math.cos(a + Math.PI / 2) * 2.3, y + 3, z - Math.sin(a + Math.PI / 2) * 2.3, 1.2, 6, 1.6, yaw);
      this._blk(bag, x, y + 6.5, z, 1.4, 1.0, 6.2, yaw, false);
    }
    this._blk(bag, p.x, y + 1.5, p.z, 2.6, 1.4, 2.6);
    this._artifact('canyon', new THREE.Vector3(p.x, y + 3.0, p.z), 'Earth Tablet');
  }

  _ruin_shrine(bag, p) {
    const y = p.y;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 11, z = p.z + Math.sin(a) * 11;
      this._blk(bag, x, y + 3.5, z, 1.6, 7, 1.1, -a);
      if (i % 2 === 0) {
        const a2 = ((i + 1) / n) * Math.PI * 2;
        const x2 = p.x + Math.cos(a2) * 11, z2 = p.z + Math.sin(a2) * 11;
        this._blk(bag, x2, y + 3.5, z2, 1.6, 7, 1.1, -a2);
        bag.box((x + x2) / 2, y + 7.5, (z + z2) / 2, Math.hypot(x2 - x, z2 - z) + 2, 1.1, 1.3, -Math.atan2(z2 - z, x2 - x));
      }
    }
    this._blk(bag, p.x, y + 0.9, p.z, 3, 1.8, 2);
    this._artifact('frost', new THREE.Vector3(p.x, y + 2.6, p.z), 'Frost Tablet');
  }

  _ruin_tidestones(bag, p) {
    const y = p.y;
    const r = this.rng;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 12, z = p.z + Math.sin(a) * 12;
      bag.box(x, y + 2.5, z, 1.4, 6, 1.0, -a, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25);
      this.colliders.addBox(x, y + 2.5, z, 0.75, 3, 0.55, -a);
    }
    this._blk(bag, p.x, y + 1.1, p.z, 2.4, 2.2, 2.4);
    this._artifact('tide', new THREE.Vector3(p.x, y + 3.2, p.z), 'Tide Tablet');
  }

  _ruin_henge(bag, p) {
    const y = p.y;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 20, z = p.z + Math.sin(a) * 20;
      this._blk(bag, x, y + 4, z, 2.2, 8, 1.4, -a);
    }
    for (let i = 0; i < n; i += 2) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      bag.box(p.x + Math.cos(a) * 20, y + 8.5, p.z + Math.sin(a) * 20, 1.4, 1.1, 11.5, -a + Math.PI / 2 + Math.PI / 2);
    }
    // central altar with four sockets
    this._blk(bag, p.x, y + 0.5, p.z, 8, 1, 8);
    this._blk(bag, p.x, y + 1.4, p.z, 4.6, 0.8, 4.6);
    this.altar = { pos: new THREE.Vector3(p.x, y + 2.0, p.z), sockets: [] };
    const sockMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(0, 0, 0), roughness: 0.6 });
    ['sun', 'canyon', 'frost', 'tide'].forEach((id, k) => {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const sp = new THREE.Vector3(p.x + Math.cos(a) * 1.4, y + 2.1, p.z + Math.sin(a) * 1.4);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.12), sockMat.clone());
      m.position.copy(sp);
      m.rotation.y = -a + Math.PI / 2;
      m.visible = false;
      this.group.add(m);
      this.altar.sockets.push({ id, mesh: m, filled: false });
    });
    // beam (revealed when all tablets are placed)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 3000, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 6, 9), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(p.x, y + 1500, p.z);
    beam.visible = false;
    this.group.add(beam);
    this.altar.beam = beam;
  }

  _ruin_watch(bag, p) {
    const y = p.y;
    const R = 5, H = 26;
    // hollow tower: ring of blocks with a broken top
    const segs = 16;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (i === 0) continue; // doorway
      const h = H * (i > 10 && i < 14 ? 0.7 : 1);
      const x = p.x + Math.cos(a) * R, z = p.z + Math.sin(a) * R;
      this._blk(bag, x, y + h / 2, z, 2.2, h, 1.0, -a + Math.PI / 2);
    }
    this._blk(bag, p.x + Math.cos(0) * R, y + H - 2, p.z, 2.2, 4, 1.0, Math.PI / 2);
    // spiral stairs inside
    for (let i = 0; i < 46; i++) {
      const a = i * 0.42;
      const x = p.x + Math.cos(a) * 2.6, z = p.z + Math.sin(a) * 2.6;
      this._blk(bag, x, y + 0.25 + i * 0.52, z, 2.2, 0.5, 1.4, -a + Math.PI / 2);
    }
    this._blk(bag, p.x, y + 24.5, p.z, 7.4, 0.6, 7.4);
  }

  _ruin_colonnade(bag, p) {
    const y = p.y;
    const r = this.rng;
    for (let i = 0; i < 9; i++) {
      for (const s of [-1, 1]) {
        const x = p.x + (i - 4) * 5, z = p.z + s * 4;
        const broken = r() < 0.5 ? r() * 0.7 : 0;
        this._pillar(bag, x, y - 1.5, z, 8, 0.6, broken);
      }
    }
    bag.box(p.x + 6, y + 0.2, p.z + 9, 7, 1.4, 1.6, 0.4, 0.2, 0.3);
    this.pickups.push(this._pickup(new THREE.Vector3(p.x, y + 0.6, p.z), 'fossil', 1, 'Ammonite fossil'));
  }

  _pickup(pos, item, count, label) {
    const g = item === 'fossil'
      ? new THREE.TorusGeometry(0.22, 0.09, 8, 16)
      : new THREE.IcosahedronGeometry(0.2, 0);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: item === 'fossil' ? 0xb8a27a : 0xffffff, roughness: 0.6 }));
    mesh.position.copy(pos);
    mesh.rotation.x = Math.PI / 2;
    this.group.add(mesh);
    return { mesh, pos: pos.clone(), item, count, label };
  }

  // ---------------- update
  update(dt, camPos) {
    const g = this.game;
    const t = U.uTime.value;
    this.lights.update(camPos, t);
    for (const a of this.artifacts) {
      if (a.taken) continue;
      a.mesh.rotation.y += dt * 0.6;
      a.mesh.position.y = a.base + Math.sin(t * 1.4) * 0.12;
    }
    // eruptions
    this.eruptTimer -= dt;
    if (this.eruptTimer <= 0) { this.erupt(); this.eruptTimer = 240 + Math.random() * 300; }
    this.smoke.intensity = Math.max(1, (this.smoke.intensity || 1) - dt * 0.05);
    const vd = Math.hypot(camPos.x - VOLCANO.x, camPos.z - VOLCANO.z);
    g.volcanoShake = Math.max(0, (this.eruptGlow || 0)) * Math.max(0, 1 - vd / 3000);
    this.eruptGlow = Math.max(0, (this.eruptGlow || 0) - dt * 0.15);
    for (const b of this.bombs) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vel.y -= 9.8 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (Math.random() < 0.6) g.effects.glow.emit(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 0, 0, 0, 1.2, 3, 3, 0.9, 0.2, 0.7, -1, 1, 2);
      const h = g.world.height(b.mesh.position.x, b.mesh.position.z);
      if (b.mesh.position.y < h) {
        b.life = 0;
        b.mesh.visible = false;
        g.effects.puff(b.mesh.position, [0.2, 0.18, 0.16], 6, 6);
        if (b.mesh.position.distanceTo(g.player.pos) < 9) g.player.damage(35, 'a lava bomb');
      }
    }
    // lava contact
    const P = g.player;
    if (!P.inCave && P.pos.y < VOLCANO.lavaLevel + 1.5 && Math.hypot(P.pos.x - VOLCANO.x, P.pos.z - VOLCANO.z) < 110) P.damage(60 * dt, 'lava');
    if (vd < VOLCANO.r) {
      for (const pts of this.lavaFlows) {
        for (let i = 0; i < pts.length; i += 2) {
          if (Math.abs(pts[i].x - P.pos.x) < 6 && Math.abs(pts[i].z - P.pos.z) < 6 && Math.abs(pts[i].y - P.pos.y) < 2) { P.damage(30 * dt, 'lava'); break; }
        }
      }
    }
    g.isHotRegion = vd < VOLCANO.r * 0.8;
    // pickups bob
    for (const p of this.pickups) if (!p.taken) p.mesh.rotation.z += dt;
    this.caves.update(dt, camPos);
  }
}

// ------------------------------------------------------------------ caves
class Caves {
  constructor(features) {
    this.f = features;
    const g = features.game;
    this.list = [];
    let hi = 0;
    for (const C of CAVES) {
      const cave = this._build(C, g.world);
      if (!cave) continue;
      this.list.push(cave);
      if (hi < 4) {
        U.uCaveHoles.value[hi].set(cave.mouth.x, cave.mouth.y, cave.mouth.z, cave.holeR);
        hi++;
      }
    }
  }

  _findEntrance(C, w) {
    // find a spot near the design position where the terrain rises steeply in the inward direction
    const dirA = (C.dir * Math.PI) / 180;
    const dx = Math.sin(dirA), dz = -Math.cos(dirA);
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 260;
      const x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
      const h0 = w.height(x, z);
      if (h0 < w.waterLevel(x, z) + 1) continue;
      const rise = w.height(x + dx * 25, z + dz * 25) - h0;
      const rise2 = w.height(x + dx * 70, z + dz * 70) - h0;
      const flatBehind = Math.abs(w.height(x - dx * 6, z - dz * 6) - h0);
      const score = Math.min(rise, 30) + Math.min(rise2, 70) * 0.5 - flatBehind * 2 - r * 0.02;
      if (rise > 9 && rise2 > 20 && score > bestScore) { bestScore = score; best = [x, z]; }
    }
    return best ? { x: best[0], z: best[1], dx, dz } : null;
  }

  _build(C, w) {
    const e = this._findEntrance(C, w);
    if (!e) { console.warn('cave placement failed', C.id); return null; }
    const rnd = mulberry32(C.id.length * 101 + 7);
    const pts = [];
    let x = e.x + e.dx * 1.5, z = e.z + e.dz * 1.5;
    let y = w.height(e.x, e.z) + 1.4;
    let dirA = Math.atan2(e.dz, e.dx);
    const n = 30;
    for (let i = 0; i < n; i++) {
      const r = i > n - 6 ? 9 + Math.sin(((i - (n - 6)) / 6) * Math.PI) * 5 : 4.2 + rnd() * 1.2;
      // keep the tunnel under enough rock (check a ring of points around the section)
      if (i > 2) {
        let top = w.height(x, z);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; top = Math.min(top, w.height(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
        if (top < y + r + 5) y = top - r - 5;
      }
      pts.push({ p: new THREE.Vector3(x, y, z), r });
      dirA += (rnd() - 0.5) * 0.35;
      x += Math.cos(dirA) * 3.4;
      z += Math.sin(dirA) * 3.4;
      if (i > 2) y -= 0.9 + rnd() * 0.4;
    }
    // smooth the vertical profile so the floor never steps abruptly
    for (let pass = 0; pass < 3; pass++) for (let i = 2; i < n - 1; i++) pts[i].p.y = Math.min(pts[i].p.y, (pts[i - 1].p.y + pts[i].p.y + pts[i + 1].p.y) / 3);
    const mouth = pts[0].p.clone().addScaledVector(new THREE.Vector3(e.dx, 0, e.dz), 2);
    // tube mesh
    const ring = 18;
    const pos = [], col = [], idx = [];
    const up = new THREE.Vector3(0, 1, 0);
    pts.forEach((pt, i) => {
      const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(n - 1, i + 1)].p;
      const T = b.clone().sub(a).normalize();
      const side = new THREE.Vector3().crossVectors(up, T).normalize();
      const U2 = new THREE.Vector3().crossVectors(T, side).normalize();
      for (let k = 0; k <= ring; k++) {
        const th = (k / ring) * Math.PI * 2;
        let rr = pt.r * (1 + Math.sin(th * 3 + i) * 0.08 + (rnd() - 0.5) * 0.18);
        let cy = Math.cos(th), sx = Math.sin(th);
        let vy = cy * rr * 0.8;
        const floor = -pt.r * 0.55;
        if (vy < floor) vy = floor + (vy - floor) * 0.08;
        const v = pt.p.clone().addScaledVector(U2, vy).addScaledVector(side, sx * rr);
        pos.push(v.x, v.y, v.z);
        const wet = 0.12 + rnd() * 0.06;
        col.push(wet * 1.1, wet, wet * 0.9);
      }
      pt.floor = pt.p.y - pt.r * 0.55 * 0.8 - 0.1;
      pt.ceil = pt.p.y + pt.r * 0.8 * 0.85;
    });
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < ring; k++) {
      const a = i * (ring + 1) + k, b = a + 1, c = a + ring + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    // end cap
    const endC = pos.length / 3;
    const last = pts[n - 1].p;
    pos.push(last.x, last.y, last.z); col.push(0.1, 0.1, 0.1);
    for (let k = 0; k < ring; k++) idx.push(endC, (n - 1) * (ring + 1) + k, (n - 1) * (ring + 1) + k + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, caveMaterial(mouth));
    // rocky frame around the mouth hides the seam between terrain and tunnel
    {
      const veg = this.f.game.vegetation;
      const rockGeo = veg.geo[veg.types.findIndex((t) => t.id === 'boulder')][0].parts[0].geo.clone();
      const n = 8;
      rockGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(0.19), 3));
      const im = new THREE.InstancedMesh(rockGeo, veg.mats.rock, n);
      const T0 = new THREE.Vector3(e.dx, 0, e.dz);
      const side0 = new THREE.Vector3(-e.dz, 0, e.dx);
      for (let k = 0; k < n; k++) {
        const a = (k / (n - 1)) * Math.PI;
        const bp = pts[0].p.clone().addScaledVector(side0, Math.cos(a) * 5.8).addScaledVector(T0, -0.5);
        bp.y += Math.sin(a) * 4.6 - 1.8;
        const sc = 1.8 + rnd() * 1.4;
        _m.compose(bp, new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)), new THREE.Vector3(sc, sc * 0.9, sc));
        im.setMatrixAt(k, _m);
      }
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.f.group.add(im);
    }
    this.f.group.add(mesh);
    // contents: crystals, painting, fossils
    const ch = pts[n - 3];
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x6fd8ff, emissive: new THREE.Color(0.4, 1.4, 2.4), roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
    const crystals = [];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const cp = ch.p.clone().add(new THREE.Vector3(Math.cos(a) * ch.r * 0.7, 0, Math.sin(a) * ch.r * 0.7));
      cp.y = ch.floor + 0.1;
      const cl = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const hgt = 0.6 + rnd() * 1.4;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.16 + rnd() * 0.1, hgt, 6), crystalMat);
        c.position.set((rnd() - 0.5) * 0.6, hgt / 2, (rnd() - 0.5) * 0.6);
        c.rotation.set((rnd() - 0.5) * 0.8, rnd() * 3, (rnd() - 0.5) * 0.8);
        cl.add(c);
      }
      cl.position.copy(cp);
      this.f.group.add(cl);
      const h = { mesh: cl, pos: cp, item: 'crystal', hits: 0, need: 3, label: 'Glow crystal', needsTool: 'pickaxe' };
      this.f.harvestables.push(h);
      crystals.push(h);
    }
    this.f.lights.add({ pos: ch.p.clone(), color: new THREE.Color(0.35, 0.75, 1), intensity: 900, range: 30 });
    this.f.game.effects.addEmitter({ type: 'sparkle', pos: ch.p.clone(), rate: 2, radius: ch.r, height: 3, range: 60 });
    // painting on the chamber wall
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: cavePaintingTexture(C.id.length), transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const wallDir = new THREE.Vector3(Math.cos(Math.atan2(e.dz, e.dx) + 1.6), 0, Math.sin(Math.atan2(e.dz, e.dx) + 1.6));
    const pp = pts[n - 2];
    paint.position.copy(pp.p).addScaledVector(wallDir, pp.r * 0.78);
    paint.position.y += 0.6;
    paint.lookAt(pp.p.x, paint.position.y, pp.p.z);
    this.f.group.add(paint);
    // fossil pickup
    this.f.pickups.push(this.f._pickup(new THREE.Vector3(pts[n - 1].p.x, pts[n - 1].floor + 0.25, pts[n - 1].p.z), 'fossil', 1, 'Raptor claw fossil'));
    return { id: C.id, name: C.name, pts, mouth, holeR: 5.6, mesh, paint: paint.position.clone(), visitedPaint: false };
  }

  // floor/ceiling if (x,y,z) is inside a cave tunnel
  floorAt(x, y, z) {
    for (const c of this.list) {
      if (Math.abs(x - c.mouth.x) > 130 || Math.abs(z - c.mouth.z) > 130) continue;
      let best = null, bd = 1e9;
      const pts = c.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i].p, b = pts[i + 1].p;
        const abx = b.x - a.x, abz = b.z - a.z;
        const l2 = abx * abx + abz * abz;
        let t = ((x - a.x) * abx + (z - a.z) * abz) / l2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + abx * t, pz = a.z + abz * t;
        const d = Math.hypot(x - px, z - pz);
        const r = pts[i].r + (pts[i + 1].r - pts[i].r) * t;
        if (d > r * 1.5) continue;
        const floor = pts[i].floor + (pts[i + 1].floor - pts[i].floor) * t;
        const ceil = pts[i].ceil + (pts[i + 1].ceil - pts[i].ceil) * t;
        if (y < floor - 2.5 || y > ceil + 0.5) continue;
        if (i === 0 && t < 0.15) continue; // outside the mouth: use terrain
        if (d < bd) { bd = d; best = { floor: floor + (1 - d / r) * 0.0, ceil, cave: c, i, t, r, cx: px, cz: pz }; }
      }
      if (best) return best;
    }
    return null;
  }

  // keep the player inside tunnel walls
  collide(pos) {
    const f = this.floorAt(pos.x, pos.y + 0.5, pos.z);
    if (!f) return;
    const dx = pos.x - f.cx, dz = pos.z - f.cz;
    const d = Math.hypot(dx, dz);
    const lim = f.r * 0.72;
    if (d > lim) { pos.x = f.cx + (dx / d) * lim; pos.z = f.cz + (dz / d) * lim; }
  }

  update(dt, camPos) {
    void dt; void camPos;
  }
}

export { Caves };
void WORLD; void _m;
