// Player controller: movement physics on the heightfield (walk, sprint, crouch, jump, climb, swim, glide),
// survival stats and environmental hazards.
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { clamp, lerp } from '../core/noise.js';
import { BIOME, VOLCANO } from '../world/worldgen.js';

const GRAV = 22;
const _n = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; // body heading (follows camera when moving)
    this.onGround = true;
    this.crouch = false;
    this.sprinting = false;
    this.swimming = false;
    this.diving = false;
    this.climbing = false;
    this.gliding = false;
    this.inVehicle = null;
    this.vehicleSpeed = 0;
    this.boat = false;
    this.inBase = false;
    this.inCave = false;
    this.inBlind = false;
    this.alive = true;
    this.health = 100; this.stamina = 100; this.hunger = 100; this.thirst = 100; this.oxygen = 100;
    this.cold = 0; this.heat = 0;
    this.speed = 0;
    this.respawn = new THREE.Vector3();
    this.headlamp = false;
    this.avatar = new Avatar();
    game.scene.add(this.avatar.root);
    this.stepAcc = 0;
    this.fallStartY = 0;
    this.lastDamage = 0;
    this.action = 0;
    this.photoMode = false;
    this.light = new THREE.SpotLight(0xfff2d8, 0, 60, 0.55, 0.5, 1.2);
    this.light.castShadow = false;
    game.scene.add(this.light);
    game.scene.add(this.light.target);
  }

  get maxHealth() { return 100 * (1 + 0.15 * this.game.progress.skill('vitality')); }
  get maxStamina() { return 100 * (1 + 0.15 * this.game.progress.skill('endurance')); }

  // How much noise the player makes (detection multiplier for wildlife)
  noise() {
    let n = 1;
    if (this.crouch) n = 0.45;
    if (this.sprinting) n = 1.5;
    if (this.speed < 0.3 && this.onGround) n *= 0.7;
    if (this.inVehicle) n = this.inVehicle.type === 'glider' ? 0.5 : 1.8;
    if (this.swimming) n = 0.8;
    if (this.inBlind) n *= 0.1;
    n *= 1 - 0.12 * this.game.progress.skill('stealth');
    return n;
  }

  damage(amount, cause = 'unknown', from = null) {
    if (!this.alive || amount <= 0) return;
    if (this.game.cheats && this.game.cheats.god) return;
    this.health -= amount;
    this.lastDamage = 0;
    this.lastCause = cause;
    this.game.ui.hurt(Math.min(1, amount / 30), from);
    this.game.audio.play('hurt');
    this.game.cam.shake(Math.min(1, amount / 25));
    if (from && !this.inVehicle) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / d) * Math.min(12, amount * 0.3);
      this.vel.z += (dz / d) * Math.min(12, amount * 0.3);
      this.vel.y += Math.min(5, amount * 0.1);
      this.onGround = false;
    }
    if (this.health <= 0) this.die(cause);
  }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }

  die(cause) {
    this.health = 0;
    this.alive = false;
    this.deathT = 0;
    if (this.inVehicle) this.game.vehicles.exit();
    this.gliding = false;
    this.game.emit('player-died', { cause });
    this.game.ui.death(cause);
  }

  doRespawn() {
    const g = this.game;
    // lose a portion of carried resources
    const inv = g.inventory;
    let lost = 0;
    for (const k of Object.keys(inv.items)) {
      const n = Math.floor(inv.items[k] * 0.3);
      if (n > 0) { inv.remove(k, n); lost += n; }
    }
    const sp = g.build.respawnPoint() || this.respawn;
    this.pos.set(sp.x, g.world.getHeight(sp.x, sp.z) + 0.5, sp.z);
    this.vel.set(0, 0, 0);
    this.health = this.maxHealth * 0.6;
    this.stamina = this.maxStamina;
    this.hunger = Math.max(this.hunger, 50);
    this.thirst = Math.max(this.thirst, 50);
    this.oxygen = 100;
    this.cold = this.heat = 0;
    this.alive = true;
    if (g.caves.active) g.caves.exit(true);
    g.clock.advance(1);
    g.ui.notify(lost ? `You were rescued and patched up. Lost ${lost} carried resources.` : 'You were rescued and patched up.', 'warn');
  }

  update(dt, input, camYaw) {
    const g = this.game;
    const w = g.world;
    if (!this.alive) {
      this.deathT += dt;
      this.avatar.root.visible = false;
      return;
    }
    if (this.inVehicle) {
      this._stats(dt);
      this.avatar.root.visible = g.cam.mode === 'third' && this.inVehicle.showDriver;
      return;
    }
    if (g.caves.active) { g.caves.updatePlayer(dt, input, camYaw, this); this._stats(dt); this._animate(dt); return; }

    const P = this.pos;
    const groundH = w.getHeight(P.x, P.z);
    const wl = w.waterLevelAt(P.x, P.z);
    const depth = wl - groundH;
    const enabled = input.enabled && !this.photoMode;
    // Movement intent
    let fx = 0, fz = 0;
    if (enabled) {
      if (input.down('KeyW')) fz += 1;
      if (input.down('KeyS')) fz -= 1;
      if (input.down('KeyA')) fx += 1;
      if (input.down('KeyD')) fx -= 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    // world-space desired direction (camera forward = (sin,cos))
    const dx = fz * sin + fx * cos;
    const dz = fz * cos - fx * sin;
    if (enabled && input.hit('KeyC')) this.crouch = !this.crouch;
    const wantSprint = enabled && input.down('ShiftLeft') && len > 0 && this.stamina > 5 && !this.crouch;

    // Water
    const swimDepth = 1.35;
    const wasSwimming = this.swimming;
    this.swimming = depth > swimDepth && P.y < wl - 0.9;
    if (this.swimming && !wasSwimming) { g.audio.play('splash'); this.gliding = false; this.vel.y *= 0.3; g.emit('player-swim'); }

    const skillClimb = g.progress.skill('climbing');
    if (this.swimming) {
      this.crouch = false;
      this.climbing = false;
      const wet = g.inventory.gear.has('wetsuit');
      const sp = (wet ? 4.2 : 2.6) * (1 + skillClimb * 0.06) * (wantSprint ? 1.7 : 1);
      this.vel.x = lerp(this.vel.x, dx * sp, 1 - Math.exp(-dt * 3));
      this.vel.z = lerp(this.vel.z, dz * sp, 1 - Math.exp(-dt * 3));
      let targetY = wl - 1.45;
      if (enabled && input.down('KeyC')) { this.diving = true; targetY = Math.max(groundH + 0.3, P.y - 3); }
      else if (enabled && input.down('Space')) { this.diving = false; targetY = wl - 1.2; }
      else this.diving = P.y < wl - 2;
      if (!this.diving) targetY = wl - 1.45;
      this.vel.y = clamp((targetY - P.y) * 2.5, -3, 3);
      if (wantSprint) this.stamina -= dt * 10;
      // open water fatigue
      if (depth > 8) this.stamina -= dt * (wet ? 0.6 : 1.8) * (1 - skillClimb * 0.1);
      if (this.stamina <= 0) { this.stamina = 0; this.damage(dt * 4, 'Exhaustion'); }
      if (len > 0 && Math.random() < dt * 1.5) g.audio.play('swim', { vol: 0.6 });
      this.sprinting = wantSprint;
    } else {
      // Land
      const n = w.getNormal(P.x, P.z, _n);
      const steep = n.y < 0.64;
      let sp = this.crouch ? 2.0 : wantSprint ? 21 : 4.4;
      sp *= 1 + 0.03 * g.progress.skill('endurance');
      if (this.hunger <= 0 || this.thirst <= 0) sp *= 0.8;
      if (g.weather && g.weather.snowDepth(P) > 0) sp *= 0.85;
      this.sprinting = wantSprint && this.onGround;
      // Climbing: pushing into a steep slope with picks
      const uphill = -(n.x * dx + n.z * dz);
      this.climbing = false;
      if (this.onGround && steep && len > 0 && uphill > 0.2 && g.inventory.gear.has('climbing_picks') && this.stamina > 1 && enabled) {
        this.climbing = true;
        const cs = 1.7 * (1 + skillClimb * 0.12);
        this.vel.x = dx * cs * 0.8; this.vel.z = dz * cs * 0.8; this.vel.y = 0;
        this.stamina -= dt * 7 * (1 - skillClimb * 0.1);
        P.x += this.vel.x * dt; P.z += this.vel.z * dt;
        P.y = w.getHeight(P.x, P.z);
        if (Math.random() < dt * 3) g.audio.play('step', { surface: 'rock', vol: 0.6 });
      } else if (this.onGround) {
        const accel = 1 - Math.exp(-dt * (this.onGround ? 10 : 1.5));
        let tvx = dx * sp, tvz = dz * sp;
        if (steep) {
          // slide down steep slopes, can't walk up them
          const gx = n.x, gz = n.z;
          const gl = Math.hypot(gx, gz) || 1;
          if (dx * gx + dz * gz < 0) { tvx -= (gx / gl) * (dx * gx + dz * gz) / gl * sp; tvz -= (gz / gl) * (dx * gx + dz * gz) / gl * sp; }
          tvx += (gx / gl) * 6; tvz += (gz / gl) * 6;
        }
        this.vel.x = lerp(this.vel.x, tvx, accel);
        this.vel.z = lerp(this.vel.z, tvz, accel);
        if (this.sprinting) this.stamina -= dt * 7.5 * (1 - 0.08 * g.progress.skill('endurance'));
        if (enabled && input.hit('Space') && this.stamina > 4 && !steep) {
          this.vel.y = 6.6 + g.progress.skill('climbing') * 0.15;
          this.onGround = false;
          this.stamina -= 4;
          this.crouch = false;
          g.audio.play('jump');
          this.fallStartY = P.y;
        }
      } else {
        // air control
        this.vel.x = lerp(this.vel.x, dx * sp, 1 - Math.exp(-dt * (this.gliding ? 0.6 : 1.2)));
        this.vel.z = lerp(this.vel.z, dz * sp, 1 - Math.exp(-dt * (this.gliding ? 0.6 : 1.2)));
      }

      // Glider
      if (!this.onGround && !this.climbing) {
        if (enabled && input.hit('Space') && g.inventory.gear.has('glider') && P.y - groundH > 4) {
          this.gliding = !this.gliding;
          if (this.gliding) { g.audio.play('jump'); g.emit('glide'); }
        }
      } else this.gliding = false;
      if (this.gliding) {
        const fwdx = Math.sin(camYaw), fwdz = Math.cos(camYaw);
        const pitch = g.cam.pitch;
        const gs = 15 + clamp(-pitch, -0.5, 0.8) * 10;
        this.vel.x = lerp(this.vel.x, fwdx * gs + dx * 2, 1 - Math.exp(-dt * 1.2));
        this.vel.z = lerp(this.vel.z, fwdz * gs + dz * 2, 1 - Math.exp(-dt * 1.2));
        const sink = 1.6 + clamp(-pitch, 0, 1) * 6 - (g.weather ? g.weather.updraft(P) : 0);
        this.vel.y = lerp(this.vel.y, -sink, 1 - Math.exp(-dt * 2));
        this.fallStartY = P.y;
      } else if (!this.climbing) {
        this.vel.y -= GRAV * dt;
      }

      // collisions with trees, rocks, structures; fast movement (the sprint covers a metre or
      // more per frame) is split into short steps so it can't pass through a trunk
      const hStep = Math.hypot(this.vel.x, this.vel.z) * dt;
      if (!this.climbing) {
        const n = Math.min(8, Math.max(1, Math.ceil(hStep / 0.4)));
        for (let i = 0; i < n; i++) {
          P.x += this.vel.x * dt / n;
          P.z += this.vel.z * dt / n;
          if (n > 1 && i < n - 1) this._collide();
        }
        P.y += this.vel.y * dt;
      }
      this._collide();
      const h = Math.max(w.getHeight(P.x, P.z), g.build.platformAt(P.x, P.z, P.y));
      if (P.y <= h + 0.02) {
        if (!this.onGround) {
          const fall = this.fallStartY - h;
          if (this.vel.y < -13 && fall > 5) { this.damage((-this.vel.y - 13) * 5.5, 'Fall'); }
          if (this.vel.y < -6) g.audio.play('land');
          this.gliding = false;
        }
        P.y = h;
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
      } else if (P.y > h + 0.35 + hStep * 0.6 || this.vel.y > 0) {
        if (this.onGround) this.fallStartY = P.y;
        this.onGround = false;
      } else {
        // walking down slopes: stick to ground
        P.y = h; this.onGround = true;
      }
      if (this.onGround && !this.sprinting && !this.climbing) this.stamina = Math.min(this.maxStamina, this.stamina + dt * (14 + 3 * g.progress.skill('endurance')));
    }
    if (this.swimming) {
      P.x += this.vel.x * dt; P.z += this.vel.z * dt; P.y += this.vel.y * dt;
      this._collide();
      if (P.y < groundH) P.y = groundH;
      this.onGround = false;
      if (!wantSprint) this.stamina = Math.min(this.maxStamina, this.stamina + dt * (depth > 8 ? 0 : 6));
    }
    // world bounds
    const B = 2030;
    P.x = clamp(P.x, -B, B); P.z = clamp(P.z, -B, B);

    // heading follows movement
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    if (hs > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-dt * 10));
    }
    if (g.cam.mode === 'first' || this.photoMode) this.yaw = camYaw;

    // Footsteps
    if (this.onGround && hs > 0.5) {
      this.stepAcc += hs * dt;
      const stride = this.sprinting ? 1.6 : this.crouch ? 0.9 : 1.25;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const surf = this.surface();
        g.audio.play('step', { surface: surf, vol: this.crouch ? 0.4 : this.sprinting ? 1.1 : 0.8 });
        g.progress.stats.distance += stride;
        this._footprint(surf);
      }
    }
    this._stats(dt);
    this._animate(dt);
  }

  surface() {
    const g = this.game, P = this.pos;
    if (g.world.waterLevelAt(P.x, P.z) > P.y - 0.2) return 'water';
    if (g.weather && g.weather.snowDepth(P) > 0) return 'snow';
    const b = g.world.getBiome(P.x, P.z);
    if (b === BIOME.BEACH || b === BIOME.DESERT || b === BIOME.CANYON) return 'sand';
    if (b === BIOME.SNOW) return 'snow';
    if (b === BIOME.SWAMP || (g.world.getNormal(P.x, P.z).y > 0.9 && g.weather && g.weather.wet > 0.5)) return 'mud';
    if (b === BIOME.MOUNTAIN || b === BIOME.VOLCANIC || g.world.getNormal(P.x, P.z).y < 0.8) return 'rock';
    return 'grass';
  }

  // boot prints pressed into snow, sand and mud (and anywhere snowy in winter)
  _footprint(surf) {
    const g = this.game;
    const winter = g.season && g.season.winter > 0.6;
    const soft = surf === 'sand' || surf === 'snow' || surf === 'mud' || (winter && surf !== 'rock');
    if (!soft || g.caves.active || this.swimming) return;
    if (!this._fp) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 128;
      const x = c.getContext('2d');
      const blob = (cx, cy, rx, ry, a) => { const gr = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry)); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.7, `rgba(0,0,0,${a * 0.8})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); };
      blob(32, 38, 20, 30, 0.8); // sole
      blob(32, 98, 15, 18, 0.8); // heel
      x.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 7; k++) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(12, 18 + k * 9, 40, 3); } // tread lugs
      const tex = new THREE.CanvasTexture(c);
      const geo = new THREE.PlaneGeometry(0.15, 0.32);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const N = 180;
      const mesh = new THREE.InstancedMesh(geo, mat, N);
      mesh.frustumCulled = false;
      mesh.count = 0;
      for (let i = 0; i < N; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      g.scene.add(mesh);
      this._fp = { mesh, i: 0, N, side: 1, m: new THREE.Matrix4(), q: new THREE.Quaternion(), c: new THREE.Color() };
    }
    const F = this._fp;
    F.side = -F.side;
    const s = Math.sin(this.yaw), co = Math.cos(this.yaw);
    const px = this.pos.x + co * 0.12 * F.side, pz = this.pos.z - s * 0.12 * F.side;
    const py = g.world.getHeight(px, pz) + 0.02;
    F.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw + Math.PI);
    F.m.compose(new THREE.Vector3(px, py, pz), F.q, new THREE.Vector3(1, 1, 1));
    F.mesh.setMatrixAt(F.i, F.m);
    // snow prints read as cool blue shadows, sand and mud as darker, damp hollows
    const col = surf === 'mud' ? [0.35, 0.3, 0.25] : (winter || surf === 'snow') ? [0.55, 0.62, 0.78] : [0.62, 0.52, 0.42];
    F.mesh.setColorAt(F.i, F.c.setRGB(col[0], col[1], col[2]));
    F.i = (F.i + 1) % F.N;
    F.mesh.count = Math.max(F.mesh.count, F.i === 0 ? F.N : F.i);
    F.mesh.instanceMatrix.needsUpdate = true;
    F.mesh.instanceColor.needsUpdate = true;
  }

  _collide() {
    const g = this.game;
    const p = { x: this.pos.x, z: this.pos.z, hit: false };
    g.veg.collide(p, 0.35, this.pos.y);
    g.build.collide(p, 0.35, this.pos.y);
    g.pois.collide(p, 0.35, this.pos.y);
    // dinosaurs push the player
    for (const d of g.dinos.active) {
      if (d.flyer || d.marine) continue;
      if (Math.abs(d.pos.y - this.pos.y) > d.hip * 2.5) continue;
      const rr = d.radius + 0.4;
      const dx = p.x - d.pos.x, dz = p.z - d.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const dd = Math.sqrt(d2);
        p.x = d.pos.x + (dx / dd) * rr; p.z = d.pos.z + (dz / dd) * rr;
      }
    }
    this.pos.x = p.x; this.pos.z = p.z;
  }

  _stats(dt) {
    const g = this.game;
    const P = this.pos;
    const surv = 1 - 0.12 * g.progress.skill('survival');
    const exertion = this.sprinting ? 1.6 : this.swimming ? 1.3 : this.climbing ? 1.5 : 1;
    const heatMul = g.weather ? g.weather.thirstFactor(P) : 1;
    this.hunger = Math.max(0, this.hunger - dt * 0.07 * surv * exertion);
    this.thirst = Math.max(0, this.thirst - dt * 0.1 * surv * exertion * heatMul);
    if (this.hunger <= 0) this.damage(dt * 0.6, 'Starvation');
    if (this.thirst <= 0) this.damage(dt * 0.9, 'Dehydration');
    this.lastDamage += dt;
    if (this.hunger > 40 && this.thirst > 40 && this.lastDamage > 5) this.heal(dt * (0.35 + 0.12 * g.progress.skill('vitality')));
    this.stamina = clamp(this.stamina, 0, this.maxStamina);
    // breath
    const camUnder = g.cam.underwater;
    if (camUnder && !this.inVehicle) {
      const wet = g.inventory.gear.has('wetsuit');
      this.oxygen -= dt * (wet ? 4 : 8);
      if (this.oxygen <= 0) { this.oxygen = 0; this.damage(dt * 8, 'Drowning'); }
    } else this.oxygen = Math.min(100, this.oxygen + dt * 30);
    // environmental hazards: cold at altitude, heat near the volcano
    const inside = this.inVehicle && this.inVehicle.type === 'jeep';
    const coldZone = !g.caves.active && P.y > 255 && !inside;
    const blizzard = g.weather ? g.weather.coldFactor(P) : 0;
    if ((coldZone || blizzard > 0.5) && !g.inventory.gear.has('thermal_gear') && !g.build.nearStation('campfire')) {
      this.cold = Math.min(100, this.cold + dt * (6 + blizzard * 6));
      if (this.cold >= 100) this.damage(dt * 3, 'Hypothermia');
    } else this.cold = Math.max(0, this.cold - dt * 15);
    const dv = Math.hypot(P.x - VOLCANO.x, P.z - VOLCANO.z);
    const heatZone = !g.caves.active && g.world.getBiome(P.x, P.z) === BIOME.VOLCANIC && dv < 520;
    const lava = g.events ? g.events.lavaHeat(P) : 0;
    if ((heatZone || lava > 0) && !g.inventory.gear.has('heat_suit')) {
      this.heat = Math.min(100, this.heat + dt * (5 + lava * 30));
      if (this.heat >= 100) this.damage(dt * 3, 'Heatstroke');
    } else this.heat = Math.max(0, this.heat - dt * 12);
    if (lava > 0.6) this.damage(dt * lava * 25, 'Lava');
    // in base?
    this.inBase = g.build.inBase(P.x, P.z);
    this.inBlind = g.build.inBlind(P.x, P.z);
    // headlamp
    const L = this.light;
    L.intensity = this.headlamp ? 120 : 0;
    this.avatar.lamp.material.emissiveIntensity = this.headlamp ? 3 : 0;
    if (this.headlamp) {
      const cam = g.camera;
      L.position.copy(cam.position);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      L.target.position.copy(cam.position).addScaledVector(fwd, 10);
      L.target.updateMatrixWorld();
    }
  }

  _animate(dt) {
    const a = this.avatar;
    a.root.visible = this.game.cam.mode === 'third' && !this.photoMode;
    a.root.position.copy(this.pos);
    a.root.rotation.y = this.yaw;
    a.update(dt, {
      speed: this.speed, onGround: this.onGround, crouch: this.crouch, swim: this.swimming, climb: this.climbing,
      glide: this.gliding, action: this.action > 0, camera: this.photoMode, hurt: this.lastDamage < 0.9 && this.alive,
    });
    this.action = Math.max(0, this.action - dt);
  }

  serialize() {
    return {
      pos: [this.pos.x, this.pos.y, this.pos.z], health: this.health, stamina: this.stamina, hunger: this.hunger, thirst: this.thirst,
      respawn: [this.respawn.x, this.respawn.z],
    };
  }
  deserialize(o) {
    this.pos.set(o.pos[0], o.pos[1], o.pos[2]);
    this.health = o.health; this.stamina = o.stamina; this.hunger = o.hunger; this.thirst = o.thirst;
    if (o.respawn) this.respawn.set(o.respawn[0], 0, o.respawn[1]);
  }
}
