// Physically-inspired sky dome with sun, moon, stars, volumetric-looking clouds, plus scene lighting.
import * as THREE from 'three';
import { U, GLSL_NOISE } from './shaderlib.js';
import { clamp, lerp, smoothstep } from '../core/noise.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunColor; uniform vec3 uGlow;
uniform float uCloudCover; uniform float uCloudDark; uniform float uTime; uniform float uNight; uniform float uFlash;
uniform float uStars; uniform vec2 uCloudOffset; uniform vec3 uTint;
uniform float uPhys; uniform float uSkyI; uniform float uMie;
varying vec3 vDir;
// single-scattering atmosphere (Rayleigh + Mie + ozone absorption) seen from 300 m above sea level
const float A_RE = 6360e3, A_RA = 6420e3, A_HR = 7994.0, A_HM = 1200.0;
const vec3 A_BR = vec3(5.5e-6, 13.0e-6, 22.4e-6);
const vec3 A_BO = vec3(1.3e-6, 3.76e-6, 0.17e-6);
vec2 aSphere(vec3 o, vec3 d, float r){ float b = dot(o, d); float c = dot(o, o) - r * r; float D = b * b - c; if (D < 0.0) return vec2(-1.0); D = sqrt(D); return vec2(-b - D, -b + D); }
vec3 skyScatter(vec3 rd, vec3 sd){
  vec3 ro = vec3(0.0, A_RE + 300.0, 0.0);
  float tmax = aSphere(ro, rd, A_RA).y;
  vec2 tg = aSphere(ro, rd, A_RE); if (tg.x > 0.0) tmax = tg.x;
  const int N = 10; const int M = 3;
  float seg = tmax / float(N), tc = 0.0, odR = 0.0, odM = 0.0;
  vec3 sR = vec3(0.0), sM = vec3(0.0);
  float mu = dot(rd, sd);
  float phR = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
  float g = 0.76;
  float phM = 3.0 / (8.0 * 3.14159) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 bM = vec3(21e-6 * uMie);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (tc + seg * 0.5);
    float h = length(p) - A_RE;
    float hr = exp(-h / A_HR) * seg, hm = exp(-h / A_HM) * seg;
    odR += hr; odM += hm;
    float sl = aSphere(p, sd, A_RA).y / float(M);
    float tcl = 0.0, oR = 0.0, oM = 0.0; bool lit = true;
    for (int j = 0; j < M; j++) {
      vec3 q = p + sd * (tcl + sl * 0.5);
      float hl = length(q) - A_RE;
      if (hl < 0.0) { lit = false; break; }
      oR += exp(-hl / A_HR) * sl; oM += exp(-hl / A_HM) * sl; tcl += sl;
    }
    if (lit) {
      vec3 att = exp(-((A_BR + A_BO) * (odR + oR) + bM * 1.1 * (odM + oM)));
      sR += att * hr; sM += att * hm;
    }
    tc += seg;
  }
  return sR * A_BR * phR + sM * bM * phM;
}
${GLSL_NOISE}
float fbm5(vec2 p){ float s=0.0; float a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.02+11.3; a*=0.5;} return s/0.96875; }
void main(){
  vec3 dir = normalize(vDir);
  float y = dir.y;
  float yp = max(y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(yp, 0.45));
  if (uPhys > 0.001) {
    // twilight: single scattering goes black the moment the sun sets, so keep a dimming sky lit
    // from a sun pinned just above the horizon (a cheap stand-in for multiple scattering)
    vec3 sdx = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.025), uSunDir.z));
    float twi = smoothstep(-0.2, 0.025, uSunDir.y);
    // never sample the grazing path right at the horizon: single scattering over-reddens it
    vec3 phys = skyScatter(normalize(vec3(dir.x, max(y, 0.0) * 0.96 + 0.04, dir.z)), sdx) * uSkyI * twi * twi;
    col = mix(col, phys, uPhys);
  }
  if (y < 0.0) col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, y));
  float sd = max(dot(dir, uSunDir), 0.0);
  // atmospheric glow around sun
  col += uGlow * (pow(sd, 6.0) * 0.6 + pow(sd, 32.0) * 0.8) * (1.0 - yp * 0.6);
  // sun disc
  float sunDisc = smoothstep(0.99955, 0.99975, sd);
  col += uSunColor * sunDisc * 18.0 * (1.0 - uCloudCover * 0.85);
  // moon (opposite side of the sun)
  vec3 moonDir = normalize(-uSunDir + vec3(0.15, 0.0, 0.1));
  float md = dot(dir, moonDir);
  float moon = smoothstep(0.99935, 0.9996, md);
  float moonShade = 0.75 + 0.25 * vnoise(dir.xy * 400.0);
  col += vec3(0.85, 0.88, 0.95) * moon * moonShade * uNight * 1.8 * (1.0 - uCloudCover * 0.8);
  col += vec3(0.25, 0.3, 0.45) * pow(max(md, 0.0), 60.0) * uNight * 0.25;
  // stars
  if (uStars > 0.001 && y > 0.0) {
    vec3 sp = dir * 260.0;
    vec2 cell = floor(sp.xz / (sp.y + 60.0) * 140.0 + sp.y * 0.01);
    float h = hash12(cell);
    float tw = 0.65 + 0.35 * sin(uTime * 3.0 + h * 80.0);
    float star = step(0.9965, h) * tw * smoothstep(0.0, 0.25, y);
    col += vec3(0.9, 0.93, 1.0) * star * uStars * 1.6 * (1.0 - uCloudCover);
    // milky way band
    float band = exp(-pow(dot(dir, normalize(vec3(0.4, 0.5, 0.75))) * 3.5, 2.0));
    col += vec3(0.08, 0.08, 0.12) * band * uStars * fbm3(dir.xz * 12.0) * (1.0 - uCloudCover);
  }
  // high cirrus streaks
  if (y > 0.0) {
    vec2 ci = dir.xz / (y + 0.2) * 1.1 + uCloudOffset * 0.6;
    // curl the fibres with a domain warp and break the sheet into drifting patches (mares' tails)
    vec2 wq = vec2(fbm3(ci * 0.8 + 3.0), fbm3(ci * 0.8 + 11.0)) - 0.5;
    vec2 cw = ci + wq * 0.65;
    float patchM = smoothstep(0.4, 0.72, fbm3(ci * 0.42 + 7.0));
    float fib = fbm3(vec2(cw.x * 0.9 + cw.y * 0.35, cw.y * 6.0 - cw.x * 1.4) * 1.6);
    float fine = vnoise(vec2(cw.x * 2.5 + cw.y, cw.y * 24.0 - cw.x * 4.0));
    float cir = fib * 0.78 + fine * 0.22;
    float cirA = smoothstep(0.5, 0.82, cir) * patchM * smoothstep(0.08, 0.4, y) * (0.4 + 0.3 * (1.0 - uCloudCover)) * (1.0 - uCloudDark);
    vec3 cirC = mix(uHorizon * 1.15 + uSunColor * 0.25, uGlow * 1.2 + uHorizon, pow(sd, 3.0) * 0.6) * mix(1.0, 0.1, uNight);
    col = mix(col, cirC, cirA * 0.6);
  }
  // volumetric-style cumulus: march through a slab layer with self-shadowing toward the sun
  if (y > -0.02) {
    float cov = uCloudCover;
    vec2 sunXZ = normalize(uSunDir.xz + 0.0001) * (0.25 + (1.0 - max(uSunDir.y, 0.0)) * 0.35);
    vec2 base = dir.xz / (y + 0.13) * 1.5;
    float trans = 1.0;
    vec3 acc = vec3(0.0);
    vec3 amb = mix(uHorizon * 0.95, uZenith * 0.8 + uHorizon * 0.3, 0.5) * mix(1.0, 0.12, uNight);
    vec3 sunC = uSunColor * mix(1.55, 0.05, uNight) * (1.0 - uCloudDark * 0.7);
    float phase = 0.6 + 1.6 * pow(sd, 6.0) + 0.5 * pow(sd, 2.0);
    // stable interleaved-gradient dither (no frame-to-frame sparkle) over 9 slab steps
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 0.9;
    for (int j = 0; j < 9; j++) {
      float fj = (float(j) + jit) * (6.0 / 9.0);
      vec2 p = base * (1.0 + fj * 0.045) + uCloudOffset;
      float shape = fbm5(p * 1.15);
      float detail = fbm3(p * 4.2 + 7.0);
      float h = clamp(fj / 6.0, 0.0, 1.0); // 0 = cloud base, 1 = top
      float profile = smoothstep(0.0, 0.25, h) * smoothstep(1.0, 0.55, h) * (1.0 - 0.35 * h);
      float lo = 0.74 - cov * 0.5;
      float d = smoothstep(lo, lo + 0.17, shape * 0.78 + detail * 0.26 + profile * 0.05 - 0.02);
      d *= 0.55 + 0.45 * profile;
      if (d < 0.003) continue;
      // light march toward the sun
      vec2 ls = p + sunXZ * 0.12;
      float occl = smoothstep(lo, lo + 0.17, fbm5(ls * 1.15) * 0.78 + fbm3(ls * 4.2 + 7.0) * 0.26);
      float beer = exp(-occl * 2.6 - (1.0 - h) * 0.9 * cov);
      float powder = 1.0 - exp(-d * 3.0);
      vec3 lit = amb * (0.55 + 0.45 * h) + sunC * beer * phase * powder * 0.9;
      lit = mix(lit, vec3(0.16, 0.17, 0.2) * mix(1.0, 0.15, uNight), uCloudDark * (1.0 - h * 0.5));
      float a = d * 0.55 * (6.0 / 9.0);
      acc += lit * a * trans;
      trans *= 1.0 - a;
    }
    float fade = smoothstep(-0.01, 0.2, y);
    vec3 cloudCol = acc / max(1.0 - trans, 0.001);
    col = mix(col, cloudCol + uGlow * pow(sd, 4.0) * 0.25, (1.0 - trans) * fade);
  }
  col += vec3(0.55, 0.6, 0.85) * uFlash;
  col *= uTint;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// CPU twin of the shader's scattering model, used for fog, horizon and cloud lighting colours
const S_RE = 6360e3, S_RA = 6420e3, S_HR = 7994, S_HM = 1200;
const S_BR = [5.5e-6, 13.0e-6, 22.4e-6], S_BO = [1.3e-6, 3.76e-6, 0.17e-6];
function sSphere(o, d, r) { const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2]; const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r; const D = b * b - c; if (D < 0) return -1; return -b + Math.sqrt(D); }
function scatterCPU(rd, sd, mie, out) {
  const ro = [0, S_RE + 300, 0];
  const tmax = sSphere(ro, rd, S_RA);
  const N = 10, M = 3, seg = tmax / N;
  let tc = 0, odR = 0, odM = 0;
  const sR = [0, 0, 0], sM = [0, 0, 0];
  const mu = rd[0] * sd[0] + rd[1] * sd[1] + rd[2] * sd[2];
  const phR = 3 / (16 * Math.PI) * (1 + mu * mu), g = 0.76;
  const phM = 3 / (8 * Math.PI) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  const bM = 21e-6 * mie;
  const p = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) p[k] = ro[k] + rd[k] * (tc + seg / 2);
    const h = Math.hypot(p[0], p[1], p[2]) - S_RE;
    const hr = Math.exp(-h / S_HR) * seg, hm = Math.exp(-h / S_HM) * seg;
    odR += hr; odM += hm;
    const sl = sSphere(p, sd, S_RA) / M;
    let tcl = 0, oR = 0, oM = 0, lit = true;
    for (let j = 0; j < M; j++) {
      for (let k = 0; k < 3; k++) q[k] = p[k] + sd[k] * (tcl + sl / 2);
      const hl = Math.hypot(q[0], q[1], q[2]) - S_RE;
      if (hl < 0) { lit = false; break; }
      oR += Math.exp(-hl / S_HR) * sl; oM += Math.exp(-hl / S_HM) * sl; tcl += sl;
    }
    if (lit) for (let k = 0; k < 3; k++) { const a = Math.exp(-((S_BR[k] + S_BO[k]) * (odR + oR) + bM * 1.1 * (odM + oM))); sR[k] += a * hr; sM[k] += a * hm; }
    tc += seg;
  }
  for (let k = 0; k < 3; k++) out[k] = sR[k] * S_BR[k] * phR + sM[k] * bM * phM;
  return out;
}

const C = (r, g, b) => new THREE.Color(r, g, b);
const ZEN_DAY = C(0.16, 0.38, 0.82), HOR_DAY = C(0.62, 0.76, 0.92);
const ZEN_SET = C(0.2, 0.25, 0.5), HOR_SET = C(1.0, 0.52, 0.28);
const ZEN_NIGHT = C(0.006, 0.01, 0.028), HOR_NIGHT = C(0.025, 0.04, 0.075);
const OVERCAST = C(0.46, 0.49, 0.53);

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.uniforms = {
      uSunDir: U.uSunDir, uZenith: { value: new THREE.Color() }, uHorizon: U.uHorizon, uSunColor: U.uSunColor,
      uGlow: { value: new THREE.Color() }, uCloudCover: { value: 0.3 }, uCloudDark: { value: 0 }, uTime: U.uTime,
      uNight: U.uNight, uFlash: U.uFlash, uStars: { value: 0 }, uCloudOffset: { value: new THREE.Vector2() },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uPhys: { value: 1 }, uSkyI: { value: 32 }, uMie: { value: 0.4 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const geo = new THREE.SphereGeometry(4500, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // Env-map scene (only the sky)
    this.envScene = new THREE.Scene();
    this.envMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.material);
    this.envScene.add(this.envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.envTimer = 0;

    // Lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.radius = 2.4; // soft Vogel-disk PCF penumbra (~20 cm)
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a3f2a, 1.0);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(this.ambient);

    this.sunDir = new THREE.Vector3();
    this.fogColor = new THREE.Color();
    this.timeOfDay = 8;
    this.dayFactor = 1;
    this.cloudOffset = new THREE.Vector2();
    this._z = new THREE.Color(); this._h = new THREE.Color(); this._t = new THREE.Color();
  }

  setShadowQuality(size, enabled, extent = 180) {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(size, size);
    // sharp shadow box around the player; the long-range terrain shadow pass covers the rest
    const sc = this.sun.shadow.camera;
    this.shadowExtent = extent;
    sc.left = -extent / 2; sc.right = extent / 2; sc.top = extent / 2; sc.bottom = -extent / 2;
    sc.updateProjectionMatrix();
  }

  // weather: { cloud, dark, fog, rain, tint:Color|null, ash }
  update(dt, timeOfDay, weather, focus, inCave) {
    this.timeOfDay = timeOfDay;
    const theta = ((timeOfDay - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(theta), Math.sin(theta) * 0.92, 0.36).normalize();
    U.uSunDir.value.copy(this.sunDir);
    const e = this.sunDir.y; // elevation
    const day = smoothstep(-0.12, 0.18, e);
    const sunset = (1 - smoothstep(0.05, 0.38, Math.abs(e))) * smoothstep(-0.2, 0.0, e);
    this.dayFactor = day;
    U.uNight.value = 1 - smoothstep(-0.2, 0.05, e);

    // physical sky colours: zenith straight up, horizon averaged around the compass
    const mie = Math.min(3, 0.4 + (weather.fog || 0) * 0.12 + (weather.rain || 0) * 0.6 + (weather.tintAmt || 0) * 1.5);
    this.uniforms.uMie.value = mie;
    const sy = Math.max(this.sunDir.y, 0.025), sl = Math.hypot(this.sunDir.x, sy, this.sunDir.z);
    const sd = [this.sunDir.x / sl, sy / sl, this.sunDir.z / sl], tmp = this._sc || (this._sc = [0, 0, 0]);
    const twi = smoothstep(-0.2, 0.025, e);
    const SI = this.uniforms.uSkyI.value * twi * twi;
    scatterCPU([0, 1, 0], sd, mie, tmp);
    const physZ = this._pz || (this._pz = new THREE.Color());
    physZ.setRGB(tmp[0] * SI, tmp[1] * SI, tmp[2] * SI);
    const physH = this._ph || (this._ph = new THREE.Color());
    physH.setRGB(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const d = [Math.cos(a) * 0.9988, 0.05, Math.sin(a) * 0.9988];
      scatterCPU(d, sd, mie, tmp);
      physH.r += tmp[0] * SI / 4; physH.g += tmp[1] * SI / 4; physH.b += tmp[2] * SI / 4;
    }
    // blend to the hand-tuned night palette once the sun is well below the horizon
    const phys = smoothstep(-0.26, -0.06, e);
    this.uniforms.uPhys.value = phys;
    if (!Number.isFinite(physZ.r + physZ.g + physZ.b + physH.r + physH.g + physH.b)) { physZ.copy(ZEN_DAY); physH.copy(HOR_DAY); }
    const z = this._z.copy(ZEN_NIGHT).lerp(physZ, phys);
    const h = this._h.copy(HOR_NIGHT).lerp(physH, phys);
    // weather: overcast desaturates and darkens
    const oc = clamp(weather.cloud * 1.1 - 0.35, 0, 1) * 0.85 + weather.dark * 0.15;
    const ovc = this._t.copy(OVERCAST).multiplyScalar(lerp(0.06, 1.0, day) * (1 - weather.dark * 0.55));
    z.lerp(ovc, oc);
    h.lerp(ovc, oc * 0.9);
    if (weather.tint) { z.lerp(weather.tint, weather.tintAmt); h.lerp(weather.tint, weather.tintAmt); }
    this.uniforms.uZenith.value.copy(z);
    U.uHorizon.value.copy(h);
    const sunCol = U.uSunColor.value;
    sunCol.setRGB(1.0, lerp(0.45, 0.96, smoothstep(0.0, 0.35, e)), lerp(0.2, 0.9, smoothstep(0.02, 0.45, e)));
    this.uniforms.uGlow.value.setRGB(1.0, 0.55, 0.3).multiplyScalar(sunset * (1 - oc * 0.8) * 0.9 + 0.08 * day);
    this.uniforms.uCloudCover.value = weather.cloud;
    this.uniforms.uCloudDark.value = weather.dark;
    this.uniforms.uStars.value = 1 - smoothstep(-0.26, -0.09, e);
    this.cloudOffset.x += dt * 0.004 * (0.3 + U.uWind.value) * U.uWindDir.value.x;
    this.cloudOffset.y += dt * 0.004 * (0.3 + U.uWind.value) * U.uWindDir.value.y;
    this.uniforms.uCloudOffset.value.copy(this.cloudOffset);

    // Fog colour = horizon colour with slight darkening
    this.fogColor.copy(h).multiplyScalar(0.78);
    if (weather.fogTint) this.fogColor.lerp(weather.fogTint, 0.5);

    // Sun / moon light
    const moonUp = U.uNight.value;
    const sunI = smoothstep(-0.03, 0.15, e) * 3.2 * (1 - oc * 0.75);
    const moonI = moonUp * 0.32 * (1 - weather.cloud * 0.6);
    if (sunI > moonI) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = sunI;
      this.lightDir = this.sunDir;
    } else {
      this.sun.color.setRGB(0.6, 0.7, 1.0);
      this.sun.intensity = moonI;
      this.lightDir = this._moon || (this._moon = new THREE.Vector3());
      this.lightDir.copy(this.sunDir).negate().add(new THREE.Vector3(0.15, 0, 0.1)).normalize();
    }
    this.hemi.color.copy(z).lerp(h, 0.4).multiplyScalar(1.0);
    this.hemi.groundColor.setRGB(0.25, 0.21, 0.15).multiplyScalar(lerp(0.08, 1, day));
    this.hemi.intensity = lerp(0.35, 1.25, day) * (1 - oc * 0.2) + U.uFlash.value * 3;
    this.ambient.intensity = 0.04 + moonUp * 0.06;
    if (inCave) {
      this.sun.intensity = 0;
      this.hemi.intensity = 0.06;
      this.ambient.intensity = 0.03;
    }
    // light follows focus
    const ld = this.lightDir;
    this.sun.position.set(focus.x + ld.x * 400, focus.y + Math.max(ld.y, 0.05) * 400, focus.z + ld.z * 400);
    // snap target to texel grid to reduce shimmering
    const texel = (this.shadowExtent || 180) / this.sun.shadow.mapSize.x;
    this.sun.target.position.set(Math.round(focus.x / texel) * texel, focus.y, Math.round(focus.z / texel) * texel);
    this.sun.target.updateMatrixWorld();

    this.mesh.visible = !inCave;
    this.envTimer -= dt;
  }

  // Regenerate the image-based lighting from the current sky
  updateEnvironment(force = false) {
    if (!force && this.envTimer > 0) return;
    this.envTimer = 3;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.04, 0.1, 500);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.55;
  }

  follow(camPos) { this.mesh.position.copy(camPos); }
}
