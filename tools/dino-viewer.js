import * as THREE from 'three';
import { SPECIES } from '../src/dinos/species.js';
import { buildTemplate, makeSkinMaterial } from '../src/dinos/model.js';
import { DinoRig } from '../src/dinos/rig.js';

const params = new URLSearchParams(location.search);
const only = params.get('s');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8cc);
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x554433, 1.2));
const sun = new THREE.DirectionalLight(0xfff0dd, 3);
sun.position.set(30, 50, 40); sun.castShadow = true;
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60; sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = 0.04; sun.shadow.bias = -0.0005;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x6b7a4a }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1000);
const list = only ? [SPECIES[only]] : Object.values(SPECIES);
const rigs = [];
let x = 0;
for (const spec of list) {
  const t = buildTemplate(spec);
  const rig = new DinoRig(t, makeSkinMaterial(spec.colors, null, spec.length, spec.diet === 'carnivore' || spec.diet === 'piscivore'));
  const len = spec.length;
  rig.mesh.position.set(x + len / 2, spec.flyer ? 3 : spec.aquatic ? 1.5 : 0, 0);
  rig.mesh.rotation.y = Math.PI / 2;
  scene.add(rig.mesh);
  rigs.push({ rig, spec });
  x += Math.max(len, spec.flyer ? spec.body.span : 0) + 2;
}
const mode = params.get('mode') || 'walk';
const total = x;
if (only) {
  const L = list[0].length;
  const view = params.get('view') || 'side';
  const hy = list[0].body.hip || 1;
  if (view === 'side') { camera.position.set(L * 0.5, hy * 1.2, L * 1.25); camera.lookAt(L * 0.5, hy * 0.9, 0); }
  else if (view === 'head') { camera.position.set(L * 1.05, hy * 1.6, L * 0.35); camera.lookAt(L * 0.9, hy * 1.2, 0); }
  else { camera.position.set(L * 1.25, hy * 1.5, L * 0.85); camera.lookAt(L * 0.5, hy * 0.8, 0); }
} else {
  camera.position.set(total / 2, total * 0.12, total * 0.55);
  camera.lookAt(total / 2, 2, 0);
}
let last = performance.now();
let simT = 0;
function frame() {
  const now = performance.now();
  const dt = 1 / 60;
  simT += dt;
  for (const { rig, spec } of rigs) {
    const st = { speed: mode === 'run' ? spec.speed.run : mode === 'idle' ? 0 : spec.speed.walk, headPitch: mode === 'graze' ? 0.9 : 0, headYaw: 0, jaw: mode === 'roar' ? 1 : 0, roar: mode === 'roar' ? 1 : 0,
      lie: mode === 'lie' ? 1 : 0, dead: mode === 'dead' ? 1 : 0, flap: 1, fold: 0 };
    rig.update(dt, st);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// warm up animation
for (let i = 0; i < 120; i++) for (const { rig, spec } of rigs) rig.update(1 / 60, { speed: mode === 'run' ? spec.speed.run : mode === 'idle' ? 0 : spec.speed.walk, headPitch: mode === 'graze' ? 0.9 : 0, jaw: mode === 'roar' ? 1 : 0, roar: mode === 'roar' ? 1 : 0, lie: mode === 'lie' ? 1 : 0, dead: mode === 'dead' ? 1 : 0, flap: 1 });
frame();
window.__ready = true;
