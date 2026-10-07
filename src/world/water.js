// Ocean, lakes, river ribbon and waterfalls.
import * as THREE from 'three';
import { WORLD, MIRROR_LAKE, JADE_LAKE } from './design.js';
import { U, GLSL_GRID, addCompileHook, patchSunVisibility } from '../render/common.js';
import { detailNormalTexture, noiseTexture } from '../render/textures.js';

// Gerstner waves (direction xy, steepness, wavelength)
const WAVES = [
  [1.0, 0.25, 0.22, 62],
  [0.7, -0.7, 0.18, 31],
  [-0.3, 0.95, 0.15, 17],
  [0.9, 0.45, 0.12, 9.5],
  [-0.6, -0.8, 0.08, 5.3],
];

const GLSL_WAVES = /* glsl */ `
uniform float uWaveAmp;
vec3 gerstner(vec2 p, float t, out vec3 nrm, float amp) {
  vec3 disp = vec3(0.0);
  vec3 tx = vec3(1.0, 0.0, 0.0), tz = vec3(0.0, 0.0, 1.0);
  ${WAVES.map(([dx, dz, st, wl]) => `{
    vec2 d = normalize(vec2(${dx.toFixed(3)}, ${dz.toFixed(3)}));
    float k = 6.28318 / ${wl.toFixed(2)};
    float c = sqrt(9.81 / k);
    float f = k * (dot(d, p) - c * t);
    float a = ${st.toFixed(3)} / k * amp;
    float sf = sin(f), cf = cos(f);
    disp += vec3(d.x * a * cf, a * sf, d.y * a * cf);
    tx += vec3(-d.x * d.x * ${st.toFixed(3)} * amp * sf, d.x * ${st.toFixed(3)} * amp * cf, -d.x * d.y * ${st.toFixed(3)} * amp * sf);
    tz += vec3(-d.x * d.y * ${st.toFixed(3)} * amp * sf, d.y * ${st.toFixed(3)} * amp * cf, -d.y * d.y * ${st.toFixed(3)} * amp * sf);
  }`).join('\n')}
  nrm = normalize(cross(tz, tx));
  return disp;
}
`;

function makeWaterMaterial(kind) {
  // kind: 'ocean' | 'lake' | 'river'
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.035,
    metalness: 0.0,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  mat.envMapIntensity = 1.0;
  const det = detailNormalTexture();
  const noise = noiseTexture();
  const local = { uWaveAmp: { value: kind === 'ocean' ? 0.4 : kind === 'lake' ? 0.06 : 0.03 } };
  addCompileHook(mat, (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uDetailN = { value: det };
    shader.uniforms.uNoiseTex = { value: noise };
    shader.uniforms.uWaveAmp = local.uWaveAmp;
    shader.uniforms.uWindStrength = U.uWindStrength;
    shader.uniforms.uRain = U.uWetness;
    shader.uniforms.uLightning = U.uLightning;
    patchSunVisibility(shader, { terrainShadow: 'vertex', cloudShadow: true });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uWindStrength;
${GLSL_WAVES}
varying vec3 vWaveN;
varying float vCrest;
varying vec2 vFlowUV;
varying float vSteep;`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`)
      .replace('#include <begin_vertex>', `
  vec3 transformed = vec3(position);
  vec3 wpos0 = (modelMatrix * vec4(position, 1.0)).xyz;
  float camD = length(wpos0.xz - cameraPosition.xz);
  float ampFade = uWaveAmp * (0.55 + uWindStrength * 0.9) * (1.0 - smoothstep(600.0, 2600.0, camD));
  vec3 wn;
  ${kind === 'river' ? `
  vec3 disp = vec3(0.0); wn = vec3(0.0, 1.0, 0.0);
  vFlowUV = uv;
  vSteep = 1.0 - normal.y;
  ` : `
  // shallow-water dampening
  float terr = terrainHeight(wpos0.xz);
  float depthF = smoothstep(0.0, 6.0, wpos0.y - terr);
  vec3 disp = gerstner(wpos0.xz, uTime, wn, ampFade * (0.25 + 0.75 * depthF));
  vFlowUV = wpos0.xz;
  vSteep = 0.0;
  `}
  transformed += disp;
  vWaveN = wn;
  vCrest = clamp(disp.y / max(ampFade, 0.05) * 0.8, 0.0, 1.0);
`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${GLSL_GRID}
uniform float uTime;
uniform sampler2D uDetailN;
uniform sampler2D uNoiseTex;
uniform float uWindStrength;
uniform float uRain;
uniform float uLightning;
varying vec3 vWaveN;
varying float vCrest;
varying vec2 vFlowUV;
varying float vSteep;
vec3 gWaterN;
float gFoam;`)
      .replace('#include <map_fragment>', `
  vec2 wxz = vWorldPos.xz;
  float camDist = length(vWorldPos - cameraPosition);
  float terrH = terrainHeight(wxz);
  float depth = max(vWorldPos.y - terrH, 0.0);
  ${kind === 'river' ? `
  vec2 fuv = vec2(vFlowUV.x * 3.0, vFlowUV.y * 0.08);
  float speed = 1.0 + vSteep * 14.0;
  vec2 n1 = texture2D(uDetailN, fuv * vec2(1.0, 1.0) + vec2(0.0, -uTime * 0.25 * speed)).xy * 2.0 - 1.0;
  vec2 n2 = texture2D(uDetailN, fuv * vec2(1.7, 0.6) + vec2(0.3, -uTime * 0.17 * speed)).xy * 2.0 - 1.0;
  vec3 baseN = normalize(vNormalWater());
  vec3 nW = normalize(baseN + vec3(n1.x + n2.x, 0.0, n1.y + n2.y) * 0.18);
  float streak = texture2D(uNoiseTex, vec2(vFlowUV.x * 2.0, vFlowUV.y * 0.05 - uTime * 0.9)).g;
  gFoam = smoothstep(0.08, 0.5, vSteep) * (0.65 + streak * 0.5);
  gFoam += smoothstep(1.2, 0.0, depth) * 0.25 * texture2D(uNoiseTex, wxz * 0.2 + uTime * 0.05).r;
  ` : `
  vec2 s1 = wxz * 0.045 + vec2(uTime * 0.021, uTime * 0.013);
  vec2 s2 = wxz * 0.11 + vec2(-uTime * 0.03, uTime * 0.027);
  vec2 s3 = wxz * 0.006 + vec2(uTime * 0.004, -uTime * 0.003);
  vec2 d1 = texture2D(uDetailN, s1).xy * 2.0 - 1.0;
  vec2 d2 = texture2D(uDetailN, s2).xy * 2.0 - 1.0;
  vec2 d3 = texture2D(uDetailN, s3).xy * 2.0 - 1.0;
  float detailFade = 1.0 - smoothstep(150.0, 1500.0, camDist);
  vec3 nW = normalize(vWaveN + vec3(d1.x + d2.x * 0.6, 0.0, d1.y + d2.y * 0.6) * 0.16 * detailFade * (0.6 + uWindStrength) + vec3(d3.x, 0.0, d3.y) * 0.08);
  // rain ripples
  if (uRain > 0.05) {
    vec2 rp = texture2D(uNoiseTex, wxz * 0.9 + vec2(uTime * 0.7, 0.0)).ba * 2.0 - 1.0;
    nW = normalize(nW + vec3(rp.x, 0.0, rp.y) * 0.25 * uRain * detailFade);
  }
  float shore = smoothstep(1.4, 0.0, depth);
  float foamN = texture2D(uNoiseTex, wxz * 0.08 + vec2(uTime * 0.02, 0.0)).g;
  float foamN2 = texture2D(uNoiseTex, wxz * 0.31 - vec2(0.0, uTime * 0.04)).b;
  float surf = sin(depth * 3.0 - uTime * 1.6 + foamN * 6.0) * 0.5 + 0.5;
  gFoam = shore * smoothstep(0.35, 0.8, foamN * 0.6 + foamN2 * 0.6 + surf * 0.3);
  gFoam += smoothstep(0.65, 1.0, vCrest) * smoothstep(0.45, 0.8, foamN2) * 0.6 * uWindStrength;
  `}
  gWaterN = nW;
  vec3 deepCol = vec3(0.004, 0.035, 0.05);
  vec3 shallowCol = vec3(0.03, 0.22, 0.2);
  ${kind === 'lake' ? 'deepCol = vec3(0.006, 0.04, 0.035); shallowCol = vec3(0.05, 0.2, 0.14);' : ''}
  ${kind === 'river' ? 'deepCol = vec3(0.01, 0.05, 0.045); shallowCol = vec3(0.07, 0.2, 0.15);' : ''}
  vec3 wc = mix(shallowCol, deepCol, smoothstep(0.0, 9.0, depth));
  gFoam = clamp(gFoam, 0.0, 1.0);
  diffuseColor.rgb = mix(wc, vec3(0.9, 0.93, 0.95), gFoam);
  float alphaD = smoothstep(0.0, 4.5, depth);
  diffuseColor.a = clamp(mix(0.25, 0.97, alphaD) + gFoam * 0.6, 0.0, 1.0);
  if (!gl_FrontFacing) { diffuseColor.rgb = deepCol * 2.0; diffuseColor.a = 0.92; }
`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.035 + uRain * 0.08, 0.7, gFoam);`)
      .replace('#include <normal_fragment_maps>', `
  {
    vec3 wn = gWaterN;
    if (!gl_FrontFacing) wn = -wn;
    normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  #if NUM_DIR_LIGHTS > 0
  {
    // subsurface glow through wave crests
    vec3 Vw = normalize(cameraPosition - vWorldPos);
    float sss = pow(max(dot(-Vw, uSunDir), 0.0), 4.0) * (0.3 + vCrest);
    reflectedLight.directDiffuse += vec3(0.05, 0.35, 0.3) * directionalLights[0].color * sss * 0.25 * sunVis;
  }
  #endif`);
    if (kind === 'river') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRiverN;
vec3 vNormalWater() { return vRiverN; }`);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vRiverN;`).replace('vSteep = 1.0 - normal.y;', 'vSteep = 1.0 - normal.y; vRiverN = normal;');
    }
  }, 'water-' + kind);
  mat.userData.local = local;
  return mat;
}

export class Water {
  constructor(world, scene, quality) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'water';
    scene.add(this.group);

    // ---- ocean: polar grid that follows the camera
    const rings = 110, segs = 160;
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let r = 1; r <= rings; r++) {
      const t = r / rings;
      const rad = 2 + Math.pow(t, 3.2) * 30000;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      }
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let r = 1; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = 1 + (r - 1) * segs + s, b = 1 + (r - 1) * segs + ((s + 1) % segs);
        const c = 1 + r * segs + s, d = 1 + r * segs + ((s + 1) % segs);
        idx.push(a, b, c, b, d, c);
      }
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    og.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    og.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    og.setIndex(idx);
    this.ocean = new THREE.Mesh(og, makeWaterMaterial('ocean'));
    this.ocean.frustumCulled = false;
    this.ocean.receiveShadow = true;
    this.ocean.renderOrder = 1;
    this.group.add(this.ocean);

    // ---- lakes
    const lakeMat = makeWaterMaterial('lake');
    this.lakes = [];
    const mk = (x, z, r, level) => {
      const g = new THREE.CircleGeometry(r, 96);
      g.rotateX(-Math.PI / 2);
      // subdivide-free: lakes use small waves only
      const m = new THREE.Mesh(g, lakeMat);
      m.position.set(x, level, z);
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.group.add(m);
      this.lakes.push(m);
    };
    mk(MIRROR_LAKE.x, MIRROR_LAKE.z, MIRROR_LAKE.lakeR + 45, MIRROR_LAKE.level);
    mk(JADE_LAKE.x, JADE_LAKE.z, JADE_LAKE.r + 38, world.jadeLevel);

    // ---- river ribbon
    this.falls = [];
    this._buildRiver(makeWaterMaterial('river'));
  }

  _buildRiver(mat) {
    const gen = this.world.gen;
    const pts = gen.riverPts, surf = gen.riverSurface, sArr = gen.riverS;
    const pos = [], nor = [], uv = [], idx = [];
    const L = MIRROR_LAKE;
    let started = false;
    let vi = 0;
    let fallStart = -1;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x, z] = pts[i];
      if (Math.hypot(x - L.x, z - L.z) < L.lakeR - 20) continue; // inside lake
      if (surf[i] < 0.25) break; // reached the sea
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      const W = gen.riverWidth(sArr[i]) + 3;
      const y = surf[i] + 0.06;
      // slope for normals
      const y0 = surf[Math.max(0, i - 1)], y1 = surf[Math.min(n - 1, i + 1)];
      const dy = (y1 - y0) / (2 * 4);
      const nn = new THREE.Vector3(-tx * -dy, 1, -tz * -dy);
      nn.set(tx * -dy, 1, tz * -dy).normalize();
      for (const side of [-1, 1]) {
        pos.push(x + -tz * W * side, y, z + tx * W * side);
        nor.push(nn.x, nn.y, nn.z);
        uv.push(side < 0 ? 0 : 1, sArr[i]);
      }
      if (started) {
        const a0 = vi - 2, a1 = vi - 1, b0 = vi, b1 = vi + 1;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
      started = true;
      vi += 2;
      // waterfall detection
      if (i > 0 && surf[i - 1] - surf[i] > 2.0) {
        if (fallStart < 0) fallStart = i - 1;
      } else if (fallStart >= 0) {
        const top = pts[fallStart], bot = pts[i];
        this.falls.push({
          top: new THREE.Vector3(top[0], surf[fallStart], top[1]),
          bottom: new THREE.Vector3(bot[0], surf[i], bot[1]),
          width: gen.riverWidth(sArr[i]),
          dir: new THREE.Vector2(tx, tz),
        });
        fallStart = -1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.river = new THREE.Mesh(g, mat);
    this.river.receiveShadow = true;
    this.river.renderOrder = 2;
    this.group.add(this.river);
  }

  update(camPos) {
    this.ocean.position.set(Math.round(camPos.x / 4) * 4, WORLD.SEA, Math.round(camPos.z / 4) * 4);
  }
}
