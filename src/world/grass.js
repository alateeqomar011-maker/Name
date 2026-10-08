// GPU-placed grass field that wraps around the camera. Heights and density come from world textures.
import * as THREE from 'three';
import { atmospherePatch, TRANSLUCENCY } from './atmosphere.js';
import { U, GLSL_HEIGHT, GLSL_NOISE, GLSL_MEADOW } from './shaderlib.js';

export class Grass {
  constructor(world, scene, quality) {
    this.world = world;
    const S = quality.grassRadius * 2; // tile size
    const count = Math.floor(quality.grassCount);
    // Blade clump geometry (5 blades, 4 segments each)
    const blade = new THREE.BufferGeometry();
    const pos = [], uvs = [], idx = [];
    const BL = 8, SEG = 4;
    for (let b = 0; b < BL; b++) {
      const a = (b / BL) * Math.PI * 2 + b * 0.7;
      const rr = 0.08 + ((b * 53) % 7) / 25;
      const ox = Math.cos(a) * rr, oz = Math.sin(a) * rr;
      const dirA = a + 1.3;
      const dx = Math.cos(dirA), dz = Math.sin(dirA);
      const h = 0.42 + ((b * 37) % 10) / 28;
      const base = pos.length / 3;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        const w = 0.026 * (1 - t * 0.92);
        const lean = t * t * 0.35;
        const cx = ox + Math.cos(a) * lean, cz = oz + Math.sin(a) * lean;
        pos.push(cx - dx * w, t * h, cz - dz * w, cx + dx * w, t * h, cz + dz * w);
        uvs.push(0, t, 1, t);
      }
      for (let s = 0; s < SEG; s++) {
        const i = base + s * 2;
        idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
      }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    const offsets = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      offsets[i * 3] = Math.random() * S;
      offsets[i * 3 + 1] = Math.random() * S;
      offsets[i * 3 + 2] = Math.random();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.instanceCount = count;

    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    this.uniforms = {
      uHeightTex: { value: world.heightTex },
      uGroundTex: { value: world.groundTex },
      uTileSize: { value: S },
      uCam: { value: new THREE.Vector2() },
      uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -9999, 0, 0)) },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.uniforms.uTime = U.uTime;
      shader.uniforms.uWind = U.uWind;
      shader.uniforms.uWindDir = U.uWindDir;
      shader.uniforms.uSnow = U.uSnow;
      shader.uniforms.uWet = U.uWet;
      shader.uniforms.uAutumn = U.uAutumn;
      shader.uniforms.uWinter = U.uWinter;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aOffset;
          uniform sampler2D uGroundTex; uniform float uTileSize; uniform vec2 uCam; uniform vec4 uPush[8];
          uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform float uSnow; uniform float uAutumn; uniform float uWinter;
          varying vec3 vGrassCol; varying float vTip;
          ${GLSL_HEIGHT}
          ${GLSL_NOISE}
          ${GLSL_MEADOW}`)
        .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`)
        .replace('#include <begin_vertex>', `
          vec2 baseC = uCam - uTileSize * 0.5;
          vec2 wp = baseC + mod(aOffset.xy - baseC, uTileSize);
          vec2 gUV = (wp + 2048.0) / 4096.0;
          vec4 g = texture2D(uGroundTex, gUV);
          float dist = length(wp - uCam);
          float fade = 1.0 - smoothstep(uTileSize * 0.32, uTileSize * 0.5, dist);
          float dens = g.a * fade;
          float keep = step(aOffset.z, dens);
          float scl = keep * (0.55 + 0.6 * aOffset.z + 0.5 * vnoise(wp * 0.15)) * (0.4 + 0.6 * fade) * (1.0 - uWinter * 0.6);
          float h = worldHeight(wp);
          float ang = aOffset.z * 40.0;
          float ca = cos(ang), sa = sin(ang);
          vec3 p = position;
          p = vec3(p.x * ca - p.z * sa, p.y, p.x * sa + p.z * ca) * scl;
          float t = uv.y;
          float ph = uTime * (1.6 + uWind) + wp.x * 0.21 + wp.y * 0.17;
          float gust = 0.6 + 0.4 * sin(uTime * 0.5 + wp.x * 0.03 + wp.y * 0.02);
          float bend = t * t * (0.12 + uWind * 0.45) * scl;
          p.x += (uWindDir.x * gust + 0.3 * sin(ph)) * bend;
          p.z += (uWindDir.y * gust + 0.3 * cos(ph * 1.2)) * bend;
          // blades part and flatten around the player, vehicles and dinosaurs moving through them
          for (int k = 0; k < 8; k++) {
            vec4 q = uPush[k];
            if (q.w <= 0.0 || abs(q.y - h) > 2.5) continue;
            vec2 dv = wp - q.xz;
            float dd = length(dv);
            float infl = 1.0 - smoothstep(q.w * 0.3, q.w, dd);
            if (infl <= 0.0) continue;
            vec2 dirv = dv / max(dd, 0.001);
            p.xz += dirv * infl * t * 0.75 * (0.5 + scl);
            p.y *= 1.0 - infl * 0.6 * t;
          }
          vec3 transformed = vec3(wp.x, h - 0.04, wp.y) + p;
          vec3 base = pow(g.rgb, vec3(2.2));
          // lush green patches mixed into dry grassland, per-clump hue variation
          vec2 mv = meadowVar(wp);
          float grassy = smoothstep(0.005, 0.03, base.g - base.r) * smoothstep(0.005, 0.03, base.g - base.b);
          base = mix(base, vec3(0.075, 0.13, 0.03), mv.x * 0.55 * step(base.g, base.r * 1.6 + 0.2));
          base = mix(base, base * vec3(1.45, 1.12, 0.5) + vec3(0.03, 0.018, 0.0), mv.y * 0.55 * grassy);
          base *= vec3(0.9 + 0.2 * aOffset.z, 0.92 + 0.16 * fract(aOffset.z * 7.3), 0.9);
          // seasons: autumn straw-gold, winter dead brown stems poking through snow
          base = mix(base, base * vec3(1.6, 1.0, 0.38) + vec3(0.035, 0.016, 0.0), uAutumn * (0.72 + 0.25 * aOffset.z));
          base = mix(base, vec3(0.12, 0.1, 0.065), uWinter * 0.65);
          vec3 tipC = base * vec3(1.08, 1.22, 0.9) + vec3(0.02, 0.026, 0.004);
          vGrassCol = mix(base * 0.5, tipC, t) * (0.85 + 0.3 * vnoise(wp * 0.08));
          vGrassCol = mix(vGrassCol, vec3(0.66, 0.69, 0.74), max(uSnow, uWinter * 0.55) * 0.6 * t);
          vTip = t;
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vGrassCol; varying float vTip;`)
        .replace('#include <color_fragment>', `diffuseColor.rgb = vGrassCol;`);
    };
    mat.customProgramCacheKey = () => 'grass-v4';
    { const _obc = mat.onBeforeCompile; mat.onBeforeCompile = (s) => { _obc(s); atmospherePatch(s); s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + TRANSLUCENCY(0.6, 0.35)); }; }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  update(camPos) {
    this.uniforms.uCam.value.set(camPos.x, camPos.z);
  }

  // pushers: [{ x, y, z, r }], nearest first (up to 8)
  setPushers(list) {
    const U8 = this.uniforms.uPush.value;
    for (let i = 0; i < 8; i++) {
      const q = list[i];
      if (q) U8[i].set(q.x, q.y, q.z, q.r); else U8[i].set(0, -9999, 0, 0);
    }
  }
}
