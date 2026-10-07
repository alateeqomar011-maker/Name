// Underground cave interiors: procedurally carved tunnels and chambers with crystals, stalactites,
// glowing fungi, lava pools, underground lakes, ore, fossils and a treasure chamber.
import * as THREE from 'three';
import { mulberry32, Simplex, clamp, lerp } from '../core/noise.js';
import { materials } from './props.js';
import { rockGeometry } from './flora.js';

const DEPTH = -700;
const THEMES = {
  crystal: { rock: 0x4a4d58, crystal: 0x66d8ff, glow: 0x3388ff, fog: 0x0a1018, extra: 'crystal' },
  jungle: { rock: 0x4a5040, crystal: 0x9cff66, glow: 0x66ff88, fog: 0x08120a, extra: 'mushroom' },
  canyon: { rock: 0x7a4a34, crystal: 0xffb066, glow: 0xff9944, fog: 0x140a06, extra: 'fossil' },
  lava: { rock: 0x2a2220, crystal: 0xff5522, glow: 0xff4411, fog: 0x1a0804, extra: 'lava' },
  sea: { rock: 0x3a4a50, crystal: 0x66ffee, glow: 0x33ddcc, fog: 0x06121a, extra: 'pool' },
};

export class Caves {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.state = {}; // per-cave persistent: looted nodes, explored
  }

  enter(poi) {
    const g = this.game;
    if (this.active) return;
    if (!poi.discovered) g.pois.discover(poi);
    g.ui.fade(() => {
      this._build(poi);
      g.player.inCave = true;
      g.player.pos.copy(this.spawn);
      g.player.vel.set(0, 0, 0);
      g.cam.yaw = this.spawnYaw;
      g.terrain.setVisible(false);
      g.water.ocean.visible = false;
      for (const r of g.water.rivers) r.visible = false;
      g.grass.mesh.visible = false;
      g.veg.group.visible = false;
      g.dinos.group.visible = false;
      g.pois.group.visible = false;
      if (!g.inventory.gear.has('headlamp')) g.ui.notify('It is pitch black down here. A headlamp (L) would help — craft one at a workbench.', 'warn', 6);
      else { g.player.headlamp = true; }
      g.ui.banner(poi.name.toUpperCase(), 'Underground');
      g.progress.stats.caves = Math.max(g.progress.stats.caves, 0);
      g.emit('cave-entered', { poi });
    });
  }

  exit(instant = false) {
    const g = this.game;
    if (!this.active) return;
    const done = () => {
      const poi = this.active.poi;
      this._dispose();
      g.player.inCave = false;
      const e = poi.entrance;
      const ox = Math.sin(poi.face) * 4, oz = Math.cos(poi.face) * 4;
      if (!instant) g.player.pos.set(e.x + ox, g.world.getHeight(e.x + ox, e.z + oz) + 0.3, e.z + oz);
      g.cam.yaw = poi.face;
      g.terrain.setVisible(true);
      g.water.ocean.visible = true;
      for (const r of g.water.rivers) r.visible = true;
      g.grass.mesh.visible = true;
      g.veg.group.visible = true;
      g.dinos.group.visible = true;
      g.pois.group.visible = true;
      g.emit('cave-exited', { poi });
    };
    if (instant) done(); else g.ui.fade(done);
  }

  _build(poi) {
    const g = this.game;
    const T = THEMES[poi.theme] || THEMES.crystal;
    const rand = mulberry32(poi.id.length * 977 + Math.floor(Math.abs(poi.x)));
    const nz = new Simplex(poi.id.length * 13 + 7);
    const st = this.state[poi.id] || (this.state[poi.id] = { looted: {}, explored: false });
    const group = new THREE.Group();
    g.scene.add(group);
    // Path: random walk of nodes
    const base = new THREE.Vector3(poi.x, DEPTH, poi.z);
    const nodes = [base.clone()];
    let heading = poi.face + Math.PI; // into the hill
    const N = 9;
    for (let i = 1; i < N; i++) {
      heading += (rand() - 0.5) * 1.3;
      const step = 22 + rand() * 18;
      const p = nodes[i - 1].clone().add(new THREE.Vector3(Math.sin(heading) * step, (rand() - 0.55) * 7, Math.cos(heading) * step));
      nodes.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(nodes, false, 'centripetal');
    const radii = nodes.map((_, i) => (i === 0 ? 5.5 : i === N - 1 ? 15 : i % 3 === 0 ? 13 + rand() * 4 : 6 + rand() * 4));
    const S = 260, RAD = 28;
    const samples = curve.getSpacedPoints(S);
    const frames = curve.computeFrenetFrames(S, false);
    const radiusAt = (t) => {
      const f = t * (N - 1);
      const i = Math.min(N - 2, Math.floor(f));
      const k = f - i;
      return lerp(radii[i], radii[i + 1], k * k * (3 - 2 * k));
    };
    const pos = [], idx = [], col = [];
    const info = [];
    const rockC = new THREE.Color(T.rock);
    for (let s = 0; s <= S; s++) {
      const t = s / S;
      const C = samples[s];
      const r = radiusAt(t);
      // horizontal frame: tangent flattened
      const tan = frames.tangents[s].clone(); tan.y *= 0.3; tan.normalize();
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const floorY = C.y - r * 0.55;
      info.push({ c: C, r, floorY, side, tan });
      for (let j = 0; j < RAD; j++) {
        const a = (j / RAD) * Math.PI * 2;
        const n = nz.fbm(s * 0.09 + Math.cos(a) * 1.3, Math.sin(a) * 1.3 + s * 0.03, 4);
        const rr = r * (1 + n * 0.35);
        let x = C.x + side.x * Math.cos(a) * rr * 1.15;
        let z = C.z + side.z * Math.cos(a) * rr * 1.15;
        let y = C.y + Math.sin(a) * rr * 0.85;
        if (y < floorY) y = floorY + nz.noise(x * 0.3, z * 0.3) * 0.25;
        if (s === 0) { y = C.y + (y - C.y) * 0.3; }
        pos.push(x, y, z);
        const shade = 0.75 + n * 0.5 + (y < floorY + 0.4 ? -0.15 : 0);
        col.push(rockC.r * shade, rockC.g * shade, rockC.b * shade);
      }
    }
    for (let s = 0; s < S; s++) for (let j = 0; j < RAD; j++) {
      const a = s * RAD + j, b = s * RAD + ((j + 1) % RAD), c = a + RAD, d = b + RAD;
      idx.push(a, c, b, b, c, d);
    }
    // cap the far end
    const endC = pos.length / 3;
    const E = samples[S];
    pos.push(E.x, E.y, E.z); col.push(rockC.r, rockC.g, rockC.b);
    for (let j = 0; j < RAD; j++) idx.push(endC, S * RAD + j, S * RAD + ((j + 1) % RAD));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const tunnel = new THREE.Mesh(geo, rockMat);
    tunnel.receiveShadow = true;
    group.add(tunnel);
    // entrance light shaft
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    shaft.position.copy(samples[0]).add(new THREE.Vector3(0, 2, 0));
    shaft.rotation.z = 0.3;
    group.add(shaft);

    // Decorations: stalactites / stalagmites
    const coneGeo = new THREE.ConeGeometry(0.4, 3, 6);
    const stal = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: T.rock, roughness: 0.7 }), 260);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < 260; i++) {
      const s = 4 + Math.floor(rand() * (S - 8));
      const I = info[s];
      const up = rand() < 0.6;
      const off = (rand() - 0.5) * I.r * 1.4;
      const x = I.c.x + I.side.x * off, z = I.c.z + I.side.z * off;
      const h = 0.6 + rand() * 2.2;
      const y = up ? I.c.y + I.r * 0.75 * Math.sqrt(1 - (off / (I.r * 1.15)) ** 2) : I.floorY;
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), up ? Math.PI : 0);
      m4.compose(new THREE.Vector3(x, y + (up ? -h * 1.5 * 0.5 : h * 0.5 * 1.5 * 0.5), z), q, sc.set(h * 0.6, h * 0.5, h * 0.6));
      stal.setMatrixAt(k++, m4);
    }
    stal.count = k;
    group.add(stal);

    // Lights & crystals & theme features
    const lights = [];
    const addLight = (p, color, intensity, dist) => lights.push(g.fx.addLight({ pos: p.clone(), color, intensity, dist, priority: 1.5 }));
    const crystalMat = new THREE.MeshStandardMaterial({ color: T.crystal, emissive: T.glow, emissiveIntensity: 1.8, roughness: 0.15, transparent: true, opacity: 0.9 });
    const nodes2 = []; // interactables
    const clusterAt = (s, side, big) => {
      const I = info[s];
      const off = side * I.r * 0.75;
      const p = new THREE.Vector3(I.c.x + I.side.x * off, I.floorY, I.c.z + I.side.z * off);
      const cl = new THREE.Group();
      const n = 5 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        const h = (big ? 1.6 : 0.8) * (0.5 + rand());
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), crystalMat);
        c.scale.set(h * 0.5, h * 1.6, h * 0.5);
        c.position.set((rand() - 0.5) * 1.2, h * 0.5, (rand() - 0.5) * 1.2);
        c.rotation.set((rand() - 0.5) * 0.8, rand() * 3, (rand() - 0.5) * 0.8);
        cl.add(c);
      }
      cl.position.copy(p);
      group.add(cl);
      return { p, mesh: cl };
    };
    // Crystal clusters along the tunnel
    for (let i = 0; i < 7; i++) {
      const s = 20 + Math.floor((i / 7) * (S - 40) + rand() * 15);
      const side = rand() < 0.5 ? -1 : 1;
      const { p, mesh } = clusterAt(s, side, i % 2 === 0);
      const key = 'c' + i;
      if (i % 2 === 0) addLight(p.clone().add(new THREE.Vector3(0, 1.5, 0)), T.glow, 25, 22);
      if (!st.looted[key]) nodes2.push({ key, p, mesh, kind: 'crystal', label: 'Harvest crystals' });
      else mesh.visible = false;
    }
    // Ore nodes
    for (let i = 0; i < 5; i++) {
      const s = 15 + Math.floor(rand() * (S - 30));
      const I = info[s];
      const off = (rand() < 0.5 ? -1 : 1) * I.r * 0.6;
      const p = new THREE.Vector3(I.c.x + I.side.x * off, I.floorY + 0.3, I.c.z + I.side.z * off);
      const m = new THREE.Mesh(rockGeometry(i + 30, 3, 0.8, true), g.flora.oreMat);
      m.scale.setScalar(1.1);
      m.position.copy(p);
      group.add(m);
      const key = 'o' + i;
      if (!st.looted[key]) nodes2.push({ key, p, mesh: m, kind: 'ore', label: 'Mine ore vein' });
      else m.visible = false;
    }
    // Theme specifics
    if (T.extra === 'mushroom') {
      const mm = new THREE.MeshStandardMaterial({ color: 0xbfffa0, emissive: 0x55ff77, emissiveIntensity: 1.6 });
      for (let i = 0; i < 40; i++) {
        const s = 6 + Math.floor(rand() * (S - 12));
        const I = info[s];
        const off = (rand() - 0.5) * I.r * 1.5;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25 + rand() * 0.35, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mm);
        cap.position.set(I.c.x + I.side.x * off, I.floorY + 0.4 + rand() * 0.3, I.c.z + I.side.z * off);
        group.add(cap);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5), mm);
        stem.position.copy(cap.position).add(new THREE.Vector3(0, -0.2, 0));
        group.add(stem);
      }
    }
    let pool = null;
    if (T.extra === 'lava' || T.extra === 'pool' || T.extra === 'crystal') {
      const s = Math.floor(S * 0.62);
      const I = info[s];
      const isLava = T.extra === 'lava';
      const pm = isLava
        ? new THREE.MeshStandardMaterial({ color: 0xff5010, emissive: 0xff3300, emissiveIntensity: 2.2, roughness: 0.6 })
        : new THREE.MeshStandardMaterial({ color: 0x0a3a44, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85, emissive: T.extra === 'pool' ? 0x0a4a50 : 0x001a33, emissiveIntensity: 0.6 });
      const pr = I.r * 0.9;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(pr, 32), pm);
      disc.rotation.x = -Math.PI / 2;
      const ly = I.floorY + (isLava ? 0.25 : 0.4);
      disc.position.set(I.c.x, ly, I.c.z);
      group.add(disc);
      pool = { x: I.c.x, z: I.c.z, r: pr, y: ly, lava: isLava };
      addLight(new THREE.Vector3(I.c.x, ly + 2, I.c.z), isLava ? 0xff5522 : 0x33aaff, isLava ? 50 : 15, 30);
    }
    if (T.extra === 'fossil' || T.extra === 'crystal' || T.extra === 'lava') {
      const s = Math.floor(S * 0.42);
      const I = info[s];
      const off = I.r * 0.8;
      const p = new THREE.Vector3(I.c.x + I.side.x * off, I.floorY, I.c.z + I.side.z * off);
      const bones = new THREE.Group();
      const bm = materials().bone;
      for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.9 - i * 0.05, 0.08, 5, 10, Math.PI), bm); r.position.set(0, 1.0, -1.6 + i * 0.45); r.rotation.y = Math.PI / 2; bones.add(r); }
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), bm); skull.scale.set(0.8, 0.8, 1.7); skull.position.set(0, 1.0, 2.4); bones.add(skull);
      bones.position.copy(p);
      bones.lookAt(I.c.x, I.floorY, I.c.z);
      group.add(bones);
      if (!st.looted.fossil) nodes2.push({ key: 'fossil', p, mesh: null, kind: 'fossil', label: 'Excavate fossil wall' });
    }
    // Treasure chamber at the end
    const endI = info[S - 12];
    const chestP = new THREE.Vector3(endI.c.x, endI.floorY, endI.c.z);
    const chest = new THREE.Group();
    const M = materials();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), M.darkwood); cb.position.y = 0.35; chest.add(cb);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.25, 0.82), M.wood); lid.position.y = 0.82; chest.add(lid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 0.12), M.gold); band.position.set(0, 0.4, 0.4); chest.add(band);
    chest.position.copy(chestP);
    group.add(chest);
    addLight(chestP.clone().add(new THREE.Vector3(0, 3, 0)), T.glow, 30, 25);
    if (!st.looted.chest) nodes2.push({ key: 'chest', p: chestP, mesh: null, kind: 'chest', label: 'Open the ancient chest', lid });
    else lid.rotation.x = -1.2;

    this.active = { poi, group, info, S, lights, nodes: nodes2, pool, theme: T, st, fogColor: new THREE.Color(T.fog) };
    // spawn just inside, facing in
    const I0 = info[3];
    this.spawn = new THREE.Vector3(I0.c.x, I0.floorY, I0.c.z);
    this.spawnYaw = Math.atan2(info[8].c.x - info[3].c.x, info[8].c.z - info[3].c.z);
    this.exitP = new THREE.Vector3(info[1].c.x, info[1].floorY, info[1].c.z);
  }

  _dispose() {
    const A = this.active;
    if (!A) return;
    for (const L of A.lights) this.game.fx.removeLight(L);
    A.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    A.group.removeFromParent();
    this.active = null;
  }

  // nearest tunnel sample by xz distance (searching near the last index for speed)
  _nearest(x, z, y) {
    const A = this.active;
    let best = 0, bd = Infinity;
    const start = Math.max(0, (this._last || 0) - 30), end = Math.min(A.S, (this._last || 0) + 30);
    const scan = (a, b) => {
      for (let s = a; s <= b; s++) {
        const c = A.info[s].c;
        const d = (c.x - x) ** 2 + (c.z - z) ** 2 + ((y !== undefined ? (A.info[s].floorY - y) : 0) ** 2) * 0.5;
        if (d < bd) { bd = d; best = s; }
      }
    };
    scan(start, end);
    if (bd > 400) scan(0, A.S);
    this._last = best;
    return best;
  }

  updatePlayer(dt, input, camYaw, p) {
    const A = this.active;
    const g = this.game;
    let fx = 0, fz = 0;
    if (input.enabled && !p.photoMode) {
      if (input.down('KeyW')) fz += 1;
      if (input.down('KeyS')) fz -= 1;
      if (input.down('KeyA')) fx += 1;
      if (input.down('KeyD')) fx -= 1;
      if (input.hit('KeyC')) p.crouch = !p.crouch;
    }
    const l = Math.hypot(fx, fz) || 1;
    fx /= l; fz /= l;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const dx = fz * sin + fx * cos, dz = fz * cos - fx * sin;
    const sprint = input.down('ShiftLeft') && p.stamina > 5 && !p.crouch;
    const sp = p.crouch ? 2 : sprint ? 6.5 : 4;
    p.sprinting = sprint && (fx || fz);
    if (p.sprinting) p.stamina -= dt * 10;
    else p.stamina = Math.min(p.maxStamina, p.stamina + dt * 12);
    p.vel.x = lerp(p.vel.x, dx * sp, 1 - Math.exp(-dt * 10));
    p.vel.z = lerp(p.vel.z, dz * sp, 1 - Math.exp(-dt * 10));
    p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
    const s = this._nearest(p.pos.x, p.pos.z, p.pos.y);
    const I = A.info[s];
    // clamp laterally to the tunnel floor width
    const ox = p.pos.x - I.c.x, oz = p.pos.z - I.c.z;
    const lat = ox * I.side.x + oz * I.side.z;
    const maxLat = I.r * 0.85;
    if (Math.abs(lat) > maxLat) { const corr = Math.abs(lat) - maxLat; p.pos.x -= I.side.x * Math.sign(lat) * corr; p.pos.z -= I.side.z * Math.sign(lat) * corr; }
    if (s >= A.S - 1) { const t = A.info[A.S - 2]; const ax = p.pos.x - t.c.x, az = p.pos.z - t.c.z; if (ax * t.tan.x + az * t.tan.z > 0) { p.pos.x -= t.tan.x * (ax * t.tan.x + az * t.tan.z); p.pos.z -= t.tan.z * (ax * t.tan.x + az * t.tan.z); } }
    // floor & jump
    const floor = I.floorY;
    if (p.onGround && input.hit('Space') && p.stamina > 4) { p.vel.y = 6; p.onGround = false; p.stamina -= 4; }
    p.vel.y -= 22 * dt;
    p.pos.y += p.vel.y * dt;
    if (p.pos.y <= floor) { p.pos.y = floor; p.vel.y = 0; p.onGround = true; } else if (p.pos.y > floor + 0.3) p.onGround = false;
    p.speed = Math.hypot(p.vel.x, p.vel.z);
    p.swimming = false; p.climbing = false; p.gliding = false;
    if (p.speed > 0.3) p.yaw = Math.atan2(p.vel.x, p.vel.z);
    if (g.cam.mode === 'first') p.yaw = camYaw;
    // footsteps
    p.stepAcc += p.speed * dt;
    if (p.stepAcc > 1.3 && p.onGround) { p.stepAcc = 0; g.audio.play('step', { surface: 'rock', vol: 0.7 }); }
    // lava burns
    if (A.pool && A.pool.lava && Math.hypot(p.pos.x - A.pool.x, p.pos.z - A.pool.z) < A.pool.r && p.pos.y < A.pool.y + 0.5) p.damage(dt * 30, 'Lava');
    // explored when reaching the end
    if (!A.st.explored && s > A.S * 0.85) {
      A.st.explored = true;
      g.progress.addXP(200, 'Cave explored');
      g.progress.stats.caves++;
      g.ui.notify(`${A.poi.name} fully explored!`, 'gold');
      g.emit('cave-explored', { poi: A.poi });
    }
    // fog
    g.scene.fog.color.copy(A.fogColor);
    g.scene.fog.density = 0.035;
  }

  ceilingClamp(x, y, z) {
    const A = this.active;
    const s = this._nearest(x, z);
    const I = A.info[s];
    return y > I.c.y + I.r * 0.7 ? Infinity : I.floorY + 0.3;
  }
  maxBoom() { return 4; }
  waterLevel(pos) {
    const A = this.active;
    if (A && A.pool && !A.pool.lava && Math.hypot(pos.x - A.pool.x, pos.z - A.pool.z) < A.pool.r) return A.pool.y;
    return -Infinity;
  }

  interactables(P) {
    const A = this.active;
    const out = [];
    if (!A) return out;
    const de = P.distanceTo(this.exitP);
    if (de < 6) out.push({ d: de, label: 'Exit cave', act: () => this.exit() });
    for (const n of A.nodes) {
      const d = Math.hypot(n.p.x - P.x, n.p.z - P.z);
      if (d < 3.2 && Math.abs(n.p.y - P.y) < 3) out.push({ d, label: n.label, act: () => this._harvest(n), hold: n.kind === 'ore' || n.kind === 'crystal' || n.kind === 'fossil' ? 1.6 : 0 });
    }
    return out;
  }

  _harvest(n) {
    const g = this.game;
    const A = this.active;
    if (A.st.looted[n.key]) return;
    if ((n.kind === 'ore' || n.kind === 'fossil') && !g.inventory.toolTier('pick')) { g.ui.notify('You need a pickaxe.', 'warn'); return; }
    if (n.kind === 'crystal' && g.inventory.toolTier('pick') < 1) { g.ui.notify('You need a pickaxe to harvest crystals.', 'warn'); return; }
    A.st.looted[n.key] = true;
    A.nodes.splice(A.nodes.indexOf(n), 1);
    const tier = g.inventory.toolTier('pick');
    const gb = 1 + 0.2 * g.progress.skill('gathering');
    if (n.kind === 'crystal') { g.inventory.add('crystal', Math.round((1 + tier) * gb)); g.audio.play('mine'); if (n.mesh) n.mesh.visible = false; g.fx.sparkle(n.p.clone().add(new THREE.Vector3(0, 1, 0)), [0.5, 0.8, 1]); }
    if (n.kind === 'ore') { g.inventory.add('ore', Math.round((2 + tier) * gb)); g.audio.play('mine'); if (n.mesh) n.mesh.visible = false; }
    if (n.kind === 'fossil') { g.inventory.add('fossil', 3); g.inventory.add('amber', 1); g.audio.play('mine'); }
    if (n.kind === 'chest') {
      g.inventory.add('amber', 2); g.inventory.add('crystal', 3); g.inventory.add('artifact', 1); g.inventory.add('metal', 3);
      if (n.lid) n.lid.rotation.x = -1.2;
      g.progress.addXP(150, 'Cave treasure');
      g.audio.play('discover');
      g.emit('cave-treasure', { poi: A.poi });
    }
    g.progress.addXP(8, 'Gathering');
  }

  serialize() { return this.state; }
  deserialize(o) { this.state = o || {}; }
}
