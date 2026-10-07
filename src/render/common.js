// Shared uniforms and GLSL snippets used by many custom materials.
import * as THREE from 'three';
import { WORLD } from '../world/design.js';

export const U = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
  uWindStrength: { value: 0.4 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
  uSunUp: { value: 1 }, // 1 when the sun (not moon) is the key light
  uHeightTex: { value: null },
  uMaskTex: { value: null },
  uGridParams: { value: new THREE.Vector4(WORLD.HALF, WORLD.CELL, WORLD.N + 1, 0) },
  uWetness: { value: 0 },
  uSnowCover: { value: 0 },
  uCloudTex: { value: null },
  uCloudOffset: { value: new THREE.Vector2() },
  uCloudCover: { value: 0.45 },
  uCloudShadow: { value: 0.6 },
  uPlayerPos: { value: new THREE.Vector3() },
  uCaveHoles: { value: [new THREE.Vector4(0, -9999, 0, 0), new THREE.Vector4(0, -9999, 0, 0), new THREE.Vector4(0, -9999, 0, 0), new THREE.Vector4(0, -9999, 0, 0)] },
  uNoiseTex: { value: null },
  uLightning: { value: 0 },
};

// world xz -> uv on grid textures (texel centres at grid samples)
export const GLSL_GRID = /* glsl */ `
uniform sampler2D uHeightTex;
uniform vec4 uGridParams; // half, cell, samples
vec2 gridUV(vec2 xz) {
  return ((xz + uGridParams.x) / uGridParams.y + 0.5) / uGridParams.z;
}
float terrainHeight(vec2 xz) {
  return texture2D(uHeightTex, gridUV(xz)).r;
}
`;

export const GLSL_TERRAIN_SHADOW = /* glsl */ `
// Ray-march the heightfield toward the sun: long-distance soft terrain shadows
float terrainShadow(vec3 p, vec3 L) {
  if (L.y < -0.02) return 0.0;
  float sh = 1.0;
  float t = 3.0;
  p.y = max(p.y, terrainHeight(p.xz) + 0.6);
  for (int i = 0; i < 22; i++) {
    vec3 q = p + L * t;
    float h = terrainHeight(q.xz);
    float d = q.y - h;
    sh = min(sh, clamp(d / (t * 0.045) + 0.35, 0.0, 1.0));
    if (sh <= 0.0) break;
    t = t * 1.42 + 1.5;
    if (t > 7000.0) break;
  }
  return sh;
}
`;

export const GLSL_CLOUD_SHADOW = /* glsl */ `
uniform sampler2D uCloudTex;
uniform vec2 uCloudOffset;
uniform float uCloudCover;
uniform float uCloudShadow;
float cloudShadow(vec3 p, vec3 L) {
  float ly = max(L.y, 0.08);
  vec2 q = p.xz + L.xz / ly * max(1900.0 - p.y, 0.0);
  float n = texture2D(uCloudTex, (q + uCloudOffset) / 14000.0).r;
  float n2 = texture2D(uCloudTex, (q + uCloudOffset * 1.3) / 4300.0).g;
  float d = n * 0.75 + n2 * 0.25;
  float c = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.22, d);
  return 1.0 - c * uCloudShadow;
}
`;

export const GLSL_WIND = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
vec2 windOffset(vec3 wp, float flex) {
  float t = uTime;
  float gust = sin(dot(wp.xz, uWindDir) * 0.018 - t * 1.3) * 0.5 + 0.5;
  gust = gust * gust;
  float sway = sin(t * 1.7 + wp.x * 0.11 + wp.z * 0.07) * 0.6 + sin(t * 2.9 + wp.z * 0.23) * 0.25;
  float s = uWindStrength * flex * (0.25 + gust * 0.9);
  return uWindDir * s * (0.6 + 0.4 * sway) + vec2(-uWindDir.y, uWindDir.x) * s * 0.25 * sway;
}
`;

// Patch helper: inject a varying world position and sun visibility into a built-in material.
// mode: { terrainShadow: 'vertex' | 'fragment' | false, cloudShadow: bool }
export function patchSunVisibility(shader, mode = {}) {
  const ts = mode.terrainShadow || false;
  const cs = mode.cloudShadow !== false;
  shader.uniforms.uHeightTex = U.uHeightTex;
  shader.uniforms.uGridParams = U.uGridParams;
  shader.uniforms.uCloudTex = U.uCloudTex;
  shader.uniforms.uCloudOffset = U.uCloudOffset;
  shader.uniforms.uCloudCover = U.uCloudCover;
  shader.uniforms.uCloudShadow = U.uCloudShadow;
  shader.uniforms.uSunDir = U.uSunDir;

  let vsHead = `
varying vec3 vWorldPos;
uniform vec3 uSunDir;
${GLSL_GRID}
${ts === 'vertex' ? GLSL_TERRAIN_SHADOW + '\nvarying float vTerrainSh;' : ''}
`;
  if (!shader.vertexShader.includes('varying vec3 vWorldPos;')) {
    shader.vertexShader = vsHead + shader.vertexShader;
  } else {
    shader.vertexShader = shader.vertexShader.replace('varying vec3 vWorldPos;', vsHead);
  }
  let worldCalc = `
  {
    vec4 wpp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wpp = instanceMatrix * wpp;
    #endif
    vWorldPos = (modelMatrix * wpp).xyz;
    ${ts === 'vertex' ? 'vTerrainSh = terrainShadow(vWorldPos + vec3(0.0, 1.0, 0.0), uSunDir);' : ''}
  }
`;
  if (shader.vertexShader.includes('// __WORLDPOS_SET__')) worldCalc = ts === 'vertex' ? 'vTerrainSh = terrainShadow(vWorldPos + vec3(0.0, 1.0, 0.0), uSunDir);' : '';
  shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n' + worldCalc);

  const fsHead = `
varying vec3 vWorldPos;
uniform vec3 uSunDir;
${ts === 'fragment' ? GLSL_GRID + GLSL_TERRAIN_SHADOW : ''}
${ts === 'vertex' ? 'varying float vTerrainSh;' : ''}
${cs ? GLSL_CLOUD_SHADOW : ''}
`;
  if (!shader.fragmentShader.includes('varying vec3 vWorldPos;')) {
    shader.fragmentShader = fsHead + shader.fragmentShader;
  } else {
    shader.fragmentShader = shader.fragmentShader.replace('varying vec3 vWorldPos;', fsHead);
  }
  let vis = '1.0';
  if (ts === 'fragment') vis += ' * terrainShadow(vWorldPos + vec3(0.0, 0.5, 0.0), uSunDir)';
  if (ts === 'vertex') vis += ' * vTerrainSh';
  if (cs) vis += ' * cloudShadow(vWorldPos, uSunDir)';
  shader.fragmentShader = shader.fragmentShader.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= sunVis;'
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_begin>',
    `float sunVis = ${vis};\n#include <lights_fragment_begin>`
  );
}

// Chain several onBeforeCompile hooks on a material.
export function addCompileHook(material, fn, key) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    fn(shader, renderer);
  };
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => prevKey + '|' + key;
}
