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
};

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm3(vec2 p){ float s = 0.0; float a = 0.5; for(int i=0;i<3;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s/0.875; }
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
export function addWind(material, strength = 1, translucent = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uWind = U.uWind;
    shader.uniforms.uWindDir = U.uWindDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSway;
        uniform float uTime; uniform float uWind; uniform vec2 uWindDir;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
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
        }`);
    atmospherePatch(shader);
    if (translucent) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + TRANSLUCENCY(0.75, 0.3));
  };
  material.customProgramCacheKey = () => 'wind' + strength + (translucent ? 't' : '');
  return material;
}
