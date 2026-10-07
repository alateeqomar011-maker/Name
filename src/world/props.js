// Procedural prop models: base structures, camp pieces, ruins and landmarks.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

let M = null;
export function materials() {
  if (M) return M;
  const rand = mulberry32(5);
  const planks = canvasTex(256, 256, (ctx, w, h) => {
    for (let y = 0; y < h; y += 32) {
      const v = 95 + rand() * 40;
      ctx.fillStyle = `rgb(${v},${v * 0.72},${v * 0.48})`;
      ctx.fillRect(0, y, w, 32);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(40,25,10,${rand() * 0.25})`; ctx.fillRect(rand() * w, y + rand() * 32, 20 + rand() * 80, 1 + rand()); }
      ctx.fillStyle = 'rgba(20,12,5,0.7)'; ctx.fillRect(0, y, w, 2);
      ctx.fillRect(rand() * w, y, 2, 32);
    }
  });
  const stone = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7d786c'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) {
      const off = (y / 42) % 2 ? 40 : 0;
      for (let x = -off; x < w; x += 80) {
        const v = 100 + rand() * 50;
        ctx.fillStyle = `rgb(${v},${v * 0.96},${v * 0.86})`;
        ctx.fillRect(x + 3, y + 3, 74, 36);
        for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(0,0,0,${rand() * 0.12})`; ctx.fillRect(x + 3 + rand() * 70, y + 3 + rand() * 32, 3, 3); }
        if (rand() < 0.35) { ctx.fillStyle = `rgba(60,90,30,${0.3 + rand() * 0.4})`; ctx.beginPath(); ctx.ellipse(x + 20 + rand() * 40, y + 6, 20 + rand() * 20, 6 + rand() * 8, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  });
  const fabric = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9c8a5c'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 3) { ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(i, 0, 1, h); ctx.fillRect(0, i, w, 1); }
  });
  const glyph = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5c5850'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2a2824'; ctx.lineWidth = 6;
    for (let i = 0; i < 9; i++) {
      const x = 30 + (i % 3) * 80, y = 30 + Math.floor(i / 3) * 80;
      ctx.beginPath();
      if (i % 3 === 0) { ctx.arc(x + 20, y + 20, 18, 0, Math.PI * 2); ctx.moveTo(x + 20, y); ctx.lineTo(x + 20, y + 40); }
      else if (i % 3 === 1) { ctx.moveTo(x, y + 40); ctx.lineTo(x + 20, y); ctx.lineTo(x + 40, y + 40); ctx.moveTo(x + 8, y + 26); ctx.lineTo(x + 32, y + 26); }
      else { ctx.rect(x + 4, y + 4, 32, 32); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + 36, y + 36); }
      ctx.stroke();
    }
  });
  M = {
    wood: new THREE.MeshStandardMaterial({ map: planks, roughness: 0.85 }),
    darkwood: new THREE.MeshStandardMaterial({ map: planks, color: 0x806050, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ map: stone, roughness: 0.92 }),
    ruin: new THREE.MeshStandardMaterial({ map: stone, color: 0xb8b0a0, roughness: 0.95 }),
    glyph: new THREE.MeshStandardMaterial({ map: glyph, roughness: 0.9, emissive: 0x33ffcc, emissiveIntensity: 0, emissiveMap: glyph }),
    fabric: new THREE.MeshStandardMaterial({ map: fabric, roughness: 0.95, side: THREE.DoubleSide }),
    green: new THREE.MeshStandardMaterial({ map: fabric, color: 0x7a9a6a, roughness: 0.95, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.45, metalness: 0.75 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8, metalness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd8cdb0, roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb03a20, roughness: 0.7, side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xffaa44, emissiveIntensity: 2.5 }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x22aaff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }),
    solar: new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.2, metalness: 0.6 }),
    egg: new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x4a7a2a, roughness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a640, roughness: 0.3, metalness: 0.9 }),
  };
  return M;
}

const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const cyl = (r0, r1, h, mat, x, y, z, seg = 10) => mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z);

function log(len, r, mat) {
  const m = cyl(r, r, len, mat, 0, 0, 0, 8);
  m.rotation.z = Math.PI / 2;
  return m;
}

// ---------------- Base structures ----------------
export function buildStructure(type, tier = 1) {
  const m = materials();
  const g = new THREE.Group();
  g.userData.lights = [];
  switch (type) {
    case 'campfire': {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const s = mesh(new THREE.DodecahedronGeometry(0.22), m.stone, Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75); g.add(s); }
      for (let i = 0; i < 4; i++) { const l = log(1.0, 0.08, m.darkwood); l.rotation.y = (i / 4) * Math.PI; l.rotation.z = Math.PI / 2 - 0.5; l.position.y = 0.25; g.add(l); }
      const ember = mesh(new THREE.SphereGeometry(0.25, 8, 6), m.glow, 0, 0.12, 0); g.add(ember);
      g.userData.fire = new THREE.Vector3(0, 0.3, 0);
      g.userData.lights.push({ pos: new THREE.Vector3(0, 1.2, 0), color: 0xff8833, intensity: 40, dist: 22, flicker: true });
      break;
    }
    case 'tent': {
      if (tier === 1) {
        const shape = new THREE.ConeGeometry(2.0, 2.4, 4, 1, true);
        const t = mesh(shape, m.green, 0, 1.2, 0); t.rotation.y = Math.PI / 4; g.add(t);
        g.add(cyl(0.04, 0.04, 2.6, m.wood, 0, 1.3, 0, 6));
        g.add(box(1.4, 0.15, 2.0, m.fabric, 0, 0.1, -0.2));
      } else if (tier === 2) {
        for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) g.add(cyl(0.15, 0.15, 2.6, m.darkwood, i * 1.9, 1.3, j * 1.9, 8));
        g.add(box(4.0, 0.2, 4.0, m.wood, 0, 0.1, 0));
        g.add(box(4.0, 2.2, 0.15, m.wood, 0, 1.3, -1.95));
        g.add(box(0.15, 2.2, 4.0, m.wood, -1.95, 1.3, 0));
        g.add(box(0.15, 2.2, 4.0, m.wood, 1.95, 1.3, 0));
        g.add(box(1.2, 2.2, 0.15, m.wood, -1.4, 1.3, 1.95));
        g.add(box(1.2, 2.2, 0.15, m.wood, 1.4, 1.3, 1.95));
        const roof = mesh(new THREE.ConeGeometry(3.4, 1.8, 4), m.darkwood, 0, 3.3, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
      } else {
        g.add(box(6, 0.4, 5, m.stone, 0, 0.2, 0));
        for (let y = 0; y < 6; y++) {
          for (const z of [-2.3, 2.3]) { const l = log(6.2, 0.22, m.wood); l.position.set(0, 0.6 + y * 0.42, z); g.add(l); }
          for (const x of [-2.9, 2.9]) { const l = log(4.8, 0.22, m.wood); l.rotation.y = Math.PI / 2; l.position.set(x, 0.8 + y * 0.42, 0); g.add(l); }
        }
        const roofL = box(6.8, 0.18, 3.6, m.darkwood, 0, 3.75, -1.25); roofL.rotation.x = 0.55; g.add(roofL);
        const roofR = box(6.8, 0.18, 3.6, m.darkwood, 0, 3.75, 1.25); roofR.rotation.x = -0.55; g.add(roofR);
        g.add(box(0.8, 3.6, 0.8, m.stone, 2.2, 3.4, -1.0));
        g.add(box(1.2, 1.9, 0.12, m.darkwood, 0, 1.4, 2.42));
        const win = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffaa55, emissiveIntensity: 0.8 });
        g.add(box(0.8, 0.7, 0.1, win, -1.8, 1.8, 2.45));
        g.add(box(0.8, 0.7, 0.1, win, 1.8, 1.8, 2.45));
        g.userData.lights.push({ pos: new THREE.Vector3(0, 2, 3.4), color: 0xffaa55, intensity: 15, dist: 14 });
      }
      break;
    }
    case 'workbench': {
      g.add(box(2.2, 0.15, 1.0, m.wood, 0, 0.95, 0));
      for (const x of [-1, 1]) for (const z of [-0.4, 0.4]) g.add(box(0.12, 0.95, 0.12, m.darkwood, x, 0.47, z));
      g.add(box(0.5, 0.3, 0.3, m.metal, -0.6, 1.17, 0));
      g.add(box(0.1, 0.5, 0.1, m.darkwood, 0.6, 1.25, 0.1));
      g.add(box(2.0, 0.08, 0.8, m.wood, 0, 0.35, 0));
      break;
    }
    case 'storage': {
      g.add(box(1.4, 0.9, 0.9, m.wood, 0, 0.45, 0));
      g.add(box(1.45, 0.1, 0.95, m.darkwood, 0, 0.92, 0));
      g.add(box(0.1, 0.9, 0.95, m.metal, -0.5, 0.45, 0));
      g.add(box(0.1, 0.9, 0.95, m.metal, 0.5, 0.45, 0));
      break;
    }
    case 'forge': {
      g.add(cyl(1.0, 1.2, 1.4, m.stone, 0, 0.7, 0, 10));
      g.add(cyl(0.45, 0.6, 1.8, m.stone, 0, 2.2, 0, 8));
      g.add(mesh(new THREE.SphereGeometry(0.4, 8, 6), m.glow, 0, 1.2, 0.75));
      g.add(box(0.8, 0.5, 0.5, m.metal, 1.5, 0.6, 0));
      g.userData.fire = new THREE.Vector3(0, 3.0, 0);
      g.userData.smoke = true;
      g.userData.lights.push({ pos: new THREE.Vector3(0, 1.3, 1.2), color: 0xff6622, intensity: 30, dist: 16, flicker: true });
      break;
    }
    case 'research': {
      g.add(box(3.6, 0.2, 2.6, m.wood, 0, 0.1, 0));
      g.add(box(3.4, 2.4, 0.1, m.wood, 0, 1.3, -1.2));
      const roof = box(3.9, 0.12, 3.0, m.metal, 0, 2.6, 0); roof.rotation.x = 0.1; g.add(roof);
      for (const x of [-1.7, 1.7]) g.add(box(0.12, 2.5, 0.12, m.darkwood, x, 1.25, 1.2));
      g.add(box(2.2, 0.1, 0.8, m.wood, 0, 0.95, -0.6));
      g.add(box(0.5, 0.45, 0.4, m.dark, -0.6, 1.2, -0.7));
      const scr = new THREE.MeshStandardMaterial({ color: 0x44ffaa, emissive: 0x22cc88, emissiveIntensity: 1.5 });
      g.add(box(0.45, 0.3, 0.02, scr, -0.6, 1.25, -0.49));
      g.add(cyl(0.12, 0.12, 0.35, m.crystal, 0.5, 1.15, -0.6, 6));
      g.add(cyl(0.03, 0.03, 2.5, m.metal, 1.5, 3.8, -1.0, 6));
      break;
    }
    case 'farm': {
      g.add(box(3.6, 0.3, 3.6, m.soil, 0, 0.1, 0));
      for (const [x, z, w, d] of [[0, 1.85, 3.8, 0.1], [0, -1.85, 3.8, 0.1], [1.85, 0, 0.1, 3.8], [-1.85, 0, 0.1, 3.8]]) g.add(box(w, 0.35, d, m.wood, x, 0.2, z));
      const crops = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const b = mesh(new THREE.IcosahedronGeometry(0.4, 0), m.leaf, -1.1 + (i % 3) * 1.1, 0.5, -1.1 + Math.floor(i / 3) * 1.1);
        crops.add(b);
        const berry = mesh(new THREE.SphereGeometry(0.1, 6, 4), m.red, b.position.x + 0.2, 0.75, b.position.z); berry.userData.berry = true; crops.add(berry);
      }
      g.add(crops);
      g.userData.crops = crops;
      break;
    }
    case 'tower': {
      const h = tier === 1 ? 8 : 14;
      for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
        const leg = cyl(0.15, 0.2, h, tier === 1 ? m.darkwood : m.metal, x * (1 - 0.15), h / 2, z * (1 - 0.15), 6);
        g.add(leg);
      }
      for (let y = 2; y < h; y += 3) {
        const b1 = box(3.4, 0.1, 0.1, m.wood, 0, y, -1.4); g.add(b1);
        const b2 = box(3.4, 0.1, 0.1, m.wood, 0, y, 1.4); g.add(b2);
      }
      g.add(box(4.2, 0.2, 4.2, m.wood, 0, h, 0));
      for (const [x, z, w, d] of [[0, 2.05, 4.2, 0.1], [0, -2.05, 4.2, 0.1], [2.05, 0, 0.1, 4.2], [-2.05, 0, 0.1, 4.2]]) g.add(box(w, 1.0, d, m.wood, x, h + 0.5, z));
      const roof = mesh(new THREE.ConeGeometry(3.4, 1.6, 4), m.darkwood, 0, h + 3.2, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
      for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) g.add(cyl(0.06, 0.06, 2.4, m.wood, x, h + 1.2, z, 5));
      // ladder
      for (let y = 0.4; y < h; y += 0.4) g.add(box(0.7, 0.06, 0.06, m.wood, 0, y, 2.15));
      g.userData.deck = h;
      break;
    }
    case 'hide': {
      const dome = mesh(new THREE.SphereGeometry(1.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6a7a3a, roughness: 1, side: THREE.DoubleSide }), 0, 0, 0);
      dome.scale.y = 0.8; g.add(dome);
      for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 0.6; const t = mesh(new THREE.ConeGeometry(0.15, 1.0, 4), m.leaf, Math.cos(a) * r, 0.6 + Math.random() * 0.6, Math.sin(a) * r); t.rotation.set(Math.random() - 0.5, 0, Math.random() - 0.5); g.add(t); }
      g.add(box(1.2, 0.3, 0.1, m.black, 0, 0.9, 1.75));
      break;
    }
    case 'fence': {
      if (tier === 1) {
        for (let i = 0; i < 8; i++) { const p = cyl(0.14, 0.14, 2.4 + (i % 2) * 0.3, m.darkwood, -1.75 + i * 0.5, 1.2, 0, 6); g.add(p); g.add(mesh(new THREE.ConeGeometry(0.14, 0.4, 6), m.darkwood, -1.75 + i * 0.5, 2.6 + (i % 2) * 0.3, 0)); }
        g.add(box(4, 0.12, 0.1, m.wood, 0, 0.8, 0.15)); g.add(box(4, 0.12, 0.1, m.wood, 0, 1.8, 0.15));
      } else if (tier === 2) {
        g.add(box(4, 2.6, 0.6, m.stone, 0, 1.3, 0));
        g.add(box(4.1, 0.2, 0.7, m.stone, 0, 2.7, 0));
      } else {
        g.add(box(4, 3.2, 0.7, m.stone, 0, 1.6, 0));
        for (const x of [-1.9, 0, 1.9]) g.add(box(0.3, 3.4, 0.8, m.metal, x, 1.7, 0));
        g.add(box(4, 0.25, 0.8, m.metal, 0, 3.3, 0));
      }
      break;
    }
    case 'spikes': {
      g.add(log(3.4, 0.15, m.darkwood)); g.children[0].position.y = 0.4;
      for (let i = 0; i < 7; i++) {
        const s = mesh(new THREE.ConeGeometry(0.1, 1.8, 6), m.darkwood, -1.5 + i * 0.5, 0.9, 0.3);
        s.rotation.x = 0.7; g.add(s);
        const s2 = s.clone(); s2.position.z = -0.3; s2.rotation.x = -0.7; g.add(s2);
      }
      break;
    }
    case 'torch': {
      g.add(cyl(0.06, 0.08, 2.0, m.darkwood, 0, 1.0, 0, 6));
      g.add(cyl(0.14, 0.1, 0.3, m.rust, 0, 2.05, 0, 8));
      g.add(mesh(new THREE.SphereGeometry(0.12, 6, 4), m.glow, 0, 2.2, 0));
      g.userData.fire = new THREE.Vector3(0, 2.25, 0);
      g.userData.small = true;
      g.userData.lights.push({ pos: new THREE.Vector3(0, 2.4, 0), color: 0xffa040, intensity: 14, dist: 14, flicker: true });
      break;
    }
    case 'garage': {
      g.add(box(8, 0.2, 7, m.stone, 0, 0.1, 0));
      for (const x of [-3.8, 3.8]) for (const z of [-3.3, 0, 3.3]) g.add(box(0.25, 4, 0.25, m.metal, x, 2, z));
      g.add(box(0.15, 3.6, 6.8, m.wood, -3.9, 1.9, 0));
      g.add(box(8, 3.6, 0.15, m.wood, 0, 1.9, -3.4));
      const roof = box(8.6, 0.15, 7.6, m.rust, 0, 4.1, 0); roof.rotation.x = 0.08; g.add(roof);
      g.add(box(1.4, 0.9, 0.7, m.metal, -2.6, 0.55, -2.8));
      g.add(cyl(0.3, 0.3, 0.9, m.red, 2.8, 0.45, -2.8, 10));
      break;
    }
    case 'beacon': {
      g.add(cyl(0.5, 0.7, 0.5, m.stone, 0, 0.25, 0, 8));
      g.add(cyl(0.08, 0.1, 4, m.metal, 0, 2.3, 0, 6));
      g.add(mesh(new THREE.OctahedronGeometry(0.35), m.crystal, 0, 4.5, 0));
      g.userData.spin = g.children[2];
      g.userData.lights.push({ pos: new THREE.Vector3(0, 4.5, 0), color: 0x44ccff, intensity: 18, dist: 18 });
      break;
    }
    case 'flag': {
      g.add(cyl(0.04, 0.05, 3.2, m.wood, 0, 1.6, 0, 6));
      const f = mesh(new THREE.PlaneGeometry(1.2, 0.75, 6, 2), m.red, 0.62, 2.75, 0);
      g.add(f); g.userData.cloth = f;
      break;
    }
    case 'planter': {
      g.add(cyl(0.6, 0.45, 0.6, m.stone, 0, 0.3, 0, 10));
      for (let i = 0; i < 7; i++) { const l = mesh(new THREE.ConeGeometry(0.08, 1.2, 4), m.leaf, 0, 0.9, 0); l.rotation.set(Math.cos(i) * 0.6, 0, Math.sin(i) * 0.6); g.add(l); }
      break;
    }
    case 'lamp': {
      g.add(cyl(0.05, 0.07, 2.4, m.metal, 0, 1.2, 0, 6));
      g.add(mesh(new THREE.OctahedronGeometry(0.22), m.crystal, 0, 2.55, 0));
      g.userData.lights.push({ pos: new THREE.Vector3(0, 2.6, 0), color: 0x99e8ff, intensity: 20, dist: 20 });
      break;
    }
    case 'trophy': {
      g.add(box(2.4, 0.5, 1.2, m.stone, 0, 0.25, 0));
      const skull = mesh(new THREE.SphereGeometry(0.4, 10, 8), m.bone, 0, 0.9, 0); skull.scale.set(0.8, 0.7, 1.4); g.add(skull);
      const jaw = mesh(new THREE.ConeGeometry(0.25, 0.9, 6), m.bone, 0, 0.7, 0.55); jaw.rotation.x = Math.PI / 2; g.add(jaw);
      for (let i = 0; i < 5; i++) { const r = mesh(new THREE.TorusGeometry(0.4 - i * 0.05, 0.04, 4, 10, Math.PI), m.bone, -0.8 + i * 0.12, 0.8, -0.2); r.rotation.y = Math.PI / 2; g.add(r); }
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------- Landmarks ----------------
export function buildLandmark(type, seed = 1) {
  const m = materials();
  const rand = mulberry32(seed);
  const g = new THREE.Group();
  const colliders = [];
  g.userData.lights = [];
  const addC = (x, z, r, top = 100) => colliders.push({ x, z, r, top });
  switch (type) {
    case 'camp': {
      // Base Camp Echo: research tents, radio mast, supply crates, fire
      const fire = buildStructure('campfire'); g.add(fire); g.userData.fire = new THREE.Vector3(0, 0.3, 0);
      g.userData.lights.push(...fire.userData.lights);
      const t1 = buildStructure('tent', 1); t1.position.set(-6, 0, -3); t1.rotation.y = 0.5; g.add(t1); addC(-6, -3, 2);
      const t2 = buildStructure('tent', 1); t2.position.set(-5, 0, 4); t2.rotation.y = -0.4; g.add(t2); addC(-5, 4, 2);
      const hut = buildStructure('research'); hut.position.set(6, 0, -5); hut.rotation.y = -0.6; g.add(hut); addC(6, -5, 2.2);
      const bench = buildStructure('workbench'); bench.position.set(5, 0, 3); bench.rotation.y = -1.2; g.add(bench); addC(5, 3, 1.2);
      for (let i = 0; i < 4; i++) { const c = buildStructure('storage'); c.position.set(1 + i * 0.3, i === 3 ? 0.9 : 0, 7 + (i % 3) * 1.0); c.rotation.y = rand(); g.add(c); }
      addC(1.5, 8, 1.6);
      // radio mast
      for (let y = 0; y < 14; y += 1.5) {
        g.add(box(0.05, 1.5, 0.05, m.metal, -0.4, y + 0.75, -10)); g.add(box(0.05, 1.5, 0.05, m.metal, 0.4, y + 0.75, -10)); g.add(box(0.8, 0.05, 0.05, m.metal, 0, y, -10));
      }
      const blink = mesh(new THREE.SphereGeometry(0.15, 6, 4), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 3 }), 0, 14.3, -10);
      g.add(blink); g.userData.blink = blink;
      addC(0, -10, 0.8);
      const flag = buildStructure('flag'); flag.position.set(2, 0, -2); g.add(flag); g.userData.cloth = flag.userData.cloth;
      // signpost
      g.add(cyl(0.08, 0.08, 2.2, m.wood, -2, 1.1, 8, 6));
      g.add(box(1.4, 0.35, 0.06, m.wood, -1.6, 1.9, 8));
      break;
    }
    case 'outpost': {
      g.add(box(6, 0.3, 5, m.stone, 0, 0.15, 0));
      g.add(box(5, 3, 4, m.rust, 0, 1.8, 0)); addC(0, 0, 3.4);
      const roof = box(5.6, 0.15, 4.6, m.metal, 0, 3.35, 0); roof.rotation.z = 0.06; g.add(roof);
      g.add(box(1.0, 2.0, 0.1, m.dark, 1.2, 1.3, 2.02));
      g.add(box(1.2, 0.8, 0.1, m.dark, -1.2, 2.0, 2.02));
      for (let y = 0; y < 18; y += 2) { g.add(box(0.06, 2, 0.06, m.metal, 4.5, y + 1, 0)); }
      g.add(cyl(0.6, 0.6, 0.1, m.metal, 4.5, 18.5, 0, 12));
      addC(4.5, 0, 0.6);
      const panel = box(2.5, 0.08, 1.6, m.solar, -4.2, 1.6, 0); panel.rotation.z = 0.5; g.add(panel);
      g.add(box(0.1, 1.4, 0.1, m.metal, -4.2, 0.7, 0));
      const lightM = new THREE.MeshStandardMaterial({ color: 0x334433, emissive: 0x33ff66, emissiveIntensity: 0 });
      const lamp = box(0.3, 0.3, 0.3, lightM, 0, 3.6, 2.0); g.add(lamp); g.userData.lamp = lightM;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const f = cyl(0.06, 0.06, 1.8, m.rust, Math.cos(a) * 9, 0.9, Math.sin(a) * 9, 5); g.add(f); }
      for (let i = 0; i < 3; i++) { const c = buildStructure('storage'); c.position.set(-2 + i * 1.6, 0, -3.5); c.rotation.y = rand() * 0.4; g.add(c); }
      break;
    }
    case 'peak': {
      for (let i = 0; i < 14; i++) {
        const r = 0.9 - i * 0.05;
        g.add(mesh(new THREE.DodecahedronGeometry(Math.max(0.2, r * 0.6)), m.stone, (rand() - 0.5) * 1.6 * r, i * 0.22, (rand() - 0.5) * 1.6 * r));
      }
      const f = buildStructure('flag'); f.position.y = 2.5; g.add(f); g.userData.cloth = f.userData.cloth;
      addC(0, 0, 1.0, 3);
      break;
    }
    case 'cave': {
      // rocky arch around a dark opening; faces +z
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95, flatShading: true });
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * (i / 15);
        const r = 5.5 + rand() * 1.5;
        const s = 1.6 + rand() * 1.6;
        const rock = mesh(new THREE.DodecahedronGeometry(s, 1), rockMat, Math.cos(a) * r, Math.sin(a) * r * 0.95 - 0.5, (rand() - 0.5) * 2);
        rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        g.add(rock);
      }
      for (let i = 0; i < 10; i++) {
        const rock = mesh(new THREE.DodecahedronGeometry(3 + rand() * 3, 1), rockMat, (rand() - 0.5) * 16, 3 + rand() * 4, -4 - rand() * 4);
        g.add(rock);
      }
      const hole = mesh(new THREE.CircleGeometry(5.2, 24, 0, Math.PI), m.black, 0, -0.4, -0.5);
      g.add(hole);
      const back = mesh(new THREE.SphereGeometry(5.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.black, 0, -0.4, -1.2);
      back.scale.z = 0.6; back.rotation.x = -Math.PI / 2; back.material = m.black;
      g.add(back);
      // warning sign
      g.add(cyl(0.07, 0.07, 1.8, m.wood, 5, 0.9, 4, 6));
      g.add(box(1.0, 0.6, 0.06, m.wood, 5, 1.7, 4));
      for (const x of [-6.5, -4.5, 4.5, 6.5]) addC(x, 0, 1.8, 12);
      addC(0, -4, 5, 12);
      break;
    }
    case 'temple': {
      // stepped pyramid with stairs and glyph shrine
      for (let i = 0; i < 6; i++) {
        const s = 20 - i * 3.2;
        const b = box(s, 2.2, s, m.ruin, 0, 1.1 + i * 2.2, 0); b.rotation.y = (rand() - 0.5) * 0.02; g.add(b);
      }
      for (let i = 0; i < 12; i++) g.add(box(4, 1.1, 1.1, m.stone, 0, 0.55 + i * 1.1, 10 + 0.55 - i * 0.96));
      const shrine = box(3, 3, 3, m.glyph, 0, 14.7, 0); g.add(shrine); g.userData.glyph = m.glyph;
      for (const [x, z] of [[-1.3, 1.3], [1.3, 1.3]]) g.add(cyl(0.3, 0.35, 3.6, m.ruin, x, 15, z, 8));
      for (let i = 0; i < 8; i++) { const r = box(1 + rand(), 0.8 + rand(), 1 + rand(), m.ruin, (rand() - 0.5) * 30, 0.3, (rand() - 0.5) * 30); r.rotation.set(rand() * 0.5, rand() * 3, rand() * 0.5); g.add(r); }
      addC(0, 0, 10.5, 13);
      g.userData.top = 14;
      break;
    }
    case 'circle': {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (rand() < 0.15) { const f = box(1.2, 0.9, 3.6, m.ruin, Math.cos(a) * 11, 0.45, Math.sin(a) * 11); f.rotation.y = a; g.add(f); continue; }
        const st = box(1.4, 4 + rand() * 1.5, 1.0, m.ruin, Math.cos(a) * 11, 2.2, Math.sin(a) * 11);
        st.rotation.y = -a; st.rotation.z = (rand() - 0.5) * 0.1; g.add(st);
        addC(Math.cos(a) * 11, Math.sin(a) * 11, 1.0, 5);
        if (i % 2 === 0) { const l = box(4.6, 0.8, 1.0, m.ruin, Math.cos(a + Math.PI / n) * 11.3, 5.3, Math.sin(a + Math.PI / n) * 11.3); l.rotation.y = -a - Math.PI / 2 - Math.PI / n; g.add(l); }
      }
      const altar = box(2.4, 1.0, 1.6, m.glyph, 0, 0.5, 0); g.add(altar); g.userData.glyph = m.glyph; addC(0, 0, 1.5, 1.2);
      break;
    }
    case 'pillars': {
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2, r = 4 + rand() * 14;
        const h = 2 + rand() * 6;
        const p = cyl(0.6, 0.7, h, m.ruin, Math.cos(a) * r, h / 2 - 1.5, Math.sin(a) * r, 10);
        p.rotation.z = (rand() - 0.5) * 0.4; p.rotation.x = (rand() - 0.5) * 0.4; g.add(p);
        addC(Math.cos(a) * r, Math.sin(a) * r, 0.75, h - 1.5);
      }
      const gate = new THREE.Group();
      gate.add(box(1.2, 7, 1.2, m.ruin, -3, 2.5, 0)); gate.add(box(1.2, 7, 1.2, m.ruin, 3, 2.5, 0)); gate.add(box(8, 1.2, 1.4, m.glyph, 0, 6.4, 0));
      g.add(gate); g.userData.glyph = m.glyph;
      addC(-3, 0, 0.9, 6); addC(3, 0, 0.9, 6);
      break;
    }
    case 'shrine': {
      g.add(box(10, 0.6, 8, m.ruin, 0, 0.3, 0));
      for (const x of [-4, -1.4, 1.4, 4]) { g.add(cyl(0.45, 0.5, 5, m.ruin, x, 3.1, 3.2, 10)); addC(x, 3.2, 0.5, 6); }
      g.add(box(10.4, 0.8, 2, m.ruin, 0, 6, 3.2));
      g.add(box(9, 4, 0.8, m.ruin, 0, 2.6, -3.4)); addC(0, -3.4, 4.5, 5);
      g.add(box(2, 2.6, 0.3, m.glyph, 0, 2.2, -2.9)); g.userData.glyph = m.glyph;
      g.add(mesh(new THREE.SphereGeometry(0.6, 12, 8), m.gold, 0, 1.6, 0));
      break;
    }
    case 'obelisk': {
      g.add(box(5, 1, 5, m.ruin, 0, 0.5, 0));
      const ob = mesh(new THREE.CylinderGeometry(0.7, 1.4, 16, 4), m.glyph, 0, 9, 0); ob.rotation.y = Math.PI / 4; g.add(ob);
      { const tip = mesh(new THREE.ConeGeometry(0.98, 1.6, 4), m.gold, 0, 17.8, 0); tip.rotation.y = Math.PI / 4; g.add(tip); }
      g.userData.glyph = m.glyph;
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; g.add(box(1, 2, 1, m.ruin, Math.cos(a) * 6, 1, Math.sin(a) * 6)); addC(Math.cos(a) * 6, Math.sin(a) * 6, 0.8, 2); }
      addC(0, 0, 2.6, 17);
      break;
    }
    case 'ziggurat': {
      for (let i = 0; i < 8; i++) {
        const s = 32 - i * 3.8;
        g.add(box(s, 3, s, m.ruin, 0, 1.5 + i * 3, 0));
      }
      for (let i = 0; i < 20; i++) g.add(box(5, 1.2, 1.4, m.stone, 0, 0.6 + i * 1.2, 16 + 0.7 - i * 1.0));
      const crown = mesh(new THREE.OctahedronGeometry(2.2), m.crystal, 0, 28, 0); g.add(crown); g.userData.spin = crown;
      g.add(box(6, 3, 6, m.glyph, 0, 25.5, 0)); g.userData.glyph = m.glyph;
      g.userData.lights.push({ pos: new THREE.Vector3(0, 28, 0), color: 0x44ffee, intensity: 60, dist: 60 });
      addC(0, 0, 16, 24);
      g.userData.top = 24;
      break;
    }
    case 'treasure': {
      const chest = new THREE.Group();
      chest.add(box(0.9, 0.5, 0.6, m.darkwood, 0, 0.25, 0));
      const lid = box(0.92, 0.18, 0.62, m.wood, 0, 0.6, 0); chest.add(lid);
      chest.add(box(0.95, 0.08, 0.1, m.gold, 0, 0.3, 0.3));
      chest.add(box(0.12, 0.12, 0.05, m.gold, 0, 0.45, 0.32));
      chest.rotation.set(0.15, rand() * 3, 0.1);
      chest.position.y = -0.1;
      g.add(chest);
      g.userData.lid = lid;
      break;
    }
    case 'explorer': {
      const fire = buildStructure('campfire'); fire.scale.setScalar(0.7); g.add(fire);
      g.userData.lights.push({ pos: new THREE.Vector3(0, 1, 0), color: 0xff8833, intensity: 20, dist: 16, flicker: true });
      g.userData.fire = new THREE.Vector3(0, 0.25, 0);
      const t = buildStructure('tent', 1); t.scale.setScalar(0.8); t.position.set(-3, 0, -1); g.add(t);
      addC(-3, -1, 1.5, 3);
      break;
    }
    case 'fossil': {
      for (let i = 0; i < 9; i++) {
        const r = mesh(new THREE.TorusGeometry(0.8 - i * 0.03, 0.08, 5, 10, Math.PI * 0.9), m.bone, -1.5 + i * 0.4, 0.05, 0);
        r.rotation.set(Math.PI / 2 - 0.2, Math.PI / 2, 0); g.add(r);
      }
      { const sp = cyl(0.08, 0.1, 4.5, m.bone, 0, 0.1, 0, 6); sp.rotation.z = Math.PI / 2; g.add(sp); }
      const skull = mesh(new THREE.SphereGeometry(0.5, 10, 8), m.bone, 2.8, 0.25, 0); skull.scale.set(1.6, 0.8, 0.8); g.add(skull);
      for (let i = 0; i < 4; i++) g.add(cyl(0.05, 0.05, 1.2, m.wood, (i - 1.5) * 1.6, 0.6, 1.4, 4));
      const rope = box(5.5, 0.02, 0.02, m.red, 0, 1.1, 1.4); g.add(rope);
      break;
    }
    case 'nest': {
      const mound = mesh(new THREE.TorusGeometry(1.5, 0.6, 6, 14), m.soil, 0, 0.1, 0); mound.rotation.x = Math.PI / 2; mound.scale.z = 0.6; g.add(mound);
      { const fl = mesh(new THREE.CircleGeometry(1.5, 14), m.soil, 0, 0.05, 0); fl.rotation.x = -Math.PI / 2; g.add(fl); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const e = mesh(new THREE.SphereGeometry(0.25, 10, 8), m.egg, Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.6); e.scale.y = 1.35; e.rotation.z = Math.cos(a) * 0.4; g.add(e); }
      break;
    }
    case 'crate': {
      const c = buildStructure('storage'); c.rotation.y = rand() * 3; g.add(c);
      const tarp = mesh(new THREE.PlaneGeometry(1.8, 1.4), m.green, 0, 0.98, 0); tarp.rotation.x = -Math.PI / 2 + 0.1; g.add(tarp);
      addC(0, 0, 0.9, 1);
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== m.black; o.receiveShadow = true; } });
  return { group: g, colliders };
}
