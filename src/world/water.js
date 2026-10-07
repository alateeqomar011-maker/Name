// Ocean, rivers and waterfalls with animated, depth-aware shading.
import * as THREE from 'three';
import { U, GLSL_NOISE, GLSL_HEIGHT } from './shaderlib.js';

const waterVert = /* glsl */ `
uniform float uTime; uniform float uWaveAmp; uniform float uLevel; uniform vec3 uOrigin;
attribute float aFlow; attribute float aSteep;
varying vec3 vWPos; varying float vDepth; varying vec2 vFlowUV; varying float vSteep; varying vec3 vWaveN;
${GLSL_HEIGHT}
void main(){
  vec3 p = position;
  #ifdef OCEAN
    p += uOrigin;
    p.y = uLevel;
  #endif
  float ground = worldHeight(p.xz);
  float depth = p.y - ground;
  vec3 n = vec3(0.0, 1.0, 0.0);
  #ifdef OCEAN
    float amp = uWaveAmp * smoothstep(0.0, 7.0, depth);
    vec2 d1 = normalize(vec2(1.0, 0.35)), d2 = normalize(vec2(-0.4, 1.0)), d3 = normalize(vec2(0.7, -0.6));
    float w1 = 0.055, w2 = 0.09, w3 = 0.16;
    float a1 = 0.55, a2 = 0.3, a3 = 0.14;
    float ph1 = dot(d1, p.xz) * w1 + uTime * 0.9;
    float ph2 = dot(d2, p.xz) * w2 + uTime * 1.25;
    float ph3 = dot(d3, p.xz) * w3 + uTime * 1.7;
    p.y += amp * (a1 * sin(ph1) + a2 * sin(ph2) + a3 * sin(ph3));
    vec2 grad = amp * (a1 * w1 * cos(ph1) * d1 + a2 * w2 * cos(ph2) * d2 + a3 * w3 * cos(ph3) * d3);
    n = normalize(vec3(-grad.x, 1.0, -grad.y));
    // shoreline swell
    p.y += sin(uTime * 1.2 + depth * 1.5) * 0.06 * (1.0 - smoothstep(0.0, 3.0, depth)) * step(0.0, depth);
  #else
    p.y += uLevel;
  #endif
  vDepth = depth;
  vWPos = p;
  vFlowUV = vec2(uv.x, aFlow);
  vSteep = aSteep;
  vWaveN = n;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const waterFrag = /* glsl */ `
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uHorizon; uniform vec3 uZenith;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uRain; uniform float uNight; uniform sampler2D uMaskTex;
uniform float uFlash; uniform float uUnder;
varying vec3 vWPos; varying float vDepth; varying vec2 vFlowUV; varying float vSteep; varying vec3 vWaveN;
${GLSL_NOISE}
vec2 nGrad(vec2 p){ float e = 0.08; float h = vnoise(p); return vec2(vnoise(p + vec2(e,0.0)) - h, vnoise(p + vec2(0.0,e)) - h) / e; }
void main(){
  vec3 V = normalize(cameraPosition - vWPos);
  float dist = length(cameraPosition - vWPos);
  vec2 g = vec2(0.0);
  float detail = 1.0 - smoothstep(80.0, 600.0, dist);
  #ifdef OCEAN
    g += nGrad(vWPos.xz * 0.35 + vec2(uTime * 0.05, uTime * 0.03)) * 0.18;
    g += nGrad(vWPos.xz * 0.9 - vec2(uTime * 0.07, -uTime * 0.04)) * 0.1;
    g += nGrad(vWPos.xz * 2.4 + vec2(uTime * 0.12, 0.0)) * 0.05 * detail;
  #else
    vec2 fuv = vec2(vFlowUV.x * 3.0, vFlowUV.y * 0.25 - uTime * (0.6 + vSteep * 3.0));
    g += nGrad(fuv * vec2(1.0, 1.0)) * 0.22;
    g += nGrad(fuv * 2.7 + 5.0) * 0.12;
  #endif
  // rain ripples
  if (uRain > 0.01) {
    vec2 rp = vWPos.xz * 1.6;
    vec2 cell = floor(rp); vec2 f = fract(rp) - 0.5;
    float h = hash12(cell);
    float t = fract(uTime * 0.9 + h);
    float r = length(f) - t * 0.5;
    float ring = exp(-r * r * 400.0) * (1.0 - t) * uRain * detail;
    g += normalize(f + 0.0001) * ring * 0.9;
  }
  vec3 N = normalize(vWaveN + vec3(-g.x, 0.0, -g.y) * detail + vec3(-g.x, 0.0, -g.y) * 0.25);
  if (!gl_FrontFacing) N = -N;
  float fres = 0.02 + 0.75 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uZenith, pow(max(R.y, 0.0), 0.5)) * 0.82;
  float spec = pow(max(dot(R, uSunDir), 0.0), 380.0) * 6.0 + pow(max(dot(R, uSunDir), 0.0), 40.0) * 0.25;
  spec *= smoothstep(-0.05, 0.1, uSunDir.y) * (1.0 - uRain * 0.7);
  vec2 muv = (vWPos.xz + 2048.0) / 4096.0;
  vec4 mask = texture2D(uMaskTex, muv);
  float depth = max(vDepth, 0.0);
  vec3 shallow = vec3(0.07, 0.42, 0.42);
  vec3 deep = vec3(0.005, 0.05, 0.1);
  #ifndef OCEAN
    shallow = vec3(0.12, 0.33, 0.28); deep = vec3(0.02, 0.09, 0.1);
  #endif
  vec3 body = mix(shallow, deep, 1.0 - exp(-depth * 0.18));
  body = mix(body, vec3(0.07, 0.09, 0.03), mask.r * 0.85);
  float dayL = mix(0.06, 1.0, 1.0 - uNight);
  body *= dayL * (0.65 + 0.35 * max(uSunDir.y, 0.0));
  // subsurface glow on wave crests facing sun
  body += vec3(0.0, 0.08, 0.07) * max(dot(V, -uSunDir), 0.0) * (1.0 - uNight) * 0.6;
  vec3 col = mix(body, sky, fres);
  col += uSunColor * spec;
  // foam
  float foamN = vnoise(vWPos.xz * 1.3 + uTime * 0.3) * 0.6 + vnoise(vWPos.xz * 4.0 - uTime * 0.2) * 0.4;
  float foam = 0.0;
  #ifdef OCEAN
    foam = smoothstep(1.2, 0.0, depth) * smoothstep(0.35, 0.65, foamN + 0.25 * sin(uTime * 1.5 - depth * 3.0));
  #else
    foam = smoothstep(0.35, 1.0, vSteep) * smoothstep(0.35, 0.65, foamN) + smoothstep(0.4, 0.0, depth) * 0.25 * foamN;
    foam += smoothstep(0.88, 1.0, abs(vFlowUV.x - 0.5) * 2.0) * 0.2 * foamN;
  #endif
  col = mix(col, vec3(0.92, 0.95, 0.97) * dayL, clamp(foam, 0.0, 1.0));
  col += vec3(0.5, 0.55, 0.7) * uFlash * 0.4;
  float alpha = mix(0.35, 0.96, smoothstep(0.0, 2.5, depth));
  alpha = max(alpha, foam);
  alpha = max(alpha, fres);
  if (!gl_FrontFacing) { col = vec3(0.04, 0.2, 0.22) * dayL + uSunColor * pow(max(dot(-V, uSunDir), 0.0), 20.0) * 0.5; alpha = 0.9; }
  // fog
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  if (uUnder > 0.5) fogF = 0.0;
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeWaterMaterial(world, ocean, extra) {
  const uniforms = {
    uTime: U.uTime, uSunDir: U.uSunDir, uSunColor: U.uSunColor, uHorizon: U.uHorizon,
    uZenith: extra.zenith, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uRain: U.uRain, uNight: U.uNight,
    uFlash: U.uFlash, uHeightTex: { value: world.heightTex }, uMaskTex: { value: world.maskTex },
    uWaveAmp: extra.waveAmp, uLevel: ocean ? extra.seaLevel : extra.riverOffset, uOrigin: extra.origin, uUnder: extra.under,
  };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: waterVert, fragmentShader: waterFrag,
    transparent: true, depthWrite: true, side: THREE.DoubleSide,
    defines: ocean ? { OCEAN: 1 } : {},
  });
}

function oceanGeometry() {
  // Polar grid: dense near the centre, sparse far away
  const rings = 64, segs = 96;
  const pos = [], uv = [], idx = [], flow = [], steep = [];
  pos.push(0, 0, 0); uv.push(0.5, 0.5); flow.push(0); steep.push(0);
  let r = 1.5;
  for (let i = 1; i <= rings; i++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      uv.push(0, 0); flow.push(0); steep.push(0);
    }
    r *= i < 40 ? 1.105 : 1.16;
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 1; i < rings; i++) {
    const b0 = 1 + (i - 1) * segs, b1 = 1 + i * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(b0 + s, b0 + s1, b1 + s, b0 + s1, b1 + s1, b1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  g.setAttribute('aSteep', new THREE.Float32BufferAttribute(steep, 1));
  g.setIndex(idx);
  return g;
}

function riverGeometry(R) {
  const n = R.x.length;
  const pos = [], uv = [], idx = [], flow = [], steep = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let dx = R.x[i1] - R.x[i0], dz = R.z[i1] - R.z[i0];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const hw = R.width[i] * 0.5 * 1.18 + 1.5;
    if (i > 0) acc += Math.hypot(R.x[i] - R.x[i - 1], R.z[i] - R.z[i - 1]);
    const drop = Math.max(0, (R.level[i0] - R.level[i1]) / Math.max(1, Math.hypot(R.x[i1] - R.x[i0], R.z[i1] - R.z[i0])));
    const st = Math.min(1, drop * 3);
    const y = R.level[i] + 0.05;
    pos.push(R.x[i] - dz * hw, y, R.z[i] + dx * hw, R.x[i] + dz * hw, y, R.z[i] - dx * hw);
    uv.push(0, 0, 1, 0);
    flow.push(acc, acc);
    steep.push(st, st);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  g.setAttribute('aSteep', new THREE.Float32BufferAttribute(steep, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class Water {
  constructor(world, scene) {
    this.world = world;
    this.extra = {
      zenith: { value: new THREE.Color(0.2, 0.4, 0.8) }, waveAmp: { value: 0.5 },
      seaLevel: { value: 0 }, riverOffset: { value: 0 }, origin: { value: new THREE.Vector3() }, under: { value: 0 },
    };
    this.oceanMat = makeWaterMaterial(world, true, this.extra);
    this.ocean = new THREE.Mesh(oceanGeometry(), this.oceanMat);
    this.ocean.frustumCulled = false;
    this.ocean.renderOrder = 1;
    scene.add(this.ocean);

    this.riverMat = makeWaterMaterial(world, false, this.extra);
    this.rivers = [];
    for (const R of world.rivers) {
      const m = new THREE.Mesh(riverGeometry(R), this.riverMat);
      m.renderOrder = 2;
      scene.add(m);
      this.rivers.push(m);
    }

    // Waterfall mist particles
    this.falls = [];
    const mistTex = makeSoftTexture();
    for (const R of world.rivers) {
      for (const wf of R.waterfalls) {
        const count = 60;
        const g = new THREE.BufferGeometry();
        const p = new Float32Array(count * 3);
        const seeds = new Float32Array(count);
        for (let i = 0; i < count; i++) { seeds[i] = Math.random(); }
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        const mat = new THREE.PointsMaterial({ map: mistTex, size: 7, transparent: true, opacity: 0.35, depthWrite: false, color: 0xe8f2f4, sizeAttenuation: true });
        const pts = new THREE.Points(g, mat);
        pts.frustumCulled = false;
        scene.add(pts);
        const bx = R.x[Math.min(R.x.length - 1, wf.i1)], bz = R.z[Math.min(R.z.length - 1, wf.i1)];
        this.falls.push({ wf, pts, seeds, bx, bz, by: wf.bottom, river: R });
      }
    }
  }

  get waterfalls() { return this.falls; }

  update(dt, camPos, weather, zenith) {
    this.extra.origin.value.set(Math.round(camPos.x / 8) * 8, 0, Math.round(camPos.z / 8) * 8);
    this.extra.seaLevel.value = this.world.seaLevel + this.world.flood;
    this.extra.riverOffset.value = this.world.flood * 0.6;
    this.extra.waveAmp.value = 0.35 + weather.wind * 0.9;
    this.extra.zenith.value.copy(zenith);
    const t = U.uTime.value;
    for (const f of this.falls) {
      const d = Math.hypot(camPos.x - f.bx, camPos.z - f.bz);
      f.pts.visible = d < 600;
      if (!f.pts.visible) continue;
      const p = f.pts.geometry.attributes.position;
      for (let i = 0; i < f.seeds.length; i++) {
        const s = f.seeds[i];
        const life = (t * 0.25 + s) % 1;
        const a = s * 40;
        const r = life * 10;
        p.setXYZ(i, f.bx + Math.cos(a) * r, f.by + this.world.flood * 0.6 + 0.5 + life * 6, f.bz + Math.sin(a) * r);
      }
      p.needsUpdate = true;
    }
  }

  setUnderwater(v) { this.extra.under.value = v ? 1 : 0; }
}

export function makeSoftTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
