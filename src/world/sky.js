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
varying vec3 vDir;
${GLSL_NOISE}
float fbm5(vec2 p){ float s=0.0; float a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.02+11.3; a*=0.5;} return s/0.96875; }
void main(){
  vec3 dir = normalize(vDir);
  float y = dir.y;
  float yp = max(y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(yp, 0.45));
  if (y < 0.0) col = mix(uHorizon, uHorizon * 0.55, smoothstep(0.0, -0.25, y));
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
  // clouds
  if (y > -0.02) {
    vec2 cuv = dir.xz / (y + 0.12) * 0.9 + uCloudOffset;
    float n = fbm5(cuv * 1.3);
    float n2 = fbm3(cuv * 4.5 + 3.0);
    float cov = uCloudCover;
    float dens = smoothstep(1.0 - cov - 0.08, 1.0 - cov + 0.32, n * 0.85 + n2 * 0.25);
    dens *= smoothstep(-0.02, 0.18, y);
    // lighting: thicker clouds darker underneath, sun side brighter
    float light = 0.55 + 0.45 * pow(sd, 3.0);
    vec3 cBright = mix(uHorizon * 1.05 + vec3(0.06), uSunColor * 0.95 + uHorizon * 0.3, 0.45 * (1.0 - uNight));
    vec3 cDark = mix(uHorizon * 0.55, vec3(0.16, 0.17, 0.19), uCloudDark);
    vec3 cc = mix(cBright * light, cDark, clamp(n2 * 0.8 + uCloudDark * 0.7, 0.0, 1.0));
    cc *= mix(1.0, 0.08, uNight);
    cc += uGlow * pow(sd, 4.0) * 0.4 * dens;
    col = mix(col, cc, clamp(dens, 0.0, 1.0));
  }
  col += vec3(0.55, 0.6, 0.85) * uFlash;
  col *= uTint;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

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

  setShadowQuality(size, enabled) {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(size, size);
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

    const z = this._z.copy(ZEN_NIGHT).lerp(ZEN_DAY, day);
    const h = this._h.copy(HOR_NIGHT).lerp(HOR_DAY, day);
    z.lerp(ZEN_SET, sunset * 0.6);
    h.lerp(HOR_SET, sunset * 0.75);
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
    this.uniforms.uStars.value = U.uNight.value;
    this.cloudOffset.x += dt * 0.004 * (0.3 + U.uWind.value) * U.uWindDir.value.x;
    this.cloudOffset.y += dt * 0.004 * (0.3 + U.uWind.value) * U.uWindDir.value.y;
    this.uniforms.uCloudOffset.value.copy(this.cloudOffset);

    // Fog colour = horizon colour with slight darkening
    this.fogColor.copy(h).multiplyScalar(0.92);
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
    const texel = 180 / this.sun.shadow.mapSize.x;
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
