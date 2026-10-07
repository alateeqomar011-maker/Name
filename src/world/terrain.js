// Chunked LOD terrain rendering with a detailed, weather-reactive shader.
import * as THREE from 'three';
import { GRID, CELL, HALF } from './worldgen.js';
import { U, GLSL_NOISE } from './shaderlib.js';

const CHUNK_CELLS = 64; // 256m
const CHUNKS = GRID / CHUNK_CELLS; // 16
const N = GRID + 1;
const LOD_DIST = [420, 900, 1500];

export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = U.uWet;
    shader.uniforms.uSnow = U.uSnow;
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uSnowLine = { get value() { return 200 - U.uSnow.value * 160; } };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNormal;
        uniform float uWet; uniform float uSnow; uniform float uTime; uniform float uSnowLine;
        ${GLSL_NOISE}
        vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
        float triN(vec3 p, vec3 w){ return vnoise(p.zy) * w.x + vnoise(p.xz + 13.7) * w.y + vnoise(p.xy + 31.1) * w.z; }
        // procedural rock: layered strata, cracks and boulder-scale mottling
        float rockH(vec3 p, vec3 w, float fine){
          float warp = vnoise(p.xz * 0.02) * 2.5 + triN(p * 0.09, w) * 0.8;
          // sedimentary ledges: sawtooth layers give stepped, eroded strata
          float layer = fract(p.y * 0.28 + warp);
          float ledge = pow(layer, 2.5) * 0.55;
          float thin = (sin(p.y * 2.2 + warp * 6.0) * 0.5 + 0.5) * 0.12 * fine;
          // angular fractured plates
          float plate = floor(triN(p * 0.22, w) * 5.0) / 5.0;
          float big = triN(p * 0.05, w);
          float crack = 1.0 - abs(triN(p * 0.33, w) * 2.0 - 1.0);
          crack = smoothstep(0.94, 0.995, crack) * 0.35;
          float grain = (triN(p * 3.1, w) - 0.5) * 0.18 * fine;
          return ledge + thin + plate * 0.35 + big * 0.45 - crack + grain;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float camD = length(vWPos - cameraPosition);
        float detailFade = 1.0 - smoothstep(60.0, 220.0, camD);
        float dn = fbm3(vWPos.xz * 0.33);
        float dn2 = vnoise(vWPos.xz * 2.3);
        float dnL = vnoise(vWPos.xz * 0.045);
        diffuseColor.rgb *= 0.78 + 0.34 * dnL;
        diffuseColor.rgb *= mix(1.0, 0.8 + 0.3 * dn + 0.12 * dn2, detailFade);
        float ny = vWNormal.y;
        // ---- rock surfaces (steep slopes, bare mountain tops) ----
        vec3 vc = diffuseColor.rgb;
        float mx = max(vc.r, max(vc.g, vc.b));
        float sat = (mx - min(vc.r, min(vc.g, vc.b))) / max(mx, 0.001);
        float greyRock = (1.0 - smoothstep(0.38, 0.5, sat)) * smoothstep(70.0, 140.0, vWPos.y) * step(0.02, vc.g) * max(smoothstep(0.97, 0.88, ny), smoothstep(170.0, 220.0, vWPos.y));
        float slopeRock = smoothstep(0.84, 0.64, ny);
        float rockAmt = clamp(max(greyRock, slopeRock), 0.0, 1.0) * step(1.0, vWPos.y);
        vec3 tw = triW(vWNormal);
        float rockFine = 1.0 - smoothstep(80.0, 400.0, camD);
        float rh = rockH(vWPos, tw, rockFine);
        float crackR = smoothstep(0.94, 0.995, 1.0 - abs(triN(vWPos * 0.33, tw) * 2.0 - 1.0));
        float layerId = floor(vWPos.y * 0.28 + vnoise(vWPos.xz * 0.02) * 2.5 + triN(vWPos * 0.09, tw) * 0.8);
        float layerTone = hash12(vec2(layerId, 7.0));
        vec3 rockC = vc * (0.7 + 0.5 * clamp(rh, 0.0, 1.3)) * (0.88 + 0.24 * layerTone);
        rockC = mix(rockC, rockC * vec3(1.08, 0.98, 0.86), smoothstep(0.4, 0.8, triN(vWPos * 0.02, tw)) * 0.6);
        rockC *= 1.0 - crackR * 0.35;
        // lichen & moss in sheltered ledges
        float lichen = smoothstep(0.6, 0.72, triN(vWPos * 0.55, tw)) * smoothstep(0.35, 0.75, ny) * (1.0 - smoothstep(240.0, 300.0, vWPos.y));
        rockC = mix(rockC, vec3(0.16, 0.19, 0.1), lichen * 0.45);
        // natural snow caps on ledges of high peaks
        float snowCap = smoothstep(255.0, 290.0, vWPos.y + vnoise(vWPos.xz * 0.05) * 30.0) * smoothstep(0.45, 0.7, ny + rh * 0.15);
        rockC = mix(rockC, vec3(0.86, 0.89, 0.94), snowCap);
        diffuseColor.rgb = mix(diffuseColor.rgb, rockC, rockAmt);
        // shore: wet sand band
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(-0.2, 1.2, vWPos.y));
        // weather snow accumulation
        float snowAmt = uSnow * smoothstep(0.62, 0.86, ny) * smoothstep(uSnowLine, uSnowLine + 25.0, vWPos.y);
        snowAmt = max(snowAmt, uSnow * 0.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.96), snowAmt);
        float flatG = smoothstep(0.86, 0.975, ny);
        float puddle = uWet * flatG * smoothstep(0.56, 0.7, fbm3(vWPos.xz * 0.085)) * step(0.6, vWPos.y) * (1.0 - snowAmt);
        float wet = uWet * (0.55 + 0.45 * flatG) * (1.0 - snowAmt);
        diffuseColor.rgb *= mix(1.0, 0.55, wet);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + vec3(0.01, 0.012, 0.015), puddle);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.4, wet);
        roughnessFactor = mix(roughnessFactor, 0.03, puddle);
        roughnessFactor = mix(roughnessFactor, 0.6, snowAmt);
        roughnessFactor = mix(roughnessFactor, 0.78 - crackR * 0.1, rockAmt);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = vWPos.xz * 0.8;
          float e = 0.12;
          float h0 = fbm3(p), hx = fbm3(p + vec2(e, 0.0)), hz = fbm3(p + vec2(0.0, e));
          float bs = 0.55 * detailFade * (1.0 - puddle);
          vec3 nW = normalize(vWNormal + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * bs * 0.35);
          // triplanar rock bump: strata ledges and cracks, visible far away
          if (rockAmt > 0.01) {
            float re = 0.25;
            float r0 = rockH(vWPos, tw, rockFine);
            vec3 g3 = vec3(rockH(vWPos + vec3(re, 0.0, 0.0), tw, rockFine) - r0, rockH(vWPos + vec3(0.0, re, 0.0), tw, rockFine) - r0, rockH(vWPos + vec3(0.0, 0.0, re), tw, rockFine) - r0) / re;
            g3 -= dot(g3, nW) * nW;
            float rk = rockAmt * (0.55 - 0.3 * smoothstep(300.0, 1200.0, camD));
            nW = normalize(nW - g3 * rk);
          }
          nW = normalize(mix(nW, vec3(0.0, 1.0, 0.0), puddle * 0.9));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  mat.customProgramCacheKey = () => 'terrain-v3';
  return mat;
}

export class Terrain {
  constructor(world, scene, quality) {
    this.world = world;
    this.scene = scene;
    this.material = createTerrainMaterial();
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.chunks = [];
    this.quality = quality;
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        const c0 = cx * CHUNK_CELLS, r0 = cz * CHUNK_CELLS;
        let maxH = -Infinity, minH = Infinity;
        for (let r = r0; r <= r0 + CHUNK_CELLS; r += 2) for (let c = c0; c <= c0 + CHUNK_CELLS; c += 2) {
          const h = world.heights[r * N + c];
          if (h > maxH) maxH = h;
          if (h < minH) minH = h;
        }
        this.chunks.push({
          cx, cz, c0, r0, maxH, minH, lod: -1, mesh: null,
          centerX: -HALF + (c0 + CHUNK_CELLS / 2) * CELL,
          centerZ: -HALF + (r0 + CHUNK_CELLS / 2) * CELL,
          skip: maxH < -18,
        });
      }
    }
    this._col = [0, 0, 0];
  }

  desiredLod(ch, px, pz) {
    const dx = Math.max(Math.abs(px - ch.centerX) - 128, 0);
    const dz = Math.max(Math.abs(pz - ch.centerZ) - 128, 0);
    const d = Math.sqrt(dx * dx + dz * dz);
    const s = this.quality.viewScale;
    if (d < LOD_DIST[0] * s * 0.7) return 0;
    if (d < LOD_DIST[1] * s * 0.85) return 1;
    if (d < LOD_DIST[2] * s * 1.1) return 2;
    return 3;
  }

  // Build every chunk synchronously (used at load)
  buildAll(px, pz) {
    for (const ch of this.chunks) {
      if (ch.skip) continue;
      this._rebuild(ch, this.desiredLod(ch, px, pz));
    }
  }

  update(px, pz) {
    let budget = 3;
    // prioritise nearest chunks needing change
    const pending = [];
    for (const ch of this.chunks) {
      if (ch.skip) continue;
      const l = this.desiredLod(ch, px, pz);
      if (l !== ch.lod) pending.push([Math.hypot(px - ch.centerX, pz - ch.centerZ), ch, l]);
    }
    if (!pending.length) return;
    pending.sort((a, b) => a[0] - b[0]);
    for (const [, ch, l] of pending) {
      this._rebuild(ch, l);
      if (--budget <= 0) break;
    }
  }

  _rebuild(ch, lod) {
    const world = this.world;
    const step = 1 << lod;
    const n = CHUNK_CELLS / step;
    const vpr = n + 1;
    const baseCount = vpr * vpr;
    const skirtCount = 4 * vpr;
    const total = baseCount + skirtCount;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const H = world.heights;
    const c3 = this._col;
    let vi = 0;
    const setV = (c, r, yOff) => {
      const k = r * N + c;
      const x = -HALF + c * CELL, z = -HALF + r * CELL;
      pos[vi * 3] = x; pos[vi * 3 + 1] = H[k] + yOff; pos[vi * 3 + 2] = z;
      const hl = world.hAt(c - 1, r), hr = world.hAt(c + 1, r), hd = world.hAt(c, r - 1), hu = world.hAt(c, r + 1);
      let nx = hl - hr, ny = 2 * CELL, nz = hd - hu;
      const l = Math.hypot(nx, ny, nz);
      nor[vi * 3] = nx / l; nor[vi * 3 + 1] = ny / l; nor[vi * 3 + 2] = nz / l;
      world.colorLinear(k, c3);
      col[vi * 3] = c3[0]; col[vi * 3 + 1] = c3[1]; col[vi * 3 + 2] = c3[2];
      vi++;
    };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) setV(ch.c0 + i * step, ch.r0 + j * step, 0);
    const skirtDrop = -3 - step * 3;
    const sk = [];
    // perimeter order: top row, right col, bottom row, left col (each vpr verts)
    for (let i = 0; i <= n; i++) { sk.push(i); setV(ch.c0 + i * step, ch.r0, skirtDrop); }
    for (let j = 0; j <= n; j++) { sk.push(j * vpr + n); setV(ch.c0 + n * step, ch.r0 + j * step, skirtDrop); }
    for (let i = 0; i <= n; i++) { sk.push(n * vpr + i); setV(ch.c0 + i * step, ch.r0 + n * step, skirtDrop); }
    for (let j = 0; j <= n; j++) { sk.push(j * vpr); setV(ch.c0, ch.r0 + j * step, skirtDrop); }

    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * vpr + i, b = a + 1, c = a + vpr, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < n; i++) {
        const t0 = sk[s * vpr + i], t1 = sk[s * vpr + i + 1];
        const b0 = baseCount + s * vpr + i, b1 = b0 + 1;
        idx.push(t0, b0, t1, t1, b0, b1); // both windings so skirts are visible from either side
        idx.push(t0, t1, b0, t1, b1, b0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    if (ch.mesh) {
      ch.mesh.geometry.dispose();
      ch.mesh.geometry = geo;
    } else {
      ch.mesh = new THREE.Mesh(geo, this.material);
      ch.mesh.receiveShadow = true;
      ch.mesh.matrixAutoUpdate = false;
      this.group.add(ch.mesh);
    }
    ch.mesh.castShadow = lod === 0;
    ch.lod = lod;
  }

  setVisible(v) { this.group.visible = v; }
}

export { CHUNK_CELLS, CHUNKS };
