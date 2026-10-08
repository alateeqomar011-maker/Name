// HUD and menus: vitals, compass, minimap, notifications, radio, prompts, viewfinder, build bar,
// inventory & crafting, skills, field journal, missions, world map and settings.
import { ITEMS, GEAR, RECIPES, STRUCTURES, SKILLS, SKILL_MAX, TITLES } from '../systems/data.js';
import { SPECIES, SPECIES_LIST, BEHAVIORS } from '../dinos/species.js';
import { MISSIONS } from '../systems/missions.js';
import { POI_TYPES } from '../world/pois.js';
import { EVENT_INFO } from '../systems/events.js';
import { HALF, WORLD_SIZE, BIOME_NAMES } from '../world/worldgen.js';
import { FOG_N } from '../systems/journal.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bearing = (dx, dz) => Math.atan2(dx, -dz);

export class UI {
  constructor(game) {
    this.game = game;
    this.menuOpen = false;
    this.tab = 'inventory';
    this.root = document.getElementById('hud');
    this.root.innerHTML = `
      <div id="underwater"></div>
      <div id="vignette"></div>
      <div id="binoc" class="hidden"></div>
      <div class="topleft"><div class="clock" id="clock">07:30</div><div class="sub" id="dayline">Day 1</div><div class="region" id="region"></div></div>
      <div id="compass"><div class="strip" id="cstrip"></div><div class="center"></div></div>
      <div id="minimap"><canvas id="mm" width="190" height="190"></canvas></div>
      <div class="mmlabel" id="mmlabel"></div>
      <div id="tracker" class="hidden"></div>
      <div id="toasts"></div>
      <div id="pickups"></div>
      <div id="crosshair"></div>
      <div id="prompt"></div>
      <div id="banner"><div class="t"></div><div class="rule"></div><div class="s"></div></div>
      <div id="eventBanner"></div>
      <div id="regionname"></div>
      <div id="radio"><div class="av">📻</div><div class="who"></div><div class="tx"></div></div>
      <div id="xppop"></div>
      <div id="viewfinder" class="hidden"><div class="thirds"></div><div class="frame"><div class="c tl"></div><div class="c tr"></div><div class="c bl"></div><div class="c br"></div></div><div class="focus"></div><div class="info"><span class="rec">● REC</span><span id="vfz">1.0x</span><span id="vfs"></span></div></div>
      <div id="flash"></div>
      <div id="buildinfo" class="hidden"></div>
      <div id="buildbar" class="hidden"></div>
      <div class="vitals">
        <div class="status" id="status"></div>
        ${['hp:❤️:var(--hp)', 'st:⚡:var(--st)', 'hu:🍖:var(--hu)', 'th:💧:var(--th)', 'ox:🫧:#9fe8ff'].map((s) => { const [k, i, c] = s.split(':'); return `<div class="vital" id="v-${k}"><span class="ic">${i}</span><div class="track"><div class="fill" style="background:${c}"></div></div></div>`; }).join('')}
      </div>
      <div class="bottom">
        <div class="hotbar" id="hotbar"></div>
        <div class="xp"><div class="row"><span><b id="lvl">LV 1</b> &nbsp;<span id="ttl"></span></span><span id="xptxt"></span></div><div class="track"><div class="fill" id="xpfill"></div></div></div>
      </div>
      <div id="photoResult" class="hidden"></div>
      <div id="lockhint" class="hidden">Mouse free — use the joystick, or click the game to look around · Esc: menu</div>`;
    this.mm = $('#mm').getContext('2d');
    this.toasts = $('#toasts');
    this._bannerT = 0;
    this._radioT = 0;
    this._regionT = 0;
    this.menu = document.getElementById('menu');
    this.menu.addEventListener('click', (e) => this._menuClick(e));
    this.mapState = { zoom: 1, cx: 0, cz: 0, drag: null };
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.fogCanvas.height = FOG_N;
    this.invFilter = 'All';
    this.selSpecies = null;
    this.jtab = 'species';
  }

  // ---------------- Notifications ----------------
  notify(text, kind = 'info', dur = 4) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 6) this.toasts.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, dur * 1000);
  }
  pickup(text) {
    const box = $('#pickups');
    const el = document.createElement('div');
    el.className = 'pick';
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => el.remove(), 2600);
  }
  xpPopup(n, reason) {
    const el = document.createElement('div');
    el.className = 'xpp';
    el.textContent = `+${n} XP${reason ? ' · ' + reason : ''}`;
    $('#xppop').appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
  banner(title, sub, dur = 4) {
    const b = $('#banner');
    $('.t', b).textContent = title;
    $('.s', b).textContent = sub;
    b.classList.add('show');
    this._bannerT = dur;
  }
  eventBanner(info) {
    const b = $('#eventBanner');
    b.textContent = `${info.icon}  ${info.name.toUpperCase()}`;
    b.classList.add('show');
    clearTimeout(this._evT);
    this._evT = setTimeout(() => b.classList.remove('show'), 7000);
  }
  regionLabel(name) {
    const r = $('#regionname');
    r.textContent = name.toUpperCase();
    r.classList.add('show');
    this._regionT = 4;
    $('#region').textContent = name;
  }
  radio(who, text) {
    const r = $('#radio');
    $('.who', r).textContent = who;
    $('.tx', r).textContent = text;
    r.classList.add('show');
    this._radioT = Math.max(6, text.length / 14);
    this.game.audio.play('radio');
  }
  lore(title, text) {
    const el = document.createElement('div');
    el.id = 'lorebox';
    el.innerHTML = `<div class="card"><h2>${esc(title)}</h2><div>${esc(text)}</div><div style="text-align:right;margin-top:16px"><button class="btn small">Continue</button></div></div>`;
    document.body.appendChild(el);
    this.game.input.unlock();
    this.modal = true;
    $('button', el).onclick = () => { el.remove(); this.modal = false; this.game.input.lock(); };
  }
  missionProgress(m, p, total) {
    if (m.id === this.game.missions.tracked) this.pickup(`${m.title}: ${Math.min(p, total)}/${total}`);
  }
  hurt(k, from) {
    const v = $('#vignette');
    v.style.opacity = Math.min(1, 0.4 + k);
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => (v.style.opacity = 0), 220);
  }
  fade(cb) {
    const f = document.getElementById('fade');
    f.classList.add('on');
    setTimeout(() => { cb(); setTimeout(() => f.classList.remove('on'), 150); }, 650);
  }
  death(cause) {
    const el = document.createElement('div');
    el.id = 'death';
    el.innerHTML = `<h1>YOU DIED</h1><p>${esc(cause)}</p><button class="btn">Get Rescued</button>`;
    document.body.appendChild(el);
    this.game.input.unlock();
    $('button', el).onclick = () => { el.remove(); this.game.player.doRespawn(); this.game.input.lock(); };
  }
  finale() {
    const g = this.game;
    const el = document.createElement('div');
    el.id = 'finale';
    el.innerHTML = `<div style="font-size:60px">🦖</div><h1>EXPEDITION COMPLETE</h1>
      <p>You uncovered the secret of Isla Sombra: an ancient civilisation that came to study the giants — and learned they were only ever guests. Dr. Vargas’ team will continue the research, but the frontier is yours to roam.</p>
      <p style="color:var(--gold2)">Level ${g.progress.level} · ${g.progress.title} · ${g.journal.speciesCount}/19 species · ${Math.floor(g.journal.mapPercent)}% mapped</p>
      <p style="color:var(--muted)">The world keeps living: keep exploring, photographing, building and surviving. Reach level 30 to become an Expert Dinosaur Survivor.</p>
      <button class="btn">Continue Exploring</button>`;
    document.body.appendChild(el);
    g.input.unlock();
    $('button', el).onclick = () => { el.remove(); g.input.lock(); };
  }

  // ---------------- Prompt ----------------
  prompt(cur, veh, hold, holdTarget) {
    const el = $('#prompt');
    if (this.menuOpen) { el.innerHTML = ''; return; }
    let h = '';
    if (cur) {
      const key = cur.key || 'E';
      h += `<div class="line ${cur.disabled ? 'dis' : ''}"><span class="key">${cur.hold ? 'Hold ' + key : key}</span>${esc(cur.label)}</div>`;
      if (cur.hold && holdTarget === cur.label && hold > 0) h += `<div class="hold"><div style="width:${Math.min(100, (hold / cur.hold) * 100)}%"></div></div>`;
      if (cur.structure) {
        const s = cur.structure;
        const def = STRUCTURES[s.type];
        if (def.tiers && s.tier < def.tiers.length) {
          const nx = def.tiers[s.tier];
          h += `<div class="line"><span class="key">U</span>Upgrade to ${esc(nx.name)} (${this._costStr(nx.cost)})</div>`;
        }
        h += `<div class="line dis"><span class="key">X</span>Dismantle</div>`;
      }
    }
    if (veh && veh !== cur) h += `<div class="line"><span class="key">F</span>${esc(veh.label)}</div>`;
    el.innerHTML = h;
  }
  _costStr(cost) { return Object.entries(cost).map(([k, n]) => `${n} ${ITEMS[k] ? ITEMS[k].name : k}`).join(', '); }

  // ---------------- Camera UI ----------------
  viewfinder(on) {
    $('#viewfinder').classList.toggle('hidden', !on);
    $('#crosshair').classList.toggle('hidden', on);
    for (const s of ['.vitals', '.bottom', '#minimap', '#compass', '#tracker', '.mmlabel']) { const e = $(s, this.root); if (e) e.style.visibility = on ? 'hidden' : ''; }
  }
  viewfinderInfo(zoom, best) {
    $('#vfz').textContent = zoom.toFixed(1) + 'x';
    $('#vfs').innerHTML = best ? `${esc(best.species.short)} · ${esc(BEHAVIORS[best.behavior] || best.behavior)} · <span class="stars">${'★'.repeat(best.stars)}${'☆'.repeat(5 - best.stars)}</span>` : 'No subject';
  }
  shutterFlash() {
    const f = $('#flash');
    f.style.transition = 'none'; f.style.opacity = 0.85;
    requestAnimationFrame(() => { f.style.transition = 'opacity .4s'; f.style.opacity = 0; });
  }
  photoResult(photo, res) {
    const el = $('#photoResult');
    el.classList.remove('hidden');
    el.innerHTML = `<img src="${photo.img}"><div class="cap">${esc(photo.title)} <span class="stars" style="float:right">${'★'.repeat(photo.stars)}</span></div>`;
    clearTimeout(this._prT);
    this._prT = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  // ---------------- Build bar ----------------
  buildBar(on) {
    const bb = $('#buildbar');
    bb.classList.toggle('hidden', !on);
    $('#buildinfo').classList.toggle('hidden', !on);
    if (!on) return;
    const B = this.game.build;
    const lvl = this.game.progress.level;
    // show a window of types around the selection
    const types = B.types;
    const n = Math.min(types.length, 11);
    const start = Math.max(0, Math.min(types.length - n, B.sel - 5));
    bb.innerHTML = types.slice(start, start + n).map((t, i) => {
      const d = STRUCTURES[t];
      return `<div class="b ${start + i === B.sel ? 'sel' : ''} ${d.level > lvl ? 'lock' : ''}">${d.icon}<small>${esc(d.name)}</small></div>`;
    }).join('');
  }
  _buildInfo() {
    const B = this.game.build;
    if (!B.active) return;
    const t = B.types[B.sel];
    const d = STRUCTURES[t];
    const inv = this.game.inventory;
    const cost = Object.entries(d.cost).map(([k, n]) => `<span style="color:${inv.count(k) + (inv.nearStorage() ? inv.storage[k] || 0 : 0) >= n ? 'var(--ink)' : 'var(--bad)'}">${ITEMS[k].icon} ${n}</span>`).join(' &nbsp;');
    $('#buildinfo').innerHTML = `<div class="n">${d.icon} ${esc(d.name)}</div><div style="color:var(--muted);font-size:12px">${esc(d.desc)}</div><div style="margin-top:4px">${cost}</div><div style="font-size:11px;color:var(--muted);margin-top:3px">Structures: ${B.list.length}/${B.maxStructures}</div>${B.error ? `<div class="err">${esc(B.error)}</div>` : ''}`;
  }

  // ---------------- Per-frame HUD ----------------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) $('#banner').classList.remove('show'); }
    if (this._radioT > 0) { this._radioT -= dt; if (this._radioT <= 0) $('#radio').classList.remove('show'); }
    if (this._regionT > 0) { this._regionT -= dt; if (this._regionT <= 0) $('#regionname').classList.remove('show'); }
    this._slow = (this._slow || 0) - dt;
    // vitals
    const setV = (k, v, max = 100, show = true) => {
      const el = $('#v-' + k);
      el.style.display = show ? '' : 'none';
      $('.fill', el).style.width = Math.max(0, (v / max) * 100) + '%';
      el.classList.toggle('low', v / max < 0.2);
    };
    setV('hp', p.health, p.maxHealth);
    setV('st', p.stamina, p.maxStamina);
    setV('hu', p.hunger);
    setV('th', p.thirst);
    setV('ox', p.oxygen, 100, p.oxygen < 99.5);
    $('#underwater').style.opacity = g.cam.underwater ? 1 : 0;
    $('#binoc').classList.toggle('hidden', !g.cam.binoculars || p.photoMode);
    if (this._slow <= 0) {
      this._slow = 0.25;
      $('#clock').textContent = g.clock.label;
      $('#dayline').textContent = `Day ${g.clock.day} · ${g.weather.icon} ${g.weather.name}`;
      const chips = [];
      if (p.crouch) chips.push(['🥷 Crouching', '']);
      if (p.inBlind) chips.push(['🌾 Hidden', '']);
      if (p.inBase) chips.push(['🏕️ Safe at base', '']);
      if (p.cold > 1) chips.push([`🥶 Freezing ${Math.round(p.cold)}%`, p.cold > 70 ? 'bad' : 'warn']);
      if (p.heat > 1) chips.push([`🥵 Overheating ${Math.round(p.heat)}%`, p.heat > 70 ? 'bad' : 'warn']);
      if (p.headlamp) chips.push(['🔦', '']);
      const hunters = g.dinos.active.filter((d) => d.state === 'hunt' && d.prey === 'player').length;
      if (hunters) chips.push([`⚠️ Hunted (${hunters})`, 'bad']);
      if (p.inVehicle && p.inVehicle.type !== 'boat') chips.push([`⛽ ${Math.round(p.inVehicle.fuel)}%`, p.inVehicle.fuel < 20 ? 'warn' : '']);
      if (p.inVehicle) chips.push([`${Math.round(Math.abs(p.inVehicle.speed) * 3.6)} km/h`, '']);
      for (const e of g.events.active) chips.push([`${EVENT_INFO[e.type].icon} ${EVENT_INFO[e.type].name}`, 'warn']);
      $('#status').innerHTML = chips.map(([t, c]) => `<span class="chip ${c}">${t}</span>`).join('');
      // hotbar
      const inv = g.inventory;
      $('#hotbar').innerHTML = inv.hotbar.map((id, i) => {
        const it = ITEMS[id];
        const n = id === 'dart' ? (inv.gear.has('dart_rifle') ? inv.count('dart') : '—') : inv.count(id);
        return `<div class="slot ${i === inv.selected ? 'sel' : ''}"><span class="k">${i + 1}</span>${it ? it.icon : ''}<span class="n">${n}</span></div>`;
      }).join('');
      // xp
      const P = g.progress;
      $('#lvl').textContent = 'LV ' + P.level;
      $('#ttl').textContent = P.title + (P.points ? `  ·  ${P.points} skill pt${P.points > 1 ? 's' : ''} (K)` : '');
      const span = P.nextXP - P.curXP;
      $('#xptxt').textContent = isFinite(span) ? `${P.xp - P.curXP} / ${span} XP` : 'MAX';
      $('#xpfill').style.width = isFinite(span) ? ((P.xp - P.curXP) / span) * 100 + '%' : '100%';
      this._tracker();
      this._buildInfo();
      if (g.build.active) this.buildBar(true);
    }
    this._compass();
    this._minimap();
  }

  _tracker() {
    const g = this.game;
    const M = g.missions;
    const m = M.byId[M.tracked];
    const el = $('#tracker');
    if (!m || M.state[m.id].done) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const st = M.state[m.id];
    const mk = M.marker();
    const P = g.player.pos;
    const dist = mk ? Math.hypot(mk.x - P.x, mk.z - P.z) : null;
    el.innerHTML = `<div class="t">${m.main ? '★ ' : ''}${esc(m.title)}</div><div class="d">${esc(m.desc)}</div>${m.goal.count > 1 ? `<div class="p"><div style="width:${(Math.min(st.progress, m.goal.count) / m.goal.count) * 100}%"></div></div><div class="dist">${Math.min(st.progress, m.goal.count)} / ${m.goal.count}</div>` : ''}${dist !== null ? `<div class="dist">◆ ${esc(mk.label || '')} — ${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}</div>` : ''}`;
  }

  _markers() {
    // world markers for compass & minimap
    const g = this.game;
    const out = [];
    const mk = g.missions.marker();
    if (mk) out.push({ x: mk.x, z: mk.z, icon: '◆', label: mk.label, color: '#e8c46a', main: true });
    if (g.journal.waypoint) out.push({ x: g.journal.waypoint.x, z: g.journal.waypoint.z, icon: '📍', label: 'Waypoint' });
    const th = g.journal.trackedHerd;
    if (th && th.count > 0) out.push({ x: th.x, z: th.z, icon: '🐾', label: th.spec.short });
    if (g.tracking) out.push({ x: g.tracking.x, z: g.tracking.z, icon: '📡', label: g.tracking.label });
    const c = g.pois.camp;
    out.push({ x: c.x, z: c.z, icon: '⛺', label: 'Camp' });
    for (const e of g.events.active) if (e.x !== undefined) out.push({ x: e.x, z: e.z, icon: EVENT_INFO[e.type].icon, label: '' });
    return out;
  }

  _compass() {
    const g = this.game;
    const W = $('#compass').clientWidth;
    const fwd = g.cam.forward(this._f || (this._f = new (g.THREE.Vector3)()));
    const head = bearing(fwd.x, fwd.z);
    const pxPerRad = W / Math.PI;
    let h = '';
    const card = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      let d = a - head;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > Math.PI / 2) continue;
      const isCard = i % 3 === 0;
      h += `<div class="tick ${isCard ? 'card' : ''}" style="left:${W / 2 + d * pxPerRad}px">${isCard ? card[i / 3] : '·'}</div>`;
    }
    const P = g.player.pos;
    for (const m of this._markers()) {
      let d = bearing(m.x - P.x, m.z - P.z) - head;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > Math.PI / 2) continue;
      const dist = Math.hypot(m.x - P.x, m.z - P.z);
      h += `<div class="mk" style="left:${W / 2 + d * pxPerRad}px;color:${m.color || '#fff'}">${m.icon}${m.main ? `<small>${dist > 1000 ? (dist / 1000).toFixed(1) + 'km' : Math.round(dist) + 'm'}</small>` : ''}</div>`;
    }
    $('#cstrip').innerHTML = h;
  }

  _updateFog() {
    const J = this.game.journal;
    if (!J.fogDirty) return;
    J.fogDirty = false;
    const ctx = this.fogCanvas.getContext('2d');
    const img = ctx.createImageData(FOG_N, FOG_N);
    for (let i = 0; i < J.fog.length; i++) {
      const a = J.fog[i] ? 0 : 205;
      img.data[i * 4] = 14; img.data[i * 4 + 1] = 18; img.data[i * 4 + 2] = 22; img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }

  _minimap() {
    const g = this.game;
    const ctx = this.mm;
    const S = 190;
    this._updateFog();
    const P = g.player.inVehicle ? g.player.inVehicle.pos : g.player.pos;
    const fwd = g.cam.forward(this._f);
    const head = bearing(fwd.x, fwd.z);
    const range = g.player.inVehicle && g.player.inVehicle.type === 'gyro' ? 600 : 260; // metres radius
    const scale = (S / 2) / range; // px per metre
    ctx.save();
    ctx.fillStyle = '#16201c';
    ctx.fillRect(0, 0, S, S);
    if (g.caves.active) {
      ctx.fillStyle = '#c8b890'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Underground', S / 2, S / 2);
      ctx.restore();
      $('#mmlabel').textContent = g.caves.active.poi.name;
      return;
    }
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-head);
    const mpx = 1024 / WORLD_SIZE; // map canvas px per metre
    const src = range * mpx;
    const sx = (P.x + HALF) * mpx, sz = (P.z + HALF) * mpx;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(g.world.mapCanvas, sx - src, sz - src, src * 2, src * 2, -S / 2 * (range / range), -S / 2, S, S);
    const fpx = FOG_N / WORLD_SIZE;
    ctx.drawImage(this.fogCanvas, (P.x + HALF) * fpx - range * fpx, (P.z + HALF) * fpx - range * fpx, range * 2 * fpx, range * 2 * fpx, -S / 2, -S / 2, S, S);
    const toM = (x, z) => [(x - P.x) * scale, (z - P.z) * scale];
    // dinosaurs (spotted species / tracking skill)
    const trackR = 60 + g.progress.skill('tracking') * 40 + (g.inventory.gear.has('tracker') ? 80 : 0);
    for (const d of g.dinos.active) {
      const dist = Math.hypot(d.pos.x - P.x, d.pos.z - P.z);
      if (dist > range) continue;
      if (dist > trackR && !g.journal.species[d.spec.id].seen) continue;
      if (dist > trackR * 2) continue;
      const [x, z] = toM(d.pos.x, d.pos.z);
      ctx.fillStyle = !d.alive ? '#777' : d.isPredator ? '#ff5544' : d.flyer ? '#9fd4ff' : '#9fe07a';
      ctx.beginPath(); ctx.arc(x, z, Math.max(2, Math.min(5, d.length * 0.3)), 0, Math.PI * 2); ctx.fill();
    }
    // POIs & structures
    ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const drawIcon = (x, z, icon, rot = true) => {
      const [px, pz] = toM(x, z);
      if (Math.hypot(px, pz) > S / 2 - 8) return;
      ctx.save(); ctx.translate(px, pz); if (rot) ctx.rotate(head); ctx.fillText(icon, 0, 0); ctx.restore();
    };
    for (const p of g.pois.list) if (p.discovered || (p.type === 'treasure' && p.state.hinted)) drawIcon(p.x, p.z, p.type === 'treasure' && !p.discovered ? '✖' : p.icon);
    for (const s of g.build.list) if (['tent', 'beacon', 'tower', 'garage'].includes(s.type)) drawIcon(s.x, s.z, STRUCTURES[s.type].icon);
    for (const v of Object.values(g.vehicles.list)) if (v.deployed && v !== g.player.inVehicle) drawIcon(v.pos.x, v.pos.z, v.type === 'boat' ? '🚤' : v.type === 'jeep' ? '🚙' : '🚁');
    // mission marker at edge
    for (const m of this._markers()) {
      let [px, pz] = toM(m.x, m.z);
      const l = Math.hypot(px, pz);
      if (l > S / 2 - 10) { px *= (S / 2 - 10) / l; pz *= (S / 2 - 10) / l; }
      ctx.save(); ctx.translate(px, pz); ctx.rotate(head);
      ctx.fillStyle = m.color || '#fff'; ctx.fillText(m.icon, 0, 0); ctx.restore();
    }
    ctx.restore();
    // player arrow (always up)
    ctx.save();
    ctx.translate(S / 2, S / 2);
    const pyaw = g.player.inVehicle ? g.player.inVehicle.heading : g.player.yaw;
    ctx.rotate(bearing(Math.sin(pyaw), Math.cos(pyaw)) - head);
    ctx.fillStyle = '#ffe9a8'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // north marker
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(-head);
    ctx.fillStyle = '#ff6b5c'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', 0, -S / 2 + 12);
    ctx.restore();
    const b = g.world.getBiome(P.x, P.z);
    $('#mmlabel').textContent = `${BIOME_NAMES[b]} · ${Math.round(P.y)} m`;
  }

  // ---------------- Menus ----------------
  openMenu(tab) {
    const g = this.game;
    if (g.player.photoMode) g.photo.toggle();
    if (g.build.active) g.build.toggle();
    this.tab = tab || this.tab;
    this.menuOpen = true;
    this.menu.classList.remove('hidden');
    g.input.enabled = false;
    g.input.unlock();
    this.renderMenu();
    g.audio.play('ui');
  }
  closeMenu() {
    this.menuOpen = false;
    this.menu.classList.add('hidden');
    this.game.input.enabled = true;
    this.game.input.lock();
  }
  toggleMenu(tab) {
    if (this.menuOpen && this.tab === tab) this.closeMenu();
    else this.openMenu(tab);
  }

  renderMenu() {
    const tabs = [['inventory', 'Pack & Crafting', 'Tab'], ['skills', 'Explorer', 'K'], ['journal', 'Field Journal', 'J'], ['missions', 'Missions', 'N'], ['map', 'Map', 'M'], ['settings', 'Settings', 'Esc']];
    let body = '';
    switch (this.tab) {
      case 'inventory': body = this._invHTML(); break;
      case 'skills': body = this._skillsHTML(); break;
      case 'journal': body = this._journalHTML(); break;
      case 'missions': body = this._missionsHTML(); break;
      case 'map': body = `<div id="mapwrap"><canvas id="mapcv"></canvas><div class="mapside">${this._mapSide()}</div></div>`; break;
      case 'settings': body = this._settingsHTML(); break;
    }
    this.menu.innerHTML = `<div class="tabs">${tabs.map(([id, n, k]) => `<div class="tab ${this.tab === id ? 'on' : ''}" data-tab="${id}">${n}<span class="key">${k}</span></div>`).join('')}<div class="close" data-act="close">✕ Close</div></div><div class="body">${body}</div>`;
    if (this.tab === 'map') this._initMap();
    if (this.tab === 'settings') this._bindSettings();
  }

  _menuClick(e) {
    const t = e.target.closest('[data-tab],[data-act]');
    if (!t) return;
    const g = this.game;
    if (t.dataset.tab) { this.tab = t.dataset.tab; this.renderMenu(); g.audio.play('ui'); return; }
    const [act, arg] = t.dataset.act.split(':');
    switch (act) {
      case 'close': this.closeMenu(); return;
      case 'craft': g.inventory.craft(arg); break;
      case 'filter': this.invFilter = arg; break;
      case 'deposit': { const n = g.inventory.depositAll(); this.notify(n ? `Stored ${n} items.` : 'Nothing to store (or storage full).', 'info'); break; }
      case 'withdraw': g.inventory.withdraw(arg, 10); break;
      case 'hot': { const inv = g.inventory; const i = inv.hotbar.indexOf(arg); if (i < 0) { inv.hotbar[inv.selected] = arg; } break; }
      case 'use': g.interact.useItem(arg); break;
      case 'skill': g.progress.spend(arg); break;
      case 'jtab': this.jtab = arg; break;
      case 'species': this.selSpecies = arg; break;
      case 'track': g.missions.track(arg); break;
      case 'travel': g.fastTravel(+arg); return;
      case 'save': g.save(); this.notify('Game saved.', 'good'); break;
      case 'newgame': if (confirm('Start a new expedition? Your current save will be erased.')) { g.newGame(); } return;
      case 'clearwp': g.journal.waypoint = null; break;
      case 'trackspecies': g.trackSpecies(arg); break;
    }
    this.renderMenu();
  }

  _invHTML() {
    const g = this.game;
    const inv = g.inventory;
    const items = Object.entries(inv.items).filter(([, n]) => n > 0);
    const near = inv.nearStorage();
    const cats = ['All', 'Tools', 'Equipment', 'Survival', 'Materials', 'Vehicles'];
    const recipes = RECIPES.filter((r) => this.invFilter === 'All' || r.cat === this.invFilter);
    const recipeHTML = recipes.map((r) => {
      const c = inv.canCraft(r);
      const out = r.out.gear ? GEAR[r.out.gear] : ITEMS[r.out.item];
      const owned = r.out.gear && inv.gear.has(r.out.gear);
      const cost = Object.entries(r.cost).map(([k, n]) => { const have = inv.count(k) + (near ? inv.storage[k] || 0 : 0); return `<span class="${have < n ? 'miss' : ''}">${ITEMS[k].icon} ${n}</span>`; }).join(' &nbsp;');
      const station = r.station ? ` · needs ${r.station === 'research' ? 'Research Station' : r.station}` : '';
      return `<div class="recipe ${c.ok ? 'ok' : ''}" style="${owned ? 'opacity:.4' : ''}"><div class="i">${out.icon}</div><div><div class="nm">${esc(out.name)}${r.out.n > 1 ? ' ×' + r.out.n : ''} <span style="font-size:11px;color:var(--muted)">Lv ${r.level}${station}</span></div><div class="cost">${cost}</div>${!c.ok && !owned ? `<div class="why">${esc(c.why)}</div>` : ''}${out.desc ? `<div class="cost">${esc(out.desc)}</div>` : ''}</div><button class="btn small pointer" data-act="craft:${r.id}" ${c.ok ? '' : 'disabled'}>${owned ? 'Owned' : 'Craft'}</button></div>`;
    }).join('');
    const storage = Object.entries(inv.storage).filter(([, n]) => n > 0);
    return `<div class="cols"><div>
      <h3>Backpack</h3><div class="capbar">${inv.total} / ${inv.capacity} carried · click consumables to add them to the hotbar slot ${inv.selected + 1}</div>
      <div class="grid">${items.map(([k, n]) => `<div class="cell pointer" data-act="hot:${k}" title="${esc(ITEMS[k].desc)}"><div class="i">${ITEMS[k].icon}</div><div class="nm">${esc(ITEMS[k].name)}</div><div class="ct">${n}</div></div>`).join('') || '<div style="color:var(--muted)">Empty</div>'}</div>
      <h4>Equipment</h4><div class="grid">${[...inv.gear].map((k) => `<div class="cell gear" title="${esc(GEAR[k].desc)}"><div class="i">${GEAR[k].icon}</div><div class="nm">${esc(GEAR[k].name)}</div></div>`).join('')}</div>
      <h4>Base Storage ${near ? '' : '<span style="text-transform:none;letter-spacing:0">(stand near a Storage Crate to access)</span>'}</h4>
      ${near ? `<button class="btn small pointer" data-act="deposit">Store all resources</button><div class="grid" style="margin-top:8px">${storage.map(([k, n]) => `<div class="cell pointer" data-act="withdraw:${k}" title="Take 10"><div class="i">${ITEMS[k].icon}</div><div class="nm">${esc(ITEMS[k].name)}</div><div class="ct">${n}</div></div>`).join('') || '<div style="color:var(--muted)">Empty</div>'}</div>` : `<div style="color:var(--muted);font-size:13px">${storage.reduce((a, [, n]) => a + n, 0)} items stored</div>`}
    </div><div>
      <h3>Crafting</h3><div class="filters">${cats.map((c) => `<button class="btn pointer ${this.invFilter === c ? 'on' : ''}" data-act="filter:${c}">${c}</button>`).join('')}</div>
      <div class="recipes">${recipeHTML}</div>
    </div></div>`;
  }

  _skillsHTML() {
    const g = this.game;
    const P = g.progress;
    const S = P.stats;
    const inv = g.inventory;
    const unlockList = [['boat', '🚤 Boat'], ['jeep', '🚙 Jeep'], ['glider', '🪂 Glider'], ['gyro', '🚁 Gyrocopter']];
    const next = TITLES.find(([l]) => l > P.level);
    return `<div class="profile"><div class="lvl">${P.level}</div><div><div style="font-family:var(--display);font-size:22px;color:var(--gold2)">${esc(P.title)}</div>
      <div style="color:var(--muted);font-size:13px">${P.xp} XP total · ${P.points} unspent skill point${P.points === 1 ? '' : 's'}${next ? ` · next title "${next[1]}" at level ${next[0]}` : ''}</div></div></div>
      <h3>Survival Skills</h3><div class="skills">${Object.entries(SKILLS).map(([k, s]) => `<div class="skill"><div class="i">${s.icon}</div><div style="flex:1"><div>${s.name}</div><div class="d">${s.desc}</div><div class="pips">${Array.from({ length: SKILL_MAX }, (_, i) => `<div class="pip ${i < P.skills[k] ? 'on' : ''}"></div>`).join('')}</div></div><button class="btn small pointer" data-act="skill:${k}" ${P.points > 0 && P.skills[k] < SKILL_MAX ? '' : 'disabled'}>+</button></div>`).join('')}</div>
      <h4>Blueprints & Vehicles</h4><div class="unlocks">${unlockList.map(([k, n]) => `<span class="${inv.unlocked.has(k) ? 'on' : ''}">${n} ${inv.gear.has(k) ? '✔ built' : inv.unlocked.has(k) ? '— blueprint' : '— locked'}</span>`).join('')}</div>
      <h4>Expedition Record</h4><div class="stats">
        <div>Distance travelled <b>${(S.distance / 1000).toFixed(1)} km</b></div><div>Species discovered <b>${g.journal.speciesCount} / 19</b></div>
        <div>Map revealed <b>${g.journal.mapPercent.toFixed(1)}%</b></div><div>Photos taken <b>${S.photos}</b></div><div>Missions completed <b>${S.missions}</b></div>
        <div>Places discovered <b>${S.discoveries}</b></div><div>Summits reached <b>${S.peaks}</b></div><div>Caves explored <b>${S.caves}</b></div><div>Explorers rescued <b>${S.rescued}</b></div>
        <div>Structures built <b>${S.built}</b></div><div>Samples analysed <b>${S.samples}</b></div><div>Nights survived <b>${S.nightsSurvived}</b></div><div>Days on the island <b>${g.clock.day}</b></div>
      </div>`;
  }

  _journalHTML() {
    const g = this.game;
    const J = g.journal;
    const tabs = `<div class="filters">${[['species', `Species (${J.speciesCount}/19)`], ['photos', `Photo Album (${J.photos.length})`], ['lore', `Discoveries & Lore (${J.lore.length})`]].map(([k, n]) => `<button class="btn pointer ${this.jtab === k ? 'on' : ''}" data-act="jtab:${k}">${n}</button>`).join('')}</div>`;
    if (this.jtab === 'photos') {
      return tabs + (J.photos.length ? `<div class="photos">${J.photos.map((p) => `<div class="photo"><img src="${p.img}"><div class="c">${esc(p.title)} <span class="stars" style="float:right">${'★'.repeat(p.stars)}</span><br><span style="color:#777">Day ${p.day}, ${p.time}</span></div></div>`).join('')}</div>` : '<p style="color:var(--muted)">No photos yet. Press P to raise your camera, scroll to zoom and click to shoot.</p>');
    }
    if (this.jtab === 'lore') {
      const pois = g.pois.list.filter((p) => p.discovered && p.type !== 'crate');
      return tabs + `<div class="cols"><div><h3>Ancient Records</h3>${J.lore.map((l) => `<div class="lore"><b>${esc(l.title)}</b>${esc(l.text)}</div>`).join('') || '<p style="color:var(--muted)">Investigate ruins and study nests to fill these pages.</p>'}</div>
        <div><h3>Places Discovered (${pois.length})</h3><div class="stats">${pois.map((p) => `<div>${p.icon} ${esc(p.name)}</div>`).join('')}</div></div></div>`;
    }
    const sel = this.selSpecies && SPECIES[this.selSpecies];
    const detail = sel ? (() => {
      const e = J.species[sel.id];
      if (!e.seen) return `<div class="spdetail">Not yet discovered. Habitat hints: ${sel.biomes.map((b) => BIOME_NAMES[b]).join(', ')}.</div>`;
      return `<div class="spdetail"><h3 style="margin-bottom:4px">${esc(sel.short)}</h3><div class="sci">${esc(sel.name)} · ${sel.period} · ${sel.length} m · ${sel.mass}</div>
        <p>${esc(sel.fact)}</p><div style="font-size:13px;color:var(--muted)">Diet: ${sel.diet} · Temperament: ${sel.temperament} · Habitat: ${sel.biomes.map((b) => BIOME_NAMES[b]).join(', ')}<br>
        Behaviours observed: ${e.behaviors.map((b) => BEHAVIORS[b] || b).join(', ') || '—'}<br>Photos: ${e.photos} (best ${'★'.repeat(e.best) || '—'}) · Samples: ${e.sampled}${e.morphs.length ? ' · Rare morphs: ' + e.morphs.join(', ') : ''}</div>
        ${g.inventory.gear.has('tracker') ? `<div style="margin-top:10px"><button class="btn small pointer" data-act="trackspecies:${sel.id}">📡 Track nearest herd</button></div>` : ''}</div>`;
    })() : '';
    return tabs + `<div class="species">${SPECIES_LIST.map((s) => {
      const e = J.species[s.id];
      const rar = '◆'.repeat(s.rarity);
      return `<div class="sp ${e.seen ? '' : 'unk'}" data-act="species:${s.id}"><div class="n">${e.seen ? esc(s.short) : '??? Unknown species'}</div><div class="sci">${e.seen ? esc(s.name) : s.diet === 'herbivore' ? 'Herbivore' : s.flyer ? 'Flying reptile' : s.aquatic ? 'Marine reptile' : 'Carnivore'}</div>
        <div class="meta">Rarity <span style="color:var(--gold)">${rar}</span>${e.seen ? ` · ${e.photos} photo${e.photos === 1 ? '' : 's'}` : ''}</div>${e.seen ? `<div class="tags">${e.behaviors.slice(0, 5).map((b) => `<span>${BEHAVIORS[b] || b}</span>`).join('')}</div>` : ''}</div>`;
    }).join('')}</div>${detail}`;
  }

  _missionsHTML() {
    const g = this.game;
    const M = g.missions;
    const card = (m) => {
      const st = M.state[m.id];
      const R = m.reward;
      const rew = [R.xp ? `${R.xp} XP` : '', ...(R.items ? Object.entries(R.items).map(([k, n]) => `${n}× ${ITEMS[k].name}`) : []), R.gear ? GEAR[R.gear].name : '', R.unlock ? `${R.unlock} blueprint` : ''].filter(Boolean).join(' · ');
      return `<div class="mission ${m.main ? 'main' : ''} ${M.tracked === m.id ? 'tr' : ''} ${st.done ? 'done' : ''}" data-act="track:${m.id}"><div class="t">${esc(m.title)}${st.done ? ' ✔' : ''}</div><div class="d">${esc(m.desc)}</div>${!st.done && m.goal.count > 1 ? `<div class="p"><div style="width:${(Math.min(st.progress, m.goal.count) / m.goal.count) * 100}%"></div></div>` : ''}<div class="r">Reward: ${esc(rew)}</div></div>`;
    };
    const act = M.active;
    const main = act.filter((m) => m.main);
    const side = act.filter((m) => !m.main);
    const groups = {};
    for (const m of side) (groups[m.cat] || (groups[m.cat] = [])).push(m);
    const done = M.completed;
    const locked = MISSIONS.filter((m) => !M.state[m.id].done && !M.available(m)).length;
    return `<div class="missions"><div><h3>Expedition</h3>${main.map(card).join('') || '<p style="color:var(--gold2)">The main expedition is complete!</p>'}
      ${Object.entries(groups).map(([c, l]) => `<h4>${c}</h4>${l.map(card).join('')}`).join('')}<p style="color:var(--muted);font-size:12px">${locked} more missions unlock as you progress. Click a mission to track it.</p></div>
      <div><h3>Completed (${done.length}/${MISSIONS.length})</h3>${done.slice().reverse().map(card).join('') || '<p style="color:var(--muted)">None yet.</p>'}</div></div>`;
  }

  _mapSide() {
    const g = this.game;
    const pts = g.build.fastTravelPoints();
    return `<h3>World Map</h3><div style="color:var(--muted);font-size:12px">Scroll to zoom, drag to pan, click to place a waypoint. ${g.journal.mapPercent.toFixed(1)}% explored.</div>
      <div class="legend"><div>◆ Tracked mission</div><div>📍 Waypoint ${g.journal.waypoint ? '<span class="pointer" data-act="clearwp" style="color:var(--bad);cursor:pointer">(clear)</span>' : ''}</div><div>❓ Unexplored landmark</div><div>✖ Hinted treasure</div><div><span style="color:#9fe07a">●</span> Herbivore herd · <span style="color:#ff5544">●</span> Predator</div></div>
      <h4>Fast Travel</h4><div class="travel">${pts.map((p, i) => `<button class="btn small pointer" data-act="travel:${i}">➜ ${esc(p.name)}</button>`).join('')}</div>
      <div style="color:var(--muted);font-size:11px">Travel takes time and is unavailable while hunted or in a vehicle.</div>`;
  }

  _initMap() {
    const cv = $('#mapcv');
    const r = cv.getBoundingClientRect();
    // canvas pixels follow the element's own (unscaled) CSS size; k converts screen px to it
    cv.width = cv.clientWidth; cv.height = cv.clientHeight;
    const k = cv.clientWidth / Math.max(1, r.width);
    const ms = this.mapState;
    const P = this.game.player.pos;
    if (!ms.init) { ms.cx = P.x; ms.cz = P.z; ms.zoom = 1.2; ms.init = true; }
    const view = () => ({ s: (Math.min(cv.width, cv.height) / WORLD_SIZE) * ms.zoom });
    const toScreen = (x, z) => { const { s } = view(); return [cv.width / 2 + (x - ms.cx) * s, cv.height / 2 + (z - ms.cz) * s]; };
    const toWorld = (px, py) => { const { s } = view(); return [ms.cx + (px - cv.width / 2) / s, ms.cz + (py - cv.height / 2) / s]; };
    this._drawMap = () => this._renderMap(cv, toScreen, view);
    cv.onwheel = (e) => { e.preventDefault(); const [wx, wz] = toWorld(e.offsetX, e.offsetY); ms.zoom = Math.min(12, Math.max(0.6, ms.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); const [nx, nz] = toWorld(e.offsetX, e.offsetY); ms.cx += wx - nx; ms.cz += wz - nz; this._drawMap(); };
    cv.onmousedown = (e) => { ms.drag = { x: e.clientX, y: e.clientY, cx: ms.cx, cz: ms.cz, moved: false }; };
    cv.onmousemove = (e) => { if (!ms.drag) return; const { s } = view(); const dx = (e.clientX - ms.drag.x) * k, dy = (e.clientY - ms.drag.y) * k; if (Math.abs(dx) + Math.abs(dy) > 4) ms.drag.moved = true; ms.cx = ms.drag.cx - dx / s; ms.cz = ms.drag.cz - dy / s; this._drawMap(); };
    cv.onmouseup = (e) => { if (ms.drag && !ms.drag.moved) { const [x, z] = toWorld(e.offsetX, e.offsetY); this.game.journal.waypoint = { x, z }; this.notify('Waypoint set.', 'info', 1.5); this.renderMenu(); } ms.drag = null; };
    this._drawMap();
  }

  _renderMap(cv, toScreen, view) {
    const g = this.game;
    const ctx = cv.getContext('2d');
    const { s } = view();
    ctx.fillStyle = '#0b1416';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const [x0, y0] = toScreen(-HALF, -HALF);
    ctx.imageSmoothingEnabled = s < 0.6;
    ctx.drawImage(g.world.mapCanvas, x0, y0, WORLD_SIZE * s, WORLD_SIZE * s);
    this._updateFog();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.93;
    ctx.drawImage(this.fogCanvas, x0, y0, WORLD_SIZE * s, WORLD_SIZE * s);
    ctx.globalAlpha = 1;
    // grid
    ctx.strokeStyle = 'rgba(232,196,106,0.12)'; ctx.lineWidth = 1;
    for (let k = -HALF; k <= HALF; k += 512) {
      const [a] = toScreen(k, 0); const [, b] = toScreen(0, k);
      ctx.beginPath(); ctx.moveTo(a, y0); ctx.lineTo(a, y0 + WORLD_SIZE * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, b); ctx.lineTo(x0 + WORLD_SIZE * s, b); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const J = g.journal;
    // region labels for discovered regions
    ctx.font = `${Math.max(10, 11 * Math.sqrt(s * 4))}px Cinzel, Georgia, serif`;
    ctx.fillStyle = 'rgba(245,230,190,0.85)';
    for (const R of g.regions) {
      if (!J.regions.has(R.id)) continue;
      const [px, py] = toScreen(R.x, R.z);
      ctx.fillText(R.name.toUpperCase(), px, py - 20);
    }
    // herds known
    const trackR = 200 + g.progress.skill('tracking') * 160;
    const P = g.player.pos;
    for (const h of g.dinos.herds) {
      if (h.count <= 0) continue;
      const known = Math.hypot(h.x - P.x, h.z - P.z) < trackR || h === J.trackedHerd || (g.tracking && g.tracking.herd === h);
      if (!known || !J.species[h.spec.id].seen) continue;
      const [px, py] = toScreen(h.x, h.z);
      ctx.fillStyle = h.spec.diet === 'carnivore' || h.spec.diet === 'piscivore' ? '#ff5544' : '#9fe07a';
      ctx.beginPath(); ctx.arc(px, py, 4 + Math.min(4, h.count), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.fillText(h.spec.short, px, py + 12);
    }
    // POIs
    ctx.font = '16px sans-serif';
    for (const p of g.pois.list) {
      const [px, py] = toScreen(p.x, p.z);
      if (p.discovered) {
        if (p.type === 'crate' && s < 1.5) continue;
        ctx.fillText(p.icon, px, py);
        if (s > 1.2 || p.major) { ctx.font = '10px sans-serif'; ctx.fillStyle = '#f2ecdf'; ctx.fillText(p.name, px, py + 14); ctx.font = '16px sans-serif'; }
      } else if (p.type === 'treasure' && p.state.hinted) {
        ctx.fillStyle = '#ff5544'; ctx.fillText('✖', px, py);
      } else if (p.major && J.isRevealed(p.x, p.z)) {
        ctx.fillStyle = '#e8c46a'; ctx.fillText('❓', px, py);
      }
    }
    for (const st of g.build.list) {
      if (!['tent', 'beacon', 'tower', 'garage', 'research'].includes(st.type)) continue;
      const [px, py] = toScreen(st.x, st.z);
      ctx.fillText(STRUCTURES[st.type].icon, px, py);
    }
    for (const v of Object.values(g.vehicles.list)) if (v.deployed) { const [px, py] = toScreen(v.pos.x, v.pos.z); ctx.fillText(v.type === 'boat' ? '🚤' : v.type === 'jeep' ? '🚙' : '🚁', px, py); }
    for (const m of this._markers()) {
      const [px, py] = toScreen(m.x, m.z);
      if (m.icon === '⛺') continue;
      ctx.fillStyle = m.color || '#fff';
      ctx.fillText(m.icon, px, py);
    }
    const mk = g.missions.marker();
    if (mk && mk.approx) { const [px, py] = toScreen(mk.x, mk.z); ctx.strokeStyle = 'rgba(232,196,106,0.7)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(px, py, (mk.radius || 120) * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    // player
    const [px, py] = toScreen(P.x, P.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(bearing(Math.sin(g.player.yaw), Math.cos(g.player.yaw)));
    ctx.fillStyle = '#ffe9a8'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  _settingsHTML() {
    const g = this.game;
    const S = g.settings;
    const keys = [['W A S D', 'Move'], ['Shift', 'Sprint'], ['Space', 'Jump / swim up / glider'], ['C', 'Crouch / dive'], ['V', 'Switch 1st / 3rd person'], ['E (hold)', 'Interact / gather'], ['F', 'Enter / exit vehicle'],
      ['Left click', 'Use hotbar item'], ['1 – 5', 'Select hotbar slot'], ['Right mouse', 'Binoculars (when owned)'], ['P', 'Camera mode'], ['B', 'Build mode'], ['R', 'Rotate structure'], ['U / X', 'Upgrade / dismantle structure'],
      ['G', 'Summon vehicle'], ['T', 'Bio-tracker'], ['L', 'Headlamp'], ['Tab / I', 'Pack & crafting'], ['K', 'Explorer skills'], ['J', 'Field journal'], ['N', 'Missions'], ['M', 'Map'], ['Esc', 'Pause / settings'], ['F5', 'Quick save']];
    return `<div class="cols"><div class="settings"><h3>Settings</h3>
      <label>Graphics quality <select id="s-q" class="pointer">${['low', 'medium', 'high', 'ultra'].map((q) => `<option ${S.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
      <label>Master volume <input id="s-vol" type="range" min="0" max="1" step="0.05" value="${S.volume}"></label>
      <label>Music volume <input id="s-mus" type="range" min="0" max="1" step="0.05" value="${S.music}"></label>
      <label>Mouse sensitivity <input id="s-sens" type="range" min="0.0006" max="0.005" step="0.0002" value="${S.sens}"></label>
      <label>Field of view <input id="s-fov" type="range" min="55" max="95" step="1" value="${S.fov}"></label>
      <label>Invert mouse Y <input id="s-inv" type="checkbox" class="pointer" ${S.invertY ? 'checked' : ''}></label>
      <label>Day length (minutes) <select id="s-day" class="pointer">${[12, 24, 48, 96].map((d) => `<option ${S.dayLength === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <div style="display:flex;gap:10px;margin-top:10px"><button class="btn pointer" data-act="save">Save Game</button><button class="btn pointer" data-act="close">Resume</button><button class="btn pointer" data-act="newgame">New Expedition</button></div>
      <p style="color:var(--muted);font-size:12px">The game autosaves every minute and when you sleep.</p>
    </div><div><h3>Controls</h3><div class="keys">${keys.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div></div></div>`;
  }

  _bindSettings() {
    const g = this.game;
    const S = g.settings;
    $('#s-q').onchange = (e) => { S.quality = e.target.value; g.applySettings(true); };
    $('#s-vol').oninput = (e) => { S.volume = +e.target.value; g.applySettings(); };
    $('#s-mus').oninput = (e) => { S.music = +e.target.value; g.applySettings(); };
    $('#s-sens').oninput = (e) => { S.sens = +e.target.value; g.applySettings(); };
    $('#s-fov').oninput = (e) => { S.fov = +e.target.value; g.applySettings(); };
    $('#s-inv').onchange = (e) => { S.invertY = e.target.checked; g.applySettings(); };
    $('#s-day').onchange = (e) => { S.dayLength = +e.target.value; g.applySettings(); };
  }
}
