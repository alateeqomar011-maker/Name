// Drivable vehicles: off-road jeep, motor boat and gyrocopter.
import * as THREE from 'three';
import { clamp, lerp } from '../core/noise.js';

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const std = (color, rough = 0.6, metal = 0.2) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(r0, r1, h, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
  m.castShadow = true;
  return m;
}

function buildJeep() {
  const g = new THREE.Group();
  const body = std(0x7a7a4a, 0.55, 0.35), dark = std(0x222222, 0.8, 0.1), metal = std(0x999999, 0.35, 0.8), tire = std(0x151515, 0.95, 0);
  const glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.45 });
  g.add(box(1.9, 0.55, 4.1, body, 0, 0.95, 0));
  g.add(box(1.85, 0.4, 1.5, body, 0, 1.38, 1.15)); // hood
  g.add(box(1.95, 0.2, 4.2, dark, 0, 0.62, 0)); // skirt
  g.add(box(2.05, 0.18, 0.25, metal, 0, 0.85, 2.15)); // bumper
  g.add(box(2.05, 0.18, 0.25, metal, 0, 0.85, -2.15));
  const grille = box(1.4, 0.4, 0.06, dark, 0, 1.2, 2.06); g.add(grille);
  const ws = box(1.8, 0.7, 0.06, glass, 0, 1.9, 0.38); ws.rotation.x = -0.25; g.add(ws);
  // roll cage
  for (const x of [-0.88, 0.88]) {
    for (const z of [0.35, -1.6]) { const p = cyl(0.05, 0.05, 1.2, metal); p.position.set(x, 1.85, z); g.add(p); }
    const top = cyl(0.05, 0.05, 1.95, metal); top.rotation.x = Math.PI / 2; top.position.set(x, 2.45, -0.62); g.add(top);
  }
  const bar = cyl(0.05, 0.05, 1.76, metal); bar.rotation.z = Math.PI / 2; bar.position.set(0, 2.45, 0.35); g.add(bar);
  const bar2 = bar.clone(); bar2.position.z = -1.6; g.add(bar2);
  // seats
  for (const x of [-0.45, 0.45]) { g.add(box(0.55, 0.15, 0.55, dark, x, 1.3, -0.2)); g.add(box(0.55, 0.6, 0.12, dark, x, 1.6, -0.5)); }
  // spare wheel & jerry can
  const spare = cyl(0.45, 0.45, 0.3, tire, 16); spare.rotation.x = Math.PI / 2; spare.position.set(0, 1.35, -2.2); g.add(spare);
  g.add(box(0.3, 0.45, 0.2, std(0x6a2a1a), 0.7, 1.4, -2.15));
  // lights
  const lightM = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0 });
  for (const x of [-0.65, 0.65]) { const l = cyl(0.13, 0.13, 0.08, lightM); l.rotation.x = Math.PI / 2; l.position.set(x, 1.25, 2.1); g.add(l); }
  const wheels = [];
  for (const [x, z] of [[-1.0, 1.35], [1.0, 1.35], [-1.0, -1.35], [1.0, -1.35]]) {
    const wg = new THREE.Group();
    const t = cyl(0.48, 0.48, 0.38, tire, 18); t.rotation.z = Math.PI / 2; wg.add(t);
    const hub = cyl(0.22, 0.22, 0.4, metal, 8); hub.rotation.z = Math.PI / 2; wg.add(hub);
    wg.position.set(x, 0.48, z);
    g.add(wg); wheels.push(wg);
  }
  return { g, wheels, lightM };
}

function buildBoat() {
  const g = new THREE.Group();
  const hull = std(0xe8e2d0, 0.4, 0.1), trim = std(0x2a5d7a, 0.4, 0.2), wood = std(0x7a5232, 0.7, 0), dark = std(0x222222, 0.6, 0.3);
  // hull from a lathe-like shape
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, 0); shape.lineTo(1.1, 0); shape.lineTo(1.0, -0.55); shape.lineTo(0, -0.8); shape.lineTo(-1.0, -0.55); shape.lineTo(-1.1, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.6, bevelEnabled: false });
  geo.translate(0, 0, -2.6);
  // taper bow
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z > 0.8) { const k = 1 - (z - 0.8) / 1.4 * 0.85; p.setX(i, p.getX(i) * Math.max(0.12, k)); p.setY(i, p.getY(i) + (z - 0.8) * 0.12); }
  }
  geo.computeVertexNormals();
  const hm = new THREE.Mesh(geo, hull); hm.castShadow = true; hm.position.y = 0.6; g.add(hm);
  g.add(box(2.25, 0.12, 3.6, trim, 0, 0.6, -0.6));
  for (const z of [-0.4, -1.4]) g.add(box(1.9, 0.12, 0.45, wood, 0, 0.75, z));
  const motor = box(0.4, 0.7, 0.5, dark, 0, 0.95, -2.75); g.add(motor);
  const shaft = cyl(0.06, 0.06, 0.9, dark); shaft.position.set(0, 0.35, -2.8); g.add(shaft);
  const ws = box(1.6, 0.45, 0.05, new THREE.MeshStandardMaterial({ color: 0x334455, transparent: true, opacity: 0.4, roughness: 0.05 }), 0, 1.0, 0.6); ws.rotation.x = -0.4; g.add(ws);
  return { g, motor };
}

function buildGyro() {
  const g = new THREE.Group();
  const body = std(0xc9541e, 0.45, 0.3), dark = std(0x222222, 0.6, 0.4), metal = std(0xaaaaaa, 0.3, 0.8);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), body);
  pod.scale.set(0.8, 0.8, 1.5); pod.position.y = 1.3; pod.castShadow = true; g.add(pod);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.4, roughness: 0.05 }));
  canopy.position.set(0, 1.55, 0.3); canopy.scale.set(0.95, 0.9, 1.3); g.add(canopy);
  const boom = cyl(0.08, 0.05, 3.2, dark); boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.4, -2.4); g.add(boom);
  const fin = box(0.06, 0.9, 0.6, body, 0, 1.75, -3.8); g.add(fin);
  const mast = cyl(0.07, 0.07, 1.0, metal); mast.position.set(0, 2.5, -0.1); g.add(mast);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.0, -0.1);
  for (let i = 0; i < 2; i++) { const b = box(7.5, 0.04, 0.25, dark); b.rotation.y = i * Math.PI / 2; rotor.add(b); }
  g.add(rotor);
  const prop = new THREE.Group(); prop.position.set(0, 1.4, -1.45);
  for (let i = 0; i < 3; i++) { const b = box(0.12, 1.3, 0.04, dark); b.rotation.z = (i / 3) * Math.PI * 2; prop.add(b); }
  g.add(prop);
  for (const x of [-0.7, 0.7]) { const sk = box(0.08, 0.08, 2.0, metal, x, 0.1, 0); g.add(sk); const st = cyl(0.04, 0.04, 0.8, metal); st.position.set(x, 0.5, 0); g.add(st); }
  return { g, rotor, prop };
}

class Vehicle {
  constructor(game, type) {
    this.game = game;
    this.type = type;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.pitch = 0; this.roll = 0;
    this.fuel = 100;
    this.occupied = false;
    this.showDriver = true;
    this.root = new THREE.Group();
    this.root.visible = false;
    game.scene.add(this.root);
    this.deployed = false;
  }
  seatPosition(out) { return out.copy(this.seat).applyMatrix4(this.root.matrixWorld); }
  place(x, z, heading) {
    this.pos.set(x, this.groundAt(x, z), z);
    this.heading = heading;
    this.speed = 0;
    this.root.visible = true;
    this.deployed = true;
    this.sync();
  }
  groundAt(x, z) { return this.game.world.getHeight(x, z); }
  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, 0, 0);
    this.root.rotateY(this.heading);
    this.root.rotateX(this.pitch);
    this.root.rotateZ(this.roll);
    this.root.updateMatrixWorld(true);
  }
  refuel() {
    const inv = this.game.inventory;
    while (this.fuel < 60 && inv.has('fuel')) { inv.remove('fuel', 1); this.fuel = Math.min(100, this.fuel + 40); }
  }
}

class Jeep extends Vehicle {
  constructor(game) {
    super(game, 'jeep');
    const { g, wheels, lightM } = buildJeep();
    this.root.add(g);
    this.wheels = wheels; this.lightM = lightM;
    this.seat = new THREE.Vector3(-0.45, 1.95, -0.2);
    this.camHeight = 2.4; this.camDist = 8;
    this.wheelSpin = 0;
    this.lights = [];
    for (const x of [-0.65, 0.65]) {
      const L = new THREE.SpotLight(0xfff4dd, 0, 70, 0.5, 0.5, 1);
      L.position.set(x, 1.25, 2.2);
      L.target.position.set(x * 2, 0, 20);
      this.root.add(L, L.target);
      this.lights.push(L);
    }
  }
  update(dt, input) {
    const w = this.game.world;
    let thr = 0, steer = 0;
    if (this.occupied && input.enabled) {
      if (input.down('KeyW')) thr += 1;
      if (input.down('KeyS')) thr -= 1;
      if (input.down('KeyA')) steer += 1;
      if (input.down('KeyD')) steer -= 1;
    }
    if (this.fuel <= 0) thr = 0;
    const n = w.getNormal(this.pos.x, this.pos.z);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const slope = -(n.x * fx + n.z * fz); // >0 uphill
    const maxV = input.down && input.down('ShiftLeft') ? 30 : 24;
    let acc = thr > 0 ? (this.speed < 0 ? 18 : 9) * thr : thr < 0 ? (this.speed > 0 ? -16 : -6) : -Math.sign(this.speed) * Math.min(Math.abs(this.speed) / dt, 3);
    acc -= slope * 14;
    this.speed = clamp(this.speed + acc * dt, -8, maxV);
    if (n.y < 0.72 && slope > 0.4) this.speed = Math.min(this.speed, 2);
    // water stalls the jeep
    const depth = w.waterLevelAt(this.pos.x, this.pos.z) - this.pos.y;
    if (depth > 1.0) this.speed *= Math.exp(-dt * 3);
    const turn = steer * clamp(Math.abs(this.speed) / 6, 0, 1) * (this.speed < 0 ? -1 : 1) * 0.9;
    this.heading = wrap(this.heading + turn * dt);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    const p = { x: nx, z: nz, hit: false };
    this.game.veg.collide(p, 1.4, this.pos.y);
    this.game.build.collide(p, 1.4, this.pos.y);
    this.game.pois.collide(p, 1.4, this.pos.y);
    if (p.hit) { if (Math.abs(this.speed) > 8) { this.game.cam.shake(0.5); this.game.audio.play('land'); } this.speed *= -0.25; }
    // ram dinosaurs
    for (const d of this.game.dinos.active) {
      if (d.flyer || d.marine || !d.alive) continue;
      const rr = d.radius + 1.6;
      const dx = p.x - d.pos.x, dz = p.z - d.pos.z;
      if (dx * dx + dz * dz < rr * rr) {
        if (Math.abs(this.speed) > 6) { d.takeDamage(Math.abs(this.speed) * (d.length < 3 ? 6 : 1.5), 'player'); this.game.cam.shake(0.6); }
        this.speed *= d.length > 6 ? -0.4 : 0.6;
        const dd = Math.hypot(dx, dz) || 1;
        p.x = d.pos.x + (dx / dd) * rr; p.z = d.pos.z + (dz / dd) * rr;
      }
    }
    if (!w.inBounds(p.x, p.z)) { p.x = this.pos.x; p.z = this.pos.z; this.speed = 0; }
    this.pos.x = p.x; this.pos.z = p.z;
    // suspension: sample wheel heights
    const sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
    const hF = w.getHeight(this.pos.x + fx * 1.35, this.pos.z + fz * 1.35), hB = w.getHeight(this.pos.x - fx * 1.35, this.pos.z - fz * 1.35);
    const hL = w.getHeight(this.pos.x + sx * 1.0, this.pos.z + sz * 1.0), hR = w.getHeight(this.pos.x - sx * 1.0, this.pos.z - sz * 1.0);
    const target = Math.max((hF + hB + hL + hR) / 4, w.getHeight(this.pos.x, this.pos.z) - 0.1);
    if (this.pos.y > target + 0.3) { this.vy -= 22 * dt; this.pos.y += this.vy * dt; if (this.pos.y < target) { this.pos.y = target; if (this.vy < -8) this.game.cam.shake(0.3); this.vy = 0; } }
    else { this.pos.y = lerp(this.pos.y, target, 1 - Math.exp(-dt * 12)); this.vy = 0; }
    this.pitch = lerp(this.pitch, -Math.atan2(hF - hB, 2.7), 1 - Math.exp(-dt * 8));
    this.roll = lerp(this.roll, Math.atan2(hL - hR, 2.0), 1 - Math.exp(-dt * 8));
    this.wheelSpin += this.speed * dt / 0.48;
    this.wheels.forEach((wh, i) => { wh.rotation.x = this.wheelSpin; if (i < 2) wh.rotation.y = steer * 0.35; });
    if (this.occupied) this.fuel = Math.max(0, this.fuel - Math.abs(this.speed) * dt * 0.012);
    const night = this.game.sky.dayFactor < 0.35 || this.game.caves.active;
    for (const L of this.lights) L.intensity = this.occupied && night ? 140 : 0;
    this.lightM.emissiveIntensity = this.occupied && night ? 4 : 0;
    this.sync();
    return Math.abs(this.speed) / 24;
  }
}

class Boat extends Vehicle {
  constructor(game) {
    super(game, 'boat');
    const { g } = buildBoat();
    this.root.add(g);
    this.seat = new THREE.Vector3(0, 1.75, -1.4);
    this.camHeight = 2.2; this.camDist = 9;
    this.t = 0;
  }
  groundAt(x, z) { return this.game.world.waterLevelAt(x, z); }
  update(dt, input) {
    const w = this.game.world;
    this.t += dt;
    let thr = 0, steer = 0;
    if (this.occupied && input.enabled) {
      if (input.down('KeyW')) thr += 1;
      if (input.down('KeyS')) thr -= 0.5;
      if (input.down('KeyA')) steer += 1;
      if (input.down('KeyD')) steer -= 1;
    }
    const maxV = input.down('ShiftLeft') ? 22 : 16;
    this.speed += thr * 7 * dt;
    this.speed -= this.speed * 0.4 * dt;
    this.speed = clamp(this.speed, -5, maxV);
    this.heading = wrap(this.heading + steer * dt * (0.4 + Math.min(1, Math.abs(this.speed) / 8) * 0.6));
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    const wl = w.waterLevelAt(nx + fx * 2.3, nz + fz * 2.3);
    const ground = w.getHeight(nx + fx * 2.3, nz + fz * 2.3);
    if (ground > wl - 0.5 || !w.inBounds(nx, nz)) { this.speed *= -0.2; if (Math.abs(this.speed) > 3) this.game.cam.shake(0.3); }
    else { this.pos.x = nx; this.pos.z = nz; }
    const L = w.waterLevelAt(this.pos.x, this.pos.z);
    const amp = 0.25 + (this.game.weather ? this.game.weather.wind : 0.3) * 0.5;
    const wave = Math.sin(this.t * 1.3 + this.pos.x * 0.05) * amp * 0.4;
    this.pos.y = L + wave - 0.1;
    this.pitch = Math.sin(this.t * 1.1) * 0.04 * (1 + amp) - Math.min(0.12, Math.abs(this.speed) * 0.006);
    this.roll = Math.sin(this.t * 0.9 + 1) * 0.05 * (1 + amp) - steer * Math.min(0.15, Math.abs(this.speed) * 0.01);
    this.sync();
    if (this.occupied && Math.abs(this.speed) > 4 && Math.random() < dt * 4) this.game.fx.splash(this.root.localToWorld(new THREE.Vector3(0, 0.2, -2.6)), 0.6);
    return Math.abs(this.speed) / 16;
  }
}

class Gyro extends Vehicle {
  constructor(game) {
    super(game, 'gyro');
    const { g, rotor, prop } = buildGyro();
    this.root.add(g);
    this.rotor = rotor; this.prop = prop;
    this.seat = new THREE.Vector3(0, 1.75, 0.25);
    this.camHeight = 2.5; this.camDist = 12;
    this.spin = 0;
    this.showDriver = false;
  }
  update(dt, input) {
    const w = this.game.world;
    let thr = 0, steer = 0, lift = 0;
    if (this.occupied && input.enabled) {
      if (input.down('KeyW')) thr += 1;
      if (input.down('KeyS')) thr -= 1;
      if (input.down('KeyA')) steer += 1;
      if (input.down('KeyD')) steer -= 1;
      if (input.down('Space')) lift += 1;
      if (input.down('KeyC') || input.down('ControlLeft')) lift -= 1;
    }
    if (this.fuel <= 0) { thr = Math.min(thr, 0); lift = -0.6; }
    const ground = Math.max(w.getHeight(this.pos.x, this.pos.z), w.waterLevelAt(this.pos.x, this.pos.z));
    const grounded = this.pos.y <= ground + 0.05;
    this.speed = clamp(this.speed + thr * 8 * dt - this.speed * 0.25 * dt, grounded ? -2 : -6, input.down('ShiftLeft') ? 42 : 32);
    if (grounded && !this.occupied) this.speed *= Math.exp(-dt * 4);
    this.heading = wrap(this.heading + steer * dt * 0.9);
    const targetVy = lift * 9 + (this.occupied ? 0 : -6);
    this.vy = lerp(this.vy, targetVy, 1 - Math.exp(-dt * 2));
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt; this.pos.z += fz * this.speed * dt;
    this.pos.y += this.vy * dt;
    const ceil = 620;
    if (this.pos.y > ceil) { this.pos.y = ceil; this.vy = Math.min(0, this.vy); }
    if (this.pos.y < ground) { this.pos.y = ground; this.vy = 0; if (Math.abs(this.speed) > 10) { this.speed *= 0.5; this.game.cam.shake(0.4); } }
    if (!w.inBounds(this.pos.x, this.pos.z)) { this.heading = wrap(this.heading + Math.PI); this.speed *= 0.3; }
    // tree collisions near the ground
    if (this.pos.y - ground < 25) {
      const p = { x: this.pos.x, z: this.pos.z, hit: false };
      this.game.veg.forEachNear(this.pos.x, this.pos.z, 8, (it) => {
        if (!it.alive || it.kind !== 'tree') return;
        if (this.pos.y > it.y + it.height * 0.9) return;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        if (d < 3.5) { p.hit = true; }
      });
      if (p.hit && Math.abs(this.speed) > 4) { this.speed *= -0.3; this.game.cam.shake(0.5); this.pos.y += 1; }
    }
    this.pitch = lerp(this.pitch, thr * 0.12 + this.speed * 0.004, 1 - Math.exp(-dt * 3));
    this.roll = lerp(this.roll, -steer * Math.min(0.35, Math.abs(this.speed) * 0.015), 1 - Math.exp(-dt * 3));
    const on = this.occupied || !grounded;
    this.spin += dt * (on ? 18 + Math.abs(this.speed) * 0.3 : 0);
    this.rotor.rotation.y = this.spin;
    this.prop.rotation.z = this.spin * 2;
    if (this.occupied) this.fuel = Math.max(0, this.fuel - dt * (0.18 + Math.abs(this.speed) * 0.008));
    this.sync();
    return clamp(0.4 + Math.abs(this.speed) / 40 + Math.abs(lift) * 0.2, 0, 1);
  }
}

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = { jeep: new Jeep(game), boat: new Boat(game), gyro: new Gyro(game) };
    this.current = null;
    this.engine = null;
  }

  nearest(maxD = 5) {
    const P = this.game.player.pos;
    let best = null, bd = maxD;
    for (const v of Object.values(this.list)) {
      if (!v.deployed) continue;
      const d = Math.hypot(v.pos.x - P.x, v.pos.z - P.z);
      if (d < bd && Math.abs(v.pos.y - P.y) < 5) { bd = d; best = v; }
    }
    return best;
  }

  owned() { return Object.keys(this.list).filter((k) => this.game.inventory.gear.has(k)); }

  summon(type) {
    const g = this.game;
    const v = this.list[type];
    const P = g.player.pos;
    const w = g.world;
    if (!g.inventory.gear.has(type)) { g.ui.notify('You have not built that vehicle yet.', 'warn'); return false; }
    if (g.caves.active) { g.ui.notify('Not underground.', 'warn'); return false; }
    if (this.current) { g.ui.notify('Exit your current vehicle first.', 'warn'); return false; }
    if (type === 'boat') {
      for (let r = 4; r < 60; r += 2) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2 + g.cam.yaw;
          const x = P.x + Math.sin(ang) * r, z = P.z + Math.cos(ang) * r;
          if (w.waterLevelAt(x, z) - w.getHeight(x, z) > 1.4 && w.waterLevelAt(x + 3, z) - w.getHeight(x + 3, z) > 1.2) {
            v.place(x, z, ang); g.ui.notify('🚤 Boat ready at the water’s edge. Press F to board.', 'good');
            return true;
          }
        }
      }
      g.ui.notify('No deep enough water nearby to launch the boat.', 'warn');
      return false;
    }
    // land vehicles: find flat ground nearby
    for (let r = 4; r < 30; r += 2) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + g.cam.yaw;
        const x = P.x + Math.sin(ang) * r, z = P.z + Math.cos(ang) * r;
        if (w.getNormal(x, z).y > 0.9 && w.waterLevelAt(x, z) < w.getHeight(x, z) - 0.2) {
          let clear = true;
          g.veg.forEachNear(x, z, 4, (it) => { if (it.alive && it.radius > 0.3 && Math.hypot(it.x - x, it.z - z) < 3.5) clear = false; });
          if (!clear) continue;
          v.place(x, z, g.cam.yaw);
          v.refuel();
          g.ui.notify(`${type === 'jeep' ? '🚙 Jeep' : '🚁 Gyrocopter'} delivered. Press F to get in.`, 'good');
          return true;
        }
      }
    }
    g.ui.notify('No clear, flat ground nearby.', 'warn');
    return false;
  }

  enter(v) {
    const g = this.game;
    if (v.type !== 'boat') v.refuel();
    if (v.type !== 'boat' && v.fuel <= 0) { g.ui.notify('Out of biofuel! Craft fuel at a forge.', 'warn'); }
    this.current = v;
    v.occupied = true;
    g.player.inVehicle = v;
    g.player.boat = v.type === 'boat';
    g.player.crouch = false;
    g.player.gliding = false;
    this.engine = g.audio.engine(v.type);
    g.audio.play('engineStart');
    g.emit('vehicle-enter', { type: v.type });
    g.cam.yaw = v.heading;
  }

  exit() {
    const g = this.game;
    const v = this.current;
    if (!v) return;
    v.occupied = false;
    this.current = null;
    g.player.inVehicle = null;
    g.player.boat = false;
    if (this.engine) { this.engine.stop(); this.engine = null; }
    const w = g.world;
    // find a spot to step out
    const side = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
    let px = v.pos.x + side.x * 2.2, pz = v.pos.z + side.z * 2.2;
    if (v.type === 'boat') {
      // step onto nearest land if close, else into the water
      for (let r = 2; r < 12; r += 1) for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const x = v.pos.x + Math.sin(ang) * r, z = v.pos.z + Math.cos(ang) * r;
        if (w.getHeight(x, z) > w.waterLevelAt(x, z)) { px = x; pz = z; r = 99; break; }
      }
    }
    const P = g.player.pos;
    P.set(px, Math.max(w.getHeight(px, pz), v.type === 'gyro' ? v.pos.y : -999) + 0.2, pz);
    if (v.type === 'boat' && w.getHeight(px, pz) < w.waterLevelAt(px, pz)) P.y = w.waterLevelAt(px, pz) - 1.4;
    g.player.vel.set(0, 0, 0);
    g.player.onGround = false;
    g.player.fallStartY = P.y;
    g.player.yaw = v.heading;
  }

  update(dt, input) {
    const g = this.game;
    for (const v of Object.values(this.list)) {
      if (!v.deployed) continue;
      const rpm = v.update(dt, input);
      if (v === this.current) {
        g.player.vehicleSpeed = Math.abs(v.speed);
        v.seatPosition(g.player.pos);
        g.player.pos.y -= 1.0;
        g.player.yaw = v.heading;
        if (this.engine) this.engine.set(rpm, Math.abs(v.speed) / 20);
        g.player.avatar.root.position.copy(g.player.pos);
        g.player.avatar.root.rotation.set(v.pitch, v.heading, v.roll, 'YXZ');
        g.player.avatar.update(dt, { speed: 0, onGround: true, drive: true });
        if (g.cam.mode === 'first') { /* camera reads seat */ }
        g.progress.stats.distance += Math.abs(v.speed) * dt;
      }
    }
  }

  serialize() {
    const o = {};
    for (const [k, v] of Object.entries(this.list)) if (v.deployed) o[k] = { x: v.pos.x, z: v.pos.z, y: v.pos.y, h: v.heading, f: v.fuel };
    return o;
  }
  deserialize(o) {
    for (const [k, s] of Object.entries(o || {})) {
      const v = this.list[k];
      if (!v) continue;
      v.place(s.x, s.z, s.h);
      if (k === 'gyro') v.pos.y = Math.max(v.pos.y, s.y);
      v.fuel = s.f ?? 100;
      v.sync();
    }
  }
}
