// Vegetation & rock scattering with near (detailed) / far (impostor-like) instanced LODs,
// wind animation, harvesting and collision data.
import * as THREE from 'three';
import { WORLD, ISLANDS, RUINS, VOLCANO } from './design.js';
import { mulberry32, hash2, smoothstep } from '../core/noise.js';
import { U, GLSL_WIND, addCompileHook, patchSunVisibility } from '../render/common.js';
import { foliageTexture, barkTextures, detailNormalTexture, noiseTexture } from '../render/textures.js';
import * as P from './plants.js';

const S = WORLD.N + 1;
const GRID_CELL = 32;
const GRID_N = WORLD.SIZE / GRID_CELL; // 256
const SUPER = 1024;
const SUPER_N = WORLD.SIZE / SUPER;

// Type registry
const TYPES = [
  { id: 'conifer', build: P.buildConifer, variants: 3, scale: [0.75, 1.45], near: true, far: true, collide: 0.5, yields: { wood: 6, fiber: 1 }, hits: 5, tree: true, sink: 0.4 },
  { id: 'araucaria', build: P.buildAraucaria, variants: 2, scale: [0.8, 1.3], near: true, far: true, collide: 0.75, yields: { wood: 8 }, hits: 6, tree: true, sink: 0.4 },
  { id: 'broadleaf', build: P.buildBroadleaf, variants: 3, scale: [0.8, 1.35], near: true, far: true, collide: 1.0, yields: { wood: 8, fiber: 2 }, hits: 6, tree: true, sink: 0.5 },
  { id: 'palm', build: P.buildPalm, variants: 3, scale: [0.8, 1.3], near: true, far: true, collide: 0.35, yields: { wood: 4, fiber: 3 }, hits: 4, tree: true, sink: 0.3 },
  { id: 'treefern', build: P.buildTreeFern, variants: 2, scale: [0.8, 1.4], near: true, far: true, collide: 0.3, yields: { wood: 2, fiber: 4 }, hits: 2, tree: true, sink: 0.2 },
  { id: 'cycad', build: P.buildCycad, variants: 2, scale: [0.7, 1.4], near: true, far: true, collide: 0.5, yields: { fiber: 4, wood: 1 }, hits: 2, sink: 0.1 },
  { id: 'deadtree', build: P.buildDeadTree, variants: 2, scale: [0.8, 1.4], near: true, far: true, collide: 0.35, yields: { wood: 4 }, hits: 3, tree: true, sink: 0.2 },
  { id: 'fern', build: P.buildFern, variants: 3, scale: [0.7, 1.6], near: true, far: false, nearOnly: 110, collide: 0, yields: { fiber: 2 }, hits: 1, sink: 0.05 },
  { id: 'bush', build: (s) => P.buildBush(s, true), variants: 2, scale: [0.8, 1.3], near: true, far: false, nearOnly: 160, collide: 0, yields: { berries: 3, fiber: 1 }, hits: 1, sink: 0.1 },
  { id: 'boulder', rock: true, variants: 4, scale: [1.5, 5.5], near: true, far: true, collide: 0.9, yields: { stone: 4 }, hits: 6, sink: 0.35, tough: true },
  { id: 'stone', rock: true, small: true, variants: 3, scale: [0.25, 0.45], near: true, far: false, nearOnly: 90, collide: 0, yields: { stone: 1 }, hits: 1, sink: 0.05 },
  { id: 'flint', rock: true, small: true, flint: true, variants: 2, scale: [0.22, 0.35], near: true, far: false, nearOnly: 90, collide: 0, yields: { flint: 1 }, hits: 1, sink: 0.05 },
  { id: 'obsidian', rock: true, small: true, obsidian: true, variants: 2, scale: [0.3, 0.55], near: true, far: false, nearOnly: 110, collide: 0, yields: { obsidian: 1 }, hits: 2, sink: 0.05 },
  { id: 'log', build: P.buildLog, variants: 1, scale: [0.8, 1.2], near: true, far: false, nearOnly: 160, collide: 0.6, yields: { wood: 3 }, hits: 2, sink: 0.1, flat: true },
];
export const TYPE_INDEX = Object.fromEntries(TYPES.map((t, i) => [t.id, i]));

export class Vegetation {
  constructor(world, scene, quality) {
    this.world = world;
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);
    this.types = TYPES;
    this.uNear = { value: quality.treeNear };
    this.uNearOnly = { value: 120 };
    this.uFarMax = { value: quality.treeFar };
    this.lastRebuild = new THREE.Vector3(1e9, 0, 1e9);
    this.removed = new Set(); // "type:index"
    this.respawn = []; // [{key, t}]
    this._buildMaterials();
    this._buildGeometries();
    this._scatter();
    this._buildFar();
    this._buildNear();
  }

  // ------------------------------------------------------------------ materials
  _buildMaterials() {
    const fol = foliageTexture();
    const bark = barkTextures();
    const self = this;
    const windPatch = (kind, near) => (shader) => {
      shader.uniforms.uTime = U.uTime;
      shader.uniforms.uWindDir = U.uWindDir;
      shader.uniforms.uWindStrength = U.uWindStrength;
      shader.uniforms.uNear = self.uNear;
      shader.uniforms.uFarMax = self.uFarMax;
      shader.uniforms.uNearOnly = self.uNearOnly;
      shader.uniforms.uPlayerPos = U.uPlayerPos;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
${GLSL_WIND}
uniform float uNear;
uniform float uFarMax;
uniform float uNearOnly;
uniform vec3 uPlayerPos;
varying float vFade;
varying float vInstH;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float iscale = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
    vInstH = fract(sin(dot(ipos.xz, vec2(12.9898, 78.233))) * 43758.5453);
    float d = length(ipos.xz - cameraPosition.xz);
    ${near
      ? `vFade = 1.0 - smoothstep(uNear - 40.0, uNear, d);
         #ifdef NEAR_ONLY
           vFade = 1.0 - smoothstep(uNearOnly * 0.75, uNearOnly, d);
         #endif`
      : `vFade = smoothstep(uNear - 40.0, uNear, d) * (1.0 - smoothstep(uFarMax * 0.85, uFarMax, d));`}
    float hgt = max(position.y, 0.0);
    float flex = ${kind === 'leaf' ? '0.035 * hgt * hgt / 40.0 + 0.012 * hgt' : '0.02 * hgt * hgt / 40.0'};
    vec2 w = windOffset(ipos, 1.0) * flex;
    transformed += transpose(mat3(instanceMatrix)) * vec3(w.x, 0.0, w.y) / max(iscale * iscale, 0.04);
    ${kind === 'leaf' ? `transformed += normal * sin(uTime * 7.0 + position.x * 3.0 + position.z * 2.0 + vInstH * 20.0) * 0.06 * uWindStrength * min(hgt, 3.0) / max(iscale,0.3);` : ''}
    // bend away from the player (small plants)
    #ifdef NEAR_ONLY
      vec2 toP = ipos.xz - uPlayerPos.xz;
      float pd = length(toP);
      vec2 push = (toP / max(pd, 0.01)) * smoothstep(1.6, 0.2, pd) * hgt * 0.5;
      transformed += transpose(mat3(instanceMatrix)) * vec3(push.x, 0.0, push.y) / max(iscale * iscale, 0.09);
    #endif
  }`)
        .replace('#include <project_vertex>', `
  #include <project_vertex>
  if (vFade <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vFade;
varying float vInstH;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.0,8.0,2.0,10.0,12.0,4.0,14.0,6.0,3.0,11.0,1.0,9.0,15.0,7.0,13.0,5.0);
  return (m[i] + 0.5) / 16.0;
}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vFade < 0.999 && vFade <= bayer4(gl_FragCoord.xy)) discard;`);
      if (kind === 'leaf') {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb *= 0.82 + vInstH * 0.36;
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.12, 1.0, 0.75), step(0.82, vInstH));`)
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  #if NUM_DIR_LIGHTS > 0
  {
    // fake translucency: light shining through leaves
    vec3 Vw = normalize(cameraPosition - vWorldPos);
    float tr = pow(max(dot(-Vw, uSunDir), 0.0), 3.0);
    reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * tr * 0.35 * sunVis;
  }
  #endif`);
      }
    };

    const mk = (params, kind, near, opts = {}) => {
      const m = new THREE.MeshStandardMaterial(params);
      const ts = near ? false : 'vertex';
      addCompileHook(m, (shader) => {
        windPatch(kind, near)(shader);
        patchSunVisibility(shader, { terrainShadow: opts.terrainShadow ?? ts, cloudShadow: true });
      }, `veg-${kind}-${near}-${opts.nearOnly ? 1 : 0}-${opts.terrainShadow ?? ts}`);
      if (opts.nearOnly) m.defines = { ...(m.defines || {}), NEAR_ONLY: '' };
      return m;
    };
    this.mats = {
      leaf: mk({ map: fol, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 }, 'leaf', true, { terrainShadow: 'vertex' }),
      leafSmall: mk({ map: fol, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }, 'leaf', true, { nearOnly: true, terrainShadow: 'vertex' }),
      bark: mk({ map: bark.map, normalMap: bark.normal, color: 0x7a6650, roughness: 0.95 }, 'bark', true, { terrainShadow: 'vertex' }),
      barkSmall: mk({ map: bark.map, normalMap: bark.normal, color: 0x6d5a45, roughness: 0.95 }, 'bark', true, { nearOnly: true, terrainShadow: 'vertex' }),
      berry: mk({ vertexColors: true, roughness: 0.35 }, 'bark', true, { nearOnly: true }),
      far: mk({ vertexColors: true, roughness: 0.95, flatShading: false }, 'leaf', false),
      rock: this._rockMaterial(false),
      rockFar: this._rockMaterial(true),
      rockSmall: this._rockMaterial(false, true),
    };
    // depth materials with wind + alpha test for proper leaf shadows
    const depthMat = (alpha) => {
      const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: alpha ? fol : null, alphaTest: alpha ? 0.42 : 0 });
      d.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = U.uTime;
        shader.uniforms.uWindDir = U.uWindDir;
        shader.uniforms.uWindStrength = U.uWindStrength;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${GLSL_WIND}`).replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float iscale = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
            float hgt = max(position.y, 0.0);
            vec2 w = windOffset(ipos, 1.0) * (0.035 * hgt * hgt / 40.0 + 0.012 * hgt);
            transformed += transpose(mat3(instanceMatrix)) * vec3(w.x, 0.0, w.y) / max(iscale * iscale, 0.04);
          }`);
      };
      d.customProgramCacheKey = () => 'vegdepth' + (alpha ? 1 : 0);
      return d;
    };
    this.depthLeaf = depthMat(true);
    this.depthBark = depthMat(false);
  }

  _rockMaterial(far, small = false) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, vertexColors: false });
    const det = detailNormalTexture();
    const noise = noiseTexture();
    addCompileHook(m, (shader) => {
      shader.uniforms.uDetailN = { value: det };
      shader.uniforms.uNoiseTex = { value: noise };
      shader.uniforms.uSnowCover = U.uSnowCover;
      shader.uniforms.uNear = this.uNear;
      shader.uniforms.uFarMax = this.uFarMax;
      shader.uniforms.uNearOnly = this.uNearOnly;
      patchSunVisibility(shader, { terrainShadow: 'vertex', cloudShadow: true });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 aTint;
varying vec3 vTint;
varying vec3 vNW;
varying float vFade;
uniform float uNear; uniform float uFarMax; uniform float uNearOnly;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  vTint = aTint;
  vNW = normalize(mat3(instanceMatrix) * objectNormal);
  {
    vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float d = length(ipos.xz - cameraPosition.xz);
    ${far ? 'vFade = smoothstep(uNear - 40.0, uNear, d) * (1.0 - smoothstep(uFarMax * 0.85, uFarMax, d));'
    : small ? 'vFade = 1.0 - smoothstep(uNearOnly * 0.7, uNearOnly * 0.95, d);' : 'vFade = 1.0 - smoothstep(uNear - 40.0, uNear, d);'}
  }`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  if (vFade <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vTint;
varying vec3 vNW;
varying float vFade;
uniform sampler2D uDetailN;
uniform sampler2D uNoiseTex;
uniform float uSnowCover;
float bayer4r(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.0,8.0,2.0,10.0,12.0,4.0,14.0,6.0,3.0,11.0,1.0,9.0,15.0,7.0,13.0,5.0);
  return (m[i] + 0.5) / 16.0;
}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vFade < 0.999 && vFade <= bayer4r(gl_FragCoord.xy)) discard;`)
        .replace('#include <map_fragment>', `
  vec3 nw = normalize(vNW);
  vec4 nz = texture2D(uNoiseTex, vWorldPos.xz * 0.15 + vWorldPos.y * 0.07);
  vec3 rc = vTint * (0.7 + nz.r * 0.5);
  float moss = smoothstep(0.55, 0.9, nw.y) * smoothstep(0.35, 0.7, nz.g) * step(vTint.r, 0.5) * step(vWorldPos.y, 500.0);
  rc = mix(rc, vec3(0.12, 0.2, 0.06), moss * 0.8);
  float snow = smoothstep(530.0 - uSnowCover * 220.0, 600.0 - uSnowCover * 220.0, vWorldPos.y) * smoothstep(0.3, 0.7, nw.y);
  rc = mix(rc, vec3(0.88, 0.91, 0.96), snow);
  diffuseColor.rgb *= rc;`)
        .replace('#include <normal_fragment_maps>', `
  {
    vec3 bl = pow(abs(nw), vec3(4.0)); bl /= dot(bl, vec3(1.0));
    vec2 a = texture2D(uDetailN, vWorldPos.zy * 0.35).xy * 2.0 - 1.0;
    vec2 b = texture2D(uDetailN, vWorldPos.xz * 0.35).xy * 2.0 - 1.0;
    vec2 c = texture2D(uDetailN, vWorldPos.xy * 0.35).xy * 2.0 - 1.0;
    vec3 wn = normalize(nw + (vec3(0.0, a.y, a.x) * bl.x + vec3(b.x, 0.0, b.y) * bl.y + vec3(c.x, c.y, 0.0) * bl.z) * 0.9);
    normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  }`);
    }, 'rock' + (far ? 'far' : small ? 'small' : 'near'));
    return m;
  }

  // ------------------------------------------------------------------ geometry
  _buildGeometries() {
    this.geo = [];
    for (let ti = 0; ti < TYPES.length; ti++) {
      const T = TYPES[ti];
      const vars = [];
      for (let v = 0; v < T.variants; v++) {
        const seed = ti * 1000 + v * 17 + 1;
        if (T.rock) {
          const near = P.buildRock(seed, T.small ? 1 : 3, 1, T.small ? 0.65 : 0.75, 0.9);
          const far = T.small ? null : P.buildRock(seed, 1, 1, 0.75, 0.9);
          vars.push({ parts: [{ kind: 'rock', geo: near }], far, height: 1, radius: 1 });
        } else {
          vars.push(T.build(seed));
        }
      }
      this.geo.push(vars);
    }
  }

  // ------------------------------------------------------------------ placement
  _scatter() {
    const w = this.world;
    const H = w.heights, M = w.masks;
    const noise = w.gen.noise;
    const rnd = mulberry32(9137);
    const lists = TYPES.map(() => []);
    const SP = 6; // candidate spacing (m)
    const n = Math.floor(WORLD.SIZE / SP);
    const pads = w.pads;
    const nearRuin = (x, z) => {
      for (const p of pads) if (Math.abs(x - p.x) < p.r * 1.5 && Math.abs(z - p.z) < p.r * 1.5) return true;
      return false;
    };
    const add = (type, x, z, y, extra = 0) => {
      const ti = TYPE_INDEX[type];
      const T = TYPES[ti];
      const sc = T.scale[0] + (T.scale[1] - T.scale[0]) * Math.pow(rnd(), 1.5) + extra;
      lists[ti].push([x, y - T.sink * sc, z, rnd() * Math.PI * 2, sc, Math.floor(rnd() * T.variants)]);
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -WORLD.HALF + (i + rnd()) * SP;
        const z = -WORLD.HALF + (j + rnd()) * SP;
        if (Math.abs(x) > WORLD.HALF - 20 || Math.abs(z) > WORLD.HALF - 20) continue;
        const gi = Math.round((x + WORLD.HALF) / WORLD.CELL), gj = Math.round((z + WORLD.HALF) / WORLD.CELL);
        const k = gj * S + gi;
        const h = H[k];
        if (h < 0.6) continue;
        const wl = w.waters[k];
        if (wl > -9000 && h < wl + 0.4) continue;
        // slope
        const hx = H[k + 1] - H[k - 1], hz = H[k + S] - H[k - S];
        const slope = Math.hypot(hx, hz) / (2 * WORLD.CELL);
        const moist = M[k * 4] / 255, canyon = M[k * 4 + 1] / 255, volc = M[k * 4 + 2] / 255, wet = M[k * 4 + 3] / 255;
        const r = rnd();
        if (nearRuin(x, z)) { if (r < 0.02) add('fern', x, z, h); continue; }
        const grove = noise.noise2(x * 0.004, z * 0.004) * 0.5 + 0.5;
        const grove2 = noise.noise2(x * 0.0018 + 50, z * 0.0018) * 0.5 + 0.5;
        const snow = 560 + noise.noise2(x * 0.004, z * 0.004) * 45;
        let island = false;
        for (const I of ISLANDS) if (Math.hypot(x - I.x, z - I.z) < I.r * 1.1) { island = true; break; }

        if (slope > 1.1) { // cliffs
          if (r < 0.006) add('boulder', x, z, h);
          continue;
        }
        if (volc > 0.5) {
          if (h > 650) continue;
          if (r < 0.006) add('boulder', x, z, h);
          else if (r < 0.009) add('deadtree', x, z, h);
          else if (r < 0.013 && volc > 0.7) add('obsidian', x, z, h);
          else if (r < 0.016 && volc < 0.7) add('cycad', x, z, h);
          continue;
        }
        if (h > snow) {
          if (r < 0.006 && slope < 0.9) add('boulder', x, z, h);
          continue;
        }
        if (h < 2.6 && !island && h < 3 + wet) { // beach
          if (r < 0.012 && h > 1.0) add('palm', x, z, h);
          else if (r < 0.016) add('stone', x, z, h);
          else if (r < 0.019) add('log', x, z, h);
          continue;
        }
        if (island) {
          if (r < 0.06 * (h > 1.2 ? 1 : 0)) add('palm', x, z, h);
          else if (r < 0.085) add('cycad', x, z, h);
          else if (r < 0.2) add('fern', x, z, h);
          else if (r < 0.22) add('bush', x, z, h);
          else if (r < 0.23) add('stone', x, z, h);
          continue;
        }
        if (canyon > 0.45) {
          if (r < 0.006) add('boulder', x, z, h);
          else if (r < 0.009) add('cycad', x, z, h);
          else if (r < 0.011) add('deadtree', x, z, h);
          else if (r < 0.02) add('flint', x, z, h);
          else if (r < 0.03) add('stone', x, z, h);
          continue;
        }
        if (h > 260) { // mountain forest
          const alpine = smoothstep(380, snow, h);
          const d = 0.11 * smoothstep(0.25, 0.6, grove2) * (1 - alpine * 0.8) * (1 - smoothstep(0.6, 1.0, slope));
          if (r < d) add('conifer', x, z, h);
          else if (r < d + 0.008 * (1 - alpine)) add('araucaria', x, z, h);
          else if (r < d + 0.02) add('boulder', x, z, h, 0.5);
          else if (r < d + 0.06 * (1 - alpine)) add('fern', x, z, h);
          else if (r < d + 0.075) add('stone', x, z, h);
          else if (r < d + 0.078) add('log', x, z, h);
          continue;
        }
        if (moist > 0.66) { // jungle
          const d = 0.11 * (0.55 + grove * 0.6);
          if (r < d) add('broadleaf', x, z, h);
          else if (r < d + 0.05) add('treefern', x, z, h);
          else if (r < d + 0.065) add('palm', x, z, h);
          else if (r < d + 0.09) add('cycad', x, z, h);
          else if (r < d + 0.55) add('fern', x, z, h);
          else if (r < d + 0.57) add('bush', x, z, h);
          else if (r < d + 0.575) add('log', x, z, h);
          else if (r < d + 0.585) add('stone', x, z, h);
          continue;
        }
        // grassland / savanna
        {
          const g = smoothstep(0.62, 0.85, grove);
          const nearWater = wet > 0.4;
          const d = 0.0015 + 0.075 * g;
          if (r < d * 0.2) add('araucaria', x, z, h);
          else if (r < d) add('broadleaf', x, z, h);
          else if (r < d + 0.006 + (nearWater ? 0.02 : 0)) add(nearWater ? 'treefern' : 'cycad', x, z, h);
          else if (r < d + 0.012) add('cycad', x, z, h);
          else if (r < d + 0.016) add('boulder', x, z, h);
          else if (r < d + 0.03 + g * 0.1) add('fern', x, z, h);
          else if (r < d + 0.036) add('bush', x, z, h);
          else if (r < d + 0.044) add('stone', x, z, h);
          else if (r < d + 0.047 && nearWater) add('flint', x, z, h);
          else if (r < d + 0.0485) add('log', x, z, h);
        }
      }
    }
    // pack into typed arrays
    this.inst = lists.map((l) => {
      // shuffle so a prefix is a random subset (distance thinning)
      for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = l[i]; l[i] = l[j]; l[j] = t;
      }
      const a = new Float32Array(l.length * 6);
      l.forEach((v, i) => a.set(v, i * 6));
      return { data: a, count: l.length, alive: new Uint8Array(l.length).fill(1), hits: new Uint8Array(l.length) };
    });
    // spatial grid (CSR)
    const counts = new Uint32Array(GRID_N * GRID_N + 1);
    const cellOf = (x, z) => {
      const cx = Math.min(GRID_N - 1, Math.max(0, Math.floor((x + WORLD.HALF) / GRID_CELL)));
      const cz = Math.min(GRID_N - 1, Math.max(0, Math.floor((z + WORLD.HALF) / GRID_CELL)));
      return cz * GRID_N + cx;
    };
    this.inst.forEach((I) => {
      for (let i = 0; i < I.count; i++) counts[cellOf(I.data[i * 6], I.data[i * 6 + 2]) + 1]++;
    });
    for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
    const fill = counts.slice();
    const total = counts[counts.length - 1];
    const refs = new Uint32Array(total * 2);
    this.inst.forEach((I, ti) => {
      for (let i = 0; i < I.count; i++) {
        const c = cellOf(I.data[i * 6], I.data[i * 6 + 2]);
        const p = fill[c]++;
        refs[p * 2] = ti;
        refs[p * 2 + 1] = i;
      }
    });
    this.gridStart = counts;
    this.gridRefs = refs;
    this.cellOf = cellOf;
    let summary = TYPES.map((t, i) => `${t.id}:${this.inst[i].count}`).join(' ');
    console.log('[vegetation]', summary);
  }

  // iterate instances in a radius: cb(typeIndex, index, x, y, z, scale)
  forEachNear(x, z, radius, cb) {
    const c0x = Math.max(0, Math.floor((x - radius + WORLD.HALF) / GRID_CELL));
    const c1x = Math.min(GRID_N - 1, Math.floor((x + radius + WORLD.HALF) / GRID_CELL));
    const c0z = Math.max(0, Math.floor((z - radius + WORLD.HALF) / GRID_CELL));
    const c1z = Math.min(GRID_N - 1, Math.floor((z + radius + WORLD.HALF) / GRID_CELL));
    const r2 = radius * radius;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const c = cz * GRID_N + cx;
        for (let p = this.gridStart[c]; p < this.gridStart[c + 1]; p++) {
          const ti = this.gridRefs[p * 2], i = this.gridRefs[p * 2 + 1];
          const I = this.inst[ti];
          if (!I.alive[i]) continue;
          const d = I.data;
          const dx = d[i * 6] - x, dz = d[i * 6 + 2] - z;
          if (dx * dx + dz * dz > r2) continue;
          if (cb(ti, i, d[i * 6], d[i * 6 + 1], d[i * 6 + 2], d[i * 6 + 4]) === false) return;
        }
      }
    }
  }

  // ------------------------------------------------------------------ far LOD
  _buildFar() {
    this.farMeshes = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let ti = 0; ti < TYPES.length; ti++) {
      const T = TYPES[ti];
      if (!T.far) continue;
      const I = this.inst[ti];
      // bucket by superchunk and variant
      const buckets = new Map();
      for (let i = 0; i < I.count; i++) {
        const d = I.data;
        const sx = Math.floor((d[i * 6] + WORLD.HALF) / SUPER), sz = Math.floor((d[i * 6 + 2] + WORLD.HALF) / SUPER);
        const key = (sz * SUPER_N + sx) * 8 + d[i * 6 + 5];
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = []));
        b.push(i);
      }
      I.farRef = new Int32Array(I.count * 2).fill(-1);
      for (const [key, list] of buckets) {
        const variant = key % 8;
        const vg = this.geo[ti][variant];
        const geo = vg.far;
        if (!geo) continue;
        const mat = T.rock ? this.mats.rockFar : this.mats.far;
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        if (T.rock) this._rockTints(mesh, list, ti);
        const meshIdx = this.farMeshes.length;
        list.forEach((i, n) => {
          const d = I.data;
          p.set(d[i * 6], d[i * 6 + 1], d[i * 6 + 2]);
          q.setFromAxisAngle(up, d[i * 6 + 3]);
          const sc = d[i * 6 + 4];
          s.set(sc, sc, sc);
          m.compose(p, q, s);
          mesh.setMatrixAt(n, m);
          I.farRef[i * 2] = meshIdx;
          I.farRef[i * 2 + 1] = n;
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.matrixAutoUpdate = false;
        const sk = Math.floor(key / 8);
        mesh.userData.center = new THREE.Vector2(((sk % SUPER_N) + 0.5) * SUPER - WORLD.HALF, (Math.floor(sk / SUPER_N) + 0.5) * SUPER - WORLD.HALF);
        mesh.userData.full = list.length;
        this.farMeshes.push(mesh);
        this.group.add(mesh);
      }
    }
  }

  _rockTints(mesh, list, ti) {
    const T = TYPES[ti];
    const tint = new Float32Array(list.length * 3);
    const w = this.world;
    const mm = {};
    list.forEach((i, n) => {
      const d = this.inst[ti].data;
      w.mask(d[i * 6], d[i * 6 + 2], mm);
      let c = [0.42, 0.4, 0.37];
      if (mm.canyon > 0.4) c = [0.62, 0.36, 0.22];
      if (mm.volc > 0.5) c = [0.12, 0.11, 0.1];
      if (T.flint) c = [0.16, 0.16, 0.18];
      if (T.obsidian) c = [0.03, 0.03, 0.04];
      const v = 0.85 + hash2(i, ti) * 0.3;
      tint.set([c[0] * v, c[1] * v, c[2] * v], n * 3);
    });
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  }

  // ------------------------------------------------------------------ near LOD
  _buildNear() {
    this.nearSets = [];
    for (let ti = 0; ti < TYPES.length; ti++) {
      const T = TYPES[ti];
      const vars = this.geo[ti];
      vars.forEach((vg, variant) => {
        vg.parts.forEach((part) => {
          let mat;
          const small = !!T.nearOnly;
          if (part.kind === 'leaf') mat = small ? this.mats.leafSmall : this.mats.leaf;
          else if (part.kind === 'bark') mat = small ? this.mats.barkSmall : this.mats.bark;
          else if (part.kind === 'berry') mat = this.mats.berry;
          else if (part.kind === 'rock') mat = T.small ? this.mats.rockSmall : this.mats.rock;
          const cap = T.nearOnly ? 3500 : 2500;
          let geo = part.geo;
          if (part.kind === 'rock') {
            geo = geo.clone();
            geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
          }
          const mesh = new THREE.InstancedMesh(geo, mat, cap);
          mesh.count = 0;
          mesh.frustumCulled = false;
          mesh.castShadow = !T.small && T.id !== 'fern';
          mesh.receiveShadow = true;
          if (part.kind === 'leaf') mesh.customDepthMaterial = this.depthLeaf;
          else mesh.customDepthMaterial = this.depthBark;
          this.group.add(mesh);
          this.nearSets.push({ ti, variant, mesh, kind: part.kind, cap });
        });
      });
    }
  }

  _rebuildNear(cx, cz) {
    const R = Math.max(this.uNear.value, 170) + 30;
    const byKey = new Map();
    for (const ns of this.nearSets) {
      ns.mesh.count = 0;
      const k = ns.ti * 8 + ns.variant;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(ns);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const mm = {};
    this.forEachNear(cx, cz, R, (ti, i, x, y, z, sc) => {
      const T = TYPES[ti];
      if (T.nearOnly) {
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > (T.nearOnly + 30) ** 2) return;
      }
      const d = this.inst[ti].data;
      const sets = byKey.get(ti * 8 + d[i * 6 + 5]);
      if (!sets) return;
      p.set(x, y, z);
      q.setFromAxisAngle(up, d[i * 6 + 3]);
      if (T.flat) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (hash2(i, 3) - 0.5) * 0.1));
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      for (const ns of sets) {
        if (ns.mesh.count >= ns.cap) continue;
        ns.mesh.setMatrixAt(ns.mesh.count, m);
        if (ns.kind === 'rock') {
          let c = [0.42, 0.4, 0.37];
          this.world.mask(x, z, mm);
          if (mm.canyon > 0.4) c = [0.62, 0.36, 0.22];
          if (mm.volc > 0.5) c = [0.12, 0.11, 0.1];
          if (T.flint) c = [0.2, 0.2, 0.23];
          if (T.obsidian) c = [0.025, 0.025, 0.035];
          const v = 0.85 + hash2(i, ti) * 0.3;
          ns.mesh.geometry.attributes.aTint.setXYZ(ns.mesh.count, c[0] * v, c[1] * v, c[2] * v);
        }
        ns.mesh.count++;
      }
    });
    for (const ns of this.nearSets) {
      ns.mesh.instanceMatrix.needsUpdate = true;
      ns.mesh.instanceMatrix.clearUpdateRanges();
      if (ns.kind === 'rock') ns.mesh.geometry.attributes.aTint.needsUpdate = true;
    }
  }

  update(camPos, dt, gameTime) {
    this.uNear.value = this.quality.treeNear;
    this.uFarMax.value = this.quality.treeFar;
    const dx = camPos.x - this.lastRebuild.x, dz = camPos.z - this.lastRebuild.z;
    if (dx * dx + dz * dz > 20 * 20 || this._dirty) {
      this._dirty = false;
      this.lastRebuild.copy(camPos);
      this._rebuildNear(camPos.x, camPos.z);
    }
    // thin far super-chunks with distance
    for (const fm of this.farMeshes) {
      const c = fm.userData.center;
      const d = Math.hypot(c.x - camPos.x, c.y - camPos.z);
      const f = d < 1800 ? 1 : d < 3000 ? 0.5 : 0.25;
      fm.count = Math.max(1, Math.floor(fm.userData.full * f * this.quality.farDensity));
      fm.visible = d < this.quality.treeFar + SUPER * 0.75;
    }
    // respawn harvested small things
    if (this.respawn.length && gameTime > this.respawn[0].t) {
      const r = this.respawn.shift();
      this._setAlive(r.ti, r.i, true);
    }
  }

  _setAlive(ti, i, alive) {
    const I = this.inst[ti];
    I.alive[i] = alive ? 1 : 0;
    I.hits[i] = 0;
    if (I.farRef && I.farRef[i * 2] >= 0) {
      const fm = this.farMeshes[I.farRef[i * 2]];
      const n = I.farRef[i * 2 + 1];
      const m = new THREE.Matrix4();
      if (alive) {
        const d = I.data;
        const sc = d[i * 6 + 4];
        m.compose(new THREE.Vector3(d[i * 6], d[i * 6 + 1], d[i * 6 + 2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d[i * 6 + 3]), new THREE.Vector3(sc, sc, sc));
      } else m.makeScale(0, 0, 0);
      fm.setMatrixAt(n, m);
      fm.instanceMatrix.needsUpdate = true;
    }
    this._dirty = true;
  }

  // Harvest: returns { done, yields, type } ; `power` = tool strength
  hit(ti, i, power, gameTime) {
    const T = TYPES[ti];
    const I = this.inst[ti];
    if (!I.alive[i]) return null;
    I.hits[i] += power;
    const need = T.hits;
    if (I.hits[i] >= need) {
      this._setAlive(ti, i, false);
      this.respawn.push({ ti, i, t: gameTime + (T.nearOnly ? 240 : 900) });
      this.respawn.sort((a, b) => a.t - b.t);
      const sc = I.data[i * 6 + 4];
      const yields = {};
      for (const [k, v] of Object.entries(T.yields)) yields[k] = Math.max(1, Math.round(v * (T.tree || T.rock ? Math.min(2, sc) : 1)));
      return { done: true, yields, type: T };
    }
    return { done: false, progress: I.hits[i] / need, type: T };
  }

  // nearest harvestable in front of the player
  pick(origin, dir, maxDist = 3.6) {
    let best = null, bestScore = 1e9;
    this.forEachNear(origin.x, origin.z, maxDist + 6, (ti, i, x, y, z, sc) => {
      const T = TYPES[ti];
      const r = T.rock ? (T.small ? 0.4 : 1.1 * sc) : T.tree ? T.collide * sc + 0.4 : 0.9 * sc;
      const cy = T.tree ? Math.min(origin.y, y + 6 * sc) : y + (T.rock ? 0.4 * sc : 0.5);
      const dx = x - origin.x, dy = cy - origin.y, dz = z - origin.z;
      const along = dx * dir.x + dy * dir.y + dz * dir.z;
      if (along < -0.5) return;
      const px = origin.x + dir.x * along - x, py = origin.y + dir.y * along - cy, pz = origin.z + dir.z * along - z;
      const perp = Math.sqrt(px * px + (T.tree ? 0 : py * py) + pz * pz);
      const horiz = Math.hypot(dx, dz) - r;
      if (horiz > maxDist) return;
      if (perp > r + 0.6) return;
      const score = horiz + perp * 0.5;
      if (score < bestScore) { bestScore = score; best = { ti, i, type: T, x, y, z, scale: sc }; }
    });
    return best;
  }

  // circle colliders near a point
  colliders(x, z, radius, out) {
    out.length = 0;
    this.forEachNear(x, z, radius + 3, (ti, i, cx, cy, cz, sc) => {
      const T = TYPES[ti];
      if (!T.collide) return;
      const r = T.rock ? T.collide * sc * 0.9 : T.collide * sc;
      out.push({ x: cx, z: cz, r, top: T.rock ? cy + 0.6 * sc : cy + 1e4, y: cy });
    });
    return out;
  }

  // a tall tree near a position (for browsing sauropods)
  findTallTree(x, z, radius) {
    let best = null, bd = 1e9;
    this.forEachNear(x, z, radius, (ti, i, cx, cy, cz, sc) => {
      const T = TYPES[ti];
      if (!(T.id === 'araucaria' || T.id === 'broadleaf' || T.id === 'conifer')) return;
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) { bd = d; best = { x: cx, y: cy, z: cz, h: this.geo[ti][0].height * sc }; }
    });
    return best;
  }
}

export { TYPES };
