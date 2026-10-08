// A single living dinosaur: perception, decision making (state machine) and locomotion.
import * as THREE from 'three';
import { DinoRig } from './rig.js';
import { clamp, lerp } from '../core/noise.js';
import { BIOME } from '../world/worldgen.js';

const TAU = Math.PI * 2;
const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const _v = new THREE.Vector3();

export const PREDATOR_TEMPERS = new Set(['aggressive', 'pack', 'territorial']);

export class Dino {
  constructor(mgr, herd, spec, template, material, x, z, morph = null) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.herd = herd;
    this.spec = spec;
    this.morph = morph;
    this.id = mgr.nextId++;
    this.rig = new DinoRig(template, material);
    this.mesh = this.rig.mesh;
    this.mesh.userData.dino = this;
    this.material = material;
    const scale = herd.juvenile && Math.random() < 0.3 ? 0.55 : 0.88 + Math.random() * 0.24;
    this.scale = scale;
    this.mesh.scale.setScalar(scale);
    this.length = spec.length * scale;
    this.radius = Math.max(0.3, this.length * (spec.body && spec.body.biped ? 0.13 : 0.2));
    this.hip = (template.info.hip || 1) * scale;
    const w = this.game.world;
    this.pos = new THREE.Vector3(x, w.getHeight(x, z), z);
    this.heading = Math.random() * TAU;
    this.speed = 0;
    this.turnRate = 0;
    this.state = 'idle';
    this.stateT = Math.random() * 5;
    this.health = spec.health * scale;
    this.maxHealth = this.health;
    this.alive = true;
    this.hunger = Math.random() * 0.5;
    this.thirst = Math.random() * 0.6;
    this.sedation = 0; // tranquilizer build-up
    this.sedatedT = 0;
    this.scared = 0;
    this.target = new THREE.Vector3(x, 0, z);
    this.prey = null;
    this.attackCD = 0;
    this.callCD = 5 + Math.random() * 20;
    this.alertT = 0;
    this.noticedPlayer = false;
    this.avoidT = 0;
    this.avoidDir = 1;
    this.harvested = {};
    this.deadT = 0;
    this.lookAt = null;
    this.anim = { speed: 0, turnRate: 0, headPitch: 0, headYaw: 0, jaw: 0, lie: 0, dead: 0, roar: 0, reach: 0, flap: 1, fold: 0, swim: 0, bank: 0, pitch: 0 };
    this.isPredator = spec.diet === 'carnivore' || spec.diet === 'piscivore';
    this.flyer = !!spec.flyer;
    this.marine = !!spec.aquatic;
    this.lod = 0;
    this.frame = Math.floor(Math.random() * 4);
    this.strideAcc = 0;
    this.footSide = 1;
    this.chaseT = 0;
    this.hurtT = 0;
    if (this.flyer) {
      this.alt = 40 + Math.random() * 50;
      this.orbitPhase = Math.random() * TAU;
      this.orbitR = 50 + Math.random() * 80;
      this.pos.y = Math.max(w.getHeight(x, z), 0) + this.alt;
      this.diveT = 0;
    }
    if (this.marine) this.pos.y = -6;
  }

  get behavior() {
    if (!this.alive) return 'dead';
    if (this.sedatedT > 0) return 'sleep';
    return this.state;
  }

  setState(s, t = 0) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = t;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.material.dispose();
  }

  // ---------------- Update ----------------
  update(dt, ctx) {
    const g = this.game;
    this.stateT -= dt;
    this.attackCD -= dt;
    this.callCD -= dt;
    this.scared = Math.max(0, this.scared - dt);
    this.hurtT = Math.max(0, this.hurtT - dt * 2);
    this.material.userData.uniforms.uHurt.value = this.hurtT;
    // blinking: brief lid sweeps every few seconds; eyes stay shut in sleep and death
    this._blinkT = (this._blinkT ?? Math.random() * 4) - dt;
    if (this._blinkT < -0.18) this._blinkT = 2 + Math.random() * 5;
    const shut = !this.alive || this.state === 'sleep' ? 1 : this._blinkT < 0 ? Math.sin((-this._blinkT / 0.18) * Math.PI) : 0;
    this.material.userData.uniforms.uBlink.value = shut;
    const a = this.anim;
    a.jaw = 0; a.roar = 0; a.reach = 0; a.headYaw = 0;

    if (!this.alive) {
      this.deadT += dt;
      a.dead = 1; a.speed = 0; this.speed = 0;
      a.swim = 0;
      if (this.marine) { this.pos.y = Math.min(this.pos.y + dt * 0.5, -1); }
      this._applyTransform(dt);
      return;
    }

    if (this.sedatedT > 0) {
      this.sedatedT -= dt;
      this.speed = 0; a.lie = 1; a.headPitch = 0.4; a.speed = 0;
      if (this.sedatedT <= 0) { this.sedation = 0; this.setState('flee', 6); this.fleeFrom(ctx.player.pos); }
      this._applyTransform(dt);
      return;
    }
    this.sedation = Math.max(0, this.sedation - dt * 0.01);
    this.hunger = Math.min(1, this.hunger + dt / (this.isPredator ? 420 : 600));
    this.thirst = Math.min(1, this.thirst + dt / 500);

    if (this.flyer) this._flyerAI(dt, ctx);
    else if (this.marine) this._marineAI(dt, ctx);
    else if (this.isPredator) this._predatorAI(dt, ctx);
    else this._herbivoreAI(dt, ctx);

    this._applyTransform(dt);
  }

  // Perception of the player
  _playerSense(ctx) {
    const p = ctx.player;
    if (!p.alive) return { d: Infinity, sees: false };
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    let r = this.spec.detect * ctx.playerNoise * ctx.visibility;
    if (this.state === 'sleep') r *= 0.3;
    if (p.inCave) r = 0;
    const dy = Math.abs(p.pos.y - this.pos.y);
    return { d, sees: d < r && dy < 30, r };
  }

  _herbivoreAI(dt, ctx) {
    const a = this.anim;
    const spec = this.spec;
    const herd = this.herd;
    const P = this._playerSense(ctx);
    const night = ctx.night;
    a.lie = 0; a.headPitch = 0;

    // threats: predators close by
    if (this.state !== 'flee' && ctx.frameCheck) {
      const th = this.mgr.nearestPredatorTo(this, spec.detect * 0.9);
      if (th && th.spec.length > this.length * 0.25) {
        this.fleeFrom(th.pos);
        herd.panic(th.pos, 10);
      }
    }
    if (herd.panicT > 0 && this.state !== 'flee' && this.state !== 'defend' && spec.temperament !== 'defensive') {
      this.fleeFrom(herd.panicFrom);
    }
    if (this.scared > 0 && this.state !== 'flee') this.fleeFrom(ctx.player.pos);

    // React to the player
    if (P.sees && this.state !== 'flee' && this.state !== 'defend') {
      const temper = spec.temperament;
      if (!this.noticedPlayer) {
        this.noticedPlayer = true;
        this.game.emit('dino-noticed', { dino: this });
      }
      if (temper === 'skittish') {
        this.fleeFrom(ctx.player.pos);
        herd.panic(ctx.player.pos, 8);
        this.call(true);
      } else if (temper === 'defensive' || temper === 'territorial') {
        const charge = this.length * 0.9 + 6 + (temper === 'territorial' ? 8 : 0);
        if (P.d < charge && !ctx.player.inVehicle) {
          this.setState('defend', 6);
          this.call(true);
        } else if (this.state !== 'alert') {
          this.setState('alert', 4 + Math.random() * 3);
        }
      } else if (P.d < this.length * 0.8 + 8) {
        // docile: amble away
        this.setState('avoid', 5);
      }
    } else if (!P.sees && P.d > this.spec.detect * 1.5) this.noticedPlayer = false;

    switch (this.state) {
      case 'flee': {
        a.headPitch = -0.15;
        this.steerAway(this.fleeSrc, this.spec.speed.run, dt);
        if (this.stateT <= 0) this.setState('idle', 2);
        break;
      }
      case 'defend': {
        // Charge the player then back off
        const pp = ctx.player.pos;
        const d = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
        a.headPitch = 0.45;
        this.steerTo(pp.x, pp.z, this.spec.speed.run * 0.85, dt);
        if (d < this.length * 0.42 + 1.4 && this.attackCD <= 0) {
          this.attackCD = 2.5;
          this.game.player.damage(this.spec.damage * 0.55 * this.scale, `${this.spec.short} charge`, this.pos);
          this.game.emit('dino-attack', { dino: this, target: 'player' });
          this.setState('alert', 3);
        }
        if (this.stateT <= 0 || d > this.spec.detect * 1.4) this.setState('alert', 3);
        break;
      }
      case 'alert': {
        const pp = ctx.player.pos;
        this.faceTowards(pp.x, pp.z, dt);
        this.slowDown(dt);
        a.headPitch = this.spec.id === 'triceratops' ? 0.4 : -0.25;
        a.headYaw = 0;
        if (this.callCD <= 0) this.call(true);
        if (this.stateT <= 0) this.setState('idle', 2);
        break;
      }
      case 'avoid': {
        this.steerAway(ctx.player.pos, this.spec.speed.walk, dt);
        if (this.stateT <= 0) this.setState('idle', 2);
        break;
      }
      case 'sleep': {
        this.slowDown(dt * 3);
        a.lie = 1; a.headPitch = 0.3;
        if (!night && this.stateT <= 0) this.setState('idle', 2);
        if (P.d < 10 && ctx.playerNoise > 1) this.fleeFrom(ctx.player.pos);
        break;
      }
      case 'drink': {
        const ws = this.drinkSpot;
        if (!ws) { this.setState('idle', 2); break; }
        const d = Math.hypot(ws.x - this.pos.x, ws.z - this.pos.z);
        if (d > this.length * 0.6 + 2) {
          if (!this.steerTo(ws.x, ws.z, this.spec.speed.walk, dt, true)) { this.drinkSpot = null; this.setState('idle', 3); }
          if (this.stateT < -60) { this.drinkSpot = null; this.setState('idle', 3); }
        } else {
          this.slowDown(dt);
          a.headPitch = 0.95;
          a.jaw = Math.sin(this.rig.t * 6) > 0.6 ? 0.2 : 0;
          this.thirst = Math.max(0, this.thirst - dt / 12);
          if (this.thirst <= 0.02) { this.drinkSpot = null; this.setState('idle', 3); }
        }
        break;
      }
      default: {
        // Herd driven behaviour: graze / move / idle
        if (night && herd.mode !== 'migrate' && Math.random() < dt * 0.05 && !(spec.id === 'galli')) {
          this.setState('sleep', 20 + Math.random() * 30);
          break;
        }
        if (this.thirst > 0.75 && herd.mode !== 'migrate') {
          const ws = this.game.world.nearestWater(this.pos.x, this.pos.z, 2);
          if (ws) { this.drinkSpot = ws; this.setState('drink', 0); break; }
        }
        const ht = herd.target;
        const dh = Math.hypot(ht.x - this.pos.x, ht.z - this.pos.z);
        const spread = 10 + this.length * 1.6 + herd.count * 1.5;
        if (herd.mode === 'move' || herd.mode === 'migrate' || dh > spread * 2.2) {
          const sp = herd.mode === 'migrate' ? this.spec.speed.walk * 1.25 : this.spec.speed.walk;
          const ox = Math.sin(this.id * 1.7) * spread * 0.5, oz = Math.cos(this.id * 2.3) * spread * 0.5;
          this.steerTo(ht.x + ox, ht.z + oz, dh > spread * 3 ? sp * 1.6 : sp, dt);
          this.state = herd.mode === 'migrate' ? 'migrate' : 'walk';
        } else {
          // graze around
          if (this.stateT <= 0) {
            this.stateT = 4 + Math.random() * 8;
            this.grazing = Math.random() < 0.65;
            const ang = Math.random() * TAU;
            this.target.set(ht.x + Math.cos(ang) * spread * Math.random(), 0, ht.z + Math.sin(ang) * spread * Math.random());
          }
          if (this.grazing) {
            this.state = 'graze';
            a.headPitch = spec.id === 'brachio' ? -0.6 : 0.9;
            a.jaw = Math.sin(this.rig.t * 5) > 0.3 ? 0.18 : 0;
            if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) > 3) this.steerTo(this.target.x, this.target.z, 0.6, dt);
            else this.slowDown(dt);
          } else {
            this.state = 'idle';
            if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) > 3) this.steerTo(this.target.x, this.target.z, this.spec.speed.walk * 0.6, dt);
            else this.slowDown(dt);
            a.headYaw = Math.sin(this.rig.t * 0.3 + this.id) * 0.5;
          }
          if (this.callCD <= 0 && Math.random() < 0.002) this.call(false);
        }
      }
    }
    if (this.state !== 'sleep') a.lie = 0;
    this._lookAtPlayer(ctx, P);
  }

  _predatorAI(dt, ctx) {
    const a = this.anim;
    const spec = this.spec;
    const P = this._playerSense(ctx);
    const night = ctx.night;
    a.lie = 0; a.headPitch = 0;
    const repel = this.game.build ? this.game.build.repelAt(this.pos.x, this.pos.z) : 0;

    if (this.scared > 0 && this.state !== 'flee') {
      this.fleeFrom(this.scareFrom || ctx.player.pos, this.scared);
    }
    // territorial spinos defend water; aggressive predators target the player when hungry or provoked
    const huntsPlayer = (spec.temperament === 'aggressive' || spec.temperament === 'pack' || spec.temperament === 'territorial') && spec.id !== 'compy';
    if (P.sees && this.state !== 'flee' && this.state !== 'hunt' && this.state !== 'attack' && this.state !== 'eat') {
      if (!this.noticedPlayer) {
        this.noticedPlayer = true;
        this.game.emit('dino-noticed', { dino: this });
        if (this.length > 5) this.roar();
      }
      const playerSafe = ctx.player.inBase || repel > 0.5 || (ctx.player.inVehicle && ctx.player.vehicleSpeed > 8);
      const interest = this.hunger > 0.35 || spec.temperament === 'territorial' || P.d < spec.detect * 0.5;
      if (huntsPlayer && interest && !playerSafe && !ctx.player.swimming) {
        this.prey = 'player';
        this.setState('hunt', 0);
        this.chaseT = 0;
        if (spec.temperament === 'pack') this.herd.members.forEach((m) => { if (m && m.alive && m !== this && m.state !== 'eat') { m.prey = 'player'; m.setState('hunt', 0); m.chaseT = 0; } });
      } else if (spec.id === 'compy' && P.d < 12) {
        this.setState('alert', 3);
      }
    } else if (!P.sees && P.d > spec.detect * 1.6) this.noticedPlayer = false;

    switch (this.state) {
      case 'flee': {
        this.steerAway(this.fleeSrc, spec.speed.run, dt);
        if (this.stateT <= 0) this.setState('idle', 4);
        break;
      }
      case 'hunt': {
        this.chaseT += dt;
        let tx, tz, td;
        if (this.prey === 'player') {
          const pp = ctx.player.pos;
          tx = pp.x; tz = pp.z;
          td = Math.hypot(tx - this.pos.x, tz - this.pos.z);
          const safe = !ctx.player.alive || ctx.player.inBase || repel > 0.5 || ctx.player.inCave || (ctx.player.swimming && !spec.swims) ||
            (ctx.player.inVehicle && ctx.player.vehicleSpeed > 10 && td > 15);
          if (td > spec.detect * 2.4 || this.chaseT > 45 || safe) { this.prey = null; this.setState('wander', 8); this.noticedPlayer = true; break; }
        } else {
          const pr = this.prey;
          if (!pr || !pr.alive || pr.mgr == null || !pr.active) { this.prey = null; this.setState('idle', 2); break; }
          tx = pr.pos.x; tz = pr.pos.z;
          td = Math.hypot(tx - this.pos.x, tz - this.pos.z);
          if (td > spec.detect * 2.5 || this.chaseT > 50) { this.prey = null; this.setState('wander', 15); break; }
        }
        const reach = this.length * 0.45 + (this.prey === 'player' ? 1.2 : this.prey.radius + 0.5);
        const stalk = spec.temperament === 'pack' && td > 25 && this.chaseT < 6;
        this.steerTo(tx, tz, stalk ? spec.speed.walk * 1.3 : spec.speed.run, dt);
        a.headPitch = -0.05;
        a.jaw = td < reach * 2 ? 0.6 : 0.1;
        if (td < reach && this.attackCD <= 0) this.bite();
        break;
      }
      case 'eat': {
        this.slowDown(dt * 2);
        a.headPitch = 1.0;
        a.jaw = Math.sin(this.rig.t * 4) > 0 ? 0.5 : 0.1;
        this.hunger = Math.max(0, this.hunger - dt / 30);
        if (this.stateT <= 0) { this.setState('idle', 5); this.prey = null; }
        if (P.sees && P.d < 10 && spec.temperament !== 'scavenger') { this.prey = 'player'; this.setState('hunt', 0); this.chaseT = 0; }
        break;
      }
      case 'sleep': {
        this.slowDown(dt * 3);
        a.lie = 1; a.headPitch = 0.35;
        if (!night && this.stateT <= 0) this.setState('idle', 2);
        if (P.d < 14 && ctx.playerNoise > 0.9) { this.setState('idle', 1); this.roar(); }
        break;
      }
      case 'drink': {
        const ws = this.drinkSpot;
        if (!ws) { this.setState('idle', 2); break; }
        const d = Math.hypot(ws.x - this.pos.x, ws.z - this.pos.z);
        if (d > this.length * 0.5 + 2) {
          if (!this.steerTo(ws.x, ws.z, spec.speed.walk, dt, true) || this.stateT < -60) { this.drinkSpot = null; this.setState('idle', 3); }
        } else {
          this.slowDown(dt); a.headPitch = 0.95;
          this.thirst = Math.max(0, this.thirst - dt / 10);
          if (spec.id === 'spino' && Math.random() < dt * 0.1) { this.setState('fish', 8); }
          if (this.thirst <= 0.02) { this.drinkSpot = null; this.setState('idle', 3); }
        }
        break;
      }
      case 'fish': {
        this.slowDown(dt); a.headPitch = 0.8 + Math.sin(this.rig.t * 3) * 0.2; a.jaw = Math.sin(this.rig.t * 7) > 0.7 ? 0.7 : 0;
        if (this.stateT <= 0) this.setState('idle', 4);
        break;
      }
      case 'alert': {
        this.faceTowards(ctx.player.pos.x, ctx.player.pos.z, dt);
        this.slowDown(dt);
        if (this.stateT <= 0) this.setState('idle', 2);
        break;
      }
      default: {
        // Idle / wander / patrol. Look for prey when hungry.
        if (night && !(spec.id === 'raptor' || spec.id === 'allo' || spec.id === 'compy') && Math.random() < dt * 0.04) { this.setState('sleep', 30 + Math.random() * 40); break; }
        if (this.thirst > 0.8) {
          const ws = this.game.world.nearestWater(this.pos.x, this.pos.z, 2);
          if (ws) { this.drinkSpot = ws; this.setState('drink', 0); break; }
        }
        if (this.hunger > 0.6 && ctx.frameCheck) {
          const prey = spec.id === 'compy' ? this.mgr.nearestCarcass(this, 80) : this.mgr.findPrey(this, spec.detect * 1.6);
          if (prey) {
            if (!prey.alive) { this.setState('eat', 25); this.prey = prey; this.target.copy(prey.pos); }
            else { this.prey = prey; this.setState('hunt', 0); this.chaseT = 0; if (this.length > 5) this.roar(); }
            break;
          }
        }
        const herd = this.herd;
        const ht = herd.target;
        const dh = Math.hypot(ht.x - this.pos.x, ht.z - this.pos.z);
        const spread = 8 + this.length + herd.count * 3;
        if (herd.mode === 'move' || dh > spread * 2) {
          const ox = Math.sin(this.id * 1.7) * spread * 0.4, oz = Math.cos(this.id * 2.3) * spread * 0.4;
          this.steerTo(ht.x + ox, ht.z + oz, spec.speed.walk, dt);
          this.state = 'walk';
        } else {
          if (this.stateT <= 0) {
            this.stateT = 5 + Math.random() * 10;
            const ang = Math.random() * TAU;
            this.target.set(ht.x + Math.cos(ang) * spread, 0, ht.z + Math.sin(ang) * spread);
            this.state = Math.random() < 0.6 ? 'walk' : 'idle';
          }
          if (this.state === 'walk' && Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) > 3) this.steerTo(this.target.x, this.target.z, spec.speed.walk * 0.8, dt);
          else { this.slowDown(dt); if (this.state !== 'idle') this.state = 'idle'; }
          a.headYaw = Math.sin(this.rig.t * 0.4 + this.id) * 0.6;
          if (this.callCD <= 0 && Math.random() < 0.003) this.roar();
        }
      }
    }
    if (this.state !== 'sleep') a.lie = 0;
    this._lookAtPlayer(ctx, P);
  }

  _flyerAI(dt, ctx) {
    const a = this.anim;
    const w = this.game.world;
    const herd = this.herd;
    const t = this.rig.t;
    this.orbitPhase += dt * (this.spec.speed.run / this.orbitR) * 0.7;
    const cx = herd.target.x, cz = herd.target.z;
    let tx = cx + Math.cos(this.orbitPhase + this.id) * this.orbitR;
    let tz = cz + Math.sin(this.orbitPhase + this.id) * this.orbitR;
    const ground = Math.max(w.getHeight(this.pos.x, this.pos.z), w.seaLevel);
    let ty = Math.max(w.getHeight(tx, tz), 0) + this.alt;
    // fishing dives over water
    this.diveT -= dt;
    if (this.diveT < -25 && ground <= w.seaLevel + 0.5 && Math.random() < dt * 0.05) this.diveT = 6;
    if (this.diveT > 0) { ty = w.seaLevel + 1.5 + Math.max(0, this.diveT - 3) * 8; this.state = 'fish'; }
    else this.state = 'fly';
    // avoid player glider/gyro
    const pp = ctx.player.pos;
    const dpx = this.pos.x - pp.x, dpz = this.pos.z - pp.z, dpy = this.pos.y - pp.y;
    if (dpx * dpx + dpz * dpz + dpy * dpy < 400) { tx = this.pos.x + dpx * 3; tz = this.pos.z + dpz * 3; ty = this.pos.y + 10; }
    const desired = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    const diff = wrapAngle(desired - this.heading);
    const turn = clamp(diff, -1, 1) * this.spec.turn;
    this.heading = wrapAngle(this.heading + turn * dt);
    this.turnRate = turn;
    const sp = this.spec.speed.run * (this.state === 'fish' ? 1.2 : 1);
    this.speed = lerp(this.speed, sp, 1 - Math.exp(-dt));
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const vy = clamp((ty - this.pos.y) * 0.6, -12, 8);
    this.pos.y += vy * dt;
    if (this.pos.y < ground + 2) this.pos.y = ground + 2;
    a.flap = vy > 0.8 ? 1 : (Math.sin(t * 0.3 + this.id) > 0.55 ? 0.6 : 0);
    a.fold = 0;
    a.bank = clamp(-turn * 0.6, -0.8, 0.8);
    a.pitch = clamp(-vy * 0.05, -0.5, 0.5);
    a.headYaw = Math.sin(t * 0.5 + this.id) * 0.3;
    if (this.callCD <= 0 && Math.random() < dt * 0.05) this.call(false);
  }

  _marineAI(dt, ctx) {
    const a = this.anim;
    const w = this.game.world;
    const herd = this.herd;
    const p = ctx.player;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const playerDeep = p.swimming && w.getHeight(p.pos.x, p.pos.z) < -6;
    let tx = herd.target.x, tz = herd.target.z, ty = -5 - Math.sin(this.rig.t * 0.2 + this.id) * 3;
    let sp = this.spec.speed.walk;
    if (playerDeep && d < 60 && p.alive) {
      this.state = 'hunt';
      tx = p.pos.x; tz = p.pos.z; ty = p.pos.y - 1; sp = this.spec.speed.run;
      if (d < 5 && this.attackCD <= 0) {
        this.attackCD = 2.2;
        a.jaw = 1;
        p.damage(this.spec.damage, 'Mosasaurus', this.pos);
        this.game.emit('dino-attack', { dino: this, target: 'player' });
      }
    } else if (p.boat && d < 35) {
      // circle the boat menacingly
      this.state = 'alert';
      const ang = this.rig.t * 0.3 + this.id;
      tx = p.pos.x + Math.cos(ang) * 18; tz = p.pos.z + Math.sin(ang) * 18; ty = -2.5;
      sp = this.spec.speed.walk * 1.5;
    } else {
      this.state = 'swim';
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 30) herd.retarget = true;
      // rare breach
      this.breachT = (this.breachT || 0) - dt;
      if (this.breachT < -50 && Math.random() < dt * 0.02) this.breachT = 3.2;
      if (this.breachT > 0) { ty = 6 - Math.pow(this.breachT - 1.6, 2) * 4; this.state = 'breach'; sp = this.spec.speed.run; }
    }
    const desired = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    const diff = wrapAngle(desired - this.heading);
    const turn = clamp(diff, -1, 1) * this.spec.turn;
    this.turnRate = turn;
    // stay in deep water
    const aheadX = this.pos.x + Math.sin(this.heading) * 20, aheadZ = this.pos.z + Math.cos(this.heading) * 20;
    if (w.getHeight(aheadX, aheadZ) > -6) this.heading = wrapAngle(this.heading + dt * 1.2);
    else this.heading = wrapAngle(this.heading + turn * dt);
    this.speed = lerp(this.speed, sp, 1 - Math.exp(-dt));
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const floor = w.getHeight(this.pos.x, this.pos.z) + 2;
    this.pos.y = lerp(this.pos.y, Math.max(ty, floor), 1 - Math.exp(-dt * (this.state === 'breach' ? 4 : 0.8)));
    a.pitch = clamp((ty - this.pos.y) * -0.05, -0.6, 0.6);
    a.speed = this.speed;
  }

  // ---------------- Actions ----------------
  bite() {
    this.attackCD = this.spec.id === 'raptor' || this.spec.id === 'compy' ? 0.9 : 1.6;
    this.anim.jaw = 1;
    this.anim.reach = 1;
    const g = this.game;
    if (this.prey === 'player') {
      const pp = g.player.pos;
      const d = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
      if (d < this.length * 0.5 + 2) {
        g.player.damage(this.spec.damage * Math.max(0.5, this.scale), this.spec.short, this.pos);
        g.emit('dino-attack', { dino: this, target: 'player' });
      }
    } else if (this.prey) {
      const pr = this.prey;
      pr.takeDamage(this.spec.damage * 2.2 * this.scale, this);
      g.emit('dino-fight', { a: this, b: pr });
      if (!pr.alive) {
        this.setState('eat', 35 + Math.random() * 20);
        this.target.copy(pr.pos);
        if (this.length > 5) this.roar();
      }
    }
    this.game.audio.dinoSound(this.spec, this.pos, 'bite');
  }

  takeDamage(amount, source) {
    if (!this.alive) return;
    this.health -= amount;
    this.hurtT = 1;
    if (this.health <= 0) { this.die(); return; }
    // retaliate or flee
    if (this.spec.temperament === 'defensive' || this.spec.temperament === 'territorial') {
      if (source && source !== 'player' && source.pos) { this.prey = source; }
      this.setState(source === 'player' ? 'defend' : 'flee', 5);
      if (source && source.pos && this.state === 'flee') this.fleeFrom(source.pos);
    } else if (source && source.pos) {
      this.fleeFrom(source.pos);
      this.herd.panic(source.pos, 10);
    }
    this.call(true);
  }

  die() {
    this.alive = false;
    this.health = 0;
    this.state = 'dead';
    this.speed = 0;
    this.deadT = 0;
    this.game.audio.dinoSound(this.spec, this.pos, 'death');
    this.game.emit('dino-died', { dino: this });
  }

  sedate(power) {
    if (!this.alive) return false;
    this.sedation += power;
    this.hurtT = 0.4;
    const need = Math.max(1, this.length * 0.35);
    if (this.sedation >= need) {
      this.sedatedT = 75;
      this.state = 'sleep';
      this.game.emit('dino-sedated', { dino: this });
      return true;
    }
    if (this.isPredator && this.spec.id !== 'compy') { this.prey = 'player'; this.setState('hunt', 0); this.chaseT = 0; this.roar(); }
    else this.fleeFrom(this.game.player.pos);
    return false;
  }

  scare(from, t = 15) {
    this.scared = t;
    this.scareFrom = from.clone ? from.clone() : new THREE.Vector3(from.x, 0, from.z);
    this.prey = null;
    this.fleeFrom(this.scareFrom, t);
  }

  fleeFrom(src, t = 8) {
    this.fleeSrc = (this.fleeSrc || new THREE.Vector3()).set(src.x, 0, src.z);
    this.setState('flee', t);
    this.stateT = t;
    this.state = 'flee';
  }

  roar() {
    if (this.callCD > 0) return;
    this.callCD = 10 + Math.random() * 15;
    this.anim.roar = 1;
    this.roarT = 2.2;
    this.game.audio.dinoSound(this.spec, this.pos, 'roar');
    this.game.emit('dino-roar', { dino: this });
  }

  call(alarm) {
    if (this.callCD > 0) return;
    this.callCD = alarm ? 6 + Math.random() * 4 : 15 + Math.random() * 25;
    this.roarT = 1.2;
    this.game.audio.dinoSound(this.spec, this.pos, alarm ? 'alarm' : 'call');
    if (!alarm) this.state = this.state === 'graze' ? 'call' : this.state;
  }

  // ---------------- Locomotion ----------------
  steerTo(tx, tz, speed, dt, allowShore = false) {
    const desired = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    return this._steer(desired, speed, dt, allowShore);
  }
  steerAway(src, speed, dt) {
    const desired = Math.atan2(this.pos.x - src.x, this.pos.z - src.z);
    return this._steer(desired, speed, dt, false);
  }
  faceTowards(tx, tz, dt) {
    const desired = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    const diff = wrapAngle(desired - this.heading);
    const tr = clamp(diff * 2, -this.spec.turn, this.spec.turn);
    this.heading = wrapAngle(this.heading + tr * dt);
    this.turnRate = tr;
  }
  slowDown(dt) {
    this.speed = Math.max(0, this.speed - dt * Math.max(2, this.spec.speed.run * 0.8));
    this.turnRate *= 0.9;
  }

  _steer(desired, speed, dt, allowShore) {
    const w = this.game.world;
    if (this.avoidT > 0) {
      this.avoidT -= dt;
      desired += this.avoidDir * 1.4;
    }
    const diff = wrapAngle(desired - this.heading);
    const maxTurn = this.spec.turn * (this.speed > this.spec.speed.walk * 1.5 ? 0.8 : 1.3);
    const tr = clamp(diff * 2.5, -maxTurn, maxTurn);
    this.heading = wrapAngle(this.heading + tr * dt);
    this.turnRate = tr;
    // probe ahead for obstacles: cliffs and deep water
    const probe = Math.max(2.5, this.length * 0.6);
    const ax = this.pos.x + Math.sin(this.heading) * probe, az = this.pos.z + Math.cos(this.heading) * probe;
    const h0 = this.pos.y, h1 = w.getHeight(ax, az);
    const wl = w.waterLevelAt(ax, az);
    const depth = wl - h1;
    const tooSteep = Math.abs(h1 - h0) / probe > 0.95;
    const tooDeep = depth > this.hip * (this.spec.swims ? 3 : allowShore ? 0.35 : 0.55);
    const oob = !w.inBounds(ax * 1.04, az * 1.04);
    let ok = true;
    if (tooSteep || tooDeep || oob) {
      ok = false;
      if (this.avoidT <= 0) { this.avoidT = 1.5 + Math.random() * 2; this.avoidDir = Math.random() < 0.5 ? -1 : 1; }
      speed *= 0.25;
    }
    const accel = speed > this.speed ? Math.max(2, this.spec.speed.run * 0.5) : Math.max(3, this.spec.speed.run);
    this.speed += clamp(speed - this.speed, -accel * dt, accel * dt);
    return ok || !tooDeep;
  }

  _lookAtPlayer(ctx, P) {
    if (P.d < 40 && (this.state === 'idle' || this.state === 'alert' || this.state === 'graze')) {
      const pp = ctx.player.pos;
      const ang = wrapAngle(Math.atan2(pp.x - this.pos.x, pp.z - this.pos.z) - this.heading);
      if (Math.abs(ang) < 1.6) { this.anim.headYaw = clamp(ang, -0.9, 0.9); if (this.state !== 'graze') this.anim.headPitch = Math.min(this.anim.headPitch, 0.05); }
    }
  }

  _applyTransform(dt) {
    const w = this.game.world;
    if (!this.flyer && !this.marine && this.alive && this.speed > 0.01) {
      const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
      this.pos.x = nx; this.pos.z = nz;
      // footprints
      this.strideAcc += this.speed * dt;
      const stride = Math.max(0.6, this.hip * 0.9);
      if (this.strideAcc > stride) {
        this.strideAcc = 0;
        this.footSide = -this.footSide;
        this.mgr.addFootprint(this);
        this.mgr.footfall(this);
      }
    }
    // slide around tree trunks instead of walking through them
    if (!this.flyer && !this.marine && this.alive && this.lod === 0 && this.speed > 0.05) {
      const cp = this._cp || (this._cp = { x: 0, z: 0, hit: false });
      cp.x = this.pos.x; cp.z = this.pos.z; cp.hit = false;
      this.game.veg.collide(cp, this.radius * 0.6, this.pos.y, true);
      if (cp.hit) { this.pos.x = cp.x; this.pos.z = cp.z; }
    }
    if (!this.flyer && !this.marine) {
      const gh = w.getHeight(this.pos.x, this.pos.z);
      // swimmers float
      const wl = w.waterLevelAt(this.pos.x, this.pos.z);
      let y = gh;
      this.anim.swim = 0;
      if (this.spec.swims && wl - gh > this.hip * 0.9) { y = wl - this.hip * 0.85; this.anim.swim = 1; this.state = this.state === 'idle' ? 'swim' : this.state; }
      this.pos.y = y;
      // pitch to slope
      const f = Math.max(1, this.length * 0.35);
      const hf = w.getHeight(this.pos.x + Math.sin(this.heading) * f, this.pos.z + Math.cos(this.heading) * f);
      const hb = w.getHeight(this.pos.x - Math.sin(this.heading) * f, this.pos.z - Math.cos(this.heading) * f);
      this.anim.pitch = clamp(-Math.atan2(hf - hb, f * 2) * 0.7, -0.4, 0.4);
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const a = this.anim;
    a.speed = this.speed / Math.max(0.5, this.scale);
    a.turnRate = this.turnRate;
    if (this.roarT > 0) { this.roarT -= dt; a.roar = 1; a.jaw = 1; a.headPitch = -0.35; }
    // LOD: skip some animation updates far away
    this.frame++;
    const skip = this.lod === 0 ? 1 : this.lod === 1 ? 2 : 4;
    if (this.frame % skip === 0) this.rig.update(dt * skip, a);
  }
}
