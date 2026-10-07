// Third-person explorer model with procedural animation.
import * as THREE from 'three';

function capsule(r, len, mat, seg = 8) {
  const g = new THREE.CapsuleGeometry(r, len, 4, seg);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export class Avatar {
  constructor() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x4d4a3a, roughness: 0.9 });
    const boots = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 });
    const hatM = new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.85 });
    const pack = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.9 });
    this.mats = { shirt, pants, pack };
    const root = (this.root = new THREE.Group());
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 0.95;
    root.add(hips);
    const torso = (this.torso = new THREE.Group());
    hips.add(torso);
    const chest = capsule(0.2, 0.42, shirt);
    chest.position.y = 0.32; chest.scale.set(1.1, 1, 0.75);
    torso.add(chest);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.2), pack);
    bag.position.set(0, 0.36, -0.2); bag.castShadow = true;
    torso.add(bag);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.38, 8), new THREE.MeshStandardMaterial({ color: 0x3f5a3a }));
    roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.62, -0.2);
    torso.add(roll);
    const neck = (this.neck = new THREE.Group());
    neck.position.y = 0.68;
    torso.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), skin);
    head.position.y = 0.12; head.scale.set(0.95, 1.1, 1); head.castShadow = true;
    neck.add(head);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 20), hatM);
    brim.position.y = 0.22; brim.castShadow = true;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.13, 16), hatM);
    crown.position.y = 0.29; crown.castShadow = true;
    neck.add(brim, crown);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0 }));
    this.lamp.position.set(0, 0.2, 0.13);
    neck.add(this.lamp);
    const mkLimb = (parent, x, y, r, l1, l2, mat1, mat2, foot) => {
      const up = new THREE.Group();
      up.position.set(x, y, 0);
      parent.add(up);
      const a = capsule(r, l1, mat1); a.position.y = -l1 / 2 - r * 0.5; up.add(a);
      const lo = new THREE.Group(); lo.position.y = -l1 - r; up.add(lo);
      const b = capsule(r * 0.85, l2, mat2); b.position.y = -l2 / 2 - r * 0.4; lo.add(b);
      if (foot) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.26), boots);
        f.position.set(0, -l2 - r * 0.6, 0.06); f.castShadow = true; lo.add(f);
      } else {
        const hnd = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 8, 6), skin);
        hnd.position.y = -l2 - r; lo.add(hnd);
      }
      return { up, lo };
    };
    this.legL = mkLimb(hips, -0.11, 0, 0.085, 0.36, 0.36, pants, pants, true);
    this.legR = mkLimb(hips, 0.11, 0, 0.085, 0.36, 0.36, pants, pants, true);
    this.armL = mkLimb(torso, -0.27, 0.58, 0.06, 0.24, 0.24, shirt, skin, false);
    this.armR = mkLimb(torso, 0.27, 0.58, 0.06, 0.24, 0.24, shirt, skin, false);
    // glider wing (hidden until used)
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 1.2, -3.2, -0.2, -0.6, 3.2, -0.2, -0.6, 0, 0.15, -0.3], 3));
    wingGeo.setIndex([0, 1, 3, 0, 3, 2]);
    wingGeo.computeVertexNormals();
    this.glider = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0xc8452a, side: THREE.DoubleSide, roughness: 0.6 }));
    this.glider.position.y = 2.4;
    this.glider.castShadow = true;
    this.glider.visible = false;
    root.add(this.glider);
    this.t = 0;
    this.phase = 0;
  }

  // st: { speed, onGround, crouch, swim, climb, glide, vy, drive, action }
  update(dt, st) {
    this.t += dt;
    const sp = st.speed;
    this.phase += dt * (sp * 1.9 + (st.swim ? 3 : 0) + (st.climb ? 4 : 0));
    const p = this.phase;
    const amp = Math.min(1, sp / 4) * (st.onGround ? 1 : 0.3);
    const L = this.legL, R = this.legR, AL = this.armL, AR = this.armR;
    let hipsY = 0.95, torsoX = 0, hipsX = 0;
    let lu = Math.sin(p) * 0.7 * amp, ru = -Math.sin(p) * 0.7 * amp;
    let ll = Math.max(0, -Math.cos(p)) * 1.1 * amp, rl = Math.max(0, Math.cos(p)) * 1.1 * amp;
    let alu = -Math.sin(p) * 0.6 * amp, aru = Math.sin(p) * 0.6 * amp, all = -0.3 * amp - 0.1, arl = -0.3 * amp - 0.1;
    let alz = 0.08, arz = -0.08;
    if (st.crouch) { hipsY = 0.62; lu -= 0.9; ru -= 0.9; ll += 1.5; rl += 1.5; torsoX = 0.35; }
    if (!st.onGround && !st.swim && !st.climb && !st.glide && !st.drive) { lu = -0.4; ru = 0.3; ll = 0.6; rl = 0.3; alu = -0.6; aru = -0.6; }
    if (st.swim) {
      hipsX = 1.25; hipsY = 0.95;
      lu = Math.sin(p * 1.5) * 0.4; ru = -lu; ll = 0.2; rl = 0.2;
      alu = -2.6 + Math.sin(p) * 1.2; aru = -2.6 + Math.sin(p + Math.PI) * 1.2; all = -0.4; arl = -0.4;
      alz = 0.3; arz = -0.3;
    }
    if (st.climb) {
      torsoX = -0.15;
      lu = -0.6 + Math.sin(p) * 0.6; ru = -0.6 - Math.sin(p) * 0.6; ll = 1.0; rl = 1.0;
      alu = -2.6 + Math.sin(p) * 0.5; aru = -2.6 - Math.sin(p) * 0.5; all = -0.5; arl = -0.5;
    }
    if (st.glide) {
      hipsX = 1.2; lu = 0.1; ru = 0.1; ll = 0.2; rl = 0.2; alu = -3.0; aru = -3.0; all = 0; arl = 0; alz = 0.25; arz = -0.25;
    }
    if (st.drive) { hipsY = 0.55; lu = -1.4; ru = -1.4; ll = 1.4; rl = 1.4; alu = -1.1; aru = -1.1; all = -0.4; arl = -0.4; }
    if (st.action) { aru = -1.6 + Math.sin(this.t * 14) * 0.6; arl = -0.4; }
    if (st.camera) { alu = -1.4; aru = -1.4; all = -1.2; arl = -1.2; alz = -0.25; arz = 0.25; }
    const k = 1 - Math.exp(-dt * 14);
    const lerpR = (o, x, y = 0, z = 0) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };
    lerpR(L.up, -lu); lerpR(R.up, -ru); lerpR(L.lo, ll); lerpR(R.lo, rl);
    lerpR(AL.up, alu, 0, alz); lerpR(AR.up, aru, 0, arz); lerpR(AL.lo, all); lerpR(AR.lo, arl);
    this.hips.position.y += (hipsY + (st.onGround ? Math.abs(Math.sin(p)) * 0.05 * amp : 0) - this.hips.position.y) * k;
    lerpR(this.hips, hipsX);
    lerpR(this.torso, torsoX + amp * 0.08, Math.sin(p) * 0.1 * amp);
    this.glider.visible = !!st.glide;
  }
}
