// Lightweight CPU particle system (splashes, dust, smoke, fire, embers, sparks).
import * as THREE from 'three';

function softTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class Pool {
  constructor(scene, max, blending, tex, sizeMul = 1) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 600 * sizeMul } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.parts = [];
  }
  spawn(p) { if (this.parts.length < this.max) this.parts.push(p); }
  update(dt) {
    const P = this.parts;
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.vy -= (p.grav ?? 0) * dt;
      const drag = Math.exp(-(p.drag ?? 0) * dt);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of P) {
      const t = 1 - p.life / p.max;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      const fade = Math.min(1, t * 6) * (1 - t);
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = p.a * fade;
      this.size[n] = p.s0 + (p.s1 - p.s0) * t;
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

export class FX {
  constructor(game) {
    this.game = game;
    const tex = softTex();
    this.alpha = new Pool(game.scene, 2500, THREE.NormalBlending, tex);
    this.add = new Pool(game.scene, 2000, THREE.AdditiveBlending, tex);
    this.sources = new Set();
    this.pool = [];
    for (let i = 0; i < 6; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      game.scene.add(L);
      this.pool.push(L);
    }
  }
  // Register a light source; the nearest ones get real lights each frame
  addLight(src) { if (!src.pos.isVector3) src.pos = new THREE.Vector3(src.pos.x, src.pos.y, src.pos.z); this.sources.add(src); return src; }
  removeLight(src) { this.sources.delete(src); }
  _p(pool, o) {
    pool.spawn({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life, max: o.life, r: o.r, g: o.g, b: o.b, a: o.a ?? 1, s0: o.s0, s1: o.s1 ?? o.s0, grav: o.grav, drag: o.drag });
  }
  splash(pos, k = 1) {
    for (let i = 0; i < 10 * k; i++) {
      this._p(this.alpha, { x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 0.8, r: 0.9, g: 0.95, b: 1, a: 0.6, s0: 0.3, s1: 0.8, grav: 9 });
    }
  }
  dust(pos, k = 1, color = [0.55, 0.47, 0.36]) {
    for (let i = 0; i < 8 * k; i++) {
      this._p(this.alpha, { x: pos.x + (Math.random() - 0.5) * 2 * k, y: pos.y + 0.3, z: pos.z + (Math.random() - 0.5) * 2 * k, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, life: 1.5 + Math.random(), r: color[0], g: color[1], b: color[2], a: 0.35, s0: 0.8 * k, s1: 3 * k, drag: 1.5 });
    }
  }
  chips(pos, color) {
    for (let i = 0; i < 8; i++) this._p(this.alpha, { x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.7, r: color[0], g: color[1], b: color[2], a: 1, s0: 0.12, s1: 0.08, grav: 12 });
  }
  smoke(pos, k = 1, dark = 0.3, rise = 2) {
    this._p(this.alpha, { x: pos.x + (Math.random() - 0.5) * k, y: pos.y, z: pos.z + (Math.random() - 0.5) * k, vx: (Math.random() - 0.5) * 0.6 + this.game.weather.windVec.x * 1.5, vy: rise + Math.random(), vz: (Math.random() - 0.5) * 0.6 + this.game.weather.windVec.y * 1.5, life: 4 + Math.random() * 3, r: dark, g: dark * 0.97, b: dark * 0.95, a: 0.4, s0: 1.5 * k, s1: 7 * k, drag: 0.3 });
  }
  fire(pos, k = 1) {
    this._p(this.add, { x: pos.x + (Math.random() - 0.5) * 0.6 * k, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.6 * k, vx: (Math.random() - 0.5) * 0.4, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.4, life: 0.6 + Math.random() * 0.5, r: 1, g: 0.45 + Math.random() * 0.25, b: 0.1, a: 0.9, s0: 0.9 * k, s1: 0.2 * k, drag: 0.5 });
  }
  ember(pos, k = 1) {
    this._p(this.add, { x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3 * k, vy: 3 + Math.random() * 6 * k, vz: (Math.random() - 0.5) * 3 * k, life: 1.5 + Math.random() * 1.5, r: 1, g: 0.5, b: 0.15, a: 1, s0: 0.25 * k, s1: 0.05, grav: 4, drag: 0.4 });
  }
  sparkle(pos, color = [1, 0.9, 0.5]) {
    for (let i = 0; i < 16; i++) this._p(this.add, { x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 1.2, r: color[0], g: color[1], b: color[2], a: 1, s0: 0.25, s1: 0.02, drag: 1.5 });
  }
  flash(pos, color = 0xff5522, intensity = 60, dist = 40, life = 20) {
    const src = { pos: pos.clone(), color, intensity, dist, life, max: life, temp: true };
    this.sources.add(src);
    return src;
  }
  update(dt) {
    this.alpha.update(dt);
    this.add.update(dt);
    const cam = this.game.camera.position;
    const list = [];
    for (const src of this.sources) {
      if (src.temp) {
        src.life -= dt;
        if (src.follow) src.pos.copy(src.follow);
        if (src.life <= 0) { this.sources.delete(src); continue; }
      }
      if (src.enabled === false) continue;
      const d = src.pos.distanceTo(cam);
      if (d > src.dist * 4 + 30) continue;
      list.push([d / (src.priority || 1), src]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.pool.length; i++) {
      const L = this.pool[i];
      const e = list[i];
      if (!e) { L.intensity = 0; continue; }
      const src = e[1];
      L.position.copy(src.pos);
      L.color.set(src.color);
      L.distance = src.dist;
      let k = src.temp && src.life < 2 ? src.life / 2 : 1;
      if (src.flicker) k *= 0.85 + 0.15 * Math.sin(t * 13 + i * 3) * Math.sin(t * 7.3 + i);
      L.intensity = src.intensity * k;
    }
  }
}
