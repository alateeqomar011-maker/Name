// GPU-placed grass & wildflowers: instanced clumps positioned around the camera, sampled from the heightfield.
import * as THREE from 'three';
import { U, GLSL_WIND, addCompileHook, patchSunVisibility } from '../render/common.js';

function bladeClump(blades, segs, width, flowers) {
  const pos = [], uv = [], part = [], idx = [];
  const rnd = Math.random;
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI;
    const r = Math.sqrt(rnd()) * 0.32;
    const ra = rnd() * Math.PI * 2;
    const ox = Math.cos(ra) * r, oz = Math.sin(ra) * r;
    const lean = (rnd() - 0.5) * 0.7;
    const la = rnd() * Math.PI * 2;
    const w = width * (0.7 + rnd() * 0.6);
    const hs = 0.6 + rnd() * 0.55;
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ww = w * (1 - Math.pow(t, 1.4) * 0.95);
      const cx = Math.cos(a), cz = Math.sin(a);
      const bend = lean * t * t;
      for (const side of [-1, 1]) {
        pos.push(ox + cx * ww * side + Math.cos(la) * bend, t * hs, oz + cz * ww * side + Math.sin(la) * bend);
        uv.push(side < 0 ? 0 : 1, t);
        part.push(0);
      }
    }
    for (let s = 0; s < segs; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  for (let f = 0; f < flowers; f++) {
    const ox = (rnd() - 0.5) * 0.4, oz = (rnd() - 0.5) * 0.4;
    const hy = 0.8 + rnd() * 0.3;
    const sb = pos.length / 3;
    for (let s = 0; s <= 2; s++) {
      const t = s / 2;
      for (const side of [-1, 1]) {
        pos.push(ox + side * 0.008, t * hy, oz);
        uv.push(side < 0 ? 0 : 1, t);
        part.push(0);
      }
    }
    for (let s = 0; s < 2; s++) { const i = sb + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    const c = pos.length / 3;
    const R = 0.05 + rnd() * 0.03;
    pos.push(ox, hy + 0.01, oz); uv.push(0.5, 1); part.push(2);
    const n = 10;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const rr = R * (k % 2 ? 0.75 : 1);
      pos.push(ox + Math.cos(ang) * rr, hy + Math.sin(ang) * rr * 0.35, oz + Math.sin(ang) * rr);
      uv.push(0.5, 1); part.push(1);
    }
    for (let k = 0; k < n; k++) idx.push(c, c + 1 + k, c + 1 + ((k + 1) % n));
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

class GrassLayer {
  constructor(scene, { radius, spacing, inner, bladeScale, blades, segs, width, flowers = 0, flowerLayer = false }) {
    const n = Math.ceil((radius * 2) / spacing);
    const geo = bladeClump(blades, segs, width, flowers);
    const grid = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i - n / 2, z = j - n / 2;
      const d = Math.hypot(x, z) * spacing;
      if (d > radius + spacing || d < inner - spacing * 2) continue;
      grid.push(x, z);
    }
    geo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(new Float32Array(grid), 2));
    geo.instanceCount = grid.length / 2;
    this.count = geo.instanceCount;
    this.uniforms = {
      uSpacing: { value: spacing },
      uRadius: { value: radius },
      uInner: { value: inner },
      uBladeScale: { value: bladeScale },
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
    addCompileHook(mat, (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.uniforms.uMaskTex = U.uMaskTex;
      shader.uniforms.uNoiseTex = U.uNoiseTex;
      shader.uniforms.uTime = U.uTime;
      shader.uniforms.uWindDir = U.uWindDir;
      shader.uniforms.uWindStrength = U.uWindStrength;
      shader.uniforms.uPlayerPos = U.uPlayerPos;
      shader.uniforms.uSnowCover = U.uSnowCover;
      patchSunVisibility(shader, { terrainShadow: 'vertex', cloudShadow: true });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
${GLSL_WIND}
uniform sampler2D uMaskTex;
uniform sampler2D uNoiseTex;
uniform float uSpacing, uRadius, uInner, uBladeScale, uSnowCover;
uniform vec3 uPlayerPos;
attribute vec2 aGrid;
attribute float aPart;
varying vec3 vGrassCol;
varying float vTip;
varying float vPart;
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
  vec2 cell = floor(cameraPosition.xz / uSpacing) + aGrid;
  vec2 h2 = hash22(cell);
  vec2 h3 = hash22(cell + 17.3);
  vec2 wxz = (cell + h2) * uSpacing;
  float dist = length(wxz - cameraPosition.xz);
  vec2 huv = gridUV(wxz);
  vec2 hw = texture2D(uHeightTex, huv).rg;
  vec4 m = texture2D(uMaskTex, huv);
  float h = hw.r;
  float e = 4.0;
  float hx = terrainHeight(wxz + vec2(e, 0.0)) - terrainHeight(wxz - vec2(e, 0.0));
  float hz = terrainHeight(wxz + vec2(0.0, e)) - terrainHeight(wxz - vec2(0.0, e));
  float slope = length(vec2(hx, hz)) / (2.0 * e);
  vec4 pn = texture2D(uNoiseTex, wxz * 0.0035);
  vec4 pn2 = texture2D(uNoiseTex, wxz * 0.021);
  float dens = step(hw.g + 0.3, h);
  dens *= smoothstep(2.2, 3.6, h);
  dens *= 1.0 - smoothstep(0.55, 0.85, slope);
  dens *= 1.0 - smoothstep(0.35, 0.65, m.g) * 0.85;
  dens *= 1.0 - smoothstep(0.25, 0.55, m.b);
  dens *= 1.0 - smoothstep(470.0 - uSnowCover * 200.0, 540.0 - uSnowCover * 200.0, h);
  dens *= 1.0 - smoothstep(0.72, 0.9, m.r) * 0.45;
  ${flowerLayer ? 'dens *= smoothstep(0.38, 0.62, pn.g * 0.7 + pn2.r * 0.5) * (1.0 - smoothstep(0.75, 0.9, m.r)) * smoothstep(280.0, 200.0, h);' : ''}
  float fade = (1.0 - smoothstep(uRadius * 0.72, uRadius, dist)) * smoothstep(uInner - 4.0, uInner + 4.0, dist);
  float keep = step(h3.x, dens) * fade;
  float lush = clamp(0.55 + m.r * 0.6 + (pn.r - 0.5) * 0.5, 0.0, 1.0);
  float hgt = (0.38 + 0.38 * h2.y) * mix(0.8, 1.2, lush) * mix(0.75, 1.2, pn2.g) * uBladeScale * keep;
  float ang = h3.y * 6.2831;
  float ca = cos(ang), sa = sin(ang);
  vec3 lp = vec3(position.x * ca - position.z * sa, position.y, position.x * sa + position.z * ca);
  lp.xz *= uBladeScale * (0.85 + h2.x * 0.4);
  float t = position.y;
  lp.y *= hgt;
  float gustWave = sin(dot(wxz, uWindDir) * 0.09 - uTime * 2.2 + pn2.b * 3.0) * 0.5 + 0.5;
  vec2 wnd = windOffset(vec3(wxz.x, h, wxz.y), 1.0) * (0.6 + gustWave * 0.9);
  float flutter = sin(uTime * 5.0 + wxz.x * 1.7 + wxz.y * 1.3 + position.x * 20.0) * 0.06 * uWindStrength;
  lp.xz += (wnd + flutter) * t * t * hgt;
  lp.y -= length(wnd) * t * t * hgt * 0.25;
  vec2 toP = wxz - uPlayerPos.xz;
  float pd = length(toP);
  float push = smoothstep(1.3, 0.1, pd) * step(abs(uPlayerPos.y - h), 2.5);
  lp.xz += (toP / max(pd, 0.01)) * push * t * 0.55 * hgt;
  lp.y *= 1.0 - push * 0.45;
  vec3 transformed = vec3(wxz.x, h - 0.04, wxz.y) + lp;
  vTip = t;
  vPart = aPart;
  vec3 deep = vec3(0.025, 0.09, 0.012);
  vec3 fresh = vec3(0.15, 0.36, 0.03);
  vec3 golden = vec3(0.34, 0.44, 0.05);
  vec3 dry = vec3(0.34, 0.30, 0.11);
  vec3 c = mix(deep, fresh, smoothstep(0.2, 0.8, pn2.r * 0.8 + h2.x * 0.5));
  c = mix(c, golden, smoothstep(0.62, 0.85, pn.b + h3.y * 0.2) * 0.6);
  c = mix(dry, c, smoothstep(0.1, 0.45, lush));
  c = mix(c, vec3(0.5, 0.3, 0.15), smoothstep(0.3, 0.6, m.g) * 0.6);
  c *= 0.85 + gustWave * 0.3 * uWindStrength;
  if (aPart > 0.5) {
    float k = fract(h3.x * 13.7 + h2.y * 7.1);
    vec3 fc = k < 0.72 ? vec3(1.0, 0.72, 0.03) : (k < 0.88 ? vec3(0.95, 0.95, 0.9) : vec3(0.45, 0.2, 0.75));
    c = aPart > 1.5 ? fc * vec3(0.9, 0.6, 0.2) : fc;
  }
  vGrassCol = c;
`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  if (keep <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vGrassCol;
varying float vTip;
varying float vPart;`)
        .replace('#include <map_fragment>', `
  if (vPart > 0.5) diffuseColor.rgb *= vGrassCol;
  else diffuseColor.rgb *= vGrassCol * mix(0.22, 1.2, pow(vTip, 0.9));`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.directSpecular *= 0.35;
  reflectedLight.indirectSpecular *= 0.3;
  #if NUM_DIR_LIGHTS > 0
  {
    vec3 Vw = normalize(cameraPosition - vWorldPos);
    float tr = pow(max(dot(-Vw, uSunDir), 0.0), 2.0) * vTip;
    reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * (tr * 0.45 + 0.12 * vTip) * sunVis;
  }
  #endif`);
    }, 'grass' + blades + segs + flowers + (flowerLayer ? 'f' : ''));
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }
}

export class Grass {
  constructor(scene, quality) {
    const d = quality.grassDensity;
    this.layers = [];
    if (d <= 0) return;
    const R0 = 28 + 22 * d;
    this.layers.push(new GrassLayer(scene, { radius: R0, spacing: 0.42 / Math.sqrt(Math.min(1.5, d + 0.25)), inner: 0, bladeScale: 1, blades: 9, segs: 3, width: 0.022 }));
    this.layers.push(new GrassLayer(scene, { radius: R0 + 90 * d + 40, spacing: 1.15, inner: R0 - 6, bladeScale: 1.7, blades: 10, segs: 2, width: 0.035 }));
    this.layers.push(new GrassLayer(scene, { radius: 50 + 50 * d, spacing: 0.75, inner: 0, bladeScale: 0.62, blades: 0, segs: 2, width: 0.02, flowers: 4, flowerLayer: true }));
  }
}
