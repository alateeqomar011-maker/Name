// Screen-space volumetric light shafts ("god rays") and physically-motivated lens ghosts from the sun.
// Uses the scene depth buffer so shafts stream through gaps in trees, ridges and dinosaurs.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const shader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1.6 },
    uIntensity: { value: 0 }, uSunColor: { value: new THREE.Color(1, 0.9, 0.7) }, uFlare: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect; uniform float uIntensity;
    uniform vec3 uSunColor; uniform float uFlare;
    varying vec2 vUv;
    float skyMask(vec2 p){
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;
      return step(0.99999, texture2D(tDepth, p).r);
    }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;
      // scrub NaN/Inf from any shader so bloom can never smear one bad pixel across the frame
      if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
      col = min(col, vec3(64.0));
      if (uIntensity > 0.001) {
        const int N = 40;
        vec2 delta = (vUv - uSun) / float(N) * 0.95;
        vec2 p = vUv;
        float illum = 0.0;
        float decay = 1.0;
        float jitter = h(vUv * 731.0);
        p -= delta * jitter;
        for (int i = 0; i < N; i++) {
          p -= delta;
          vec2 d = (p - uSun) * vec2(uAspect, 1.0);
          float glow = exp(-dot(d, d) * 16.0);
          illum += skyMask(p) * glow * decay;
          decay *= 0.965;
        }
        illum /= float(N);
        col += uSunColor * illum * uIntensity * 1.5;
      }
      if (uFlare > 0.001) {
        // lens ghosts along the axis from the sun through the screen centre
        vec2 axis = vec2(0.5) - uSun;
        vec3 ghosts = vec3(0.0);
        float sizes[5]; sizes[0] = 0.05; sizes[1] = 0.08; sizes[2] = 0.035; sizes[3] = 0.12; sizes[4] = 0.06;
        float offs[5]; offs[0] = 0.55; offs[1] = 0.85; offs[2] = 1.25; offs[3] = 1.55; offs[4] = 2.05;
        vec3 tints[5]; tints[0] = vec3(1.0, 0.6, 0.3); tints[1] = vec3(0.4, 0.8, 1.0); tints[2] = vec3(0.6, 1.0, 0.5); tints[3] = vec3(0.7, 0.5, 1.0); tints[4] = vec3(1.0, 0.8, 0.5);
        for (int i = 0; i < 5; i++) {
          vec2 gp = uSun + axis * offs[i];
          vec2 d = (vUv - gp) * vec2(uAspect, 1.0);
          float r = length(d) / sizes[i];
          // faint, mostly-rim ghosts like real coated lens elements
          ghosts += tints[i] * smoothstep(1.0, 0.8, r) * (0.15 + 0.85 * smoothstep(0.6, 1.0, r)) * 0.016;
        }
        // soft halo ring
        vec2 hd = (vUv - vec2(0.5)) * vec2(uAspect, 1.0);
        float ring = exp(-pow((length(hd) - 0.42) * 22.0, 2.0)) * 0.012;
        float sunVis = (skyMask(uSun) + skyMask(uSun + vec2(0.01, 0.0)) + skyMask(uSun - vec2(0.01, 0.0)) + skyMask(uSun + vec2(0.0, 0.015)) + skyMask(uSun - vec2(0.0, 0.015))) / 5.0;
        col += (ghosts + ring * vec3(0.8, 0.9, 1.0)) * uSunColor * uFlare * sunVis;
      }
      gl_FragColor = vec4(col, base.a);
    }`,
};

// Scene luminance probe for eye adaptation: a tiny log-luminance image read back asynchronously
const lumShader = {
  vertexShader: shader.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      float s = 0.0;
      for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
        vec3 c = texture2D(tDiffuse, vUv + (vec2(float(i), float(j)) - 1.5) / vec2(64.0, 36.0)).rgb;
        s += log2(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
      }
      gl_FragColor = vec4(clamp((s / 16.0 + 12.0) / 16.0, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`,
};

export class GodRaysPass extends Pass {
  constructor() {
    super();
    this.lumRT = new THREE.WebGLRenderTarget(16, 9, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.lumMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: lumShader.vertexShader, fragmentShader: lumShader.fragmentShader, depthTest: false, depthWrite: false });
    this.lumQuad = new FullScreenQuad(this.lumMat);
    this.lumBuf = new Uint8Array(16 * 9 * 4);
    this.avgLum = 0.18;
    this._lumN = 0;
    this._lumBusy = false;
    this.material = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(shader.uniforms), vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, depthTest: false, depthWrite: false });
    this.uniforms = this.material.uniforms;
    this.fsQuad = new FullScreenQuad(this.material);
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this.visible = 1;
  }
  // Called each frame with camera and sun info
  setup(camera, sunDir, sunColor, strength, aspect) {
    const v = this._v.copy(camera.position).addScaledVector(sunDir, 4000).project(camera);
    camera.getWorldDirection(this._f);
    const facing = this._f.dot(sunDir);
    this.uniforms.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    this.uniforms.uAspect.value = aspect;
    const onScreen = facing > 0 ? Math.max(0, 1 - Math.max(0, Math.max(Math.abs(v.x), Math.abs(v.y)) - 1) * 1.5) : 0;
    this.uniforms.uIntensity.value = strength * onScreen * Math.max(0, facing);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uFlare.value = strength * (facing > 0.6 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 ? (facing - 0.6) * 2.5 : 0) * this.visible;
  }
  _probe(renderer, readBuffer) {
    const now = performance.now();
    if (this._lumBusy || now - (this._lumAt || 0) < 400 || !renderer.readRenderTargetPixelsAsync) return;
    this._lumAt = now;
    this.lumMat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.lumRT);
    this.lumQuad.render(renderer);
    this._lumBusy = true;
    renderer.readRenderTargetPixelsAsync(this.lumRT, 0, 0, 16, 9, this.lumBuf).then(() => {
      let s = 0;
      for (let i = 0; i < 16 * 9; i++) s += (this.lumBuf[i * 4] / 255) * 16 - 12;
      this.avgLum = Math.pow(2, s / (16 * 9));
      this._lumBusy = false;
    }).catch(() => { this._lumBusy = false; });
  }
  render(renderer, writeBuffer, readBuffer) {
    this._probe(renderer, readBuffer);
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

// ---------------------------------------------------------------------------------------------
// Water compositing pass. The main RenderPass draws only layer 0 (opaque world + sky). This pass
// copies that frame's colour and depth into the next buffer, then draws the water (layer 1) while
// sampling the untouched originals for screen-space reflections, refraction and depth-based
// light absorption. Unlit particles (layer 2) are drawn last so splashes, mist and rain stay
// visible over the water.
export const LAYER_WATER = 1;
export const LAYER_OVERLAY = 2;
export const SSR_U = {
  tSceneColor: { value: null }, tSceneDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) },
  uCamNear: { value: 0.15 }, uCamFar: { value: 9000 }, uSSR: { value: 0 },
};

// Scalable ambient obscurance reconstructed from the depth buffer alone (no extra scene render,
// so it works with every custom vertex shader: grass, wind-swayed foliage, skinned dinosaurs).
const AO_COMMON = /* glsl */ `
  uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform vec2 uP;
  varying vec2 vUv;
  float vz(float d){ return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
  vec3 vpos(vec2 uv){ float z = vz(texture2D(tDepth, uv).r); return vec3((uv * 2.0 - 1.0) / uP * (-z), z); }
`;
const aoShader = {
  uniforms: { tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.15 }, uFar: { value: 9000 }, uP: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 1.1 }, uIntensity: { value: 1.0 } },
  vertexShader: shader.vertexShader,
  fragmentShader: AO_COMMON + /* glsl */ `
    uniform float uRadius; uniform float uIntensity;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      float d = texture2D(tDepth, vUv).r;
      if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 P = vpos(vUv);
      vec2 px = 1.0 / uRes;
      vec3 pr = vpos(vUv + vec2(px.x, 0.0)), pl = vpos(vUv - vec2(px.x, 0.0));
      vec3 pu = vpos(vUv + vec2(0.0, px.y)), pd = vpos(vUv - vec2(0.0, px.y));
      vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
      vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
      vec3 N = normalize(cross(dx, dy));
      float r = uRadius * (1.0 + smoothstep(20.0, 120.0, -P.z) * 2.0);
      float sr = r * uP.y / (-P.z) * 0.5;
      if (sr * uRes.y < 2.0) { gl_FragColor = vec4(1.0); return; }
      sr = min(sr, 0.1);
      float ang = h(vUv * uRes) * 6.2832;
      float jit = h(vUv * uRes + 17.0);
      float r2 = r * r;
      float occ = 0.0;
      const int S = 12;
      for (int i = 0; i < S; i++) {
        float t = (float(i) + jit) / float(S);
        float a = ang + float(i) * 2.39996;
        vec2 off = vec2(cos(a) * uRes.y / uRes.x, sin(a)) * sr * t;
        vec3 v = vpos(vUv + off) - P;
        float vv = dot(v, v);
        float f = max(r2 - vv, 0.0);
        occ += f * f * f * max((dot(v, N) - 0.002 * (-P.z)) / (vv + 0.01), 0.0);
      }
      float ao = max(0.0, 1.0 - occ * uIntensity * 5.0 / (r2 * r2 * r2 * float(S)));
      gl_FragColor = vec4(vec3(ao), 1.0);
    }`,
};
const aoBlurShader = {
  uniforms: { tAO: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.15 }, uFar: { value: 9000 }, uP: { value: new THREE.Vector2(1, 1) } },
  vertexShader: shader.vertexShader,
  fragmentShader: AO_COMMON + /* glsl */ `
    uniform sampler2D tAO;
    void main(){
      float zc = vz(texture2D(tDepth, vUv).r);
      vec2 px = 1.0 / uRes;
      float sum = 0.0, wsum = 0.0;
      for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
        vec2 uv = vUv + vec2(float(i), float(j)) * px;
        float z = vz(texture2D(tDepth, uv).r);
        float w = exp(-abs(z - zc) / (0.02 * abs(zc) + 0.05)) * (1.0 - 0.1 * float(abs(i) + abs(j)));
        sum += texture2D(tAO, uv).r * w; wsum += w;
      }
      gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
    }`,
};

export class WaterPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.ao = true;
    this.aoStrength = 0.85;
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, tAO: { value: null }, uAO: { value: 0 } },
      vertexShader: shader.vertexShader,
      fragmentShader: `uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tAO; uniform float uAO; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tColor, vUv);
          float d = texture2D(tDepth, vUv).r;
          if (uAO > 0.0 && d < 0.99999) c.rgb *= mix(1.0, texture2D(tAO, vUv).r, uAO);
          gl_FragColor = c; gl_FragDepth = d;
        }`,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
    });
    this.fsQuad = new FullScreenQuad(this.copyMat);
    const rtOpts = { type: THREE.UnsignedByteType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    this.aoRT = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.aoRT2 = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.aoMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(aoShader.uniforms), vertexShader: aoShader.vertexShader, fragmentShader: aoShader.fragmentShader, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(aoBlurShader.uniforms), vertexShader: aoBlurShader.vertexShader, fragmentShader: aoBlurShader.fragmentShader, depthTest: false, depthWrite: false });
    this.aoQuad = new FullScreenQuad(this.aoMat);
    this.blurQuad = new FullScreenQuad(this.blurMat);
  }
  setSize(w, h) {
    const hw = Math.max(1, Math.floor(w / 2)), hh = Math.max(1, Math.floor(h / 2));
    this.aoRT.setSize(hw, hh);
    this.aoRT2.setSize(hw, hh);
  }
  _ao(renderer, readBuffer) {
    const cam = this.camera;
    const pe = cam.projectionMatrix.elements;
    for (const m of [this.aoMat, this.blurMat]) {
      const u = m.uniforms;
      u.tDepth.value = readBuffer.depthTexture;
      u.uRes.value.set(this.aoRT.width, this.aoRT.height);
      u.uNear.value = cam.near; u.uFar.value = cam.far;
      u.uP.value.set(pe[0], pe[5]);
    }
    renderer.setRenderTarget(this.aoRT);
    this.aoQuad.render(renderer);
    this.blurMat.uniforms.tAO.value = this.aoRT.texture;
    renderer.setRenderTarget(this.aoRT2);
    this.blurQuad.render(renderer);
  }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    if (this.ao) this._ao(renderer, readBuffer);
    this.copyMat.uniforms.tAO.value = this.aoRT2.texture;
    this.copyMat.uniforms.uAO.value = this.ao ? this.aoStrength : 0;
    SSR_U.tSceneColor.value = readBuffer.texture;
    SSR_U.tSceneDepth.value = readBuffer.depthTexture;
    SSR_U.uResolution.value.set(readBuffer.width, readBuffer.height);
    SSR_U.uCamNear.value = cam.near;
    SSR_U.uCamFar.value = cam.far;
    SSR_U.uSSR.value = 1;
    this.copyMat.uniforms.tColor.value = readBuffer.texture;
    this.copyMat.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(writeBuffer);
    this.fsQuad.render(renderer);
    const mask = cam.layers.mask;
    const ac = renderer.autoClear, su = renderer.shadowMap.autoUpdate, bg = this.scene.background;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    this.scene.background = null;
    cam.layers.set(LAYER_WATER);
    renderer.render(this.scene, cam);
    cam.layers.set(LAYER_OVERLAY);
    renderer.render(this.scene, cam);
    cam.layers.mask = mask;
    this.scene.background = bg;
    renderer.autoClear = ac;
    renderer.shadowMap.autoUpdate = su;
  }
  dispose() { this.copyMat.dispose(); this.fsQuad.dispose(); this.aoRT.dispose(); this.aoRT2.dispose(); this.aoMat.dispose(); this.blurMat.dispose(); this.aoQuad.dispose(); this.blurQuad.dispose(); }
}

// ---------------------------------------------------------------------------------------------
// Cinematic lens: depth of field focused on the subject (the player in third person, the screen
// centre otherwise) with a soft circular bokeh, plus camera motion blur reconstructed from depth
// and last frame's view-projection, so fast turns and the fast-travel swoop smear like film.
const cineShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
    uNear: { value: 0.15 }, uFar: { value: 9000 }, uFocus: { value: 6 }, uAperture: { value: 1 }, uFarBlur: { value: 1 },
    uMaxCoC: { value: 7 }, uShutter: { value: 0.5 }, uMB: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uRes;
    uniform mat4 uInvProj; uniform mat4 uInvView; uniform mat4 uPrevVP;
    uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uAperture; uniform float uFarBlur; uniform float uMaxCoC;
    uniform float uShutter; uniform float uMB;
    varying vec2 vUv;
    float viewZ(float d){ return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
    // signed circle of confusion in pixels: + behind the focus plane, - in front of it
    float coc(float d){
      float z = -viewZ(d);
      float c = (z - uFocus) / max(z, 0.01);
      // background softens gently and only well behind the subject; foreground blurs sooner
      float far = smoothstep(uFocus * 4.0, uFocus * 40.0, z) * uFarBlur * 0.22;
      float near = clamp(-c, 0.0, 1.0) * 1.0 * smoothstep(uFocus * 0.5, uFocus * 0.12, z);
      return (far - near) * uMaxCoC * uAperture;
    }
    const float GA = 2.39996323;
    void main(){
      vec2 px = 1.0 / uRes;
      float d0 = texture2D(tDepth, vUv).r;
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;
      float c0 = coc(d0);
      // ---- depth of field: golden-angle gather, samples only spill onto pixels they cover ----
      if (abs(c0) > 0.35 || uAperture > 0.0) {
        vec3 acc = col; float wsum = 1.0;
        float R = uMaxCoC * uAperture;
        if (R > 0.3) {
          for (int i = 1; i < 24; i++) {
            float fi = float(i);
            float r = sqrt(fi / 24.0) * R;
            vec2 o = vec2(cos(fi * GA), sin(fi * GA)) * r;
            vec2 uv = vUv + o * px;
            float ds = texture2D(tDepth, uv).r;
            float cs = coc(ds);
            // a sample contributes if its own blur reaches this pixel (foreground bleeds over
            // the sharp subject, sharp background never leaks onto a blurred foreground)
            // nearer samples spread by their own blur; farther ones never cover something in
            // front of them, so they only count as far as this pixel is itself blurred
            float reach = ds < d0 ? abs(cs) : min(abs(cs), abs(c0));
            float w = smoothstep(r - 1.0, r + 0.5, reach);
            acc += texture2D(tDiffuse, uv).rgb * w; wsum += w;
          }
          col = acc / wsum;
        }
      }
      // ---- camera motion blur ----
      if (uMB > 0.0) {
        vec4 ndc = vec4(vUv * 2.0 - 1.0, min(d0, 0.99999) * 2.0 - 1.0, 1.0);
        vec4 vp = uInvProj * ndc; vp /= vp.w;
        vec4 wp = uInvView * vp;
        vec4 pc = uPrevVP * wp;
        vec2 prevUV = pc.xy / pc.w * 0.5 + 0.5;
        vec2 vel = (vUv - prevUV) * uShutter * uMB;
        float vlen = length(vel * uRes);
        float maxPx = 40.0;
        if (vlen > maxPx) vel *= maxPx / vlen;
        if (vlen > 0.75 && pc.w > 0.0) {
          vec3 m = col; float n = 1.0;
          for (int i = 1; i <= 8; i++) {
            float t = float(i) / 8.0 - 0.5;
            vec2 uv = clamp(vUv + vel * t, px, 1.0 - px);
            // don't drag a nearer object's colour across a farther one
            float ds = texture2D(tDepth, uv).r;
            float w = ds >= d0 - 0.0005 || vlen > 6.0 ? 1.0 : 0.3;
            m += texture2D(tDiffuse, uv).rgb * w; n += w;
          }
          col = mix(col, m / n, smoothstep(0.75, 3.0, vlen));
        }
      }
      gl_FragColor = vec4(col, base.a);
      // pass the scene depth through so later passes (god rays) still see it
      gl_FragDepth = d0;
    }`,
};

export class CinematicPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    // reads colour + depth from the read buffer and writes both, so it can sit anywhere after the
    // water pass without sampling a depth texture attached to its own target
    this.material = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(cineShader.uniforms), vertexShader: cineShader.vertexShader, fragmentShader: cineShader.fragmentShader, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
    this.uniforms = this.material.uniforms;
    this.fsQuad = new FullScreenQuad(this.material);
    this.prevVP = new THREE.Matrix4();
    this._vp = new THREE.Matrix4();
    this._first = true;
    this.focus = 6;
  }
  // focusDist: metres to the subject; aperture: 0 = everything sharp
  setup(focusDist, aperture, farBlur, motionBlur, dt) {
    // ease focus pulls, but snap after big jumps (camera mode switch, teleport, slow frames)
    if (Math.abs(focusDist - this.focus) > Math.max(1.5, focusDist * 0.5)) this.focus = focusDist;
    else this.focus += (focusDist - this.focus) * (1 - Math.exp(-dt * 10));
    const u = this.uniforms;
    u.uFocus.value = Math.max(0.5, this.focus);
    u.uAperture.value = aperture;
    u.uFarBlur.value = farBlur;
    u.uMB.value = motionBlur;
    // shutter scales with frame time so the smear length stays like a 180° film shutter
    u.uShutter.value = THREE.MathUtils.clamp(0.5 * (1 / 60) / Math.max(dt, 1e-3), 0.05, 0.75);
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uNear.value = cam.near; u.uFar.value = cam.far;
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uInvView.value.copy(cam.matrixWorld);
    this._vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    // camera cuts (teleports, mode switches, respawns) must not smear the first frame after them
    const cut = this._prevPos && (cam.position.distanceTo(this._prevPos) > 6 || cam.getWorldDirection(this._dir).dot(this._prevDir) < 0.85);
    if (this._first || cut) { this.prevVP.copy(this._vp); this._first = false; }
    (this._prevPos || (this._prevPos = new THREE.Vector3())).copy(cam.position);
    this._dir = this._dir || new THREE.Vector3();
    (this._prevDir || (this._prevDir = new THREE.Vector3())).copy(cam.getWorldDirection(this._dir));
    u.uPrevVP.value.copy(this.prevVP);
    this.prevVP.copy(this._vp);
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}
