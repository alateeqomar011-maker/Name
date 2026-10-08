// Third-person explorer model with procedural animation and facial expressions.
// Sculpted from lathe/tapered primitives: shaped torso and limbs, a modelled face (eyes with
// lids that blink, brows, nose, lips), hair styles, hats, layered clothing, leather gear and a
// loaded backpack. Fabric gets a woven bump texture; skin a soft sheen.
// Every rescued explorer is built from the same rig with their own look (see EXPLORER_LOOKS).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const mergeClose = (g) => mergeVertices(g, 1e-5);

let _weave = null, _grain = null;
function weaveTexture() {
  if (_weave) return _weave;
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
  t.repeat.set(10, 10);
  return (_weave = t);
}

function grainTexture() {
  if (_grain) return _grain;
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
  return (_grain = t);
}

const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
function mesh(geo, mat) { return shadowed(new THREE.Mesh(geo, mat)); }
// small facial features don't need to cast shadows (they'd only add acne)
function feature(geo, mat) { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m; }
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
function fball(r, mat, sx = 1, sy = 1, sz = 1, seg = 10) {
  const m = feature(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), mat);
  m.scale.set(sx, sy, sz);
  return m;
}

// The player's own look: the bearded field explorer in the slouch hat.
export const PLAYER_LOOK = {
  female: false, skin: 0xc08a68, hair: 0x3a2a1e, hairStyle: 'short', facial: 'shortbeard', eyes: 0x5a3a22,
  hat: 'explorer', hatColor: 0xa48a5c, shirt: 0x8c7b55, jacket: 0x6b5a3c, pants: 0x4a4636, pack: 'pack',
  feather: true, scarf: null,
};

// The six lost expedition members, each recognisable at a glance.
export const EXPLORER_LOOKS = {
  'exp-maya': { // paleobotanist: curls in a bun, round glasses, plant satchel
    female: true, skin: 0x6e452e, hair: 0x1c1410, hairStyle: 'bun', facial: 'none', eyes: 0x2a180c, glasses: true,
    hat: 'none', shirt: 0x5d7a4a, jacket: 0x7a6a48, vest: 0x8a7a50, pants: 0x5a4e3a, pack: 'satchel',
  },
  'exp-luis': { // guide: wide hat, moustache, red bandana, splinted ankle
    female: false, skin: 0xa8734f, hair: 0x15100c, hairStyle: 'short', facial: 'mustache', eyes: 0x2c1a0e,
    hat: 'wide', hatColor: 0x6a4a2a, shirt: 0xd6c8a8, jacket: 0x5a4632, pants: 0x3e3a30, pack: 'pack', scarf: 0xa8302a, bandage: true,
  },
  'exp-anna': { // photographer: blonde ponytail, cap, camera on her chest
    female: true, skin: 0xe2b49a, hair: 0xd8b46a, hairStyle: 'ponytail', facial: 'none', eyes: 0x4a7aa0,
    hat: 'cap', hatColor: 0x2e4a6a, shirt: 0x6a8aaa, jacket: 0x9a8a6a, pants: 0x4a4a46, pack: 'pack', camera: true,
  },
  'exp-kenji': { // geologist: hard hat, glasses, hi-vis vest, rock hammer
    female: false, skin: 0xd9a984, hair: 0x101012, hairStyle: 'short', facial: 'none', eyes: 0x1e140c, glasses: true,
    hat: 'hardhat', hatColor: 0xe8b52a, shirt: 0x5a5a62, jacket: 0x46464c, vest: 0xe86a1a, hivis: true, pants: 0x34363a, pack: 'pack', hammer: true,
  },
  'exp-sara': { // ornithologist: headscarf, binoculars, teal field shirt
    female: true, skin: 0xb88a66, hair: 0x2a1a12, hairStyle: 'wrap', wrapColor: 0x3a5a5a, facial: 'none', eyes: 0x3a2412,
    hat: 'none', shirt: 0x3f7a78, jacket: 0x6a5e4a, pants: 0x4a463a, pack: 'pack', binoculars: true,
  },
  'exp-tom': { // radio technician: ginger beard, beanie, headset, radio pack with antenna
    female: false, skin: 0xe8b8a0, hair: 0xa8521e, hairStyle: 'short', facial: 'beard', eyes: 0x4a6a3a, freckles: true,
    hat: 'beanie', hatColor: 0x3a4a3a, shirt: 0x7a6a5a, jacket: 0x55585a, pants: 0x3a3a3a, pack: 'radio', headset: true,
  },
};

export class Avatar {
  constructor(lookIn = {}) {
    const look = { ...PLAYER_LOOK, ...lookIn };
    this.look = look;
    const F = look.female;
    const weave = weaveTexture();
    const grain = grainTexture();
    const skinC = new THREE.Color(look.skin);
    const skin = new THREE.MeshPhysicalMaterial({ color: skinC, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x9a4a3a) });
    const lipC = skinC.clone().lerp(new THREE.Color(0x8a3a34), F ? 0.42 : 0.3).multiplyScalar(0.9);
    const lips = new THREE.MeshPhysicalMaterial({ color: lipC, roughness: 0.4, sheen: 0.5, sheenColor: new THREE.Color(0xa05050) });
    const mouthIn = new THREE.MeshStandardMaterial({ color: 0x2a0e0c, roughness: 0.6 });
    const stubble = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair).lerp(skinC, 0.4).lerp(new THREE.Color(0x6a4a30), 0.25), roughness: 0.95, bumpMap: grain, bumpScale: 2.0 });
    const hair = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.75, bumpMap: grain, bumpScale: 2.2 });
    const shirt = new THREE.MeshStandardMaterial({ color: look.shirt, roughness: 0.92, bumpMap: weave, bumpScale: 0.55 });
    const jacket = new THREE.MeshStandardMaterial({ color: look.jacket, roughness: 0.88, bumpMap: weave, bumpScale: 0.7 });
    const pants = new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.93, bumpMap: weave, bumpScale: 0.65 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.55, bumpMap: grain, bumpScale: 0.8 });
    const darkLeather = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.5, bumpMap: grain, bumpScale: 0.8 });
    const hatM = new THREE.MeshStandardMaterial({ color: look.hatColor || 0xa48a5c, roughness: 0.9, bumpMap: grain, bumpScale: 1.2, side: THREE.DoubleSide });
    const band = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 });
    const pack = new THREE.MeshStandardMaterial({ color: 0x5b4a2e, roughness: 0.9, bumpMap: weave, bumpScale: 2 });
    const canvasG = new THREE.MeshStandardMaterial({ color: 0x46583a, roughness: 0.9, bumpMap: weave, bumpScale: 2 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 0.35, metalness: 0.85 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.35, metalness: 0.9 });
    const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.45, metalness: 0.2 });
    const button = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.4 });
    const scleraM = new THREE.MeshPhysicalMaterial({ color: 0xece4da, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
    const irisM = new THREE.MeshPhysicalMaterial({ color: look.eyes, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
    const pupilM = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 });
    this.mats = { shirt, pants, pack, jacket, skin, hair };

    const root = (this.root = new THREE.Group());
    const body = new THREE.Group(); // overall build (height) without touching root placement
    body.scale.setScalar(F ? 0.955 : 1);
    root.add(body);
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 0.95;
    body.add(hips);

    // ---- Pelvis & belt ----
    const pelvis = lathe([[0.0, -0.14], [0.11, -0.13], [0.155, -0.08], [0.165, 0.0], [0.158, 0.08], [0.0, 0.1]], pants);
    pelvis.scale.set(F ? 1.16 : 1.08, 1, F ? 0.82 : 0.78);
    hips.add(pelvis);
    const belt = mesh(new THREE.TorusGeometry(0.163, 0.022, 6, 28), leather);
    belt.rotation.x = Math.PI / 2; belt.scale.set(F ? 1.14 : 1.08, 0.78, 1.4); belt.position.y = 0.05;
    hips.add(belt);
    const buckle = mesh(new THREE.BoxGeometry(0.05, 0.04, 0.012), brass);
    buckle.position.set(0, 0.05, 0.128);
    hips.add(buckle);
    for (const sx of [-1, 1]) {
      const pouch = mesh(new RoundedBoxGeometry(0.07, 0.08, 0.04, 2, 0.012), leather);
      pouch.position.set(sx * 0.12, 0.0, 0.1); pouch.rotation.y = sx * 0.5;
      hips.add(pouch);
      const flap = feature(new RoundedBoxGeometry(0.072, 0.03, 0.044, 2, 0.01), darkLeather);
      flap.position.set(sx * 0.12, 0.03, 0.1); flap.rotation.y = sx * 0.5;
      hips.add(flap);
    }
    const canteen = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 18), metal);
    canteen.rotation.z = Math.PI / 2; canteen.position.set(-0.19, -0.02, -0.02);
    const canteenCover = mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.03, 18, 1, true), canvasG);
    canteenCover.rotation.z = Math.PI / 2; canteenCover.position.copy(canteen.position);
    hips.add(canteen, canteenCover);
    const knife = mesh(new RoundedBoxGeometry(0.03, 0.16, 0.025, 2, 0.008), darkLeather);
    knife.position.set(0.19, -0.06, -0.03); knife.rotation.z = 0.15;
    hips.add(knife);
    if (look.hammer) {
      // geologist's rock hammer hanging from the belt
      const h = new THREE.Group();
      h.position.set(0.2, -0.04, 0.04); h.rotation.z = -0.12;
      const handle = mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.26, 8), leather);
      handle.position.y = -0.1;
      const head = mesh(new RoundedBoxGeometry(0.11, 0.025, 0.025, 2, 0.006), metal);
      head.position.y = 0.03;
      h.add(handle, head);
      hips.add(h);
    }

    // ---- Torso ----
    const torso = (this.torso = new THREE.Group());
    torso.position.y = 0.03;
    hips.add(torso);
    const cw = F ? 0.93 : 1; // chest width
    const chestPts = F
      ? [[0.14, -0.02], [0.13, 0.08], [0.128, 0.18], [0.15, 0.3], [0.172, 0.38], [0.17, 0.46], [0.15, 0.53], [0.1, 0.59], [0.05, 0.61], [0.0, 0.615]]
      : [[0.15, -0.02], [0.148, 0.08], [0.155, 0.2], [0.178, 0.34], [0.19, 0.44], [0.185, 0.5], [0.16, 0.56], [0.1, 0.605], [0.055, 0.625], [0.0, 0.63]];
    const chest = lathe(chestPts, shirt);
    chest.scale.set(1.1 * cw, 1, F ? 0.76 : 0.72);
    torso.add(chest);
    // shirt placket with buttons, visible in the opening of the jacket
    const placket = feature(new RoundedBoxGeometry(0.03, 0.4, 0.012, 2, 0.005), shirt);
    placket.position.set(0, 0.32, F ? 0.124 : 0.128); placket.rotation.x = -0.06;
    torso.add(placket);
    for (let i = 0; i < 4; i++) {
      const b = feature(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 8), button);
      b.rotation.x = Math.PI / 2; b.position.set(0, 0.17 + i * 0.1, (F ? 0.131 : 0.135) - i * 0.004);
      torso.add(b);
    }
    // open field jacket over the shirt: two front panels and back, with flared hem
    const jkPts = F
      ? [[0.17, -0.1], [0.152, 0.0], [0.14, 0.12], [0.156, 0.26], [0.18, 0.37], [0.18, 0.46], [0.162, 0.52], [0.11, 0.585]]
      : [[0.168, -0.1], [0.162, 0.0], [0.16, 0.12], [0.168, 0.22], [0.188, 0.34], [0.2, 0.44], [0.194, 0.51], [0.168, 0.565], [0.11, 0.61]];
    jacket.side = THREE.DoubleSide;
    const jk = mesh(new THREE.LatheGeometry(jkPts.map(([r, y]) => new THREE.Vector2(r, y)), 22, 0.34, Math.PI * 2 - 0.68), jacket);
    jk.scale.set(1.1 * cw, 1, 0.74);
    torso.add(jk);
    if (look.vest) {
      // field / hi-vis vest over the jacket, with reflective bands on the hi-vis one
      const vm = new THREE.MeshStandardMaterial({ color: look.vest, roughness: 0.8, bumpMap: weave, bumpScale: 1.2, side: THREE.DoubleSide });
      const vPts = jkPts.slice(1, -1).map(([r, y]) => [r + 0.012, y]);
      const vest = mesh(new THREE.LatheGeometry(vPts.map(([r, y]) => new THREE.Vector2(r, y)), 22, 0.45, Math.PI * 2 - 0.9), vm);
      vest.scale.set(1.1 * cw, 1, 0.76);
      torso.add(vest);
      if (look.hivis) {
        const refl = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.25, metalness: 0.5, emissive: 0x222222 });
        for (const y of [0.16, 0.3]) {
          const s = mesh(new THREE.TorusGeometry(0.182, 0.008, 4, 28, Math.PI * 2 - 0.95), refl);
          s.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.47); s.scale.set(1.1 * cw, 0.78, 1); s.position.y = y;
          torso.add(s);
        }
      } else {
        for (const sx of [-1, 1]) for (const y of [0.18, 0.3]) {
          const p = feature(new RoundedBoxGeometry(0.06, 0.06, 0.025, 2, 0.008), vm);
          p.position.set(sx * 0.11, y, 0.13); p.rotation.y = sx * 0.3;
          torso.add(p);
        }
      }
    }
    const collarG = new THREE.Group();
    collarG.position.set(0, F ? 0.575 : 0.595, -0.005);
    collarG.rotation.y = Math.PI * 1.25;
    const collar = mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 18, Math.PI * 1.5), jacket);
    collar.rotation.x = Math.PI / 2 - 0.3;
    collar.scale.set(1.15, 1, 1);
    collarG.add(collar);
    torso.add(collarG);
    for (const sx of [-1, 1]) {
      const pocket = mesh(new RoundedBoxGeometry(0.08, 0.075, 0.02, 2, 0.008), jacket);
      pocket.position.set(sx * 0.1 * cw, 0.4, F ? 0.118 : 0.125); pocket.rotation.set(-0.12, sx * 0.25, 0);
      torso.add(pocket);
      const pflap = feature(new RoundedBoxGeometry(0.084, 0.024, 0.024, 2, 0.006), jacket);
      pflap.position.set(sx * 0.1 * cw, 0.43, F ? 0.121 : 0.128); pflap.rotation.set(-0.12, sx * 0.25, 0);
      torso.add(pflap);
      const pbtn = feature(new THREE.CylinderGeometry(0.005, 0.005, 0.004, 8), button);
      pbtn.rotation.x = Math.PI / 2 - 0.12; pbtn.position.set(sx * 0.1 * cw, 0.425, F ? 0.135 : 0.142);
      torso.add(pbtn);
      // epaulettes on the shoulders
      const ep = feature(new RoundedBoxGeometry(0.05, 0.012, 0.1, 2, 0.005), jacket);
      ep.position.set(sx * (F ? 0.15 : 0.165), F ? 0.535 : 0.555, 0); ep.rotation.z = -sx * 0.35;
      torso.add(ep);
      if (look.pack !== 'satchel') {
        // shoulder straps of the pack
        const strap = mesh(new THREE.TorusGeometry(0.16, 0.012, 4, 16, Math.PI * 0.95), darkLeather);
        strap.scale.set(0.85, 0.75, 1.0);
        strap.rotation.set(0, Math.PI / 2, 0);
        strap.position.set(sx * 0.105 * cw, 0.47, -0.01);
        torso.add(strap);
      }
    }

    // ---- Back: pack, radio or satchel ----
    if (look.pack === 'pack' || look.pack === 'radio') {
      const bp = new THREE.Group();
      bp.position.set(0, 0.36, -0.17);
      torso.add(bp);
      const bodyP = mesh(new RoundedBoxGeometry(0.34, 0.44, 0.18, 3, 0.05), look.pack === 'radio' ? new THREE.MeshStandardMaterial({ color: 0x3e4636, roughness: 0.7 }) : pack);
      bp.add(bodyP);
      if (look.pack === 'radio') {
        // field radio: dials, a handset cord and a long whip antenna
        const face = mesh(new RoundedBoxGeometry(0.26, 0.2, 0.03, 2, 0.01), black);
        face.position.set(0, 0.06, -0.095);
        bp.add(face);
        for (const dx of [-0.07, 0, 0.07]) {
          const d = feature(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), metal);
          d.rotation.x = Math.PI / 2; d.position.set(dx, 0.08, -0.115);
          bp.add(d);
        }
        const ant = mesh(new THREE.CylinderGeometry(0.003, 0.006, 1.1, 6), metal);
        ant.position.set(0.12, 0.72, 0.02); ant.rotation.z = -0.12;
        bp.add(ant);
        this.antenna = ant;
      } else {
        const flap = mesh(new RoundedBoxGeometry(0.33, 0.14, 0.2, 3, 0.04), pack);
        flap.position.set(0, 0.17, 0.005); flap.rotation.x = -0.08;
        bp.add(flap);
        const front = mesh(new RoundedBoxGeometry(0.22, 0.16, 0.06, 2, 0.02), canvasG);
        front.position.set(0, -0.09, -0.1);
        bp.add(front);
        const pan = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.03, 16), metal);
        pan.rotation.x = Math.PI / 2; pan.position.set(0, -0.1, -0.135);
        bp.add(pan);
      }
      for (const sx of [-1, 1]) {
        const side = mesh(new RoundedBoxGeometry(0.07, 0.2, 0.12, 2, 0.025), canvasG);
        side.position.set(sx * 0.2, -0.08, 0.0);
        bp.add(side);
        const buckleStrap = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.012), darkLeather);
        buckleStrap.position.set(sx * 0.08, 0.06, -0.1);
        bp.add(buckleStrap);
      }
      const roll = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 14), canvasG);
      roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.29, 0.0);
      bp.add(roll);
      for (const sx of [-0.12, 0.12]) {
        const tie = mesh(new THREE.TorusGeometry(0.078, 0.008, 4, 16), darkLeather);
        tie.rotation.y = Math.PI / 2; tie.position.set(sx, 0.29, 0);
        bp.add(tie);
      }
    } else if (look.pack === 'satchel') {
      // botanist's satchel on a cross-body strap, with a plant press poking out
      const strap = mesh(new THREE.TorusGeometry(0.235, 0.011, 4, 30), darkLeather);
      strap.scale.set(0.82, 1, 0.62); strap.rotation.set(0, 0, 0.62); strap.position.set(0, 0.3, 0);
      torso.add(strap);
      const bag = mesh(new RoundedBoxGeometry(0.22, 0.17, 0.08, 2, 0.025), leather);
      bag.position.set(-0.2, 0.0, 0.03); bag.rotation.y = -1.2;
      hips.add(bag);
      const press = mesh(new RoundedBoxGeometry(0.16, 0.14, 0.03, 1, 0.006), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9 }));
      press.position.set(-0.21, 0.09, 0.03); press.rotation.set(0, -1.2, 0.15);
      hips.add(press);
      const leafM = new THREE.MeshStandardMaterial({ color: 0x4a7a2a, roughness: 0.7, side: THREE.DoubleSide });
      for (let i = 0; i < 3; i++) {
        const leaf = feature(new THREE.CircleGeometry(0.03, 6), leafM);
        leaf.scale.set(0.5, 1, 1); leaf.position.set(-0.2 - i * 0.012, 0.17 + i * 0.01, 0.04 + i * 0.012); leaf.rotation.set(0.2, -1.2, 0.4 - i * 0.4);
        hips.add(leaf);
      }
    }

    // ---- Chest gear ----
    if (look.camera) {
      const cam = new THREE.Group();
      cam.position.set(0.0, 0.3, 0.16);
      const cbody = mesh(new RoundedBoxGeometry(0.11, 0.07, 0.05, 2, 0.01), black);
      const lens = mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.06, 16), black);
      lens.rotation.x = Math.PI / 2; lens.position.z = 0.05;
      const glass = feature(new THREE.CircleGeometry(0.022, 16), new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, clearcoat: 1, metalness: 0.3 }));
      glass.position.z = 0.081;
      cam.add(cbody, lens, glass);
      torso.add(cam);
      const strap = mesh(new THREE.TorusGeometry(0.14, 0.008, 4, 20, Math.PI * 1.1), black);
      strap.position.set(0, 0.44, 0.04); strap.rotation.set(-0.3, 0, Math.PI * 1.45);
      torso.add(strap);
    }
    if (look.binoculars) {
      const bn = new THREE.Group();
      bn.position.set(0.0, 0.3, 0.155);
      for (const sx of [-1, 1]) {
        const tube = mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.1, 12), black);
        tube.rotation.x = Math.PI / 2 - 0.2; tube.position.set(sx * 0.03, 0, 0.01);
        bn.add(tube);
      }
      torso.add(bn);
      const strap = mesh(new THREE.TorusGeometry(0.14, 0.007, 4, 20, Math.PI * 1.1), darkLeather);
      strap.position.set(0, 0.44, 0.04); strap.rotation.set(-0.3, 0, Math.PI * 1.45);
      torso.add(strap);
    }

    // ---- Neck & head ----
    const neck = (this.neck = new THREE.Group());
    neck.position.y = F ? 0.59 : 0.61;
    torso.add(neck);
    // neck runs up into the head so no edge shows under the jaw; neck muscles flare into the shoulders
    const neckM = limb(F ? 0.048 : 0.058, F ? 0.056 : 0.068, 0.16, skin);
    neckM.position.y = 0.15;

    neck.add(neckM);
    if (look.scarf) {
      // knotted bandana with its point hanging over the chest
      const sm = new THREE.MeshStandardMaterial({ color: look.scarf, roughness: 0.85, bumpMap: weave, bumpScale: 1.1, side: THREE.DoubleSide });
      const ring = mesh(new THREE.TorusGeometry(0.058, 0.013, 8, 20), sm);
      ring.rotation.x = Math.PI / 2 - 0.25; ring.position.set(0, 0.015, 0.008);
      neck.add(ring);
      const tri = mesh(new THREE.ConeGeometry(0.05, 0.085, 4, 1), sm);
      tri.rotation.set(Math.PI + 0.3, Math.PI / 4, 0); tri.scale.set(1, 1, 0.12); tri.position.set(0, -0.032, 0.062);
      neck.add(tri);
    }
    const head = (this.head = new THREE.Group());
    head.position.y = 0.088;
    neck.add(head);
    this._buildFace(head, look, { skin, lips, mouthIn, stubble, hair, scleraM, irisM, pupilM, metal, black, hatM, band, weave, grain });

    // ---- Limbs ----
    const mkLeg = (x) => {
      const up = new THREE.Group();
      up.position.set(x, -0.025, 0);
      hips.add(up);
      up.add(limb(F ? 0.086 : 0.082, F ? 0.058 : 0.062, 0.42, pants));
      // cargo pocket on the outer thigh
      const cp = feature(new RoundedBoxGeometry(0.03, 0.1, 0.085, 2, 0.01), pants);
      cp.position.set(Math.sign(x) * 0.07, -0.2, 0.005);
      up.add(cp);
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
      for (let i = 0; i < 4; i++) {
        const lace = feature(new THREE.BoxGeometry(0.045, 0.004, 0.006), darkLeather);
        lace.position.set(0, -0.27 - i * 0.035, 0.054); lace.rotation.z = (i % 2 ? 1 : -1) * 0.35;
        lo.add(lace);
      }
      if (look.bandage && x > 0) {
        // the guide's splinted ankle
        const wrap = mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.95, bumpMap: weave, bumpScale: 2 }));
        wrap.position.y = -0.36;
        lo.add(wrap);
        const splint = mesh(new THREE.BoxGeometry(0.014, 0.22, 0.02), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }));
        splint.position.set(0.066, -0.33, 0);
        lo.add(splint);
      }
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
      up.position.set(x, F ? 0.52 : 0.54, 0);
      torso.add(up);
      up.add(ball(F ? 0.062 : 0.07, jacket, 1.05, 1, 1, 12));
      up.add(limb(F ? 0.056 : 0.063, F ? 0.047 : 0.052, F ? 0.29 : 0.3, jacket));
      const lo = new THREE.Group();
      lo.position.y = F ? -0.29 : -0.3;
      up.add(lo);
      // rolled-up sleeve then bare forearm
      const rollS = mesh(new THREE.TorusGeometry(F ? 0.046 : 0.052, 0.018, 6, 14), shirt);
      rollS.rotation.x = Math.PI / 2; rollS.position.y = -0.02;
      lo.add(rollS);
      lo.add(limb(F ? 0.041 : 0.046, F ? 0.03 : 0.034, 0.27, skin));
      const watch = mesh(new THREE.TorusGeometry(F ? 0.032 : 0.036, 0.008, 5, 14), darkLeather);
      watch.rotation.x = Math.PI / 2; watch.position.y = -0.235;
      if (sd < 0) {
        lo.add(watch);
        const face = feature(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 12), brass);
        face.rotation.z = Math.PI / 2; face.position.set(-0.036, -0.235, 0);
        lo.add(face);
      }
      // hand: palm, four jointed fingers and an opposed thumb
      const hand = new THREE.Group();
      hand.position.y = -0.275;
      lo.add(hand);
      const hs = F ? 0.9 : 1;
      const palm = mesh(new RoundedBoxGeometry(0.03 * hs, 0.07 * hs, 0.068 * hs, 2, 0.012), skin);
      palm.position.y = -0.037 * hs;
      hand.add(palm);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const fg = new THREE.Group();
        fg.position.set(0, -0.072 * hs, (0.026 - i * 0.017) * hs);
        const len = [0.04, 0.046, 0.044, 0.034][i] * hs;
        const f1 = feature(new THREE.CapsuleGeometry(0.0072 * hs, len, 3, 6), skin);
        f1.position.y = -len / 2;
        fg.add(f1);
        fg.rotation.x = 0.25;
        hand.add(fg);
        fingers.push(fg);
      }
      const thumb = feature(new THREE.CapsuleGeometry(0.0095 * hs, 0.032 * hs, 3, 6), skin);
      thumb.position.set(-sd * 0.012, -0.045 * hs, 0.04 * hs); thumb.rotation.set(0.7, 0, sd * 0.45);
      hand.add(thumb);
      return { up, lo, hand, fingers };
    };
    const legX = F ? 0.1 : 0.095;
    this.legL = mkLeg(-legX);
    this.legR = mkLeg(legX);
    const armX = F ? 0.19 : 0.205;
    this.armL = mkArm(-armX);
    this.armR = mkArm(armX);

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
    // facial expression state (eased toward the current mood)
    this.face.ex = { smile: 0, brow: 0, frown: 0, open: 0, squint: 0 };
    this._blinkT = 1 + Math.random() * 3;
    this._blink = 0;
  }

  // Face, hair, facial hair, glasses and headgear
  _buildFace(head, look, M) {
    const F = look.female;
    const face = (this.face = {});
    // ---- head: one continuous sculpted surface (cranium, brow, cheekbones, jaw and chin) ----
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const hg = new THREE.SphereGeometry(1, 40, 30);
    const hp = hg.attributes.position;
    const skinLin = new THREE.Color(look.skin);
    const stubC = new THREE.Color(look.hair).lerp(skinLin, 0.3);
    const stubK = look.facial === 'stubble' ? 0.85 : look.facial === 'beard' || look.facial === 'shortbeard' ? 0.95 : look.facial === 'mustache' ? 0.15 : 0;
    const cols = new Float32Array(hp.count * 3);
    // beard line: high by the ears, sweeping down across the cheeks to the moustache
    const beardK = (X, Y, Z) => { const line = -0.02 - 0.3 * Math.max(0, Z) ** 2; return sm(line, line - 0.22, Y) * sm(-0.5, 0.2, Z) * (1 - sm(-0.86, -1.0, Y)); };
    const tmpC = new THREE.Color();
    for (let i = 0; i < hp.count; i++) {
      const X = hp.getX(i), Y = hp.getY(i), Z = hp.getZ(i);
      const front = Math.max(0, Z);
      const low = sm(0.12, -0.85, Y); // 0 above the eyes .. 1 at the chin
      let x = X * (F ? 0.088 : 0.092), y = Y * 0.112, z = Z * 0.102;
      // jaw narrows toward the chin (more for a softer, narrower female jaw)
      x *= 1 - (F ? 0.34 : 0.26) * low * low;
      // chin and lower face come forward and down; mandible angle stays square on men
      y -= (F ? 0.013 : 0.026) * low * front;
      z += (F ? 0.006 : 0.014) * low * front * front;
      // brow ridge and cheekbones
      z += (F ? 0.003 : 0.006) * Math.exp(-(((Y - 0.2) / 0.09) ** 2)) * front ** 3;
      x += Math.sign(X) * 0.006 * Math.exp(-(((Y + 0.05) / 0.2) ** 2)) * Math.max(0, Z - 0.1) * Math.abs(X);
      // eye sockets
      z -= 0.006 * Math.exp(-(((Y - 0.02) / 0.1) ** 2)) * Math.exp(-(((Math.abs(X) - 0.37) / 0.15) ** 2)) * front;
      // fuller occiput, and the base of the skull tucks into the neck
      if (Z < 0) z *= 1.04;
      const bot = sm(-0.75, -1.0, Y) * (1 - front);
      x *= 1 - bot * 0.3; z *= 1 - bot * 0.25;
      hp.setXYZ(i, x, y + 0.105, z);
      const bk = beardK(X, Y, Z) * stubK;
      tmpC.copy(skinLin).lerp(stubC, bk);
      cols[i * 3] = tmpC.r; cols[i * 3 + 1] = tmpC.g; cols[i * 3 + 2] = tmpC.b;
    }
    hg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    hg.computeVertexNormals();
    const headMat = M.skin.clone();
    headMat.color.set(0xffffff);
    headMat.vertexColors = true;
    if (stubK > 0.3) headMat.bumpMap = M.grain, headMat.bumpScale = 0.6;
    const headMesh = mesh(hg, headMat);
    head.add(headMesh);
    // probe meshes for snapping features onto the surface
    const probe = [new THREE.Mesh(hg)];
    if (look.facial === 'beard' || look.facial === 'shortbeard') {
      const shortB = look.facial === 'shortbeard';
      // full beard: the lower face region of the head, pushed out into a thick, slightly shaggy volume
      const bg = hg.toNonIndexed();
      const bpos = bg.attributes.position;
      const keep = [];
      const dir = new THREE.Vector3();
      for (let t = 0; t < bpos.count; t += 3) {
        let mn = 1;
        for (let k = 0; k < 3; k++) {
          dir.set(bpos.getX(t + k), bpos.getY(t + k) - 0.105, bpos.getZ(t + k)).normalize();
          mn = Math.min(mn, beardK(dir.x, dir.y, dir.z));
        }
        if (mn > 0.18) for (let k = 0; k < 3; k++) keep.push(bpos.getX(t + k), bpos.getY(t + k), bpos.getZ(t + k));
      }
      const bgeo = new THREE.BufferGeometry();
      bgeo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
      const merged = mergeClose(bgeo);
      merged.computeVertexNormals();
      const mp = merged.attributes.position, mn2 = merged.attributes.normal;
      for (let i = 0; i < mp.count; i++) {
        dir.set(mp.getX(i), mp.getY(i) - 0.105, mp.getZ(i)).normalize();
        const k = beardK(dir.x, dir.y, dir.z);
        const th = (shortB ? 0.005 : 0.014) * k + (shortB ? 0.002 : 0.006) * Math.max(0, -dir.y) * Math.max(0, dir.z) + Math.sin(i * 12.9898) * (shortB ? 0.0006 : 0.0015);
        mp.setXYZ(i, mp.getX(i) + mn2.getX(i) * th, mp.getY(i) + mn2.getY(i) * th - (shortB ? 0.003 : 0.01) * Math.max(0, -dir.y - 0.5), mp.getZ(i) + mn2.getZ(i) * th);
      }
      merged.computeVertexNormals();
      const beard = mesh(merged, M.hair);
      beard.material = (shortB ? M.stubble : M.hair).clone();
      beard.material.side = THREE.DoubleSide;
      head.add(beard);
      probe.push(new THREE.Mesh(merged, beard.material));
    }
    const ray = new THREE.Raycaster();
    const surfZ = (x, y, fallback = 0.1) => {
      ray.set(new THREE.Vector3(x, y, 0.5), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObjects(probe, false)[0];
      return hit ? hit.point.z : fallback;
    };
    const surfX = (sx, y, z) => {
      ray.set(new THREE.Vector3(sx * 0.5, y, z), new THREE.Vector3(-sx, 0, 0));
      const hit = ray.intersectObject(probe[0], false)[0];
      return hit ? Math.abs(hit.point.x) : 0.09;
    };
    face.surfZ = surfZ;
    if (look.facial !== 'none') {
      const mo = fball(0.022, look.facial === 'stubble' || look.facial === 'shortbeard' ? M.stubble : M.hair, 1.45, 0.4, 0.55, 10);
      mo.position.set(0, 0.06, surfZ(0, 0.06) + 0.004);
      head.add(mo);
    }
    // nose: bridge, rounded tip and nostril wings
    const bridge = feature(new RoundedBoxGeometry(F ? 0.015 : 0.018, 0.042, 0.022, 2, 0.007), M.skin);
    bridge.position.set(0, 0.097, surfZ(0, 0.097) + 0.002); bridge.rotation.x = -0.32;
    head.add(bridge);
    const tip = fball(F ? 0.0115 : 0.0135, M.skin, 1, 0.9, 1, 10);
    tip.position.set(0, 0.078, surfZ(0, 0.078) + (F ? 0.008 : 0.0095));
    head.add(tip);
    for (const sx of [-1, 1]) {
      const wing = fball(0.0085, M.skin, 1, 0.8, 1, 8);
      wing.position.set(sx * 0.0115, 0.073, surfZ(sx * 0.0115, 0.073) + 0.002);
      head.add(wing);
    }
    // eyes: glossy eyeball with iris and pupil, an upper lid that blinks, and a lower lid
    face.lids = [];
    face.brows = [];
    let eyeFront = 0.1;
    for (const sx of [-1, 1]) {
      const eg = new THREE.Group();
      const ez = surfZ(sx * 0.034, 0.104) + 0.0035 - 0.0123;
      eyeFront = ez + 0.0123;
      eg.position.set(sx * 0.034, 0.104, ez);
      head.add(eg);
      const sclera = fball(0.0145, M.scleraM, 1, 0.92, 0.85, 14);
      eg.add(sclera);
      const iris = feature(new THREE.CircleGeometry(0.0074, 18), M.irisM);
      iris.position.z = 0.01245;
      eg.add(iris);
      const pupil = feature(new THREE.CircleGeometry(0.0034, 14), M.pupilM);
      pupil.position.z = 0.0126;
      eg.add(pupil);
      const lidG = new THREE.Group();
      eg.add(lidG);
      const lid = feature(new THREE.SphereGeometry(0.0157, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), M.skin);
      lid.scale.set(1.04, 0.96, 0.9);
      lidG.add(lid);
      lidG.rotation.x = -0.55;
      face.lids.push(lidG);
      const lower = feature(new THREE.SphereGeometry(0.0152, 14, 4, 0, Math.PI * 2, Math.PI * 0.72, Math.PI * 0.28), M.skin);
      lower.scale.set(1.03, 0.95, 0.9);
      eg.add(lower);
      if (F) {
        // lashes: a thin dark rim on the upper lid
        const lash = feature(new THREE.TorusGeometry(0.0128, 0.0014, 3, 14, Math.PI), M.pupilM);
        lash.rotation.set(0.25, 0, 0); lash.position.set(0, 0.002, 0.004);
        lidG.add(lash);
      }
      const brow = feature(new RoundedBoxGeometry(0.032, F ? 0.0045 : 0.0065, 0.008, 2, 0.002), M.hair);
      brow.position.set(sx * 0.034, 0.128, surfZ(sx * 0.034, 0.128) + 0.002);
      brow.rotation.set(-0.2, -sx * 0.2, sx * (F ? -0.12 : -0.06));
      brow.userData.base = { y: brow.position.y, rz: brow.rotation.z, sx };
      head.add(brow);
      face.brows.push(brow);
      const ex = surfX(sx, 0.095, -0.005);
      const ear = ball(0.024, M.skin, 0.45, 1, 0.8, 10);
      ear.position.set(sx * (ex + 0.002), 0.095, -0.005);
      head.add(ear);
      const inner = fball(0.014, M.lips, 0.3, 0.75, 0.6, 8);
      inner.position.set(sx * (ex + 0.007), 0.095, -0.002);
      head.add(inner);
    }
    face.eyeFront = eyeFront;
    if (look.freckles) {
      const fm = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.72), roughness: 0.7 });
      for (let i = 0; i < 16; i++) {
        const sx = i % 2 ? 1 : -1;
        const a = (i * 2.3) % 1;
        const fx = sx * (0.016 + a * 0.034), fy = 0.078 + ((i * 1.7) % 1) * 0.018;
        const fr = feature(new THREE.CircleGeometry(0.0021, 6), fm);
        fr.position.set(fx, fy, surfZ(fx, fy) + 0.0006);
        fr.rotation.y = sx * (0.2 + a * 0.6);
        head.add(fr);
      }
    }
    // mouth: upper and lower lip, corners that lift into a smile, dark interior when it opens
    const mouth = new THREE.Group();
    mouth.position.set(0, 0.046, surfZ(0, 0.046) + 0.0012);
    head.add(mouth);
    const inside = fball(0.011, M.mouthIn, 1.5, 0.5, 0.35, 10);
    inside.position.set(0, -0.002, -0.0045);
    mouth.add(inside);
    const upper = feature(new THREE.CapsuleGeometry(F ? 0.0036 : 0.003, F ? 0.026 : 0.028, 3, 8), M.lips);
    upper.rotation.z = Math.PI / 2; upper.scale.set(1, 0.85, 0.42); upper.position.y = 0.0026;
    mouth.add(upper);
    const lower = feature(new THREE.CapsuleGeometry(F ? 0.0046 : 0.0038, F ? 0.022 : 0.024, 3, 8), M.lips);
    lower.rotation.z = Math.PI / 2; lower.scale.set(1, 0.9, 0.45); lower.position.y = -0.0034;
    mouth.add(lower);
    const corners = [];
    for (const sx of [-1, 1]) {
      const c = fball(0.0028, M.lips, 1, 1, 0.55, 6);
      c.position.set(sx * 0.0175, 0, -0.002);
      mouth.add(c);
      corners.push(c);
    }
    face.mouth = { group: mouth, upper, lower, inside, corners };

    // ---- hair ----
    const H = M.hair;
    const style = look.hairStyle;
    if (style !== 'wrap' && style !== 'bald') {
      // tilted partial sphere: hairline above the brows at the front, down to the nape at the back
      const thetaMax = F ? 1.72 : 1.6;
      const cap = mesh(new THREE.SphereGeometry(0.107, 24, 12, 0, Math.PI * 2, 0, thetaMax), H);
      cap.material.side = THREE.DoubleSide;
      cap.scale.set(F ? 0.96 : 0.95, 1, F ? 1.07 : 1.05);
      cap.position.set(0, 0.11, -0.01);
      cap.rotation.x = (F ? 1.0 : 1.02) - thetaMax;
      head.add(cap);
    }
    if (style === 'bun') {
      const bun = ball(0.05, H, 1, 0.9, 1, 14);
      bun.position.set(0, 0.2, -0.07);
      head.add(bun);
      // a few loose curls
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const c = fball(0.016, H, 1, 1, 1, 8);
        c.position.set(Math.cos(a) * 0.04, 0.205 + Math.sin(a * 2) * 0.01, -0.07 + Math.sin(a) * 0.04);
        head.add(c);
      }
    } else if (style === 'ponytail') {
      const tie = mesh(new THREE.TorusGeometry(0.018, 0.006, 5, 12), new THREE.MeshStandardMaterial({ color: 0x2e4a6a, roughness: 0.6 }));
      tie.position.set(0, 0.15, -0.105); tie.rotation.x = 0.4;
      head.add(tie);
      const tail = mesh(new THREE.ConeGeometry(0.03, 0.2, 10), H);
      tail.position.set(0, 0.06, -0.13); tail.rotation.x = Math.PI + 0.32;
      head.add(tail);
      this.ponytail = tail;
    } else if (style === 'wrap') {
      // headscarf wrapping the hair and draping over the neck and shoulders
      const wm = new THREE.MeshStandardMaterial({ color: look.wrapColor || 0x3a5a5a, roughness: 0.85, bumpMap: M.weave, bumpScale: 1.0 });
      wm.side = THREE.DoubleSide;
      const top = mesh(new THREE.SphereGeometry(0.113, 24, 8, 0, Math.PI * 2, 0, 0.95), wm);
      top.scale.set(0.97, 1.0, 1.06); top.position.set(0, 0.11, -0.01);
      head.add(top);
      // sides and back, open over the face (front is +z = phi pi/2 in three's sphere)
      const sides = mesh(new THREE.SphereGeometry(0.113, 24, 12, Math.PI / 2 + 0.78, Math.PI * 2 - 1.56, 0.9, Math.PI - 1.25), wm);
      sides.scale.set(0.97, 1.0, 1.06); sides.position.set(0, 0.11, -0.01);
      head.add(sides);
      // drape over the neck and shoulders, also open at the front
      const drape = mesh(new THREE.CylinderGeometry(0.095, 0.15, 0.18, 20, 1, true, 0.7, Math.PI * 2 - 1.4), wm);
      drape.position.set(0, -0.035, -0.012);
      head.add(drape);
    }

    // ---- glasses ----
    if (look.glasses) {
      for (const sx of [-1, 1]) {
        const rim = feature(new THREE.TorusGeometry(0.0175, 0.0022, 5, 18), M.black);
        rim.position.set(sx * 0.034, 0.104, face.eyeFront + 0.009);
        head.add(rim);
        const lens = feature(new THREE.CircleGeometry(0.0168, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1 }));
        lens.position.set(sx * 0.034, 0.104, face.eyeFront + 0.009);
        head.add(lens);
        const temple = feature(new THREE.CylinderGeometry(0.0018, 0.0018, 0.1, 5), M.black);
        temple.rotation.x = Math.PI / 2; temple.position.set(sx * 0.056, 0.106, face.eyeFront - 0.042);
        head.add(temple);
      }
      const br = feature(new THREE.CylinderGeometry(0.0018, 0.0018, 0.016, 5), M.black);
      br.rotation.z = Math.PI / 2; br.position.set(0, 0.106, face.eyeFront + 0.011);
      head.add(br);
    }
    if (look.headset) {
      const hb = mesh(new THREE.TorusGeometry(0.108, 0.006, 5, 24, Math.PI), M.black);
      hb.position.set(0, 0.1, -0.005);
      head.add(hb);
      for (const sx of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 14), M.black);
        cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.103, 0.095, -0.005);
        head.add(cup);
      }
      const boom = feature(new THREE.CylinderGeometry(0.0025, 0.0025, 0.09, 5), M.black);
      boom.rotation.set(Math.PI / 2, 0.55, 0); boom.position.set(-0.075, 0.06, 0.06);
      head.add(boom);
    }

    // ---- headgear ----
    const hat = new THREE.Group();
    hat.position.set(0, 0.17, -0.004);
    head.add(hat);
    // headlamp: a small dark housing on the hat band that glows when switched on
    this.lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.016, 12), new THREE.MeshStandardMaterial({ color: 0x3a3a36, emissive: 0xffffaa, emissiveIntensity: 0, roughness: 0.4, metalness: 0.5 }));
    this.lamp.rotation.x = Math.PI / 2;
    this.lamp.visible = !look.npc;
    this.lamp.position.set(0, 0.04, 0.118);
    hat.add(this.lamp);
    if (look.hat === 'explorer' || look.hat === 'wide') {
      // slouch / bush hat: pinched crown, band and a brim that curls up at the edge
      const wide = look.hat === 'wide';
      hat.rotation.x = -0.06;
      const bw = wide ? 1.18 : 1;
      const brim = lathe([[0.0, 0.0], [0.11, 0.004], [0.2 * bw, -0.004], [0.245 * bw, 0.0], [0.262 * bw, 0.018 + (wide ? 0.012 : 0)], [0.258 * bw, 0.024 + (wide ? 0.014 : 0)], [0.235 * bw, 0.008], [0.19, 0.006], [0.0, 0.012]], M.hatM, 32);
      brim.scale.set(1.0, 1, 1.08);
      if (wide) {
        // cattleman curl: brim sides roll up
        const p = brim.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
          if (r > 0.15) p.setY(i, p.getY(i) + Math.pow(Math.abs(x) / 0.3, 2) * 0.05 * (r - 0.15) / 0.16);
        }
        brim.geometry.computeVertexNormals();
      }
      hat.add(brim);
      const crownG = new THREE.LatheGeometry([[0.0, 0.0], [0.118, 0.0], [0.115, 0.05], [0.106, 0.095], [0.085, wide ? 0.13 : 0.118], [0.03, wide ? 0.117 : 0.105], [0.0, wide ? 0.112 : 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
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
      hat.add(mesh(crownG, M.hatM));
      const hband = mesh(new THREE.CylinderGeometry(0.119, 0.12, 0.024, 28, 1, true), M.band);
      hband.position.y = 0.017; hband.scale.set(1, 1, 1.06);
      hat.add(hband);
      if (look.feather) {
        // the explorer's signature: a striped feather tucked in the hat band
        const fm = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7, side: THREE.DoubleSide });
        const vane = feature(new THREE.CircleGeometry(0.03, 10), fm);
        vane.scale.set(0.32, 2.2, 1);
        vane.position.set(0.11, 0.07, -0.05); vane.rotation.set(0.2, 1.25, -0.55);
        hat.add(vane);
        const stripe = feature(new THREE.CircleGeometry(0.03, 10), new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7, side: THREE.DoubleSide }));
        stripe.scale.set(0.2, 0.5, 1);
        stripe.position.set(0.118, 0.1, -0.06); stripe.rotation.copy(vane.rotation);
        hat.add(stripe);
      }
    } else if (look.hat === 'cap') {
      const dome = mesh(new THREE.SphereGeometry(0.11, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hatM);
      dome.scale.set(0.96, 0.62, 1.06); dome.position.set(0, -0.014, -0.01);
      hat.add(dome);
      const bill = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 20, 1, false, -Math.PI * 0.5, Math.PI), M.hatM);
      bill.position.set(0, -0.016, 0.07); bill.rotation.x = 0.12; bill.scale.set(1, 1, 0.75);
      hat.add(bill);
      const btn = fball(0.01, M.hatM);
      btn.position.set(0, 0.04, -0.01);
      hat.add(btn);
      this.lamp.position.set(0, 0.0, 0.11);
    } else if (look.hat === 'hardhat') {
      const shell = mesh(new THREE.SphereGeometry(0.12, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.hatM);
      shell.scale.set(0.98, 0.78, 1.08); shell.position.set(0, -0.022, -0.01);
      hat.add(shell);
      const brim = lathe([[0.0, 0.0], [0.13, 0.0], [0.145, -0.006], [0.14, -0.012], [0.0, -0.006]], M.hatM, 28);
      brim.scale.set(0.98, 1, 1.12); brim.position.y = -0.022;
      hat.add(brim);
      const ridgeH = mesh(new RoundedBoxGeometry(0.03, 0.03, 0.2, 2, 0.01), M.hatM);
      ridgeH.position.set(0, 0.06, -0.01);
      hat.add(ridgeH);
      this.lamp.position.set(0, 0.03, 0.125);
    } else if (look.hat === 'beanie') {
      const knit = new THREE.MeshStandardMaterial({ color: look.hatColor || 0x3a4a3a, roughness: 0.95, bumpMap: M.weave, bumpScale: 3 });
      knit.side = THREE.DoubleSide;
      const dome = mesh(new THREE.SphereGeometry(0.112, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), knit);
      dome.scale.set(0.95, 0.85, 1.05); dome.position.set(0, -0.006, -0.012);
      hat.add(dome);
      const fold = mesh(new THREE.CylinderGeometry(0.108, 0.111, 0.036, 22, 1, true), knit);
      fold.position.y = -0.018; fold.scale.set(0.97, 1, 1.06);
      hat.add(fold);
      this.lamp.position.set(0, -0.02, 0.112);
    } else {
      // no hat: no headlamp
      this.lamp.visible = false;
    }
  }

  // Eases the face toward a mood: neutral | happy | determined | surprised | pain | worried
  _expression(dt, mood) {
    const target = { smile: 0, brow: 0, frown: 0, open: 0, squint: 0 };
    if (mood === 'happy') { target.smile = 1; target.brow = 0.25; }
    else if (mood === 'determined') { target.frown = 0.7; target.squint = 0.45; target.open = 0.35; }
    else if (mood === 'surprised') { target.brow = 1; target.open = 0.8; }
    else if (mood === 'pain') { target.frown = 1; target.squint = 1; target.open = 0.5; target.smile = -0.6; }
    else if (mood === 'worried') { target.brow = 0.6; target.frown = -0.6; target.smile = -0.35; }
    const ex = this.face.ex;
    const k = 1 - Math.exp(-dt * 8);
    for (const key in target) ex[key] += (target[key] - ex[key]) * k;
    // blinking: quick close/open every few seconds (double blinks now and then)
    this._blinkT -= dt;
    if (this._blinkT <= 0) { this._blink = 1; this._blinkT = Math.random() < 0.15 ? 0.25 : 2 + Math.random() * 4; }
    this._blink = Math.max(0, this._blink - dt * 7);
    const closed = Math.max(Math.sin(this._blink * Math.PI), ex.squint * 0.45);
    for (const lid of this.face.lids) lid.rotation.x = -0.55 + closed * 1.7;
    for (const b of this.face.brows) {
      const u = b.userData.base;
      b.position.y = u.y + ex.brow * 0.007 - ex.frown * 0.004;
      // frowning pulls the inner ends down, worry lifts them
      b.rotation.z = u.rz + u.sx * ex.frown * 0.28;
    }
    const m = this.face.mouth;
    m.lower.position.y = -0.0036 - ex.open * 0.008;
    m.inside.scale.set(1.5, 0.5 + ex.open * 1.0, 0.35);
    for (const c of m.corners) c.position.y = ex.smile * 0.005 - ex.open * 0.004;
    m.upper.scale.x = 1 + ex.smile * 0.12;
    m.lower.scale.x = 1 + ex.smile * 0.08 - ex.open * 0.15;
  }

  // st: { speed, onGround, crouch, swim, climb, glide, vy, drive, action, camera, mood }
  update(dt, st) {
    this.t += dt;
    const sp = st.speed;
    const run = Math.max(0, Math.min(1, (sp - 3.2) / 3));
    // cadence follows speed up to a fast sprint; beyond that strides lengthen instead
    const cad = Math.min(sp, 11);
    this.phase += dt * (cad * (1.75 - run * 0.35) + (st.swim ? 3 : 0) + (st.climb ? 4 : 0));
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
    if (st.wave) { aru = -2.7 + Math.sin(this.t * 9) * 0.25; arz = -0.5 + Math.sin(this.t * 9) * 0.35; arl = -0.5; }
    const k = 1 - Math.exp(-dt * 14);
    const lerpR = (o, x, y = 0, z = 0) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };
    lerpR(L.up, -lu, 0, hipsZ * 0.5); lerpR(R.up, -ru, 0, hipsZ * 0.5); lerpR(L.lo, ll); lerpR(R.lo, rl);
    lerpR(L.ank, la); lerpR(R.ank, ra);
    lerpR(AL.up, alu, 0, alz); lerpR(AR.up, aru, 0, arz); lerpR(AL.lo, all); lerpR(AR.lo, arl);
    lerpR(AL.hand, 0.1, 0, 0.1); lerpR(AR.hand, 0.1, 0, -0.1);
    // fingers curl into a loose fist when running or gripping, relax when idle
    const grip = Math.max(run * 0.8, st.climb || st.drive || st.camera ? 1 : 0, st.action ? 0.9 : 0);
    for (const arm of [AL, AR]) for (let i = 0; i < arm.fingers.length; i++) arm.fingers[i].rotation.x += ((0.25 + grip * 1.25 + i * 0.05 * idle) - arm.fingers[i].rotation.x) * k;
    const bob = st.onGround ? (1 - Math.cos(p * 2)) * 0.5 * (0.03 + run * 0.04) * amp : 0;
    this.hips.position.y += (hipsY - bob + breathe * 0.003 * idle - this.hips.position.y) * k;
    lerpR(this.hips, hipsX + run * 0.06, Math.sin(p) * 0.08 * amp, -hipsZ - Math.sin(p) * 0.03 * amp);
    // torso counter-rotates against the hips; leans into a run
    lerpR(this.torso, torsoX + amp * 0.05 + run * 0.14 + breathe * 0.012 * idle, -Math.sin(p) * 0.16 * amp, hipsZ * 1.4);
    // head stays level and looks ahead (or toward a point of interest)
    const look = st.lookYaw || 0;
    lerpR(this.neck, headX - (amp * 0.05 + run * 0.14) * 0.8, Math.sin(p) * 0.06 * amp + look, -hipsZ * 0.6);
    if (this.ponytail) this.ponytail.rotation.z = Math.sin(p) * 0.18 * amp + Math.sin(this.t * 1.3) * 0.03;
    if (this.antenna) this.antenna.rotation.z = -0.12 + Math.sin(this.t * 3 + p) * (0.04 + 0.1 * amp);
    // mood: explicit, or read from what the body is doing
    let mood = st.mood;
    if (!mood) {
      if (st.hurt) mood = 'pain';
      else if (!st.onGround && !st.swim && !st.glide && !st.drive && !st.climb) mood = 'surprised';
      else if (run > 0.6 || st.climb || st.action) mood = 'determined';
      else mood = 'neutral';
    }
    this._expression(dt, mood);
    this.glider.visible = !!st.glide;
  }
}
