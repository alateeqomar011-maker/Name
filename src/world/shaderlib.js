// Shared shader uniforms and GLSL snippets.
import * as THREE from 'three';
import { atmospherePatch, TRANSLUCENCY } from './atmosphere.js';

export const U = {
  uTime: { value: 0 },
  uWind: { value: 0.3 }, // 0..1.5
  uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() },
  uWet: { value: 0 }, // surface wetness 0..1
  uSnow: { value: 0 }, // snow accumulation 0..1
  uRain: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSkyColor: { value: new THREE.Color(0.5, 0.7, 1) },
  uHorizon: { value: new THREE.Color(0.8, 0.85, 0.9) },
  uFogColor: { value: new THREE.Color(0.8, 0.85, 0.9) },
  uFogDensity: { value: 0.0006 },
  uCamPos: { value: new THREE.Vector3() },
  uFlash: { value: 0 },
  uNight: { value: 0 },
  uAutumn: { value: 0 }, // seasons ease between 0 and 1
  uWinter: { value: 0 },
};

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm3(vec2 p){ float s = 0.0; float a = 0.5; for(int i=0;i<3;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s/0.875; }
`;

// Macro meadow variation shared by terrain and grass so blades always match the ground beneath:
// x = lush green hollows, y = sun-dried golden drifts
export const GLSL_MEADOW = /* glsl */ `
vec2 meadowVar(vec2 wp){
  float lushN = vnoise(wp * 0.018) * 0.7 + vnoise(wp * 0.07) * 0.3;
  float dryN = vnoise(wp * 0.0105 + 17.0) * 0.6 + vnoise(wp * 0.043 + 3.0) * 0.4;
  return vec2(smoothstep(0.35, 0.75, lushN), smoothstep(0.52, 0.78, dryN) * (1.0 - smoothstep(0.35, 0.75, lushN) * 0.7));
}
`;

// Manual bilinear sampling of the world height grid (texture of size N x N covering the world)
export const GLSL_HEIGHT = /* glsl */ `
uniform sampler2D uHeightTex;
float worldHeight(vec2 xz){
  float N = 1025.0;
  vec2 g = (xz + 2048.0) / 4.0;
  g = clamp(g, vec2(0.0), vec2(N - 1.001));
  vec2 c = floor(g); vec2 f = g - c;
  float ha = texture2D(uHeightTex, (c + vec2(0.5,0.5)) / N).r;
  float hb = texture2D(uHeightTex, (c + vec2(1.5,0.5)) / N).r;
  float hc = texture2D(uHeightTex, (c + vec2(0.5,1.5)) / N).r;
  float hd = texture2D(uHeightTex, (c + vec2(1.5,1.5)) / N).r;
  if (f.x + f.y <= 1.0) return ha + (hb-ha)*f.x + (hc-ha)*f.y;
  return hd + (hc-hd)*(1.0-f.x) + (hb-hd)*(1.0-f.y);
}
`;

// Wind sway injected into vegetation materials (expects attribute aSway, instancing)
// Vertex snippets shared by the foliage colour and shadow-depth materials
const windPars = `
  attribute float aSway;
  uniform float uTime; uniform float uWind; uniform vec2 uWindDir;
  varying vec3 vSeasonW; varying vec3 vSeasonSeed;`;
const windMain = (strength) => `
        {
          vec3 ip = vec3(0.0);
          vec3 wd = vec3(uWindDir.x, 0.0, uWindDir.y);
          #ifdef USE_INSTANCING
            ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            mat3 im = mat3(instanceMatrix);
            wd = transpose(im) * wd / max(dot(im[0], im[0]), 0.0001);
          #endif
          float ph = uTime * (1.3 + uWind * 0.9) + ip.x * 0.11 + ip.z * 0.13;
          float gust = 0.55 + 0.45 * sin(uTime * 0.37 + ip.x * 0.01);
          float sw = aSway * (0.25 + uWind) * ${strength.toFixed(2)};
          transformed.x += sw * (wd.x * (0.6 + 0.4*sin(ph)) * gust + 0.18 * sin(ph * 2.7 + position.y * 1.3));
          transformed.z += sw * (wd.z * (0.6 + 0.4*sin(ph*0.9)) * gust + 0.18 * cos(ph * 2.3 + position.x * 1.7));
        }`;
const seasonVert = `
        {
          vec4 swp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            swp = instanceMatrix * swp;
            vSeasonSeed = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vSeasonSeed = vec3(0.0);
          #endif
          vSeasonW = (modelMatrix * swp).xyz;
        }`;
// which leaf-atlas tile a fragment samples, and whether that foliage is deciduous
const leafTile = `
  #ifdef USE_MAP
    float tile = floor((1.0 - vMapUv.y) * 3.0) * 4.0 + floor(vMapUv.x * 4.0);
  #else
    float tile = 0.0;
  #endif
  float decid = (abs(tile - 0.0) < 0.5 || abs(tile - 9.0) < 0.5 || abs(tile - 10.0) < 0.5 || abs(tile - 7.0) < 0.5) ? 1.0 : 0.0;
  float sh = fract(sin(dot(vSeasonSeed.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float drop = vnoise(vSeasonW.xz * 1.9 + vSeasonW.y * 1.3) * 0.7 + sh * 0.3;`;

// Shadow-depth material for foliage: sways with the wind and loses its leaves in winter like the visible canopy
export function foliageDepthMaterial(map, strength = 1) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime; shader.uniforms.uWind = U.uWind; shader.uniforms.uWindDir = U.uWindDir; shader.uniforms.uWinter = U.uWinter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + windPars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + windMain(strength))
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + seasonVert);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWinter; varying vec3 vSeasonW; varying vec3 vSeasonSeed;
        ${GLSL_NOISE}`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        {
          ${leafTile}
          if (decid > 0.5 && drop < uWinter * 0.93) discard;
        }`);
  };
  m.customProgramCacheKey = () => 'foliageDepth' + strength;
  return m;
}

// seasonal: 'leaf' (autumn colours, winter leaf drop + frost) or 'bark' (winter snow on branches)
export function addWind(material, strength = 1, translucent = false, seasonal = null) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uWind = U.uWind;
    shader.uniforms.uWindDir = U.uWindDir;
    shader.uniforms.uAutumn = U.uAutumn;
    shader.uniforms.uWinter = U.uWinter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + windPars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + windMain(strength))
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + seasonVert);
    if (seasonal) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uAutumn; uniform float uWinter;
          varying vec3 vSeasonW; varying vec3 vSeasonSeed;
          ${GLSL_NOISE}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 wN = inverseTransformDirection(normal, viewMatrix);
            ${seasonal === 'leaf' ? `
            ${leafTile}
            float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            float hn = fract(sh + vnoise(vSeasonW.xz * 0.35) * 0.35);
            vec3 au = hn < 0.3 ? vec3(0.55, 0.12, 0.03) : hn < 0.62 ? vec3(0.78, 0.36, 0.05) : vec3(0.74, 0.58, 0.1);
            au = mix(au, vec3(0.32, 0.2, 0.08), smoothstep(0.85, 1.0, hn));
            diffuseColor.rgb = mix(diffuseColor.rgb, au * (0.22 + lum * 1.7), uAutumn * decid * (0.75 + 0.25 * sh));
            // winter: broadleaf crowns go bare; what remains is dull and frosted
            if (decid > 0.5 && drop < uWinter * 0.93) discard;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.9, 0.85, 0.7), uWinter * decid * 0.6);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.75, 0.85, 0.8), uWinter * (1.0 - decid) * 0.4);
            float snowTop = smoothstep(0.05, 0.6, wN.y + (vnoise(vSeasonW.xz * 2.3) - 0.5) * 0.5) * uWinter;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.71, 0.76), snowTop * 0.8);
            ` : `
            float snowTop = smoothstep(0.25, 0.75, wN.y + (vnoise(vSeasonW.xz * 3.0 + vSeasonW.y) - 0.5) * 0.4) * uWinter;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.71, 0.76), snowTop * 0.9);
            `}
          }`);
    }
    atmospherePatch(shader);
    if (translucent) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + TRANSLUCENCY(0.75, 0.3));
  };
  material.customProgramCacheKey = () => 'wind' + strength + (translucent ? 't' : '') + (seasonal || '');
  return material;
}
