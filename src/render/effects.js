// CPU-simulated soft particles (dust, splashes, blood, smoke, mist, embers, sparks, leaves).
import * as THREE from 'three';
import { U } from './common.js';

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
attribute float aSeed;
varying vec4 vColor;
varying float vSeed;
uniform float uScale;
void main() {
  vColor = aColor;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
  if (aColor.a <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAG = /* glsl */ `
varying vec4 vColor;
varying float vSeed;
uniform vec3 uLight;
uniform vec3 uAmbient;
uniform float uEmissive;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float n = sin(p.x * 5.0 + vSeed * 30.0) * sin(p.y * 4.0 - vSeed * 17.0) * 0.15;
  float a = smoothstep(1.0, 0.2, r + n) * vColor.a;
  vec3 lit = vColor.rgb * mix(uAmbient + uLight * (0.6 - p.y * 0.4), vec3(1.0), uEmissive);
  gl_FragColor = vec4(lit, a);
}`;

class Pool {
  constructor(scene, n, blending, emissive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    for (let i = 0; i < n; i++) this.seed[i] = Math.random();
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uLight: { value: new THREE.Color(1, 1, 1) }, uAmbient: { value: new THREE.Color(0.4, 0.45, 0.5) }, uEmissive: { value: emissive ? 1 : 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.active = 0;
  }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav = 0, drag = 0.5, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.alpha0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }

  update(dt, wind) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.col[i * 4 + 3] !== 0) { this.col[i * 4 + 3] = 0; any = true; } continue; }
      any = true;
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] = this.vel[i * 3] * k + wind.x * dt * this.drag[i] * 0.5;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * k + wind.y * dt * this.drag[i] * 0.5;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, t * 3) * Math.min(1, (1 - t) * 8 + 0.2);
    }
    if (any) {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
    }
  }
}

export class Effects {
  constructor(game) {
    this.game = game;
    const s = game.scene;
    this.soft = new Pool(s, 2600, THREE.NormalBlending, false);
    this.glow = new Pool(s, 900, THREE.AdditiveBlending, true);
    this.emitters = []; // continuous emitters {pos, type, rate, acc, radius}
    this.wind = new THREE.Vector2();
  }

  addEmitter(e) { this.emitters.push({ acc: 0, ...e }); return e; }

  dust(p, size = 1) {
    for (let i = 0; i < 4; i++) {
      this.soft.emit(p.x + (Math.random() - 0.5) * size, p.y + 0.2, p.z + (Math.random() - 0.5) * size,
        (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5,
        1.5 + Math.random(), 1.5 * size + 0.5, 0.45, 0.4, 0.32, 0.35, -0.1, 1.2, 1.5 * size);
    }
  }
  splash(p, size = 1) {
    const wl = this.game.world.waterLevel(p.x, p.z);
    for (let i = 0; i < 10 * size + 4; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3 * size;
      this.soft.emit(p.x, wl + 0.1, p.z, Math.cos(a) * sp, 2 + Math.random() * 5 * size, Math.sin(a) * sp, 0.8 + Math.random() * 0.6, 0.25 + size * 0.4, 0.85, 0.9, 0.95, 0.75, 9.8, 0.3, 0.6);
    }
  }
  blood(p, amount) {
    for (let i = 0; i < Math.min(20, 3 + amount / 3); i++) {
      this.soft.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.7, 0.2 + Math.random() * 0.25, 0.35, 0.02, 0.02, 0.9, 9.8, 0.2, 0);
    }
  }
  sparks(p) {
    for (let i = 0; i < 8; i++) this.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5, 0.4 + Math.random() * 0.3, 0.07, 3, 1.6, 0.6, 1, 9.8, 0.5, 0);
  }
  chips(p, color = [0.4, 0.3, 0.2]) {
    for (let i = 0; i < 7; i++) this.soft.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.8, 0.08 + Math.random() * 0.08, color[0], color[1], color[2], 1, 9.8, 0.4, 0);
  }
  leaves(p) {
    for (let i = 0; i < 10; i++) this.soft.emit(p.x + (Math.random() - 0.5) * 3, p.y + Math.random() * 3, p.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5), -0.3, (Math.random() - 0.5), 3 + Math.random() * 2, 0.15, 0.15, 0.3, 0.05, 1, 0.6, 1.5, 0);
  }
  puff(p, color = [0.8, 0.8, 0.8], n = 6, size = 1) {
    for (let i = 0; i < n; i++) this.soft.emit(p.x + (Math.random() - 0.5) * size, p.y + Math.random() * size * 0.5, p.z + (Math.random() - 0.5) * size, (Math.random() - 0.5), 0.5 + Math.random(), (Math.random() - 0.5), 1.5 + Math.random(), size, color[0], color[1], color[2], 0.5, -0.2, 1, size);
  }

  update(dt) {
    const g = this.game;
    const cam = g.camera.position;
    this.wind.copy(U.uWindDir.value).multiplyScalar(U.uWindStrength.value * 6);
    for (const e of this.emitters) {
      const d = cam.distanceTo(e.pos);
      if (d > (e.range || 1500)) continue;
      e.acc += dt * e.rate * (e.intensity ?? 1);
      while (e.acc > 1) {
        e.acc -= 1;
        const r = e.radius || 1;
        const x = e.pos.x + (Math.random() - 0.5) * r, z = e.pos.z + (Math.random() - 0.5) * r, y = e.pos.y + (Math.random() - 0.5) * (e.height || 0);
        if (e.type === 'smoke') this.soft.emit(x, y, z, (Math.random() - 0.5) * 3, 6 + Math.random() * 6, (Math.random() - 0.5) * 3, 14 + Math.random() * 8, 25 + Math.random() * 20, 0.16, 0.15, 0.14, 0.45, -0.4, 0.15, 9);
        else if (e.type === 'steam') this.soft.emit(x, y, z, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 5 + Math.random() * 3, 3 + Math.random() * 3, 0.85, 0.85, 0.85, 0.25, -0.2, 0.5, 2.5);
        else if (e.type === 'mist') this.soft.emit(x, y, z, (Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5, 3 + Math.random() * 3, 6 + Math.random() * 6, 0.92, 0.95, 1, 0.22, -0.1, 0.8, 4);
        else if (e.type === 'embers') this.glow.emit(x, y, z, (Math.random() - 0.5) * 4, 4 + Math.random() * 8, (Math.random() - 0.5) * 4, 3 + Math.random() * 2, 0.6 + Math.random() * 0.8, 4, 1.2, 0.25, 1, 2, 0.3, -0.1);
        else if (e.type === 'fire') {
          this.glow.emit(x, y, z, (Math.random() - 0.5) * 0.3, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, 0.5 + Math.random() * 0.4, 3.2, 1.3, 0.35, 0.9, -0.5, 1, -0.5);
          if (Math.random() < 0.15) this.soft.emit(x, y + 1, z, 0, 1.2, 0, 3, 0.6, 0.2, 0.2, 0.2, 0.3, -0.2, 0.5, 1.2);
        } else if (e.type === 'firefly') this.glow.emit(x, y, z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 3, 0.12, 2.5, 3, 0.6, 1, 0, 0.1, 0);
        else if (e.type === 'sparkle') this.glow.emit(x, y, z, 0, 0.4 + Math.random() * 0.5, 0, 2 + Math.random(), 0.15, 1.2, 2.2, 3, 1, -0.05, 0.2, 0);
      }
    }
    const sky = g.sky;
    const light = sky.keyColor.clone().multiplyScalar(0.12);
    const amb = new THREE.Color(0.12, 0.14, 0.17).multiplyScalar(0.4 + sky.dayFactor * 2.2);
    for (const pool of [this.soft]) {
      pool.mat.uniforms.uLight.value.copy(light);
      pool.mat.uniforms.uAmbient.value.copy(amb);
    }
    const scale = g.post.renderHeight * 0.9;
    this.soft.mat.uniforms.uScale.value = scale;
    this.glow.mat.uniforms.uScale.value = scale;
    this.soft.update(dt, this.wind);
    this.glow.update(dt, this.wind);
  }
}
