// Game orchestrator: owns renderer, world systems, player, gameplay rules and the main loop.
import * as THREE from 'three';
import { QUALITY_PRESETS } from './config.js';
import { U } from './render/common.js';
import { noiseTexture, cloudMapTexture } from './render/textures.js';
import { PostFX } from './render/post.js';
import { Effects } from './render/effects.js';
import { World } from './world/world.js';
import { Terrain } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { Vegetation } from './world/vegetation.js';
import { Grass } from './world/grass.js';
import { Weather } from './world/weather.js';
import { Features } from './world/features.js';
import { Player } from './player/player.js';
import { Inventory, ITEMS } from './player/inventory.js';
import { Building } from './player/building.js';
import { Tools } from './player/tools.js';
import { Input } from './core/input.js';
import { CreatureManager } from './creatures/manager.js';
import { AudioEngine } from './audio/audio.js';
import { HUD } from './ui/hud.js';
import { PLAYER_START, CAVES } from './world/design.js';

const SAVE_KEY = 'primordia-save-v1';
const _dir = new THREE.Vector3();
const _o = new THREE.Vector3();

export class Game {
  constructor(canvas, settings, hooks = {}) {
    this.canvas = canvas;
    this.settings = settings;
    this.hooks = hooks;
    this.quality = { ...(QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.high) };
    this.time = 0;
    this.clock = new THREE.Clock();
    this.uiOpen = false;
    this.paused = true;
    this.started = false;
    this.renderScale = this.quality.pixelRatio;
    this.fpsHist = [];
    this.collidersTmp = [];
    this.systems = [];
    this.timeScale = 1;
    this.day = 1;
    this.journal = { creatures: new Set(), places: new Set(), tablets: new Set(), placed: new Set(), fossils: 0, paintings: new Set(), altarDone: false };
    this.respawnPoint = null;
    this.useHold = 0;
    this.exposureAdapt = 1;
    this.fade = 0;
    this.sleeping = false;
  }

  async init(progress) {
    const q = this.quality;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', reversedDepthBuffer: true, stencil: false });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.autoClear = false;
    renderer.setPixelRatio(1);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.12, q.viewDistance);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    progress(0.02, 'Shaping the land…');
    this.world = new World();
    await this.world.generate((f) => progress(0.02 + f * 0.58, 'Raising mountains and carving rivers…'));

    progress(0.62, 'Weaving textures…');
    await tick();
    U.uNoiseTex.value = noiseTexture();
    U.uCloudTex.value = cloudMapTexture();

    this.post = new PostFX(renderer, q);
    this.sky = new Sky(renderer, this.scene, q);
    progress(0.68, 'Sculpting terrain…');
    await tick();
    this.terrain = new Terrain(this.world, q);
    this.scene.add(this.terrain.group);
    this.water = new Water(this.world, this.scene, q);
    progress(0.73, 'Growing forests…');
    await tick();
    this.vegetation = new Vegetation(this.world, this.scene, q);
    this.grass = new Grass(this.scene, q);
    this.effects = new Effects(this);
    this.weather = { cover: 0.55, dark: 0, haze: 0.1, rain: 0, wind: 0.45, fog: 0.00005 };
    this.weatherSys = new Weather(this);
    progress(0.8, 'Raising ancient ruins…');
    await tick();
    this.features = new Features(this);
    this.caves = this.features.caves;
    progress(0.86, 'Hatching dinosaurs…');
    await tick();
    this.creatures = new CreatureManager(this);
    this.creatures.populate(q);

    this.input = new Input(this.canvas);
    this.inventory = new Inventory();
    this.player = new Player(this);
    this.player.sensitivity = 0.0022 * this.settings.sensitivity;
    this.player.invertY = this.settings.invertY;
    this.player.spawn(PLAYER_START.x, PLAYER_START.z, PLAYER_START.yaw);
    this.building = new Building(this);
    this.tools = new Tools(this);
    this.audio = new AudioEngine(this.settings);
    this.hud = new HUD(this);
    this._bindKeys();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    progress(0.94, 'Warming up shaders…');
    await tick();
    this.sky.update(0, this.camera, this.weather);
    this.sky.updateEnvironment(true);
    this.terrain.update(this.camera.position);
    this.player.applyCamera(this.camera, 0);
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { console.warn(e); }
    progress(1, 'Ready');
  }

  // ------------------------------------------------------------------ session
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }

  newGame() {
    const inv = this.inventory;
    inv.load({ items: { berries: 4 }, hotbar: [null, null, null, null, null, null, null, null], sel: 0 });
    inv.hotbar[0] = 'berries';
    inv._emit();
    this.player.spawn(PLAYER_START.x, PLAYER_START.z, PLAYER_START.yaw);
    Object.assign(this.player, { health: 100, stamina: 100, hunger: 85, thirst: 80, oxygen: 100, warmth: 100 });
    this.sky.timeOfDay = 7.2;
    this.day = 1;
    this.weatherSys.set('fair', true);
    setTimeout(() => {
      this.hud.toast('You wake in a meadow at the edge of an unknown land.', 'big');
      setTimeout(() => this.hud.toast('Gather <b>fiber</b> from ferns, <b>wood</b> from trees and <b>stone</b> from the ground with <kbd>E</kbd>.', ''), 2500);
      setTimeout(() => this.hud.toast('Press <kbd>Tab</kbd> to craft a stone axe.', ''), 6000);
    }, 800);
  }

  save() {
    try {
      const P = this.player;
      const data = {
        v: 1,
        pos: P.pos.toArray(), yaw: P.yaw,
        vit: { health: P.health, stamina: P.stamina, hunger: P.hunger, thirst: P.thirst, warmth: P.warmth },
        inv: this.inventory.toJSON(),
        time: this.sky.timeOfDay, day: this.day, gameTime: this.time,
        builds: this.building.toJSON(),
        journal: {
          creatures: [...this.journal.creatures], places: [...this.journal.places], tablets: [...this.journal.tablets], placed: [...this.journal.placed],
          fossils: this.journal.fossils, paintings: [...this.journal.paintings], altarDone: this.journal.altarDone,
        },
        taken: this.features.artifacts.filter((a) => a.taken).map((a) => a.id),
        pickups: this.features.pickups.filter((p) => p.taken && p.item === 'fossil').map((p) => p.label),
        reveal: Array.from(this.hud.mapReveal),
        respawn: this.respawnPoint ? this.respawnPoint.toArray() : null,
        weather: this.weatherSys.state,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('save failed', e);
      return false;
    }
  }

  load() {
    let d;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { d = null; }
    if (!d) { this.newGame(); return; }
    const P = this.player;
    P.spawn(d.pos[0], d.pos[2], d.yaw);
    P.pos.y = Math.max(P.pos.y, d.pos[1]);
    Object.assign(P, d.vit);
    this.inventory.load(d.inv);
    this.sky.timeOfDay = d.time;
    this.day = d.day || 1;
    this.time = d.gameTime || 0;
    this.building.load(d.builds);
    const j = d.journal || {};
    this.journal.creatures = new Set(j.creatures || []);
    this.journal.places = new Set(j.places || []);
    this.journal.tablets = new Set(j.tablets || []);
    this.journal.placed = new Set(j.placed || []);
    this.journal.fossils = j.fossils || 0;
    this.journal.paintings = new Set(j.paintings || []);
    this.journal.altarDone = !!j.altarDone;
    for (const a of this.features.artifacts) if ((d.taken || []).includes(a.id)) this._takeArtifactVisual(a);
    for (const p of this.features.pickups) if ((d.pickups || []).includes(p.label)) { p.taken = true; p.mesh.parent && p.mesh.parent.remove(p.mesh); }
    for (const id of this.journal.placed) this._fillSocket(id, true);
    if (this.journal.altarDone) this._awakenAltar(true);
    if (d.reveal) this.hud.mapReveal.set(d.reveal);
    if (d.respawn) this.respawnPoint = new THREE.Vector3().fromArray(d.respawn);
    if (d.weather) this.weatherSys.set(d.weather, true);
    this.hud.toast('Expedition resumed.', 'good');
  }

  // ------------------------------------------------------------------ input bindings
  _bindKeys() {
    this.input.onLockChange = (locked) => {
      if (!locked && this.started && !this.uiOpen && !this.paused && !this.sleeping && !this.player.dead) this.hooks.onPause && this.hooks.onPause();
    };
  }

  _handleKeys() {
    const I = this.input;
    const inv = this.inventory;
    if (I.hit('Tab')) this.hud.openPanel('inventory');
    if (I.hit('KeyM')) this.hud.openPanel('map');
    if (I.hit('KeyJ')) this.hud.openPanel('journal');
    if (this.uiOpen) {
      if (I.hit('Escape')) this.hud.closePanel();
      return;
    }
    for (let i = 0; i < 8; i++) if (I.hit('Digit' + (i + 1))) { inv.sel = i; inv._emit(); }
    if (I.mouse.wheel) { inv.sel = (inv.sel + (I.mouse.wheel > 0 ? 1 : 7)) % 8; inv._emit(); }
    if (I.hit('KeyF')) { this.tools.torchOn = !this.tools.torchOn; this.audio.ui(); }
    if (I.hit('KeyR')) this.building.rotate();
    if (I.hit('KeyZ')) this.trySleep();
    if (I.hit('F2')) this.settings.showFps = !this.settings.showFps;
  }

  // ------------------------------------------------------------------ loop
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const s = this.renderScale * Math.min(window.devicePixelRatio || 1, 2);
    this.post.setSize(w, h, s);
    this.sky.setSize(this.post.renderWidth, this.post.renderHeight);
  }

  setRenderScale(s) {
    if (Math.abs(s - this.renderScale) < 0.01) return;
    this.renderScale = s;
    this.resize();
  }

  start() {
    this.clock.start();
    const loop = () => {
      requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  frame() {
    let dt = Math.min(0.05, this.clock.getDelta());
    const realDt = dt;
    if (this.paused) dt = 0;
    this.time += dt;
    U.uTime.value += dt;
    if (!this.paused) this.update(dt);
    else if (this.menuCamera) this.menuCamera(realDt);
    this.render(dt, realDt);
    this.input.endFrame();
    this._perf(realDt);
  }

  update(dt) {
    const P = this.player;
    if (this.menuMode) {
      this.sky.advance(dt, 4);
      this.weatherSys.update(dt);
      this.effects.update(dt);
      this.features.update(dt, this.camera.position);
      if (this.menuCamera) this.menuCamera(dt);
      return;
    }
    // time of day (sleeping fast-forwards)
    const prevH = this.sky.timeOfDay;
    this.sky.advance(dt, this.sleeping ? 360 : this.timeScale);
    if (this.sky.timeOfDay < prevH) this.day++;
    this.timeScaleVitals = this.sleeping ? 30 : 1;
    if (!this.sleeping) this._handleKeys();
    P.update(dt, this.sleeping ? NO_INPUT : this.input);
    P.applyCamera(this.camera, dt);
    this.weatherSys.update(dt);
    this._environmentRules(dt);
    if (!this.sleeping && !P.dead) this._interact(dt);
    this.tools.update(dt);
    this.effects.update(dt);
    this.features.update(dt, this.camera.position);
    this.audio.update(dt, this);
    this.hud.update(dt);
    if (this.sleeping) this._sleepTick(dt);
    // autosave
    this.saveTimer = (this.saveTimer || 0) + dt;
    if (this.saveTimer > 45) { this.saveTimer = 0; this.save(); }
  }

  _environmentRules(dt) {
    const P = this.player;
    const w = this.world;
    // heat & cold
    const camp = this.building.nearest(P.pos, ['campfire'], 6);
    const torch = (this.tools.currentId === 'torch' && this.tools.torchOn);
    this.nearHeat = !!camp || torch;
    const snow = w.snowLine(P.pos.x, P.pos.z);
    const alt = Math.max(0, (P.pos.y - (snow - 150)) / 300);
    const night = 1 - this.sky.dayFactor;
    const wet = this.weather.rain * (this.underRoof ? 0 : 1);
    this.coldness = Math.max(0, Math.min(1, alt + night * 0.25 * (P.pos.y > 300 ? 1 : 0.2) + wet * 0.2 + (P.headUnder ? 0.2 : 0) - (this.isHotRegion ? 1 : 0)));
    this.underRoof = this.features.colliders.overhead(P.pos.x, P.pos.z, P.pos.y) || !!P.inCave;
    // eye adaptation (caves are dark)
    const target = P.inCave ? 2.6 : 1;
    this.exposureAdapt += (target - this.exposureAdapt) * Math.min(1, dt * 0.8);
    // discover caves & paintings
    if (P.inCave) {
      this.discoverPlace(P.inCave.name);
      const c = P.inCave;
      if (!this.journal.paintings.has(c.id) && P.pos.distanceTo(c.paint) < 9) {
        this.journal.paintings.add(c.id);
        this.hud.toast('🖐️ You discovered ancient <b>cave paintings</b>.', 'big');
        this.audio.discover();
      }
    }
  }

  render(dt, realDt) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const camPos = cam.position;
    U.uPlayerPos.value.copy(this.player.pos);
    U.uWindStrength.value = this.weather.wind;
    U.uCloudOffset.value.x += (dt || realDt * 0.3) * 9 * (0.5 + this.weather.wind);
    U.uCloudOffset.value.y += (dt || realDt * 0.3) * 4 * (0.5 + this.weather.wind);

    this.sky.update(dt, cam, this.weather);
    this.sky._probeHorizon();
    this.sky.updateEnvironment();
    this.terrain.update(camPos);
    this.water.update(camPos);
    this.vegetation.update(camPos, dt, this.time);
    this.creatures.update(dt, camPos);
    if (this.paused) this.features.lights.update(camPos, U.uTime.value);

    const day = this.sky.dayFactor;
    this.scene.environmentIntensity = (0.06 + day * 0.94) * (1 - this.weather.dark * 0.35) * (this.player.inCave ? 0.1 : 1);
    const exposure = THREE.MathUtils.lerp(2.4, 0.52, Math.pow(day, 0.6)) * (1 + this.weather.dark * 0.35) * this.exposureAdapt;

    this.sky.renderSky(cam);
    const P = this.player;
    this.post.render(this.scene, cam, {
      sunDir: this.sky.keyDir,
      sunColor: this.sky.keyColor,
      fogColor: this.sky.horizonColor,
      fogDensity: this.weather.fog * (P.inCave ? 0.1 : 1),
      fogFalloff: 0.0045 + this.weather.haze * 0.002,
      fogBase: 0,
      underwater: P.headUnder,
      waterLevel: P.waterLevel,
      time: U.uTime.value,
      shafts: (this.sky.useMoon ? 0.25 : 1.0) * (1 - this.weather.dark * 0.6),
      exposure: exposure * (this.exposureMul || 1),
      damage: P.damageFlash,
      fade: this.fade,
      saturation: 1.18 - this.weather.dark * 0.3,
      contrast: 1.07,
      bloomStrength: 0.22 + (this.features.eruptGlow || 0) * 0.2,
    });
  }

  _perf(dt) {
    this.fpsHist.push(dt);
    if (this.fpsHist.length > 60) this.fpsHist.shift();
    this.perfTimer = (this.perfTimer || 0) + dt;
    if (this.perfTimer > 1) {
      this.perfTimer = 0;
      const avg = this.fpsHist.reduce((a, b) => a + b, 0) / this.fpsHist.length;
      this.fps = 1 / avg;
      if (this.settings.dynamicRes && !this.paused && this.started) {
        const base = this.quality.pixelRatio;
        if (this.fps < 45 && this.renderScale > base * 0.6) this.setRenderScale(Math.max(base * 0.6, this.renderScale - 0.08));
        else if (this.fps > 58 && this.renderScale < base) this.setRenderScale(Math.min(base, this.renderScale + 0.04));
      }
    }
  }

  // ------------------------------------------------------------------ physics hooks
  resolveCollisions(pos, radius, height) {
    const cols = this.vegetation.colliders(pos.x, pos.z, radius + 2, this.collidersTmp);
    for (const c of cols) {
      if (pos.y > c.top) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = radius + c.r;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
    this.creatures.collide(pos, radius);
    this.features.colliders.resolve(pos, radius, height);
    if (this.player.inCave) this.features.caves.collide(pos);
  }

  structureTop(x, z, maxY, r) {
    let t = this.features.colliders.top(x, z, maxY, r);
    // stand on boulders
    for (const c of this.collidersTmp) if (c.top < 1e3 && Math.hypot(x - c.x, z - c.z) < c.r * 0.8 && c.top <= maxY) t = Math.max(t, c.top);
    return t;
  }

  surfaceAt(pos) {
    const w = this.world;
    if (this.player.inWater) return 'water';
    if (this.player.inCave) return 'rock';
    if (this.features.colliders.top(pos.x, pos.z, pos.y + 0.1) > pos.y - 0.2) return 'rock';
    const b = w.biome(pos.x, pos.z);
    if (b === 'snow') return 'snow';
    if (b === 'beach' || b === 'canyon') return 'sand';
    if (b === 'rock' || b === 'volcanic') return 'rock';
    return 'grass';
  }

  // ------------------------------------------------------------------ interaction
  _interact(dt) {
    const P = this.player;
    const I = this.input;
    const inv = this.inventory;
    const cam = this.camera;
    const origin = _o.copy(cam.position);
    const dir = cam.getWorldDirection(_dir);
    const sel = inv.selected;
    const it = sel ? ITEMS[sel] : null;
    this.tools.setItem(sel && !it.build ? sel : sel);
    if (it && it.build && !this.uiOpen) this.building.setGhost(it.build);
    else this.building.setGhost(null);

    let prompt = null, progress = null;
    const E = I.hit('KeyE');
    const LMB = I.mouse.left && I.locked && !this.uiOpen;
    const LMBp = I.mouse.leftPressed && I.locked && !this.uiOpen;

    // ---- building placement
    if (it && it.build) {
      const place = this.building.updateGhost(origin, dir);
      prompt = place ? `<kbd>LMB</kbd>Place ${it.name} · <kbd>R</kbd>Rotate` : `Can't place ${it.name} here`;
      if (place && LMBp) {
        const piece = this.building.build(it.build, place);
        inv.remove(sel, 1);
        if (piece.type === 'campfire' || piece.type === 'shelter') { this.respawnPoint = new THREE.Vector3(place.x, place.y, place.z); this.hud.toast('Respawn point set.', 'good'); }
        this.save();
      }
      this.hud.prompt(prompt);
      return;
    }

    // ---- special targets (artifacts, pickups, crystals, altar, carcass, campfire, shelter)
    const near = (p, d) => p.distanceTo(P.pos) < d && _tmp.copy(p).sub(origin).normalize().dot(dir) > 0.75;
    let target = null;
    for (const a of this.features.artifacts) if (!a.taken && near(a.pos, 4)) target = { kind: 'artifact', a, label: `<kbd>E</kbd>Take the ${a.name}` };
    if (!target) for (const p of this.features.pickups) if (!p.taken && near(p.pos, 3.2)) { target = { kind: 'pickup', p, label: `<kbd>E</kbd>Pick up ${p.label}` }; break; }
    if (!target) for (const h of this.features.harvestables) if (!h.taken && near(h.pos, 3.5)) { target = { kind: 'crystal', h, label: sel === 'pickaxe' ? `<kbd>LMB</kbd>Mine ${h.label}` : `${h.label} — needs a pickaxe` }; break; }
    const altar = this.features.altar;
    if (!target && altar && near(altar.pos, 6)) {
      const carrying = [...this.journal.tablets].filter((t) => !this.journal.placed.has(t));
      target = { kind: 'altar', label: this.journal.altarDone ? 'The Sun Gate hums with light' : carrying.length ? `<kbd>E</kbd>Place ${carrying.length} tablet${carrying.length > 1 ? 's' : ''} on the altar` : `An altar with four empty sockets (${this.journal.placed.size}/4)` };
    }
    if (!target) {
      const carc = this.creatures.nearestCarcass(P.pos, 4.5);
      if (carc) target = { kind: 'carcass', c: carc, label: `<kbd>E</kbd>Butcher ${carc.spec.name}` + (sel === 'axe' || sel === 'spear' || sel === 'obsidian_spear' ? '' : ' (faster with a blade)') };
    }
    if (!target) {
      const fire = this.building.nearest(P.pos, ['campfire'], 3);
      if (fire) target = { kind: 'campfire', f: fire, label: inv.count('meat_raw') ? `<kbd>E</kbd>Cook raw meat (${inv.count('meat_raw')})` : 'Campfire — warm yourself' };
      const sh = this.building.nearest(P.pos, ['shelter'], 3.5);
      if (sh && !fire) target = { kind: 'shelter', label: '<kbd>Z</kbd>Sleep until morning' };
    }

    // ---- creature melee
    const weapon = it && (it.tool === 'axe' || it.tool === 'pickaxe' || it.tool === 'spear');
    let creatureHit = null;
    if (!target) {
      const r = this.creatures.rayHit(origin, dir, weapon ? 4.2 : 3);
      if (r && r.creature.alive) creatureHit = r;
    }

    // ---- vegetation / rocks
    let veg = null;
    if (!target && !creatureHit) veg = this.vegetation.pick(origin, dir, 3.6);

    // ---- water
    let water = false;
    if (!target && !creatureHit && !veg) {
      const wl = this.world.waterLevel(P.pos.x, P.pos.z);
      const fwdX = P.pos.x + dir.x * 2.2, fwdZ = P.pos.z + dir.z * 2.2;
      const wl2 = this.world.waterLevel(fwdX, fwdZ);
      if ((wl2 > this.world.height(fwdX, fwdZ) + 0.2 && Math.abs(wl2 - P.pos.y) < 2.5 && dir.y < 0.1) || P.inWater) water = wl || wl2;
    }

    if (target) {
      prompt = target.label;
      if (E || (target.kind === 'crystal' && LMB && sel === 'pickaxe')) this._useTarget(target, E, dt);
      if (target.kind === 'crystal') progress = target.h.hits / target.h.need;
    } else if (creatureHit) {
      const c = creatureHit.creature;
      prompt = weapon ? `<kbd>LMB</kbd>Attack ${c.spec.name}` : c.spec.name;
      if (LMBp && this.tools.startSwing(it && it.tool === 'spear' ? 0.45 : 0.55)) {
        setTimeout(() => {
          const dmg = (it && it.damage) || 4;
          const mult = creatureHit.part === 'head' ? 1.6 : 1;
          c.damage(dmg * mult, 'player');
          this.onHit(c, dmg * mult);
          if (weapon) inv.wear(sel, 2);
        }, 180);
      }
    } else if (veg) {
      const T = veg.type;
      const tool = it && it.tool;
      const needsTool = T.tough && tool !== 'pickaxe';
      const isTree = T.tree;
      const yieldsTxt = Object.keys(T.yields).map((k) => ITEMS[k].name.toLowerCase()).join(', ');
      if (needsTool) prompt = `Boulder — needs a pickaxe`;
      else if (isTree && tool !== 'axe') prompt = `<kbd>E</kbd>Gather branches · an axe fells trees`;
      else prompt = isTree || T.rock ? `<kbd>LMB</kbd>${isTree ? 'Chop' : 'Mine'} (${yieldsTxt})` : `<kbd>E</kbd>Gather ${yieldsTxt}`;
      progress = this.vegetation.inst[veg.ti].hits[veg.i] / T.hits;
      if (!needsTool) {
        if ((isTree && tool === 'axe') || (T.rock && !T.small && tool === 'pickaxe')) {
          if (LMB && this.tools.startSwing(0.55)) {
            const v = veg;
            setTimeout(() => this._harvest(v, tool === 'axe' || tool === 'pickaxe' ? 2 : 1, sel), 220);
          }
        } else if (E) {
          if (isTree) {
            this.tools.startSwing(0.4);
            if (Math.random() < 0.55) { inv.add('wood', 1); this._gain('wood', 1); } else this.hud.toast('You snap off a few twigs…', '');
            this.audio.chop(false);
            this.effects.leaves(new THREE.Vector3(veg.x, veg.y + 4, veg.z));
          } else this._harvest(veg, 99, sel);
        }
      }
    } else if (water) {
      prompt = `<kbd>E</kbd>Drink` + (inv.count('waterskin') ? ' · refill waterskin' : '');
      if (E) {
        P.thirst = Math.min(100, P.thirst + 35);
        if (inv.count('waterskin')) inv.charges.waterskin = 5;
        this.audio.drink();
      }
    }

    // ---- use items (eat / heal / drink / throw)
    if (!prompt || (!target && !creatureHit && !veg)) {
      if (it && (it.food || it.heal) && LMBp) this.useConsumable(sel);
      if (sel === 'waterskin' && LMBp) {
        if ((inv.charges.waterskin || 0) > 0) { inv.charges.waterskin--; P.thirst = Math.min(100, P.thirst + 30); this.audio.drink(); this.hud.toast(`Waterskin: ${inv.charges.waterskin}/5`, ''); }
        else this.hud.toast('The waterskin is empty. Refill it at a river or lake.', 'warn');
      }
    }
    if (it && it.tool === 'spear' && I.mouse.right && LMBp && !this.uiOpen) {
      this.tools.throwSpear(sel, it.throwDamage);
      inv.remove(sel, 1);
      if (inv.count(sel) > 0) inv.hotbar[inv.sel] = sel;
      inv._emit();
    }
    this.hud.prompt(prompt, progress && progress > 0 ? progress : null);
  }

  _useTarget(t, E, dt) {
    const inv = this.inventory;
    const P = this.player;
    if (t.kind === 'artifact') {
      this._takeArtifactVisual(t.a);
      this.journal.tablets.add(t.a.id);
      inv.add('tablet', 1);
      this.hud.toast(`🗿 You recovered the <b>${t.a.name}</b> (${this.journal.tablets.size}/4).`, 'big');
      if (this.journal.tablets.size === 1) setTimeout(() => this.hud.toast('Its glyphs match the great henge on the Sunplain…', ''), 3000);
      this.audio.discover();
      this.save();
    } else if (t.kind === 'pickup') {
      t.p.taken = true;
      t.p.mesh.parent && t.p.mesh.parent.remove(t.p.mesh);
      inv.add(t.p.item, t.p.count);
      if (t.p.item === 'fossil') { this.journal.fossils++; this.hud.toast(`🐚 Found a <b>${t.p.label}</b> (${this.journal.fossils}/5 fossils).`, 'big'); this.audio.discover(); }
      else { this._gain(t.p.item, t.p.count); this.audio.pickup(); }
    } else if (t.kind === 'crystal') {
      if (this.inventory.selected !== 'pickaxe') return;
      if (!this.tools.startSwing(0.55)) return;
      const h = t.h;
      setTimeout(() => {
        h.hits++;
        this.audio.chop(true);
        this.effects.sparks(h.pos.clone().setY(h.pos.y + 0.6));
        if (h.hits >= h.need) {
          h.taken = true;
          h.mesh.visible = false;
          inv.add('crystal', 2);
          this._gain('crystal', 2);
          inv.wear('pickaxe', 4);
        }
      }, 220);
    } else if (t.kind === 'altar' && E) {
      let placed = 0;
      for (const id of this.journal.tablets) {
        if (this.journal.placed.has(id)) continue;
        this.journal.placed.add(id);
        this._fillSocket(id);
        inv.remove('tablet', 1);
        placed++;
      }
      if (placed) {
        this.audio.discover();
        this.hud.toast(`The tablets slide into place (${this.journal.placed.size}/4).`, 'big');
        if (this.journal.placed.size >= 4 && !this.journal.altarDone) this._awakenAltar();
        this.save();
      }
    } else if (t.kind === 'carcass' && E) {
      const c = t.c;
      const fast = ['axe', 'spear', 'obsidian_spear'].includes(inv.selected);
      const take = (k, n) => { const m = Math.min(c.carcass[k], n); if (m > 0) { c.carcass[k] -= m; const id = k === 'meat' ? 'meat_raw' : k; inv.add(id, m); this._gain(id, m); } };
      take('meat', fast ? 3 : 1); take('hide', fast ? 2 : 1); take('bone', 1);
      this.effects.blood(c.pos.clone().setY(c.pos.y + 1), 10);
      this.audio.chop(false);
      if (c.carcass.meat <= 0 && c.carcass.hide <= 0 && c.carcass.bone <= 0) { c.carcass = null; c.deadTime = 590; }
    } else if (t.kind === 'campfire' && E) {
      const n = inv.count('meat_raw');
      if (n) { inv.remove('meat_raw', n); inv.add('meat_cooked', n); this.hud.toast(`Cooked ${n} meat.`, 'good'); this.audio.craft(); }
    }
    void P; void dt;
  }

  _harvest(v, power, sel) {
    const inv = this.inventory;
    const r = this.vegetation.hit(v.ti, v.i, power, this.time);
    if (!r) return;
    const T = r.type;
    const pos = new THREE.Vector3(v.x, v.y + (T.tree ? 1.2 : 0.4), v.z);
    if (T.tree) { this.audio.chop(false); this.effects.chips(pos, [0.45, 0.32, 0.2]); this.effects.leaves(pos.clone().setY(v.y + 6)); }
    else if (T.rock) { this.audio.chop(true); this.effects.chips(pos, [0.4, 0.4, 0.4]); if (!T.small) this.effects.sparks(pos); }
    else this.audio.pickup();
    if (sel && (T.tree || (T.rock && !T.small))) inv.wear(sel, 1);
    if (r.done) {
      for (const [k, n] of Object.entries(r.yields)) { inv.add(k, n); this._gain(k, n); }
      if (T.tree) { this.effects.puff(pos, [0.4, 0.35, 0.3], 8, 2); this.audio.thud(pos, 0.4); }
    }
  }

  _gain(id, n) {
    const it = ITEMS[id];
    this.hud.toast(`+${n} ${it.icon} ${it.name}`, 'good');
    this.audio.pickup();
  }

  useConsumable(id) {
    const it = ITEMS[id];
    const P = this.player;
    const inv = this.inventory;
    if (!it || !inv.count(id)) return;
    if (it.food) {
      P.hunger = Math.min(100, P.hunger + it.food);
      if (it.water) P.thirst = Math.min(100, P.thirst + it.water);
      if (it.sick && Math.random() < 0.5) { P.damage(8, 'food poisoning'); this.hud.toast('That raw meat did not agree with you.', 'warn'); }
      inv.remove(id, 1);
      this.audio.eat();
      this.tools.startSwing(0.4);
    } else if (it.heal) {
      P.health = Math.min(100, P.health + it.heal);
      inv.remove(id, 1);
      this.audio.craft();
    }
  }

  _takeArtifactVisual(a) {
    a.taken = true;
    a.mesh.visible = false;
    this.features.lights.remove(a.light);
    a.sparkle.rate = 0;
  }

  _fillSocket(id, silent) {
    const s = this.features.altar && this.features.altar.sockets.find((x) => x.id === id);
    if (!s) return;
    s.mesh.visible = true;
    s.mesh.material.emissive.setRGB(0.6, 1.6, 2.4);
    if (!silent) this.effects.puff(s.mesh.position, [0.6, 0.9, 1], 8, 1);
  }

  _awakenAltar(silent) {
    const A = this.features.altar;
    this.journal.altarDone = true;
    A.beam.visible = true;
    A.beam.material.opacity = 0.35;
    this.features.lights.add({ pos: A.pos.clone().setY(A.pos.y + 3), color: new THREE.Color(0.6, 0.85, 1), intensity: 3000, range: 60 });
    this.effects.addEmitter({ type: 'sparkle', pos: A.pos.clone(), rate: 20, radius: 6, height: 10, range: 600 });
    if (!silent) {
      this.player.shake = 1;
      this.audio.discover();
      setTimeout(() => this.hooks.onEnding && this.hooks.onEnding(), 2500);
    }
  }

  onHit(c, dmg) {
    this.hud.hitmarker();
    this.audio.hit();
    void dmg;
  }

  onCreatureKilled(c) {
    this.hud.toast(`You brought down a ${c.spec.name}. Press <kbd>E</kbd> on the carcass to butcher it.`, 'good');
  }

  discover(spec) {
    if (this.journal.creatures.has(spec.id)) return;
    this.journal.creatures.add(spec.id);
    this.hud.toast(`${spec.icon} New species recorded: <b>${spec.name}</b> (J)`, 'big');
    this.audio.discover();
  }

  discoverPlace(name) {
    if (!name || this.journal.places.has(name)) return;
    this.journal.places.add(name);
    if (this.started) this.save();
  }

  compassPois() {
    const out = [];
    if (this.features.altar) out.push({ x: this.features.altar.pos.x, z: this.features.altar.pos.z, icon: '☀', name: 'Sundial Henge', color: '#ffe08a' });
    for (const p of this.building.pieces) if (p.type === 'shelter' || p.type === 'campfire') { out.push({ x: p.x, z: p.z, icon: '⌂', name: 'Camp', color: '#ff9a48' }); break; }
    for (const a of this.features.artifacts) if (!a.taken && this.journal.places.has(this.world.pads.find((p) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z) < 60)?.name)) out.push({ x: a.pos.x, z: a.pos.z, icon: '◆', name: a.name, color: '#8fd8ff' });
    return out;
  }

  // ------------------------------------------------------------------ sleep / death
  trySleep() {
    const sh = this.building.nearest(this.player.pos, ['shelter'], 4);
    if (!sh) { this.hud.toast('You need to be in a shelter to sleep.', 'warn'); return; }
    const h = this.sky.timeOfDay;
    if (h > 6 && h < 18.5) { this.hud.toast('You can only sleep at dusk or night.', ''); return; }
    const danger = this.creatures.list.some((c) => c.alive && c.spec.diet === 'carnivore' && !c.isSwimming && c.pos.distanceTo(this.player.pos) < 60);
    if (danger) { this.hud.toast('You cannot sleep with predators nearby!', 'warn'); return; }
    this.sleeping = true;
    this.respawnPoint = new THREE.Vector3(sh.x, sh.y, sh.z);
  }

  _sleepTick(dt) {
    this.fade = Math.min(0.92, this.fade + dt * 1.5);
    const h = this.sky.timeOfDay;
    if (h > 6.5 && h < 9) {
      this.sleeping = false;
      this.player.health = Math.min(100, this.player.health + 30);
      this.player.stamina = 100;
      this.hud.toast(`Day ${this.day}. You wake rested.`, 'good');
      this.save();
    }
  }

  onPlayerDeath(cause) {
    this.hooks.onDeath && this.hooks.onDeath(cause);
  }

  respawn() {
    const P = this.player;
    const sp = this.respawnPoint || new THREE.Vector3(PLAYER_START.x, 0, PLAYER_START.z);
    P.spawn(sp.x + 1.5, sp.z + 1.5, P.yaw);
    Object.assign(P, { health: 70, stamina: 100, hunger: Math.max(P.hunger, 40), thirst: Math.max(P.thirst, 40), warmth: 100, oxygen: 100 });
    // predators lose interest
    for (const c of this.creatures.list) if (c.target === 'player') { c.target = null; c.setState('wander'); }
  }
}

const NO_INPUT = { locked: false, mouse: { dx: 0, dy: 0 }, down: () => false, hit: () => false };
const _tmp = new THREE.Vector3();
void CAVES;

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
