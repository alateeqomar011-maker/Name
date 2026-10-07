// Dynamic weather: clear skies, clouds, rain, thunderstorms with lightning, mountain snow and morning mist.
import * as THREE from 'three';
import { U } from '../render/common.js';

const STATES = {
  clear: { name: 'Clear', cover: 0.38, dark: 0.0, rain: 0, wind: 0.35, fog: 0.00004, haze: 0.05 },
  fair: { name: 'Fair', cover: 0.55, dark: 0.02, rain: 0, wind: 0.45, fog: 0.00005, haze: 0.1 },
  cloudy: { name: 'Overcast', cover: 0.82, dark: 0.35, rain: 0, wind: 0.6, fog: 0.00008, haze: 0.25 },
  rain: { name: 'Rain', cover: 0.92, dark: 0.6, rain: 0.65, wind: 0.75, fog: 0.00018, haze: 0.45 },
  storm: { name: 'Thunderstorm', cover: 1.0, dark: 0.85, rain: 1.0, wind: 1.2, fog: 0.00028, haze: 0.6, lightning: true },
  mist: { name: 'Mist', cover: 0.5, dark: 0.15, rain: 0, wind: 0.15, fog: 0.0012, haze: 0.8 },
};
const NEXT = {
  clear: ['fair', 'fair', 'clear', 'cloudy'],
  fair: ['clear', 'fair', 'cloudy', 'cloudy', 'mist'],
  cloudy: ['rain', 'fair', 'storm', 'cloudy'],
  rain: ['cloudy', 'storm', 'fair'],
  storm: ['rain', 'cloudy'],
  mist: ['fair', 'clear'],
};

export class Weather {
  constructor(game) {
    this.game = game;
    this.state = 'fair';
    this.target = { ...STATES.fair };
    this.cur = { ...STATES.fair };
    this.timer = 240 + Math.random() * 200;
    this.flash = 0;
    this.nextBolt = 5;
    this.wetness = 0;
    this.lightningPos = new THREE.Vector3();
    this._buildRain();
    this._buildBolt();
  }

  get name() { return STATES[this.state].name; }

  set(state, instant = false) {
    this.state = state;
    this.target = { ...STATES[state] };
    if (instant) this.cur = { ...STATES[state] };
  }

  _buildRain() {
    const N = 9000;
    const off = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      for (let k = 0; k < 2; k++) {
        off.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(off, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: 42 }, uWind: { value: new THREE.Vector2() }, uIntensity: { value: 0 }, uSnow: { value: 0 }, uLight: { value: new THREE.Color() } },
      vertexShader: /* glsl */ `
        attribute float aEnd;
        uniform float uTime, uBox, uIntensity, uSnow;
        uniform vec3 uCam;
        uniform vec2 uWind;
        varying float vA;
        void main() {
          float speed = mix(17.0, 1.6, uSnow);
          vec3 p = position * uBox;
          p.y -= uTime * speed * (0.85 + position.x * 0.3);
          p.xz += uWind * uTime * (0.6 + uSnow * 0.8);
          if (uSnow > 0.5) p.xz += vec2(sin(uTime * 1.3 + position.z * 30.0), cos(uTime * 1.1 + position.x * 30.0)) * 0.6;
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          vec3 dir = normalize(vec3(uWind.x * 0.06, -1.0, uWind.y * 0.06));
          p += dir * aEnd * mix(0.55, 0.06, uSnow);
          vA = step(position.y, uIntensity) * (0.5 + 0.5 * aEnd);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        uniform vec3 uLight;
        uniform float uSnow;
        void main() {
          if (vA <= 0.0) discard;
          gl_FragColor = vec4(uLight * mix(0.55, 1.4, uSnow), vA * mix(0.28, 0.85, uSnow));
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 6;
    this.game.scene.add(this.rain);
  }

  _buildBolt() {
    this.boltMat = new THREE.LineBasicMaterial({ color: new THREE.Color(6, 6.5, 9), transparent: true, opacity: 1 });
    this.bolt = new THREE.LineSegments(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.game.scene.add(this.bolt);
  }

  _strike() {
    const g = this.game;
    const cam = g.player.pos;
    const a = Math.random() * Math.PI * 2, d = 400 + Math.random() * 2600;
    const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
    const ground = Math.max(g.world.height(x, z), 0);
    this.lightningPos.set(x, ground, z);
    const pts = [];
    const build = (sx, sy, sz, ey, depth) => {
      let px = sx, py = sy, pz = sz;
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const ny = py - (sy - ey) / steps;
        const nx = px + (Math.random() - 0.5) * 70, nz = pz + (Math.random() - 0.5) * 70;
        pts.push(px, py, pz, nx, ny, nz);
        if (depth < 2 && Math.random() < 0.18) build(nx, ny, nz, ny - (sy - ey) * 0.25, depth + 1);
        px = nx; py = ny; pz = nz;
      }
    };
    build(x, 1700, z, ground, 0);
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry();
    this.bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.bolt.visible = true;
    this.boltLife = 0.25;
    this.flash = 1;
    const delay = d / 343;
    g.audio && g.audio.thunder(delay, Math.max(0.25, 1 - d / 3500));
    if (d < 600 && g.player.pos.distanceTo(this.lightningPos) < 30) g.player.damage(40, 'lightning');
  }

  update(dt) {
    const g = this.game;
    this.timer -= dt;
    if (this.timer <= 0) {
      const opts = NEXT[this.state];
      let ns = opts[Math.floor(Math.random() * opts.length)];
      // morning mist is more likely at dawn
      const h = g.sky.timeOfDay;
      if (h > 4.5 && h < 7.5 && Math.random() < 0.4) ns = 'mist';
      this.set(ns);
      this.timer = 180 + Math.random() * 300;
      if (ns === 'storm') g.hud && g.hud.toast('Thunder rolls in the distance. A storm is coming.', 'warn');
      if (ns === 'rain') g.hud && g.hud.toast('Rain begins to fall.', '');
    }
    const k = Math.min(1, dt * 0.05);
    for (const key of ['cover', 'dark', 'rain', 'wind', 'fog', 'haze']) this.cur[key] += (this.target[key] - this.cur[key]) * k;

    // lightning
    if (STATES[this.state].lightning && this.cur.dark > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this._strike(); this.nextBolt = 4 + Math.random() * 14; }
    }
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      this.boltMat.opacity = Math.random() > 0.3 ? 1 : 0.2;
      if (this.boltLife <= 0) this.bolt.visible = false;
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    U.uLightning.value = this.flash > 0 ? this.flash * (Math.random() > 0.25 ? 1 : 0.3) : 0;

    // precipitation around the camera
    const P = g.player;
    const cam = g.camera.position;
    const snowLine = g.world.snowLine(cam.x, cam.z) - 120;
    const snow = cam.y > snowLine ? 1 : 0;
    const sheltered = P.inCave || g.underRoof;
    const intensity = sheltered ? 0 : this.cur.rain;
    const u = this.rainMat.uniforms;
    u.uCam.value.copy(cam);
    u.uIntensity.value = intensity;
    u.uSnow.value = snow;
    u.uWind.value.copy(U.uWindDir.value).multiplyScalar(this.cur.wind * 6);
    const lum = 0.15 + g.sky.dayFactor * 0.9 + this.flash * 3;
    u.uLight.value.setRGB(lum * 0.8, lum * 0.85, lum * 0.95);
    this.rain.visible = intensity > 0.02;

    // wetness & snow cover
    const wetTarget = this.cur.rain > 0.1 ? 1 : 0;
    this.wetness += (wetTarget - this.wetness) * dt * (wetTarget ? 0.05 : 0.01);
    U.uWetness.value = this.wetness * (snow ? 0.3 : 1);
    U.uSnowCover.value = Math.max(0, this.cur.rain - 0.3) * 0.5;

    // export to game weather params
    const gw = g.weather;
    gw.cover = this.cur.cover;
    gw.dark = this.cur.dark;
    gw.rain = this.cur.rain;
    gw.wind = this.cur.wind;
    gw.haze = this.cur.haze;
    gw.lightningPos = this.lightningPos;
    // fog: denser in valleys at dawn/dusk and around water
    const h = g.sky.timeOfDay;
    const dawn = Math.max(0, 1 - Math.abs(h - 6.2) / 2.2);
    gw.fog = this.cur.fog + dawn * 0.00025;
    g.audio && g.audio.setWeather(this.cur.rain * (sheltered ? 0.35 : 1), this.cur.wind, snow);
  }
}
