// Photo-scanned material library. Each texture strip stacks one square layer per material
// (see tools/build_textures.py); it is uploaded as a WebGL2 texture array so the terrain shader
// can blend any of them per pixel. Albedo is sRGB with ambient occlusion baked in; the data
// array holds the tangent normal (rg, "rows go down" convention) and a height map (b).
import * as THREE from 'three';

export const LAYERS = ['grass', 'grassdry', 'soil', 'gravel', 'trail', 'cracked', 'sand', 'dune', 'snow',
  'rock', 'mossrock', 'sandstone', 'basalt', 'coastrock', 'mossground'];
export const LAYER = Object.fromEntries(LAYERS.map((n, i) => [n, i]));

// GLSL #defines for the layer indices (L_GRASS, L_ROCK, …)
export const GLSL_LAYERS = LAYERS.map((n, i) => `#define L_${n.toUpperCase()} ${i}.0`).join('\n');

// uniforms every photo-material shader needs
export function photoUniforms() {
  return {
    uTA: { get value() { return TerrainTextures.albedo; } },
    uTD: { get value() { return TerrainTextures.data; } },
    uTexOK: TerrainTextures.ok,
  };
}

// Shared GLSL: layer ids, per-layer tiling/roughness, anti-tiling planar lookup and triplanar
// lookup with whiteout normal blending. Expects GLSL_NOISE-style helpers to be unused here.
export const GLSL_PHOTO = /* glsl */ `
uniform sampler2DArray uTA; uniform sampler2DArray uTD; uniform float uTexOK;
${GLSL_LAYERS}
        const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
        // metres per texture repeat and base roughness, per layer
        const float TILE[15] = float[15](1.9, 3.4, 2.8, 2.4, 3.6, 4.8, 3.6, 6.5, 3.6, 7.5, 9.0, 8.5, 7.0, 6.0, 3.8);
        const float ROUGH[15] = float[15](0.95, 0.93, 0.92, 0.84, 0.9, 0.88, 0.9, 0.92, 0.62, 0.8, 0.86, 0.86, 0.74, 0.68, 0.9);
        vec3 unpackTN(vec4 d){ vec3 t = vec3(d.rg * 2.0 - 1.0, 0.0); t.z = sqrt(max(0.0, 1.0 - dot(t.xy, t.xy))); return t; }
        // Anti-tiling lookup (after Quilez): two randomly offset copies of the layer cross-fade along
        // a noise field; the seam follows the scanned height so it reads as natural variation.
        void photo(float L, vec2 uv, vec2 gx, vec2 gy, float k, out vec3 alb, out vec3 tn, out float h){
          vec4 a, d;
        #ifdef PHOTO_SIMPLE
          a = textureGrad(uTA, vec3(uv, L), gx, gy); d = textureGrad(uTD, vec3(uv, L), gx, gy);
        #else
          float l = k * 8.0; float fi = floor(l); float f = fract(l);
          vec2 oa = sin(vec2(3.0, 7.0) * fi), ob = sin(vec2(3.0, 7.0) * (fi + 1.0));
          float b0 = smoothstep(0.2, 0.8, f);
          if (b0 < 0.001) { a = textureGrad(uTA, vec3(uv + oa, L), gx, gy); d = textureGrad(uTD, vec3(uv + oa, L), gx, gy); }
          else if (b0 > 0.999) { a = textureGrad(uTA, vec3(uv + ob, L), gx, gy); d = textureGrad(uTD, vec3(uv + ob, L), gx, gy); }
          else {
            vec4 dA = textureGrad(uTD, vec3(uv + oa, L), gx, gy), dB = textureGrad(uTD, vec3(uv + ob, L), gx, gy);
            float b = clamp(b0 + (dB.b - dA.b) * 1.4 * b0 * (1.0 - b0), 0.0, 1.0);
            b = smoothstep(0.0, 1.0, b);
            a = mix(textureGrad(uTA, vec3(uv + oa, L), gx, gy), textureGrad(uTA, vec3(uv + ob, L), gx, gy), b);
            d = mix(dA, dB, b);
          }
        #endif
          alb = a.rgb; h = d.b; tn = unpackTN(d);
        }
        // Triplanar lookup with whiteout normal blending (world-space normal out)
        void photoTri(float L, vec3 p, vec3 n, vec3 bw, float s, vec3 gx, vec3 gy, out vec3 alb, out vec3 wn, out float h){
          vec3 sg = step(0.0, n) * 2.0 - 1.0;
          vec3 acc = vec3(0.0); alb = vec3(0.0); h = 0.0; float tw = 0.0;
          if (bw.x > 0.03) {
            vec2 uv = vec2(p.z * sg.x, p.y) * s;
            vec2 ga = vec2(gx.z * sg.x, gx.y) * s, gb = vec2(gy.z * sg.x, gy.y) * s;
            vec4 a = textureGrad(uTA, vec3(uv, L), ga, gb), d = textureGrad(uTD, vec3(uv, L), ga, gb);
            vec3 t = unpackTN(d); t.x *= sg.x;
            t = vec3(t.xy + n.zy, abs(t.z) * n.x);
            acc += t.zyx * bw.x; alb += a.rgb * bw.x; h += d.b * bw.x; tw += bw.x;
          }
          if (bw.y > 0.03) {
            vec2 uv = vec2(p.x * sg.y, p.z) * s;
            vec2 ga = vec2(gx.x * sg.y, gx.z) * s, gb = vec2(gy.x * sg.y, gy.z) * s;
            vec4 a = textureGrad(uTA, vec3(uv, L), ga, gb), d = textureGrad(uTD, vec3(uv, L), ga, gb);
            vec3 t = unpackTN(d); t.x *= sg.y;
            t = vec3(t.xy + n.xz, abs(t.z) * n.y);
            acc += t.xzy * bw.y; alb += a.rgb * bw.y; h += d.b * bw.y; tw += bw.y;
          }
          if (bw.z > 0.03) {
            vec2 uv = vec2(-p.x * sg.z, p.y) * s;
            vec2 ga = vec2(-gx.x * sg.z, gx.y) * s, gb = vec2(-gy.x * sg.z, gy.y) * s;
            vec4 a = textureGrad(uTA, vec3(uv, L), ga, gb), d = textureGrad(uTD, vec3(uv, L), ga, gb);
            vec3 t = unpackTN(d); t.x *= -sg.z;
            t = vec3(t.xy + n.xy, abs(t.z) * n.z);
            acc += t.xyz * bw.z; alb += a.rgb * bw.z; h += d.b * bw.z; tw += bw.z;
          }
          tw = max(tw, 1e-4);
          alb /= tw; h /= tw; wn = normalize(acc + n * 1e-4);
        }
        // near + far scale triplanar rock, so cliffs keep detail up close and big shapes from afar
        void rockTri(float L, vec3 p, vec3 n, vec3 bw, float farK, vec3 gx, vec3 gy, out vec3 alb, out vec3 wn, out float h){
          float s1 = 1.0 / TILE[int(L)];
          float s2 = s1 * 0.21;
          vec3 a1 = vec3(0.0), n1 = n, a2 = vec3(0.0), n2 = n; float h1 = 0.0, h2 = 0.0;
        #ifdef PHOTO_SIMPLE
          farK = step(0.5, farK);
        #endif
          if (farK < 0.99) photoTri(L, p, n, bw, s1, gx, gy, a1, n1, h1);
          if (farK > 0.01) photoTri(L, p + 37.0, n, bw, s2, gx, gy, a2, n2, h2);
          // up close the big scale still modulates the detail scale (large stains and ledges)
          float mixK = farK;
          alb = mix(a1, a2, mixK); wn = normalize(mix(n1, n2, mixK)); h = mix(h1, h2, mixK);
        }
`;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + url));
    img.src = url;
  });
}

// draw the strip into a canvas at the requested layer size and read it back as RGBA bytes
function stripToArray(img, size) {
  const layers = Math.round(img.height / img.width);
  const S = Math.min(size, img.width);
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S * layers;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, S, S * layers);
  const data = new Uint8Array(ctx.getImageData(0, 0, S, S * layers).data.buffer);
  canvas.width = canvas.height = 1;
  return { data, S, layers };
}

function makeArray({ data, S, layers }, srgb, anisotropy) {
  const tex = new THREE.DataArrayTexture(data, S, S, layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.unpackAlignment = 4;
  tex.needsUpdate = true;
  return tex;
}

// neutral stand-in when the photo textures cannot be loaded: the shader then falls back to the
// vertex-colour look
function fallbackArray(srgb) {
  const n = LAYERS.length;
  const data = new Uint8Array(4 * n);
  for (let i = 0; i < n; i++) data.set(srgb ? [128, 128, 128, 255] : [128, 128, 128, 255], i * 4);
  const tex = new THREE.DataArrayTexture(data, 1, 1, n);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const TerrainTextures = {
  albedo: null,
  data: null,
  ok: { value: 0 },
  barkMap: null,
  barkNormal: null,
  skinNH: null, // reptile scale detail: normal xy + height
  skinAO: null, // crevice occlusion, per-scale tint, tubercle mask
  skinOK: { value: 0 },
  foliageMap: null, // drawn leaf/needle/frond atlas (tools/build_foliage.py), straight alpha
  foliageNormal: null,
  // looping FFT ocean frames (slope xz + whitecaps) and the aerated foam pattern (tools/build_water.py)
  waveArray: null,
  foamMap: null,
  waveOK: { value: 0 },
};

function imageTexture(img, srgb, aniso) {
  const t = new THREE.Texture(img);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.repeat.set(1, 2);
  t.needsUpdate = true;
  return t;
}

// size: albedo layer resolution (data layers are half of it)
export async function loadTerrainTextures(renderer, size = 1024, base = './') {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  try {
    const [a, d] = await Promise.all([loadImage(base + 'textures/terrain_albedo.jpg'), loadImage(base + 'textures/terrain_data.jpg')]);
    TerrainTextures.albedo = makeArray(stripToArray(a, size), true, aniso);
    TerrainTextures.data = makeArray(stripToArray(d, Math.max(64, size >> 1)), false, aniso);
    TerrainTextures.ok.value = 1;
  } catch (e) {
    console.warn('photo terrain textures unavailable, using fallback look', e);
    TerrainTextures.albedo = fallbackArray(true);
    TerrainTextures.data = fallbackArray(false);
    TerrainTextures.ok.value = 0;
  }
  try {
    const [ba, bn] = await Promise.all([loadImage(base + 'textures/bark_albedo.jpg'), loadImage(base + 'textures/bark_normal.jpg')]);
    TerrainTextures.barkMap = imageTexture(ba, true, aniso);
    TerrainTextures.barkNormal = imageTexture(bn, false, aniso);
  } catch (e) {
    console.warn('photo bark unavailable, using painted bark', e);
  }
  try {
    const [sn, sa] = await Promise.all([loadImage(base + 'textures/skin_nh.jpg'), loadImage(base + 'textures/skin_ao.jpg')]);
    TerrainTextures.skinNH = imageTexture(sn, false, aniso);
    TerrainTextures.skinAO = imageTexture(sa, false, aniso);
    TerrainTextures.skinNH.repeat.set(1, 1); TerrainTextures.skinAO.repeat.set(1, 1);
    TerrainTextures.skinOK.value = 1;
  } catch (e) {
    console.warn('skin detail unavailable, using procedural scales', e);
  }
  try {
    const [fa, fn] = await Promise.all([loadImage(base + 'textures/foliage_albedo.webp'), loadImage(base + 'textures/foliage_normal.webp')]);
    const leafTex = (img, srgb) => {
      const t = new THREE.Texture(img);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = aniso;
      t.needsUpdate = true;
      return t;
    };
    TerrainTextures.foliageMap = leafTex(fa, true);
    TerrainTextures.foliageNormal = leafTex(fn, false);
  } catch (e) {
    console.warn('foliage atlas unavailable, using painted leaves', e);
  }
  try {
    const [wn, wf] = await Promise.all([loadImage(base + 'textures/water_normal.jpg'), loadImage(base + 'textures/water_foam.jpg')]);
    TerrainTextures.waveArray = makeArray(stripToArray(wn, 256), false, aniso);
    TerrainTextures.foamMap = imageTexture(wf, false, aniso);
    TerrainTextures.foamMap.repeat.set(1, 1);
    TerrainTextures.waveOK.value = 1;
  } catch (e) {
    console.warn('ocean detail unavailable, using procedural ripples', e);
  }
  return TerrainTextures;
}
