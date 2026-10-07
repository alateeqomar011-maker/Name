// Ambient life that makes the world feel inhabited: bird flocks, butterflies, dragonflies over water,
// fireflies at night, drifting pollen/dust in the light, falling leaves under canopies and jumping fish.
import * as THREE from 'three';
import { LAYER_OVERLAY } from '../systems/postfx.js';
import { U } from './shaderlib.js';
import { atmospherePatch } from './atmosphere.js';
import { BIOME } from './worldgen.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const rnd = (a, b) => a + Math.random() * (b - a);

function flapMaterial(color, speed, amp, wingFold = false) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlap; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = 0.0;
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.71;
          #endif
          float glide = ${wingFold ? '1.0' : 'smoothstep(-0.3, 0.3, sin(uTime * 0.35 + ph))'};
          float ang = sin(uTime * ${speed.toFixed(1)} + ph * 13.0) * ${amp.toFixed(2)} * mix(0.15, 1.0, glide);
          transformed.y += abs(position.x) * sin(ang) * aFlap;
          transformed.x *= mix(1.0, cos(ang), aFlap);
        }`);
    atmospherePatch(shader);
  };
  m.customProgramCacheKey = () => 'flap' + speed + amp + wingFold;
  return m;
}

function birdGeometry() {
  // slim body + swept wings
  const pos = [0, 0, 0.22, 0.04, 0, -0.05, -0.04, 0, -0.05, 0, 0.03, -0.02, 0, 0, -0.18, // body
    0.03, 0, 0.06, 0.55, 0.02, -0.04, 0.03, 0, -0.08, // right wing
    -0.03, 0, 0.06, -0.55, 0.02, -0.04, -0.03, 0, -0.08]; // left wing
  const idx = [0, 1, 3, 0, 3, 2, 1, 4, 3, 3, 4, 2, 0, 2, 4, 0, 4, 1, 5, 6, 7, 8, 9, 10];
  const flap = [0, 0, 0, 0, 0, 0.1, 1, 0.1, 0.1, 1, 0.1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlap', new THREE.Float32BufferAttribute(flap, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function butterflyGeometry(long = false) {
  const L = long ? 0.5 : 1;
  const pos = [0, 0, 0.05 * L * 2, 0, 0, -0.05 * L * 3,
    0.0, 0, 0.03, 0.09 * L, 0, 0.07, 0.1 * L, 0, 0.0,
    0.0, 0, -0.01, 0.08 * L, 0, -0.04, 0.05 * L, 0, -0.07,
    0.0, 0, 0.03, -0.09 * L, 0, 0.07, -0.1 * L, 0, 0.0,
    0.0, 0, -0.01, -0.08 * L, 0, -0.04, -0.05 * L, 0, -0.07];
  // slim body quad (non-degenerate so lighting never sees a zero normal)
  pos.push(0.008, 0, 0.05 * L * 2, -0.008, 0, 0.05 * L * 2, 0.008, 0, -0.05 * L * 3, -0.008, 0, -0.05 * L * 3);
  const idx = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 15, 17, 16];
  const flap = [0, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlap', new THREE.Float32BufferAttribute(flap, 1));
  // thin flat insects: every vertex faces up
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  g.setIndex(idx);
  return g;
}

function glowPoints(count, color, size) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const a = new Float32Array(count);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(a, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size } },
    vertexShader: `attribute float alpha; varying float vA; uniform float uSize;
      void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * 300.0 / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); float a = exp(-r * 18.0) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.layers.set(LAYER_OVERLAY);
  return pts;
}

export class AmbientLife {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.group = new THREE.Group();
    this.group.name = 'ambient';
    scene.add(this.group);
    // Birds
    this.birdMesh = new THREE.InstancedMesh(birdGeometry(), flapMaterial(0x2a2620, 11, 0.9), 42);
    this.birdMesh.frustumCulled = false;
    this.group.add(this.birdMesh);
    this.flocks = [];
    for (let f = 0; f < 3; f++) {
      const birds = [];
      for (let i = 0; i < 14; i++) birds.push({ off: new THREE.Vector3(rnd(-8, 8), rnd(-3, 3), rnd(-8, 8)), ph: Math.random() * 10, pos: new THREE.Vector3(), heading: 0 });
      this.flocks.push({ ang: Math.random() * 6.28, r: rnd(70, 140), alt: rnd(30, 70), speed: rnd(0.08, 0.14) * (Math.random() < 0.5 ? 1 : -1), birds, cx: 0, cz: 0, retarget: 0 });
    }
    // Butterflies & dragonflies
    this.bflyMesh = new THREE.InstancedMesh(butterflyGeometry(), flapMaterial(0xffffff, 22, 1.1, true), 28);
    this.bflyMesh.frustumCulled = false;
    const bcols = [0xf28c28, 0x4a8be8, 0xf3d64a, 0xf2f0e6, 0xd24a2a, 0x7a4ad8];
    for (let i = 0; i < 28; i++) this.bflyMesh.setColorAt(i, new THREE.Color(bcols[i % bcols.length]));
    this.group.add(this.bflyMesh);
    this.bflies = Array.from({ length: 28 }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, live: false }));
    this.dflyMesh = new THREE.InstancedMesh(butterflyGeometry(true), flapMaterial(0x3a8a8a, 40, 0.6, true), 12);
    this.dflyMesh.frustumCulled = false;
    this.group.add(this.dflyMesh);
    this.dflies = Array.from({ length: 12 }, () => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), t: 0, live: false }));
    // Fireflies & pollen
    this.fire = glowPoints(140, 0xd8ff6a, 0.35);
    this.fireData = Array.from({ length: 140 }, () => ({ p: new THREE.Vector3(), ph: Math.random() * 10, live: false }));
    this.group.add(this.fire);
    this.dust = glowPoints(220, 0xfff4d8, 0.05);
    this.dustData = Array.from({ length: 220 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(rnd(-0.1, 0.1), rnd(-0.03, 0.05), rnd(-0.1, 0.1)), live: false }));
    this.group.add(this.dust);
    // Falling leaves
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, 0.035, 0, 0, 0, 0, -0.06, -0.035, 0, 0], 3));
    leafGeo.setIndex([0, 1, 2, 0, 2, 3]);
    leafGeo.computeVertexNormals();
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
    this.leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, 70);
    this.leafMesh.frustumCulled = false;
    const lcols = [0x6a7a2a, 0x8a6a2a, 0x9a5a22, 0x4a6a22, 0xa08030];
    for (let i = 0; i < 70; i++) this.leafMesh.setColorAt(i, new THREE.Color(lcols[i % lcols.length]));
    this.group.add(this.leafMesh);
    this.leaves = Array.from({ length: 70 }, () => ({ p: new THREE.Vector3(), rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)), live: false, ph: Math.random() * 6 }));
    // Fish
    const fishGeo = new THREE.ConeGeometry(0.12, 0.7, 6);
    fishGeo.rotateX(Math.PI / 2);
    fishGeo.scale(1, 0.6, 1);
    this.fishMesh = new THREE.Mesh(fishGeo, new THREE.MeshStandardMaterial({ color: 0x8a9aa0, roughness: 0.3, metalness: 0.5 }));
    this.fishMesh.visible = false;
    this.group.add(this.fishMesh);
    this.fishJump = null;
    this.fishT = 4;
  }

  _hideInstances(mesh, from = 0) {
    for (let i = from; i < mesh.count; i++) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, focus) {
    const g = this.game;
    const w = g.world;
    const cam = g.camera.position;
    const P = focus || g.player.pos;
    const t = U.uTime.value;
    const inCave = !!g.caves.active;
    this.group.visible = !inCave;
    if (inCave) return;
    const day = g.sky.dayFactor;
    const rain = g.weather.local.rain;
    const b = w.getBiome(P.x, P.z);

    // ---- Birds ----
    let bi = 0;
    const birdsOn = day > 0.35 && rain < 0.5;
    for (const F of this.flocks) {
      F.retarget -= dt;
      if (F.retarget <= 0 || Math.hypot(F.cx - P.x, F.cz - P.z) > 500) { F.retarget = rnd(30, 70); F.cx = P.x + rnd(-150, 150); F.cz = P.z + rnd(-150, 150); }
      F.ang += F.speed * dt;
      const fx = F.cx + Math.cos(F.ang) * F.r, fz = F.cz + Math.sin(F.ang) * F.r;
      const fy = Math.max(w.getHeight(fx, fz), w.seaLevel) + F.alt;
      const heading = Math.atan2(-Math.sin(F.ang) * Math.sign(F.speed), Math.cos(F.ang) * Math.sign(F.speed));
      for (const B of F.birds) {
        B.ph += dt;
        _p.set(fx + B.off.x + Math.sin(B.ph * 0.7) * 2, fy + B.off.y + Math.sin(B.ph * 1.1) * 1.2, fz + B.off.z + Math.cos(B.ph * 0.6) * 2);
        _q.setFromEuler(_e.set(0, heading, Math.sin(B.ph * 0.5) * 0.25));
        _m.compose(_p, _q, _s.setScalar(birdsOn ? 1.2 : 0));
        this.birdMesh.setMatrixAt(bi++, _m);
      }
    }
    this.birdMesh.instanceMatrix.needsUpdate = true;

    // ---- Butterflies (meadows & forest edges, daytime, calm weather) ----
    const bflyOk = day > 0.45 && rain < 0.2 && [BIOME.GRASSLAND, BIOME.FOREST, BIOME.JUNGLE, BIOME.ISLAND, BIOME.MOUNTAIN, BIOME.SWAMP].includes(b);
    this.bflies.forEach((f, i) => {
      if (!f.live || f.pos.distanceTo(P) > 30) {
        if (!bflyOk) { f.live = false; _m.makeScale(0, 0, 0); this.bflyMesh.setMatrixAt(i, _m); return; }
        const a = Math.random() * 6.28, r = rnd(4, 26);
        const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        const gh = w.getHeight(x, z);
        if (w.waterLevelAt(x, z) > gh) { f.live = false; return; }
        f.pos.set(x, gh + rnd(0.4, 1.6), z);
        f.vel.set(rnd(-1, 1), 0, rnd(-1, 1));
        f.live = true;
      }
      f.t += dt;
      f.vel.x += (Math.sin(f.t * 2.3 + i) + rnd(-1, 1)) * dt * 3;
      f.vel.z += (Math.cos(f.t * 1.9 + i * 2) + rnd(-1, 1)) * dt * 3;
      f.vel.multiplyScalar(Math.exp(-dt * 1.2));
      f.pos.addScaledVector(f.vel, dt);
      const gh = w.getHeight(f.pos.x, f.pos.z);
      f.pos.y = gh + 0.6 + Math.sin(f.t * 3.1 + i) * 0.45 + Math.abs(Math.sin(f.t * 0.7 + i)) * 0.8;
      _q.setFromEuler(_e.set(0, Math.atan2(f.vel.x, f.vel.z), 0));
      _m.compose(f.pos, _q, _s.setScalar(1.3));
      this.bflyMesh.setMatrixAt(i, _m);
    });
    this.bflyMesh.instanceMatrix.needsUpdate = true;

    // ---- Dragonflies over rivers and marsh ----
    const river = w.riverAt(P.x, P.z) || w.gen.riverQuery(P.x, P.z, {});
    const nearWater = (river && river.dist !== undefined && river.dist < 60) || b === BIOME.SWAMP;
    this.dflies.forEach((f, i) => {
      if (!nearWater || day < 0.3 || rain > 0.3) { f.live = false; _m.makeScale(0, 0, 0); this.dflyMesh.setMatrixAt(i, _m); return; }
      if (!f.live || f.pos.distanceTo(P) > 45) {
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * 6.28, r = rnd(3, 35);
          const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
          const wl = w.waterLevelAt(x, z);
          if (wl > w.getHeight(x, z) + 0.2) { f.pos.set(x, wl + rnd(0.4, 1.2), z); f.target.copy(f.pos); f.live = true; break; }
        }
        if (!f.live) { _m.makeScale(0, 0, 0); this.dflyMesh.setMatrixAt(i, _m); return; }
      }
      f.t -= dt;
      if (f.t <= 0) {
        f.t = rnd(0.4, 2.2);
        const x = f.pos.x + rnd(-4, 4), z = f.pos.z + rnd(-4, 4);
        f.target.set(x, Math.max(w.waterLevelAt(x, z), w.getHeight(x, z)) + rnd(0.3, 1.4), z);
      }
      const d = _p.subVectors(f.target, f.pos);
      const prev = Math.atan2(d.x, d.z);
      f.pos.addScaledVector(d, Math.min(1, dt * 4));
      _q.setFromEuler(_e.set(0, prev, 0));
      _m.compose(f.pos, _q, _s.setScalar(1.4));
      this.dflyMesh.setMatrixAt(i, _m);
    });
    this.dflyMesh.instanceMatrix.needsUpdate = true;

    // ---- Fireflies (night, vegetated land) ----
    const fireOk = day < 0.25 && rain < 0.3 && ![BIOME.DESERT, BIOME.CANYON, BIOME.SNOW, BIOME.VOLCANIC, BIOME.OCEAN].includes(b);
    {
      const pa = this.fire.geometry.attributes.position, aa = this.fire.geometry.attributes.alpha;
      this.fireData.forEach((f, i) => {
        if (!fireOk) { aa.setX(i, 0); return; }
        if (!f.live || f.p.distanceTo(P) > 32) {
          const a = Math.random() * 6.28, r = rnd(2, 30);
          const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
          f.p.set(x, w.getHeight(x, z) + rnd(0.3, 2.5), z);
          f.live = true;
        }
        f.ph += dt;
        f.p.x += Math.sin(f.ph * 0.7 + i) * dt * 0.4;
        f.p.z += Math.cos(f.ph * 0.6 + i * 1.3) * dt * 0.4;
        f.p.y += Math.sin(f.ph * 0.9 + i * 0.7) * dt * 0.2;
        pa.setXYZ(i, f.p.x, f.p.y, f.p.z);
        const pulse = Math.max(0, Math.sin(f.ph * 1.7 + i * 2.1));
        aa.setX(i, Math.pow(pulse, 3) * (1 - day * 3));
      });
      pa.needsUpdate = true; aa.needsUpdate = true;
    }

    // ---- Pollen / dust motes catching the light ----
    {
      const pa = this.dust.geometry.attributes.position, aa = this.dust.geometry.attributes.alpha;
      const dustOn = day > 0.3 && rain < 0.3;
      const windX = g.weather.windVec.x * (0.2 + g.weather.wind), windZ = g.weather.windVec.y * (0.2 + g.weather.wind);
      this.dustData.forEach((d, i) => {
        if (!d.live || d.p.distanceTo(cam) > 14) {
          d.p.set(cam.x + rnd(-12, 12), cam.y + rnd(-3, 4), cam.z + rnd(-12, 12));
          d.live = true;
        }
        d.p.x += (d.v.x + windX) * dt; d.p.y += (d.v.y + Math.sin(t + i) * 0.03) * dt; d.p.z += (d.v.z + windZ) * dt;
        pa.setXYZ(i, d.p.x, d.p.y, d.p.z);
        aa.setX(i, dustOn ? 0.5 * day * (0.5 + 0.5 * Math.sin(t * 2 + i)) : 0);
      });
      pa.needsUpdate = true; aa.needsUpdate = true;
    }

    // ---- Falling leaves under canopies ----
    const canopy = w.getVeg(P.x, P.z) > 0.45 && [BIOME.FOREST, BIOME.PINEFOREST, BIOME.JUNGLE, BIOME.SWAMP].includes(b);
    this.leaves.forEach((L, i) => {
      if (!canopy) { L.live = false; _m.makeScale(0, 0, 0); this.leafMesh.setMatrixAt(i, _m); return; }
      const gh = w.getHeight(L.p.x, L.p.z);
      if (!L.live || L.p.y < gh + 0.03 || L.p.distanceTo(cam) > 28) {
        L.p.set(cam.x + rnd(-20, 20), w.getHeight(cam.x, cam.z) + rnd(6, 16), cam.z + rnd(-20, 20));
        L.live = true;
      }
      L.ph += dt;
      L.p.y -= dt * (0.6 + 0.3 * Math.sin(L.ph * 3));
      L.p.x += (Math.sin(L.ph * 2.1) * 0.6 + g.weather.windVec.x * g.weather.wind * 2) * dt;
      L.p.z += (Math.cos(L.ph * 1.7) * 0.6 + g.weather.windVec.y * g.weather.wind * 2) * dt;
      L.rot.addScaledVector(L.spin, dt);
      _q.setFromEuler(_e.set(L.rot.x, L.rot.y, L.rot.z));
      _m.compose(L.p, _q, _s.setScalar(1.6));
      this.leafMesh.setMatrixAt(i, _m);
    });
    this.leafMesh.instanceMatrix.needsUpdate = true;

    // ---- Jumping fish ----
    this.fishT -= dt;
    if (!this.fishJump && this.fishT <= 0) {
      this.fishT = rnd(6, 16);
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * 6.28, r = rnd(8, 40);
        const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        const wl = w.waterLevelAt(x, z);
        if (wl - w.getHeight(x, z) > 1.2) {
          const dir = Math.random() * 6.28;
          this.fishJump = { x, z, wl, dir, t: 0, dur: rnd(0.7, 1.1), h: rnd(0.6, 1.4), len: rnd(1, 2.2) };
          g.fx.splash(new THREE.Vector3(x, wl, z), 0.5);
          g.audio.play('splash', { pos: new THREE.Vector3(x, wl, z), vol: 0.35 });
          break;
        }
      }
    }
    if (this.fishJump) {
      const J = this.fishJump;
      J.t += dt;
      const s = J.t / J.dur;
      const x = J.x + Math.sin(J.dir) * J.len * s, z = J.z + Math.cos(J.dir) * J.len * s;
      const y = J.wl + Math.sin(s * Math.PI) * J.h;
      this.fishMesh.visible = true;
      this.fishMesh.position.set(x, y, z);
      this.fishMesh.rotation.set(-Math.cos(s * Math.PI) * 0.9, J.dir, 0);
      if (s >= 1) {
        this.fishMesh.visible = false;
        g.fx.splash(new THREE.Vector3(x, J.wl, z), 0.7);
        g.audio.play('splash', { pos: new THREE.Vector3(x, J.wl, z), vol: 0.4 });
        this.fishJump = null;
      }
    }
  }
}
