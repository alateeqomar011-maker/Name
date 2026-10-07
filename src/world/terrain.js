// Chunked LOD terrain with a procedural splatting shader.
import * as THREE from 'three';
import { WORLD } from './design.js';
import { U, patchSunVisibility } from '../render/common.js';
import { noiseTexture, detailNormalTexture } from '../render/textures.js';

const CHUNK_CELLS = 64; // 64 cells * 4 m = 256 m
const CHUNKS = WORLD.N / CHUNK_CELLS; // 32
const S = WORLD.N + 1;
const LOD_SEGS = [64, 32, 16, 8];

export class Terrain {
  constructor(world, quality) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.quality = quality;
    this.material = this._makeMaterial();
    this.chunks = [];
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        // height range
        let mn = 1e9, mx = -1e9;
        for (let j = cz * CHUNK_CELLS; j <= (cz + 1) * CHUNK_CELLS; j += 2) {
          for (let i = cx * CHUNK_CELLS; i <= (cx + 1) * CHUNK_CELLS; i += 2) {
            const h = world.heights[j * S + i];
            if (h < mn) mn = h;
            if (h > mx) mx = h;
          }
        }
        if (mx < -45) continue; // deep ocean floor: never visible
        const mesh = new THREE.Mesh(undefined, this.material);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        const chunk = {
          cx, cz, mesh, lod: -1, geos: [], minH: mn, maxH: mx,
          x0: -WORLD.HALF + cx * CHUNK_CELLS * WORLD.CELL,
          z0: -WORLD.HALF + cz * CHUNK_CELLS * WORLD.CELL,
        };
        this.chunks.push(chunk);
      }
    }
    this.lodDist = [480, 1300, 3200];
  }

  _buildGeometry(chunk, lod) {
    const segs = LOD_SEGS[lod];
    const step = CHUNK_CELLS / segs;
    const w = this.world;
    const n = segs + 1;
    const skirtCount = segs * 4 + 4;
    const vCount = n * n + skirtCount;
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const msk = new Uint8Array(vCount * 4);
    const i0 = chunk.cx * CHUNK_CELLS, j0 = chunk.cz * CHUNK_CELLS;
    const H = w.heights, M = w.masks;
    const e = Math.max(1, step >> 1);
    const hAt = (i, j) => H[Math.min(S - 1, Math.max(0, j)) * S + Math.min(S - 1, Math.max(0, i))];
    let v = 0;
    const put = (i, j, dy) => {
      const k = j * S + i;
      pos[v * 3] = -WORLD.HALF + i * WORLD.CELL;
      pos[v * 3 + 1] = H[k] + dy;
      pos[v * 3 + 2] = -WORLD.HALF + j * WORLD.CELL;
      const nx = hAt(i - e, j) - hAt(i + e, j);
      const nz = hAt(i, j - e) - hAt(i, j + e);
      const ny = 2 * e * WORLD.CELL;
      const l = Math.hypot(nx, ny, nz);
      nor[v * 3] = nx / l;
      nor[v * 3 + 1] = ny / l;
      nor[v * 3 + 2] = nz / l;
      msk[v * 4] = M[k * 4];
      msk[v * 4 + 1] = M[k * 4 + 1];
      msk[v * 4 + 2] = M[k * 4 + 2];
      msk[v * 4 + 3] = M[k * 4 + 3];
      return v++;
    };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) put(i0 + x * step, j0 + y * step, 0);
    const idx = [];
    for (let y = 0; y < segs; y++) {
      for (let x = 0; x < segs; x++) {
        const a = y * n + x, b = (y + 1) * n + x, c = (y + 1) * n + x + 1, d = y * n + x + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    // skirts
    const skirt = 2 + step * 3;
    const edge = (list, outwardNE) => {
      const s = list.map(([x, y]) => put(i0 + x * step, j0 + y * step, -skirt));
      for (let k = 0; k < list.length - 1; k++) {
        const v0 = list[k][1] * n + list[k][0], v1 = list[k + 1][1] * n + list[k + 1][0];
        if (outwardNE) idx.push(v0, v1, s[k], v1, s[k + 1], s[k]);
        else idx.push(v0, s[k], v1, v1, s[k], s[k + 1]);
      }
    };
    const north = [], south = [], west = [], east = [];
    for (let k = 0; k < n; k++) {
      north.push([k, 0]);
      south.push([k, segs]);
      west.push([0, k]);
      east.push([segs, k]);
    }
    edge(north, true);
    edge(east, true);
    edge(south, false);
    edge(west, false);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    g.setAttribute('aMask', new THREE.BufferAttribute(msk.subarray(0, v * 4), 4, true));
    g.setIndex(v > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const cxw = chunk.x0 + CHUNK_CELLS * WORLD.CELL * 0.5, czw = chunk.z0 + CHUNK_CELLS * WORLD.CELL * 0.5;
    const half = CHUNK_CELLS * WORLD.CELL * 0.5;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(chunk.x0, chunk.minH - skirt, chunk.z0), new THREE.Vector3(chunk.x0 + half * 2, chunk.maxH + 1, chunk.z0 + half * 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cxw, (chunk.minH + chunk.maxH) / 2, czw), Math.hypot(half, half, (chunk.maxH - chunk.minH) / 2 + skirt));
    return g;
  }

  update(camPos) {
    const lodScale = this.quality.terrainLod;
    for (const c of this.chunks) {
      const cxw = c.x0 + 128, czw = c.z0 + 128;
      const dx = Math.max(0, Math.abs(camPos.x - cxw) - 128);
      const dz = Math.max(0, Math.abs(camPos.z - czw) - 128);
      const dy = Math.max(0, camPos.y - c.maxH) * 0.5;
      const d = Math.hypot(dx, dz, dy);
      let lod = 3;
      if (d < this.lodDist[0] * lodScale) lod = 0;
      else if (d < this.lodDist[1] * lodScale) lod = 1;
      else if (d < this.lodDist[2] * lodScale) lod = 2;
      if (lod !== c.lod) {
        if (!c.geos[lod]) c.geos[lod] = this._buildGeometry(c, lod);
        c.mesh.geometry = c.geos[lod];
        if (c.lod === -1) this.group.add(c.mesh);
        c.lod = lod;
        // free far-away fine LODs to bound memory
        if (lod >= 2 && c.geos[0]) { c.geos[0].dispose(); c.geos[0] = null; }
      }
    }
  }

  _makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const noise = noiseTexture();
    const detail = detailNormalTexture();
    const q = this.quality;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNoiseTex = { value: noise };
      shader.uniforms.uDetailN = { value: detail };
      shader.uniforms.uWetness = U.uWetness;
      shader.uniforms.uSnowCover = U.uSnowCover;
      shader.uniforms.uTime = U.uTime;
      shader.uniforms.uCaveHoles = U.uCaveHoles;
      patchSunVisibility(shader, { terrainShadow: 'fragment', cloudShadow: true });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec4 aMask;
varying vec4 vMask;
varying vec3 vNormalW;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vMask = aMask;
vNormalW = normal;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec4 vMask;
varying vec3 vNormalW;
uniform sampler2D uNoiseTex;
uniform sampler2D uDetailN;
uniform float uWetness;
uniform float uSnowCover;
uniform float uTime;
uniform vec4 uCaveHoles[4];
float gTerrainRough;
vec3 gTerrainEmissive;
vec3 gNormalW;`)
        .replace('#include <map_fragment>', `
  for (int ci = 0; ci < 4; ci++) {
    vec4 hc = uCaveHoles[ci];
    vec3 dd = vWorldPos - hc.xyz;
    dd.y *= 1.25;
    if (hc.w > 0.0 && length(dd) < hc.w) discard;
  }
  // per-pixel normal from the heightfield (smooth at every LOD)
  vec3 nW;
  {
    float e = 4.0;
    float hL = terrainHeight(vWorldPos.xz - vec2(e, 0.0)), hR = terrainHeight(vWorldPos.xz + vec2(e, 0.0));
    float hD = terrainHeight(vWorldPos.xz - vec2(0.0, e)), hU = terrainHeight(vWorldPos.xz + vec2(0.0, e));
    nW = normalize(vec3(hL - hR, 2.0 * e, hD - hU));
    nW = normalize(mix(nW, normalize(vNormalW), 0.25));
  }
  float slope = 1.0 - nW.y;
  vec2 xz = vWorldPos.xz;
  float h = vWorldPos.y;
  float camDist = length(vWorldPos - cameraPosition);
  vec4 nz1 = texture2D(uNoiseTex, xz * 0.0019);
  vec4 nz2 = texture2D(uNoiseTex, xz * 0.027);
  vec4 nz3 = texture2D(uNoiseTex, xz * 0.19);
  float moist = vMask.r, canyon = vMask.g, volc = vMask.b, wet = vMask.a;

  // meadow palette shared with the grass blades (same noise lookups) so distant fields read as grass
  vec4 pn = texture2D(uNoiseTex, xz * 0.0035);
  vec4 pn2 = texture2D(uNoiseTex, xz * 0.021);
  float lush = clamp(0.55 + moist * 0.6 + (pn.r - 0.5) * 0.5, 0.0, 1.0);
  vec3 gDeep = vec3(0.03, 0.10, 0.014);
  vec3 gFresh = vec3(0.13, 0.31, 0.028);
  vec3 gGold = vec3(0.30, 0.38, 0.05);
  vec3 grass = mix(gDeep, gFresh, smoothstep(0.25, 0.75, pn2.r + 0.17));
  grass = mix(grass, gGold, smoothstep(0.62, 0.85, pn.b + 0.1) * 0.6);
  grass = mix(vec3(0.30, 0.27, 0.10), grass, smoothstep(0.1, 0.45, lush));
  // directional sheen of wind-combed grass seen from afar
  float comb = texture2D(uNoiseTex, vec2(xz.x * 0.08 + xz.y * 0.02, xz.y * 0.01) + uTime * 0.004).g;
  grass *= 0.86 + comb * 0.22 + smoothstep(150.0, 1200.0, camDist) * 0.08;
  vec3 jungle = mix(vec3(0.085, 0.10, 0.04), vec3(0.16, 0.115, 0.06), nz2.r) * (0.85 + nz3.r * 0.3);
  vec3 ground = mix(grass, jungle, smoothstep(0.64, 0.8, moist));
  ground = mix(ground, vec3(0.25, 0.19, 0.12) * (0.8 + nz3.g * 0.4), smoothstep(0.7, 0.85, nz1.g + nz3.r * 0.25) * 0.5);
  ground = mix(ground, vec3(0.20, 0.23, 0.15) * (0.8 + nz2.r * 0.4), smoothstep(260.0, 460.0, h));
  ground = mix(ground, mix(vec3(0.6, 0.35, 0.18), vec3(0.48, 0.38, 0.22), nz2.r) * (0.85 + nz3.g * 0.3), smoothstep(0.35, 0.75, canyon));
  ground = mix(ground, vec3(0.11, 0.10, 0.095) * (0.75 + nz2.g * 0.5), smoothstep(0.35, 0.8, volc));

  float sandH = 2.4 + (nz2.r - 0.5) * 2.4;
  float sandW = 1.0 - smoothstep(sandH - 0.7, sandH + 0.7, h);
  vec3 sand = mix(vec3(0.70, 0.61, 0.45), vec3(0.40, 0.34, 0.25), smoothstep(0.8, -0.6, h)) * (0.88 + nz3.g * 0.2);

  float band = sin(h * 0.42 + nz1.r * 5.0) * 0.5 + 0.5;
  float band2 = sin(h * 1.9 + nz2.r * 3.0) * 0.5 + 0.5;
  // layered rock: darker crevices from worley edges, warm/cool variation, lichen
  float crev = smoothstep(0.15, 0.6, nz3.b) * smoothstep(0.1, 0.5, nz2.b);
  vec3 rockGray = mix(vec3(0.105, 0.1, 0.095), vec3(0.24, 0.22, 0.2), nz3.g * 0.7 + nz2.r * 0.3);
  rockGray = mix(rockGray, vec3(0.2, 0.19, 0.15), smoothstep(0.55, 0.8, nz1.g) * 0.5);
  rockGray *= 0.55 + 0.45 * (1.0 - crev);
  rockGray = mix(rockGray, vec3(0.16, 0.19, 0.1), smoothstep(0.6, 0.85, nz2.g) * 0.35 * (1.0 - smoothstep(400.0, 700.0, h)));
  vec3 redRock = mix(vec3(0.32, 0.12, 0.05), vec3(0.56, 0.32, 0.17), band) * (0.75 + band2 * 0.3) * (0.6 + 0.4 * (1.0 - crev));
  vec3 basalt = vec3(0.075, 0.068, 0.064) * (0.75 + nz3.g * 0.55);
  vec3 rock = mix(rockGray, redRock, smoothstep(0.3, 0.7, canyon));
  rock = mix(rock, basalt, smoothstep(0.3, 0.7, volc));
  float rockW = smoothstep(0.26, 0.40, slope + (nz2.g - 0.5) * 0.14);

  vec3 col = mix(ground, rock, rockW);
  col = mix(col, sand, sandW * (1.0 - rockW * 0.8));
  float snowLine = 560.0 + (nz1.r - 0.5) * 90.0 - uSnowCover * 220.0;
  float snowW = smoothstep(snowLine - 25.0, snowLine + 25.0, h) * smoothstep(0.5, 0.3, slope + (nz3.r - 0.5) * 0.2 + (nz2.g - 0.5) * 0.25);
  snowW = max(snowW, smoothstep(snowLine + 150.0, snowLine + 320.0, h) * 0.55 * smoothstep(0.75, 0.45, slope + (nz2.g - 0.5) * 0.3));
  col = mix(col, vec3(0.8, 0.84, 0.9) * (0.9 + nz3.g * 0.12), snowW);
  col *= 0.86 + nz1.b * 0.28;
  float wetAll = max(uWetness * (1.0 - snowW), wet * 0.45 * (1.0 - rockW));
  col *= 1.0 - wetAll * 0.38;
  diffuseColor.rgb *= col;
  gTerrainRough = mix(mix(0.92, 0.82, rockW), 0.55, snowW);
  gTerrainRough = mix(gTerrainRough, 0.88, sandW);
  gTerrainRough *= 1.0 - wetAll * 0.55;
  // lava glow in volcanic cracks near the summit
  float crack = pow(nz3.b, 5.0) * smoothstep(0.75, 0.95, volc) * smoothstep(560.0, 700.0, h);
  float pulse = 0.7 + 0.3 * sin(uTime * 1.3 + nz1.r * 12.0);
  gTerrainEmissive = vec3(1.0, 0.28, 0.04) * crack * 14.0 * pulse;
  gNormalW = nW;
`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = gTerrainRough;`)
        .replace('#include <normal_fragment_maps>', `
  {
    float fade = 1.0 - smoothstep(300.0, 900.0, camDist);
    vec3 wn = gNormalW;
    if (fade > 0.0) {
      vec3 bl = pow(abs(wn), vec3(4.0));
      bl /= (bl.x + bl.y + bl.z);
      vec2 dY = texture2D(uDetailN, xz * 0.25).xy * 2.0 - 1.0;
      vec2 dY2 = texture2D(uDetailN, xz * 0.043).xy * 2.0 - 1.0;
      vec2 dX = texture2D(uDetailN, vWorldPos.zy * 0.12).xy * 2.0 - 1.0;
      vec2 dZ = texture2D(uDetailN, vWorldPos.xy * 0.12).xy * 2.0 - 1.0;
      float str = mix(0.08, 0.6, rockW) * (1.0 - snowW * 0.6);
      vec3 pert = vec3(dY.x + dY2.x * 0.7, 0.0, dY.y + dY2.y * 0.7) * bl.y
                + vec3(0.0, dX.y, dX.x) * bl.x * 1.4
                + vec3(dZ.x, dZ.y, 0.0) * bl.z * 1.4;
      wn = normalize(wn + pert * str * fade);
    }
    normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  }
`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += gTerrainEmissive;`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.directSpecular *= 0.3;
  reflectedLight.indirectSpecular *= 0.12 + snowW * 0.4;`);
      if (q.terrainShadowSteps && q.terrainShadowSteps < 22) {
        shader.fragmentShader = shader.fragmentShader.replace('for (int i = 0; i < 22; i++)', `for (int i = 0; i < ${q.terrainShadowSteps}; i++)`);
      }
    };
    mat.customProgramCacheKey = () => 'terrain' + (q.terrainShadowSteps || 22);
    return mat;
  }
}
