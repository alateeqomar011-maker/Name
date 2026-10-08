// Dynamic, region-aware weather: clear skies, clouds, fog, rain, heavy rain, thunderstorms with lightning,
// wind, snow & blizzards in the mountains, sandstorms in the badlands. Surfaces get wet and puddles form.
import * as THREE from 'three';
import { LAYER_OVERLAY } from './postfx.js';
import { U } from '../world/shaderlib.js';
import { BIOME } from '../world/worldgen.js';
import { clamp, lerp, smoothstep } from '../core/noise.js';

export const WEATHER_TYPES = {
  clear: { name: 'Clear', icon: '☀️', cloud: 0.12, dark: 0, rain: 0, wind: 0.2, fog: 0.4, lightning: 0 },
  cloudy: { name: 'Cloudy', icon: '⛅', cloud: 0.55, dark: 0.1, rain: 0, wind: 0.35, fog: 0.6, lightning: 0 },
  overcast: { name: 'Overcast', icon: '☁️', cloud: 0.85, dark: 0.3, rain: 0, wind: 0.4, fog: 0.9, lightning: 0 },
  fog: { name: 'Fog', icon: '🌫️', cloud: 0.6, dark: 0.15, rain: 0, wind: 0.08, fog: 4.5, lightning: 0 },
  rain: { name: 'Rain', icon: '🌧️', cloud: 0.9, dark: 0.45, rain: 0.5, wind: 0.55, fog: 1.6, lightning: 0 },
  heavyrain: { name: 'Heavy Rain', icon: '🌧️', cloud: 1, dark: 0.65, rain: 1, wind: 0.8, fog: 2.6, lightning: 0.02 },
  storm: { name: 'Thunderstorm', icon: '⛈️', cloud: 1, dark: 0.85, rain: 0.9, wind: 1.2, fog: 2.2, lightning: 0.25 },
  windy: { name: 'Windy', icon: '🌬️', cloud: 0.4, dark: 0.05, rain: 0, wind: 1.3, fog: 0.6, lightning: 0 },
};
const TRANSITIONS = {
  clear: [['clear', 3], ['cloudy', 3], ['windy', 1], ['fog', 1]],
  cloudy: [['clear', 2], ['overcast', 2], ['rain', 2], ['windy', 1]],
  overcast: [['rain', 3], ['cloudy', 2], ['heavyrain', 1], ['storm', 1], ['fog', 1]],
  fog: [['clear', 2], ['cloudy', 2], ['overcast', 1]],
  rain: [['heavyrain', 2], ['overcast', 2], ['storm', 1], ['cloudy', 1]],
  heavyrain: [['rain', 2], ['storm', 2], ['overcast', 1]],
  storm: [['heavyrain', 2], ['rain', 2], ['overcast', 1]],
  windy: [['clear', 2], ['cloudy', 2], ['overcast', 1]],
};

const precipVert = /* glsl */ `
uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uSpeed; uniform vec2 uWind; uniform float uLen; uniform float uSnow; uniform float uAmount;
attribute vec4 aSeed;
varying float vA;
void main(){
  vec3 o = aSeed.xyz * uBox;
  float fall = uTime * uSpeed * (0.8 + aSeed.w * 0.4);
  vec3 p = o + vec3(uWind.x * fall * 0.35, -fall, uWind.y * fall * 0.35);
  if (uSnow > 0.5) { p.x += sin(uTime * 1.3 + aSeed.w * 30.0) * 0.6; p.z += cos(uTime * 1.1 + aSeed.w * 20.0) * 0.6; }
  vec3 base = uCam - vec3(uBox * 0.5);
  p = base + mod(p - base, vec3(uBox));
  float keep = step(aSeed.w, uAmount);
  vec3 vel = normalize(vec3(uWind.x * 0.35, -1.0, uWind.y * 0.35));
  vec3 wp = p + vel * position.y * uLen * keep;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  // widen to camera-facing ribbon
  vec3 side = normalize(cross(vel, normalize(cameraPosition - p)));
  mv.xyz += (mat3(viewMatrix) * side) * position.x * (uSnow > 0.5 ? 0.06 : 0.012) * keep;
  vA = keep * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(p - uCam)));
  gl_Position = projectionMatrix * mv;
}`;
const precipFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; varying float vA;
void main(){ gl_FragColor = vec4(uColor, uOpacity * vA); }`;

export class Weather {
  constructor(game) {
    this.game = game;
    this.type = 'clear';
    this.timer = 240;
    this.cur = { ...WEATHER_TYPES.clear };
    this.local = { cloud: 0.1, dark: 0, rain: 0, wind: 0.2, fog: 0.4, snow: 0, dust: 0, lightning: 0 };
    this.wet = 0;
    this.snowCover = 0;
    this.windVec = new THREE.Vector2(1, 0.3).normalize();
    this.windAngle = 0.3;
    this.lightningT = 0;
    this.flash = 0;
    this.override = null; // forced weather from events
    this.precipLabel = '';
    this._buildPrecip();
    this._buildBolt();
  }

  _buildPrecip() {
    const N = 9000;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < N * 4; i++) seeds[i] = Math.random();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = N;
    this.pu = {
      uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: 40 }, uSpeed: { value: 18 }, uWind: { value: new THREE.Vector2() },
      uLen: { value: 0.7 }, uSnow: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0.7, 0.75, 0.82) }, uOpacity: { value: 0.35 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.pu, vertexShader: precipVert, fragmentShader: precipFrag, transparent: true, depthWrite: false });
    this.precip = new THREE.Mesh(geo, mat);
    this.precip.frustumCulled = false;
    this.precip.renderOrder = 6;
    this.precip.layers.set(LAYER_OVERLAY);
    this.game.scene.add(this.precip);
  }

  _buildBolt() {
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xe8eeff, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
    this.bolt = new THREE.Group();
    this.game.scene.add(this.bolt);
  }

  _strike(cam) {
    const g = this.game;
    const ang = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 1200;
    const x = cam.x + Math.cos(ang) * dist, z = cam.z + Math.sin(ang) * dist;
    const gy = Math.max(g.world.getHeight(x, z), 0);
    // jagged bolt
    while (this.bolt.children.length) { const c = this.bolt.children.pop(); c.geometry.dispose(); }
    const pts = [];
    let px = x + (Math.random() - 0.5) * 80, pz = z + (Math.random() - 0.5) * 80, py = gy + 420;
    const segs = 16;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new THREE.Vector3(px, py, pz));
      py = gy + 420 * (1 - (i + 1) / segs);
      px = lerp(px, x, 0.2) + (Math.random() - 0.5) * 30;
      pz = lerp(pz, z, 0.2) + (Math.random() - 0.5) * 30;
      void t;
    }
    pts[pts.length - 1].set(x, gy, z);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 1.6, 4, false), this.boltMat);
    tube.layers.set(LAYER_OVERLAY);
    this.bolt.add(tube);
    this.boltMat.opacity = 1;
    this.flash = 1;
    g.audio.play('thunder', { dist });
    // strikes on forests can ignite fires during storms
    if (dist < 900 && g.events && Math.random() < 0.18) g.events.lightningStrike(x, z);
    g.emit('lightning', { x, z, dist });
  }

  pick() {
    const list = TRANSITIONS[this.type];
    let tot = 0;
    for (const [, w] of list) tot += w;
    let r = Math.random() * tot;
    for (const [t, w] of list) { r -= w; if (r <= 0) return t; }
    return list[0][0];
  }

  set(type, duration = 300) {
    if (!WEATHER_TYPES[type]) return;
    this.type = type;
    this.timer = duration;
    this.game.emit('weather', { type });
  }

  get name() { return this.precipLabel || WEATHER_TYPES[this.type].name; }
  get icon() { return this.precipIcon || WEATHER_TYPES[this.type].icon; }
  get wind() { return this.local.wind; }

  // regional modifiers
  _regional(P, base) {
    const w = this.game.world;
    const b = w.getBiome(P.x, P.z);
    const o = { ...base, snow: 0, dust: 0 };
    this.precipLabel = '';
    this.precipIcon = '';
    const alt = P.y;
    if (b === BIOME.DESERT || b === BIOME.CANYON) {
      // rain rarely reaches the badlands; wind becomes a sandstorm
      o.rain *= 0.15;
      if (base.wind > 0.7 || base.rain > 0.4) { o.dust = clamp((base.wind - 0.5) + base.rain * 0.6, 0, 1); o.fog += o.dust * 5; this.precipLabel = o.dust > 0.4 ? 'Sandstorm' : ''; this.precipIcon = o.dust > 0.4 ? '🌪️' : ''; }
      o.cloud *= 0.6;
    } else if (b === BIOME.JUNGLE) {
      o.rain = Math.min(1, o.rain * 1.3);
      o.fog *= 1.3;
    } else if (b === BIOME.SWAMP) {
      o.fog = o.fog * 1.4 + 1.2;
    }
    if (alt > 220 || b === BIOME.SNOW) {
      const k = smoothstep(220, 280, alt);
      o.snow = Math.max(o.snow, o.rain * k);
      o.rain *= 1 - k;
      o.wind += k * 0.4;
      o.fog += k * (base.rain > 0 ? 2 : 0.3);
      if (o.snow > 0.3) { this.precipLabel = o.snow > 0.7 && base.wind > 0.9 ? 'Blizzard' : 'Snow'; this.precipIcon = '🌨️'; }
    }
    // winter: precipitation falls as snow and gentle flurries drift even under clear skies
    const wint = U.uWinter.value;
    if (wint > 0.05 && b !== BIOME.DESERT && b !== BIOME.CANYON && b !== BIOME.VOLCANIC) {
      o.snow = Math.max(o.snow, (0.16 + o.rain * 0.9) * wint);
      o.rain *= 1 - wint;
      if (o.snow > 0.3) { this.precipLabel = o.snow > 0.7 && base.wind > 0.9 ? 'Blizzard' : 'Snow'; this.precipIcon = '🌨️'; }
    }
    return o;
  }

  update(dt, gameDt) {
    const g = this.game;
    const P = g.player.inVehicle ? g.player.inVehicle.pos : g.player.pos;
    this.timer -= gameDt;
    if (this.timer <= 0 && !this.override) this.set(this.pick(), 200 + Math.random() * 420);
    const target = this.override || WEATHER_TYPES[this.type];
    const k = 1 - Math.exp(-dt / 25);
    for (const key of ['cloud', 'dark', 'rain', 'wind', 'fog', 'lightning']) this.cur[key] = lerp(this.cur[key], target[key], k);
    const reg = this._regional(P, this.cur);
    const k2 = 1 - Math.exp(-dt / 4);
    for (const key of Object.keys(reg)) if (typeof reg[key] === 'number') this.local[key] = lerp(this.local[key] ?? 0, reg[key], k2);
    const L = this.local;
    // wind direction slowly drifts
    this.windAngle += dt * 0.01 * Math.sin(U.uTime.value * 0.01);
    this.windVec.set(Math.cos(this.windAngle), Math.sin(this.windAngle));
    U.uWindDir.value.copy(this.windVec);
    U.uWind.value = L.wind;
    // wetness: rain wets surfaces, sun dries them
    const inCave = g.caves.active;
    if (L.rain > 0.05) this.wet = Math.min(1, this.wet + dt * L.rain * 0.05);
    else this.wet = Math.max(0, this.wet - dt * (0.004 + g.sky.dayFactor * 0.01));
    U.uWet.value = inCave ? 0 : this.wet;
    U.uRain.value = inCave ? 0 : L.rain;
    // snow accumulation on peaks
    if (L.snow > 0.2) this.snowCover = Math.min(1, this.snowCover + dt * 0.01 * L.snow);
    else this.snowCover = Math.max(0, this.snowCover - dt * 0.002);
    U.uSnow.value = this.snowCover;
    // precipitation particles
    const cam = g.camera.position;
    const pu = this.pu;
    pu.uCam.value.copy(cam);
    const snowing = L.snow > L.rain;
    const dusty = L.dust > 0.2 && !snowing;
    const amt = inCave ? 0 : Math.max(L.rain, L.snow, L.dust * 0.8);
    pu.uAmount.value = amt;
    pu.uSnow.value = snowing || dusty ? 1 : 0;
    pu.uSpeed.value = snowing ? 2.2 : dusty ? 4 : 20;
    pu.uLen.value = snowing ? 0.08 : dusty ? 0.06 : 0.8;
    pu.uWind.value.copy(this.windVec).multiplyScalar(L.wind * (dusty ? 14 : snowing ? 6 : 4));
    pu.uColor.value.setRGB(snowing ? 0.95 : dusty ? 0.75 : 0.65, snowing ? 0.95 : dusty ? 0.55 : 0.7, snowing ? 1 : dusty ? 0.35 : 0.78).multiplyScalar(0.4 + g.sky.dayFactor * 0.6);
    pu.uOpacity.value = snowing ? 0.8 : dusty ? 0.5 : 0.28;
    this.precip.visible = amt > 0.01;
    // lightning
    this.flash = Math.max(0, this.flash - dt * 6);
    this.boltMat.opacity = Math.max(0, this.boltMat.opacity - dt * 4);
    if (this.flash > 0.5) this.flash -= Math.random() < 0.3 ? 0.3 : 0;
    U.uFlash.value = inCave ? 0 : this.flash * 0.6;
    if (L.lightning > 0.01 && !inCave) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = (2 + Math.random() * 10) / (L.lightning * 4 + 0.01);
        this._strike(cam);
      }
    }
  }

  // values for other systems
  skyParams() {
    const L = this.local;
    const tint = L.dust > 0.2 ? new THREE.Color(0.75, 0.52, 0.32) : null;
    return { cloud: L.cloud, dark: L.dark, rain: L.rain, wind: L.wind, tint, tintAmt: L.dust * 0.7, fogTint: tint };
  }
  fogDensity(P) {
    const L = this.local;
    let d = 0.00042 * (0.6 + L.fog);
    // mountain clouds
    if (P.y > 300) d *= 1 + (P.y - 300) / 200;
    return d;
  }
  snowDepth(P) { return this.snowCover > 0.3 && P.y > 200 - this.snowCover * 160 ? this.snowCover : 0; }
  coldFactor(P) { return this.local.snow > 0.6 && this.local.wind > 0.9 ? 1 : 0; }
  thirstFactor(P) {
    const b = this.game.world.getBiome(P.x, P.z);
    return (b === BIOME.DESERT || b === BIOME.CANYON) && this.game.sky.dayFactor > 0.6 && this.local.cloud < 0.5 ? 1.7 : 1;
  }
  updraft(P) {
    const w = this.game.world;
    const n = w.getNormal(P.x, P.z);
    const agl = P.y - w.getHeight(P.x, P.z);
    const slopeLift = (1 - n.y) * this.local.wind * 6 * (agl < 120 ? 1 : 0.3);
    const thermal = this.game.sky.dayFactor * (1 - this.local.cloud) * (w.getBiome(P.x, P.z) === BIOME.DESERT ? 1.6 : 0.6);
    return slopeLift + thermal;
  }

  serialize() { return { type: this.type, timer: this.timer, wet: this.wet, snow: this.snowCover }; }
  deserialize(o) {
    if (!o) return;
    this.type = o.type in WEATHER_TYPES ? o.type : 'clear';
    this.timer = o.timer || 200;
    this.cur = { ...WEATHER_TYPES[this.type] };
    this.wet = o.wet || 0;
    this.snowCover = o.snow || 0;
  }
}
