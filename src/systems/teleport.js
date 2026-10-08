// Fast travel. Destinations are plain data: add one with registerLocation({...}) and it appears in the
// atlas automatically (a preview image is optional; a map vignette is drawn when none exists).
import * as THREE from 'three';
import { BIOME, VOLCANO, REGIONS, ISLANDS } from '../world/worldgen.js';
import { mulberry32 } from '../core/noise.js';

export const LOCATIONS = [];
export function registerLocation(loc) { LOCATIONS.push(loc); return loc; }

const region = (id) => REGIONS.find((r) => r.id === id);
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

// Deterministic search around a centre. accept() filters, score() ranks (higher is better).
function search(g, { cx, cz, r, rMin = 0, tries = 2500, seed = 7, accept = () => true, score = () => 0 }) {
  const w = g.world;
  const rand = mulberry32(seed);
  let best = null, bs = -Infinity;
  for (let i = 0; i < tries; i++) {
    const a = rand() * Math.PI * 2, rr = rMin + Math.sqrt(rand()) * (r - rMin);
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    if (!w.inBounds(x, z)) continue;
    const h = w.getHeight(x, z);
    const b = w.getBiome(x, z);
    const n = w.getNormal(x, z);
    if (w.waterLevelAt(x, z) > h - 0.4) continue;
    if (!accept(x, z, h, b, n)) continue;
    const s = score(x, z, h, b, n);
    if (s > bs) { bs = s; best = { x, z, h }; }
  }
  return best;
}
const flatness = (w, x, z, h, rr = 6) => {
  let m = 0;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; m = Math.max(m, Math.abs(w.getHeight(x + Math.cos(a) * rr, z + Math.sin(a) * rr) - h)); }
  return m;
};
// direction (yaw) toward the most open water within reach, or null
function waterYaw(w, x, z, dist = 45) {
  let sx = 0, sz = 0, n = 0;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const px = x + Math.sin(a) * dist, pz = z + Math.cos(a) * dist;
    if (w.waterLevelAt(px, pz) > w.getHeight(px, pz) + 0.5) { sx += Math.sin(a); sz += Math.cos(a); n++; }
  }
  return n >= 3 ? { yaw: Math.atan2(sx, sz), n } : null;
}

// ------------------------------------------------------------------------------------------------
registerLocation({
  id: 'volcano', icon: '🌋', name: 'Ember Peak', tag: 'Active Volcano', danger: 3, hour: 18.7,
  desc: 'Stand on the crater rim above a churning lava lake while ash and smoke tower into the sky. Molten rivers glow down the black flanks.',
  at: { x: VOLCANO.x, z: VOLCANO.z },
  find(g) {
    // stand upwind so the plume streams away from the viewpoint
    const wv = g.weather.windVec;
    const s = search(g, { cx: VOLCANO.x, cz: VOLCANO.z, r: 132, rMin: 98, seed: 11, tries: 4000, accept: (x, z, h, b, n) => n.y > 0.7,
      score: (x, z, h) => h - flatness(g.world, x, z, h, 4) * 2 - ((x - VOLCANO.x) * wv.x + (z - VOLCANO.z) * wv.y) / Math.hypot(x - VOLCANO.x, z - VOLCANO.z) * 6 });
    if (!s) return null;
    return { x: s.x, z: s.z, yaw: face(s.x, s.z, VOLCANO.x, VOLCANO.z), pitch: -0.32 };
  },
});

registerLocation({
  id: 'beach', icon: '🏖️', name: 'Coral Coast', tag: 'Tropical Beach', danger: 1, hour: 17.3,
  desc: 'White sand, turquoise shallows and rolling surf, framed by palms and sea cliffs. Pteranodons wheel over the reef at sunset.',
  at: { x: 1760, z: 1500 },
  find(g) {
    const w = g.world;
    let best = null, bs = -Infinity;
    const rand = mulberry32(21);
    for (let i = 0; i < 6000; i++) {
      const x = (rand() * 2 - 1) * 1900, z = (rand() * 2 - 1) * 1900;
      if (!w.inBounds(x, z)) continue;
      const b = w.getBiome(x, z);
      if (b !== BIOME.BEACH && b !== BIOME.ISLAND) continue;
      const h = w.getHeight(x, z);
      if (h < 0.6 || h > 3.2 || w.waterLevelAt(x, z) > h - 0.4 || w.getNormal(x, z).y < 0.93) continue;
      const wy = waterYaw(w, x, z, 40);
      if (!wy || wy.n > 14) continue;
      const s = wy.n - flatness(w, x, z, h, 5) * 4 + w.getVeg(x, z) * 2;
      if (s > bs) { bs = s; best = { x, z, yaw: wy.yaw }; }
    }
    return best && { x: best.x, z: best.z, yaw: best.yaw, pitch: -0.04 };
  },
});

registerLocation({
  id: 'dinos', icon: '🦖', name: 'Dinosaur Valley', tag: 'Living Herds', danger: 2, hour: 9.2,
  desc: 'The richest grazing grounds on the continent. Triceratops, iguanodons and towering sauropods gather here — and the predators know it.',
  at: { x: 0, z: 150 },
  find(g) {
    const w = g.world;
    const herds = g.dinos.herds.filter((h) => h.count > 0 && !h.spec.aquatic && !h.spec.flyer);
    let best = null, bs = -Infinity;
    for (const h of herds) {
      if (!w.inBounds(h.x, h.z)) continue;
      let s = 0;
      for (const o of herds) {
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (d < 320) s += o.count * (o.spec.diet === 'carnivore' ? 0.4 : 1) * (o.spec.length > 8 ? 1.5 : 1);
      }
      if (h.spec.diet === 'carnivore') s *= 0.5;
      if (s > bs) { bs = s; best = h; }
    }
    if (!best) return null;
    // a clear line of sight to the herd from a slight rise, close enough to feel their size
    const hy = w.getHeight(best.x, best.z) + 3;
    const sight = (x, z, h) => {
      for (let k = 1; k < 10; k++) { const t = k / 10; const px = x + (best.x - x) * t, pz = z + (best.z - z) * t; if (w.getHeight(px, pz) > h + 1.6 + (hy - h - 1.6) * t + 0.5) return false; }
      return true;
    };
    const s = search(g, { cx: best.x, cz: best.z, r: 70, rMin: 42, seed: 31, accept: (x, z, h, b, n) => n.y > 0.88 && sight(x, z, h), score: (x, z, h) => Math.min(h - hy, 8) - flatness(w, x, z, h, 5) * 2 });
    if (!s) return null;
    const d = Math.hypot(best.x - s.x, best.z - s.z);
    return { x: s.x, z: s.z, yaw: face(s.x, s.z, best.x, best.z), pitch: Math.max(-0.16, Math.min(0.1, Math.atan2(hy - (s.h + 1.6), d))) };
  },
});

registerLocation({
  id: 'mountains', icon: '🏔️', name: 'Titan Range', tag: 'Mountains', danger: 2, hour: 15.5,
  desc: 'Granite giants capped with snow, sheer cliffs, hanging valleys and thundering meltwater falls. The air is thin and cold up here.',
  at: { x: -180, z: -1380 },
  find(g) {
    const sp = g.mountainSpawn || region('titan');
    const peak = g.pois.list.find((p) => p.id === 'peak-titan') || { x: -180, z: -1380 };
    return { x: sp.x, z: sp.z, yaw: face(sp.x, sp.z, peak.x, peak.z), pitch: 0.12 };
  },
});

registerLocation({
  id: 'forest', icon: '🌲', name: 'Fernhollow', tag: 'Deep Forest', danger: 2, hour: 10,
  desc: 'Ancient conifers and broadleaf giants close overhead. Shafts of light fall through the canopy onto ferns, moss and fallen leaves.',
  at: { x: -760, z: 960 },
  find(g) {
    const R = region('fernhollow');
    const s = search(g, { cx: R.x, cz: R.z, r: 320, seed: 41, accept: (x, z, h, b, n) => (b === BIOME.FOREST || b === BIOME.PINEFOREST) && n.y > 0.9, score: (x, z) => g.world.getVeg(x, z) * 3 - flatness(g.world, x, z, g.world.getHeight(x, z), 5) });
    return s && { x: s.x, z: s.z, yaw: 0.7, pitch: 0.06 };
  },
});

registerLocation({
  id: 'waterfall', icon: '🌊', name: 'Thunder Falls', tag: 'Waterfall', danger: 1, hour: 13,
  desc: 'A river plunges over a sheer cliff into a misty plunge pool. Rainbows hang in the spray; fish leap in the churning water below.',
  at: { x: 0, z: 0 },
  find(g) {
    const w = g.world;
    const falls = (g.water.falls || []).slice().sort((a, b) => (b.wf.height || 0) - (a.wf.height || 0));
    for (const f of falls) {
      const R = f.river;
      const i1 = Math.min(R.x.length - 1, f.wf.i1);
      const fh = f.wf.height || 20;
      for (let i = i1 + 1; i < R.x.length - 1; i++) {
        const d = Math.hypot(R.x[i] - f.bx, R.z[i] - f.bz);
        if (d < 62 + fh * 0.7) continue;
        let dx = R.x[i + 1] - R.x[i - 1], dz = R.z[i + 1] - R.z[i - 1];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        for (const side of [1, -1]) {
          for (const extra of [5, 9, 14]) {
            const off = R.width[i] * 0.5 + extra;
            const x = R.x[i] - dz * off * side, z = R.z[i] + dx * off * side;
            const h = w.getHeight(x, z);
            if (w.waterLevelAt(x, z) > h - 0.4 || w.getNormal(x, z).y < 0.85) continue;
            const dist = Math.hypot(f.bx - x, f.bz - z);
            return { x, z, yaw: face(x, z, f.bx, f.bz), pitch: Math.atan2(f.by + fh * 0.45 - (h + 1.6), dist) * 0.55 };
          }
        }
        if (d > 240) break;
      }
    }
    return null;
  },
});

registerLocation({
  id: 'desert', icon: '🏜️', name: 'Red Canyon Badlands', tag: 'Desert & Ruins', danger: 2, hour: 17.6,
  desc: 'Wind-carved mesas, rippled dunes and red canyon walls hide the ruins of a lost civilisation, half-swallowed by sand.',
  at: { x: 1340, z: 430 },
  find(g) {
    const w = g.world;
    const R = region('badlands');
    const ruins = g.pois.list.filter((p) => p.type === 'ruin').map((p) => ({ p, d: Math.hypot(p.x - R.x, p.z - R.z) })).filter((o) => o.d < R.r * 1.1).sort((a, b) => a.d - b.d);
    const ov = this.overlook(g);
    if (ov) return ov;
    if (ruins.length) {
      const ru = ruins[0].p;
      const s = search(g, { cx: ru.x, cz: ru.z, r: 48, rMin: 26, seed: 51, accept: (x, z, h, b, n) => n.y > 0.88, score: (x, z, h) => -flatness(w, x, z, h, 4) });
      if (s) return { x: s.x, z: s.z, yaw: face(s.x, s.z, ru.x, ru.z), pitch: 0.02 };
    }
    const s = search(g, { cx: R.x, cz: R.z, r: 400, seed: 52, accept: (x, z, h, b, n) => b === BIOME.DESERT && n.y > 0.9 });
    return s && { x: s.x, z: s.z, yaw: 1.2, pitch: 0.02 };
  },
  // a mesa-top overlook across the canyons, used when no ruin gives a good frame
  overlook(g) {
    const w = g.world;
    const R = region('badlands');
    const s = search(g, { cx: R.x, cz: R.z, r: 520, seed: 53, tries: 4000, accept: (x, z, h, b, n) => (b === BIOME.DESERT || b === BIOME.CANYON) && n.y > 0.93 && flatness(w, x, z, h, 8) < 2.5,
      score: (x, z, h) => { let m = 0; for (let k = 0; k < 8; k++) { const a = k * 0.785; m += w.getHeight(x + Math.cos(a) * 140, z + Math.sin(a) * 140); } return h - m / 8; } });
    if (!s) return null;
    let best = 0, by = 0;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const d = s.h - w.getHeight(s.x + Math.sin(a) * 200, s.z + Math.cos(a) * 200); if (d > by) { by = d; best = a; } }
    return { x: s.x, z: s.z, yaw: best, pitch: -0.12 };
  },
});

registerLocation({
  id: 'jungle', icon: '🌴', name: 'Emerald Jungle', tag: 'Rainforest', danger: 3, hour: 11,
  desc: 'Buttressed giants, hanging vines and steaming rivers. The undergrowth hides raptors, the canopy hides everything else.',
  at: { x: -1300, z: 140 },
  find(g) {
    const w = g.world;
    const R = region('jungle');
    const s = search(g, { cx: R.x, cz: R.z, r: 450, seed: 61, accept: (x, z, h, b, n) => b === BIOME.JUNGLE && n.y > 0.9,
      score: (x, z, h) => { const q = w.gen.riverQuery(x, z, {}); return w.getVeg(x, z) * 2 + (q.dist < 45 && q.dist > q.width * 0.5 + 4 ? 2 : 0) - flatness(w, x, z, h, 5); } });
    if (!s) return null;
    const wy = waterYaw(w, s.x, s.z, 40);
    return { x: s.x, z: s.z, yaw: wy ? wy.yaw : 2.0, pitch: 0.08 };
  },
});

registerLocation({
  id: 'swamp', icon: '🐊', name: 'Mirefen Marsh', tag: 'Swamp', danger: 2, hour: 7.4,
  desc: 'Moss-draped cypress, black water and drifting morning mist. Something large moves beneath the duckweed.',
  at: { x: 140, z: 1340 },
  find(g) {
    const w = g.world;
    const R = region('mirefen');
    const s = search(g, { cx: R.x, cz: R.z, r: 380, seed: 71, tries: 4000, accept: (x, z, h, b, n) => b === BIOME.SWAMP && n.y > 0.9 && w.getVeg(x, z) < 0.35 && !!waterYaw(w, x, z, 30),
      score: (x, z) => (waterYaw(w, x, z, 30) || { n: 0 }).n - w.getVeg(x, z) * 10 });
    if (!s) return null;
    const wy = waterYaw(w, s.x, s.z, 30);
    return { x: s.x, z: s.z, yaw: wy ? wy.yaw : 0, pitch: 0 };
  },
});

registerLocation({
  id: 'plains', icon: '🌾', name: 'Verdant Plains', tag: 'Open Grassland', danger: 1, hour: 18.2,
  desc: 'Endless rolling grass under a huge sky. From the hilltops you can watch migrations stream across the horizon.',
  at: { x: 0, z: 150 },
  find(g) {
    const w = g.world;
    const R = region('plains');
    const s = search(g, { cx: R.x, cz: R.z, r: 520, seed: 81, accept: (x, z, h, b, n) => b === BIOME.GRASSLAND && n.y > 0.94,
      score: (x, z, h) => { let m = 0; for (let k = 0; k < 8; k++) { const a = k * 0.785; m += w.getHeight(x + Math.cos(a) * 120, z + Math.sin(a) * 120); } return h - m / 8; } });
    return s && { x: s.x, z: s.z, yaw: face(s.x, s.z, R.x, R.z), pitch: -0.04 };
  },
});

registerLocation({
  id: 'summit', icon: '❄️', name: 'Mount Titan Summit', tag: 'Frozen Peak', danger: 3, hour: 10.5,
  desc: 'The roof of the world: wind-scoured snow and ice above the clouds, with the whole continent laid out below.',
  at: { x: -180, z: -1380 },
  find(g) {
    const peak = g.pois.list.find((p) => p.id === 'peak-titan');
    if (!peak) return null;
    const s = search(g, { cx: peak.x, cz: peak.z, r: 60, seed: 91, accept: (x, z, h, b, n) => n.y > 0.75, score: (x, z, h) => h });
    return s && { x: s.x, z: s.z, yaw: face(s.x, s.z, VOLCANO.x, VOLCANO.z), pitch: -0.08 };
  },
});

registerLocation({
  id: 'meadows', icon: '🌅', name: 'Sunset Meadows', tag: 'Wildflower Hills', danger: 1, hour: 18.6,
  desc: 'Soft hills of grass and wildflowers that glow gold at dusk. Gentle herbivores graze here in the evening light.',
  at: { x: 720, z: 820 },
  find(g) {
    const R = region('meadows');
    const s = search(g, { cx: R.x, cz: R.z, r: 300, seed: 101, accept: (x, z, h, b, n) => b === BIOME.GRASSLAND && n.y > 0.94, score: (x, z, h) => h * 0.2 });
    return s && { x: s.x, z: s.z, yaw: -1.2, pitch: -0.02 };
  },
});

registerLocation({
  id: 'island', icon: '🏝️', name: 'Isla Sombra', tag: 'Mystery Island', danger: 3, hour: 16.4,
  desc: 'A shadowed island far offshore, wrapped in jungle and legend. The ancient builders came here last — and never left.',
  at: { x: ISLANDS[0].x, z: ISLANDS[0].z },
  find(g) {
    const I = ISLANDS[0];
    const w = g.world;
    const s = search(g, { cx: I.x, cz: I.z, r: I.r * 1.05, rMin: I.r * 0.55, seed: 111, tries: 4000, accept: (x, z, h, b, n) => h > 0.8 && h < 4 && n.y > 0.93 && !!waterYaw(w, x, z, 35) });
    if (!s) return null;
    // look along the shoreline so both the surf and the jungle peak are in frame
    const toC = face(s.x, s.z, I.x, I.z);
    return { x: s.x, z: s.z, yaw: toC + 0.9, pitch: 0.04 };
  },
});

registerLocation({
  id: 'camp', icon: '⛺', name: 'Base Camp Echo', tag: 'Home', danger: 0, hour: 10,
  desc: 'Dr. Vargas’ research camp: workbench, campfire and storage. A safe place to rest, craft and plan your next expedition.',
  at: { x: 180, z: 330 },
  find(g) {
    const c = g.pois.camp;
    return { x: c.x + 8, z: c.z + 12, yaw: face(c.x + 8, c.z + 12, c.x, c.z), pitch: -0.05 };
  },
});

// ------------------------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEASONS = [
  { id: 'summer', icon: '☀️', name: 'Summer', desc: 'Long golden days, lush green growth, warm hazy light.' },
  { id: 'autumn', icon: '🍂', name: 'Autumn', desc: 'Forests turn amber and crimson, and leaves drift down on the wind.' },
  { id: 'winter', icon: '❄️', name: 'Winter', desc: 'Snow blankets mountains, forests and plains. Breath fogs in the cold air.' },
];

export class Teleporter {
  constructor(game) {
    this.game = game;
    this.busy = false;
    this.locations = LOCATIONS;
    this._buildButtons();
  }

  _buildButtons() {
    const bar = document.createElement('div');
    bar.id = 'travelBar';
    bar.innerHTML = `<button class="tb-btn" data-tab="travel"><span class="i">🧭</span><span class="l">Teleport</span><kbd>Y</kbd></button>
      <button class="tb-btn" data-tab="season"><span class="i">🍂</span><span class="l">Season</span></button>`;
    document.body.appendChild(bar);
    for (const b of bar.querySelectorAll('button')) {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); this.open(b.dataset.tab); });
    }
    this.bar = bar;
  }

  setVisible(v) { this.bar.style.display = v ? '' : 'none'; }

  _preview(loc, img) {
    const fallback = () => {
      // painted map vignette for destinations without a captured preview
      const w = this.game.world;
      const c = document.createElement('canvas');
      c.width = 480; c.height = 270;
      const ctx = c.getContext('2d');
      const src = w.mapCanvas;
      if (src) {
        const S = src.width, scale = S / 4096;
        const sx = (loc.at.x + 2048) * scale, sz = (loc.at.z + 2048) * scale;
        const span = 300 * scale;
        ctx.drawImage(src, sx - span, sz - span * 0.56, span * 2, span * 1.12, 0, 0, 480, 270);
      }
      const gr = ctx.createLinearGradient(0, 0, 0, 270);
      gr.addColorStop(0, 'rgba(10,8,4,0.1)'); gr.addColorStop(1, 'rgba(10,8,4,0.75)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 480, 270);
      ctx.font = '64px serif'; ctx.textAlign = 'center'; ctx.fillText(loc.icon, 240, 150);
      img.src = c.toDataURL('image/jpeg', 0.8);
    };
    img.onerror = () => { img.onerror = null; fallback(); };
    img.src = loc.preview || `./previews/${loc.id}.jpg`;
  }

  open(tab = 'travel') {
    const g = this.game;
    if (g.state !== 'playing' || this.busy || this.el) return;
    const el = document.createElement('div');
    el.id = 'travel';
    const season = g.season ? g.season.current : 'summer';
    el.innerHTML = `
      <div class="tv-panel">
        <header>
          <div><div class="tv-kicker">EXPEDITION ATLAS</div><div class="tv-title">Where to next?</div></div>
          <nav><button data-tab="travel">🧭 Destinations</button><button data-tab="season">🍂 Season</button></nav>
          <button class="tv-close" title="Close">✕</button>
        </header>
        <section class="tv-tab" data-tab="travel">
          <div class="tv-grid">${LOCATIONS.map((l) => `
            <article class="tv-card" data-id="${esc(l.id)}">
              <div class="tv-img"><img alt=""><div class="tv-tag">${esc(l.tag)}</div></div>
              <div class="tv-body">
                <h3><span>${l.icon}</span> ${esc(l.name)}</h3>
                <p>${esc(l.desc)}</p>
                <div class="tv-foot"><span class="tv-danger" title="Danger">${'<i class="on"></i>'.repeat(l.danger)}${'<i></i>'.repeat(3 - l.danger)}</span>
                <button class="tv-go">TELEPORT</button></div>
              </div>
            </article>`).join('')}
          </div>
        </section>
        <section class="tv-tab" data-tab="season">
          <div class="tv-seasons">${SEASONS.map((s) => `
            <article class="tv-season ${s.id === season ? 'active' : ''}" data-season="${s.id}">
              <div class="tv-sicon">${s.icon}</div><h3>${s.name}</h3><p>${s.desc}</p><button class="tv-go">${s.id === season ? 'CURRENT' : 'CHOOSE'}</button>
            </article>`).join('')}
          </div>
        </section>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    const setTab = (t) => {
      for (const s of el.querySelectorAll('.tv-tab')) s.classList.toggle('show', s.dataset.tab === t);
      for (const b of el.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.tab === t);
    };
    setTab(tab);
    for (const b of el.querySelectorAll('nav button')) b.onclick = () => setTab(b.dataset.tab);
    el.querySelector('.tv-close').onclick = () => this.close();
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });
    for (const card of el.querySelectorAll('.tv-card')) {
      const loc = LOCATIONS.find((l) => l.id === card.dataset.id);
      this._preview(loc, card.querySelector('img'));
      card.querySelector('.tv-go').onclick = (e) => { e.stopPropagation(); this.go(loc); };
    }
    for (const card of el.querySelectorAll('.tv-season')) {
      card.querySelector('.tv-go').onclick = (e) => {
        e.stopPropagation();
        if (g.season) g.season.set(card.dataset.season);
        for (const c of el.querySelectorAll('.tv-season')) { const on = c === card; c.classList.toggle('active', on); c.querySelector('.tv-go').textContent = on ? 'CURRENT' : 'CHOOSE'; }
      };
    }
    g.input.unlock();
    g.ui.modal = true;
    requestAnimationFrame(() => el.classList.add('show'));
    g.audio.play('ui');
  }

  close(relock = true) {
    const g = this.game;
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
    g.ui.modal = false;
    if (relock && !matchMedia('(pointer: coarse)').matches) g.input.lock();
  }

  async go(loc) {
    const g = this.game;
    if (this.busy) return;
    const spot = loc.find(g) || (loc.at && { x: loc.at.x, z: loc.at.z, yaw: 0, pitch: 0 });
    if (!spot) { g.ui.notify('That destination could not be reached right now.', 'warn'); return; }
    this.busy = true;
    this.close(false);
    g.ui.modal = true;
    // cinematic black-out with the destination title
    const fx = document.createElement('div');
    fx.id = 'travelFx';
    fx.innerHTML = `<div class="tf-in"><div class="tf-icon">${loc.icon}</div><div class="tf-name">${esc(loc.name.toUpperCase())}</div><div class="tf-rule"></div><div class="tf-sub">${esc(loc.tag)}</div><div class="tf-bar"><i></i></div></div>`;
    document.body.appendChild(fx);
    requestAnimationFrame(() => fx.classList.add('on'));
    g.audio.play('discover');
    await new Promise((r) => setTimeout(r, 900));

    const p = g.player;
    if (p.inVehicle) g.vehicles.exit();
    if (g.caves.active) g.caves.exit(true);
    const w = g.world;
    const y = w.getHeight(spot.x, spot.z);
    p.pos.set(spot.x, y + 0.05, spot.z);
    p.vel.set(0, 0, 0);
    p.fallStartY = p.pos.y;
    p.gliding = false; p.swimming = false; p.climbing = false;
    g.cam.yaw = spot.yaw; g.cam.pitch = spot.pitch;
    g.terrain.buildAll(spot.x, spot.z);
    // stream vegetation and wildlife around the destination while the screen is dark
    const bar = fx.querySelector('.tf-bar i');
    for (let i = 0; i < 12; i++) {
      for (let k = 0; k < 14; k++) g.veg.update(spot.x, spot.z, 0.016, g.clock.elapsed);
      bar.style.width = `${((i + 1) / 12) * 100}%`;
      await new Promise((r) => requestAnimationFrame(r));
    }
    g.cam.startArrival();
    await new Promise((r) => setTimeout(r, 250));
    fx.classList.remove('on');
    g.ui.modal = false;
    if (!matchMedia('(pointer: coarse)').matches) g.input.lock();
    setTimeout(() => fx.remove(), 1400);
    g.ui.banner(loc.name.toUpperCase(), loc.tag, 4.5);
    g.emit('teleported', { loc });
    this.busy = false;
    setTimeout(() => { if (g.player.alive) g.save(); }, 3000);
  }
}
