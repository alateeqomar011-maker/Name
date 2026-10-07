// DOM user interface: HUD, panels, map, journal.
import { ITEMS, RECIPES } from '../player/inventory.js';
import { SPECIES, SPECIES_ORDER } from '../creatures/species.js';
import { WORLD, RUINS, CAVES, VOLCANO, MIRROR_LAKE, JADE_LAKE, REGIONS } from '../world/design.js';

const $ = (id) => document.getElementById(id);

export const PLACES = [
  { id: 'grass', name: REGIONS.grass, desc: 'Rolling meadows of wildflowers where the great herds graze.' },
  { id: 'jungle', name: REGIONS.jungle, desc: 'A humid maze of giant trees, tree ferns and hanging vines. Raptors hunt here.' },
  { id: 'mountain', name: REGIONS.mountain, desc: 'Snow-capped peaks above the clouds. Bring climbing picks and fire.' },
  { id: 'forest', name: REGIONS.forest, desc: 'Cold conifer forests on the shoulders of the mountains.' },
  { id: 'volcano', name: REGIONS.volcano, desc: 'An active volcano. Its eruptions rain molten rock across the eastern slopes.' },
  { id: 'canyon', name: REGIONS.canyon, desc: 'Layer upon layer of red stone cut by an ancient river.' },
  { id: 'islands', name: REGIONS.islands, desc: 'Palm-fringed islands in turquoise lagoons.' },
  { id: 'mirror', name: REGIONS.mirror, desc: 'A still highland lake that reflects the peaks.' },
  { id: 'falls', name: REGIONS.falls, desc: 'Where Mirror Lake spills off the plateau in a single, thundering ribbon.' },
  { id: 'jade', name: REGIONS.jade, desc: 'A quiet lowland lake ringed with reeds and grazing trails.' },
  { id: 'beach', name: REGIONS.beach, desc: 'Warm sand beaches along the southern shore.' },
  { id: 'river', name: REGIONS.river, desc: 'The river that carries Mirror Lake to the sea.' },
  { id: 'ocean', name: REGIONS.ocean, desc: 'Deep blue water. Something enormous lives out there.' },
];

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.toastsEl = $('toasts');
    this.lastRegion = '';
    this.regionTimer = 0;
    this.panel = null;
    this.vitals = {};
    document.querySelectorAll('.vital').forEach((v) => { this.vitals[v.dataset.k] = { el: v, bar: v.querySelector('.bar div') }; });
    this._buildCompass();
    this._buildHotbar();
    this.mapReveal = new Uint8Array(64 * 64);
    this.journalTab = 'creatures';
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closePanel()));
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      this.journalTab = b.dataset.tab;
      this.renderJournal();
    }));
    game.inventory.onChange(() => { this.renderHotbar(); if (this.panel === 'inventory') this.renderInventory(); });
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  // ---------------- compass
  _buildCompass() {
    const strip = $('compass-strip');
    this.compassStrip = strip;
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = '';
    for (let d = -360; d <= 720; d += 15) {
      const deg = ((d % 360) + 360) % 360;
      const x = d * 3;
      if (labels[deg] !== undefined) html += `<span class="card" style="left:${x}px">${labels[deg]}</span>`;
      else html += `<span class="tick" style="left:${x}px">|</span>`;
    }
    strip.innerHTML = html;
    this.poiEls = [];
  }

  _updateCompass() {
    const P = this.game.player;
    const heading = ((-P.yaw * 180) / Math.PI + 360) % 360; // yaw 0 = north (-z)
    const w = $('compass').clientWidth;
    this.compassStrip.style.transform = `translateX(${w / 2 - heading * 3}px)`;
    // POI markers (discovered places with artifacts / caves / altar)
    const pois = this.game.compassPois ? this.game.compassPois() : [];
    while (this.poiEls.length < pois.length) {
      const s = document.createElement('span');
      s.className = 'poi';
      $('compass').appendChild(s);
      this.poiEls.push(s);
    }
    this.poiEls.forEach((el, i) => {
      const p = pois[i];
      if (!p) { el.style.display = 'none'; return; }
      const ang = ((Math.atan2(p.x - P.pos.x, -(p.z - P.pos.z)) * 180) / Math.PI + 360) % 360;
      let rel = ang - heading;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      el.style.display = Math.abs(rel) < 85 ? 'block' : 'none';
      el.style.position = 'absolute';
      el.style.top = '2px';
      el.style.left = `${w / 2 + rel * 3}px`;
      el.style.transform = 'translateX(-50%)';
      el.style.color = p.color || '#e0b25c';
      el.style.fontSize = '13px';
      el.textContent = p.icon || '◆';
      el.title = p.name;
    });
  }

  // ---------------- hotbar
  _buildHotbar() {
    const hb = $('hotbar');
    hb.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="k">${i + 1}</span><span class="ic"></span><span class="n"></span><div class="dur hidden"><div></div></div>`;
      hb.appendChild(s);
      this.slots.push(s);
    }
    this.renderHotbar();
  }
  renderHotbar() {
    const inv = this.game.inventory;
    this.slots.forEach((s, i) => {
      const id = inv.hotbar[i];
      s.classList.toggle('sel', i === inv.sel);
      s.querySelector('.ic').textContent = id ? ITEMS[id].icon : '';
      const n = id ? inv.count(id) : 0;
      s.querySelector('.n').textContent = id && n > 1 ? n : '';
      const it = id && ITEMS[id];
      const dur = s.querySelector('.dur');
      if (it && it.durability && it.durability < 9999) {
        dur.classList.remove('hidden');
        dur.firstChild.style.width = `${Math.max(0, (inv.durability[id] || it.durability) / it.durability) * 100}%`;
      } else dur.classList.add('hidden');
      s.title = id ? ITEMS[id].name : '';
    });
  }

  // ---------------- per-frame
  update(dt) {
    const g = this.game;
    const P = g.player;
    for (const k of ['health', 'stamina', 'hunger', 'thirst', 'warmth', 'oxygen']) {
      const v = Math.max(0, Math.min(100, P[k]));
      const o = this.vitals[k];
      o.bar.style.width = `${v}%`;
      o.el.classList.toggle('low', v < 22);
    }
    this.vitals.oxygen.el.style.opacity = P.oxygen < 99.5 ? 1 : 0;
    this.vitals.warmth.el.style.opacity = P.warmth < 99.5 || (g.coldness || 0) > 0 ? 1 : 0;
    this._updateCompass();
    // clock
    const h = g.sky.timeOfDay;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    $('clock-time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('clock-weather').textContent = g.weatherSys ? g.weatherSys.name : '';
    $('clock-day').textContent = `Day ${g.day}`;
    // region title
    this.regionTimer -= dt;
    if (this.regionTimer <= 0) {
      this.regionTimer = 1;
      let name = g.world.regionName(P.pos.x, P.pos.z);
      if (P.inCave) name = P.inCave.name;
      if (name !== this.lastRegion) {
        this.lastRegion = name;
        this.region(name, P.inCave ? 'Hidden cave' : '');
        g.discoverPlace && g.discoverPlace(name);
      }
      // map fog of war
      const mx = Math.floor(((P.pos.x + WORLD.HALF) / WORLD.SIZE) * 64), mz = Math.floor(((P.pos.z + WORLD.HALF) / WORLD.SIZE) * 64);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const x = mx + dx, z = mz + dz;
        if (x >= 0 && z >= 0 && x < 64 && z < 64 && dx * dx + dz * dz <= 5) this.mapReveal[z * 64 + x] = 1;
      }
    }
    // status line
    let st = '';
    if (P.mode === 'climb') st = 'Climbing — W/S up/down · Space to leap off';
    else if (P.noClimbHint > 0) st = 'Too icy to climb without climbing picks';
    else if (P.mode === 'swim' && P.headUnder) st = 'Underwater';
    else if ((g.coldness || 0) > 0.2 && !g.nearHeat) st = 'Freezing — find fire or shelter';
    else if (g.nearHeat && (g.coldness || 0) > 0.1) st = 'Warming by the fire';
    $('status').textContent = st;
    if (g.settings.showFps && g.fps) {
      const info = g.renderer.info.render;
      $('fps').textContent = `${g.fps.toFixed(0)} fps · ${(g.renderScale * 100).toFixed(0)}% res\n${info.calls} draws · ${(info.triangles / 1e6).toFixed(2)}M tris`;
    } else $('fps').textContent = '';
  }

  prompt(text, progress = null) {
    const p = $('prompt');
    if (text) { p.innerHTML = text; p.classList.add('show'); } else p.classList.remove('show');
    $('crosshair').classList.toggle('target', !!text);
    const ring = $('progress-ring');
    if (progress !== null && progress > 0) {
      ring.classList.add('show');
      $('progress-arc').style.strokeDashoffset = `${94.25 * (1 - progress)}`;
    } else ring.classList.remove('show');
  }

  hitmarker() {
    const h = $('hitmarker');
    h.classList.add('show');
    clearTimeout(this._hm);
    this._hm = setTimeout(() => h.classList.remove('show'), 160);
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = text;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 6) this.toastsEl.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, kind === 'big' ? 6000 : 3800);
  }

  region(name, sub) {
    const r = $('region-title');
    r.querySelector('.rt-main').textContent = name;
    r.querySelector('.rt-sub').textContent = sub || '';
    r.classList.add('show');
    clearTimeout(this._rt);
    this._rt = setTimeout(() => r.classList.remove('show'), 3800);
  }

  // ---------------- panels
  openPanel(name) {
    if (this.panel === name) { this.closePanel(); return; }
    this.closePanel(true);
    this.panel = name;
    $('panel-' + name).classList.remove('hidden');
    this.game.uiOpen = true;
    this.game.input.unlock();
    if (name === 'inventory') this.renderInventory();
    if (name === 'map') this.renderMap();
    if (name === 'journal') this.renderJournal();
    this.game.audio && this.game.audio.ui();
  }
  closePanel(silent) {
    if (!this.panel) return;
    $('panel-' + this.panel).classList.add('hidden');
    this.panel = null;
    this.game.uiOpen = false;
    if (!silent && !this.game.paused) this.game.input.lock();
  }

  renderInventory() {
    const g = this.game;
    const inv = g.inventory;
    const grid = $('inv-grid');
    grid.innerHTML = '';
    const ids = Object.keys(inv.items).filter((k) => inv.items[k] > 0);
    if (!ids.length) grid.innerHTML = '<div style="color:#8a8170;font-size:13px">Empty. Press E near plants, stones and trees to gather.</div>';
    for (const id of ids) {
      const it = ITEMS[id];
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="ic">${it.icon}</span><span class="n">${inv.items[id]}</span>`;
      s.title = it.name;
      s.addEventListener('mouseenter', () => { $('inv-detail').innerHTML = `<b style="color:#ece6d6">${it.name}</b><br>${it.desc}`; });
      s.addEventListener('click', () => {
        inv.hotbar[inv.sel] = id;
        // avoid duplicates
        inv.hotbar = inv.hotbar.map((h, i) => (h === id && i !== inv.sel ? null : h));
        inv._emit();
        g.audio && g.audio.ui();
      });
      s.addEventListener('contextmenu', (e) => { e.preventDefault(); g.useConsumable(id); });
      grid.appendChild(s);
    }
    const list = $('craft-list');
    list.innerHTML = '';
    for (const r of RECIPES) {
      const it = ITEMS[r.out];
      const can = inv.canCraft(r);
      const req = Object.entries(r.req).map(([k, v]) => `<span class="${inv.count(k) >= v ? '' : 'miss'}">${ITEMS[k].icon} ${inv.count(k)}/${v}</span>`).join(' · ');
      const row = document.createElement('div');
      row.className = 'recipe' + (can ? '' : ' locked');
      row.innerHTML = `<div class="ic">${it.icon}</div><div><div class="nm">${it.name}${r.n > 1 ? ' ×' + r.n : ''}</div><div class="req">${req}</div></div><button ${can ? '' : 'disabled'}>Craft</button>`;
      row.querySelector('button').addEventListener('click', () => {
        if (inv.craft(r)) {
          g.audio && g.audio.craft();
          this.toast(`Crafted ${it.icon} ${it.name}`, 'good');
          g.save && g.save();
        }
      });
      list.appendChild(row);
    }
  }

  _mapBase() {
    if (this._mapImg) return this._mapImg;
    const w = this.game.world;
    const N = 900;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    const m = {};
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -WORLD.HALF + ((i + 0.5) / N) * WORLD.SIZE, z = -WORLD.HALF + ((j + 0.5) / N) * WORLD.SIZE;
        const h = w.height(x, z);
        const wl = w.waterLevel(x, z);
        const hx = w.height(x + 9, z) - w.height(x - 9, z), hz = w.height(x, z + 9) - w.height(x, z - 9);
        const shade = Math.max(0.35, Math.min(1.3, 0.85 + (-hx * 0.6 - hz * 0.8) / 18));
        let r, g, b;
        if (h < wl - 0.2) {
          const d = Math.min(1, (wl - h) / 60);
          r = 40 - d * 25; g = 110 - d * 50; b = 140 - d * 40;
        } else {
          w.mask(x, z, m);
          if (h > w.snowLine(x, z)) { r = 225; g = 228; b = 232; }
          else if (m.volc > 0.55) { r = 60; g = 52; b = 48; }
          else if (m.canyon > 0.45) { r = 170; g = 95; b = 60; }
          else if (h < 3) { r = 214; g = 196; b = 150; }
          else if (h > 300) { r = 92; g = 104; b = 80; }
          else if (m.moist > 0.66) { r = 40; g = 90; b = 40; }
          else { r = 105; g = 140; b = 60; }
          r *= shade; g *= shade; b *= shade;
        }
        const k = (j * N + i) * 4;
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this._mapImg = c;
    return c;
  }

  renderMap() {
    const g = this.game;
    const cv = $('map-canvas');
    const ctx = cv.getContext('2d');
    const N = cv.width;
    ctx.drawImage(this._mapBase(), 0, 0, N, N);
    // fog of war
    ctx.fillStyle = 'rgba(12,14,16,0.86)';
    const cell = N / 64;
    for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) if (!this.mapReveal[z * 64 + x]) ctx.fillRect(x * cell - 0.5, z * cell - 0.5, cell + 1, cell + 1);
    const toMap = (x, z) => [((x + WORLD.HALF) / WORLD.SIZE) * N, ((z + WORLD.HALF) / WORLD.SIZE) * N];
    const revealed = (x, z) => {
      const i = Math.floor(((x + WORLD.HALF) / WORLD.SIZE) * 64), j = Math.floor(((z + WORLD.HALF) / WORLD.SIZE) * 64);
      return this.mapReveal[j * 64 + i];
    };
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    const label = (x, z, text, color = '#f3e6c4') => {
      const [mx, mz] = toMap(x, z);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(text, mx + 1, mz + 1);
      ctx.fillStyle = color;
      ctx.fillText(text, mx, mz);
    };
    const named = [
      [VOLCANO.x, VOLCANO.z, 'Mount Ignis'], [MIRROR_LAKE.x, MIRROR_LAKE.z, 'Mirror Lake'], [JADE_LAKE.x, JADE_LAKE.z, 'Jade Lake'],
      [-500, -2700, 'Frostfang Peaks'], [1750, 1500, 'Emerald Jungle'], [-2100, 1100, 'Crimson Canyon'], [2600, 3300, 'Azure Isles'], [0, 300, 'Sunplain'],
    ];
    for (const [x, z, n] of named) if (revealed(x, z)) label(x, z, n);
    for (const pad of g.world.pads) {
      if (!g.journal.places.has(pad.name)) continue;
      const [mx, mz] = toMap(pad.x, pad.z);
      ctx.fillStyle = '#e0b25c';
      ctx.beginPath(); ctx.arc(mx, mz, 4, 0, Math.PI * 2); ctx.fill();
      label(pad.x, pad.z - 70, pad.name, '#e0b25c');
    }
    for (const c of g.features.caves.list) {
      if (!g.journal.places.has(c.name)) continue;
      const [mx, mz] = toMap(c.mouth.x, c.mouth.z);
      ctx.fillStyle = '#8fd8ff';
      ctx.beginPath(); ctx.arc(mx, mz, 4, 0, Math.PI * 2); ctx.fill();
      label(c.mouth.x, c.mouth.z - 70, c.name, '#8fd8ff');
    }
    for (const p of g.building.pieces) {
      if (p.type !== 'campfire' && p.type !== 'shelter') continue;
      const [mx, mz] = toMap(p.x, p.z);
      ctx.fillStyle = '#ff9a48';
      ctx.fillRect(mx - 3, mz - 3, 6, 6);
    }
    // player arrow
    const P = g.player;
    const [px, pz] = toMap(P.pos.x, P.pos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-P.yaw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
    const j = g.journal;
    $('map-legend').innerHTML = `
      <div><b>Explored</b> ${Math.round((this.mapReveal.reduce((a, b) => a + b, 0) / 4096) * 100)}%</div>
      <div><span style="color:#e0b25c">●</span> Ruins discovered: ${g.world.pads.filter((p) => j.places.has(p.name)).length}/${RUINS.length}</div>
      <div><span style="color:#8fd8ff">●</span> Caves found: ${g.features.caves.list.filter((c) => j.places.has(c.name)).length}/${CAVES.length}</div>
      <div><span style="color:#ff9a48">■</span> Your camps</div>
      <div><b>Tablets</b> ${j.tablets.size}/4 ${j.altarDone ? '· Sun Gate awakened' : ''}</div>
      <div style="margin-top:8px">Position ${P.pos.x.toFixed(0)}, ${P.pos.z.toFixed(0)} · altitude ${P.pos.y.toFixed(0)} m</div>`;
  }

  renderJournal() {
    const g = this.game;
    const j = g.journal;
    const body = $('journal-body');
    let html = '';
    if (this.journalTab === 'creatures') {
      for (const id of SPECIES_ORDER) {
        const s = SPECIES[id];
        const known = j.creatures.has(id);
        html += `<div class="jentry ${known ? '' : 'unknown'}"><div class="ic">${known ? s.icon : '?'}</div><div><h4>${known ? s.name : 'Undiscovered species'}</h4><p>${known ? s.journal + `<br><i>Length ≈ ${s.length} m · ${s.diet}</i>` : 'Observe a creature up close to record it.'}</p></div></div>`;
      }
    } else if (this.journalTab === 'places') {
      for (const p of PLACES) {
        const known = j.places.has(p.name);
        html += `<div class="jentry ${known ? '' : 'unknown'}"><div class="ic">${known ? '🗺️' : '?'}</div><div><h4>${known ? p.name : 'Unexplored'}</h4><p>${known ? p.desc : '—'}</p></div></div>`;
      }
      for (const r of RUINS) {
        const known = j.places.has(r.name);
        html += `<div class="jentry ${known ? '' : 'unknown'}"><div class="ic">${known ? '🏛️' : '?'}</div><div><h4>${known ? r.name : 'Unknown ruin'}</h4><p>${known ? (r.artifact ? 'An ancient site. Something glows within.' : 'A structure left by forgotten builders.') : '—'}</p></div></div>`;
      }
    } else {
      const tabs = { sun: 'Sun Tablet', canyon: 'Earth Tablet', frost: 'Frost Tablet', tide: 'Tide Tablet' };
      html += `<div class="jentry"><div class="ic">🗿</div><div><h4>The Four Tablets</h4><p>Legends speak of four glowing tablets hidden in the oldest ruins — in the jungle temple, beside the red canyon, among the frozen peaks and on an island of standing stones. Returned to the great henge on the Sunplain, they are said to wake something.<br><br>${Object.entries(tabs).map(([k, v]) => (j.tablets.has(k) ? `✅ ${v}` : `▫️ ${v}`)).join('<br>')}${j.altarDone ? '<br><br><b>The Sun Gate is awake.</b>' : ''}</p></div></div>`;
      html += `<div class="jentry ${j.fossils ? '' : 'unknown'}"><div class="ic">🐚</div><div><h4>Fossils · ${j.fossils}/5</h4><p>Remnants of creatures older still, hidden in caves and drowned ruins.</p></div></div>`;
      html += `<div class="jentry ${j.paintings.size ? '' : 'unknown'}"><div class="ic">🖐️</div><div><h4>Cave paintings · ${j.paintings.size}/${CAVES.length}</h4><p>${j.paintings.size ? 'Ochre hunters and long-necked giants painted by firelight. Someone lived here before you.' : 'Find the hidden caves.'}</p></div></div>`;
    }
    body.innerHTML = html;
  }
}
