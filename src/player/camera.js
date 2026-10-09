// First / third person camera controller with terrain collision, zoom and screen shake.
import * as THREE from 'three';
import { clamp, lerp } from '../core/noise.js';

export class CameraRig {
  constructor(game, camera) {
    this.game = game;
    this.camera = camera;
    this.mode = 'third';
    this.yaw = 0;
    this.pitch = -0.15;
    this.dist = 5.5;
    this.trauma = 0;
    this.baseFov = 70;
    this.fov = 70;
    this.zoomFov = null;
    this.underwater = false;
    this.bob = 0;
    this._target = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.first = true;
  }

  shake(a) { this.trauma = Math.min(1, this.trauma + a); }

  // cinematic arrival after fast travel: swoop down from above and behind onto the player
  startArrival(dur = 3.4) { this.arrival = { t: 0, dur }; this._boom = undefined; }

  toggle() {
    this.mode = this.mode === 'first' ? 'third' : 'first';
    this.game.ui.notify(this.mode === 'first' ? 'First-person view' : 'Third-person view', 'info', 1.5);
  }

  update(dt, input) {
    const g = this.game;
    const p = g.player;
    const cam = this.camera;
    // Look input from the captured mouse, mouse drags and finger drags is gathered as a pending
    // rotation that the view eases into (adjustable smoothing), and a quick flick keeps turning
    // briefly with decaying momentum. A captured mouse uses a lighter filter for precise aim.
    const sens = input.sensitivity * (this.fov / this.baseFov);
    const inv = input.invertY ? -1 : 1;
    const D = input.drag;
    let px = D.dx, py = D.dy;
    if (input.locked) { px += input.mouse.dx; py += input.mouse.dy; }
    this._pYaw = (this._pYaw || 0) - px * sens;
    this._pPitch = (this._pPitch || 0) - py * sens * inv;
    const sm = Math.max(0, Math.min(1, input.smoothing));
    if (D.active || input.locked) { this._vYaw = 0; this._vPitch = 0; }
    if (D.released) {
      D.released = false;
      const k = sm * 0.55;
      this._vYaw = -D.vx * sens * k;
      this._vPitch = -D.vy * sens * inv * k * 0.4;
    }
    if (this._vYaw || this._vPitch) {
      this._pYaw += this._vYaw * dt; this._pPitch += this._vPitch * dt;
      const f = Math.exp(-dt / 0.2);
      this._vYaw *= f; this._vPitch *= f;
      if (Math.abs(this._vYaw) + Math.abs(this._vPitch) < 0.01) this._vYaw = this._vPitch = 0;
    }
    const tau = sm * (input.locked ? 0.05 : 0.12);
    const a = tau > 0.001 ? 1 - Math.exp(-dt / tau) : 1;
    const dyaw = this._pYaw * a, dpit = this._pPitch * a;
    this.yaw += dyaw; this.pitch += dpit;
    this._pYaw -= dyaw; this._pPitch -= dpit;
    if (this.pitch > 1.45 || this.pitch < -1.45) { this._pPitch = 0; this._vPitch = 0; }
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    if (!p.photoMode && !g.ui.menuOpen && input.mouse.wheel && this.mode === 'third') this.dist = clamp(this.dist + input.mouse.wheel * 0.8, 2.2, p.inVehicle ? 30 : 12);

    const fwd = this._look.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const V = p.inVehicle;
    const T = this._target;
    const first = this.mode === 'first' || p.photoMode;
    if (V) {
      if (first) V.seatPosition(T);
      else T.copy(V.pos).add(new THREE.Vector3(0, V.camHeight, 0));
    } else if (g.caves.active) {
      T.copy(p.pos).add(new THREE.Vector3(0, p.crouch ? 1.05 : 1.62, 0));
    } else {
      const eye = p.swimming ? 1.5 : p.crouch ? 1.05 : p.gliding ? 1.2 : 1.62;
      T.copy(p.pos);
      T.y += eye;
      if (first && p.onGround && p.speed > 0.5) {
        this.bob += dt * p.speed * 1.9;
        T.y += Math.sin(this.bob * 2) * 0.035 * Math.min(1, p.speed / 4);
        T.x += Math.cos(this.bob) * 0.02 * Math.cos(this.yaw);
        T.z -= Math.cos(this.bob) * 0.02 * Math.sin(this.yaw);
      }
    }
    if (first) {
      cam.position.copy(T);
    } else {
      const dist = V ? Math.max(this.dist, V.camDist) : this.dist;
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const side = V ? 0 : 0.55;
      const D = this._desired.copy(T).addScaledVector(fwd, -dist).addScaledVector(right, -side);
      // collide with terrain along the boom
      let best = dist;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const x = lerp(T.x, D.x, t), y = lerp(T.y, D.y, t), z = lerp(T.z, D.z, t);
        const h = g.caves.active ? g.caves.ceilingClamp(x, y, z) : g.world.getHeight(x, z) + 0.4;
        if (y < h) { best = Math.max(g.caves.active ? 0.6 : 2.4, dist * (t - 0.12)); break; }
      }
      // keep the boom out of tree trunks: stop just in front of any trunk between player and camera
      if (!g.caves.active && g.veg) {
        const dx = D.x - T.x, dz = D.z - T.z, L2 = dx * dx + dz * dz;
        if (L2 > 1e-4) {
          g.veg.forEachNear(T.x, T.z, dist + 3, (it) => {
            if (it.kind !== 'tree' || !it.alive) return;
            const r = Math.max(0.3, it.radius) + 0.35;
            const t = clamp(((it.x - T.x) * dx + (it.z - T.z) * dz) / L2, 0, 1);
            const cx = T.x + dx * t - it.x, cz = T.z + dz * t - it.z;
            const d2 = cx * cx + cz * cz;
            if (d2 >= r * r) return;
            if (lerp(T.y, D.y, t) > it.y + it.height * 0.9) return;
            const tin = Math.max(0, t - Math.sqrt(r * r - d2) / Math.sqrt(L2));
            best = Math.min(best, Math.max(0.8, dist * tin));
          });
        }
      }
      if (g.caves.active) best = Math.min(best, g.caves.maxBoom());
      // shrink instantly when blocked, ease back out when clear
      this._boom = this._boom === undefined ? best : best < this._boom ? best : lerp(this._boom, best, 1 - Math.exp(-dt * 4));
      best = this._boom;
      cam.position.copy(T).addScaledVector(fwd, -best).addScaledVector(right, -side * (best / dist));
      const hmin = g.caves.active ? -Infinity : g.world.getHeight(cam.position.x, cam.position.z) + 0.3;
      if (cam.position.y < hmin) cam.position.y = hmin;
    }
    // zoom
    let targetFov = this.baseFov;
    if (this.zoomFov) targetFov = this.zoomFov;
    else if (input.mouse.right && g.inventory.gear.has('binoculars') && !p.inVehicle && !g.ui.menuOpen && !g.build.active) targetFov = 14;
    if (p.sprinting && !this.zoomFov) targetFov += 12; // stronger speed sensation for the fast sprint
    if (V && V.speed > 15) targetFov += Math.min(12, (V.speed - 15) * 0.4);
    this.fov = lerp(this.fov, targetFov, 1 - Math.exp(-dt * 10));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.binoculars = targetFov < 20 && !this.zoomFov;

    const lookT = this._lookT || (this._lookT = new THREE.Vector3());
    lookT.copy(cam.position).add(fwd);
    if (this.arrival) {
      const A = this.arrival;
      A.t += Math.min(dt, 0.05);
      const k = Math.min(1, A.t / A.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const start = T.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * 42, 30, -Math.cos(this.yaw) * 42));
      start.y = Math.max(start.y, g.world.getHeight(start.x, start.z) + 10);
      const fin = cam.position.clone();
      cam.position.lerpVectors(start, fin, e);
      lookT.lerpVectors(T, fin.add(fwd), e * e);
      if (k >= 1) this.arrival = null;
    }
    cam.lookAt(lookT);
    // shake
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = performance.now() * 0.001;
      cam.rotation.x += (Math.sin(t * 37) + Math.sin(t * 21)) * 0.012 * s;
      cam.rotation.y += (Math.sin(t * 29) + Math.sin(t * 17)) * 0.012 * s;
      cam.rotation.z += Math.sin(t * 41) * 0.015 * s;
      cam.position.y += Math.sin(t * 53) * 0.05 * s;
      this.trauma = Math.max(0, this.trauma - dt * 0.9);
    }
    const ext = g.events ? g.events.shake : 0;
    if (ext > 0) {
      const t = performance.now() * 0.001;
      cam.position.x += Math.sin(t * 61) * 0.06 * ext;
      cam.position.y += Math.sin(t * 47) * 0.05 * ext;
      cam.rotation.z += Math.sin(t * 33) * 0.01 * ext;
    }
    const wl = g.caves.active ? g.caves.waterLevel(cam.position) : g.world.waterLevelAt(cam.position.x, cam.position.z);
    this.underwater = cam.position.y < wl - 0.05;
    cam.updateMatrixWorld();
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
}
