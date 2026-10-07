// First-person held items (view model), swing animation, thrown spears.
import * as THREE from 'three';
import { barkTextures } from '../render/textures.js';
import { ITEMS } from './inventory.js';

function handle(len, r = 0.02) {
  const g = new THREE.CylinderGeometry(r * 0.9, r, len, 7);
  g.translate(0, len / 2, 0);
  return g;
}

export class Tools {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.62);
    this.root.position.set(0.06, -0.04, 0);
    game.camera.add(this.root);
    const bark = barkTextures();
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, map: bark.map, roughness: 0.8 });
    this.stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b675f, roughness: 0.7, flatShading: true });
    this.flintMat = new THREE.MeshStandardMaterial({ color: 0x2c2d33, roughness: 0.35, metalness: 0.1, flatShading: true });
    this.obsMat = new THREE.MeshStandardMaterial({ color: 0x08080c, roughness: 0.1, metalness: 0.3, flatShading: true });
    this.models = {};
    this.current = null;
    this.swing = 0;
    this.swingDur = 0.5;
    this.aim = 0;
    this.projectiles = [];
    this.torchOn = true;
    this.torchLight = game.features.lights.add({ pos: new THREE.Vector3(), color: new THREE.Color(1, 0.6, 0.28), intensity: 0, range: 24, flicker: true, on: false });
  }

  _model(id) {
    if (this.models[id]) return this.models[id];
    const g = new THREE.Group();
    const it = ITEMS[id] || {};
    if (id === 'axe' || id === 'pickaxe') {
      g.add(new THREE.Mesh(handle(0.55), this.woodMat));
      const head = new THREE.Mesh(id === 'axe' ? new THREE.DodecahedronGeometry(0.08, 0).scale(1.6, 1, 0.5) : new THREE.ConeGeometry(0.04, 0.42, 5).rotateZ(Math.PI / 2), this.stoneMat);
      head.position.set(id === 'axe' ? 0.07 : 0, 0.5, 0);
      g.add(head);
      const bind = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 5, 8), new THREE.MeshStandardMaterial({ color: 0x6b5a32, roughness: 1 }));
      bind.position.y = 0.48;
      bind.rotation.x = Math.PI / 2;
      g.add(bind);
    } else if (id === 'spear' || id === 'obsidian_spear') {
      g.add(new THREE.Mesh(handle(1.6, 0.016), this.woodMat));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), id === 'spear' ? this.flintMat : this.obsMat);
      tip.position.y = 1.7;
      g.add(tip);
    } else if (id === 'torch') {
      g.add(new THREE.Mesh(handle(0.5, 0.025), this.woodMat));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.12, 7), new THREE.MeshStandardMaterial({ color: 0x2a1c10, emissive: new THREE.Color(1.0, 0.32, 0.06) }));
      head.position.y = 0.52;
      g.add(head);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.9, 0.2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.position.y = 0.66;
      flame.name = 'flame';
      g.add(flame);
    } else if (id === 'lantern') {
      g.add(new THREE.Mesh(handle(0.25, 0.012), this.woodMat));
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), new THREE.MeshStandardMaterial({ color: 0x6fd8ff, emissive: new THREE.Color(1.2, 3, 5) }));
      c.position.y = 0.33;
      g.add(c);
    } else if (it.food || it.heal || id === 'waterskin') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6).scale(1.3, 1, 1), new THREE.MeshStandardMaterial({ color: id === 'berries' ? 0x5a1030 : id === 'meat_cooked' ? 0x6a3018 : id === 'meat_raw' ? 0xa83a3a : id === 'waterskin' ? 0x7a5a38 : 0xe8e0d0, roughness: 0.6 }));
      m.position.y = 0.05;
      g.add(m);
    } else if (it.build) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.22), new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9 }));
      m.rotation.x = 0.6;
      g.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), this.stoneMat);
      g.add(m);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.models[id] = g;
    return g;
  }

  setItem(id) {
    if (this.currentId === id) return;
    if (this.current) this.root.remove(this.current);
    this.currentId = id;
    this.current = id ? this._model(id) : null;
    if (this.current) this.root.add(this.current);
    this.swing = 0;
    this.equipT = 0;
  }

  startSwing(dur = 0.5) {
    if (this.swing > 0) return false;
    this.swing = dur;
    this.swingDur = dur;
    return true;
  }

  update(dt) {
    const g = this.game;
    const P = g.player;
    const id = this.currentId;
    this.equipT = Math.min(1, (this.equipT || 0) + dt * 4);
    const t = performance.now() * 0.001;
    // light from torch/lantern
    const isLight = id === 'torch' || id === 'lantern';
    this.torchLight.on = isLight && this.torchOn && !P.headUnder;
    if (this.torchLight.on) {
      const cam = g.camera;
      this.torchLight.pos.set(0.35, -0.1, -0.5).applyQuaternion(cam.quaternion).add(cam.position);
      this.torchLight.color.set(id === 'lantern' ? 0x8fd8ff : 0xff9a48);
      this.torchLight.intensity = id === 'lantern' ? 120 : 150;
      this.torchLight.range = id === 'lantern' ? 30 : 24;
      this.torchLight.flicker = id === 'torch';
    }
    if (this.current) {
      const flame = this.current.getObjectByName('flame');
      if (flame) { flame.visible = this.torchOn; flame.scale.set(1 + Math.sin(t * 20) * 0.15, 1 + Math.sin(t * 13) * 0.25, 1); }
      // pose
      const bob = Math.sin(P.bob * 2) * 0.012 * P.bobAmt;
      const sway = Math.cos(P.bob) * 0.012 * P.bobAmt;
      const spear = id === 'spear' || id === 'obsidian_spear';
      this.aim += ((g.input.mouse.right && spear && !g.uiOpen ? 1 : 0) - this.aim) * Math.min(1, dt * 10);
      let px = 0.3, py = -0.32, pz = -0.55, rx = -0.2, ry = 0.2, rz = 0.15;
      if (spear) { px = 0.32; py = -0.45; pz = -0.35; rx = -1.35; ry = 0; rz = 0.05; }
      if (spear && this.aim > 0) { px += (0.25 - px) * this.aim; py += (-0.2 - py) * this.aim; pz += (0.2 - pz) * this.aim; rx += (-1.5 - rx) * this.aim; }
      if (id === 'torch' || id === 'lantern') { px = 0.32; py = -0.4; pz = -0.5; rx = -0.05; rz = 0.05; }
      const it = ITEMS[id] || {};
      if (it.food || it.heal || it.build) { px = 0.24; py = -0.25; pz = -0.42; }
      // swing
      let s = 0;
      if (this.swing > 0) {
        this.swing = Math.max(0, this.swing - dt);
        const k = 1 - this.swing / this.swingDur;
        s = k < 0.35 ? -Math.sin((k / 0.35) * Math.PI * 0.5) * 0.6 : Math.sin(((k - 0.35) / 0.65) * Math.PI) * 1.2 - 0.6 * (1 - (k - 0.35) / 0.65);
      }
      const eq = 1 - this.equipT;
      this.current.position.set(px + sway, py + bob - eq * 0.4 + (P.landDip || 0) * 0.3, pz);
      if (spear) {
        this.current.rotation.set(rx - s * 0.3, ry, rz);
        this.current.position.z += s > 0 ? -s * 0.35 : 0;
      } else this.current.rotation.set(rx - s * 1.3, ry + s * 0.3, rz - s * 0.2);
    }
    // projectiles
    for (const p of this.projectiles) {
      if (p.stuck) continue;
      p.vel.y -= 9.8 * dt;
      const prev = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.vel.clone().normalize());
      const hit = g.creatures.sphereHit(p.mesh.position, 0.2);
      if (hit && hit.creature.alive) {
        const mult = hit.part === 'head' ? 1.8 : 1;
        hit.creature.damage(p.damage * mult, 'player');
        g.onHit && g.onHit(hit.creature, p.damage * mult);
        p.stuck = true;
        p.mesh.visible = false;
        p.dropAt = p.mesh.position.clone();
        p.dropAt.y = g.world.height(p.dropAt.x, p.dropAt.z) + 0.2;
        g.features.pickups.push({ mesh: this._dropMesh(p.item, p.dropAt), pos: p.dropAt, item: p.item, count: 1, label: ITEMS[p.item].name });
        continue;
      }
      const h = g.world.height(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y < h + 0.1) {
        p.stuck = true;
        p.mesh.position.y = h + 0.4;
        g.effects.chips(prev, [0.35, 0.3, 0.25]);
        g.features.pickups.push({ mesh: p.mesh, pos: p.mesh.position.clone(), item: p.item, count: 1, label: ITEMS[p.item].name });
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.stuck);
  }

  _dropMesh(item, pos) {
    const m = this._model(item).clone();
    m.position.copy(pos);
    m.rotation.z = Math.PI / 2;
    this.game.scene.add(m);
    return m;
  }

  throwSpear(id, damage) {
    const g = this.game;
    const cam = g.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const m = this._model(id).clone();
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    m.position.copy(cam.position).addScaledVector(dir, 0.8);
    g.scene.add(m);
    this.projectiles.push({ mesh: m, vel: dir.multiplyScalar(34).add(new THREE.Vector3(0, 1.5, 0)), damage, item: id });
    g.audio && g.audio.throwWhoosh();
  }
}
