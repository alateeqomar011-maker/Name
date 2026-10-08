// Ocean, rivers and waterfalls with animated, depth-aware shading.
import * as THREE from 'three';
import { U, GLSL_NOISE, GLSL_HEIGHT } from './shaderlib.js';
import { SSR_U, LAYER_WATER, LAYER_OVERLAY } from '../systems/postfx.js';
import { A } from './atmosphere.js';
import { TerrainTextures } from './materials.js';

// stand-ins until (or if) the ocean detail textures load
function dummyArray() {
  const t = new THREE.DataArrayTexture(new Uint8Array([128, 128, 0, 255]), 1, 1, 1);
  t.needsUpdate = true;
  return t;
}

// Ocean swell: six Gerstner waves spread around the wind direction (wavelength m, relative height,
// phase); the FFT detail texture adds the short chop on top in the fragment shader
const GERSTNER = /* glsl */ `
const vec2 GD[6] = vec2[6](vec2(0.86, 0.5), vec2(0.66, 0.75), vec2(0.97, 0.12), vec2(0.36, 0.93), vec2(0.99, -0.16), vec2(0.78, 0.63));
const float GL[6] = float[6](92.0, 61.0, 43.0, 29.0, 19.0, 13.0);
const float GA[6] = float[6](0.45, 0.3, 0.2, 0.13, 0.08, 0.05);
const float GP[6] = float[6](0.0, 1.7, 4.1, 2.3, 5.3, 0.9);
uniform sampler2D uShoreTex;
float shoreDist(vec2 xz) { return texture2D(uShoreTex, ((xz + 2048.0) / 4.0 + 0.5) / 1025.0).r * 127.5; }
// waves that roll in square to the coast, steepen and break: phase grows with distance offshore
float surfPhase(vec2 xz, float sd) { return sd * 0.45 + uTime * 1.05 + vnoise(xz * 0.012) * 4.0; }
float surfAmp(float sd) { return 0.22 * (0.4 + uWaveAmp) * smoothstep(1.0, 10.0, sd) * (1.0 - smoothstep(25.0, 60.0, sd)); }
`;

const waterVert = /* glsl */ `
uniform float uTime; uniform float uWaveAmp; uniform float uLevel; uniform vec3 uOrigin;
attribute float aFlow; attribute float aSteep;
varying vec3 vWPos; varying float vDepth; varying vec2 vFlowUV; varying float vSteep; varying vec3 vWaveN; varying vec2 vBase;
${GLSL_NOISE}
${GLSL_HEIGHT}
${GERSTNER}
void main(){
  vec3 p = position;
  #ifdef OCEAN
    p += uOrigin;
    p.y = uLevel;
  #endif
  float ground = worldHeight(p.xz);
  float depth = p.y - ground;
  vec3 n = vec3(0.0, 1.0, 0.0);
  vBase = p.xz;
  #ifdef OCEAN
    float sd = shoreDist(p.xz);
    float camR = length(p.xz - cameraPosition.xz);
    // swells die out in the shallows, where the surf takes over
    float amp = uWaveAmp * smoothstep(0.0, 7.0, depth) * smoothstep(6.0, 40.0, sd + depth * 2.0);
    vec3 disp = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float k = 6.2831853 / GL[i];
      float a = GA[i] * amp * (1.0 - smoothstep(GL[i] * 2.5, GL[i] * 6.0, camR));
      float ph = k * dot(GD[i], p.xz) - sqrt(9.81 * k) * uTime + GP[i];
      float q = 0.6 / (k * GA[i] * 1.3 * 6.0);
      disp.xz += q * a * GD[i] * cos(ph);
      disp.y += a * sin(ph);
    }
    float sph = surfPhase(p.xz, sd);
    disp.y += surfAmp(sd) * (pow(0.5 + 0.5 * sin(sph), 3.0) - 0.3);
    // swash: the waterline runs up the sand and drains back
    disp.y += 0.16 * (0.5 + 0.5 * sin(sph - 0.6)) * (1.0 - smoothstep(0.0, 6.0, sd));
    p += disp;
  #else
    p.y += uLevel;
  #endif
  vDepth = depth;
  vWPos = p;
  vFlowUV = vec2(uv.x, aFlow);
  vSteep = aSteep;
  vWaveN = n;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const waterFrag = /* glsl */ `
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uHorizon; uniform vec3 uZenith;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uRain; uniform float uNight; uniform sampler2D uMaskTex;
uniform float uFlash; uniform float uUnder;
uniform sampler2D tSceneColor; uniform sampler2D tSceneDepth; uniform vec2 uResolution; uniform float uCamNear; uniform float uCamFar; uniform float uSSR;
uniform mat4 projectionMatrix; uniform float uMistA; uniform float uMistBase; uniform vec4 uRip[12];
uniform float uWaveAmp; uniform sampler2DArray uWaveTex; uniform sampler2D uFoamTex; uniform float uWaveOK; uniform vec4 uFalls[8];
varying vec3 vWPos; varying float vDepth; varying vec2 vFlowUV; varying float vSteep; varying vec3 vWaveN; varying vec2 vBase;
${GLSL_NOISE}
${GLSL_HEIGHT}
${GERSTNER}
// looping FFT sea: slope xz (scaled back to real slopes) and whitecap coverage, frames blended
vec3 fftSea(vec2 uv, float t) {
  float fr = t * 4.0;
  float f0 = mod(floor(fr), 24.0), f1 = mod(f0 + 1.0, 24.0);
  vec3 a = texture(uWaveTex, vec3(uv, f0)).rgb, b = texture(uWaveTex, vec3(uv, f1)).rgb;
  vec3 c = mix(a, b, fract(fr));
  return vec3((c.xy - 0.5) * 0.5894, c.z);
}
float foamTex(vec2 uv) { return texture2D(uFoamTex, uv).r; }
// sparse bubbles at low coverage, an unbroken blanket at full coverage
float foamCover(float cov, float pat) {
  // the pattern is mostly dark film with bright bubble walls: thick foam fills in towards white
  float p = pat * (1.0 - cov * 0.45) + cov * 0.45;
  return smoothstep(1.0 - cov, 1.0 - cov + 0.3, p) * min(1.0, cov * 1.8);
}
float ssrViewZFromD(float d){ return (uCamNear * uCamFar) / ((uCamFar - uCamNear) * d - uCamFar); }
float ssrViewZ(vec2 uv){ return ssrViewZFromD(texture2D(tSceneDepth, uv).r); }
vec2 nGrad(vec2 p){ float e = 0.08; float h = vnoise(p); return vec2(vnoise(p + vec2(e,0.0)) - h, vnoise(p + vec2(0.0,e)) - h) / e; }
void main(){
  vec3 V = normalize(cameraPosition - vWPos);
  float dist = length(cameraPosition - vWPos);
  vec2 g = vec2(0.0);
  float detail = 1.0 - smoothstep(80.0, 600.0, dist);
  float whitecap = 0.0, crestF = 0.0, surfFoam = 0.0;
  vec2 swell = vec2(0.0); float swellY = 0.0;
  #ifdef OCEAN
    float depth0 = max(vWPos.y - worldHeight(vBase), 0.0);
    float sd = shoreDist(vBase);
    float foot = length(fwidth(vBase));
    // swell normals per pixel (no interpolation blur on the coarse far rings)
    float amp = uWaveAmp * smoothstep(0.0, 7.0, depth0) * smoothstep(6.0, 40.0, sd + depth0 * 2.0);
    for (int i = 0; i < 6; i++) {
      float k = 6.2831853 / GL[i];
      float a = GA[i] * amp * (1.0 - smoothstep(GL[i] * 0.1, GL[i] * 0.3, foot));
      float ph = k * dot(GD[i], vBase) - sqrt(9.81 * k) * uTime + GP[i];
      float q = 0.6 / (k * GA[i] * 1.3 * 6.0);
      swell += a * k * cos(ph) * GD[i];
      swellY += q * a * k * sin(ph);
    }
    crestF = smoothstep(0.32, 0.6, swellY) * smoothstep(0.5, 1.1, uWaveAmp);
    // surf: slope of the breaking rollers along the shore-distance gradient
    float e = 3.0;
    vec2 sdg = vec2(shoreDist(vBase + vec2(e, 0.0)) - shoreDist(vBase - vec2(e, 0.0)), shoreDist(vBase + vec2(0.0, e)) - shoreDist(vBase - vec2(0.0, e))) / (2.0 * e);
    float sph = surfPhase(vBase, sd);
    float sA = surfAmp(sd);
    float sw = 0.5 + 0.5 * sin(sph);
    swell += sA * 3.0 * sw * sw * 0.5 * cos(sph) * 0.45 * sdg;
    // breakers: foam on the crest as it pitches over, a decaying trail behind it, the swash sheet
    float crest = pow(sw, 3.0);
    float since = fract((sph - 1.5708) / 6.2831853);
    float breakZ = smoothstep(26.0, 12.0, sd) * smoothstep(0.5, 4.0, sd);
    // sets break in sections: the roller peels along the beach rather than one solid line
    float peel = smoothstep(0.25, 0.75, vnoise(vBase * 0.035 + vec2(uTime * 0.03, 0.0)) * 0.7 + vnoise(vBase * 0.11) * 0.3);
    surfFoam = smoothstep(0.45, 0.9, crest) * breakZ * (0.35 + 0.65 * peel);
    surfFoam = max(surfFoam, exp(-since * 3.2) * smoothstep(24.0, 5.0, sd) * (0.5 + 0.4 * peel));
    surfFoam = max(surfFoam, (1.0 - smoothstep(2.0, 8.0, sd)) * (0.5 + 0.45 * (0.5 + 0.5 * sin(sph - 0.6))));
    surfFoam *= 0.7 + 0.3 * smoothstep(0.2, 0.9, uWaveAmp);
    if (uWaveOK > 0.5) {
      // short chop from the FFT sea at two scales and orientations
      vec2 bw = vBase + vec2(0.86, 0.5) * uTime * 0.9;
      vec3 c1 = fftSea(bw / 48.0, uTime);
      mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      vec3 c2 = fftSea(rot * vBase / 13.5 + 0.37, uTime * 1.31 + 2.0);
      float windK = 0.55 + 0.6 * uWaveAmp;
      g += (c1.xy + c2.xy * 0.45) * windK * (0.35 + 0.65 * detail);
      whitecap = c1.z * smoothstep(0.45, 1.15, uWaveAmp);
    } else {
      g += nGrad(vWPos.xz * 0.35 + vec2(uTime * 0.05, uTime * 0.03)) * 0.18;
      g += nGrad(vWPos.xz * 0.9 - vec2(uTime * 0.07, -uTime * 0.04)) * 0.1;
      g += nGrad(vWPos.xz * 2.4 + vec2(uTime * 0.12, 0.0)) * 0.05 * detail;
    }
  #else
    float sp = 0.6 + vSteep * 3.0;
    vec2 fuv = vec2(vFlowUV.x * 3.0, vFlowUV.y * 0.25 - uTime * sp);
    if (uWaveOK > 0.5) {
      // the FFT chop carried downstream, squeezed along the current
      vec3 c1 = fftSea(vec2(vFlowUV.x * 2.2, vFlowUV.y / 9.0 - uTime * sp * 0.11), uTime * 1.6);
      vec3 c2 = fftSea(vec2(vFlowUV.x * 5.0 + 0.3, vFlowUV.y / 3.5 - uTime * sp * 0.3), uTime * 2.1 + 3.0);
      g += (c1.xy + c2.xy * 0.5) * (0.7 + vSteep * 1.2);
    } else {
      g += nGrad(fuv * vec2(1.0, 1.0)) * 0.22;
      g += nGrad(fuv * 2.7 + 5.0) * 0.12;
    }
  #endif
  // rain ripples
  if (uRain > 0.01) {
    vec2 rp = vWPos.xz * 1.6;
    vec2 cell = floor(rp); vec2 f = fract(rp) - 0.5;
    float h = hash12(cell);
    float t = fract(uTime * 0.9 + h);
    float r = length(f) - t * 0.5;
    float ring = exp(-r * r * 400.0) * (1.0 - t) * uRain * detail;
    g += normalize(f + 0.0001) * ring * 0.9;
  }
  // expanding ripple rings from wading, swimming, footfalls and leaping fish
  float ripFoam = 0.0;
  for (int k = 0; k < 12; k++) {
    vec4 rp = uRip[k];
    float age = uTime - rp.z;
    if (rp.w <= 0.0 || age < 0.0 || age > 4.5) continue;
    vec2 dv = vWPos.xz - rp.xy;
    float dd = length(dv);
    float x = dd - age * (1.6 + rp.w * 0.8);
    float env = exp(-x * x * 5.0) * (1.0 - age / 4.5) * rp.w / (1.0 + dd * 0.15);
    g += (dv / max(dd, 0.01)) * env * 0.85 * cos(x * 10.0);
    ripFoam += exp(-dd * dd * 2.0 / (rp.w + 0.2)) * smoothstep(1.2, 0.0, age) * rp.w * 0.45;
  }
  vec3 N = normalize(vec3(-swell.x, 1.0 - swellY, -swell.y) + vec3(-g.x, 0.0, -g.y) * detail + vec3(-g.x, 0.0, -g.y) * 0.25);
  if (!gl_FrontFacing) N = -N;
  float fres = 0.02 + 0.75 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uZenith, pow(max(R.y, 0.0), 0.5)) * 0.82;
  float spec = pow(max(dot(R, uSunDir), 0.0), 380.0) * 6.0 + pow(max(dot(R, uSunDir), 0.0), 40.0) * 0.25;
  spec *= smoothstep(-0.05, 0.1, uSunDir.y) * (1.0 - uRain * 0.7);
  vec2 muv = (vWPos.xz + 2048.0) / 4096.0;
  vec4 mask = texture2D(uMaskTex, muv);
  // per-pixel depth from the heightfield (river strips only have vertices on the banks)
  float depth = max(vWPos.y - worldHeight(vWPos.xz), 0.0);
  vec3 shallow = vec3(0.07, 0.42, 0.42);
  vec3 deep = vec3(0.005, 0.05, 0.1);
  #ifndef OCEAN
    shallow = vec3(0.12, 0.33, 0.28); deep = vec3(0.02, 0.09, 0.1);
  #endif
  vec3 body = mix(shallow, deep, 1.0 - exp(-depth * 0.18));
  body = mix(body, vec3(0.05, 0.06, 0.02), mask.r * 0.85);
  float dayL = mix(0.06, 1.0, 1.0 - uNight);
  body *= dayL * (0.65 + 0.35 * max(uSunDir.y, 0.0));
  // subsurface glow on wave crests facing sun
  body += vec3(0.0, 0.08, 0.07) * max(dot(V, -uSunDir), 0.0) * (1.0 - uNight) * 0.6;
  vec3 col;
  float opaqueOut = 0.0;
  if (uSSR > 0.5 && gl_FrontFacing) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    vec3 vp = (viewMatrix * vec4(vWPos, 1.0)).xyz;
    float wz = -vp.z;
    // refraction of the bed through the moving surface (never pull in objects in front of the water)
    vec2 roff = vec2(g.x, -g.y) * 0.03 * (0.4 + 0.6 * detail) / max(1.0, wz * 0.035);
    vec2 ruv = clamp(suv + roff, vec2(0.001), vec2(0.999));
    float sz = -ssrViewZ(ruv);
    if (sz < wz) { ruv = suv; sz = -ssrViewZ(suv); }
    float thick = clamp(sz - wz, 0.0, 400.0);
    vec3 refr = texture2D(tSceneColor, ruv).rgb;
    #ifdef OCEAN
      vec3 sigma = vec3(0.34, 0.07, 0.05);
    #else
      vec3 sigma = mix(vec3(0.42, 0.13, 0.11), vec3(1.2, 1.0, 1.35), mask.r);
    #endif
    vec3 trans = exp(-sigma * thick);
    // in-scattered light from the water volume itself: dim, the colour of deep water
    #ifdef OCEAN
      vec3 scat = body * 0.42;
    #else
      vec3 scat = body * mix(0.26, 0.4, mask.r);
    #endif
    vec3 under = refr * trans + scat * (1.0 - trans);
    // screen-space reflection march with binary refinement
    vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
    vec3 Rv = normalize(reflect(normalize(vp), Nv));
    vec3 refl = sky;
    float hitA = 0.0;
    vec3 rp = vp;
    float stepL = 0.3 + wz * 0.018;
    for (int i = 0; i < 30; i++) {
      vec3 prev = rp;
      rp += Rv * stepL;
      vec4 cp = projectionMatrix * vec4(rp, 1.0);
      if (cp.w <= 0.0) break;
      vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float d = texture2D(tSceneDepth, uv).r;
      if (d < 0.99999) {
        float sceneZ = -ssrViewZFromD(d);
        float rz = -rp.z;
        if (rz > sceneZ && rz - sceneZ < stepL * 2.0 + 0.6) {
          vec3 a = prev, b = rp;
          for (int k = 0; k < 5; k++) {
            vec3 m = (a + b) * 0.5;
            vec4 mc = projectionMatrix * vec4(m, 1.0);
            float ms = -ssrViewZ(mc.xy / mc.w * 0.5 + 0.5);
            if (-m.z > ms) b = m; else a = m;
          }
          vec4 bc = projectionMatrix * vec4(b, 1.0);
          vec2 huv = bc.xy / bc.w * 0.5 + 0.5;
          vec2 e = smoothstep(vec2(0.0), vec2(0.07), huv) * smoothstep(vec2(1.0), vec2(0.93), huv);
          hitA = e.x * e.y * (1.0 - smoothstep(0.6, 1.0, float(i) / 30.0));
          refl = mix(sky, texture2D(tSceneColor, huv).rgb, hitA);
          break;
        }
      }
      stepL *= 1.14;
    }
    if (hitA < 0.01) {
      // the reflected sky, clouds and sun glow come straight from the rendered sky when on screen
      vec4 sc = projectionMatrix * vec4(vp + Rv * 4000.0, 1.0);
      if (sc.w > 0.0) {
        vec2 su = sc.xy / sc.w * 0.5 + 0.5;
        if (su.x > 0.0 && su.x < 1.0 && su.y > 0.0 && su.y < 1.0 && texture2D(tSceneDepth, su).r >= 0.99999) {
          vec2 e = smoothstep(vec2(0.0), vec2(0.1), su) * smoothstep(vec2(1.0), vec2(0.9), su);
          refl = mix(sky, texture2D(tSceneColor, su).rgb * 0.9, e.x * e.y);
        }
      }
    }
    col = mix(under, refl, fres);
    opaqueOut = 1.0;
  } else {
    col = mix(body, sky, fres);
  }
  col += uSunColor * spec;
  // foam: coverage masks shaped by the aerated-foam texture
  float foamN = vnoise(vWPos.xz * 1.3 + uTime * 0.3) * 0.6 + vnoise(vWPos.xz * 4.0 - uTime * 0.2) * 0.4;
  float foam = 0.0, foamPat = foamN;
  #ifdef OCEAN
    float fp = uWaveOK > 0.5
      ? foamTex(vBase / 7.0 + vec2(uTime * 0.012, 0.0) + g * 0.02) * 0.65 + foamTex(vBase / 2.6 - vec2(0.0, uTime * 0.02)) * 0.35
      : foamN;
    float cov = max(max(surfFoam, whitecap * 0.9), crestF * 0.7);
    foamPat = fp;
    foam = foamCover(cov, fp) * (0.6 + 0.4 * detail);
    // thin lacing that clings to the waterline
    foam = max(foam, smoothstep(0.6, 0.0, depth) * smoothstep(0.45, 0.8, fp) * 0.8);
  #else
    // whitewater racing downstream: rapids, cascades, and the churned plunge pools under falls
    // the pattern is stretched along the current into streaks; falling water tears into ropes
    float fs = uWaveOK > 0.5
      ? foamTex(vec2(vFlowUV.x * 4.0, vFlowUV.y / 34.0 - uTime * sp * 0.05)) * 0.55 + foamTex(vec2(vFlowUV.x * 9.0 + 0.5, vFlowUV.y / 12.0 - uTime * sp * 0.13)) * 0.45
      : vnoise(vec2(vFlowUV.x * 9.0, vFlowUV.y * 0.3 - uTime * sp));
    float ropes = vnoise(vec2(vFlowUV.x * 26.0, vFlowUV.y * 0.05 - uTime * sp * 0.02));
    fs = mix(fs, fs * (0.3 + 1.2 * ropes), smoothstep(0.3, 0.8, vSteep));
    // ropes of white water with dark, glassy tongues between them
    float tongues = smoothstep(0.35, 0.65, vnoise(vec2(vFlowUV.x * 7.0 + 2.0, vFlowUV.y * 0.03 - uTime * sp * 0.012)));
    float cov = smoothstep(0.25, 0.9, vSteep) * (0.35 + 0.35 * tongues) + smoothstep(0.35, 0.0, depth) * 0.25;
    float pool = 0.0;
    for (int i = 0; i < 8; i++) {
      vec4 f = uFalls[i];
      if (f.w <= 0.0) continue;
      float d = length(vWPos.xz - f.xy);
      // boiling white at the impact, breaking into drifting rafts of foam further out
      float core = 1.0 - smoothstep(f.z * 0.08, f.z * 0.3, d);
      float rafts = (1.0 - smoothstep(f.z * 0.3, f.z, d)) * smoothstep(0.45, 0.8, vnoise(vWPos.xz * 0.25 + vec2(0.0, -uTime * 0.6)));
      pool = max(pool, f.w * max(core * (0.8 + 0.2 * sin(d * 1.7 - uTime * 5.0)), rafts * 0.45));
    }
    cov = max(cov, pool);
    foamPat = fs;
    foam = foamCover(cov, fs);
  #endif
  foam = max(foam, ripFoam * foamN * 1.4);
  // foam is lit: brighter where it faces the sun, bubble walls catching more light than the film
  vec3 foamC = vec3(0.9, 0.93, 0.95) * dayL * (0.6 + 0.4 * max(dot(N, uSunDir), 0.0) * smoothstep(-0.05, 0.2, uSunDir.y)) * (0.72 + 0.28 * foamPat);
  col = mix(col, foamC, clamp(foam, 0.0, 1.0));
  col += vec3(0.5, 0.55, 0.7) * uFlash * 0.4;
  float alpha = mix(0.35, 0.96, smoothstep(0.0, 2.5, depth));
  alpha = max(alpha, foam);
  alpha = max(alpha, fres);
  if (opaqueOut > 0.5) alpha = 1.0;
  if (!gl_FrontFacing) { col = vec3(0.04, 0.2, 0.22) * dayL + uSunColor * pow(max(dot(-V, uSunDir), 0.0), 20.0) * 0.5; alpha = 0.9; }
  // fog
  // height fog matching the global atmosphere
  float hf = 0.0055;
  float h0 = clamp(cameraPosition.y, -30.0, 3000.0), h1 = clamp(vWPos.y, -30.0, 3000.0);
  float dh = h1 - h0;
  float hInt = abs(dh) > 0.5 ? (exp(-hf * h0) - exp(-hf * h1)) / (hf * dh) : exp(-hf * h0);
  float hTerm = clamp(0.22 + 1.6 * hInt, 0.0, 2.4);
  float fd = uFogDensity * dist;
  float fogF = 1.0 - exp(-(fd * fd * hTerm + fd * 0.22 * hTerm));
  if (uUnder > 0.5) fogF = 0.0;
  vec3 vdir = -V;
  float sunAmt = pow(max(dot(vdir, uSunDir), 0.0), 7.0) * smoothstep(-0.05, 0.15, uSunDir.y);
  col = mix(col, mix(uFogColor, uSunColor * 0.9 + uFogColor * 0.35, sunAmt * 0.65), clamp(fogF, 0.0, 1.0));
  if (uMistA > 0.001 && uUnder < 0.5) {
    float mh = 0.05;
    float m0 = clamp(cameraPosition.y - uMistBase, -10.0, 2000.0), m1 = clamp(vWPos.y - uMistBase, -10.0, 2000.0);
    float mdh = m1 - m0;
    float mInt = abs(mdh) > 0.3 ? (exp(-mh * m0) - exp(-mh * m1)) / (mh * mdh) : exp(-mh * m0);
    float mi = 1.0 - exp(-dist * uMistA * 0.01 * min(mInt, 1.65));
    col = mix(col, mix(uFogColor * 1.06, uSunColor * 0.75 + uFogColor * 0.45, sunAmt * 0.6), mi);
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeWaterMaterial(world, ocean, extra) {
  const uniforms = {
    uTime: U.uTime, uSunDir: U.uSunDir, uSunColor: U.uSunColor, uHorizon: U.uHorizon,
    uZenith: extra.zenith, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uRain: U.uRain, uNight: U.uNight,
    uFlash: U.uFlash, uHeightTex: { value: world.heightTex }, uMaskTex: { value: world.maskTex },
    uWaveAmp: extra.waveAmp, uLevel: ocean ? extra.seaLevel : extra.riverOffset, uOrigin: extra.origin, uUnder: extra.under,
    ...SSR_U,
    uMistA: A.uMistA, uMistBase: A.uMistBase, uRip: extra.rip,
    uShoreTex: { value: world.shoreTex }, uWaveTex: { value: TerrainTextures.waveArray || dummyArray() },
    uFoamTex: { value: TerrainTextures.foamMap || new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) },
    uWaveOK: TerrainTextures.waveOK, uFalls: extra.falls,
  };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: waterVert, fragmentShader: waterFrag,
    transparent: true, depthWrite: true, side: THREE.DoubleSide,
    defines: ocean ? { OCEAN: 1 } : {},
  });
}

function oceanGeometry() {
  // Polar grid: dense near the centre, sparse far away
  const rings = 64, segs = 96;
  const pos = [], uv = [], idx = [], flow = [], steep = [];
  pos.push(0, 0, 0); uv.push(0.5, 0.5); flow.push(0); steep.push(0);
  let r = 1.5;
  for (let i = 1; i <= rings; i++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      uv.push(0, 0); flow.push(0); steep.push(0);
    }
    r *= i < 40 ? 1.105 : 1.16;
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 1; i < rings; i++) {
    const b0 = 1 + (i - 1) * segs, b1 = 1 + i * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(b0 + s, b0 + s1, b1 + s, b0 + s1, b1 + s1, b1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  g.setAttribute('aSteep', new THREE.Float32BufferAttribute(steep, 1));
  g.setIndex(idx);
  return g;
}

function riverGeometry(R) {
  const n = R.x.length;
  const pos = [], uv = [], idx = [], flow = [], steep = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let dx = R.x[i1] - R.x[i0], dz = R.z[i1] - R.z[i0];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const hw = R.width[i] * 0.5 * 1.18 + 1.5;
    if (i > 0) acc += Math.hypot(R.x[i] - R.x[i - 1], R.z[i] - R.z[i - 1]);
    const drop = Math.max(0, (R.level[i0] - R.level[i1]) / Math.max(1, Math.hypot(R.x[i1] - R.x[i0], R.z[i1] - R.z[i0])));
    const st = Math.min(1, drop * 3);
    const y = R.level[i] + 0.05;
    pos.push(R.x[i] - dz * hw, y, R.z[i] + dx * hw, R.x[i] + dz * hw, y, R.z[i] - dx * hw);
    uv.push(0, 0, 1, 0);
    flow.push(acc, acc);
    steep.push(st, st);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  g.setAttribute('aSteep', new THREE.Float32BufferAttribute(steep, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class Water {
  constructor(world, scene) {
    this.world = world;
    this.extra = {
      zenith: { value: new THREE.Color(0.2, 0.4, 0.8) }, waveAmp: { value: 0.5 },
      seaLevel: { value: 0 }, riverOffset: { value: 0 }, origin: { value: new THREE.Vector3() }, under: { value: 0 },
      rip: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -99, 0)) },
      falls: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 0)) },
    };
    this._ripI = 0;
    this._wadeT = 0;
    this.oceanMat = makeWaterMaterial(world, true, this.extra);
    this.ocean = new THREE.Mesh(oceanGeometry(), this.oceanMat);
    this.ocean.frustumCulled = false;
    this.ocean.renderOrder = 1;
    this.ocean.layers.set(LAYER_WATER);
    scene.add(this.ocean);

    this.riverMat = makeWaterMaterial(world, false, this.extra);
    this.rivers = [];
    for (const R of world.rivers) {
      const m = new THREE.Mesh(riverGeometry(R), this.riverMat);
      m.renderOrder = 2;
      m.layers.set(LAYER_WATER);
      scene.add(m);
      this.rivers.push(m);
    }

    // Waterfall mist and spray: billows that swell and drift downwind from the plunge pool, and
    // fine droplets thrown out ballistically from the impact; both fade in and out per particle
    this.falls = [];
    const mistTex = makeSoftTexture();
    const cloud = (count, size, opacity) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 4).fill(1), 4));
      const mat = new THREE.PointsMaterial({ map: mistTex, size, transparent: true, opacity, depthWrite: false, vertexColors: true, sizeAttenuation: true });
      const pts = new THREE.Points(g, mat);
      pts.frustumCulled = false;
      pts.layers.set(LAYER_OVERLAY);
      scene.add(pts);
      return pts;
    };
    for (const R of world.rivers) {
      for (const wf of R.waterfalls) {
        const nMist = 110, nSpray = 160;
        const seeds = Float32Array.from({ length: nMist + nSpray }, () => Math.random());
        const ib = Math.min(R.x.length - 1, wf.i1);
        const ia = Math.max(0, ib - 1);
        let dx = R.x[ib] - R.x[ia], dz = R.z[ib] - R.z[ia];
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        const scale = Math.min(1.6, 0.6 + wf.height / 30);
        const mist = cloud(nMist, 11 * scale, 0.55);
        const spray = cloud(nSpray, 1.4 * scale, 0.8);
        this.falls.push({ wf, pts: mist, spray, seeds, nMist, nSpray, bx: R.x[ib], bz: R.z[ib], by: wf.bottom, dx, dz, scale, width: R.width[ib], river: R });
        // churned plunge pool just below the drop, sized by the river width and the fall height
        const fi = this.falls.length - 1;
        if (fi < 8) {
          const ip = Math.min(R.x.length - 1, wf.i1 + 1);
          this.extra.falls.value[fi].set(R.x[ip], R.z[ip], R.width[ip] * 0.9 + wf.height * 0.4, Math.min(1, 0.55 + wf.height / 40));
        }
      }
    }
  }

  get waterfalls() { return this.falls; }

  // spawn a ripple ring on the water surface at (x, z); strength ~0.2 (drip) .. 2 (dinosaur)
  addRipple(x, z, strength = 1) {
    this.extra.rip.value[this._ripI].set(x, z, U.uTime.value, Math.min(2, strength));
    this._ripI = (this._ripI + 1) % 12;
  }

  // wading and swimming leave rings behind the player
  emitPlayer(dt, p) {
    if (!p || !p.alive || p.inVehicle) return;
    const w = this.world;
    const wl = w.waterLevelAt(p.pos.x, p.pos.z);
    const depth = wl - w.getHeight(p.pos.x, p.pos.z);
    if (depth < 0.15 || p.pos.y > wl + 0.3) return;
    this._wadeT -= dt;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (this._wadeT <= 0) {
      this._wadeT = sp > 0.5 ? Math.max(0.22, 0.6 - sp * 0.06) : 1.4;
      this.addRipple(p.pos.x, p.pos.z, sp > 0.5 ? 0.55 + Math.min(0.6, sp * 0.08) : 0.25);
    }
  }

  update(dt, camPos, weather, zenith) {
    this.extra.origin.value.set(Math.round(camPos.x / 8) * 8, 0, Math.round(camPos.z / 8) * 8);
    this.extra.seaLevel.value = this.world.seaLevel + this.world.flood;
    this.extra.riverOffset.value = this.world.flood * 0.6;
    this.extra.waveAmp.value = 0.35 + weather.wind * 0.9;
    this.extra.zenith.value.copy(zenith);
    const t = U.uTime.value;
    const wind = U.uWindDir.value, ws = 1 + weather.wind * 2;
    for (const f of this.falls) {
      const d = Math.hypot(camPos.x - f.bx, camPos.z - f.bz);
      const vis = d < 650;
      f.pts.visible = f.spray.visible = vis;
      if (!vis) continue;
      const y0 = f.by + this.world.flood * 0.6;
      const mp = f.pts.geometry.attributes.position, mc = f.pts.geometry.attributes.color;
      for (let i = 0; i < f.nMist; i++) {
        const s = f.seeds[i];
        const life = (t * (0.11 + s * 0.06) + s * 7.3) % 1;
        const a = s * 91.7;
        const r = (1.5 + life * 9 + s * 3) * f.scale;
        const x = f.bx + Math.cos(a) * r + (wind.x * ws + f.dx * 0.6) * life * 9;
        const z = f.bz + Math.sin(a) * r + (wind.y * ws + f.dz * 0.6) * life * 9;
        mp.setXYZ(i, x, y0 + 0.4 + life * (5 + s * 7) * f.scale, z);
        const al = Math.sin(life * Math.PI) * (0.35 + 0.4 * (1 - s));
        mc.setXYZW(i, 0.92, 0.95, 0.97, al);
      }
      mp.needsUpdate = mc.needsUpdate = true;
      const sp = f.spray.geometry.attributes.position, sc = f.spray.geometry.attributes.color;
      for (let k = 0; k < f.nSpray; k++) {
        const s = f.seeds[f.nMist + k];
        const life = (t * (0.7 + s * 0.5) + s * 13.1) % 1;
        const a = s * 57.3;
        // thrown outward from the impact, mostly downstream, arcing back down
        const v = (5 + s * 7) * f.scale;
        const hx = Math.cos(a) * 0.7 + f.dx * 0.8, hz = Math.sin(a) * 0.7 + f.dz * 0.8;
        const tt = life * 1.4;
        const lat = (s - 0.5) * f.width * 0.8;
        const x = f.bx - f.dz * lat + hx * v * tt * 0.6;
        const z = f.bz + f.dx * lat + hz * v * tt * 0.6;
        const y = y0 + 0.2 + v * 0.55 * tt - 4.9 * tt * tt;
        sp.setXYZ(k, x, Math.max(y0, y), z);
        sc.setXYZW(k, 0.95, 0.97, 1, (1 - life) * (y > y0 ? 0.7 : 0));
      }
      sp.needsUpdate = sc.needsUpdate = true;
    }
  }

  setUnderwater(v) { this.extra.under.value = v ? 1 : 0; }
}

export function makeSoftTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
