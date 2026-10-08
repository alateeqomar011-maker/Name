// Primeval: The Lost Frontier — game bootstrap and main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './ui/style.css';
import { GodRaysPass, WaterPass, CinematicPass } from './systems/postfx.js';

import { Emitter } from './core/events.js';
import { Input } from './core/input.js';
import { Clock } from './core/clock.js';
import { World } from './world/world.js';
import { REGIONS, BIOME, VOLCANO } from './world/worldgen.js';
import { U } from './world/shaderlib.js';
import { installAtmosphere, updateAtmosphere } from './world/atmosphere.js';
import { Terrain } from './world/terrain.js';
import { loadTerrainTextures } from './world/materials.js';
import { TerrainShadow } from './world/terrainShadow.js';
import { FloraLibrary } from './world/flora.js';
import { Vegetation } from './world/vegetation.js';
import { Grass } from './world/grass.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { POIs } from './world/pois.js';
import { Caves } from './world/caves.js';
import { AmbientLife } from './world/ambient.js';
import { Volcano } from './world/volcano.js';
import { ImpostorForest } from './world/impostors.js';
import { DinoManager } from './dinos/manager.js';
import { SPECIES, SPECIES_LIST } from './dinos/species.js';
import { Player } from './player/player.js';
import { CameraRig } from './player/camera.js';
import { Vehicles } from './player/vehicles.js';
import { AudioSys } from './audio/audio.js';
import { Inventory } from './systems/inventory.js';
import { Progression } from './systems/progression.js';
import { Journal } from './systems/journal.js';
import { Missions } from './systems/missions.js';
import { Building } from './systems/building.js';
import { Weather } from './systems/weather.js';
import { WorldEvents } from './systems/events.js';
import { PhotoMode } from './systems/photo.js';
import { Interaction } from './systems/interact.js';
import { FX } from './systems/fx.js';
import { UI } from './ui/ui.js';
import { Joystick } from './ui/joystick.js';
import { Teleporter } from './systems/teleport.js';
import { Seasons } from './systems/season.js';

const SAVE_KEY = 'primeval-frontier-save-v1';
const SETTINGS_KEY = 'primeval-frontier-settings';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const QUALITY = {
  low: { lens: 0, texSize: 256, pixelRatio: 0.7, shadow: 1024, shadows: true, treeDist: 340, groundDist: 110, grassCount: 14000, grassRadius: 42, bloom: false, viewScale: 0.8, treeDensity: 0.7, groundDensity: 0.55 },
  medium: { lens: 0.6, texSize: 512, pixelRatio: 1, shadow: 2048, shadows: true, treeDist: 500, groundDist: 160, grassCount: 32000, grassRadius: 58, bloom: true, viewScale: 1, treeDensity: 0.9, groundDensity: 0.8 },
  high: { lens: 1, texSize: 1024, pixelRatio: 1.25, shadow: 4096, shadowExtent: 240, shadows: true, treeDist: 680, groundDist: 210, grassCount: 60000, grassRadius: 72, bloom: true, viewScale: 1.15, treeDensity: 1, groundDensity: 1 },
  ultra: { lens: 1, texSize: 1024, pixelRatio: 2, shadow: 4096, shadowExtent: 300, shadows: true, treeDist: 900, groundDist: 260, grassCount: 95000, grassRadius: 90, bloom: true, viewScale: 1.4, treeDensity: 1.1, groundDensity: 1.25 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uSat: { value: 1.0 }, uWarm: { value: 0 },
    uUnder: { value: 0 }, uAsh: { value: 0 }, uWet: { value: 0 }, uPhoto: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uSat; uniform float uWarm; uniform float uUnder; uniform float uAsh; uniform float uWet; uniform float uPhoto;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uUnder > 0.5) uv += vec2(sin(uv.y * 30.0 + uTime * 2.0), cos(uv.x * 25.0 + uTime * 1.7)) * 0.003;
      // raindrops on the lens
      if (uWet > 0.01) {
        vec2 g = uv * vec2(18.0, 10.0);
        vec2 c = floor(g); vec2 f = fract(g) - 0.5;
        float r = h(c);
        float t = fract(uTime * 0.15 + r);
        float d = length(f + vec2(0.0, t - 0.5) * 0.6);
        float drop = smoothstep(0.12, 0.0, d) * step(0.75, r) * uWet;
        uv += f * drop * 0.05;
      }
      vec2 cq = uv - 0.5;
      float ca = dot(cq, cq) * 0.0022;
      vec4 col = texture2D(tDiffuse, uv);
      col.r = texture2D(tDiffuse, uv - cq * ca * 4.0).r;
      col.b = texture2D(tDiffuse, uv + cq * ca * 4.0).b;
      float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      // filmic split toning: cool shadows, warm highlights
      col.rgb *= mix(vec3(0.94, 0.98, 1.06), vec3(1.05, 1.0, 0.93), smoothstep(0.02, 0.9, l));
      col.rgb = mix(vec3(l), col.rgb, uSat);
      col.rgb += vec3(0.02, 0.008, -0.015) * uWarm;
      col.rgb = mix(col.rgb, col.rgb * vec3(0.55, 0.85, 0.9) + vec3(0.0, 0.03, 0.05), uUnder);
      col.rgb = mix(col.rgb, vec3(l) * vec3(0.9, 0.82, 0.72), uAsh * 0.5);
      vec2 q = vUv - 0.5;
      col.rgb *= 1.0 - dot(q, q) * uVignette * 1.6;
      col.rgb += (h(vUv * 800.0 + uTime) - 0.5) * (0.012 + uPhoto * 0.02);
      gl_FragColor = col;
    }`,
};

installAtmosphere();

class Game extends Emitter {
  constructor() {
    super();
    this.THREE = THREE;
    this.regions = REGIONS;
    this.dinoSpecies = SPECIES;
    this.state = 'loading';
    // phones and tablets start on medium; desktops on high (the dynamic resolution governor adapts further)
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.settings = { quality: coarse ? 'medium' : 'high', volume: 0.8, music: 0.5, sens: 0.0022, fov: 70, invertY: false, dayLength: 24 };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* ignore */ }
    this.quality = { ...QUALITY[this.settings.quality] };
  }

  async boot() {
    const canvas = document.getElementById('game');
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(this._targetPixelRatio());
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // Vogel-disk filtered; softness from light.shadow.radius
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbfd0dd, 0.0006);
    this.scene.background = new THREE.Color(0x87a8c8);
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.15, 9000);
    this.input = new Input(canvas);
    this.audio = new AudioSys();
    this.clock = new Clock();
    addEventListener('resize', () => this.resize());

    const msg = document.querySelector('#loading .msg');
    const fill = document.querySelector('#loading .fill');
    const tips = ['Crouch (C) to sneak past predators — they hear sprinting from far away.', 'Herbivores travel in herds and drink at rivers at regular times.', 'Flares scare off even the largest predators.',
      'Golden-hour photos earn bonus ratings.', 'Higher ground reveals more of your map.', 'Build campfires and spikes — predators avoid well-defended bases.', 'Rain makes the ground slick and mutes your footsteps.',
      'Tracks (E) tell you which species passed by and where it was headed.', 'Without thermal gear, the high peaks will freeze you.'];
    document.getElementById('tip').textContent = '💡 ' + tips[Math.floor(Math.random() * tips.length)];
    const step = async (pct, text) => { fill.style.width = pct + '%'; msg.textContent = text; await new Promise((r) => setTimeout(r, 16)); };

    await step(2, 'Shaping the continent…');
    // photographed materials stream in while the continent is generated
    const texLoad = loadTerrainTextures(renderer, this.quality.texSize || 1024);
    this.world = new World(1337);
    await this.world.generate((p) => { fill.style.width = 2 + p * 40 + '%'; });
    await step(44, 'Painting the land…');
    this.fx = new FX(this);
    this.sky = new Sky(this.scene, renderer);
    await texLoad;
    this.terrain = new Terrain(this.world, this.scene, this.quality);
    this.terrShadow = new TerrainShadow(renderer, this.world);
    await step(52, 'Growing forests…');
    this.flora = new FloraLibrary();
    this.veg = new Vegetation(this.world, this.scene, this.flora, this.quality);
    this.grass = new Grass(this.world, this.scene, this.quality);
    await step(58, 'Filling rivers and oceans…');
    this.water = new Water(this.world, this.scene);
    this.weather = new Weather(this);
    this.cam = new CameraRig(this, this.camera);
    this.progress = new Progression(this);
    this.inventory = new Inventory(this);
    this.journal = new Journal(this);
    this.build = new Building(this);
    this.caves = new Caves(this);
    this.events = new WorldEvents(this);
    this.ui = new UI(this);
    this.player = new Player(this);
    this.vehicles = new Vehicles(this);
    this.photo = new PhotoMode(this);
    this.interact = new Interaction(this);
    this.joystick = new Joystick(this.input);
    this.joystick.setVisible(false);
    this.season = new Seasons(this);
    this.ambient = new AmbientLife(this);
    this.volcano = new Volcano(this);
    this.teleporter = new Teleporter(this);
    this.teleporter.setVisible(false);
    this.impostors = new ImpostorForest(this);
    await step(62, 'Raising ancient ruins…');
    this.pois = new POIs(this);
    this.pois.generate();
    this.pois.build();
    await step(68, 'Evolving dinosaurs…');
    this.dinos = new DinoManager(this);
    await this.dinos.buildTemplates((p) => { fill.style.width = 68 + p * 18 + '%'; msg.textContent = 'Evolving dinosaurs…'; });
    this.dinos.populate();
    this.missions = new Missions(this);
    // start position
    const c = this.pois.camp;
    this.player.pos.set(c.x + 6, this.world.getHeight(c.x + 6, c.z + 10), c.z + 10);
    this.player.respawn.set(c.x + 4, 0, c.z + 4);
    this.mountainSpawn = this._findMountainSpawn();
    this.veg.addExclusion(this.mountainSpawn.x, this.mountainSpawn.z, 12);
    await step(88, 'Building terrain…');
    this.terrain.buildAll(this.player.pos.x, this.player.pos.z);
    for (let i = 0; i < 80; i++) this.veg.update(this.player.pos.x, this.player.pos.z, 0.016, 0);
    this._setupComposer();
    this.applySettings(false);
    await step(94, 'Compiling shaders…');
    this.sky.update(0.016, this.clock.hour, this.weather.skyParams(), this.player.pos, false);
    this.sky.updateEnvironment(true);
    this._titleCam(0);
    try { renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
    await step(100, 'Ready');
    this._showTitleMenu();
    this.state = 'title';
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.frame());
    this.input.onLockChange = (locked) => {
      const h = document.getElementById('lockhint');
      if (h) h.classList.toggle('hidden', locked || this.state !== 'playing' || matchMedia('(pointer: coarse)').matches);
    };
    canvas.addEventListener('click', () => { if (matchMedia('(pointer: coarse)').matches) return; if (this.state === 'playing' && !this.ui.menuOpen && !this.ui.modal) this.input.lock(); });
    addEventListener('keydown', (e) => { if (e.code === 'F5') { e.preventDefault(); if (this.state === 'playing') { this.save(); this.ui.notify('Game saved.', 'good'); } } });
    window.__game = this;
  }

  // A safe, flat, scenic spot in the mountain foothills (below the freezing snowline)
  _findMountainSpawn() {
    const w = this.world;
    let best = null, bs = -Infinity;
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 6000; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 650;
      const x = -180 + Math.cos(a) * r, z = -1380 + Math.sin(a) * r;
      if (!w.inBounds(x, z)) continue;
      const h = w.getHeight(x, z);
      if (w.getBiome(x, z) !== BIOME.MOUNTAIN || h < 90 || h > 240) continue;
      if (w.getNormal(x, z).y < 0.93 || w.waterLevelAt(x, z) > h - 1) continue;
      let flat = true;
      for (let k = 0; k < 12 && flat; k++) { const aa = (k / 12) * Math.PI * 2; for (const rr of [8, 16]) if (Math.abs(w.getHeight(x + Math.cos(aa) * rr, z + Math.sin(aa) * rr) - h) > rr * 0.45) flat = false; }
      if (!flat) continue;
      const score = h - Math.hypot(x + 180, z - -1100) * 0.05;
      if (score > bs) { bs = score; best = { x, z }; }
    }
    return best || { x: this.pois.camp.x + 6, z: this.pois.camp.z + 10 };
  }

  _showTitleMenu() {
    document.getElementById('loading').classList.add('hidden');
    const menu = document.getElementById('titleMenu');
    menu.classList.remove('hidden');
    document.getElementById('title').classList.add('bgless');
    const has = !!localStorage.getItem(SAVE_KEY);
    const bc = document.getElementById('btnContinue');
    bc.disabled = !has;
    bc.onclick = () => this.start(true);
    document.getElementById('btnNew').onclick = () => this.start(false);
    const bq = document.getElementById('btnQuality');
    const label = () => (bq.textContent = 'Graphics: ' + this.settings.quality[0].toUpperCase() + this.settings.quality.slice(1));
    label();
    bq.onclick = () => {
      const order = ['low', 'medium', 'high', 'ultra'];
      this.settings.quality = order[(order.indexOf(this.settings.quality) + 1) % order.length];
      label();
      this.applySettings(true);
    };
    document.getElementById('btnControls').onclick = () => {
      alert('WASD move · Shift sprint · Space jump/glide · C crouch · V camera view · E interact (hold to gather) · F vehicles · P photo mode · B build · Tab pack/crafting · M map · J journal · N missions · K skills · G summon vehicle · T tracker · L headlamp · 1-5 hotbar · Left click use item · Right mouse binoculars · Esc pause');
    };
  }

  start(load) {
    this.audio.init();
    this.applySettings(false);
    if (load) {
      try { this.load(); } catch (e) { console.error(e); this.ui.notify('Save could not be loaded — starting fresh.', 'warn'); }
    } else {
      localStorage.removeItem(SAVE_KEY);
      this.inventory.add('bandage', 2, true);
      this.inventory.add('flare', 3, true);
      this.inventory.add('berries', 4, true);
      // New expeditions begin up in the Titan Range mountains
      const m = this.mountainSpawn;
      this.player.pos.set(m.x, this.world.getHeight(m.x, m.z), m.z);
      this.terrain.buildAll(m.x, m.z);
      for (let i = 0; i < 80; i++) this.veg.update(m.x, m.z, 0.016, 0);
      const c = this.pois.camp;
      this.cam.yaw = Math.atan2(c.x - m.x, c.z - m.z);
    }
    document.getElementById('title').classList.add('hidden');
    document.getElementById('hud').classList.remove('off');
    this.state = 'playing';
    this.input.lock();
    this.cam.pitch = -0.28;
    if (!load) this.ui.banner('TITAN RANGE', 'The mountains · Day 1');
    this.journal.regions.add(this.world.regionAt(this.player.pos.x, this.player.pos.z).id);
    this.autosaveT = 60;
  }

  newGame() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }

  _setupComposer() {
    const r = this.renderer;
    this.composer = new EffectComposer(r);
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height);
      rt.depthTexture.type = THREE.UnsignedIntType;
    }
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.waterPass = new WaterPass(this.scene, this.camera);
    this.composer.addPass(this.waterPass);
    // depth of field + camera motion blur on the finished scene (passes depth through)
    this.cine = new CinematicPass(this.camera);
    this.composer.addPass(this.cine);
    this.godRays = new GodRaysPass();
    this.composer.addPass(this.godRays);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.24, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  applySettings(qualityChanged = false) {
    const S = this.settings;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
    if (qualityChanged) {
      Object.assign(this.quality, QUALITY[S.quality]);
      this.resScale = 1;
      this.resize();
      // rebuild grass and vegetation density
      if (this.grass) { this.scene.remove(this.grass.mesh); this.grass.mesh.geometry.dispose(); this.grass = new Grass(this.world, this.scene, this.quality); }
      if (this.veg) { for (const [k, cell] of this.veg.cells) { this.veg._setLoaded(cell.cx, cell.cz, false); this.veg._disposeLayer(cell.trees); if (cell.ground) this.veg._disposeLayer(cell.ground); } this.veg.cells.clear(); }
      if (this.impostors) this.impostors.reset();
    }
    this.sky.setShadowQuality(this.quality.shadow, this.quality.shadows, this.quality.shadowExtent || 180);
    if (this.bloom) this.bloom.enabled = this.quality.bloom;
    if (this.waterPass) this.waterPass.ao = !!this.quality.bloom;
    this.audio.setVolume(S.volume);
    this.audio.setMusicVolume(S.music);
    this.input.sensitivity = S.sens;
    this.input.invertY = S.invertY;
    this.cam.baseFov = S.fov;
    this.clock.hourLength = (S.dayLength * 60) / 24;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); }
  }

  _targetPixelRatio() {
    return Math.max(0.45, Math.min(window.devicePixelRatio, this.quality.pixelRatio) * (this.resScale || 1));
  }

  // Dynamic resolution: keep frame times near target by stepping the render scale with hysteresis.
  _governResolution(rawDt) {
    if (!this.composer || this.state !== 'playing' || document.hidden || rawDt > 0.25) return;
    this.resScale = this.resScale || 1;
    this._ft = this._ft === undefined ? rawDt : this._ft * 0.95 + rawDt * 0.05;
    this._resT = (this._resT || 0) + rawDt;
    if (this._resT < 3) return;
    const ms = this._ft * 1000;
    let next = this.resScale;
    if (ms > 24) next = Math.max(0.6, this.resScale - 0.1);
    else if (ms < 14.5) next = Math.min(1, this.resScale + 0.05);
    if (Math.abs(next - this.resScale) > 0.001) { this.resScale = next; this._resT = 0; this.resize(); }
    else this._resT = 2;
  }

  requestCapture(cb) { this._capture = cb; }

  // ---------- Main loop ----------
  frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);
    if (this.state === 'title') this._titleFrame(dt);
    else if (this.state === 'playing') this._playFrame(dt);
    this._render(dt);
    this.input.endFrame();
  }

  _titleCam(t) {
    const c = this.pois.camp;
    const a = t * 0.02 + 0.6;
    const cx = c.x + Math.cos(a) * 140, cz = c.z + Math.sin(a) * 140;
    const h = Math.max(this.world.getHeight(cx, cz), 0) + 38;
    this.camera.position.set(cx, h, cz);
    this.camera.lookAt(c.x, this.world.getHeight(c.x, c.z) + 15, c.z);
  }

  _titleFrame(dt) {
    this._tt = (this._tt || 0) + dt;
    this._titleCam(this._tt);
    U.uTime.value += dt;
    this._worldUpdate(dt, true);
  }

  _hotkeys() {
    const I = this.input, ui = this.ui;
    if (ui.modal) return;
    if (I.hit('Tab') || I.hit('KeyI')) ui.toggleMenu('inventory');
    if (I.hit('KeyM')) ui.toggleMenu('map');
    if (I.hit('KeyJ')) ui.toggleMenu('journal');
    if (I.hit('KeyN')) ui.toggleMenu('missions');
    if (I.hit('KeyK')) ui.toggleMenu('skills');
    if (I.hit('Escape')) { if (ui.menuOpen) ui.closeMenu(); else if (!I.locked) ui.openMenu('settings'); }
    if (ui.menuOpen || !this.player.alive) return;
    if (I.hit('KeyV')) this.cam.toggle();
    if (I.hit('KeyP')) this.photo.toggle();
    if (I.hit('KeyB')) this.build.toggle();
    if (I.hit('KeyL')) {
      if (this.inventory.gear.has('headlamp')) { this.player.headlamp = !this.player.headlamp; this.audio.play('ui'); }
      else ui.notify('You need a headlamp (craft at a workbench).', 'warn', 2);
    }
    if (I.hit('KeyT')) this._cycleTracker();
    if (I.hit('KeyY')) { this.teleporter.open('travel'); return; }
    if (I.hit('KeyG')) this._summonKey();
    for (let i = 0; i < 5; i++) if (I.hit('Digit' + (i + 1))) { this.inventory.selected = i; this.audio.play('ui'); }
    if (I.hit('KeyU')) { const s = this.build.nearest(4.5); if (s) this.build.upgrade(s); }
    if (I.hit('KeyX')) {
      const s = this.build.nearest(4.5);
      if (s) {
        if (this._demolishArm === s && performance.now() - this._demolishT < 2500) { this.build.demolish(s); this._demolishArm = null; }
        else { this._demolishArm = s; this._demolishT = performance.now(); ui.notify('Press X again to dismantle.', 'warn', 2); }
      }
    }
    if (I.mouse.leftPressed && I.locked && !this.player.photoMode && !this.build.active && !this.player.inVehicle) this.interact.useSelected();
  }

  _summonKey() {
    const owned = this.vehicles.owned();
    if (!owned.length) { this.ui.notify('No vehicles yet — recover blueprints from outposts and research, then craft them.', 'warn', 3); return; }
    const now = performance.now();
    if (this._sumT && now - this._sumT < 1800) this._sumIdx = (this._sumIdx + 1) % owned.length;
    else this._sumIdx = 0;
    this._sumT = now;
    const type = owned[this._sumIdx];
    this.ui.notify(`Summon ${type === 'jeep' ? '🚙 Jeep' : type === 'boat' ? '🚤 Boat' : '🚁 Gyrocopter'}… (G again to switch)`, 'info', 1.6);
    clearTimeout(this._sumTimeout);
    this._sumTimeout = setTimeout(() => this.vehicles.summon(owned[this._sumIdx]), 1600);
  }

  _cycleTracker() {
    if (!this.inventory.gear.has('tracker')) { this.ui.notify('You need a Bio-Tracker (craft at a research station).', 'warn', 2); return; }
    const seen = SPECIES_LIST.filter((s) => this.journal.species[s.id].seen);
    if (!seen.length) { this.ui.notify('Discover species first to calibrate the tracker.', 'warn', 2); return; }
    const cur = this.tracking ? seen.findIndex((s) => s.id === this.tracking.species) : -1;
    if (cur === seen.length - 1) { this.tracking = null; this.ui.notify('Tracker off.', 'info', 1.5); return; }
    this.trackSpecies(seen[cur + 1].id);
  }

  trackSpecies(id) {
    const P = this.player.pos;
    let best = null, bd = Infinity;
    for (const h of this.dinos.herds) { if (h.spec.id !== id || h.count <= 0) continue; const d = Math.hypot(h.x - P.x, h.z - P.z); if (d < bd) { bd = d; best = h; } }
    if (!best) { this.ui.notify(`No ${SPECIES[id].short} signals detected.`, 'warn', 2); this.tracking = null; return; }
    this.tracking = { species: id, herd: best, x: best.x, z: best.z, label: SPECIES[id].short };
    this.ui.notify(`📡 Tracking ${SPECIES[id].short} — ${Math.round(bd)} m away.`, 'good', 2.5);
  }

  _playFrame(dt) {
    const ui = this.ui;
    this._hotkeys();
    const paused = ui.menuOpen || ui.modal;
    this.joystick.setVisible(!paused && this.player.alive);
    this.teleporter.setVisible(!paused && this.player.alive && !this.player.photoMode);
    if (paused) return;
    U.uTime.value += dt;
    const { wrapped } = this.clock.tick(dt);
    void wrapped;
    const I = this.input;
    // night survival tracking
    const hr = this.clock.hour;
    if (hr > 20 && hr < 20.5 && !this._nightArmed) { this._nightArmed = true; this._nightWatch = true; }
    if (hr > 6 && hr < 6.5 && this._nightArmed) {
      this._nightArmed = false;
      if (this._nightWatch && this.player.alive) { this.progress.stats.nightsSurvived++; this.emit('night-survived'); this.ui.notify('🌅 You survived the night.', 'good'); }
    }
    this.player.update(dt, I, this.cam.yaw);
    this.vehicles.update(dt, I);
    this.cam.update(dt, I);
    this.photo.update(dt, I);
    this.build.update(dt, I);
    if (!this.build.active) this.interact.update(dt, I);
    this.joystick.setTakeLabel(this.build.active ? null : this.interact.current);
    this.interact.updateProjectiles(dt);
    // tracker refresh
    if (this.tracking) { const h = this.tracking.herd; if (h.count <= 0) this.tracking = null; else { this.tracking.x = h.x; this.tracking.z = h.z; } }
    // storm exposure
    if (this.weather.local.lightning > 0.1 && !this.caves.active && !this.player.inVehicle) this.emit('storm-time', { n: dt });
    this._worldUpdate(dt, false);
    this.events.update(dt);
    this.journal.update(dt);
    this.missions.update(dt);
    ui.update(dt);
    // autosave
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) { this.autosaveT = 60; if (this.player.alive) this.save(); }
  }

  _worldUpdate(dt, title) {
    const P = title ? this.camera.position : this.player.inVehicle ? this.player.inVehicle.pos : this.player.pos;
    const inCave = !!this.caves.active;
    this.weather.update(dt, dt);
    const wp = this.weather.skyParams();
    if (this.events.ashTint > 0.05) { wp.tint = new THREE.Color(0.45, 0.35, 0.3); wp.tintAmt = this.events.ashTint; wp.fogTint = wp.tint; wp.cloud = Math.max(wp.cloud, this.events.ashTint); }
    this.sky.update(dt, this.clock.hour, wp, P, inCave);
    if (this.terrShadow) this.terrShadow.update(dt, this.sky.lightDir);
    this.sky.follow(this.camera.position);
    const mist = inCave ? 0 : this._mist(P);
    updateAtmosphere(this.camera, this.sky.sunDir, this.sky.sun.color.clone().multiplyScalar(Math.min(1.4, this.sky.sun.intensity / 2.4)), inCave ? 0 : this.weather.local.cloud, this.sky.cloudOffset, inCave ? 0.6 : 1 + this.weather.local.fog * 0.15, mist, this._mistBase || 0);
    this.sky.updateEnvironment();
    if (!inCave) {
      this.terrain.update(P.x, P.z);
      this.veg.update(P.x, P.z, dt, this.clock.elapsed);
      this.grass.update(this.camera.position);
      this.grass.setPushers(this._grassPushers(title));
      this.water.update(dt, this.camera.position, this.weather, this.sky.uniforms.uZenith.value);
      if (!title) this.water.emitPlayer(dt, this.player);
    }
    // fog
    const fog = this.scene.fog;
    if (!inCave) {
      fog.color.copy(this.sky.fogColor);
      fog.density = this.weather.fogDensity(this.camera.position) * (1 + this.events.ashTint * 3);
      if (this.cam.underwater) { fog.color.setRGB(0.03, 0.16, 0.19).multiplyScalar(0.3 + this.sky.dayFactor * 0.7); fog.density = 0.07; }
    }
    this.water.setUnderwater(this.cam.underwater);
    U.uFogColor.value.copy(fog.color);
    U.uFogDensity.value = fog.density;
    this.scene.background = fog.color;
    // dinosaurs
    const p = this.player;
    const night = this.sky.dayFactor < 0.3;
    const vis = (night ? 0.7 : 1) * (1 - Math.min(0.4, this.weather.local.fog * 0.06)) * (this.weather.local.rain > 0.5 ? 0.85 : 1);
    this.dinos.update(dt, { player: title ? { pos: new THREE.Vector3(0, -999, 0), alive: false } : p, playerNoise: title ? 0 : p.noise(), visibility: vis, night });
    this.pois.update(dt);
    this.fx.update(dt);
    this.ambient.update(dt, P);
    this.volcano.update(dt);
    this.season.update(dt);
    this.impostors.update();
    // audio environment
    if (!title) this._audioEnv(dt);
    // grading
    {
      const sd = this.sky.sunDir;
      const dayish = Math.max(0, Math.min(1, (sd.y + 0.02) * 4));
      const strength = inCave || this.cam.underwater ? 0 : dayish * (1 - this.weather.local.cloud * 0.75) * (1 - this.weather.local.rain * 0.5);
      const sc = this.sky.uniforms.uGlow.value.clone().multiplyScalar(0.5).add(U.uSunColor.value.clone().multiplyScalar(0.6));
      this.godRays.setup(this.camera, sd, sc, strength, this.camera.aspect);
      this.godRays.enabled = !!this.quality.bloom; // also sanitises the frame before bloom
    }
    if (this.cine) {
      // focus on the explorer in third person, on the distance ahead otherwise
      const third = this.cam.mode === 'third' && !this.player.inVehicle;
      const focus = third ? Math.max(1.5, this.camera.position.distanceTo(this.player.pos) + 0.2) : 25;
      const lens = this.quality.lens ?? 0;
      const arriving = this.cam.arrival ? 1 : 0;
      const photo = this.player.photoMode ? 1 : 0;
      this.cine.enabled = lens > 0 && !this.cam.underwater;
      this.cine.setup(focus, lens * (1 + arriving * 0.6 + photo * 0.4), 1 + photo, (this.settings.motionBlur === false ? 0 : 1) * (lens > 0.5 ? 1 : 0.6), dt);
    }
    const G = this.grade.uniforms;
    G.uTime.value = U.uTime.value;
    G.uUnder.value = this.cam.underwater ? 1 : 0;
    G.uAsh.value = this.events.ashTint || 0;
    G.uWet.value = !title && this.cam.mode === 'first' && !inCave && !this.player.inVehicle ? this.weather.local.rain * 0.8 : 0;
    G.uPhoto.value = this.player.photoMode ? 1 : 0;
    G.uWarm.value = this.sky.dayFactor * (1 - this.weather.local.cloud);
    // snow throws back far more light: expose a touch lower in winter
    const baseExp = (inCave ? 1.5 : 0.95 + (1 - this.sky.dayFactor) * 0.5) * (1 - U.uWinter.value * 0.2);
    // eye adaptation: measured scene luminance gently opens up in shade and stops down in glare
    if (this.godRays && this.godRays.enabled) {
      // calibrated so an open sunlit meadow sits at 1.0; nights may only open up a little
      const key = 0.4 / Math.max(0.02, this.godRays.avgLum);
      const target = Math.min(1 + 0.45 * this.sky.dayFactor, Math.max(0.78, Math.pow(key, 0.5)));
      this._adapt = (this._adapt || 1) + (target - (this._adapt || 1)) * (1 - Math.exp(-dt * 1.2));
    } else this._adapt = 1;
    this.renderer.toneMappingExposure = baseExp * this._adapt;
    // ground bounce: the hemisphere light's lower half takes the colour of the ground around the camera
    this._bounceT = (this._bounceT || 0) - dt;
    if (this._bounceT <= 0) {
      this._bounceT = 0.5;
      const w = this.world, c = this.camera.position, tmp = [0, 0, 0];
      const b = this._bounce || (this._bounce = new THREE.Color());
      let r = 0, gg = 0, bb = 0;
      for (let k = 0; k < 9; k++) {
        const x = c.x + ((k % 3) - 1) * 10, z = c.z + (Math.floor(k / 3) - 1) * 10;
        if (!w.inBounds(x, z)) continue;
        w.colorLinear(w.cellIndex(x, z), tmp);
        r += tmp[0]; gg += tmp[1]; bb += tmp[2];
      }
      b.setRGB(r / 9, gg / 9, bb / 9).lerp(new THREE.Color(0.62, 0.65, 0.7), U.uWinter.value * 0.85);
    }
    if (!inCave && this._bounce) this.sky.hemi.groundColor.copy(this._bounce).multiplyScalar(1.9 * (0.08 + 0.92 * this.sky.dayFactor));
  }

  // dawn ground mist: pools in low ground, heavier in swamps/jungles, autumn and after rain; wind and sun burn it off
  _mist(P) {
    const h = this.clock.hour;
    const dawn = smooth(4.3, 6.2, h) * (1 - smooth(7.6, 10.2, h));
    const dusk = smooth(19.2, 21.5, h) * 0.35 + (h > 21.5 || h < 4.3 ? 0.3 : 0);
    this._mistT = (this._mistT || 0) - 1;
    if (this._mistT <= 0) {
      this._mistT = 30;
      const w = this.world;
      let s = 0, n = 0;
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; for (const r of [120, 300]) { s += Math.max(w.seaLevel, w.getHeight(P.x + Math.cos(a) * r, P.z + Math.sin(a) * r)); n++; } }
      this._mistBase = s / n - 6;
      const b = w.getBiome(P.x, P.z);
      this._mistHum = { [BIOME.SWAMP]: 1.5, [BIOME.JUNGLE]: 1.15, [BIOME.FOREST]: 0.95, [BIOME.PINEFOREST]: 1.0, [BIOME.GRASSLAND]: 0.75, [BIOME.RIVER]: 1.2, [BIOME.MOUNTAIN]: 0.6, [BIOME.DESERT]: 0.1, [BIOME.CANYON]: 0.15, [BIOME.VOLCANIC]: 0.3 }[b] ?? 0.6;
    }
    const L = this.weather.local;
    const season = 1 + U.uAutumn.value * 0.4 + U.uWinter.value * 0.25;
    return Math.max(0, (dawn + dusk) * this._mistHum * season * (1 - Math.min(0.85, L.wind * 0.8)) + this.weather.wet * 0.25 * dawn) * 1.0;
  }

  _grassPushers(title) {
    const out = this._pushList || (this._pushList = []);
    out.length = 0;
    const p = this.player;
    if (!title) {
      if (p.inVehicle) out.push({ x: p.inVehicle.pos.x, y: p.inVehicle.pos.y, z: p.inVehicle.pos.z, r: 2.6 });
      else if (p.alive) out.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, r: p.crouch ? 0.9 : 0.75 });
    }
    const c = this.camera.position;
    const near = [];
    for (const d of this.dinos.active) {
      if (d.flyer || d.marine || !d.alive) continue;
      const dd = Math.hypot(d.pos.x - c.x, d.pos.z - c.z);
      if (dd < 60) near.push([dd, d]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, d] of near) { if (out.length >= 8) break; out.push({ x: d.pos.x, y: d.pos.y, z: d.pos.z, r: Math.max(0.8, d.radius * 1.6) }); }
    return out;
  }

  _audioEnv(dt) {
    const g = this;
    const P = this.player.pos;
    const w = this.world;
    this._aeT = (this._aeT || 0) - dt;
    if (this._aeT <= 0) {
      this._aeT = 0.5;
      let sea = 0;
      for (let a = 0; a < 8; a++) { const x = P.x + Math.cos(a) * 70, z = P.z + Math.sin(a) * 70; if (w.getHeight(x, z) < -0.5) sea++; }
      const rq = w.gen.riverQuery(P.x, P.z, {});
      let fall = 0;
      for (const f of this.water.waterfalls) fall = Math.max(fall, 1 - Math.hypot(f.bx - P.x, f.bz - P.z) / 260);
      const b = w.getBiome(P.x, P.z);
      const grp = { [BIOME.FOREST]: 'forest', [BIOME.PINEFOREST]: 'forest', [BIOME.JUNGLE]: 'jungle', [BIOME.GRASSLAND]: 'grass', [BIOME.ISLAND]: 'grass', [BIOME.SWAMP]: 'swamp', [BIOME.MOUNTAIN]: 'mountain', [BIOME.SNOW]: 'mountain', [BIOME.VOLCANIC]: 'mountain', [BIOME.DESERT]: 'desert', [BIOME.CANYON]: 'desert' }[b] || 'beach';
      this._aenv = {
        ocean: sea / 8, river: rq.dist < Infinity ? Math.max(0, 1 - Math.max(0, rq.dist - rq.width / 2) / 70) : 0, fall: Math.max(0, fall), biomeGroup: grp,
        distantCall: () => {
          const herds = g.dinos.herds.filter((h) => h.count > 0 && !h.spec.aquatic && Math.hypot(h.x - P.x, h.z - P.z) < 900 && Math.hypot(h.x - P.x, h.z - P.z) > 150);
          if (!herds.length) return;
          const h = herds[Math.floor(Math.random() * herds.length)];
          g.audio.dinoSound(h.spec, new THREE.Vector3(h.x, w.getHeight(h.x, h.z) + 5, h.z), Math.random() < 0.5 ? 'call' : 'roar');
        },
      };
    }
    const E = this._aenv;
    const hunters = this.dinos.active.some((d) => d.state === 'hunt' && d.prey === 'player');
    this.audio.update(dt, {
      ...E, wind: this.weather.local.wind, rain: this.caves.active ? 0 : this.weather.local.rain, inCave: !!this.caves.active, underwater: this.cam.underwater, altitude: P.y,
      dayFactor: this.sky.dayFactor, danger: hunters ? 1 : 0, fire: this.audio.fire || 0, rumble: (this.audio.rumble || 0) + this.events.shake * 0.5 + (this.volcano ? this.volcano.rumble : 0), underRoof: false,
    }, this.camera);
  }

  _render(dt) {
    const now = performance.now();
    if (this._lastRenderT) this._governResolution((now - this._lastRenderT) / 1000);
    this._lastRenderT = now;
    if (this.quality.bloom || true) this.composer.render(dt);
    if (this._capture) {
      const cb = this._capture;
      this._capture = null;
      const src = this.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 400; c.height = Math.round(400 * (src.height / src.width));
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      let url = '';
      try { url = c.toDataURL('image/jpeg', 0.82); } catch (e) { url = ''; }
      cb(url);
    }
  }

  // ---------- Actions ----------
  sleep() {
    const g = this;
    if (this.dinos.active.some((d) => d.alive && d.isPredator && d.state === 'hunt')) { this.ui.notify('You can’t rest while you are being hunted!', 'warn'); return; }
    this.ui.fade(() => {
      const h = this.clock.hour;
      const hours = h >= 18 || h < 6 ? (h >= 18 ? 24 - h + 6.5 : 6.5 - h) : 3;
      this.clock.advance(hours);
      this._nightWatch = false;
      const p = this.player;
      p.health = Math.min(p.maxHealth, p.health + 40);
      p.stamina = p.maxStamina;
      p.hunger = Math.max(5, p.hunger - hours * 2);
      p.thirst = Math.max(5, p.thirst - hours * 2.5);
      this.ui.notify(`You rested for ${Math.round(hours)} hours.`, 'good');
      this.save();
      g.emit('slept');
    });
  }

  fastTravel(i) {
    const pts = this.build.fastTravelPoints();
    const pt = pts[i];
    if (!pt) return;
    if (this.player.inVehicle) { this.ui.notify('Exit your vehicle first.', 'warn'); return; }
    if (this.dinos.active.some((d) => d.state === 'hunt' && d.prey === 'player')) { this.ui.notify('You are being hunted!', 'warn'); return; }
    if (this.caves.active) this.caves.exit(true);
    if (this.pois.explorerFollowing) this.pois.explorerFollowing.npc.pos.set(pt.x - 2, 0, pt.z - 2);
    this.ui.closeMenu();
    this.ui.fade(() => {
      const d = Math.hypot(pt.x - this.player.pos.x, pt.z - this.player.pos.z);
      this.player.pos.set(pt.x, this.world.getHeight(pt.x, pt.z) + 0.3, pt.z);
      this.player.vel.set(0, 0, 0);
      this.clock.advance(Math.min(4, 0.5 + d / 1500));
      this.terrain.buildAll(pt.x, pt.z);
      this.ui.notify(`Travelled to ${pt.name}.`, 'info');
    });
  }

  // ---------- Save / Load ----------
  save() {
    if (this.state !== 'playing') return;
    try {
      const data = {
        v: 1, clock: this.clock.serialize(), player: this.player.serialize(), cam: { yaw: this.cam.yaw, mode: this.cam.mode },
        inventory: this.inventory.serialize(), progress: this.progress.serialize(), journal: this.journal.serialize(), missions: this.missions.serialize(),
        build: this.build.serialize(), veg: this.veg.serialize(), pois: this.pois.serialize(), caves: this.caves.serialize(), dinos: this.dinos.serialize(),
        weather: this.weather.serialize(), events: this.events.serialize(), vehicles: this.vehicles.serialize(),
      };
      let json = JSON.stringify(data);
      if (json.length > 4_000_000) { data.journal.photos = data.journal.photos.slice(0, 8); json = JSON.stringify(data); }
      localStorage.setItem(SAVE_KEY, json);
    } catch (e) { console.warn('Save failed', e); }
  }

  load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    this.clock.deserialize(d.clock);
    this.inventory.deserialize(d.inventory);
    this.progress.deserialize(d.progress);
    this.journal.deserialize(d.journal);
    this.missions.deserialize(d.missions);
    this.veg.deserialize(d.veg);
    this.build.deserialize(d.build);
    this.pois.deserialize(d.pois);
    this.caves.deserialize(d.caves);
    this.dinos.deserialize(d.dinos);
    this.weather.deserialize(d.weather);
    this.events.deserialize(d.events);
    this.vehicles.deserialize(d.vehicles);
    this.player.deserialize(d.player);
    if (d.cam) { this.cam.yaw = d.cam.yaw; this.cam.mode = d.cam.mode || 'third'; }
    // never resume underground
    const P = this.player.pos;
    P.y = Math.max(P.y, this.world.getHeight(P.x, P.z));
    if (P.y < -100) { const c = this.pois.camp; P.set(c.x + 4, this.world.getHeight(c.x + 4, c.z + 4), c.z + 4); }
    this.terrain.buildAll(P.x, P.z);
    for (const id of Object.keys(this.missions.state)) if (this.missions.state[id].done) this.missions.announced.add(id);
    this.ui.notify(`Welcome back. Day ${this.clock.day}, ${this.clock.label}.`, 'info');
  }
}

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const msg = document.querySelector('#loading .msg');
  if (msg) msg.textContent = 'Failed to start: ' + e.message + ' (WebGL2 is required)';
});
