// Chunked LOD terrain rendering with a detailed, weather-reactive shader.
import * as THREE from 'three';
import { atmospherePatch, TRANSLUCENCY } from './atmosphere.js';
import { GRID, CELL, HALF, VOLCANO } from './worldgen.js';
import { U, GLSL_NOISE, GLSL_MEADOW } from './shaderlib.js';

const CHUNK_CELLS = 64; // 256m
const CHUNKS = GRID / CHUNK_CELLS; // 16
const N = GRID + 1;
const LOD_DIST = [420, 900, 1500];

export function createTerrainMaterial(world) {
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
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNormal;
        uniform float uWet; uniform float uSnow; uniform float uTime; uniform float uSnowLine;
        uniform sampler2D uSurfTex; uniform sampler2D uSurfTex2; uniform vec2 uWindDir; uniform float uWinter; uniform float uAutumn; uniform float uRain;
        ${GLSL_NOISE}
        ${GLSL_MEADOW}
        vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
        // Voronoi: x = F1, y = F2 - F1 (edge distance), z = cell hash
        vec3 voro(vec2 p){
          vec2 n = floor(p), f = fract(p);
          float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 r = g + hash22(n + g) - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) d2 = d;
          }
          return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), hash12(id));
        }
        // Scattered leaves: returns (coverage, height, hash, vein)
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
        }
        // fallen twigs: short line segments scattered per cell
        float twigs(vec2 p){
          vec2 n = floor(p), f = fract(p);
          float m = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 c = n + g;
            if (hash12(c + 5.1) > 0.4) continue;
            vec2 o = f - (g + hash22(c + 1.7));
            float a = hash12(c + 9.2) * 3.1416;
            vec2 d = vec2(cos(a), sin(a));
            float len = 0.2 + 0.3 * hash12(c + 4.4);
            float t = clamp(dot(o, d), -len, len);
            float bend = sin(t * 9.0 + c.x) * 0.012;
            float dist = abs(length(o - d * t) + bend);
            float w = 0.01 + 0.012 * hash12(c + 3.3);
            m = max(m, smoothstep(w, w * 0.3, dist));
          }
          return m;
        }
        vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
        float triN(vec3 p, vec3 w){ return vnoise(p.zy) * w.x + vnoise(p.xz + 13.7) * w.y + vnoise(p.xy + 31.1) * w.z; }
        // procedural rock: layered strata, cracks and boulder-scale mottling
        float rockH(vec3 p, vec3 w, float fine, float strataK){
          float warp = vnoise(p.xz * 0.02) * 2.5 + triN(p * 0.09, w) * 0.8;
          // sedimentary ledges (canyons, badlands) only read on steep faces; smoothed so the
          // layer boundary never leaves a hard seam
          float steep = 1.0 - w.y;
          float layer = fract(p.y * 0.28 + warp);
          float ledge = smoothstep(0.0, 0.85, layer) * smoothstep(1.0, 0.88, layer) * 0.5 * steep * strataK;
          float thin = (sin(p.y * 2.2 + warp * 6.0) * 0.5 + 0.5) * 0.12 * fine * steep * strataK;
          // angular fractured plates and, for granite, tall jointed blocks
          float plate = floor(triN(p * 0.22, w) * 5.0) / 5.0;
          float blocks = floor(triN(p * vec3(0.11, 0.045, 0.11) + 4.0, w) * 4.0) / 4.0;
          float big = triN(p * 0.05, w);
          float crack = 1.0 - abs(triN(p * 0.33, w) * 2.0 - 1.0);
          crack = smoothstep(0.94, 0.995, crack) * 0.3 * smoothstep(0.42, 0.7, triN(p * 0.06 + 3.0, w)) * (0.25 + 0.75 * steep);
          float grain = (triN(p * 3.1, w) - 0.5) * 0.18 * fine;
          return ledge + thin + plate * mix(0.55, 0.35, strataK) + blocks * (1.0 - strataK) * 0.5 + big * 0.45 - crack + grain;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float camD = length(vWPos - cameraPosition);
        float detailFade = 1.0 - smoothstep(60.0, 220.0, camD);
        float dn = fbm3(vWPos.xz * 0.33);
        float dn2 = vnoise(vWPos.xz * 2.3);
        float dnL = vnoise(vWPos.xz * 0.045);
        diffuseColor.rgb *= 0.78 + 0.34 * dnL;
        diffuseColor.rgb *= mix(1.0, 0.8 + 0.3 * dn + 0.12 * dn2, detailFade);
        vec2 sUV = ((vWPos.xz + 2048.0) / 4.0 + 0.5) / 1025.0;
        vec4 surf = texture2D(uSurfTex, sUV);
        vec4 surf2 = texture2D(uSurfTex2, sUV);
        // ---- meadow patchwork: lush hollows and sun-dried drifts (matches the grass blades) ----
        {
          vec3 b0 = diffuseColor.rgb;
          float grassyT = smoothstep(0.005, 0.03, b0.g - b0.r) * smoothstep(0.005, 0.03, b0.g - b0.b) * smoothstep(0.75, 0.9, vWNormal.y) * (1.0 - surf.g);
          vec2 mv = meadowVar(vWPos.xz);
          diffuseColor.rgb = mix(b0, vec3(0.06, 0.105, 0.025), mv.x * 0.45 * grassyT);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.45, 1.12, 0.5) + vec3(0.03, 0.018, 0.0), mv.y * 0.5 * grassyT);
          // autumn: meadows fade to straw and gold
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.5, 1.05, 0.45) + vec3(0.025, 0.012, 0.0), uAutumn * grassyT * 0.6);
        }
        // coastal sand reads as sand, not as the grassy island colour beneath it
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.43, 0.3) * (0.9 + 0.2 * dn), surf.g * smoothstep(5.0, 2.0, vWPos.y) * smoothstep(0.7, 0.9, vWNormal.y) * 0.75);
        // ---- close-up ground detail: leaf litter, twigs, pebbles, sand ripples, cracked earth ----
        float gH = 0.0;
        float gRough = -1.0;
        float closeFade = 1.0 - smoothstep(28.0, 75.0, camD);
        float fineFade = 1.0 - smoothstep(9.0, 26.0, camD);
        // planar (xz) detail stretches on slopes: keep it to walkable ground
        float slopeK = smoothstep(0.72, 0.9, vWNormal.y);
        surf *= slopeK;
        // swamp mud & moss: dark, wet, algae-streaked ground with standing water
        float swampMud = surf2.r * smoothstep(0.8, 0.95, vWNormal.y) * step(0.2, vWPos.y);
        {
          float mn = fbm3(vWPos.xz * 0.18);
          vec3 mudC = mix(vec3(0.05, 0.042, 0.028), vec3(0.075, 0.07, 0.035), mn);
          diffuseColor.rgb = mix(diffuseColor.rgb, mudC, swampMud * 0.85);
          float algae = surf2.g * smoothstep(0.55, 0.75, fbm3(vWPos.xz * 0.35 + 4.0)) * smoothstep(0.8, 0.95, vWNormal.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.09, 0.025), algae * 0.6);
        }
        // footprint-aware anti-aliasing: fade fine features once a cell spans less than ~2 pixels
        float pxFoot = length(fwidth(vWPos.xz));
        float aaFine = 1.0 - smoothstep(0.06, 0.12, pxFoot);
        float aaMid = 1.0 - smoothstep(0.15, 0.32, pxFoot);
        fineFade *= aaFine;
        if (closeFade > 0.0) {
          vec2 gp = vWPos.xz;
          float flatK = smoothstep(0.7, 0.9, vWNormal.y);
          // wind-sculpted sand ripples and grain
          if (surf.g > 0.04) {
            vec2 wd = normalize(uWindDir + vec2(0.0001));
            float warp = vnoise(gp * 0.35) * 5.0 + vnoise(gp * 1.3) * 1.2;
            float rph = (dot(gp, wd) * 1.6 + warp) * 6.2832;
            float ripple = 0.5 + 0.5 * sin(rph + 0.75 * sin(rph));
            float grain = vnoise(gp * 55.0);
            float sk = surf.g * flatK * closeFade * step(0.4, vWPos.y);
            gH += (ripple * 0.5 * smoothstep(0.3, 0.6, vnoise(gp * 0.08)) + grain * 0.06 * fineFade) * sk;
            diffuseColor.rgb *= mix(1.0, 0.92 + 0.1 * ripple + 0.12 * (grain - 0.5) * fineFade, sk);
          }
          // sun-baked cracked earth
          if (surf.a > 0.04) {
            vec3 cv = voro(gp * 0.9 + vnoise(gp * 2.0) * 0.25);
            float crack = 1.0 - smoothstep(0.0, 0.05, cv.y);
            float curl = smoothstep(0.0, 0.35, cv.y);
            float dk = surf.a * flatK * closeFade * smoothstep(0.35, 0.6, vnoise(gp * 0.12 + 5.0));
            gH += (curl * 0.4 - crack * 0.7) * dk;
            diffuseColor.rgb *= mix(1.0, (0.9 + 0.2 * cv.z) * (1.0 - crack * 0.6), dk);
          }
          // pebbles, gravel and loose stones with contact shadows
          float gk = max(surf.b, surf.r * 0.22) * closeFade * (1.0 - swampMud);
          if (gk > 0.02) {
            vec2 sw = vec2(vnoise(gp * 9.0), vnoise(gp * 9.0 + 4.1)) - 0.5;
            vec3 pv = voro(gp * 5.0 + sw * 0.35);
            float present = step(pv.z, 0.08 + 0.34 * surf.b) * fineFade;
            float rad = 0.26 + 0.2 * fract(pv.z * 13.1);
            float dome = present * sqrt(max(0.0, 1.0 - (pv.x / rad) * (pv.x / rad)));
            vec3 pv2 = voro(gp * 1.5 + 3.3 + sw * 0.25);
            float present2 = step(pv2.z, 0.06 + 0.22 * surf.b) * aaMid;
            float rad2 = 0.2 + 0.18 * fract(pv2.z * 7.3);
            float dome2 = present2 * sqrt(max(0.0, 1.0 - (pv2.x / rad2) * (pv2.x / rad2)));
            float stone = max(dome, dome2);
            float sid = dome2 > dome ? pv2.z : pv.z;
            // per-stone mineral colour: grey granite, brown sandstone, dark basalt, pale quartz, tinted by local soil
            vec3 soil = diffuseColor.rgb;
            float t1 = fract(sid * 31.7), t2 = fract(sid * 5.3);
            vec3 stoneC = mix(vec3(0.085, 0.08, 0.072), vec3(0.17, 0.15, 0.12), t1);
            stoneC = mix(stoneC, soil * 1.05, 0.35 + 0.3 * fract(sid * 17.9));
            stoneC = mix(stoneC, vec3(0.035, 0.034, 0.036), step(0.78, t2));
            stoneC = mix(stoneC, vec3(0.24, 0.22, 0.2), step(0.94, t2));
            stoneC *= 0.75 + 0.5 * vnoise(gp * 34.0 + sid * 10.0);
            stoneC = mix(stoneC, vec3(0.06, 0.08, 0.03), smoothstep(0.6, 0.9, vnoise(gp * 9.0)) * surf.r * 0.7);
            stoneC *= 0.55 + 0.45 * sqrt(stone);
            // stones on dark volcanic soil are basalt too, not pale pebbles
            stoneC *= mix(0.4, 1.0, smoothstep(0.015, 0.07, dot(soil, vec3(0.3, 0.59, 0.11))));
            float sm = smoothstep(0.0, 0.18, stone) * gk;
            float ring = max(present * smoothstep(rad * 1.45, rad, pv.x), present2 * smoothstep(rad2 * 1.45, rad2, pv2.x)) * (1.0 - smoothstep(0.0, 0.2, stone));
            diffuseColor.rgb *= 1.0 - ring * 0.45 * gk;
            diffuseColor.rgb = mix(diffuseColor.rgb, stoneC, sm);
            gH += stone * 2.2 * gk;
            gRough = mix(0.9, 0.62, sm);
          }
          // forest floor: layered fallen leaves, twigs and dark humus
          if (surf.r > 0.04) {
            float lk = surf.r * smoothstep(0.55, 0.8, vWNormal.y) * step(0.5, vWPos.y) * (1.0 - swampMud * 0.7);
            vec4 L1 = leafLayer(gp * 5.5, 0.55 + 0.35 * vnoise(gp * 0.5) + uAutumn * 0.3);
            vec4 L2 = leafLayer(gp * 3.2 + 17.0, 0.6);
            vec4 L = L1.x > 0.0 ? L1 : L2;
            float lh = L.z;
            vec3 lc = vec3(0.11, 0.065, 0.03);
            lc = mix(lc, vec3(0.16, 0.072, 0.026), step(0.35, lh));
            lc = mix(lc, vec3(0.085, 0.08, 0.032), step(0.55, lh));
            lc = mix(lc, vec3(0.04, 0.028, 0.018), step(0.72, lh));
            lc = mix(lc, vec3(0.19, 0.14, 0.06), step(0.93, lh));
            lc *= (0.8 + 0.4 * vnoise(gp * 40.0)) * (1.0 - L.w * 0.35) * (0.85 + 0.3 * vnoise(gp * 0.7));
            lc = mix(lc, diffuseColor.rgb * 0.9, 0.2);
            lc = mix(lc, lc * vec3(1.9, 1.15, 0.55), uAutumn * 0.65 * step(0.4, fract(lh * 7.0)));
            float lf = lk * fineFade;
            float cov = L.x * lf;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.64, 0.56), lk * closeFade * (0.45 + 0.25 * (1.0 - L.x)));
            diffuseColor.rgb *= mix(1.0, 0.88 + 0.24 * vnoise(gp * 7.0), lk * closeFade * (1.0 - fineFade));
            diffuseColor.rgb = mix(diffuseColor.rgb, lc, cov * 0.92);
            float tw = twigs(gp * 1.25) * lk * closeFade * aaMid;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.04, 0.025) * (0.8 + 0.4 * vnoise(gp * 25.0)), tw * 0.9);
            gH += (L.x * L.y * 0.35 + tw * 0.8) * lk;
            gRough = mix(gRough < 0.0 ? 0.92 : gRough, 0.8, cov);
          }
        }
        float ny = vWNormal.y;
        // ---- rock surfaces (steep slopes, bare mountain tops) ----
        vec3 vc = diffuseColor.rgb;
        float mx = max(vc.r, max(vc.g, vc.b));
        float sat = (mx - min(vc.r, min(vc.g, vc.b))) / max(mx, 0.001);
        float greyRock = (1.0 - smoothstep(0.38, 0.5, sat)) * smoothstep(70.0, 140.0, vWPos.y) * step(0.02, vc.g) * max(smoothstep(0.97, 0.88, ny), smoothstep(170.0, 220.0, vWPos.y));
        float slopeRock = smoothstep(0.84, 0.64, ny);
        float rockAmt = clamp(max(greyRock, slopeRock), 0.0, 1.0) * step(1.0, vWPos.y);
        vec3 tw = triW(vWNormal);
        float rockFine = 1.0 - smoothstep(80.0, 400.0, camD);
        // warm red/orange rock is sedimentary (strata); grey rock is granite (joints and blocks)
        float strataK = smoothstep(0.015, 0.09, vc.r - vc.b) * smoothstep(-0.005, 0.03, vc.r - vc.g);
        float rh = rockH(vWPos, tw, rockFine, strataK);
        float crackR = smoothstep(0.94, 0.995, 1.0 - abs(triN(vWPos * 0.33, tw) * 2.0 - 1.0));
        float layerId = floor(vWPos.y * 0.28 + vnoise(vWPos.xz * 0.02) * 2.5 + triN(vWPos * 0.09, tw) * 0.8);
        float layerTone = hash12(vec2(layerId, 7.0));
        vec3 rockC = vc * (0.7 + 0.5 * clamp(rh, 0.0, 1.3)) * (0.88 + 0.24 * mix(0.5, layerTone, strataK));
        rockC = mix(rockC, rockC * vec3(1.08, 0.98, 0.86), smoothstep(0.4, 0.8, triN(vWPos * 0.02, tw)) * 0.6);
        crackR *= smoothstep(0.42, 0.7, triN(vWPos * 0.06 + 3.0, tw));
        rockC *= 1.0 - crackR * 0.22;
        // lichen & moss in sheltered ledges
        float lichen = smoothstep(0.6, 0.72, triN(vWPos * 0.55, tw)) * smoothstep(0.35, 0.75, ny) * (1.0 - smoothstep(240.0, 300.0, vWPos.y))
          * smoothstep(480.0, 640.0, length(vWPos.xz - vec2(${VOLCANO.x.toFixed(1)}, ${VOLCANO.z.toFixed(1)})));
        rockC = mix(rockC, vec3(0.16, 0.19, 0.1), lichen * 0.45);
        // natural snow caps on ledges of high peaks
        float snowCap = smoothstep(255.0, 290.0, vWPos.y + vnoise(vWPos.xz * 0.05) * 30.0) * smoothstep(0.45, 0.7, ny + rh * 0.15)
          * smoothstep(520.0, 680.0, length(vWPos.xz - vec2(${VOLCANO.x.toFixed(1)}, ${VOLCANO.z.toFixed(1)})));
        rockC = mix(rockC, vec3(0.86, 0.89, 0.94), snowCap);
        diffuseColor.rgb = mix(diffuseColor.rgb, rockC, rockAmt);
        // ---- lava flows streaming down Ember Peak: hot near the rim, crusting over further down ----
        float lavaE = 0.0;
        {
          vec2 dv = vWPos.xz - vec2(${VOLCANO.x.toFixed(1)}, ${VOLCANO.z.toFixed(1)});
          float rv = length(dv);
          if (rv > 88.0 && rv < 480.0) {
            float av = atan(dv.y, dv.x);
            float wig = vnoise(vec2(rv * 0.018, av * 2.0)) * 1.4 + vnoise(vec2(rv * 0.06, av * 5.0)) * 0.35;
            float sw = sin(av * 7.0 + wig * 2.2);
            float sector = smoothstep(0.35, 0.6, vnoise(vec2(av * 1.3 + 2.0, 0.5)));
            float along = smoothstep(480.0, 130.0, rv);
            float breakup = smoothstep(0.28, 0.6, vnoise(vec2(rv * 0.05, av * 9.0)));
            float chan = smoothstep(cos(30.0 / rv), cos(10.0 / rv), sw);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.018, 0.017), smoothstep(cos(70.0 / rv), cos(30.0 / rv), sw) * sector * along * 0.85);
            float cr = vnoise(vWPos.xz * 0.45 + vec2(0.0, uTime * 0.04)) * 0.7 + vnoise(vWPos.xz * 1.7) * 0.3;
            lavaE = chan * sector * breakup * along * mix(0.15, 1.0, smoothstep(0.35, 0.72, cr)) * (0.55 + 0.45 * smoothstep(320.0, 120.0, rv));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.008, 0.0), min(1.0, lavaE * 1.5));
          }
        }
        // shore: wet sand band
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(-0.2, 1.2, vWPos.y));
        // weather snow accumulation
        float snowAmt = uSnow * smoothstep(0.62, 0.86, ny) * smoothstep(uSnowLine, uSnowLine + 25.0, vWPos.y);
        // winter: snow blankets the land, thinning on slopes, never on lava, the volcano's hot cone or below the tide
        {
          float wv = length(vWPos.xz - vec2(${VOLCANO.x.toFixed(1)}, ${VOLCANO.z.toFixed(1)}));
          float cover = smoothstep(0.35, 0.6, fbm3(vWPos.xz * 0.045) * 0.6 + ny * 0.5);
          float wSnow = uWinter * smoothstep(0.5, 0.8, ny + (vnoise(vWPos.xz * 0.3) - 0.5) * 0.25) * smoothstep(0.3, 1.4, vWPos.y)
            * smoothstep(300.0, 470.0, wv) * (1.0 - min(1.0, lavaE * 3.0)) * mix(0.7, 1.0, cover);
          snowAmt = max(snowAmt, wSnow);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.73, 0.78) * (0.94 + 0.06 * vnoise(vWPos.xz * 0.7)), snowAmt);
        float flatG = smoothstep(0.86, 0.975, ny);
        float puddle = max(uWet, swampMud * 0.6) * flatG * smoothstep(0.58, 0.7, fbm3(vWPos.xz * 0.085)) * step(0.6, vWPos.y) * (1.0 - snowAmt);
        float wet = max(uWet * (0.55 + 0.45 * flatG), swampMud * 0.8) * (1.0 - snowAmt);
        diffuseColor.rgb *= mix(1.0, 0.55, wet);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + vec3(0.01, 0.012, 0.015), puddle);
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(3.8, 0.95, 0.12) * lavaE;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (gRough >= 0.0) roughnessFactor = mix(roughnessFactor, gRough, closeFade * (1.0 - rockAmt));
        roughnessFactor = mix(roughnessFactor, 0.4 + swampMud * 0.42, wet);
        roughnessFactor = mix(roughnessFactor, 0.03, puddle);
        roughnessFactor = mix(roughnessFactor, 0.6, snowAmt);
        roughnessFactor = mix(roughnessFactor, 0.78 - crackR * 0.1, rockAmt);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = vWPos.xz * 0.8;
          float e = 0.12;
          float h0 = fbm3(p), hx = fbm3(p + vec2(e, 0.0)), hz = fbm3(p + vec2(0.0, e));
          float bs = 0.55 * detailFade * (1.0 - puddle);
          vec3 nW = normalize(vWNormal + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * bs * 0.35);
          // triplanar rock bump: strata ledges and cracks, visible far away
          if (rockAmt > 0.01) {
            float re = 0.25;
            float r0 = rockH(vWPos, tw, rockFine, strataK);
            vec3 g3 = vec3(rockH(vWPos + vec3(re, 0.0, 0.0), tw, rockFine, strataK) - r0, rockH(vWPos + vec3(0.0, re, 0.0), tw, rockFine, strataK) - r0, rockH(vWPos + vec3(0.0, 0.0, re), tw, rockFine, strataK) - r0) / re;
            g3 -= dot(g3, nW) * nW;
            float rk = rockAmt * (0.55 - 0.3 * smoothstep(300.0, 1200.0, camD));
            nW = normalize(nW - g3 * rk);
          }
          // micro-relief from ground detail (pebbles, leaves, ripples) via screen-space derivatives
          {
            float gh = gH * (1.0 - rockAmt) * (1.0 - snowAmt) * (1.0 - puddle) * (1.0 - wet * 0.75);
            vec3 dpx = dFdx(vWPos), dpy = dFdy(vWPos);
            vec3 r1 = cross(dpy, nW), r2 = cross(nW, dpx);
            float det = dot(dpx, r1);
            vec2 dh = vec2(dFdx(gh), dFdy(gh)) * 0.045;
            vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
            vec3 nB = normalize(abs(det) * nW - grad);
            if (abs(det) > 1e-12 && dot(nB, nB) > 0.5) nW = nB;
          }
          nW = normalize(mix(nW, vec3(0.0, 1.0, 0.0), puddle * 0.9));
          // raindrops ringing in the puddles
          if (puddle > 0.05 && uRain > 0.02 && camD < 40.0) {
            for (int k = 0; k < 2; k++) {
              vec2 rp = vWPos.xz * 1.7 + float(k) * 0.5;
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
  mat.customProgramCacheKey = () => 'terrain-v12';
  { const _obc = mat.onBeforeCompile; mat.onBeforeCompile = (s) => { _obc(s); atmospherePatch(s); }; }
  return mat;
}

export class Terrain {
  constructor(world, scene, quality) {
    this.world = world;
    this.scene = scene;
    this.material = createTerrainMaterial(world);
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
