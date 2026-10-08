// Long-range terrain shadows. The regular shadow map only covers ~180 m around the player; this
// pass ray-marches the heightfield toward the sun for every 4 m texel of the world and stores the
// height above which that column is sunlit. Every lit material compares its own height against
// it (see atmosphere.js), so peaks throw long shadows across valleys at dawn and dusk, distant
// ridges get their shaded flanks, and creatures or trees standing in a mountain's shadow darken.
import * as THREE from 'three';
import { A } from './atmosphere.js';
import { HALF, WORLD_SIZE } from './worldgen.js';

const RES = 1024;
const STRIPS = 8;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uHeightTex; uniform vec3 uSun;
varying vec2 vUv;
const float N = 1025.0;
float hNear(vec2 xz){ vec2 g = clamp((xz + ${HALF.toFixed(1)}) / 4.0, vec2(0.0), vec2(N - 1.0)); return texture2D(uHeightTex, (floor(g) + 0.5) / N).r; }
float hBil(vec2 xz){
  vec2 g = clamp((xz + ${HALF.toFixed(1)}) / 4.0, vec2(0.0), vec2(N - 1.001));
  vec2 c = floor(g), f = g - c;
  float a = texture2D(uHeightTex, (c + vec2(0.5, 0.5)) / N).r, b = texture2D(uHeightTex, (c + vec2(1.5, 0.5)) / N).r;
  float d = texture2D(uHeightTex, (c + vec2(0.5, 1.5)) / N).r, e = texture2D(uHeightTex, (c + vec2(1.5, 1.5)) / N).r;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}
void main(){
  vec2 xz = (vUv - 0.5) * ${WORLD_SIZE.toFixed(1)};
  float lenXZ = length(uSun.xz);
  vec2 dir = uSun.xz / max(lenXZ, 1e-4);
  float tanE = max(uSun.y, 0.012) / max(lenXZ, 1e-4);
  float sh = -1e4;
  float t = 4.0;
  for (int i = 0; i < 110; i++) {
    vec2 p = xz + dir * t;
    if (abs(p.x) > ${HALF.toFixed(1)} || abs(p.y) > ${HALF.toFixed(1)}) break;
    float h = t < 48.0 ? hBil(p) : hNear(p);
    sh = max(sh, h - t * tanE);
    if (sh - (t * tanE) > 600.0) break;
    t += max(4.0, t * 0.042);
  }
  gl_FragColor = vec4(sh, 0.0, 0.0, 1.0);
}`;

export class TerrainShadow {
  constructor(renderer, world) {
    this.renderer = renderer;
    this.ok = renderer.capabilities.isWebGL2 !== false && !!renderer.extensions.get('EXT_color_buffer_float');
    A.uTerrShadowOn.value = 0;
    if (!this.ok) return;
    this.rt = new THREE.WebGLRenderTarget(RES, RES, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.rt.texture.wrapS = this.rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uHeightTex: { value: world.heightTex }, uSun: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.dir = new THREE.Vector3(0, -1, 0); // direction of the last full refresh
    this.pending = new THREE.Vector3();
    this.strip = -1; // < 0: idle
    this.timer = 0;
    A.uTerrShadow.value = this.rt.texture;
  }

  _renderStrip(i) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const h = RES / STRIPS;
    this.rt.scissor.set(0, i * h, RES, h);
    this.rt.scissorTest = true;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.cam);
    this.rt.scissorTest = false;
    r.setRenderTarget(prev);
  }

  // full synchronous refresh (load, teleports)
  refresh(lightDir) {
    if (!this.ok) return;
    this.mat.uniforms.uSun.value.copy(lightDir);
    for (let i = 0; i < STRIPS; i++) this._renderStrip(i);
    this.dir.copy(lightDir);
    this.strip = -1;
    A.uTerrShadowOn.value = 1;
  }

  update(dt, lightDir) {
    if (!this.ok) return;
    if (A.uTerrShadowOn.value === 0) { this.refresh(lightDir); return; }
    this.timer -= dt;
    if (this.strip < 0) {
      // the light has moved enough: refresh a strip per frame
      if (this.timer <= 0 && this.dir.angleTo(lightDir) > 0.006) {
        this.pending.copy(lightDir);
        this.mat.uniforms.uSun.value.copy(lightDir);
        this.strip = 0;
      }
      return;
    }
    this._renderStrip(this.strip++);
    if (this.strip >= STRIPS) { this.strip = -1; this.dir.copy(this.pending); this.timer = 0.5; }
  }
}
