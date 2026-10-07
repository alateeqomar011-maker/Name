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
          ghosts += tints[i] * smoothstep(1.0, 0.75, r) * (0.35 + 0.65 * smoothstep(0.4, 1.0, r)) * 0.045;
        }
        // soft halo ring
        vec2 hd = (vUv - vec2(0.5)) * vec2(uAspect, 1.0);
        float ring = exp(-pow((length(hd) - 0.42) * 22.0, 2.0)) * 0.025;
        float sunVis = (skyMask(uSun) + skyMask(uSun + vec2(0.01, 0.0)) + skyMask(uSun - vec2(0.01, 0.0)) + skyMask(uSun + vec2(0.0, 0.015)) + skyMask(uSun - vec2(0.0, 0.015))) / 5.0;
        col += (ghosts + ring * vec3(0.8, 0.9, 1.0)) * uSunColor * uFlare * sunVis;
      }
      gl_FragColor = vec4(col, base.a);
    }`,
};

export class GodRaysPass extends Pass {
  constructor() {
    super();
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
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}
