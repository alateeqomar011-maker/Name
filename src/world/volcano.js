// Ember Peak is always alive: a churning lava lake in the crater, a towering smoke and ash plume
// lit orange from below, drifting embers, falling ash on the flanks and a deep rumble.
import * as THREE from 'three';
import { VOLCANO } from './worldgen.js';
import { U, GLSL_NOISE } from './shaderlib.js';
import { LAYER_OVERLAY } from '../systems/postfx.js';

const lavaVert = /* glsl */ `
varying vec3 vWPos;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const lavaFrag = /* glsl */ `
uniform float uTime; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vWPos;
${GLSL_NOISE}
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// cooled crust plates separated by glowing cracks
vec2 crust(vec2 p){
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = h22(n + g);
    o = 0.5 + 0.45 * sin(uTime * 0.15 + 6.2831 * o);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
void main(){
  vec2 p = vWPos.xz * 0.09;
  // slow convection: the surface churns and drifts
  p += vec2(fbm3(p * 0.6 + uTime * 0.02), fbm3(p * 0.6 - uTime * 0.025 + 7.0)) * 1.4;
  vec2 c = crust(p);
  vec2 c2 = crust(p * 2.7 + 3.0);
  float crack = 1.0 - smoothstep(0.0, 0.12, c.y);
  float crack2 = 1.0 - smoothstep(0.0, 0.08, c2.y);
  float heat = fbm3(vWPos.xz * 0.03 + uTime * 0.05);
  float pulse = 0.8 + 0.2 * sin(uTime * 1.3 + heat * 6.0);
  vec3 hot = vec3(4.2, 1.15, 0.18);
  vec3 white = vec3(6.0, 3.2, 1.1);
  vec3 crustC = mix(vec3(0.03, 0.02, 0.018), vec3(0.22, 0.04, 0.01), smoothstep(0.3, 0.8, heat));
  vec3 col = crustC;
  col = mix(col, hot * pulse, max(crack, crack2 * 0.6) * (0.55 + 0.45 * heat));
  col = mix(col, white, crack * smoothstep(0.65, 0.95, heat) * 0.6);
  // open molten patches where the crust has broken up
  col = mix(col, hot * 1.3, smoothstep(0.62, 0.8, heat) * smoothstep(0.35, 0.0, c.x) * 0.7);
  float dist = length(cameraPosition - vWPos);
  float fog = 1.0 - exp(-pow(uFogDensity * dist, 2.0) * 0.6);
  col = mix(col, uFogColor + col * 0.25, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

const plumeVert = /* glsl */ `
attribute vec4 aPuff; // xyz = centre, w = size
attribute vec4 aInfo; // x = alpha, y = height above rim (0..1), z = seed, w = rotation
varying vec2 vUv; varying vec4 vInfo; varying vec3 vWPos;
void main(){
  vUv = uv; vInfo = aInfo;
  // fade billows the camera is inside of, so the view never turns into a white wall
  float cd = length(cameraPosition - aPuff.xyz);
  vInfo.x *= smoothstep(aPuff.w * 0.25, aPuff.w * 0.9, cd);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(aInfo.w), s = sin(aInfo.w);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aPuff.w;
  vec3 wp = aPuff.xyz + camR * q.x + camU * q.y;
  vWPos = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const plumeFrag = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uFogColor; uniform float uDay; uniform float uTime;
varying vec2 vUv; varying vec4 vInfo; varying vec3 vWPos;
${GLSL_NOISE}
void main(){
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float n = fbm3(vUv * 3.0 + vInfo.z * 17.0 + uTime * 0.01) * 0.6 + fbm3(vUv * 7.0 - vInfo.z * 5.0) * 0.4;
  float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.9) * vInfo.x;
  if (a < 0.01) discard;
  // fake volumetric lighting: the sun side of each billow is brighter, the core darker
  vec2 sunScreen = normalize(vec2(uSunDir.x, uSunDir.y + 0.001));
  float lit = clamp(0.55 + dot(-d * 2.0, sunScreen) * 0.35 + (n - 0.5) * 0.5, 0.15, 1.0);
  float hgt = vInfo.y;
  vec3 ash = mix(vec3(0.07, 0.065, 0.06), vec3(0.42, 0.41, 0.4), smoothstep(0.0, 1.0, hgt));
  vec3 col = ash * (uSunColor * lit * 0.55 * uDay + vec3(0.06, 0.065, 0.08));
  // glowing underside from the lava lake
  col += vec3(1.8, 0.45, 0.08) * (1.0 - smoothstep(0.0, 0.35, hgt)) * (0.5 + 0.5 * (1.0 - lit));
  col = mix(col, uFogColor, smoothstep(0.6, 1.0, hgt) * 0.35);
  gl_FragColor = vec4(col, a * 0.85);
}`;

export class Volcano {
  constructor(game) {
    this.game = game;
    const w = game.world;
    const scene = game.scene;
    this.center = new THREE.Vector3(VOLCANO.x, 0, VOLCANO.z);
    // crater geometry: the lava fills the crater bowl up to a level well below the rim
    let floor = Infinity, rim = 0;
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      floor = Math.min(floor, w.getHeight(VOLCANO.x + Math.cos(ang) * 10, VOLCANO.z + Math.sin(ang) * 10));
      rim = Math.max(rim, w.getHeight(VOLCANO.x + Math.cos(ang) * 98, VOLCANO.z + Math.sin(ang) * 98));
    }
    let lvl = 0;
    for (let a = 0; a < 24; a++) { const ang = (a / 24) * Math.PI * 2; lvl += w.getHeight(VOLCANO.x + Math.cos(ang) * 48, VOLCANO.z + Math.sin(ang) * 48); }
    this.lakeY = Math.max(floor + 2, lvl / 24 - 1);
    this.rimY = rim;
    this.lakeR = 70;
    this.center.y = this.lakeY;

    this.lavaMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      vertexShader: lavaVert, fragmentShader: lavaFrag,
    });
    const lake = new THREE.Mesh(new THREE.CircleGeometry(this.lakeR, 64), this.lavaMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(VOLCANO.x, this.lakeY, VOLCANO.z);
    scene.add(lake);
    this.lake = lake;

    // plume of billboard billows
    this.N = 56;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    this.aPuff = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 4), 4);
    this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 4), 4);
    this.aPuff.setUsage(THREE.DynamicDrawUsage); this.aInfo.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPuff', this.aPuff);
    g.setAttribute('aInfo', this.aInfo);
    g.instanceCount = this.N;
    this.plumeMat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: U.uSunDir, uSunColor: U.uSunColor, uFogColor: U.uFogColor, uDay: { value: 1 }, uTime: U.uTime },
      vertexShader: plumeVert, fragmentShader: plumeFrag, transparent: true, depthWrite: false,
    });
    this.plume = new THREE.Mesh(g, this.plumeMat);
    this.plume.frustumCulled = false;
    this.plume.renderOrder = 4;
    this.plume.layers.set(LAYER_OVERLAY);
    scene.add(this.plume);
    this.puffs = [];
    for (let i = 0; i < this.N; i++) this.puffs.push(this._newPuff(Math.random()));

    this.light = game.fx.addLight({ pos: new THREE.Vector3(VOLCANO.x, this.lakeY + 25, VOLCANO.z), color: 0xff5a1e, intensity: 5000, dist: 320, priority: 6, flicker: true });
    this.rumble = 0;
    this._emberT = 0;
    this._ashT = 0;
  }

  _newPuff(age = 0) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 35;
    const life = 55 + Math.random() * 35;
    return { x: VOLCANO.x + Math.cos(a) * r, y: this.lakeY + 5, z: VOLCANO.z + Math.sin(a) * r, vy: 5 + Math.random() * 4, t: age * life, life, seed: Math.random(), rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.05 };
  }

  update(dt) {
    const g = this.game;
    const cam = g.camera.position;
    const inCave = !!g.caves.active;
    this.plume.visible = this.lake.visible = !inCave;
    if (inCave) { this.light.enabled = false; this.rumble = 0; return; }
    this.light.enabled = true;
    const wind = g.weather.windVec, ws = 2 + g.weather.wind * 8;
    this.plumeMat.uniforms.uDay.value = 0.25 + 0.75 * g.sky.dayFactor;
    const P = this.aPuff.array, I = this.aInfo.array;
    for (let i = 0; i < this.N; i++) {
      let p = this.puffs[i];
      p.t += dt;
      if (p.t > p.life) p = this.puffs[i] = this._newPuff(0);
      const k = p.t / p.life;
      // buoyant rise that slows with height while the wind bends the column
      const rise = p.vy * p.t * (1 - k * 0.45);
      const bend = Math.pow(k, 1.5) * p.life * ws * 0.9;
      P[i * 4] = p.x + wind.x * bend;
      P[i * 4 + 1] = p.y + rise;
      P[i * 4 + 2] = p.z + wind.y * bend;
      P[i * 4 + 3] = 45 + k * 260;
      I[i * 4] = Math.min(1, k * 8) * (1 - Math.pow(k, 2.2)) * 0.8;
      I[i * 4 + 1] = Math.min(1, rise / 420);
      I[i * 4 + 2] = p.seed;
      I[i * 4 + 3] = p.rot + p.t * p.spin;
    }
    this.aPuff.needsUpdate = true;
    this.aInfo.needsUpdate = true;

    const d = Math.hypot(cam.x - VOLCANO.x, cam.z - VOLCANO.z);
    // embers spat from the lake, ash drifting down on the upper slopes
    this._emberT -= dt;
    if (d < 1400 && this._emberT <= 0) {
      this._emberT = 0.15;
      const a = Math.random() * Math.PI * 2, r = Math.random() * this.lakeR * 0.8;
      g.fx.ember(new THREE.Vector3(VOLCANO.x + Math.cos(a) * r, this.lakeY + 1, VOLCANO.z + Math.sin(a) * r), 3);
    }
    this._ashT -= dt;
    if (d < 650 && this._ashT <= 0) {
      this._ashT = 0.05;
      const x = cam.x + (Math.random() - 0.5) * 40, z = cam.z + (Math.random() - 0.5) * 40;
      g.fx.dust(new THREE.Vector3(x, cam.y + 6 + Math.random() * 6, z), 0.25, [0.18, 0.17, 0.16]);
    }
    this.rumble = Math.max(0, 1 - d / 900) * 0.35;
    // the lake is deadly
    const p = g.player;
    if (p.alive && Math.hypot(p.pos.x - VOLCANO.x, p.pos.z - VOLCANO.z) < this.lakeR - 2 && p.pos.y < this.lakeY + 0.8) p.damage(dt * 60, 'Lava');
  }
}
