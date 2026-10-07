// Game orchestrator: owns renderer, world systems, player and the main loop.
import * as THREE from 'three';
import { QUALITY_PRESETS } from './config.js';
import { U } from './render/common.js';
import { noiseTexture, cloudMapTexture } from './render/textures.js';
import { PostFX } from './render/post.js';
import { World } from './world/world.js';
import { Terrain } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { Vegetation } from './world/vegetation.js';
import { Grass } from './world/grass.js';
import { Player } from './player/player.js';
import { Input } from './core/input.js';
import { CreatureManager } from './creatures/manager.js';
import { PLAYER_START } from './world/design.js';

export class Game {
  constructor(canvas, settings, hooks = {}) {
    this.canvas = canvas;
    this.settings = settings;
    this.hooks = hooks;
    this.quality = { ...QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.high };
    this.time = 0; // seconds of game time since start (for respawns etc.)
    this.clock = new THREE.Clock();
    this.uiOpen = false;
    this.paused = true;
    this.started = false;
    this.renderScale = this.quality.pixelRatio;
    this.fpsHist = [];
    this.collidersTmp = [];
    this.systems = [];
    this.timeScale = 1;
  }

  async init(progress) {
    const q = this.quality;
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      reversedDepthBuffer: true,
      stencil: false,
    });
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
    await this.world.generate((f) => progress(0.02 + f * 0.6, 'Raising mountains and carving rivers…'));

    progress(0.64, 'Weaving textures…');
    await tick();
    U.uNoiseTex.value = noiseTexture();
    U.uCloudTex.value = cloudMapTexture();

    this.post = new PostFX(renderer, q);
    this.sky = new Sky(renderer, this.scene, q);
    progress(0.7, 'Sculpting terrain…');
    await tick();
    this.terrain = new Terrain(this.world, q);
    this.scene.add(this.terrain.group);
    this.water = new Water(this.world, this.scene, q);
    progress(0.76, 'Growing forests…');
    await tick();
    this.vegetation = new Vegetation(this.world, this.scene, q);
    this.grass = new Grass(this.scene, q);
    progress(0.84, 'Hatching dinosaurs…');
    await tick();
    this.creatures = new CreatureManager(this);
    this.creatures.populate(q);
    this.systems.push(this.creatures);

    this.input = new Input(this.canvas);
    this.player = new Player(this);
    this.player.sensitivity = 0.0022 * this.settings.sensitivity;
    this.player.invertY = this.settings.invertY;
    this.player.spawn(PLAYER_START.x, PLAYER_START.z, PLAYER_START.yaw);

    this.weather = { cover: 0.55, dark: 0, haze: 0.1, rain: 0, wind: 0.45, fog: 0.00005 };

    if (this.hooks.afterWorld) await this.hooks.afterWorld(this, progress);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    progress(0.96, 'Warming up shaders…');
    await tick();
    this.sky.update(0, this.camera, this.weather);
    this.sky.updateEnvironment(true);
    this.terrain.update(this.camera.position);
    this.renderer.compile(this.scene, this.camera);
    progress(1, 'Ready');
  }

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
    if (this.hooks.preRender) this.hooks.preRender(this, dt, realDt);
    this.render(dt);
    this.input.endFrame();
    this._perf(realDt);
  }

  update(dt) {
    const p = this.player;
    this.sky.advance(dt, this.timeScale);
    if (this.hooks.update) this.hooks.update(this, dt);
    p.update(dt, this.input);
    p.applyCamera(this.camera, dt);
  }

  render(dt) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const camPos = cam.position;
    U.uPlayerPos.value.copy(this.player.pos);
    U.uWindStrength.value = this.weather.wind;
    U.uCloudOffset.value.x += dt * 9 * (0.5 + this.weather.wind);
    U.uCloudOffset.value.y += dt * 4 * (0.5 + this.weather.wind);

    this.sky.update(dt, cam, this.weather);
    this.sky.updateEnvironment();
    this.terrain.update(camPos);
    this.water.update(camPos);
    this.vegetation.update(camPos, dt, this.time);
    for (const s of this.systems) s.update && s.update(dt, camPos);

    // lighting balance
    const day = this.sky.dayFactor;
    this.scene.environmentIntensity = (0.08 + day * 0.92) * (1 - this.weather.dark * 0.35);
    const exposure = THREE.MathUtils.lerp(2.4, 0.52, Math.pow(day, 0.6)) * (1 + this.weather.dark * 0.35);

    this.sky.renderSky(cam);
    const under = this.player.headUnder;
    const fogDensity = this.weather.fog * (this.player.inCave ? 0.15 : 1);
    this.post.render(this.scene, cam, {
      sunDir: this.sky.keyDir,
      sunColor: this.sky.keyColor,
      fogColor: this.sky.horizonColor,
      fogDensity,
      fogFalloff: 0.0045 + this.weather.haze * 0.002,
      fogBase: 0,
      underwater: under,
      waterLevel: this.player.waterLevel,
      time: U.uTime.value,
      shafts: this.sky.useMoon ? 0.25 : 1.0 * (1 - this.weather.dark * 0.6),
      exposure: exposure * (this.exposureMul || 1),
      damage: this.player.damageFlash,
      fade: this.fade || 0,
      saturation: 1.18 - this.weather.dark * 0.3,
      contrast: 1.07,
      tint: this.colorTint,
      bloomStrength: 0.22,
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
        if (this.fps < 42 && this.renderScale > base * 0.6) this.setRenderScale(Math.max(base * 0.6, this.renderScale - 0.08));
        else if (this.fps > 58 && this.renderScale < base) this.setRenderScale(Math.min(base, this.renderScale + 0.04));
      }
    }
  }

  // ---------- physics helpers ----------
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
    if (this.creatures) this.creatures.collide(pos, radius);
    if (this.extraColliders) this.extraColliders(pos, radius, height);
  }

  surfaceAt(pos) {
    const w = this.world;
    if (this.player.inWater) return 'water';
    if (this.player.inCave) return 'rock';
    const b = w.biome(pos.x, pos.z);
    if (b === 'snow') return 'snow';
    if (b === 'beach' || b === 'canyon') return 'sand';
    if (b === 'rock' || b === 'volcanic') return 'rock';
    return 'grass';
  }
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
