// Ocean, rivers and waterfalls with animated, depth-aware shading.
import * as THREE from 'three';
import { U, GLSL_NOISE, GLSL_HEIGHT } from './shaderlib.js';
import { SSR_U, LAYER_WATER, LAYER_OVERLAY } from '../systems/postfx.js';
import { A } from './atmosphere.js';

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
uniform sampler2D tSceneColor; uniform sampler2D tSceneDepth; uniform vec2 uResolution; uniform float uCamNear; uniform float uCamFar; uniform float uSSR;
uniform mat4 projectionMatrix; uniform float uMistA; uniform float uMistBase; uniform vec4 uRip[12];
varying vec3 vWPos; varying float vDepth; varying vec2 vFlowUV; varying float vSteep; varying vec3 vWaveN;
${GLSL_NOISE}
${GLSL_HEIGHT}
float ssrViewZFromD(float d){ return (uCamNear * uCamFar) / ((uCamFar - uCamNear) * d - uCamFar); }
float ssrViewZ(vec2 uv){ return ssrViewZFromD(texture2D(tSceneDepth, uv).r); }
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
  // expanding ripple rings from wading, swimming, footfalls and leaping fish
  float ripFoam = 0.0;
  for (int k = 0; k < 12; k++) {
    vec4 rp = uRip[k];
    float age = uTime - rp.z;
    if (rp.w <= 0.0 || age < 0.0 || age > 4.5) continue;
    vec2 dv = vWPos.xz - rp.xy;
    float dd = length(dv);
    float x = dd - age * (1.6 + rp.w * 0.8);
    float env = exp(-x * x * 5.0) * (1.0 - age / 4.5) * rp.w / (1.0 + dd * 0.15);
    g += (dv / max(dd, 0.01)) * env * 0.85 * cos(x * 10.0);
    ripFoam += exp(-dd * dd * 2.0 / (rp.w + 0.2)) * smoothstep(1.2, 0.0, age) * rp.w * 0.45;
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
  // per-pixel depth from the heightfield (river strips only have vertices on the banks)
  float depth = max(vWPos.y - worldHeight(vWPos.xz), 0.0);
  vec3 shallow = vec3(0.07, 0.42, 0.42);
  vec3 deep = vec3(0.005, 0.05, 0.1);
  #ifndef OCEAN
    shallow = vec3(0.12, 0.33, 0.28); deep = vec3(0.02, 0.09, 0.1);
  #endif
  vec3 body = mix(shallow, deep, 1.0 - exp(-depth * 0.18));
  body = mix(body, vec3(0.05, 0.06, 0.02), mask.r * 0.85);
  float dayL = mix(0.06, 1.0, 1.0 - uNight);
  body *= dayL * (0.65 + 0.35 * max(uSunDir.y, 0.0));
  // subsurface glow on wave crests facing sun
  body += vec3(0.0, 0.08, 0.07) * max(dot(V, -uSunDir), 0.0) * (1.0 - uNight) * 0.6;
  vec3 col;
  float opaqueOut = 0.0;
  if (uSSR > 0.5 && gl_FrontFacing) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    vec3 vp = (viewMatrix * vec4(vWPos, 1.0)).xyz;
    float wz = -vp.z;
    // refraction of the bed through the moving surface (never pull in objects in front of the water)
    vec2 roff = vec2(g.x, -g.y) * 0.03 * (0.4 + 0.6 * detail) / max(1.0, wz * 0.035);
    vec2 ruv = clamp(suv + roff, vec2(0.001), vec2(0.999));
    float sz = -ssrViewZ(ruv);
    if (sz < wz) { ruv = suv; sz = -ssrViewZ(suv); }
    float thick = clamp(sz - wz, 0.0, 400.0);
    vec3 refr = texture2D(tSceneColor, ruv).rgb;
    #ifdef OCEAN
      vec3 sigma = vec3(0.34, 0.07, 0.05);
    #else
      vec3 sigma = mix(vec3(0.42, 0.13, 0.11), vec3(1.2, 1.0, 1.35), mask.r);
    #endif
    vec3 trans = exp(-sigma * thick);
    // in-scattered light from the water volume itself: dim, the colour of deep water
    #ifdef OCEAN
      vec3 scat = body * 0.42;
    #else
      vec3 scat = body * mix(0.26, 0.4, mask.r);
    #endif
    vec3 under = refr * trans + scat * (1.0 - trans);
    // screen-space reflection march with binary refinement
    vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
    vec3 Rv = normalize(reflect(normalize(vp), Nv));
    vec3 refl = sky;
    float hitA = 0.0;
    vec3 rp = vp;
    float stepL = 0.3 + wz * 0.018;
    for (int i = 0; i < 30; i++) {
      vec3 prev = rp;
      rp += Rv * stepL;
      vec4 cp = projectionMatrix * vec4(rp, 1.0);
      if (cp.w <= 0.0) break;
      vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float d = texture2D(tSceneDepth, uv).r;
      if (d < 0.99999) {
        float sceneZ = -ssrViewZFromD(d);
        float rz = -rp.z;
        if (rz > sceneZ && rz - sceneZ < stepL * 2.0 + 0.6) {
          vec3 a = prev, b = rp;
          for (int k = 0; k < 5; k++) {
            vec3 m = (a + b) * 0.5;
            vec4 mc = projectionMatrix * vec4(m, 1.0);
            float ms = -ssrViewZ(mc.xy / mc.w * 0.5 + 0.5);
            if (-m.z > ms) b = m; else a = m;
          }
          vec4 bc = projectionMatrix * vec4(b, 1.0);
          vec2 huv = bc.xy / bc.w * 0.5 + 0.5;
          vec2 e = smoothstep(vec2(0.0), vec2(0.07), huv) * smoothstep(vec2(1.0), vec2(0.93), huv);
          hitA = e.x * e.y * (1.0 - smoothstep(0.6, 1.0, float(i) / 30.0));
          refl = mix(sky, texture2D(tSceneColor, huv).rgb, hitA);
          break;
        }
      }
      stepL *= 1.14;
    }
    if (hitA < 0.01) {
      // the reflected sky, clouds and sun glow come straight from the rendered sky when on screen
      vec4 sc = projectionMatrix * vec4(vp + Rv * 4000.0, 1.0);
      if (sc.w > 0.0) {
        vec2 su = sc.xy / sc.w * 0.5 + 0.5;
        if (su.x > 0.0 && su.x < 1.0 && su.y > 0.0 && su.y < 1.0 && texture2D(tSceneDepth, su).r >= 0.99999) {
          vec2 e = smoothstep(vec2(0.0), vec2(0.1), su) * smoothstep(vec2(1.0), vec2(0.9), su);
          refl = mix(sky, texture2D(tSceneColor, su).rgb * 0.9, e.x * e.y);
        }
      }
    }
    col = mix(under, refl, fres);
    opaqueOut = 1.0;
  } else {
    col = mix(body, sky, fres);
  }
  col += uSunColor * spec;
  // foam
  float foamN = vnoise(vWPos.xz * 1.3 + uTime * 0.3) * 0.6 + vnoise(vWPos.xz * 4.0 - uTime * 0.2) * 0.4;
  float foam = 0.0;
  #ifdef OCEAN
    foam = smoothstep(1.2, 0.0, depth) * smoothstep(0.35, 0.65, foamN + 0.25 * sin(uTime * 1.5 - depth * 3.0));
  #else
    // whitewater streaks stretched along the current, racing downstream
    float sp = 0.6 + vSteep * 3.0;
    float streak = vnoise(vec2(vFlowUV.x * 9.0, vFlowUV.y * 0.3 - uTime * sp)) * 0.6 + vnoise(vec2(vFlowUV.x * 23.0 + 3.0, vFlowUV.y * 0.9 - uTime * sp * 1.4)) * 0.4;
    foam = smoothstep(0.4, 1.0, vSteep) * smoothstep(0.5, 0.75, streak) * 0.85 + smoothstep(0.12, 0.0, depth) * 0.12 * foamN;
  #endif
  foam = max(foam, ripFoam * foamN * 1.4);
  col = mix(col, vec3(0.92, 0.95, 0.97) * dayL, clamp(foam, 0.0, 1.0));
  col += vec3(0.5, 0.55, 0.7) * uFlash * 0.4;
  float alpha = mix(0.35, 0.96, smoothstep(0.0, 2.5, depth));
  alpha = max(alpha, foam);
  alpha = max(alpha, fres);
  if (opaqueOut > 0.5) alpha = 1.0;
  if (!gl_FrontFacing) { col = vec3(0.04, 0.2, 0.22) * dayL + uSunColor * pow(max(dot(-V, uSunDir), 0.0), 20.0) * 0.5; alpha = 0.9; }
  // fog
  // height fog matching the global atmosphere
  float hf = 0.0055;
  float h0 = clamp(cameraPosition.y, -30.0, 3000.0), h1 = clamp(vWPos.y, -30.0, 3000.0);
  float dh = h1 - h0;
  float hInt = abs(dh) > 0.5 ? (exp(-hf * h0) - exp(-hf * h1)) / (hf * dh) : exp(-hf * h0);
  float hTerm = clamp(0.22 + 1.6 * hInt, 0.0, 2.4);
  float fd = uFogDensity * dist;
  float fogF = 1.0 - exp(-(fd * fd * hTerm + fd * 0.22 * hTerm));
  if (uUnder > 0.5) fogF = 0.0;
  vec3 vdir = -V;
  float sunAmt = pow(max(dot(vdir, uSunDir), 0.0), 7.0) * smoothstep(-0.05, 0.15, uSunDir.y);
  col = mix(col, mix(uFogColor, uSunColor * 0.9 + uFogColor * 0.35, sunAmt * 0.65), clamp(fogF, 0.0, 1.0));
  if (uMistA > 0.001 && uUnder < 0.5) {
    float mh = 0.05;
    float m0 = clamp(cameraPosition.y - uMistBase, -10.0, 2000.0), m1 = clamp(vWPos.y - uMistBase, -10.0, 2000.0);
    float mdh = m1 - m0;
    float mInt = abs(mdh) > 0.3 ? (exp(-mh * m0) - exp(-mh * m1)) / (mh * mdh) : exp(-mh * m0);
    float mi = 1.0 - exp(-dist * uMistA * 0.01 * min(mInt, 1.65));
    col = mix(col, mix(uFogColor * 1.06, uSunColor * 0.75 + uFogColor * 0.45, sunAmt * 0.6), mi);
  }
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
    ...SSR_U,
    uMistA: A.uMistA, uMistBase: A.uMistBase, uRip: extra.rip,
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
      rip: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    };
    this._ripI = 0;
    this._wadeT = 0;
    this.oceanMat = makeWaterMaterial(world, true, this.extra);
    this.ocean = new THREE.Mesh(oceanGeometry(), this.oceanMat);
    this.ocean.frustumCulled = false;
    this.ocean.renderOrder = 1;
    this.ocean.layers.set(LAYER_WATER);
    scene.add(this.ocean);

    this.riverMat = makeWaterMaterial(world, false, this.extra);
    this.rivers = [];
    for (const R of world.rivers) {
      const m = new THREE.Mesh(riverGeometry(R), this.riverMat);
      m.renderOrder = 2;
      m.layers.set(LAYER_WATER);
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
        const mat = new THREE.PointsMaterial({ map: mistTex, size: 6, transparent: true, opacity: 0.2, depthWrite: false, color: 0xe8f2f4, sizeAttenuation: true });
        const pts = new THREE.Points(g, mat);
        pts.frustumCulled = false;
        pts.layers.set(LAYER_OVERLAY);
        scene.add(pts);
        const bx = R.x[Math.min(R.x.length - 1, wf.i1)], bz = R.z[Math.min(R.z.length - 1, wf.i1)];
        this.falls.push({ wf, pts, seeds, bx, bz, by: wf.bottom, river: R });
      }
    }
  }

  get waterfalls() { return this.falls; }

  // spawn a ripple ring on the water surface at (x, z); strength ~0.2 (drip) .. 2 (dinosaur)
  addRipple(x, z, strength = 1) {
    this.extra.rip.value[this._ripI].set(x, z, U.uTime.value, Math.min(2, strength));
    this._ripI = (this._ripI + 1) % 12;
  }

  // wading and swimming leave rings behind the player
  emitPlayer(dt, p) {
    if (!p || !p.alive || p.inVehicle) return;
    const w = this.world;
    const wl = w.waterLevelAt(p.pos.x, p.pos.z);
    const depth = wl - w.getHeight(p.pos.x, p.pos.z);
    if (depth < 0.15 || p.pos.y > wl + 0.3) return;
    this._wadeT -= dt;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (this._wadeT <= 0) {
      this._wadeT = sp > 0.5 ? Math.max(0.22, 0.6 - sp * 0.06) : 1.4;
      this.addRipple(p.pos.x, p.pos.z, sp > 0.5 ? 0.55 + Math.min(0.6, sp * 0.08) : 0.25);
    }
  }

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
