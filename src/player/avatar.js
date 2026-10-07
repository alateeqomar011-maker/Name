// Third-person explorer model with procedural animation.
// Sculpted from lathe/tapered primitives: shaped torso and limbs, face, explorer hat, layered clothing,
// leather gear and a loaded backpack. Fabric gets a woven bump texture; skin a soft sheen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

function weaveTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      // twill weave: diagonal over/under threads plus slub noise
      const warp = ((i + j) >> 1) % 4 < 2;
      const th = warp ? 0.5 + 0.5 * Math.sin((i / S) * Math.PI * 32) : 0.5 + 0.5 * Math.sin((j / S) * Math.PI * 32);
      const v = Math.max(0, Math.min(255, 110 + th * 110 + (Math.random() - 0.5) * 40));
      const k = (j * S + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function grainTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (Math.random() - 0.5) * 120;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
function mesh(geo, mat) { return shadowed(new THREE.Mesh(geo, mat)); }
// lathe from [radius, y] pairs
function lathe(pts, mat, seg = 18) {
  return mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
}
// tapered limb segment hanging down from its origin
function limb(rTop, rBot, len, mat, seg = 12) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 4);
  // subtle muscle bulge in the upper third
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / len + 0.5; // 0 bottom .. 1 top
    const bulge = 1 + Math.sin(Math.min(1, Math.max(0, (y - 0.25) / 0.75)) * Math.PI) * 0.08;
    p.setX(i, p.getX(i) * bulge);
    p.setZ(i, p.getZ(i) * bulge);
  }
  g.computeVertexNormals();
  g.translate(0, -len / 2, 0);
  return mesh(g, mat);
}
function ball(r, mat, sx = 1, sy = 1, sz = 1, seg = 14) {
  const m = mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), mat);
  m.scale.set(sx, sy, sz);
  return m;
}

export class Avatar {
  constructor() {
    const weave = weaveTexture();
    const grain = grainTexture();
    const skin = new THREE.MeshPhysicalMaterial({ color: 0xc08a68, roughness: 0.58, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x9a4a3a) });
    const stubble = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95, bumpMap: grain, bumpScale: 1.5 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.85, bumpMap: grain, bumpScale: 2 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x8c7b55, roughness: 0.92, bumpMap: weave, bumpScale: 1.2 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x6b5a3c, roughness: 0.88, bumpMap: weave, bumpScale: 1.6 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x4a4636, roughness: 0.93, bumpMap: weave, bumpScale: 1.4 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.55, bumpMap: grain, bumpScale: 0.8 });
    const darkLeather = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.5, bumpMap: grain, bumpScale: 0.8 });
    const hatM = new THREE.MeshStandardMaterial({ color: 0xa48a5c, roughness: 0.9, bumpMap: grain, bumpScale: 1.2, side: THREE.DoubleSide });
    const band = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 });
    const pack = new THREE.MeshStandardMaterial({ color: 0x5b4a2e, roughness: 0.9, bumpMap: weave, bumpScale: 2 });
    const canvasG = new THREE.MeshStandardMaterial({ color: 0x46583a, roughness: 0.9, bumpMap: weave, bumpScale: 2 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 0.35, metalness: 0.85 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.35, metalness: 0.9 });
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.2 });
    this.mats = { shirt, pants, pack, jacket };

    const root = (this.root = new THREE.Group());
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 0.95;
    root.add(hips);

    // ---- Pelvis & belt ----
    const pelvis = lathe([[0.0, -0.14], [0.11, -0.13], [0.155, -0.08], [0.165, 0.0], [0.158, 0.08], [0.0, 0.1]], pants);
    pelvis.scale.set(1.08, 1, 0.78);
    hips.add(pelvis);
    const belt = mesh(new THREE.TorusGeometry(0.163, 0.022, 6, 28), leather);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1.08, 0.78, 1.4); belt.position.y = 0.05;
    hips.add(belt);
    const buckle = mesh(new THREE.BoxGeometry(0.05, 0.04, 0.012), brass);
    buckle.position.set(0, 0.05, 0.128);
    hips.add(buckle);
    for (const sx of [-1, 1]) {
      const pouch = mesh(new RoundedBoxGeometry(0.07, 0.08, 0.04, 2, 0.012), leather);
      pouch.position.set(sx * 0.12, 0.0, 0.1); pouch.rotation.y = sx * 0.5;
      hips.add(pouch);
    }
    const canteen = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 18), metal);
    canteen.rotation.z = Math.PI / 2; canteen.position.set(-0.19, -0.02, -0.02);
    const canteenCover = mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.03, 18, 1, true), canvasG);
    canteenCover.rotation.z = Math.PI / 2; canteenCover.position.copy(canteen.position);
    hips.add(canteen, canteenCover);
    const knife = mesh(new RoundedBoxGeometry(0.03, 0.16, 0.025, 2, 0.008), darkLeather);
    knife.position.set(0.19, -0.06, -0.03); knife.rotation.z = 0.15;
    hips.add(knife);

    // ---- Torso ----
    const torso = (this.torso = new THREE.Group());
    torso.position.y = 0.03;
    hips.add(torso);
    const chest = lathe([[0.15, -0.02], [0.148, 0.08], [0.155, 0.2], [0.178, 0.34], [0.19, 0.44], [0.185, 0.5], [0.16, 0.56], [0.1, 0.605], [0.055, 0.625], [0.0, 0.63]], shirt);
    chest.scale.set(1.1, 1, 0.72);
    torso.add(chest);
    // open field jacket over the shirt: two front panels and back, with flared hem
    const jkPts = [[0.168, -0.1], [0.162, 0.0], [0.16, 0.12], [0.168, 0.22], [0.188, 0.34], [0.2, 0.44], [0.194, 0.51], [0.168, 0.565], [0.11, 0.61]];
    jacket.side = THREE.DoubleSide;
    const jk = mesh(new THREE.LatheGeometry(jkPts.map(([r, y]) => new THREE.Vector2(r, y)), 22, 0.34, Math.PI * 2 - 0.68), jacket);
    jk.scale.set(1.1, 1, 0.74);
    torso.add(jk);
    const collarG = new THREE.Group();
    collarG.position.set(0, 0.595, -0.005);
    collarG.rotation.y = Math.PI * 1.25;
    const collar = mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 18, Math.PI * 1.5), jacket);
    collar.rotation.x = Math.PI / 2 - 0.3;
    collar.scale.set(1.15, 1, 1);
    collarG.add(collar);
    torso.add(collarG);
    for (const sx of [-1, 1]) {
      const pocket = mesh(new RoundedBoxGeometry(0.08, 0.075, 0.02, 2, 0.008), jacket);
      pocket.position.set(sx * 0.1, 0.4, 0.125); pocket.rotation.set(-0.12, sx * 0.25, 0);
      torso.add(pocket);
      // shoulder straps of the pack
      const strap = mesh(new THREE.TorusGeometry(0.16, 0.012, 4, 16, Math.PI * 0.95), darkLeather);
      strap.scale.set(0.85, 0.75, 1.0);
      strap.rotation.set(0, Math.PI / 2, 0);
      strap.position.set(sx * 0.105, 0.47, -0.01);
      torso.add(strap);
    }

    // ---- Backpack ----
    const bp = new THREE.Group();
    bp.position.set(0, 0.36, -0.17);
    torso.add(bp);
    const body = mesh(new RoundedBoxGeometry(0.34, 0.44, 0.18, 3, 0.05), pack);
    bp.add(body);
    const flap = mesh(new RoundedBoxGeometry(0.33, 0.14, 0.2, 3, 0.04), pack);
    flap.position.set(0, 0.17, 0.005); flap.rotation.x = -0.08;
    bp.add(flap);
    for (const sx of [-1, 1]) {
      const side = mesh(new RoundedBoxGeometry(0.07, 0.2, 0.12, 2, 0.025), canvasG);
      side.position.set(sx * 0.2, -0.08, 0.0);
      bp.add(side);
      const buckleStrap = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.012), darkLeather);
      buckleStrap.position.set(sx * 0.08, 0.06, -0.1);
      bp.add(buckleStrap);
    }
    const front = mesh(new RoundedBoxGeometry(0.22, 0.16, 0.06, 2, 0.02), canvasG);
    front.position.set(0, -0.09, -0.1);
    bp.add(front);
    const roll = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 14), canvasG);
    roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.29, 0.0);
    bp.add(roll);
    for (const sx of [-0.12, 0.12]) {
      const tie = mesh(new THREE.TorusGeometry(0.078, 0.008, 4, 16), darkLeather);
      tie.rotation.y = Math.PI / 2; tie.position.set(sx, 0.29, 0);
      bp.add(tie);
    }
    const pan = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.03, 16), metal);
    pan.rotation.x = Math.PI / 2; pan.position.set(0, -0.1, -0.135);
    bp.add(pan);

    // ---- Neck & head ----
    const neck = (this.neck = new THREE.Group());
    neck.position.y = 0.61;
    torso.add(neck);
    const neckM = limb(0.05, 0.056, 0.1, skin);
    neckM.position.y = 0.09;
    neck.add(neckM);
    const head = (this.head = new THREE.Group());
    head.position.y = 0.1;
    neck.add(head);
    const skull = ball(0.1, skin, 0.92, 1.08, 1.02, 20);
    skull.position.set(0, 0.1, 0.0);
    head.add(skull);
    const jaw = ball(0.082, skin, 0.95, 0.72, 1.05, 16);
    jaw.position.set(0, 0.035, 0.022);
    head.add(jaw);
    const beard = ball(0.086, stubble, 0.97, 0.66, 1.06, 16);
    beard.position.set(0, 0.028, 0.025);
    head.add(beard);
    const nose = mesh(new THREE.ConeGeometry(0.018, 0.05, 8), skin);
    nose.rotation.x = Math.PI / 2 + 0.35; nose.position.set(0, 0.085, 0.103);
    head.add(nose);
    const brow = ball(0.05, skin, 1.6, 0.35, 0.6, 10);
    brow.position.set(0, 0.125, 0.07);
    head.add(brow);
    for (const sx of [-1, 1]) {
      const eye = ball(0.012, eyeM, 1, 1, 1, 8);
      eye.position.set(sx * 0.034, 0.105, 0.088);
      head.add(eye);
      const ear = ball(0.024, skin, 0.45, 1, 0.8, 10);
      ear.position.set(sx * 0.093, 0.095, -0.005);
      head.add(ear);
    }
    const hairCap = ball(0.104, hair, 0.94, 0.9, 1.04, 18);
    hairCap.position.set(0, 0.12, -0.012);
    head.add(hairCap);

    // explorer hat: pinched crown, band and a brim that curls up at the edge
    const hat = new THREE.Group();
    hat.position.set(0, 0.17, -0.004);
    hat.rotation.x = -0.06;
    head.add(hat);
    const brim = lathe([[0.0, 0.0], [0.11, 0.004], [0.2, -0.004], [0.245, 0.0], [0.262, 0.018], [0.258, 0.024], [0.235, 0.008], [0.19, 0.006], [0.0, 0.012]], hatM, 32);
    brim.scale.set(1.0, 1, 1.08);
    hat.add(brim);
    const crownG = new THREE.LatheGeometry([[0.0, 0.0], [0.118, 0.0], [0.115, 0.05], [0.106, 0.095], [0.085, 0.118], [0.03, 0.105], [0.0, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
    {
      // centre dent and front pinches
      const p = crownG.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const a = Math.atan2(x, z);
        const pinch = Math.max(0, Math.cos(a)) ** 4 * Math.max(0, y - 0.04) * 0.5;
        const r = Math.hypot(x, z);
        const k = r > 0.001 ? (r - pinch * Math.abs(Math.sin(a * 2))) / r : 1;
        p.setX(i, x * k); p.setZ(i, z * k * 1.06);
        p.setY(i, y - (r < 0.06 && y > 0.09 ? 0.02 * (1 - r / 0.06) : 0));
      }
      crownG.computeVertexNormals();
    }
    hat.add(mesh(crownG, hatM));
    const hband = mesh(new THREE.CylinderGeometry(0.119, 0.12, 0.024, 28, 1, true), band);
    hband.position.y = 0.017; hband.scale.set(1, 1, 1.06);
    hat.add(hband);

    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0 }));
    this.lamp.position.set(0, 0.04, 0.118);
    hat.add(this.lamp);

    // ---- Limbs ----
    const mkLeg = (x) => {
      const up = new THREE.Group();
      up.position.set(x, -0.025, 0);
      hips.add(up);
      up.add(limb(0.082, 0.062, 0.42, pants));
      const lo = new THREE.Group();
      lo.position.y = -0.42;
      up.add(lo);
      lo.add(ball(0.064, pants, 1, 1, 1.05, 10));
      lo.add(limb(0.062, 0.05, 0.25, pants));
      // tall laced boot
      const shaft = limb(0.058, 0.052, 0.18, leather);
      shaft.position.y = -0.24;
      lo.add(shaft);
      const cuff = mesh(new THREE.TorusGeometry(0.058, 0.01, 5, 14), darkLeather);
      cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.245;
      lo.add(cuff);
      const ank = new THREE.Group();
      ank.position.y = -0.42;
      lo.add(ank);
      const foot = mesh(new RoundedBoxGeometry(0.1, 0.075, 0.25, 3, 0.03), leather);
      foot.position.set(0, -0.035, 0.05);
      ank.add(foot);
      const toe = ball(0.052, leather, 1, 0.75, 1.1, 10);
      toe.position.set(0, -0.042, 0.15);
      ank.add(toe);
      const sole = mesh(new RoundedBoxGeometry(0.108, 0.022, 0.29, 2, 0.008), darkLeather);
      sole.position.set(0, -0.075, 0.055);
      ank.add(sole);
      return { up, lo, ank };
    };
    const mkArm = (x) => {
      const sd = Math.sign(x);
      const up = new THREE.Group();
      up.position.set(x, 0.54, 0);
      torso.add(up);
      up.add(ball(0.07, jacket, 1.05, 1, 1, 12));
      up.add(limb(0.063, 0.052, 0.3, jacket));
      const lo = new THREE.Group();
      lo.position.y = -0.3;
      up.add(lo);
      // rolled-up sleeve then bare forearm
      const rollS = mesh(new THREE.TorusGeometry(0.052, 0.018, 6, 14), shirt);
      rollS.rotation.x = Math.PI / 2; rollS.position.y = -0.02;
      lo.add(rollS);
      lo.add(limb(0.046, 0.034, 0.27, skin));
      const watch = mesh(new THREE.TorusGeometry(0.036, 0.008, 5, 14), darkLeather);
      watch.rotation.x = Math.PI / 2; watch.position.y = -0.235;
      if (sd < 0) lo.add(watch);
      const hand = new THREE.Group();
      hand.position.y = -0.275;
      lo.add(hand);
      const palm = mesh(new RoundedBoxGeometry(0.03, 0.075, 0.07, 2, 0.012), skin);
      palm.position.y = -0.04;
      hand.add(palm);
      const fingers = mesh(new RoundedBoxGeometry(0.026, 0.05, 0.062, 2, 0.011), skin);
      fingers.position.set(0, -0.09, 0.008); fingers.rotation.x = 0.35;
      hand.add(fingers);
      const thumb = mesh(new THREE.CapsuleGeometry(0.011, 0.03, 3, 6), skin);
      thumb.position.set(-sd * 0.012, -0.045, 0.04); thumb.rotation.set(0.6, 0, sd * 0.4);
      hand.add(thumb);
      return { up, lo, hand };
    };
    this.legL = mkLeg(-0.095);
    this.legR = mkLeg(0.095);
    this.armL = mkArm(-0.205);
    this.armR = mkArm(0.205);

    // glider wing (hidden until used): fabric canopy with frame spars
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 1.2, -3.2, -0.2, -0.6, 3.2, -0.2, -0.6, 0, 0.15, -0.3], 3));
    wingGeo.setIndex([0, 1, 3, 0, 3, 2]);
    wingGeo.computeVertexNormals();
    this.glider = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0xc8452a, side: THREE.DoubleSide, roughness: 0.6, bumpMap: weave, bumpScale: 1 }));
    this.glider.position.y = 2.4;
    this.glider.castShadow = true;
    this.glider.visible = false;
    for (const [a, b] of [[[0, 0, 1.2], [-3.2, -0.2, -0.6]], [[0, 0, 1.2], [3.2, -0.2, -0.6]], [[0, 0.15, -0.3], [0, 0, 1.2]]]) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const len = A.distanceTo(B);
      const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 6), metal);
      spar.position.copy(A).add(B).multiplyScalar(0.5);
      spar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      this.glider.add(spar);
    }
    root.add(this.glider);
    this.t = 0;
    this.phase = 0;
  }

  // st: { speed, onGround, crouch, swim, climb, glide, vy, drive, action, camera }
  update(dt, st) {
    this.t += dt;
    const sp = st.speed;
    const run = Math.max(0, Math.min(1, (sp - 3.2) / 3));
    this.phase += dt * (sp * (1.75 - run * 0.35) + (st.swim ? 3 : 0) + (st.climb ? 4 : 0));
    const p = this.phase;
    const amp = Math.min(1, sp / 3.2) * (st.onGround ? 1 : 0.3);
    const L = this.legL, R = this.legR, AL = this.armL, AR = this.armR;
    const breathe = Math.sin(this.t * (1.6 + run * 1.8));
    const idle = 1 - Math.min(1, sp / 0.6);
    let hipsY = 0.95, torsoX = 0, hipsX = 0, hipsZ = 0, headX = 0;
    // legs: hip flex, knee bend in swing, ankle roll (heel strike -> toe off)
    const legPose = (ph) => {
      const s = Math.sin(ph), c = Math.cos(ph);
      const thigh = s * (0.55 + run * 0.35) * amp;
      const knee = (Math.max(0, -c) * (0.9 + run * 0.9) + 0.08) * amp + 0.04;
      const ankle = (-s * 0.25 - Math.max(0, -c) * 0.35) * amp;
      return [thigh, knee, ankle];
    };
    let [lu, ll, la] = legPose(p);
    let [ru, rl, ra] = legPose(p + Math.PI);
    // arms counter-swing with relaxed elbows; more bend when running
    let alu = -Math.sin(p) * (0.45 + run * 0.4) * amp, aru = Math.sin(p) * (0.45 + run * 0.4) * amp;
    let all = -(0.18 + run * 1.0) * Math.max(0.3, amp) - 0.12, arl = all;
    let alz = 0.1 - idle * 0.02, arz = -0.1 + idle * 0.02;
    // idle: breathing and slow weight shift
    hipsZ = Math.sin(this.t * 0.6) * 0.025 * idle;
    alu += breathe * 0.015 * idle; aru += breathe * 0.015 * idle;
    if (st.crouch) { hipsY = 0.64; lu -= 0.95; ru -= 0.95; ll += 1.55; rl += 1.55; la += -0.6; ra += -0.6; torsoX = 0.38; headX = -0.3; }
    if (!st.onGround && !st.swim && !st.climb && !st.glide && !st.drive) { lu = -0.45; ru = 0.25; ll = 0.75; rl = 0.35; la = 0.2; ra = 0; alu = -0.7; aru = -0.5; alz = 0.35; arz = -0.35; }
    if (st.swim) {
      hipsX = 1.25; hipsY = 0.95; headX = -0.9;
      lu = Math.sin(p * 1.5) * 0.4; ru = -lu; ll = 0.2; rl = 0.2; la = 0.5; ra = 0.5;
      alu = -2.6 + Math.sin(p) * 1.2; aru = -2.6 + Math.sin(p + Math.PI) * 1.2; all = -0.4; arl = -0.4;
      alz = 0.3; arz = -0.3;
    }
    if (st.climb) {
      torsoX = -0.15; headX = 0.2;
      lu = -0.6 + Math.sin(p) * 0.6; ru = -0.6 - Math.sin(p) * 0.6; ll = 1.0; rl = 1.0; la = -0.3; ra = -0.3;
      alu = -2.6 + Math.sin(p) * 0.5; aru = -2.6 - Math.sin(p) * 0.5; all = -0.5; arl = -0.5;
    }
    if (st.glide) {
      hipsX = 1.2; headX = -1.0; lu = 0.1; ru = 0.1; ll = 0.2; rl = 0.2; la = 0.4; ra = 0.4; alu = -3.0; aru = -3.0; all = 0; arl = 0; alz = 0.25; arz = -0.25;
    }
    if (st.drive) { hipsY = 0.55; lu = -1.4; ru = -1.4; ll = 1.4; rl = 1.4; la = 0; ra = 0; alu = -1.1; aru = -1.1; all = -0.4; arl = -0.4; }
    if (st.action) { aru = -1.6 + Math.sin(this.t * 14) * 0.6; arl = -0.4; }
    if (st.camera) { alu = -1.4; aru = -1.4; all = -1.2; arl = -1.2; alz = -0.25; arz = 0.25; }
    const k = 1 - Math.exp(-dt * 14);
    const lerpR = (o, x, y = 0, z = 0) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };
    lerpR(L.up, -lu, 0, hipsZ * 0.5); lerpR(R.up, -ru, 0, hipsZ * 0.5); lerpR(L.lo, ll); lerpR(R.lo, rl);
    lerpR(L.ank, la); lerpR(R.ank, ra);
    lerpR(AL.up, alu, 0, alz); lerpR(AR.up, aru, 0, arz); lerpR(AL.lo, all); lerpR(AR.lo, arl);
    lerpR(AL.hand, 0.1, 0, 0.1); lerpR(AR.hand, 0.1, 0, -0.1);
    const bob = st.onGround ? (1 - Math.cos(p * 2)) * 0.5 * (0.03 + run * 0.04) * amp : 0;
    this.hips.position.y += (hipsY - bob + breathe * 0.003 * idle - this.hips.position.y) * k;
    lerpR(this.hips, hipsX + run * 0.06, Math.sin(p) * 0.08 * amp, -hipsZ - Math.sin(p) * 0.03 * amp);
    // torso counter-rotates against the hips; leans into a run
    lerpR(this.torso, torsoX + amp * 0.05 + run * 0.14 + breathe * 0.012 * idle, -Math.sin(p) * 0.16 * amp, hipsZ * 1.4);
    // head stays level and looks ahead
    lerpR(this.neck, headX - (amp * 0.05 + run * 0.14) * 0.8, Math.sin(p) * 0.06 * amp, -hipsZ * 0.6);
    this.glider.visible = !!st.glide;
  }
}
