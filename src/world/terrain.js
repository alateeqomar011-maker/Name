// Chunked LOD terrain rendering with a photo-scanned, weather-reactive material.
//
// Ground: up to ten photographed materials (grass, dry meadow, forest soil, moss, gravel, trail,
// beach sand, dunes, cracked earth, basalt) are chosen per pixel from the biome maps, sampled with
// anti-tiling and blended by their scanned height maps, so grass grows between stones and sand
// settles into cracks. Cliffs: triplanar photographed rock (granite, mossy rock, sandstone, basalt,
// coastal rock) at a near and a far scale. Snow fills the low spots first, puddles collect in the
// hollows of the height maps, and the vertex biome colours still steer the overall palette.
import * as THREE from 'three';
import { atmospherePatch } from './atmosphere.js';
import { GRID, CELL, HALF, VOLCANO } from './worldgen.js';
import { U, GLSL_NOISE, GLSL_MEADOW } from './shaderlib.js';
import { TerrainTextures, GLSL_PHOTO, photoUniforms } from './materials.js';

const CHUNK_CELLS = 64; // 256m
const CHUNKS = GRID / CHUNK_CELLS; // 16
const N = GRID + 1;
const LOD_DIST = [420, 900, 1500];

export const TERRAIN_TINT = { value: new THREE.Vector2(0.72, 0.5) };

export function createTerrainMaterial(world, quality) {
  const simple = !!(quality && quality.texSize && quality.texSize <= 256);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = U.uWet;
    shader.uniforms.uSnow = U.uSnow;
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uSnowLine = { get value() { return 200 - U.uSnow.value * 160; } };
    shader.uniforms.uSurfTex = { value: world ? world.surfTex : null };
    shader.uniforms.uSurfTex2 = { value: world ? world.surfTex2 : null };
    shader.uniforms.uWindDir = U.uWindDir;
    shader.uniforms.uWinter = U.uWinter;
    shader.uniforms.uAutumn = U.uAutumn;
    shader.uniforms.uRain = U.uRain;
    Object.assign(shader.uniforms, photoUniforms());
    shader.uniforms.uTint = TERRAIN_TINT;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${simple ? '#define PHOTO_SIMPLE' : ''}
        varying vec3 vWPos; varying vec3 vWNormal;
        uniform float uWet; uniform float uSnow; uniform float uTime; uniform float uSnowLine;
        uniform sampler2D uSurfTex; uniform sampler2D uSurfTex2; uniform vec2 uWindDir; uniform float uWinter; uniform float uAutumn; uniform float uRain;
        uniform vec2 uTint;
        ${GLSL_NOISE}
        ${GLSL_MEADOW}
        // triplanar two-octave value noise for rock relief (16 m blocks + 4 m facets)
        float triN(vec3 p, vec3 bw) {
          vec3 a = p * 0.065, b = p * 0.24 + 7.3;
          float n1 = vnoise(a.yz) * bw.x + vnoise(a.xz) * bw.y + vnoise(a.xy) * bw.z;
          float n2 = vnoise(b.yz) * bw.x + vnoise(b.xz) * bw.y + vnoise(b.xy) * bw.z;
          return n1 * 0.62 + n2 * 0.38;
        }
        ${GLSL_PHOTO}
        const float GROUND_ID[10] = float[10](L_GRASS, L_GRASSDRY, L_SOIL, L_MOSSGROUND, L_GRAVEL, L_TRAIL, L_SAND, L_DUNE, L_CRACKED, L_BASALT);
        const float ROCK_ID[5] = float[5](L_ROCK, L_MOSSROCK, L_SANDSTONE, L_BASALT, L_COASTROCK);
        vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
        // Scattered fallen leaves (autumn and forest floors): returns (coverage, height, hash, vein)
        vec4 leafLayer(vec2 p, float density){
          vec2 n = floor(p), f = fract(p);
          vec4 best = vec4(0.0);
          float bestK = -1.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 c = n + g;
            float k = hash12(c * 1.37 + 3.1);
            if (k > density) continue;
            vec2 o = hash22(c);
            float a = hash12(c + 7.7) * 6.2832;
            float sz = 0.55 + 0.45 * hash12(c + 2.9);
            vec2 r = g + o - f;
            vec2 q = vec2(cos(a) * r.x + sin(a) * r.y, -sin(a) * r.x + cos(a) * r.y) / sz;
            float u = q.x / 0.9;
            float w = 0.38 * (1.0 - u * u) * (0.75 + 0.25 * u);
            float inside = step(abs(u), 1.0) * smoothstep(w, w - 0.06, abs(q.y));
            if (inside > 0.0 && k > bestK) {
              bestK = k;
              float vein = smoothstep(0.035, 0.0, abs(q.y)) * step(abs(u), 0.95);
              best = vec4(inside, (1.0 - abs(q.y) / max(w, 0.01)) * 0.5 + 0.5 + k, hash12(c + 11.3), vein);
            }
          }
          return best;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float camD = length(vWPos - cameraPosition);
        vec3 nG0 = normalize(vWNormal);
        float ny = nG0.y;
        vec2 gp = vWPos.xz;
        // derivatives are taken here, in uniform control flow, and handed to every lookup
        vec2 gdx = dFdx(gp), gdy = dFdy(gp);
        vec3 pdx = dFdx(vWPos), pdy = dFdy(vWPos);
        float dnL = vnoise(gp * 0.045);
        float dn = fbm3(gp * 0.33);
        diffuseColor.rgb *= 0.84 + 0.26 * dnL;
        vec2 sUV = ((gp + 2048.0) / 4.0 + 0.5) / 1025.0;
        vec4 surf = texture2D(uSurfTex, sUV);
        vec4 surf2 = texture2D(uSurfTex2, sUV);
        // ---- meadow patchwork: lush hollows and sun-dried drifts (matches the grass blades) ----
        vec2 mv = meadowVar(gp);
        {
          vec3 b0 = diffuseColor.rgb;
          float grassyT = smoothstep(0.005, 0.03, b0.g - b0.r) * smoothstep(0.005, 0.03, b0.g - b0.b) * smoothstep(0.75, 0.9, ny) * (1.0 - surf.g);
          diffuseColor.rgb = mix(b0, vec3(0.06, 0.105, 0.025), mv.x * 0.45 * grassyT);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.45, 1.12, 0.5) + vec3(0.03, 0.018, 0.0), mv.y * 0.5 * grassyT);
          // autumn: meadows fade to straw and gold
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.5, 1.05, 0.45) + vec3(0.025, 0.012, 0.0), uAutumn * grassyT * 0.6);
        }
        // coastal sand reads as sand, not as the grassy island colour beneath it
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.43, 0.3) * (0.9 + 0.2 * dn), surf.g * smoothstep(5.0, 2.0, vWPos.y) * smoothstep(0.7, 0.9, ny) * 0.75);
        vec3 vc = diffuseColor.rgb;
        float swampMud = surf2.r * smoothstep(0.8, 0.95, ny) * step(0.2, vWPos.y);
        // ---- rock coverage (steep slopes, bare mountain tops) ----
        float mx = max(vc.r, max(vc.g, vc.b));
        float sat = (mx - min(vc.r, min(vc.g, vc.b))) / max(mx, 0.001);
        float greyRock = (1.0 - smoothstep(0.38, 0.5, sat)) * smoothstep(70.0, 140.0, vWPos.y) * step(0.02, vc.g) * max(smoothstep(0.97, 0.88, ny), smoothstep(170.0, 220.0, vWPos.y));
        float slopeRock = smoothstep(0.84, 0.64, ny);
        float rockAmt = clamp(max(greyRock, slopeRock), 0.0, 1.0) * step(1.0, vWPos.y);
        float strataK = smoothstep(0.015, 0.09, vc.r - vc.b) * smoothstep(-0.005, 0.03, vc.r - vc.g);
        float volcD = length(gp - vec2(${VOLCANO.x.toFixed(1)}, ${VOLCANO.z.toFixed(1)}));
        // ---- photographed materials ----
        float photoK = uTexOK * (1.0 - smoothstep(2200.0, 2900.0, camD));
        vec3 albP = vc; vec3 nW = nG0; float hUnder = 0.5; float roughP = 0.93; float rockW = 0.0;
        float green = smoothstep(0.0, 0.05, vc.g - vc.r);
        if (photoK > 0.0) {
          float sSand = surf.g, sLit = surf.r, sGrav = surf.b, sDry = surf.a;
          float sMoss = surf2.g, sVolc = surf2.b, sDes = surf2.a;
          float dryG = clamp(smoothstep(-0.01, 0.05, vc.r - vc.g * 0.8) + mv.y * 0.6 - mv.x * 0.3 + uAutumn * 0.3, 0.0, 1.0);
          float grav = sGrav * (1.0 - 0.8 * green);
          float w[10];
          w[2] = sLit * (1.0 - sMoss);
          w[3] = sLit * sMoss + sMoss * 0.25;
          // stony ground alternates between loose gravel and packed trail dirt in broad patches
          float gSplit = smoothstep(0.3, 0.7, vnoise(gp * 0.021 + 9.0) * 0.7 + vnoise(gp * 0.09) * 0.3);
          w[4] = grav * (1.0 - sDes) * (1.0 - sVolc * 0.5) * (0.35 + 0.65 * gSplit);
          w[5] = grav * sDes + grav * (1.0 - sDes) * (1.0 - sVolc) * (1.0 - gSplit) * 0.65;
          // beaches: fine sand broken by broad patches of wind ripples; deserts are all dunes
          float rip = smoothstep(0.35, 0.65, vnoise(gp * 0.03 + 21.0) * 0.75 + vnoise(gp * 0.11) * 0.25);
          w[6] = sSand * (1.0 - sDes) * (1.0 - rip * 0.7);
          w[7] = sSand * sDes + sSand * (1.0 - sDes) * rip * 0.7;
          w[8] = sDry * (1.0 - sVolc);
          w[9] = sVolc * (0.9 + sDry * 0.3);
          float others = 0.0;
          for (int i = 2; i < 10; i++) others += w[i];
          float base = max(0.0, 1.0 - others);
          w[0] = base * (1.0 - dryG);
          w[1] = base * dryG;
          float wsum = base + others;
          float kT = vnoise(gp * 0.085 + 3.7);
          vec3 aS[10]; vec3 nS[10]; float hS[10];
          float hmax = -1.0;
          for (int i = 0; i < 10; i++) {
            w[i] /= max(wsum, 1e-4);
            aS[i] = vec3(0.0); nS[i] = vec3(0.0, 0.0, 1.0); hS[i] = 0.0;
            if (w[i] > 0.01) {
              float L = GROUND_ID[i];
              float sc = 1.0 / TILE[int(L)];
              photo(L, gp * sc + L * 0.37, gdx * sc, gdy * sc, kT, aS[i], nS[i], hS[i]);
              hmax = max(hmax, hS[i] + w[i]);
            }
          }
          vec3 gA = vec3(0.0), gM = vec3(0.0), gT = vec3(0.0); float gH = 0.0, gR = 0.0, bs = 0.0;
          for (int i = 0; i < 10; i++) {
            if (w[i] > 0.01) {
              float b = max(hS[i] + w[i] - hmax + 0.28, 0.0);
              b *= b;
              float L = GROUND_ID[i];
              gA += aS[i] * b; gT += nS[i] * b; gH += hS[i] * b; gR += ROUGH[int(L)] * b;
              gM += textureLod(uTA, vec3(0.5, 0.5, L), 12.0).rgb * b;
              bs += b;
            }
          }
          bs = max(bs, 1e-5);
          gA /= bs; gM /= bs; gH /= bs; gR /= bs; gT = normalize(gT);
          // keep the world's palette: pull the photo's brightness and hue toward the biome colour
          float lumP = max(dot(gM, LUMA), 1e-4), lumV = max(dot(vc, LUMA), 1e-4);
          vec3 tint = pow(vec3(clamp(lumV / lumP, 0.2, 5.0)), vec3(uTint.x)) * pow(clamp((vc / lumV) / max(gM / lumP, vec3(1e-3)), vec3(0.3), vec3(3.0)), vec3(uTint.y));
          vec3 albG = gA * tint;
          // whiteout blend of the planar normal with the terrain normal
          vec3 nGr = normalize(vec3(gT.x + nG0.x, abs(gT.z) * nG0.y, gT.y + nG0.z));
          albP = albG; nW = nGr; hUnder = gH; roughP = gR;
          // ---- triplanar cliffs ----
          if (rockAmt > 0.01) {
            vec3 bw = pow(abs(nG0), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
            float rw[5];
            rw[0] = 0.35;
            rw[1] = clamp(sMoss * 1.3 + sLit * 0.6 + green * 0.4, 0.0, 1.0) * (1.0 - smoothstep(150.0, 240.0, vWPos.y)) * smoothstep(520.0, 700.0, volcD);
            // sandstone belongs to the desert and canyons; elsewhere only distinctly red rock gets it
            rw[2] = max(sDes * 1.2, smoothstep(0.07, 0.16, vc.r - vc.b) * smoothstep(0.02, 0.06, vc.r - vc.g) * 0.8);
            rw[3] = sVolc * 1.5 + (1.0 - smoothstep(380.0, 560.0, volcD));
            rw[4] = smoothstep(9.0, 2.5, vWPos.y) * 0.9 * (1.0 - sDes);
            int i1 = 0;
            for (int i = 1; i < 5; i++) if (rw[i] > rw[i1]) i1 = i;
            int i2 = i1 == 0 ? 1 : 0;
            for (int i = 0; i < 5; i++) if (i != i1 && rw[i] > rw[i2]) i2 = i;
            float f2 = rw[i2] / max(rw[i1] + rw[i2], 1e-4);
            float farK = smoothstep(45.0, 170.0, camD);
            vec3 rA, rN; float rH;
            rockTri(ROCK_ID[i1], vWPos, nG0, bw, farK, pdx, pdy, rA, rN, rH);
            vec3 rM = textureLod(uTA, vec3(0.5, 0.5, ROCK_ID[i1]), 12.0).rgb;
            float rR = ROUGH[int(ROCK_ID[i1])];
            if (f2 > 0.12) {
              vec3 qA, qN; float qH;
              rockTri(ROCK_ID[i2], vWPos + 11.0, nG0, bw, farK, pdx, pdy, qA, qN, qH);
              float a1 = rH + (1.0 - f2), a2 = qH + f2; float m = max(a1, a2) - 0.25;
              float b1 = max(a1 - m, 0.0), b2 = max(a2 - m, 0.0);
              float t = b2 / max(b1 + b2, 1e-4);
              rA = mix(rA, qA, t); rN = normalize(mix(rN, qN, t)); rH = mix(rH, qH, t);
              rM = mix(rM, textureLod(uTA, vec3(0.5, 0.5, ROCK_ID[i2]), 12.0).rgb, t);
              rR = mix(rR, ROUGH[int(ROCK_ID[i2])], t);
            }
            float lumR = max(dot(rM, LUMA), 1e-4);
            vec3 rtint = pow(vec3(clamp(lumV / lumR, 0.25, 4.0)), vec3(uTint.x * 0.75)) * pow(clamp((vc / lumV) / max(rM / lumR, vec3(1e-3)), vec3(0.4), vec3(2.5)), vec3(uTint.y * 0.6));
            rA *= rtint;
            // height-based transition: grass and soil fill the cracks, rock breaks through the turf
            float a1 = gH + (1.0 - rockAmt), a2 = rH + rockAmt; float m = max(a1, a2) - 0.22;
            float bg = max(a1 - m, 0.0), br = max(a2 - m, 0.0);
            rockW = br / max(bg + br, 1e-4);
            albP = mix(albG, rA, rockW); nW = normalize(mix(nGr, rN, rockW)); hUnder = mix(gH, rH, rockW); roughP = mix(gR, rR, rockW);
            // macro rock character so big faces never read as one repeated texture on a flat plane:
            // water and lichen stains running down the face, sedimentary banding, and blocky
            // metre-to-decametre relief with darker hollows
            {
              vec3 wp = vWPos;
              float st = vnoise(vec2(dot(wp.xz, vec2(0.13, 0.09)), wp.y * 0.018)) * 0.65 + vnoise(vec2(dot(wp.xz, vec2(0.41, -0.3)), wp.y * 0.05)) * 0.35;
              float band = vnoise(vec2(wp.y * 0.32 + vnoise(wp.xz * 0.015) * 3.0, 0.5));
              vec3 mt = mix(vec3(1.0), vec3(0.7, 0.68, 0.64), smoothstep(0.5, 0.85, st)) * (0.88 + 0.22 * band);
              float nearR = 1.0 - smoothstep(180.0, 520.0, camD);
              float e = 0.9;
              float k0 = triN(wp, bw), kx = triN(wp + vec3(e, 0.0, 0.0), bw), ky = triN(wp + vec3(0.0, e, 0.0), bw), kz = triN(wp + vec3(0.0, 0.0, e), bw);
              vec3 g = vec3(kx - k0, ky - k0, kz - k0) / e;
              vec3 nM = normalize(nW - (g - dot(g, nW) * nW) * 2.6);
              nW = normalize(mix(nW, nM, rockW * nearR));
              albP = mix(albP, albP * mt * (0.78 + 0.44 * k0), rockW);
            }
          }
          albP = mix(vc, albP, photoK);
          nW = normalize(mix(nG0, nW, photoK));
        } else {
          rockW = rockAmt;
        }
        diffuseColor.rgb = albP;
        float rockAmtF = rockW;
        // gentle large-scale undulation so flats never look machined
        {
          vec2 p = gp * 0.8; float e = 0.12;
          float h0 = fbm3(p), hx = fbm3(p + vec2(e, 0.0)), hz = fbm3(p + vec2(0.0, e));
          float bsU = 0.12 * (1.0 - smoothstep(60.0, 220.0, camD)) * (1.0 - rockAmtF);
          nW = normalize(nW + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * bsU);
        }
        // ---- swamp mud & moss: dark, wet, algae-streaked ground with standing water ----
        {
          float mn = fbm3(gp * 0.18);
          vec3 mudC = mix(vec3(0.05, 0.042, 0.028), vec3(0.075, 0.07, 0.035), mn) * (0.8 + 0.4 * hUnder);
          diffuseColor.rgb = mix(diffuseColor.rgb, mudC, swampMud * 0.75);
          float algae = surf2.g * smoothstep(0.55, 0.75, fbm3(gp * 0.35 + 4.0)) * smoothstep(0.8, 0.95, ny);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.09, 0.025), algae * 0.5);
        }
        // ---- fallen leaves on forest floors (and everywhere under trees in autumn) ----
        float lH = 0.0;
        float closeFade = 1.0 - smoothstep(22.0, 60.0, camD);
        float pxFoot = length(fwidth(gp));
        float fineFade = (1.0 - smoothstep(9.0, 26.0, camD)) * (1.0 - smoothstep(0.06, 0.12, pxFoot));
        if (closeFade > 0.0 && surf.r > 0.04) {
          float lk = surf.r * smoothstep(0.55, 0.8, ny) * step(0.5, vWPos.y) * (1.0 - swampMud * 0.7) * (1.0 - rockAmtF);
          vec4 L1 = leafLayer(gp * 5.5, 0.18 + 0.25 * vnoise(gp * 0.5) + uAutumn * 0.45);
          float lh = L1.z;
          vec3 lc = vec3(0.11, 0.065, 0.03);
          lc = mix(lc, vec3(0.16, 0.072, 0.026), step(0.35, lh));
          lc = mix(lc, vec3(0.085, 0.08, 0.032), step(0.55, lh));
          lc = mix(lc, vec3(0.04, 0.028, 0.018), step(0.72, lh));
          lc = mix(lc, vec3(0.19, 0.14, 0.06), step(0.93, lh));
          lc *= (0.8 + 0.4 * vnoise(gp * 40.0)) * (1.0 - L1.w * 0.35);
          lc = mix(lc, lc * vec3(1.9, 1.15, 0.55), uAutumn * 0.65 * step(0.4, fract(lh * 7.0)));
          float cov = L1.x * lk * fineFade;
          diffuseColor.rgb = mix(diffuseColor.rgb, lc, cov * 0.9);
          lH = L1.x * L1.y * 0.35 * lk * fineFade;
          roughP = mix(roughP, 0.8, cov);
        }
        // ---- natural snow caps on ledges of high peaks ----
        float snowCap = smoothstep(235.0, 275.0, vWPos.y + vnoise(gp * 0.05) * 30.0) * smoothstep(0.6, 0.8, ny + hUnder * 0.12)
          * smoothstep(520.0, 680.0, volcD);
        // ---- lava flows streaming down Ember Peak: hot near the rim, crusting over further down ----
        float lavaE = 0.0;
        {
          vec2 dv = gp - vec2(${VOLCANO.x.toFixed(1)}, ${VOLCANO.z.toFixed(1)});
          float rv = volcD;
          if (rv > 88.0 && rv < 480.0) {
            float av = atan(dv.y, dv.x);
            float wig = vnoise(vec2(rv * 0.018, av * 2.0)) * 1.4 + vnoise(vec2(rv * 0.06, av * 5.0)) * 0.35;
            float sw = sin(av * 7.0 + wig * 2.2);
            float sector = smoothstep(0.35, 0.6, vnoise(vec2(av * 1.3 + 2.0, 0.5)));
            float along = smoothstep(480.0, 130.0, rv);
            float breakup = smoothstep(0.28, 0.6, vnoise(vec2(rv * 0.05, av * 9.0)));
            float chan = smoothstep(cos(30.0 / rv), cos(10.0 / rv), sw);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.25, smoothstep(cos(70.0 / rv), cos(30.0 / rv), sw) * sector * along * 0.85);
            float cr = vnoise(gp * 0.45 + vec2(0.0, uTime * 0.04)) * 0.7 + vnoise(gp * 1.7) * 0.3;
            // glowing cracks follow the low points of the scanned rock
            cr += (0.5 - hUnder) * 0.35;
            lavaE = chan * sector * breakup * along * mix(0.15, 1.0, smoothstep(0.35, 0.72, cr)) * (0.55 + 0.45 * smoothstep(320.0, 120.0, rv));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.008, 0.0), min(1.0, lavaE * 1.5));
          }
        }
        // ---- shore: wet sand band ----
        float shoreWet = 1.0 - smoothstep(-0.2, 1.2, vWPos.y);
        diffuseColor.rgb *= mix(1.0, 0.62, shoreWet);
        // ---- snow: weather accumulation, winter blanket and peak caps; it fills hollows first ----
        float snowAmt = uSnow * smoothstep(0.62, 0.86, ny) * smoothstep(uSnowLine, uSnowLine + 25.0, vWPos.y);
        {
          float cover = smoothstep(0.35, 0.6, fbm3(gp * 0.045) * 0.6 + ny * 0.5);
          float wSnow = uWinter * smoothstep(0.5, 0.8, ny + (vnoise(gp * 0.3) - 0.5) * 0.25) * smoothstep(0.3, 1.4, vWPos.y)
            * smoothstep(300.0, 470.0, volcD) * (1.0 - min(1.0, lavaE * 3.0)) * mix(0.7, 1.0, cover);
          snowAmt = max(max(snowAmt, wSnow), snowCap);
        }
        float snowCov = 0.0;
        if (snowAmt > 0.005) {
          // on steep ground the high points of the rock break through: wind-scoured ridges
          float steepS = 1.0 - smoothstep(0.55, 0.9, ny);
          snowCov = smoothstep(0.0, 0.3, snowAmt * 1.3 - hUnder * (0.3 + 0.9 * steepS) - 0.04 - steepS * rockW * 0.25);
          vec3 sA = vec3(0.78), sT = vec3(0.0, 0.0, 1.0); float sH = 0.5;
          if (photoK > 0.0) {
            float sc = 1.0 / TILE[int(L_SNOW)];
            photo(L_SNOW, gp * sc, gdx * sc, gdy * sc, vnoise(gp * 0.07), sA, sT, sH);
          }
          // wind-packed drifts and old crust vary the brightness at metre-to-decametre scale
          float drift = fbm3(gp * 0.06 + uWindDir * 3.0);
          vec3 snowC = sA / max(dot(sA, LUMA), 1e-3) * 0.64 * (0.93 + 0.1 * sH) * (0.9 + 0.14 * drift);
          diffuseColor.rgb = mix(diffuseColor.rgb, snowC, snowCov);
          // sastrugi: wind ripples carved across the snow, plus the scanned snow relief
          vec2 wd = normalize(uWindDir + vec2(1e-3));
          float rp = dot(gp, wd) * 0.9 + fbm3(gp * 0.2) * 4.0;
          float sg = cos(rp) * 0.5 * (1.0 - smoothstep(30.0, 140.0, camD)) * smoothstep(0.75, 0.95, ny);
          vec3 sN = normalize(vec3(sT.x * 0.6 + nG0.x + wd.x * sg * 0.18, abs(sT.z) * nG0.y, sT.y * 0.6 + nG0.z + wd.y * sg * 0.18));
          nW = normalize(mix(nW, sN, snowCov));
          roughP = mix(roughP, 0.6 - 0.12 * drift, snowCov);
        }
        float snowAmtF = snowCov;
        // ---- rain: wet darkening, puddles in the low spots of the scanned ground ----
        float flatG = smoothstep(0.86, 0.975, ny);
        float puddle = max(uWet, swampMud * 0.6) * flatG * smoothstep(0.52, 0.66, fbm3(gp * 0.085) + (0.5 - hUnder) * 0.3) * step(0.6, vWPos.y) * (1.0 - snowAmtF);
        float wet = max(uWet * (0.55 + 0.45 * flatG), swampMud * 0.8) * (1.0 - snowAmtF);
        diffuseColor.rgb *= mix(1.0, 0.55, wet);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + vec3(0.01, 0.012, 0.015), puddle);
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(3.8, 0.95, 0.12) * lavaE;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = roughP;
        roughnessFactor = mix(roughnessFactor, 0.35, shoreWet * (1.0 - snowAmtF));
        roughnessFactor = mix(roughnessFactor, 0.4 + swampMud * 0.42, wet);
        roughnessFactor = mix(roughnessFactor, 0.03, puddle);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // micro-relief of fallen leaves via screen-space derivatives
          {
            float gh = lH * (1.0 - puddle);
            vec3 dpx = dFdx(vWPos), dpy = dFdy(vWPos);
            vec3 r1 = cross(dpy, nW), r2 = cross(nW, dpx);
            float det = dot(dpx, r1);
            vec2 dh = vec2(dFdx(gh), dFdy(gh)) * 0.045;
            vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
            vec3 nB = normalize(abs(det) * nW - grad);
            if (abs(det) > 1e-12 && dot(nB, nB) > 0.5) nW = nB;
          }
          // wet ground loses its fine relief under a film of water
          nW = normalize(mix(nW, nG0, wet * 0.35));
          nW = normalize(mix(nW, vec3(0.0, 1.0, 0.0), puddle * 0.9));
          // raindrops ringing in the puddles
          if (puddle > 0.05 && uRain > 0.02 && camD < 40.0) {
            for (int k = 0; k < 2; k++) {
              vec2 rp = gp * 1.7 + float(k) * 0.5;
              vec2 cell = floor(rp); vec2 f = fract(rp) - 0.5;
              float hh = hash12(cell + float(k) * 13.0);
              float tt = fract(uTime * 0.8 + hh);
              float rr = length(f) - tt * 0.45;
              float ring = exp(-rr * rr * 500.0) * (1.0 - tt) * step(hh, uRain);
              nW = normalize(nW + vec3(f.x, 0.0, f.y) * ring * 2.5 * puddle);
            }
          }
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  mat.customProgramCacheKey = () => 'terrain-photo-v1' + (simple ? 's' : '');
  { const _obc = mat.onBeforeCompile; mat.onBeforeCompile = (s) => { _obc(s); atmospherePatch(s); }; }
  return mat;
}

export class Terrain {
  constructor(world, scene, quality) {
    this.world = world;
    this.scene = scene;
    TerrainTextures.world = world;
    this.material = createTerrainMaterial(world, quality);
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.chunks = [];
    this.quality = quality;
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        const c0 = cx * CHUNK_CELLS, r0 = cz * CHUNK_CELLS;
        let maxH = -Infinity, minH = Infinity;
        for (let r = r0; r <= r0 + CHUNK_CELLS; r += 2) for (let c = c0; c <= c0 + CHUNK_CELLS; c += 2) {
          const h = world.heights[r * N + c];
          if (h > maxH) maxH = h;
          if (h < minH) minH = h;
        }
        this.chunks.push({
          cx, cz, c0, r0, maxH, minH, lod: -1, mesh: null,
          centerX: -HALF + (c0 + CHUNK_CELLS / 2) * CELL,
          centerZ: -HALF + (r0 + CHUNK_CELLS / 2) * CELL,
          skip: maxH < -18,
        });
      }
    }
    this._col = [0, 0, 0];
  }

  desiredLod(ch, px, pz) {
    const dx = Math.max(Math.abs(px - ch.centerX) - 128, 0);
    const dz = Math.max(Math.abs(pz - ch.centerZ) - 128, 0);
    const d = Math.sqrt(dx * dx + dz * dz);
    const s = this.quality.viewScale;
    if (d < LOD_DIST[0] * s * 0.7) return 0;
    if (d < LOD_DIST[1] * s * 0.85) return 1;
    if (d < LOD_DIST[2] * s * 1.1) return 2;
    return 3;
  }

  // Build every chunk synchronously (used at load)
  buildAll(px, pz) {
    for (const ch of this.chunks) {
      if (ch.skip) continue;
      this._rebuild(ch, this.desiredLod(ch, px, pz));
    }
  }

  update(px, pz) {
    let budget = 3;
    // prioritise nearest chunks needing change
    const pending = [];
    for (const ch of this.chunks) {
      if (ch.skip) continue;
      const l = this.desiredLod(ch, px, pz);
      if (l !== ch.lod) pending.push([Math.hypot(px - ch.centerX, pz - ch.centerZ), ch, l]);
    }
    if (!pending.length) return;
    pending.sort((a, b) => a[0] - b[0]);
    for (const [, ch, l] of pending) {
      this._rebuild(ch, l);
      if (--budget <= 0) break;
    }
  }

  _rebuild(ch, lod) {
    const world = this.world;
    const step = 1 << lod;
    const n = CHUNK_CELLS / step;
    const vpr = n + 1;
    const baseCount = vpr * vpr;
    const skirtCount = 4 * vpr;
    const total = baseCount + skirtCount;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const H = world.heights;
    const c3 = this._col;
    let vi = 0;
    const setV = (c, r, yOff) => {
      const k = r * N + c;
      const x = -HALF + c * CELL, z = -HALF + r * CELL;
      pos[vi * 3] = x; pos[vi * 3 + 1] = H[k] + yOff; pos[vi * 3 + 2] = z;
      const hl = world.hAt(c - 1, r), hr = world.hAt(c + 1, r), hd = world.hAt(c, r - 1), hu = world.hAt(c, r + 1);
      let nx = hl - hr, ny = 2 * CELL, nz = hd - hu;
      const l = Math.hypot(nx, ny, nz);
      nor[vi * 3] = nx / l; nor[vi * 3 + 1] = ny / l; nor[vi * 3 + 2] = nz / l;
      world.colorLinear(k, c3);
      col[vi * 3] = c3[0]; col[vi * 3 + 1] = c3[1]; col[vi * 3 + 2] = c3[2];
      vi++;
    };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) setV(ch.c0 + i * step, ch.r0 + j * step, 0);
    const skirtDrop = -3 - step * 3;
    const sk = [];
    // perimeter order: top row, right col, bottom row, left col (each vpr verts)
    for (let i = 0; i <= n; i++) { sk.push(i); setV(ch.c0 + i * step, ch.r0, skirtDrop); }
    for (let j = 0; j <= n; j++) { sk.push(j * vpr + n); setV(ch.c0 + n * step, ch.r0 + j * step, skirtDrop); }
    for (let i = 0; i <= n; i++) { sk.push(n * vpr + i); setV(ch.c0 + i * step, ch.r0 + n * step, skirtDrop); }
    for (let j = 0; j <= n; j++) { sk.push(j * vpr); setV(ch.c0, ch.r0 + j * step, skirtDrop); }

    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * vpr + i, b = a + 1, c = a + vpr, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < n; i++) {
        const t0 = sk[s * vpr + i], t1 = sk[s * vpr + i + 1];
        const b0 = baseCount + s * vpr + i, b1 = b0 + 1;
        idx.push(t0, b0, t1, t1, b0, b1); // both windings so skirts are visible from either side
        idx.push(t0, t1, b0, t1, b1, b0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    if (ch.mesh) {
      ch.mesh.geometry.dispose();
      ch.mesh.geometry = geo;
    } else {
      ch.mesh = new THREE.Mesh(geo, this.material);
      ch.mesh.receiveShadow = true;
      ch.mesh.matrixAutoUpdate = false;
      this.group.add(ch.mesh);
    }
    ch.mesh.castShadow = lod === 0;
    ch.lod = lod;
  }

  setVisible(v) { this.group.visible = v; }
}

export { CHUNK_CELLS, CHUNKS };
