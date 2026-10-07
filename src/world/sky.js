// Atmospheric sky with ray-marched volumetric clouds, stars, moon, sun light and IBL environment.
import * as THREE from 'three';
import { U } from '../render/common.js';
import { cloud3DTexture, cloudMapTexture } from '../render/textures.js';

const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uTime;
uniform float uCloudCover;
uniform float uCloudDark;
uniform sampler2D uCloudTex;
uniform sampler3D uCloud3D;
uniform vec2 uCloudOffset;
uniform float uSkyScale;
uniform float uTurbidity;
uniform float uRayleigh;
uniform float uStars;
uniform float uLightning;
uniform vec3 uLightningPos;
uniform vec3 uSunColor;
uniform vec3 uAmbientTop;
uniform float uCloudSteps;
uniform vec3 uCamPos;

const float PI = 3.141592653589793;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;

float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - exp(-((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}
float hgPhase(float c, float g) {
  float g2 = g * g;
  return 0.07957747 * (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 atmosphere(vec3 dir, vec3 sunDir, float discOn) {
  float sunfade = 1.0 - clamp(1.0 - exp(sunDir.y / 0.45), 0.0, 1.0);
  float rayleighCoefficient = uRayleigh - (1.0 - sunfade);
  vec3 betaR = totalRayleigh * rayleighCoefficient;
  float c = (0.2 * uTurbidity) * 10E-18;
  vec3 betaM = 0.434 * c * MieConst * 0.005;
  float sunE = sunIntensity(sunDir.y);
  float zenithAngle = acos(max(0.0, dir.y));
  float inv = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / PI), -1.253));
  float sR = 8.4E3 * inv;
  float sM = 1.25E3 * inv;
  vec3 Fex = exp(-(betaR * sR + betaM * sM));
  float cosTheta = dot(dir, sunDir);
  float rPhase = 0.05968310 * (1.0 + pow(cosTheta * 0.5 + 0.5, 2.0));
  vec3 betaRTheta = betaR * rPhase;
  vec3 betaMTheta = betaM * hgPhase(cosTheta, 0.8);
  vec3 Lin = pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * Fex, vec3(0.5)), clamp(pow(1.0 - sunDir.y, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float sundisc = smoothstep(0.99996, 0.99999, cosTheta) * discOn;
  vec3 sunCol = sundisc * min(sunE * Fex * 0.6, vec3(40.0));
  return (Lin + L0) * 0.04 + sunCol;
}

vec3 nightSky(vec3 dir) {
  vec3 col = vec3(0.0025, 0.0045, 0.010) * (0.4 + 0.6 * max(dir.y, 0.0));
  if (uStars > 0.001 && dir.y > -0.05) {
    // star field
    vec3 p = dir * 420.0;
    vec3 cell = floor(p);
    float h = hash13(cell);
    if (h > 0.985) {
      vec3 f = fract(p) - 0.5 - (vec3(hash13(cell + 1.3), hash13(cell + 2.1), hash13(cell + 3.7)) - 0.5) * 0.6;
      float d = length(f);
      float b = pow(max(0.0, 1.0 - d * 3.2), 6.0) * (h - 0.985) * 66.0;
      float tw = 0.65 + 0.35 * sin(uTime * (2.0 + h * 7.0) + h * 80.0);
      vec3 sc = mix(vec3(1.0, 0.8, 0.6), vec3(0.7, 0.85, 1.0), hash13(cell + 9.1));
      col += sc * b * tw * 0.5;
    }
    // milky way band
    vec3 gal = normalize(vec3(0.3, 0.55, -0.78));
    float band = 1.0 - abs(dot(dir, gal));
    float mw = pow(band, 18.0);
    float n = texture(uCloud3D, dir * 0.9).g;
    col += vec3(0.5, 0.55, 0.75) * mw * (0.4 + n) * 0.012;
    col *= uStars;
    col *= smoothstep(-0.05, 0.12, dir.y) * 0.85 + 0.15;
  }
  // moon
  float md = dot(dir, uMoonDir);
  float moonR = 0.99975;
  if (md > moonR) {
    vec3 tangentX = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 tangentY = cross(tangentX, uMoonDir);
    vec3 off = dir - uMoonDir * md;
    vec2 uv = vec2(dot(off, tangentX), dot(off, tangentY)) / sqrt(1.0 - moonR * moonR);
    float r = length(uv);
    vec3 nrm = vec3(uv, sqrt(max(0.0, 1.0 - r * r)));
    float lit = clamp(dot(nrm, normalize(vec3(-0.45, 0.2, 0.85))), 0.0, 1.0);
    float crater = texture(uCloud3D, vec3(uv * 0.6, 0.3)).r;
    vec3 moonCol = vec3(0.95, 0.93, 0.88) * (0.55 + 0.45 * crater) * (0.04 + lit);
    col = mix(col, moonCol * 0.9, smoothstep(1.0, 0.94, r));
  }
  // moon glow
  col += vec3(0.6, 0.7, 0.9) * pow(max(md, 0.0), 400.0) * 0.05 * uStars;
  return col;
}

// --- volumetric clouds ---
const float CLOUD_BOT = 1350.0;
const float CLOUD_TOP = 3300.0;

float cloudDensity(vec3 p, bool detail) {
  vec2 wuv = (p.xz + uCloudOffset) / 22000.0;
  vec4 weather = texture(uCloudTex, wuv);
  float cover = clamp(uCloudCover, 0.0, 1.0);
  float hf = (p.y - CLOUD_BOT) / (CLOUD_TOP - CLOUD_BOT);
  // cumulus: flat base, billowing rounded tops; individual cells from the worley channel
  float cell = weather.b * 0.75 + weather.r * 0.45;
  float profile = smoothstep(0.0, 0.07, hf) * (1.0 - smoothstep(0.25 + cell * 0.6, 0.35 + cell * 0.65, hf));
  float base = texture(uCloud3D, (p + vec3(uCloudOffset.x, 0.0, uCloudOffset.y)) * 0.00018).r;
  float shape = base * 0.55 + cell * 0.65;
  float d = clamp((shape * profile - (1.02 - cover * 0.85)) * 5.0, 0.0, 1.0);
  if (detail && d > 0.0) {
    float det = texture(uCloud3D, p * 0.0009 + vec3(uTime * 0.003, 0.0, 0.0)).g;
    d = clamp(d - det * 0.28 * (1.0 - hf * 0.4), 0.0, 1.0);
  }
  return d;
}

vec4 clouds(vec3 ro, vec3 rd, vec3 skyCol, float jitter, vec3 sunDir, vec3 lightCol) {
  if (rd.y < 0.012 || uCloudCover < 0.02) return vec4(0.0, 0.0, 0.0, 1.0);
  float t0 = (CLOUD_BOT - ro.y) / rd.y;
  float t1 = (CLOUD_TOP - ro.y) / rd.y;
  t0 = max(t0, 0.0);
  if (t0 > 60000.0) return vec4(0.0, 0.0, 0.0, 1.0);
  t1 = min(t1, t0 + 9000.0);
  int steps = int(uCloudSteps);
  float stepL = (t1 - t0) / float(steps);
  float t = t0 + stepL * jitter;
  float T = 1.0;
  vec3 acc = vec3(0.0);
  float cosT = dot(rd, sunDir);
  float phase = mix(hgPhase(cosT, 0.55), hgPhase(cosT, -0.25), 0.3) * 4.0;
  vec3 ambient = uAmbientTop;
  float dark = 1.0 - uCloudDark * 0.75;
  for (int i = 0; i < 64; i++) {
    if (i >= steps || T < 0.02) break;
    vec3 p = ro + rd * t;
    float d = cloudDensity(p, true);
    if (d > 0.001) {
      // light march
      float ld = 0.0;
      float ls = 70.0;
      vec3 lp = p;
      for (int j = 0; j < 5; j++) {
        lp += sunDir * ls;
        ld += cloudDensity(lp, false) * ls;
        ls *= 1.75;
      }
      float sigma = 0.02 * (1.0 + uCloudDark * 1.5);
      // multiple-scattering approximation (several attenuated octaves)
      float beer = exp(-ld * sigma * 0.5) + 0.45 * exp(-ld * sigma * 0.12) + 0.2 * exp(-ld * sigma * 0.03);
      float powder = 1.0 - exp(-d * 6.0);
      float hf = (p.y - CLOUD_BOT) / (CLOUD_TOP - CLOUD_BOT);
      vec3 lit = lightCol * beer * mix(1.0, powder, 0.55) * max(phase, 0.8) * 1.5 * dark + ambient * (0.25 + 0.9 * hf) * dark;
      // lightning illuminates clouds from within
      lit += vec3(0.7, 0.75, 1.0) * uLightning * 60.0 * exp(-length(p.xz - uLightningPos.xz) * 0.0012);
      float ext = exp(-d * stepL * sigma);
      acc += T * lit * (1.0 - ext);
      T *= ext;
    }
    t += stepL;
  }
  // distance fade into haze
  float fade = exp(-t0 * 0.000045);
  acc = mix(skyCol * (1.0 - T), acc, fade);
  return vec4(acc, T);
}

vec3 fullSky(vec3 dir, vec3 ro, float jitter, bool withClouds) {
  vec3 sky = atmosphere(dir, uSunDir, withClouds ? 1.0 : 0.0) * uSkyScale;
  vec3 night = nightSky(dir);
  float dayAmt = smoothstep(-0.18, 0.05, uSunDir.y);
  vec3 col = sky + night * (1.0 - dayAmt * 0.95);
  // deepen the zenith toward a rich photographic blue
  float zen = smoothstep(0.02, 0.7, dir.y) * dayAmt * (1.0 - uCloudDark);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, lum * vec3(0.42, 0.72, 1.55), zen * 0.55);
  // overcast desaturation
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(grey) * 0.85, uCloudDark * 0.75);
  if (withClouds) {
    vec3 lightDir = uSunDir.y > -0.08 ? uSunDir : uMoonDir;
    vec4 c = clouds(ro, dir, col, jitter, lightDir, uSunColor);
    col = col * c.a + c.rgb;
  } else {
    // cheap cloud approximation for the environment map
    float cover = uCloudCover * smoothstep(0.0, 0.25, dir.y);
    col = mix(col, uAmbientTop * 1.2 + uSunColor * 0.08, cover * 0.6);
  }
  // lightning flash on the whole sky
  col += vec3(0.6, 0.65, 0.9) * uLightning * 0.5 * smoothstep(-0.1, 0.4, dir.y);
  if (dir.y < 0.0) col *= mix(1.0, 0.35, smoothstep(0.0, -0.3, dir.y));
  return col;
}
`;

function makeSkyMaterial(fullscreen) {
  const uniforms = {
    uSunDir: U.uSunDir,
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uTime: U.uTime,
    uCloudCover: U.uCloudCover,
    uCloudDark: { value: 0 },
    uCloudTex: { value: cloudMapTexture() },
    uCloud3D: { value: cloud3DTexture() },
    uCloudOffset: U.uCloudOffset,
    uSkyScale: { value: 1.0 },
    uTurbidity: { value: 2.5 },
    uRayleigh: { value: 2.8 },
    uStars: { value: 0 },
    uLightning: U.uLightning,
    uLightningPos: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAmbientTop: { value: new THREE.Color(0.3, 0.4, 0.6) },
    uCloudSteps: { value: 40 },
    uCamPos: { value: new THREE.Vector3() },
    uProjInv: { value: new THREE.Matrix4() },
    uViewInv: { value: new THREE.Matrix4() },
    uFrame: { value: 0 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: fullscreen
      ? /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
      : /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
    fragmentShader: (fullscreen ? 'varying vec2 vUv;\nuniform mat4 uProjInv;\nuniform mat4 uViewInv;\nuniform float uFrame;\n' : 'varying vec3 vDir;\n') + SKY_GLSL + (fullscreen
      ? /* glsl */ `
      void main() {
        vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec4 vp = uProjInv * ndc;
        vec3 dir = normalize((uViewInv * vec4(vp.xyz / vp.w, 0.0)).xyz);
        float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.618);
        vec3 col = fullSky(dir, uCamPos, jitter, true);
        gl_FragColor = vec4(col, 1.0);
      }`
      : /* glsl */ `
      void main() {
        vec3 dir = normalize(vDir);
        vec3 col = fullSky(dir, vec3(0.0, 100.0, 0.0), 0.5, false);
        gl_FragColor = vec4(col, 1.0);
      }`),
    depthWrite: false,
    depthTest: false,
    side: fullscreen ? THREE.FrontSide : THREE.BackSide,
  });
}

export class Sky {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.timeOfDay = 9.0; // hours
    this.dayLengthMinutes = 28; // real minutes per in-game day
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.sunColor = new THREE.Color();
    this.ambientTop = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.dayFactor = 1;

    // half-res sky render target sampled by the in-scene sky dome
    this.rawRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.histRT = [0, 1].map(() => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.histIdx = 0;
    this.skyRT = this.histRT[0];
    this.prevVP = new THREE.Matrix4();
    this.resolveMat = new THREE.ShaderMaterial({
      uniforms: {
        tRaw: { value: null }, tHist: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
        uPrevVP: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uBlend: { value: 0.08 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tRaw, tHist;
        uniform mat4 uProjInv, uViewInv, uPrevVP;
        uniform vec2 uTexel;
        uniform float uBlend;
        void main() {
          vec3 mn = vec3(1e9), mx = vec3(-1e9), sum = vec3(0.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec3 c = texture2D(tRaw, vUv + vec2(float(x), float(y)) * uTexel).rgb;
            mn = min(mn, c); mx = max(mx, c); sum += c;
          }
          vec3 cur = mix(texture2D(tRaw, vUv).rgb, sum / 9.0, 0.5);
          vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 dir = normalize((uViewInv * vec4(vp.xyz / vp.w, 0.0)).xyz);
          vec4 pc = uPrevVP * vec4(dir, 0.0);
          vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
          float valid = (pc.w > 0.0 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) ? 1.0 : 0.0;
          vec3 ext = (mx - mn) * 0.35;
          vec3 hist = clamp(texture2D(tHist, puv).rgb, mn - ext, mx + ext);
          gl_FragColor = vec4(mix(cur, hist, valid * (1.0 - uBlend)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.resolveQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.resolveMat);
    this.resolveQuad.frustumCulled = false;
    this.resolveScene = new THREE.Scene();
    this.resolveScene.add(this.resolveQuad);
    this.skyMat = makeSkyMaterial(true);
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMat);
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.fsQuad);
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsQuad.frustumCulled = false;

    // dome in the main scene: draws the precomputed sky texture behind everything
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: { tSky: { value: this.skyRT.texture }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: /* glsl */ `
        void main() {
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          #ifdef REVERSED_DEPTH
            p.z = 0.0;
          #else
            p.z = p.w;
          #endif
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSky;
        uniform vec2 uRes;
        void main() { gl_FragColor = vec4(texture2D(tSky, gl_FragCoord.xy / uRes).rgb, 1.0); }`,
      depthWrite: false,
      side: THREE.BackSide,
    });
    if (renderer.state.buffers.depth.getReversed && renderer.state.buffers.depth.getReversed()) this.domeMat.defines.REVERSED_DEPTH = '';
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 1000;
    scene.add(this.dome);

    // environment (IBL)
    this.envMat = makeSkyMaterial(false);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.envMat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.lastEnvUpdate = -1e9;
    this.lastEnvSun = new THREE.Vector3();
    this.lastEnvCover = -1;

    // fog colour readback
    this.horizonColor = new THREE.Color(0.5, 0.6, 0.7);

    // key light (sun or moon)
    this.light = new THREE.DirectionalLight(0xffffff, 3);
    this.light.castShadow = true;
    const sm = quality.shadowMapSize;
    this.light.shadow.mapSize.set(sm, sm);
    this.shadowExtent = quality.shadowExtent;
    const sc = this.light.shadow.camera;
    sc.left = -this.shadowExtent; sc.right = this.shadowExtent;
    sc.top = this.shadowExtent; sc.bottom = -this.shadowExtent;
    sc.near = 1; sc.far = 1600;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.6;
    this.light.shadow.radius = 2;
    scene.add(this.light);
    scene.add(this.light.target);

    this.weather = { cover: 0.4, dark: 0 };
    this.frame = 0;
  }

  setSize(w, h) {
    const s = this.quality.skyRes;
    const sw = Math.max(4, Math.floor(w * s)), sh = Math.max(4, Math.floor(h * s));
    this.rawRT.setSize(sw, sh);
    this.histRT.forEach((t) => t.setSize(sw, sh));
    this.resolveMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
    this.domeMat.uniforms.uRes.value.set(w, h);
  }

  advance(dt, timeScale = 1) {
    const hoursPerSec = 24 / (this.dayLengthMinutes * 60);
    this.timeOfDay = (this.timeOfDay + dt * hoursPerSec * timeScale) % 24;
    if (this.timeOfDay < 0) this.timeOfDay += 24;
  }

  _computeLighting() {
    const th = ((this.timeOfDay - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(th), Math.sin(th) * 0.86, Math.sin(th) * 0.42 + 0.08).normalize();
    // moon roughly opposite, offset so it is not exactly antipodal
    this.moonDir.set(-Math.cos(th) * 0.9, -Math.sin(th) * 0.8 + 0.12, -Math.sin(th) * 0.3 - 0.2).normalize();
    const el = this.sunDir.y;
    // atmospheric transmittance for the sun colour (Kasten-Young air mass)
    const elDeg = Math.max(-2, Math.asin(Math.max(-1, Math.min(1, el))) * 57.2958);
    const airmass = 1 / (Math.max(0.0, Math.sin(Math.max(0, elDeg) / 57.2958)) + 0.50572 * Math.pow(Math.max(0.1, elDeg + 6.07995), -1.6364));
    const tau = [0.1, 0.22, 0.48];
    const tr = tau.map((t) => Math.exp(-t * Math.min(airmass, 40) * 0.55));
    const sunUp = THREE.MathUtils.smoothstep(el, -0.04, 0.08);
    this.dayFactor = THREE.MathUtils.smoothstep(el, -0.2, 0.15);
    const cover = this.weather.cover, dark = this.weather.dark;
    const overcast = 1 - dark * 0.8;
    this.sunColor.setRGB(tr[0], tr[1], tr[2]).multiplyScalar(10.0 * sunUp * overcast);
    const moonUp = THREE.MathUtils.smoothstep(this.moonDir.y, -0.02, 0.12);
    const night = 1 - THREE.MathUtils.smoothstep(el, -0.12, 0.02);
    const moonColor = new THREE.Color(0.5, 0.62, 0.9).multiplyScalar(0.35 * moonUp * night * (1 - dark * 0.7));
    this.useMoon = sunUp < 0.02 && moonUp > 0;
    this.keyDir = this.useMoon ? this.moonDir : this.sunDir;
    this.keyColor = this.useMoon ? moonColor : this.sunColor;
    // ambient sky top colour (for clouds)
    const day = this.dayFactor;
    this.ambientTop.setRGB(0.18 + 0.12 * (1 - day), 0.3, 0.55).multiplyScalar(0.02 + day * 0.9 * (1 - dark * 0.6));
    if (el < 0.2 && el > -0.2) {
      const glow = 1 - Math.abs(el) / 0.2;
      this.ambientTop.r += 0.15 * glow * day;
      this.ambientTop.g += 0.05 * glow * day;
    }
  }

  update(dt, camera, weather) {
    this.weather = weather;
    this._computeLighting();
    U.uSunDir.value.copy(this.keyDir);
    U.uSunUp.value = this.useMoon ? 0 : 1;
    U.uCloudCover.value = weather.cover;
    U.uCloudShadow.value = 0.55 + weather.dark * 0.3;

    for (const m of [this.skyMat, this.envMat]) {
      const u = m.uniforms;
      u.uMoonDir.value.copy(this.moonDir);
      u.uCloudDark.value = weather.dark;
      u.uStars.value = (1 - this.dayFactor) * (1 - weather.cover * 0.8);
      u.uSunColor.value.copy(this.useMoon ? this.keyColor : this.sunColor).multiplyScalar(this.useMoon ? 0.6 : 0.42);
      u.uAmbientTop.value.copy(this.ambientTop);
      u.uTurbidity.value = 1.8 + weather.dark * 4 + weather.haze * 5;
      u.uSkyScale.value = 1.0;
      u.uCloudSteps.value = this.quality.cloudSteps;
      u.uLightningPos.value.copy(weather.lightningPos || new THREE.Vector3());
    }
    // sun / moon key light & shadow camera follow the player
    const L = this.light;
    L.color.copy(this.keyColor);
    L.intensity = 1;
    const target = camera.position;
    const ext = this.shadowExtent;
    const texel = (ext * 2) / this.light.shadow.mapSize.x;
    // snap to texel grid in light space to avoid shimmering
    const lightRot = new THREE.Matrix4().lookAt(new THREE.Vector3(), this.keyDir.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = lightRot.clone().invert();
    const p = target.clone().applyMatrix4(inv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(lightRot);
    L.target.position.copy(p);
    L.position.copy(p).addScaledVector(this.keyDir, 800);
    L.target.updateMatrixWorld();
    L.castShadow = this.keyColor.r + this.keyColor.g > 0.02;
  }

  // Render the sky into the half-res target (called each frame before the scene)
  renderSky(camera) {
    const u = this.skyMat.uniforms;
    u.uCamPos.value.copy(camera.position);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uViewInv.value.copy(camera.matrixWorld);
    u.uFrame.value = this.frame++ % 64;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rawRT);
    r.render(this.fsScene, this.fsCam);
    // temporal accumulation with reprojection (sky is at infinity: rotation only)
    const ru = this.resolveMat.uniforms;
    const src = this.histRT[this.histIdx], dst = this.histRT[1 - this.histIdx];
    ru.tRaw.value = this.rawRT.texture;
    ru.tHist.value = src.texture;
    ru.uProjInv.value.copy(camera.projectionMatrixInverse);
    ru.uViewInv.value.copy(camera.matrixWorld);
    ru.uPrevVP.value.copy(this.prevVP);
    // drop history after a sudden change (time skip, teleport, weather snap)
    const jump = !this._lastSun || this._lastSun.distanceTo(this.sunDir) > 0.03;
    ru.uBlend.value = jump ? 1 : 0.08;
    (this._lastSun || (this._lastSun = new THREE.Vector3())).copy(this.sunDir);
    r.setRenderTarget(dst);
    r.render(this.resolveScene, this.fsCam);
    this.histIdx = 1 - this.histIdx;
    this.skyRT = dst;
    this.domeMat.uniforms.tSky.value = dst.texture;
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse);
    this.prevVP.multiplyMatrices(camera.projectionMatrix, rot);
    r.setRenderTarget(prev);
  }

  updateEnvironment(force = false) {
    const now = performance.now();
    const moved = this.lastEnvSun.distanceTo(this.sunDir) > 0.01 || Math.abs(this.lastEnvCover - this.weather.cover) > 0.03;
    if (!force && (!moved || now - this.lastEnvUpdate < 1500)) return;
    this.lastEnvUpdate = now;
    this.lastEnvSun.copy(this.sunDir);
    this.lastEnvCover = this.weather.cover;
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000, { size: 128 });
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
    this._probeHorizon();
  }

  _probeHorizon() {
    const day = this.dayFactor;
    const el = this.sunDir.y;
    const dark = this.weather.dark;
    // analytic horizon colour
    const dayCol = new THREE.Color(0.52, 0.63, 0.78).multiplyScalar(1.15);
    const duskCol = new THREE.Color(0.85, 0.5, 0.32).multiplyScalar(0.55);
    const nightCol = new THREE.Color(0.010, 0.016, 0.032);
    const dusk = Math.max(0, 1 - Math.abs(el) / 0.22);
    const c = nightCol.clone().lerp(dayCol, day);
    c.lerp(duskCol, dusk * 0.6 * Math.min(1, day * 2 + 0.2));
    const grey = (c.r + c.g + c.b) / 3;
    c.lerp(new THREE.Color(grey, grey, grey * 1.05).multiplyScalar(0.75), dark * 0.85);
    this.horizonColor.copy(c);
  }
}
