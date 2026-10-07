// Global atmosphere layer injected into every lit material:
//  - height-based exponential fog with aerial perspective and sun in-scattering (haze glows toward the sun)
//  - moving cloud shadows that sweep across terrain, trees and creatures
//  - captures the shadowed sun irradiance so foliage/skin shaders can add light transmission
import * as THREE from 'three';

export const A = {
  uInvView: { value: new THREE.Matrix4() },
  uSunDirA: { value: new THREE.Vector3(0, 1, 0) },
  uSunColA: { value: new THREE.Color(1, 1, 1) },
  uCloudCoverA: { value: 0.3 },
  uCloudOffA: { value: new THREE.Vector2() },
  uHazeA: { value: 1 },
  uFogBaseA: { value: 0 },
};

const PARS = /* glsl */ `
uniform mat4 uInvView; uniform vec3 uSunDirA; uniform vec3 uSunColA; uniform float uCloudCoverA; uniform vec2 uCloudOffA;
uniform float uHazeA; uniform float uFogBaseA;
float aHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float aNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(aHash(i), aHash(i+vec2(1,0)), u.x), mix(aHash(i+vec2(0,1)), aHash(i+vec2(1,1)), u.x), u.y); }
float aCloudShadowAt(vec2 xz){
  if (uCloudCoverA < 0.02) return 1.0;
  vec2 uv = xz * 0.0011 + uCloudOffA * 1.3;
  float n = aNoise(uv) * 0.55 + aNoise(uv * 2.13 + 4.7) * 0.3 + aNoise(uv * 4.7 + 1.3) * 0.15;
  float c = smoothstep(1.0 - uCloudCoverA - 0.05, 1.0 - uCloudCoverA + 0.25, n);
  return 1.0 - c * (0.55 + 0.25 * uCloudCoverA);
}
`;

const FOG = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 aWP = (uInvView * vec4(-vViewPosition, 1.0)).xyz;
    vec3 aRay = aWP - cameraPosition;
    float aDist = length(aRay);
    vec3 aDir = aRay / max(aDist, 0.001);
    // exponential height fog integrated along the view ray
    float hf = 0.0055;
    float h0 = clamp(cameraPosition.y - uFogBaseA, -30.0, 3000.0);
    float h1 = clamp(aWP.y - uFogBaseA, -30.0, 3000.0);
    float dh = h1 - h0;
    float hInt = abs(dh) > 0.5 ? (exp(-hf * h0) - exp(-hf * h1)) / (hf * dh) : exp(-hf * h0);
    float hTerm = clamp(0.22 + 1.6 * hInt, 0.0, 2.4) * uHazeA;
    float d = fogDensity * aDist;
    float aFog = 1.0 - exp(-(d * d * hTerm + d * 0.22 * hTerm));
    // sun in-scattering: haze glows warm toward the sun
    float sunAmt = pow(max(dot(aDir, uSunDirA), 0.0), 7.0) * smoothstep(-0.05, 0.15, uSunDirA.y);
    vec3 aFogCol = mix(fogColor, uSunColA * 0.9 + fogColor * 0.35, sunAmt * 0.65);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, aFogCol, clamp(aFog, 0.0, 1.0));
  }
#endif
`;

let patchedLights = null;
function lightsChunk() {
  if (patchedLights) return patchedLights;
  let s = THREE.ShaderChunk.lights_fragment_begin;
  s = 'float aCloudShadow = aCloudShadowAt((uInvView * vec4(-vViewPosition, 1.0)).xz);\nvec3 aSunDirect = vec3(0.0);\n' + s;
  const a = s.indexOf('getDirectionalLightInfo( directionalLight, directLight );');
  const b = s.indexOf('RE_Direct(', a);
  if (a >= 0 && b > a) {
    s = s.slice(0, a) + 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= aCloudShadow;' +
      s.slice(a + 'getDirectionalLightInfo( directionalLight, directLight );'.length, b) +
      '#if ( UNROLLED_LOOP_INDEX == 0 )\n\t\taSunDirect = directLight.color;\n\t\t#endif\n\t\t' + s.slice(b);
  }
  patchedLights = s;
  return s;
}

// Apply to a shader inside onBeforeCompile
export function atmospherePatch(shader) {
  const fs = shader.fragmentShader;
  if (!fs.includes('#include <lights_fragment_begin>')) return shader;
  for (const k of Object.keys(A)) shader.uniforms[k] = A[k];
  shader.fragmentShader = fs
    .replace('#include <common>', '#include <common>\n' + PARS)
    .replace('#include <lights_fragment_begin>', lightsChunk())
    .replace('#include <fog_fragment>', FOG);
  return shader;
}

// Install for every material that doesn't define its own onBeforeCompile
export function installAtmosphere() {
  THREE.Material.prototype.onBeforeCompile = function (shader) { atmospherePatch(shader); };
}

// Light transmission for thin geometry (leaves, grass, membranes): add after lights_fragment_end
export const TRANSLUCENCY = (strength = 0.6, wrap = 0.25) => /* glsl */ `
  {
    vec3 tSunV = normalize((viewMatrix * vec4(uSunDirA, 0.0)).xyz);
    vec3 tView = normalize(-vViewPosition);
    float tBack = pow(max(dot(tView, tSunV), 0.0), 3.0);
    float tWrap = max(dot(-normal, tSunV), 0.0);
    reflectedLight.directDiffuse += diffuseColor.rgb * aSunDirect * (tBack * ${strength.toFixed(2)} + tWrap * ${wrap.toFixed(2)});
  }
`;

export function updateAtmosphere(camera, sunDir, sunColor, cloudCover, cloudOffset, haze = 1) {
  A.uInvView.value.copy(camera.matrixWorld);
  A.uSunDirA.value.copy(sunDir);
  A.uSunColA.value.copy(sunColor);
  A.uCloudCoverA.value = cloudCover;
  A.uCloudOffA.value.copy(cloudOffset);
  A.uHazeA.value = haze;
}
