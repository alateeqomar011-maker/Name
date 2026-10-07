// A single creature: procedural animation (gait, tail, neck, jaw, wings, swimming) and behaviour.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
const smooth = (t) => t * t * (3 - 2 * t);

export class Creature {
  constructor(manager, spec, mesh, opts = {}) {
    this.m = manager;
    this.spec = spec;
    this.mesh = mesh;
    this.stats = spec.stats;
    this.scale = opts.scale || 1;
    this.juvenile = !!opts.juvenile;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = Math.random() * TAU;
    this.speed = 0;
    this.targetSpeed = 0;
    this.turnRate = 0;
    this.phase = Math.random();
    this.t = Math.random() * 100;
    this.health = spec.stats.hp * this.scale * this.scale;
    this.maxHealth = this.health;
    this.alive = true;
    this.state = 'wander';
    this.stateTime = 0;
    this.stateDur = 5 + Math.random() * 10;
    this.goal = new THREE.Vector3();
    this.target = null; // creature or 'player'
    this.herd = opts.herd || null;
    this.home = opts.home ? opts.home.clone() : new THREE.Vector3();
    this.pitch = 0;
    this.roll = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.headDown = 0;
    this.jawOpen = 0;
    this.jawTarget = 0;
    this.attackCd = 0;
    this.fear = 0;
    this.hunger = Math.random() * 0.5;
    this.stamina = 1;
    this.deadTime = 0;
    this.harvested = 0;
    this.altitude = 0;
    this.vy = 0;
    this.lastStep = [0, 0, 0, 0];
    this.visibleNear = false;
    this.discovered = false;
    this.id = opts.id || 0;
    this.bones = {};
    mesh.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.legs = [];
    for (const leg of spec.legs || []) {
      for (const sfx of ['L', 'R']) {
        const chain = [];
        for (let j = 0; ; j++) {
          const b = this.bones[`${leg.name}${j}${sfx}`];
          if (!b) break;
          chain.push(b);
        }
        this.legs.push({ name: leg.name, side: sfx, chain });
      }
    }
    // spine chains
    const names = spec.spine.map((s) => s.name);
    this.tailBones = names.slice(1, spec.pelvis).reverse().map((n) => this.bones[n]).filter(Boolean);
    this.neckBones = names.filter((n) => n.startsWith('neck')).map((n) => this.bones[n]).filter(Boolean);
    this.spineBones = names.slice(spec.pelvis, -1).map((n) => this.bones[n]).filter(Boolean);
    this.head = this.bones.head;
    this.jaw = this.bones.jaw;
    this.pelvisBone = this.bones.pelvis;
    this.chest = this.bones.chest;
    this.root = this.bones.root;
    mesh.scale.setScalar(this.scale);
    this.radius = spec.length * 0.22 * this.scale;
    if (spec.flying) {
      this.altitude = 60 + Math.random() * 80;
      this.state = 'soar';
      this.speed = spec.stats.speed;
    }
    if (spec.swimming) this.state = 'cruise';
  }

  get isFlying() { return !!this.spec.flying; }
  get isSwimming() { return !!this.spec.swimming; }

  // ---------------------------------------------------------------- behaviour
  setState(s, dur) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    this.stateDur = dur ?? 5 + Math.random() * 8;
  }

  damage(amount, from) {
    if (!this.alive) return;
    this.health -= amount;
    this.fear = Math.min(1, this.fear + amount / (this.maxHealth * 0.3));
    this.m.onCreatureHurt(this, amount, from);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.setState('dead', 1e9);
      this.m.onCreatureDeath(this, from);
      return;
    }
    // reactions
    const b = this.spec.behavior;
    if (from) {
      if (b === 'herd-defensive' && !this.juvenile && Math.random() < 0.7) { this.target = from; this.setState('charge', 8); }
      else if (b === 'apex' || b === 'pack' || b === 'sea') { this.target = from; this.setState('chase', 25); }
      else { this.threat = from; this.setState('flee', 12); }
    }
  }

  targetPos(t) {
    if (t === 'player') return this.m.game.player.pos;
    return t && t.pos;
  }

  think(dt) {
    const g = this.m.game;
    const st = this.stats;
    const b = this.spec.behavior;
    const P = g.player;
    const toP = _v.copy(P.pos).sub(this.pos);
    const dP = toP.length();
    this.stateTime += dt;
    this.attackCd -= dt;
    this.fear *= Math.exp(-dt * 0.05);
    this.hunger = Math.min(1, this.hunger + dt * 0.002);
    const night = g.sky ? 1 - g.sky.dayFactor : 0;
    let detect = st.sight * (P.crouch ? 0.5 : 1) * (1 - night * 0.35) * (P.inCave ? 0.15 : 1);
    if (P.sprinting) detect *= 1.3;
    const playerVisible = !P.dead && dP < detect;

    if (!this.alive) return;

    switch (b) {
      case 'apex': {
        if (this.state !== 'chase' && this.state !== 'roar' && playerVisible && dP < st.aggro && !P.inCave && P.mode !== 'swim') {
          this.target = 'player';
          this.setState('roar', 2.6);
          this.m.roar(this);
        }
        if (this.state === 'wander' && this.hunger > 0.6 && Math.random() < dt * 0.05) {
          const prey = this.m.findPrey(this, 220, ['triceratops', 'raptor']);
          if (prey) { this.target = prey; this.setState('chase', 40); }
        }
        break;
      }
      case 'pack': {
        if ((this.state === 'wander' || this.state === 'idle' || this.state === 'graze') && playerVisible && dP < st.aggro && !P.inCave && (P.mode !== 'swim')) {
          this.m.packAlert(this, 'player');
        }
        if (this.state === 'wander' && this.hunger > 0.55 && Math.random() < dt * 0.03) {
          const prey = this.m.findPrey(this, 160, ['triceratops'], true);
          if (prey) this.m.packAlert(this, prey);
        }
        if (this.state === 'chase' && this.stateTime > 22) { this.setState('wander'); this.target = null; }
        if (this.health < this.maxHealth * 0.3) { this.threat = 'player'; this.setState('flee', 10); }
        break;
      }
      case 'herd-defensive':
      case 'giant': {
        const threat = this.m.nearestPredator(this, b === 'giant' ? 25 : 60);
        if (threat && this.state !== 'charge') {
          if (b === 'herd-defensive' && !this.juvenile && Math.random() < 0.35 && threat.spec.id === 'raptor') { this.target = threat; this.setState('charge', 6); }
          else { this.threat = threat; this.setState('flee', 10); }
        }
        if (playerVisible && dP < 14 && P.sprinting && b !== 'giant' && this.state !== 'charge' && this.state !== 'flee') {
          if (this.fear > 0.2 || Math.random() < dt * 0.4) { this.threat = 'player'; this.setState('flee', 8); }
          else this.setState('alert', 3);
        }
        if (this.state === 'alert' && playerVisible) { this.lookAt = 'player'; }
        break;
      }
      case 'sea': {
        if (P.mode === 'swim' && dP < 70 && this.state !== 'chase') { this.target = 'player'; this.setState('chase', 25); }
        if (this.state === 'chase' && P.mode !== 'swim' && dP > 10) this.setState('cruise');
        break;
      }
      default: break;
    }

    // state machine
    const s = this.state;
    if (s === 'wander' || s === 'idle' || s === 'graze' || s === 'drink' || s === 'browse') this._wander(dt);
    else if (s === 'flee') this._flee(dt);
    else if (s === 'chase' || s === 'charge' || s === 'stalk' || s === 'flank') this._chase(dt);
    else if (s === 'roar') { this.targetSpeed = 0; this.jawTarget = 1; this.lookAt = this.target; if (this.stateTime > this.stateDur) this.setState('chase', 30); }
    else if (s === 'alert') { this.targetSpeed = 0; if (this.stateTime > this.stateDur) this.setState('wander'); }
    else if (s === 'eat') { this.targetSpeed = 0; this.headDown = 1; this.jawTarget = 0.5 + 0.5 * Math.sin(this.t * 5); if (this.stateTime > this.stateDur) { this.hunger = 0; this.setState('wander'); } }
    else if (s === 'soar' || s === 'dive' || s === 'climb') this._fly(dt);
    else if (s === 'cruise') this._cruise(dt);
  }

  _pickGoal(radius) {
    const w = this.m.game.world;
    const c = this.herd ? this.herd.center : this.home;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU, r = radius * Math.sqrt(Math.random());
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!this.m.walkable(this, x, z)) continue;
      this.goal.set(x, w.height(x, z), z);
      return true;
    }
    this.goal.copy(c);
    return false;
  }

  _wander(dt) {
    const st = this.stats;
    if (this.herd && this.herd.leader !== this) {
      // follow herd with formation offset
      const L = this.herd.leader;
      if (L && L.alive) {
        const off = this.herdOffset || (this.herdOffset = new THREE.Vector2((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30).multiplyScalar(this.spec.length / 8));
        const gx = L.pos.x + off.x, gz = L.pos.z + off.y;
        const d = Math.hypot(gx - this.pos.x, gz - this.pos.z);
        this.goal.set(gx, 0, gz);
        if (d > 6) { this.targetSpeed = d > 40 ? st.run * 0.6 : st.speed * Math.min(1.3, d / 15 + 0.4); this._steerTo(this.goal, dt); this.headDown = 0; return; }
        this.targetSpeed = 0;
        if (L.state === 'graze' || Math.random() < dt * 0.05) this.headDown = Math.min(1, this.headDown + dt * 0.4);
        else this.headDown = Math.max(0, this.headDown - dt * 0.5);
        return;
      } else this.herd.leader = this;
    }
    if (this.state === 'wander') {
      if (this.stateTime === 0 || this.goal.lengthSq() === 0 || !this._goalValid) { this._goalValid = this._pickGoal(this.herd ? 400 : 600) || true; }
      const d = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
      this.targetSpeed = st.speed;
      this.headDown = Math.max(0, this.headDown - dt);
      this._steerTo(this.goal, dt);
      if (d < 8 || this.stateTime > 60) {
        this._goalValid = false;
        const r = Math.random();
        if (this.spec.id === 'brachio') {
          const tree = this.m.game.vegetation.findTallTree(this.pos.x, this.pos.z, 60);
          if (tree && r < 0.7) { this.browseTree = tree; this.setState('browse', 15 + Math.random() * 20); return; }
        }
        if (this.spec.diet === 'herbivore' && r < 0.55) this.setState('graze', 6 + Math.random() * 12);
        else if (r < 0.75) this.setState('idle', 3 + Math.random() * 6);
        else this.stateTime = 0;
      }
    } else if (this.state === 'browse') {
      const t = this.browseTree;
      const d = t ? Math.hypot(t.x - this.pos.x, t.z - this.pos.z) : 0;
      if (t && d > 9) { this.goal.set(t.x, t.y, t.z); this.targetSpeed = st.speed * 0.8; this._steerTo(this.goal, dt); }
      else {
        this.targetSpeed = 0;
        if (t) { this.lookTarget = new THREE.Vector3(t.x, t.y + t.h * 0.8, t.z); this.jawTarget = 0.35 + 0.35 * Math.sin(this.t * 3); }
      }
      if (this.stateTime > this.stateDur) { this.lookTarget = null; this.setState('wander'); }
    } else {
      this.targetSpeed = 0;
      if (this.state === 'graze') { this.headDown = Math.min(1, this.headDown + dt * 0.6); this.jawTarget = this.headDown > 0.8 ? 0.2 + 0.2 * Math.sin(this.t * 4) : 0; }
      else this.headDown = Math.max(0, this.headDown - dt * 0.6);
      if (this.stateTime > this.stateDur) this.setState('wander');
    }
  }

  _flee(dt) {
    const tp = this.targetPos(this.threat) || this.pos;
    const away = _v2.copy(this.pos).sub(tp);
    away.y = 0;
    if (away.lengthSq() < 0.01) away.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    away.normalize().multiplyScalar(50).add(this.pos);
    this.targetSpeed = this.stats.run * (0.6 + this.stamina * 0.4);
    this.headDown = 0;
    this._steerTo(away, dt);
    if (this.stateTime > this.stateDur && this.pos.distanceTo(tp) > 80) this.setState('wander');
  }

  _chase(dt) {
    const g = this.m.game;
    const t = this.target;
    const tp = this.targetPos(t);
    if (!tp || (t !== 'player' && !t.alive && this.state !== 'eat') || (t === 'player' && g.player.dead)) {
      if (t && t !== 'player' && !t.alive && t.pos.distanceTo(this.pos) < 30) { this.feedOn = t; this.setState('eat', 30); return; }
      this.target = null;
      this.setState('wander');
      return;
    }
    if (t === 'player' && (g.player.inCave || (g.player.mode === 'swim' && !this.isSwimming && this.spec.id !== 'raptor'))) {
      this.targetSpeed = 0;
      this.lookAt = 'player';
      if (this.stateTime > 6) { this.target = null; this.setState('wander'); }
      return;
    }
    const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
    const st = this.stats;
    this.lookAt = t;
    this.headDown = 0;
    let goal = tp;
    if (this.state === 'flank' && this.flankAngle !== undefined && d > 18) {
      goal = _v2.set(tp.x + Math.cos(this.flankAngle) * 14, 0, tp.z + Math.sin(this.flankAngle) * 14);
      this.targetSpeed = st.run * 0.75;
      if (this.stateTime > 6 || d < 20) this.setState('chase', 20);
    } else if (this.state === 'stalk') {
      this.targetSpeed = st.speed * 1.2;
      if (d < 35 || this.stateTime > 10) this.setState('flank', 8);
    } else {
      this.targetSpeed = this.state === 'charge' ? st.run * 0.9 : st.run * (0.55 + 0.45 * this.stamina);
    }
    this._steerTo(goal, dt);
    const reach = this.spec.length * 0.42 * this.scale + (t === 'player' ? 0.8 : t.radius * 0.6);
    if (d < reach) {
      this.jawTarget = 1;
      if (this.attackCd <= 0) {
        this.attackCd = this.spec.id === 'raptor' ? 1.0 : 1.8;
        const dmg = (this.state === 'charge' ? 30 : st.bite) * this.scale;
        if (t === 'player') {
          if (Math.abs(tp.y - this.pos.y) < 4 + this.spec.stats.hip) g.player.damage(dmg, this.spec.name);
        } else t.damage(dmg, this);
        this.m.attackSound(this);
        if (this.state === 'charge') { this.setState('wander'); this.target = null; }
      }
    } else if (d > 5) this.jawTarget = this.state === 'chase' && this.spec.id === 'trex' ? 0.3 : 0;
    if (this.stateTime > this.stateDur) { this.target = null; this.setState('wander'); }
  }

  _fly(dt) {
    const w = this.m.game.world;
    const st = this.stats;
    this.anchor = this.anchor || this.home.clone();
    if (this.state === 'soar') {
      // circle the anchor on a thermal
      const r = this.circleR || (this.circleR = 120 + Math.random() * 160);
      const ang = Math.atan2(this.pos.z - this.anchor.z, this.pos.x - this.anchor.x) + 0.35;
      const gx = this.anchor.x + Math.cos(ang) * r, gz = this.anchor.z + Math.sin(ang) * r;
      this.goal.set(gx, 0, gz);
      this._steerTo(this.goal, dt, 0.6);
      this.targetSpeed = st.speed;
      const ground = Math.max(w.height(this.pos.x, this.pos.z), 0);
      this.desiredAlt = ground + this.altitude;
      if (this.stateTime > this.stateDur) {
        if (Math.random() < 0.35 && w.waterLevel(this.pos.x, this.pos.z) > w.height(this.pos.x, this.pos.z) + 1) this.setState('dive', 8);
        else { this.anchor.x += (Math.random() - 0.5) * 900; this.anchor.z += (Math.random() - 0.5) * 900; this.anchor.clampScalar(-3600, 3600); this.altitude = 50 + Math.random() * 120; this.setState('soar', 20 + Math.random() * 30); }
      }
    } else if (this.state === 'dive') {
      this.targetSpeed = st.run;
      this.desiredAlt = w.waterLevel(this.pos.x, this.pos.z) + 1.0;
      this._steerTo(this.goal.set(this.pos.x + Math.cos(this.heading) * 50, 0, this.pos.z + Math.sin(this.heading) * 50), dt, 0.2);
      if (this.pos.y < this.desiredAlt + 2) { this.m.splash(this.pos, 0.6); this.setState('climb', 6); }
    } else if (this.state === 'climb') {
      this.targetSpeed = st.speed * 1.1;
      this.desiredAlt = Math.max(w.height(this.pos.x, this.pos.z), 0) + this.altitude;
      if (this.stateTime > this.stateDur) this.setState('soar', 25);
    }
  }

  _cruise(dt) {
    const w = this.m.game.world;
    if (this.stateTime === 0 || this.goal.lengthSq() === 0 || Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 15 || this.stateTime > 40) {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * TAU, r = 100 + Math.random() * 350;
        const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
        const depth = w.waterLevel(x, z) - w.height(x, z);
        if (depth > (this.spec.id === 'mosa' ? 12 : 5)) { this.goal.set(x, 0, z); break; }
      }
      this.stateTime = 0.001;
    }
    this.targetSpeed = this.stats.speed;
    this._steerTo(this.goal, dt);
  }

  _steerTo(goal, dt, turnMul = 1) {
    const desired = Math.atan2(goal.z - this.pos.z, goal.x - this.pos.x);
    let d = angDiff(this.heading, desired);
    // obstacle probe for walkers / swimmers
    if (!this.isFlying) {
      const look = 6 + this.speed * 1.2;
      const ax = this.pos.x + Math.cos(this.heading + d * 0.3) * look, az = this.pos.z + Math.sin(this.heading + d * 0.3) * look;
      if (!this.m.walkable(this, ax, az)) {
        const l = this.m.walkable(this, this.pos.x + Math.cos(this.heading + 0.9) * look, this.pos.z + Math.sin(this.heading + 0.9) * look);
        d = l ? 1.2 : -1.2;
        if (this.state === 'wander') this._goalValid = false;
      }
    }
    const maxTurn = this.stats.turn * turnMul * (this.speed > this.stats.speed * 1.5 ? 0.8 : 1);
    const tr = Math.max(-maxTurn, Math.min(maxTurn, d * 2.0));
    this.turnRate += (tr - this.turnRate) * Math.min(1, dt * 4);
  }

  // ---------------------------------------------------------------- physics
  move(dt) {
    const w = this.m.game.world;
    const st = this.stats;
    if (!this.alive) {
      this.speed *= Math.exp(-dt * 3);
      this.turnRate = 0;
    }
    const accel = this.targetSpeed > this.speed ? 2.5 + st.run * 0.4 : 4 + st.run * 0.5;
    this.speed += Math.max(-accel * dt, Math.min(accel * dt, this.targetSpeed - this.speed));
    if (this.speed > st.speed * 1.6) this.stamina = Math.max(0, this.stamina - dt * (this.spec.id === 'raptor' ? 0.035 : 0.025));
    else this.stamina = Math.min(1, this.stamina + dt * 0.06);
    this.heading += this.turnRate * dt;
    // separation from neighbours
    const sep = this.m.separation(this);
    const cx = Math.cos(this.heading), sz = Math.sin(this.heading);
    let nx = this.pos.x + (cx * this.speed + sep.x) * dt;
    let nz = this.pos.z + (sz * this.speed + sep.z) * dt;
    if (!this.isFlying && !this.m.walkable(this, nx, nz) && this.m.walkable(this, this.pos.x, this.pos.z)) {
      nx = this.pos.x; nz = this.pos.z;
      this.speed *= 0.5;
    }
    nx = Math.max(-4000, Math.min(4000, nx));
    nz = Math.max(-4000, Math.min(4000, nz));
    this.pos.x = nx;
    this.pos.z = nz;

    if (this.isFlying) {
      const target = this.desiredAlt ?? this.pos.y;
      const ground = Math.max(w.height(this.pos.x, this.pos.z), w.waterLevel(this.pos.x, this.pos.z)) + 2;
      this.vy += (Math.max(target, ground + 3) - this.pos.y) * dt * 0.8 - this.vy * dt * 1.2;
      this.pos.y += this.vy * dt;
      if (this.pos.y < ground) this.pos.y = ground;
      this.pitch = Math.max(-0.6, Math.min(0.5, -this.vy * 0.06));
      this.roll = -this.turnRate * 0.9;
    } else if (this.isSwimming) {
      const wl = w.waterLevel(this.pos.x, this.pos.z);
      const floor = w.height(this.pos.x, this.pos.z);
      let ty = this.state === 'chase' && this.target === 'player' ? this.m.game.player.pos.y + 0.5 : wl - (this.spec.id === 'plesio' ? 1.4 : 5 + Math.sin(this.t * 0.1) * 3);
      if (this.breach > 0) { this.breach -= dt; ty = wl + 6; }
      ty = Math.max(floor + 2.5, Math.min(wl - (this.spec.id === 'plesio' ? 1.2 : 1.5), ty));
      if (this.breach > 0) ty = wl + 4;
      this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 0.8);
      this.pitch = 0;
      this.roll = -this.turnRate * 0.3;
      if (this.spec.id === 'mosa' && !this.breach && Math.random() < dt * 0.004 && this.state === 'cruise') { this.breach = 2.2; }
      if (this.breach > 0 && this.breach < 0.2) this.m.splash(this.pos, 2.5);
    } else {
      // ground following + body pitch from terrain under hips/chest
      const half = this.spec.length * 0.22 * this.scale;
      const hb = w.height(this.pos.x - cx * half, this.pos.z - sz * half);
      const hf = w.height(this.pos.x + cx * half, this.pos.z + sz * half);
      const hc = w.height(this.pos.x, this.pos.z);
      const gy = Math.max(hc, (hb + hf) / 2);
      if (!this.alive) {
        this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 3);
      } else this.pos.y = gy;
      const tp = Math.atan2(hf - hb, half * 2) * 0.8;
      this.pitch += (tp - this.pitch) * Math.min(1, dt * 4);
      this.roll += ((this.alive ? -this.turnRate * this.speed * 0.012 : 0) - this.roll) * Math.min(1, dt * 3);
    }
  }

  // ---------------------------------------------------------------- animation
  animate(dt, detail) {
    const st = this.stats;
    this.t += dt;
    const mesh = this.mesh;
    // root transform
    mesh.position.copy(this.pos);
    let deadRoll = 0;
    if (!this.alive) {
      this.deadTime += dt;
      deadRoll = Math.min(1, this.deadTime * 0.8);
    }
    _e.set(-this.pitch, -this.heading + Math.PI / 2, this.roll + smooth(deadRoll) * 1.45 * (this.id % 2 ? 1 : -1), 'YXZ');
    mesh.quaternion.setFromEuler(_e);
    if (!detail) return;

    this.jawOpen += (this.jawTarget - this.jawOpen) * Math.min(1, dt * 8);
    this.jawTarget *= Math.exp(-dt * 1.5);

    if (this.isFlying) return this._animFly(dt);
    if (this.isSwimming) return this._animSwim(dt);

    const speed = this.speed;
    const stride = st.stride;
    this.phase = (this.phase + (speed / stride) * dt * (this.alive ? 1 : 0)) % 1;
    const gaitAmt = Math.min(1, speed / Math.max(0.5, st.speed));
    const run = Math.max(0, Math.min(1, (speed - st.speed * 1.3) / (st.run - st.speed * 1.3)));
    const A = (0.18 + 0.3 * gaitAmt + 0.15 * run) * Math.min(1, gaitAmt * 1.5);
    const biped = !this.legs.some((l) => l.name === 'fore');
    const breathe = Math.sin(this.t * (this.alive ? 1.1 : 0)) * 0.012;

    // body bob
    const bob = Math.abs(Math.sin(this.phase * TAU * (biped ? 1 : 2))) * 0.05 * A * st.hip;
    if (this.root) this.root.position.y = -bob + (this.alive ? 0 : -st.hip * 0.35 * Math.min(1, this.deadTime));
    if (this.pelvisBone) {
      this.pelvisBone.rotation.z = biped ? Math.sin(this.phase * TAU) * 0.05 * A : 0;
      this.pelvisBone.rotation.x = run * 0.06;
    }
    if (this.chest) this.chest.scale.set(1 + breathe, 1 + breathe, 1);

    // legs
    for (const leg of this.legs) {
      const c = leg.chain;
      if (c.length < 3) continue;
      const isArm = leg.name === 'arm';
      if (isArm) {
        c[0].rotation.x = -0.3 + Math.sin(this.t * 1.3) * 0.05 + (this.state === 'chase' ? -0.3 : 0);
        c[1].rotation.x = 0.5;
        continue;
      }
      let off = leg.side === 'L' ? 0 : 0.5;
      if (leg.name === 'fore') off += run > 0.3 ? 0.1 : 0.25;
      const p = (this.phase + off) % 1;
      const duty = 0.62 - run * 0.2;
      let hipA, knee;
      if (p < duty) {
        const s = p / duty;
        hipA = -A + 2 * A * s;
        knee = 0.05 * A;
      } else {
        const s = (p - duty) / (1 - duty);
        hipA = A - 2 * A * smooth(s);
        knee = Math.sin(Math.PI * s) * (0.5 + run * 0.5) * Math.min(1, A * 3);
      }
      const fore = leg.name === 'fore';
      c[0].rotation.x = hipA;
      c[1].rotation.x = fore ? -knee * 0.6 : knee;
      c[2].rotation.x = fore ? knee * 0.5 : -knee * 1.3 - hipA * 0.3;
      if (c[3]) c[3].rotation.x = fore ? 0 : knee * 0.6 + Math.max(0, -hipA) * 0.5;
      // footstep events (stance start)
      const k = (leg.side === 'L' ? 0 : 1) + (fore ? 2 : 0);
      const contact = p < 0.08 && speed > 0.3;
      if (contact && !this.lastStep[k]) this.m.footstep(this, k);
      this.lastStep[k] = contact ? 1 : 0;
    }

    // tail
    const turn = this.turnRate;
    this.tailBones.forEach((b, i) => {
      const f = (i + 1) / this.tailBones.length;
      b.rotation.y = Math.sin(this.t * 1.1 - i * 0.6) * 0.04 * (1 + i * 0.2) + Math.sin(this.phase * TAU - i * 0.8) * 0.06 * A + turn * 0.12 * f;
      b.rotation.x = Math.sin(this.t * 0.7 - i * 0.4) * 0.02 - run * 0.02;
    });

    // neck & head: look at target / graze / browse
    let yawT = 0, pitchT = 0;
    let lookP = null;
    if (this.lookTarget) lookP = this.lookTarget;
    else if (this.lookAt) lookP = this.targetPos(this.lookAt);
    if (lookP && this.alive) {
      const hx = lookP.x - this.pos.x, hz = lookP.z - this.pos.z;
      yawT = Math.max(-0.9, Math.min(0.9, angDiff(this.heading, Math.atan2(hz, hx)))) * -1;
      const headY = this.pos.y + (this.spec.spine.find((s) => s.name === 'head').y) * this.scale;
      pitchT = Math.max(-0.6, Math.min(0.9, Math.atan2((lookP.y + 1) - headY, Math.hypot(hx, hz))));
    }
    if (!this.lookTarget) this.lookAt = null;
    const down = this.headDown;
    const isBrachio = this.spec.id === 'brachio';
    this.lookYaw += (yawT - this.lookYaw) * Math.min(1, dt * 3);
    this.lookPitch += (pitchT - this.lookPitch) * Math.min(1, dt * 3);
    const nb = this.neckBones.length || 1;
    const graze = isBrachio ? 0.32 : this.spec.id === 'triceratops' ? 0.18 : 0.3;
    this.neckBones.forEach((b, i) => {
      b.rotation.y = this.lookYaw / (nb + 1) + Math.sin(this.t * 0.6 + i) * 0.015;
      b.rotation.x = -this.lookPitch / (nb + 1) * (isBrachio ? 0.6 : 1) + down * graze + Math.sin(this.phase * TAU * 2) * 0.02 * A;
    });
    if (this.head) {
      this.head.rotation.y = this.lookYaw / (nb + 1);
      this.head.rotation.x = -this.lookPitch / (nb + 1) + down * 0.25 - (this.state === 'roar' ? 0.35 : 0);
      this.head.rotation.z = Math.sin(this.t * 0.9) * 0.02;
    }
    if (this.jaw) this.jaw.rotation.x = this.jawOpen * (this.spec.id === 'trex' ? 0.55 : 0.4);
    if (!this.alive && this.neckBones.length) this.neckBones.forEach((b) => { b.rotation.x = 0.15; });
  }

  _animFly(dt) {
    const flap = this.state === 'climb' ? 1 : this.state === 'dive' ? 0 : (Math.sin(this.t * 0.25 + this.id) > 0.75 ? 1 : 0);
    this.flapAmt = (this.flapAmt || 0) + (flap - (this.flapAmt || 0)) * Math.min(1, dt * 2);
    const ft = this.t * 4.2;
    const a = this.flapAmt;
    for (const leg of this.legs) {
      const c = leg.chain;
      const s = leg.side === 'L' ? 1 : -1;
      if (leg.name === 'arm') {
        const fold = this.state === 'dive' ? 0.9 : 0;
        c[0].rotation.z = s * (Math.sin(ft) * 0.6 * a + 0.05 + Math.sin(this.t * 0.8) * 0.03);
        c[0].rotation.y = s * fold * 0.6;
        c[1].rotation.z = s * (-Math.sin(ft - 0.6) * 0.25 * a);
        c[1].rotation.y = -s * fold * 0.9;
        c[2].rotation.z = s * (-Math.sin(ft - 1.2) * 0.2 * a);
        c[2].rotation.y = s * fold * 1.2;
      } else {
        c[0].rotation.x = 0.3;
      }
    }
    this.neckBones.forEach((b) => { b.rotation.x = this.state === 'dive' ? 0.2 : -0.05; });
    if (this.head) this.head.rotation.y = Math.sin(this.t * 0.5) * 0.25;
  }

  _animSwim(dt) {
    const sp = this.speed / Math.max(1, this.stats.speed);
    this.phase = (this.phase + dt * (0.35 + sp * 0.4)) % 1;
    const p = this.phase * TAU;
    const plesio = this.spec.id === 'plesio';
    this.tailBones.forEach((b, i) => {
      b.rotation.y = Math.sin(p - i * 0.7) * (plesio ? 0.08 : 0.12 + i * 0.05);
    });
    this.spineBones.forEach((b, i) => { b.rotation.y = Math.sin(p + 0.8 - i * 0.5) * (plesio ? 0.02 : 0.05); });
    for (const leg of this.legs) {
      const c = leg.chain;
      const s = leg.side === 'L' ? 1 : -1;
      const off = leg.name === 'flip' ? 0 : Math.PI;
      c[0].rotation.z = s * Math.sin(p * (plesio ? 1 : 0.5) + off) * (plesio ? 0.45 : 0.15);
      c[0].rotation.x = Math.sin(p * (plesio ? 1 : 0.5) + off + 1.2) * 0.25;
    }
    const nb = this.neckBones.length;
    this.neckBones.forEach((b, i) => {
      b.rotation.y = Math.sin(this.t * 0.4 + i * 0.6) * 0.08;
      b.rotation.x = plesio ? Math.sin(this.t * 0.3 + i) * 0.04 : 0;
    });
    void nb;
    if (this.jaw) this.jaw.rotation.x = this.jawOpen * 0.5;
  }

  // world-space hit spheres for combat
  hitSpheres(out) {
    out.length = 0;
    const sc = this.scale;
    const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    for (const n of this.spec.spine) {
      if (!['pelvis', 'chest', 'head', 'tail2', 'spine1'].includes(n.name)) continue;
      const r = Math.max(n.w, n.h) * sc * (n.name === 'head' ? 1.3 : 1.05);
      let y = n.y * sc;
      if (!this.alive) y *= 0.4;
      out.push({ x: this.pos.x + ch * n.z * sc, y: this.pos.y + y, z: this.pos.z + sh * n.z * sc, r, part: n.name });
    }
    return out;
  }
}
