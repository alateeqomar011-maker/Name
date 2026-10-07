// Post-processing pipeline: HDR scene -> atmosphere (height fog, aerial perspective, sun shafts,
// underwater) -> bloom -> tone mapping & grading.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ATMOS_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform vec2 uSunScreen;
uniform float uSunOnScreen;
uniform float uShafts;
uniform float uUnderwater;
uniform float uWaterLevel;
uniform float uTime;
uniform float uReversed;
uniform float uRain;
uniform vec3 uWaterTint;
uniform int uShaftSamples;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
bool isSky(float d) { return uReversed > 0.5 ? d <= 0.0 : d >= 1.0; }

void main() {
  vec2 uv = vUv;
  if (uUnderwater > 0.5) {
    uv += vec2(sin(uv.y * 38.0 + uTime * 2.1), cos(uv.x * 31.0 + uTime * 1.7)) * 0.0018;
  }
  vec3 col = texture2D(tColor, uv).rgb;
  float depth = texture2D(tDepth, uv).r;
  float ndcZ = uReversed > 0.5 ? depth : depth * 2.0 - 1.0;
  bool sky = isSky(depth);
  vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, sky ? (uReversed > 0.5 ? 1e-7 : 0.9999999) : ndcZ, 1.0);
  vec3 viewPos = vp.xyz / vp.w;
  vec3 wpos = (uViewInv * vec4(viewPos, 1.0)).xyz;
  vec3 rd = wpos - uCamPos;
  float dist = length(rd);
  rd /= max(dist, 1e-4);
  if (sky) dist = 24000.0;

  float cosSun = dot(rd, uSunDir);
  if (uUnderwater < 0.5) {
    // exponential height fog: analytic integral along the ray
    float b = uFogFalloff;
    float camH = max(uCamPos.y - uFogBase, -50.0);
    float ry = rd.y;
    if (abs(ry) < 1e-4) ry = 1e-4;
    float od = uFogDensity * exp(-camH * b) * (1.0 - exp(-dist * ry * b)) / (b * ry);
    od = max(od, 0.0);
    // aerial perspective (thin, wavelength dependent)
    vec3 extinction = exp(-vec3(0.45, 0.7, 1.0) * dist * 0.00005 * (sky ? 0.0 : 1.0));
    float T = exp(-od);
    float sunScatter = pow(max(cosSun, 0.0), 8.0) * 0.5 + pow(max(cosSun, 0.0), 48.0) * 0.6;
    vec3 fogCol = uFogColor + uSunColor * sunScatter * 0.02;
    if (sky) {
      T = mix(1.0, T, 0.85);
    }
    col = col * extinction + uFogColor * vec3(0.75, 0.9, 1.1) * (1.0 - extinction);
    col = col * T + fogCol * (1.0 - T);

    // god rays: screen-space radial occlusion toward the sun
    if (uSunOnScreen > 0.0 && uShafts > 0.0) {
      vec2 delta = (uSunScreen - vUv);
      float len = length(delta);
      int N = uShaftSamples;
      delta *= 1.0 / float(N) * 0.85;
      vec2 suv = vUv + delta * hash12(gl_FragCoord.xy + fract(uTime) * 61.0);
      float illum = 0.0, decay = 1.0, wsum = 0.0;
      for (int i = 0; i < 48; i++) {
        if (i >= N) break;
        suv += delta;
        float d2 = texture2D(tDepth, suv).r;
        illum += (isSky(d2) ? 1.0 : 0.0) * decay;
        wsum += decay;
        decay *= 0.965;
      }
      illum /= wsum;
      float fall = exp(-len * 2.2);
      col += uSunColor * illum * fall * uShafts * uSunOnScreen * 0.05;
    }
  } else {
    // underwater: strong absorption & scattering
    float dd = sky ? 60.0 : dist;
    float depthBelow = max(uWaterLevel - uCamPos.y, 0.0);
    vec3 absorb = exp(-vec3(0.45, 0.11, 0.07) * dd * 0.35);
    vec3 scatterCol = uWaterTint * (0.35 + 0.65 * exp(-depthBelow * 0.06)) * (0.25 + 0.75 * max(uSunDir.y, 0.05));
    float sc = 1.0 - exp(-dd * 0.06);
    col = col * absorb * (1.0 - sc) + scatterCol * sc;
    // caustic shimmer
    float c = sin(wpos.x * 0.9 + uTime * 1.6) * sin(wpos.z * 0.8 - uTime * 1.3);
    col += uWaterTint * max(c, 0.0) * 0.12 * exp(-dd * 0.08) * max(uSunDir.y, 0.0);
    // light rays from the surface
    float ray = pow(max(0.0, sin(dot(uv, vec2(18.0, 3.0)) + uTime * 0.6) * sin(dot(uv, vec2(-11.0, 2.0)) - uTime * 0.4)), 4.0);
    col += uWaterTint * ray * 0.2 * smoothstep(0.0, 0.6, uv.y) * exp(-depthBelow * 0.1);
  }
  gl_FragColor = vec4(min(col, vec3(48.0)), 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform float uExposure;
uniform float uTime;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uTint;
uniform float uVignette;
uniform float uDamage;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uGrain;
uniform vec2 uRes;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFitted(vec3 color) {
  const mat3 ACESInputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 ACESOutputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec2 uv = vUv;
  // subtle chromatic aberration toward the edges
  vec2 dc = (uv - 0.5);
  float ca = dot(dc, dc) * 0.004;
  vec3 col;
  col.r = texture2D(tColor, uv + dc * ca).r;
  col.g = texture2D(tColor, uv).g;
  col.b = texture2D(tColor, uv - dc * ca).b;
  col *= uExposure;
  col *= uTint;
  col = ACESFitted(col * 1.1);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col = clamp(col, 0.0, 1.0);
  float v = smoothstep(0.95, 0.25, length(dc) * (1.0 + uVignette));
  col *= mix(1.0, v, 0.55);
  col = mix(col, vec3(0.5, 0.0, 0.0), uDamage * smoothstep(0.2, 0.75, length(dc)));
  col = toSRGB(col);
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain;
  col = mix(col, uFadeColor, uFade);
  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFX {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.reversed = !!(renderer.state.buffers.depth.getReversed && renderer.state.buffers.depth.getReversed());
    this.sceneRT = null;
    this.atmosRT = null;
    this.scale = 1;
    this.width = 1;
    this.height = 1;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);

    this.atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uProjInv: { value: new THREE.Matrix4() },
        uViewInv: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFogDensity: { value: 0.0006 },
        uFogFalloff: { value: 0.006 },
        uFogBase: { value: 0 },
        uSunScreen: { value: new THREE.Vector2() },
        uSunOnScreen: { value: 0 },
        uShafts: { value: 1 },
        uUnderwater: { value: 0 },
        uWaterLevel: { value: 0 },
        uTime: { value: 0 },
        uReversed: { value: this.reversed ? 1 : 0 },
        uRain: { value: 0 },
        uWaterTint: { value: new THREE.Color(0.05, 0.22, 0.26) },
        uShaftSamples: { value: quality.shaftSamples },
      },
      vertexShader: FS_VERT,
      fragmentShader: ATMOS_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        uExposure: { value: 1 },
        uTime: { value: 0 },
        uSaturation: { value: 1.08 },
        uContrast: { value: 1.05 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uVignette: { value: 0.2 },
        uDamage: { value: 0 },
        uFade: { value: 0 },
        uFadeColor: { value: new THREE.Color(0, 0, 0) },
        uGrain: { value: 0.025 },
        uRes: { value: new THREE.Vector2() },
      },
      vertexShader: FS_VERT,
      fragmentShader: FINAL_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.4, 5.0);
  }

  setSize(w, h, scale) {
    this.width = w;
    this.height = h;
    this.scale = scale;
    const sw = Math.max(1, Math.floor(w * scale)), sh = Math.max(1, Math.floor(h * scale));
    if (this.sceneRT) {
      this.sceneRT.dispose();
      this.atmosRT.dispose();
    }
    const depthTex = new THREE.DepthTexture(sw, sh);
    depthTex.type = THREE.FloatType;
    depthTex.format = THREE.DepthFormat;
    this.sceneRT = new THREE.WebGLRenderTarget(sw, sh, {
      type: THREE.HalfFloatType,
      samples: this.quality.msaa,
      depthTexture: depthTex,
      depthBuffer: true,
    });
    this.atmosRT = new THREE.WebGLRenderTarget(sw, sh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.bloom.setSize(sw, sh);
    this.finalMat.uniforms.uRes.value.set(w, h);
  }

  get renderWidth() { return this.sceneRT ? this.sceneRT.width : 1; }
  get renderHeight() { return this.sceneRT ? this.sceneRT.height : 1; }

  render(scene, camera, p) {
    const r = this.renderer;
    // 1. scene
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, true);
    r.render(scene, camera);

    // 2. atmosphere
    const a = this.atmosMat.uniforms;
    a.tColor.value = this.sceneRT.texture;
    a.tDepth.value = this.sceneRT.depthTexture;
    a.uProjInv.value.copy(camera.projectionMatrixInverse);
    a.uViewInv.value.copy(camera.matrixWorld);
    a.uCamPos.value.copy(camera.position);
    a.uSunDir.value.copy(p.sunDir);
    a.uSunColor.value.copy(p.sunColor);
    a.uFogColor.value.copy(p.fogColor);
    a.uFogDensity.value = p.fogDensity;
    a.uFogFalloff.value = p.fogFalloff;
    a.uFogBase.value = p.fogBase || 0;
    a.uUnderwater.value = p.underwater ? 1 : 0;
    a.uWaterLevel.value = p.waterLevel || 0;
    a.uTime.value = p.time;
    a.uShafts.value = this.quality.shafts ? p.shafts : 0;
    // sun screen position
    const sp = _v.copy(camera.position).addScaledVector(p.sunDir, 10000).project(camera);
    a.uSunScreen.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const facing = _v2.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(p.sunDir);
    const onScreen = Math.max(0, 1 - Math.max(Math.abs(sp.x), Math.abs(sp.y)) / 1.6);
    a.uSunOnScreen.value = facing > 0 && p.sunDir.y > -0.02 ? onScreen * Math.min(1, facing * 2) : 0;
    this.quad.material = this.atmosMat;
    r.setRenderTarget(this.atmosRT);
    r.render(this.scene, this.camera);

    // 3. bloom (composites back into atmosRT)
    if (this.quality.bloom) {
      this.bloom.strength = p.bloomStrength ?? 0.32;
      this.bloom.render(r, null, this.atmosRT, 0, false);
    }

    // 4. final
    const f = this.finalMat.uniforms;
    f.tColor.value = this.atmosRT.texture;
    f.uExposure.value = p.exposure;
    f.uTime.value = p.time;
    f.uDamage.value = p.damage || 0;
    f.uFade.value = p.fade || 0;
    f.uSaturation.value = p.saturation ?? 1.08;
    f.uContrast.value = p.contrast ?? 1.05;
    f.uTint.value.copy(p.tint || _white);
    f.uGrain.value = this.quality.grain ? 0.022 : 0;
    this.quad.material = this.finalMat;
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _white = new THREE.Color(1, 1, 1);
