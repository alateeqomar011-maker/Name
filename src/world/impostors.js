// Forests to the horizon. Every tree species is baked (with its current seasonal look) into an atlas;
// beyond the streamed vegetation, the same tree placements are drawn as lit, fogged billboards. A
// per-cell "loaded" map hands each 128 m cell over from billboards to full trees with no gap or overlap.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { HALF } from './worldgen.js';
import { CELL, NC, TREE_SETS } from './vegetation.js';
import { U } from './shaderlib.js';
import { atmospherePatch } from './atmosphere.js';

const COLS = 4, ROWS = 4, TILE = 256;

export class ImpostorForest {
  constructor(game) {
    this.game = game;
    const types = new Set();
    for (const set of Object.values(TREE_SETS)) for (const [t] of set) types.add(t);
    this.types = [...types].filter((t) => game.flora.types[t]);
    this.typeIndex = Object.fromEntries(this.types.map((t, i) => [t, i]));
    this.rt = new THREE.WebGLRenderTarget(COLS * TILE, ROWS * TILE, { samples: 0 });
    this.rt.texture.generateMipmaps = true;
    this.rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.rt.texture.magFilter = THREE.LinearFilter;
    this.uvInfo = Array.from({ length: 16 }, () => new THREE.Vector4());
    this.sizeInfo = Array.from({ length: 16 }, () => new THREE.Vector4());
    this._bake();
    this.cx = 0; // generation cursor
    this.pos = [];
    this.par = [];
    this.done = false;
    this.mesh = null;
  }

  // render each species into its atlas tile as seasonal albedo (ambient light of π returns pure albedo)
  _bake() {
    const g = this.game;
    const r = g.renderer;
    const F = g.flora;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, Math.PI));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const su = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    this.rt.scissorTest = false;
    this.rt.viewport.set(0, 0, COLS * TILE, ROWS * TILE);
    r.clear(true, true, true);
    this.types.forEach((type, i) => {
      const parts = F.types[type];
      const meshes = [];
      if (parts.trunk) meshes.push(new THREE.Mesh(parts.trunk, F.trunkMat));
      if (parts.leaves) meshes.push(new THREE.Mesh(parts.leaves, F.leafMat));
      const box = new THREE.Box3();
      for (const m of meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); scene.add(m); }
      const H = box.max.y, B = Math.min(box.min.y, 0);
      const R = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z, 0.5);
      const S = Math.max(H - B, 2 * R);
      cam.left = -S / 2; cam.right = S / 2; cam.bottom = B; cam.top = B + S;
      cam.position.set(0, 0, 80); cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      const col = i % COLS, row = Math.floor(i / COLS);
      this.rt.viewport.set(col * TILE, row * TILE, TILE, TILE);
      this.rt.scissor.set(col * TILE, row * TILE, TILE, TILE);
      this.rt.scissorTest = true;
      r.setRenderTarget(this.rt);
      r.render(scene, cam);
      for (const m of meshes) scene.remove(m);
      // uv rectangle actually covered by the tree, and its size in metres
      const du = (2 * R) / S / COLS, dv = (H - B) / S / ROWS;
      this.uvInfo[i].set((col + 0.5) / COLS - du / 2, row / ROWS, du, dv);
      this.sizeInfo[i].set(H - B, R, B, 0);
    });
    this.rt.scissorTest = false;
    this.rt.viewport.set(0, 0, COLS * TILE, ROWS * TILE);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    r.shadowMap.autoUpdate = su;
    this.bakedA = U.uAutumn.value;
    this.bakedW = U.uWinter.value;
  }

  _generate(budgetCells) {
    const veg = this.game.veg;
    let n = 0;
    while (this.cx < NC * NC && n < budgetCells) {
      const cx = this.cx % NC, cz = Math.floor(this.cx / NC);
      this.cx++; n++;
      const list = [];
      veg.treePlacements(cx, cz, mulberry32(veg.cellSeed(cx, cz)), list);
      for (const p of list) {
        const ti = this.typeIndex[p.type];
        if (ti === undefined) continue;
        this.pos.push(p.x, p.y, p.z);
        const lum = (p.tint[0] + p.tint[1] + p.tint[2]) / 3;
        this.par.push(p.scale, ti, lum, p.rot);
      }
    }
    if (this.cx >= NC * NC) { this.done = true; this._buildMesh(); }
  }

  _buildMesh() {
    const g = this.game;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('normal', quad.getAttribute('normal'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    geo.setAttribute('aIPos', new THREE.InstancedBufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute('aIPar', new THREE.InstancedBufferAttribute(new Float32Array(this.par), 4));
    geo.instanceCount = this.pos.length / 3;
    this.count = geo.instanceCount;
    const mat = new THREE.MeshLambertMaterial({ map: this.rt.texture, alphaTest: 0.4, side: THREE.DoubleSide });
    const uni = {
      uLoaded: { value: g.veg.loadedTex }, uUV: { value: this.uvInfo }, uSize: { value: this.sizeInfo },
      uFar: { value: 3600 }, uTime: U.uTime, uWind: U.uWind, uBright: { value: 1.0 },
    };
    this.uniforms = uni;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uni);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aIPos; attribute vec4 aIPar;
          uniform sampler2D uLoaded; uniform vec4 uUV[16]; uniform vec4 uSize[16]; uniform float uFar; uniform float uTime; uniform float uWind;
          varying float vILum;`)
        .replace('#include <beginnormal_vertex>', `
          int ti = int(aIPar.y + 0.5);
          vec4 iuv = uUV[ti]; vec4 isz = uSize[ti];
          vec2 toC = cameraPosition.xz - aIPos.xz;
          float cd = length(toC);
          toC /= max(cd, 0.001);
          vec2 cellI = floor((aIPos.xz + ${HALF.toFixed(1)}) / ${CELL.toFixed(1)});
          float loaded = texture2D(uLoaded, (cellI + 0.5) / ${NC.toFixed(1)}).r;
          float show = step(loaded, 0.5) * step(cd, uFar);
          vec3 objectNormal = normalize(vec3(toC.x, 0.45, toC.y));`)
        .replace('#include <begin_vertex>', `
          vec3 rightV = vec3(toC.y, 0.0, -toC.x);
          float sc = aIPar.x * show;
          float sway = sin(uTime * (0.9 + uWind) + aIPos.x * 0.07 + aIPos.z * 0.05) * 0.03 * (0.3 + uWind) * (position.y + 0.5);
          vec3 transformed = aIPos + rightV * (position.x * 2.0 * isz.y + sway * isz.x) * sc + vec3(0.0, ((position.y + 0.5) * isz.x + isz.z) * sc, 0.0);
          vMapUv = iuv.xy + vec2(position.x + 0.5, position.y + 0.5) * iuv.zw;
          vILum = aIPar.z;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vILum; uniform float uBright;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= vILum * uBright;');
      atmospherePatch(shader);
    };
    mat.customProgramCacheKey = () => 'impostorForest';
    this.material = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'impostorForest';
    g.scene.add(mesh);
    this.mesh = mesh;
    this.pos = this.par = null;
  }

  // placements depend on quality (tree density): regenerate after a quality change
  reset() {
    if (this.mesh) { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    this.cx = 0; this.pos = []; this.par = []; this.done = false;
  }

  update() {
    const g = this.game;
    if (!this.done) { this._generate(40); return; }
    this.mesh.visible = !g.caves.active;
    // the season changed and has settled: re-bake the species atlas
    const a = U.uAutumn.value, w = U.uWinter.value;
    if ((Math.abs(a - this.bakedA) > 0.04 || Math.abs(w - this.bakedW) > 0.04) && (a === 0 || a === 1) && (w === 0 || w === 1)) this._bake();
  }
}
