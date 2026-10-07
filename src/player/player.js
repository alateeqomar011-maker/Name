// First-person player controller: walking, sprinting, crouching, jumping, climbing and swimming.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.mode = 'walk';
    this.onGround = false;
    this.crouch = false;
    this.sprinting = false;
    this.radius = 0.38;
    this.height = 1.8;
    this.eye = 1.65;
    this.eyeSmooth = 1.65;
    this.health = 100;
    this.stamina = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.oxygen = 100;
    this.warmth = 100;
    this.dead = false;
    this.headUnder = false;
    this.inWater = false;
    this.waterLevel = 0;
    this.climbIntent = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.landDip = 0;
    this.shake = 0;
    this.fallStartY = 0;
    this.airTime = 0;
    this.stepAcc = 0;
    this.damageFlash = 0;
    this.lastSafe = new THREE.Vector3();
    this.inCave = null;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.noClimbHint = 0;
    this.statusText = '';
  }

  spawn(x, z, yaw = 0) {
    const w = this.game.world;
    this.pos.set(x, w.height(x, z) + 0.1, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.mode = 'walk';
    this.dead = false;
    this.lastSafe.copy(this.pos);
  }

  get eyePos() {
    return _eye.set(this.pos.x, this.pos.y + this.eyeSmooth, this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  damage(amount, source) {
    if (this.dead || this.game.godMode) return;
    this.health -= amount;
    this.damageFlash = Math.min(1, this.damageFlash + amount / 30);
    this.shake = Math.max(this.shake, Math.min(1, amount / 25));
    this.game.audio && this.game.audio.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onPlayerDeath(source);
    }
  }

  groundAt(x, z, y) {
    const g = this.game;
    let h;
    const cave = g.caves ? g.caves.floorAt(x, y, z) : null;
    if (cave) {
      h = cave.floor;
      this.inCave = cave.cave;
      this.caveCeil = cave.ceil;
    } else {
      h = g.world.height(x, z);
      this.inCave = null;
      this.caveCeil = Infinity;
    }
    const top = g.structureTop ? g.structureTop(x, z, y + 0.6, this.radius) : -Infinity;
    return Math.max(h, top);
  }

  update(dt, input) {
    if (this.dead) return;
    const g = this.game;
    const w = g.world;

    // --- look
    if (input.locked && !g.uiOpen) {
      this.yaw -= input.mouse.dx * this.sensitivity;
      this.pitch -= input.mouse.dy * this.sensitivity * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
    }

    // --- input
    const ui = g.uiOpen;
    let mx = 0, mz = 0;
    if (!ui) {
      if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const jump = !ui && input.down('Space');
    const jumpHit = !ui && input.hit('Space');
    const crouchKey = !ui && (input.down('KeyC') || input.down('ControlLeft'));
    const sprintKey = !ui && (input.down('ShiftLeft') || input.down('ShiftRight'));

    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // --- water state
    this.waterLevel = w.waterLevel(this.pos.x, this.pos.z);
    const ground0 = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const waterDepth = this.waterLevel - ground0;
    const submerge = this.waterLevel - this.pos.y;
    this.inWater = submerge > 0.3 && !this.inCave;
    if (this.mode !== 'swim' && submerge > 1.25 && waterDepth > 1.5 && !this.inCave) this.mode = 'swim';
    if (this.mode === 'swim' && (waterDepth < 1.3 || submerge < 0.9) && this.pos.y - ground0 < 0.6) this.mode = 'walk';

    const hasPicks = g.inventory && g.inventory.has('climbing_picks');
    this.sprinting = false;
    let speedMul = g.speedBuff || 1;

    if (this.mode === 'swim') {
      this._swim(dt, mx, mz, jump, crouchKey, sprintKey, speedMul);
    } else if (this.mode === 'climb') {
      this._climb(dt, mx, mz, jumpHit, hasPicks, speedMul);
    } else {
      this._walk(dt, mx, mz, jumpHit, crouchKey, sprintKey, hasPicks, speedMul);
    }

    // --- horizontal collisions
    g.resolveCollisions(this.pos, this.radius, this.height);
    // world bounds
    const lim = 4060;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));

    // --- eye height & camera feel
    let targetEye = this.crouch ? 1.05 : 1.65;
    if (this.mode === 'swim') targetEye = 1.45;
    if (this.caveCeil !== Infinity) targetEye = Math.min(targetEye, Math.max(0.9, this.caveCeil - this.pos.y - 0.25));
    this.eyeSmooth += (targetEye - this.eyeSmooth) * Math.min(1, dt * 10);
    this.landDip *= Math.exp(-dt * 8);
    this.shake *= Math.exp(-dt * 3);
    this.damageFlash *= Math.exp(-dt * 2.5);

    const eyeY = this.pos.y + this.eyeSmooth;
    this.headUnder = eyeY < this.waterLevel - 0.05 && !this.inCave;

    this._vitals(dt);
    if (this.onGround && this.mode === 'walk' && !this.inWater && this.health > 0) this.lastSafe.copy(this.pos);
  }

  _walk(dt, mx, mz, jumpHit, crouchKey, sprintKey, hasPicks, speedMul) {
    const g = this.game;
    const w = g.world;
    this.crouch = crouchKey;
    const moving = mx !== 0 || mz !== 0;
    const canSprint = sprintKey && mz > 0 && this.stamina > 1 && !this.crouch;
    let speed = this.crouch ? 2.0 : canSprint ? 8.2 : 4.4;
    if (this.inWater) speed *= 0.6;
    speed *= speedMul;
    if (canSprint && moving) {
      this.sprinting = true;
      this.stamina -= 11 * dt;
    }
    const want = _v.set(0, 0, 0).addScaledVector(_f, mz * speed).addScaledVector(_r, mx * speed);

    const n = w.normal(this.pos.x, this.pos.z, _n);
    const steep = n.y < 0.66 && !this.inCave;
    if (steep && this.onGround) {
      // cannot walk up steep slopes: remove uphill component
      const downhill = _dh.set(n.x, 0, n.z).normalize();
      const up = -want.dot(downhill);
      if (up > 0) want.addScaledVector(downhill, up);
      // climbing intent: pushing into a steep wall
      const ahead = w.height(this.pos.x + _f.x * 1.2, this.pos.z + _f.z * 1.2);
      const onIce = this.pos.y > w.snowLine(this.pos.x, this.pos.z) - 10;
      if (mz > 0 && ahead > this.pos.y + 0.6 && this.stamina > 8) {
        if (onIce && !hasPicks) {
          this.noClimbHint = 2;
        } else {
          this.climbIntent += dt;
          if (this.climbIntent > 0.25) { this.mode = 'climb'; this.climbIntent = 0; this.vel.set(0, 0, 0); return; }
        }
      } else this.climbIntent = 0;
    } else this.climbIntent = 0;

    const accel = this.onGround ? (moving ? 42 : 30) : 5;
    const k = Math.min(1, accel * dt / Math.max(speed, 1));
    this.vel.x += (want.x - this.vel.x) * Math.min(1, accel * dt * 0.25);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, accel * dt * 0.25);
    void k;

    if (steep && this.onGround) {
      // slide down
      this.vel.x += n.x * 14 * dt;
      this.vel.z += n.z * 14 * dt;
    }

    // gravity & jump
    this.vel.y -= 21 * dt;
    if (jumpHit && this.onGround && this.stamina > 4) {
      this.vel.y = this.crouch ? 4.2 : 6.3;
      this.onGround = false;
      this.stamina -= 4;
      g.audio && g.audio.jump();
    }
    if (this.inWater) this.vel.y = Math.max(this.vel.y, -6);

    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);

    const gh = this.groundAt(this.pos.x, this.pos.z, prevY);
    if (this.pos.y <= gh) {
      if (!this.onGround) this._land(-this.vel.y);
      this.pos.y = gh;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.pos.y - gh < 0.7 && this.vel.y <= 0) {
      // stick to slopes when walking downhill
      this.pos.y = gh;
      this.vel.y = 0;
    } else {
      if (this.onGround) { this.fallStartY = this.pos.y; this.airTime = 0; }
      this.onGround = false;
      this.airTime += dt;
    }
    if (this.caveCeil !== Infinity && this.pos.y + 1.6 > this.caveCeil) {
      this.pos.y = Math.max(gh, this.caveCeil - 1.6);
      if (this.vel.y > 0) this.vel.y = 0;
    }

    // footsteps & head bob
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.bob += dt * hs * 1.75;
      this.bobAmt += (Math.min(1, hs / 6) - this.bobAmt) * dt * 6;
      this.stepAcc += hs * dt;
      const stride = this.sprinting ? 2.1 : 1.6;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        g.audio && g.audio.footstep(g.surfaceAt(this.pos), this.sprinting ? 1 : this.crouch ? 0.35 : 0.65, this.inWater);
      }
    } else this.bobAmt += (0 - this.bobAmt) * dt * 6;
    this.bobAmt *= this.crouch ? 0.6 : 1;
  }

  _land(impact) {
    this.landDip = Math.min(0.35, impact * 0.025);
    if (impact > 13.5 && !this.inWater) this.damage((impact - 13.5) * 7.5, 'fall');
    if (impact > 3) this.game.audio && this.game.audio.footstep(this.game.surfaceAt(this.pos), Math.min(1.4, impact / 8), this.inWater);
  }

  _climb(dt, mx, mz, jumpHit, hasPicks, speedMul) {
    const g = this.game;
    const w = g.world;
    const n = w.normal(this.pos.x, this.pos.z, _n);
    this.onGround = false;
    this.crouch = false;
    if (n.y > 0.72 || this.stamina <= 0) {
      this.mode = 'walk';
      if (this.stamina <= 0) g.hud && g.hud.toast('Too exhausted to keep climbing', 'warn');
      return;
    }
    if (jumpHit) {
      this.mode = 'walk';
      this.vel.set(n.x * 4, 5, n.z * 4);
      return;
    }
    const speed = (hasPicks ? 2.6 : 1.5) * speedMul;
    const uphill = _dh.set(-n.x, 0, -n.z).normalize();
    const side = _side.set(-uphill.z, 0, uphill.x);
    // map input relative to facing: forward climbs up
    const facingDot = _f.dot(uphill);
    const fwd = mz * (facingDot >= -0.2 ? 1 : -1);
    const sideAmt = mx * Math.sign(_r.dot(side) || 1);
    const move = _v.set(0, 0, 0).addScaledVector(uphill, fwd * speed).addScaledVector(side, sideAmt * speed * 0.8);
    this.pos.x += move.x * dt;
    this.pos.z += move.z * dt;
    const h = w.height(this.pos.x, this.pos.z);
    this.pos.y = h + 0.05;
    const moving = Math.abs(mx) + Math.abs(mz) > 0;
    this.stamina -= (hasPicks ? 4.5 : 8.5) * dt * (moving ? 1 : 0.45);
    this.bob += dt * (moving ? 5 : 0);
    this.bobAmt = moving ? 0.6 : 0;
    this.stepAcc += dt * (moving ? 1 : 0);
    if (this.stepAcc > 0.55) { this.stepAcc = 0; g.audio && g.audio.climbStep(); }
    this.vel.set(0, 0, 0);
  }

  _swim(dt, mx, mz, jump, crouchKey, sprintKey, speedMul) {
    const g = this.game;
    this.onGround = false;
    this.crouch = false;
    const fast = sprintKey && this.stamina > 1;
    const speed = (fast ? 4.0 : 2.6) * speedMul;
    if (fast && (mx || mz)) { this.stamina -= 7 * dt; this.sprinting = true; }
    const look = this.forward(_v);
    const want = _w.set(0, 0, 0).addScaledVector(look, mz * speed).addScaledVector(_r, mx * speed);
    if (jump) want.y += 2.6;
    if (crouchKey) want.y -= 2.6;
    // buoyancy toward floating at the surface
    const floatY = this.waterLevel - 1.42;
    if (!crouchKey && mz <= 0 && !jump && this.pos.y < floatY) want.y += Math.min(1.5, (floatY - this.pos.y) * 1.2);
    this.vel.lerp(want, Math.min(1, dt * 2.5));
    // cannot leave the water upward
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y > floatY + 0.15 && !(jump && this.pos.y < floatY + 0.6)) this.pos.y = Math.min(this.pos.y, floatY + 0.15);
    const gh = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y < gh) { this.pos.y = gh; this.vel.y = Math.max(0, this.vel.y); }
    this.bob += dt * 2;
    this.bobAmt = 0.25;
    this.stepAcc += dt * Math.hypot(this.vel.x, this.vel.z);
    if (this.stepAcc > 2.2) { this.stepAcc = 0; g.audio && g.audio.swimStroke(this.headUnder); }
  }

  _vitals(dt) {
    const g = this.game;
    const t = dt * (g.timeScaleVitals || 1);
    const sprint = this.sprinting;
    if (!sprint && this.mode !== 'climb') this.stamina = Math.min(100, this.stamina + (this.onGround || this.mode === 'swim' ? 16 : 6) * dt * (this.hunger > 15 ? 1 : 0.4));
    this.stamina = Math.max(0, this.stamina);
    this.hunger = Math.max(0, this.hunger - t * (sprint ? 0.11 : 0.06));
    this.thirst = Math.max(0, this.thirst - t * (sprint ? 0.15 : 0.085) * (g.isHotRegion ? 1.6 : 1));
    if (this.headUnder) {
      this.oxygen -= dt * 3.2;
      if (this.oxygen <= 0) { this.oxygen = 0; this.damage(9 * dt, 'drowning'); }
    } else this.oxygen = Math.min(100, this.oxygen + dt * 25);
    // cold at altitude / night
    const cold = g.coldness || 0;
    if (cold > 0 && !g.nearHeat) this.warmth = Math.max(0, this.warmth - cold * dt * 2.2);
    else this.warmth = Math.min(100, this.warmth + dt * (g.nearHeat ? 12 : 4));
    if (this.warmth <= 0) this.damage(1.6 * dt, 'cold');
    if (this.hunger <= 0) this.damage(0.6 * dt, 'starvation');
    if (this.thirst <= 0) this.damage(0.9 * dt, 'dehydration');
    if (this.hunger > 40 && this.thirst > 40 && this.warmth > 30 && this.health < 100) this.health = Math.min(100, this.health + dt * 0.45);
    this.noClimbHint = Math.max(0, this.noClimbHint - dt);
  }

  applyCamera(camera, dt) {
    const bobY = Math.sin(this.bob * 2) * 0.045 * this.bobAmt;
    const bobX = Math.cos(this.bob) * 0.03 * this.bobAmt;
    camera.position.set(this.pos.x, this.pos.y + this.eyeSmooth + bobY - this.landDip, this.pos.z);
    const sh = this.shake;
    const t = performance.now() * 0.001;
    const sx = (Math.sin(t * 37) + Math.sin(t * 23)) * 0.012 * sh;
    const sy = (Math.cos(t * 31) + Math.sin(t * 19)) * 0.012 * sh;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw + sx;
    camera.rotation.x = this.pitch + sy;
    camera.rotation.z = bobX * 0.15 + (this.mode === 'swim' ? Math.sin(t * 0.8) * 0.02 : 0);
    camera.position.x += Math.cos(this.yaw) * bobX;
    camera.position.z -= Math.sin(this.yaw) * bobX;
  }
}

const _eye = new THREE.Vector3();
const _dh = new THREE.Vector3();
const _side = new THREE.Vector3();
const _w = new THREE.Vector3();
void UP;
