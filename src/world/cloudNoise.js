// Tileable noise volumes for the ray-marched clouds (deterministic).
//   shape (64³): R = Perlin-Worley (billowy base shapes), G/B = Worley fbm at rising frequencies
//   used to erode the edges into cauliflower turrets and wisps
//   weather (128²): R = coverage, G = cloud type (0 flat stratocumulus .. 1 towering cumulus)
import * as THREE from 'three';

function hash3(x, y, z, s) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// periodic gradient noise
function perlin3(x, y, z, P, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const u = fade(xf), v = fade(yf), w = fade(zf);
  let res = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const cx = (xi + dx) % P, cy = (yi + dy) % P, cz = (zi + dz) % P;
    const h1 = hash3((cx + P) % P, (cy + P) % P, (cz + P) % P, seed);
    const h2 = hash3((cx + P) % P, (cy + P) % P, (cz + P) % P, seed + 7);
    const th = h1 * Math.PI * 2, ph = Math.acos(2 * h2 - 1);
    const gx = Math.sin(ph) * Math.cos(th), gy = Math.sin(ph) * Math.sin(th), gz = Math.cos(ph);
    const d = gx * (xf - dx) + gy * (yf - dy) + gz * (zf - dz);
    const wgt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    res += d * wgt;
  }
  return res; // ~[-0.9, 0.9]
}

// periodic cellular noise: 1 - distance to the nearest feature point (cells per tile = C)
function worley3(x, y, z, C, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy, cz = zi + dz;
    const wx = ((cx % C) + C) % C, wy = ((cy % C) + C) % C, wz = ((cz % C) + C) % C;
    const px = cx + hash3(wx, wy, wz, seed), py = cy + hash3(wx, wy, wz, seed + 1), pz = cz + hash3(wx, wy, wz, seed + 2);
    const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
    if (d < best) best = d;
  }
  return 1 - Math.min(1, Math.sqrt(best));
}

const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);

// raw volumes for tools/build_clouds.mjs: shape is an RGB strip of 64 slices (64 x 4096),
// weather a 128² RG map; the game loads the PNGs (see materials.js) instead of paying ~2 s here
export function buildCloudData() {
  const N = 64;
  const shape = new Uint8Array(N * N * N * 3);
  const wfbm = (u, v, w, c, s) => worley3(u * c, v * c, w * c, c, s) * 0.625 + worley3(u * c * 2, v * c * 2, w * c * 2, c * 2, s + 3) * 0.25 + worley3(u * c * 4, v * c * 4, w * c * 4, c * 4, s + 5) * 0.125;
  let k = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    let pn = perlin3(u * 4, v * 4, w * 4, 4, 11) * 0.6 + perlin3(u * 8, v * 8, w * 8, 8, 12) * 0.28 + perlin3(u * 16, v * 16, w * 16, 16, 13) * 0.12;
    pn = Math.min(1, Math.max(0, pn * 0.9 + 0.5));
    const wb = wfbm(u, v, w, 4, 21);
    // Perlin-Worley: billows from the cells, connectivity from the gradient noise
    const pw = Math.min(1, Math.max(0, remap(pn, wb - 1, 1, 0, 1)));
    shape[k++] = pw * 255;
    shape[k++] = wfbm(u, v, w, 5, 31) * 255;
    shape[k++] = wfbm(u, v, w, 12, 41) * 255;
  }
  const W = 128;
  const weather = new Uint8Array(W * W * 3);
  for (let y = 0, i = 0; y < W; y++) for (let x = 0; x < W; x++, i += 3) {
    const u = x / W, v = y / W;
    // fields of cloud with clear gaps between them, and where the towers grow
    let c = 0, a = 0.5, f = 3;
    for (let o = 0; o < 4; o++) { c += a * perlin3(u * f, v * f, 0.5, f, 61 + o); a *= 0.5; f *= 2; }
    const t = perlin3(u * 2, v * 2, 3.5, 2, 71) * 0.7 + perlin3(u * 5, v * 5, 1.5, 5, 72) * 0.3;
    weather[i] = Math.min(255, Math.max(0, (c * 1.1 + 0.5) * 255));
    weather[i + 1] = Math.min(255, Math.max(0, (t * 1.2 + 0.5) * 255));
    weather[i + 2] = 0;
  }
  return { N, shape, W, weather };
}

// GPU textures from RGBA bytes (shape: 64 stacked slices; weather: 128²)
export function makeCloudTextures(shapeRGBA, weatherRGBA, N = 64, W = 128) {
  const tex = new THREE.Data3DTexture(shapeRGBA, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  const weather = new THREE.DataTexture(weatherRGBA, W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
  weather.wrapS = weather.wrapT = THREE.RepeatWrapping;
  weather.magFilter = THREE.LinearFilter;
  weather.minFilter = THREE.LinearMipmapLinearFilter;
  weather.generateMipmaps = true;
  weather.needsUpdate = true;
  return { shape: tex, weather };
}
