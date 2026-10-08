// Character viewer: the player and the six lost explorers side by side, or one close-up.
// ?view=lineup | portrait&c=<id|player>&mood=<happy|determined|surprised|pain|worried|neutral>
import * as THREE from 'three';
import { Avatar, EXPLORER_LOOKS } from '../src/player/avatar.js';

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'lineup';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9aa8b4);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x665544, 1.3));
const sun = new THREE.DirectionalLight(0xfff0dd, 2.6);
sun.position.set(3, 6, 5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -6; sun.shadow.camera.right = 6; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -2;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc8d8ff, 0.7); fill.position.set(-4, 2, 3); scene.add(fill);
const ground = new THREE.Mesh(new THREE.CircleGeometry(20, 32), new THREE.MeshStandardMaterial({ color: 0x6b6a52 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
const ids = ['player', ...Object.keys(EXPLORER_LOOKS)];
const avs = [];
const mood = params.get('mood') || 'neutral';
if (view === 'lineup') {
  ids.forEach((id, i) => {
    const av = new Avatar(id === 'player' ? {} : { ...EXPLORER_LOOKS[id], npc: true });
    av.root.position.set((i - (ids.length - 1) / 2) * 0.85, 0, 0);
    scene.add(av.root); avs.push(av);
  });
  camera.position.set(0, 1.25, 7.2); camera.lookAt(0, 0.95, 0);
} else {
  const id = params.get('c') || 'player';
  const av = new Avatar(id === 'player' ? {} : { ...EXPLORER_LOOKS[id], npc: true });
  av.root.rotation.y = +(params.get('yaw') || 0.35);
  scene.add(av.root); avs.push(av);
  const hy = id === 'player' ? 1.74 : 1.68; camera.position.set(0, hy + 0.04, 0.8); camera.lookAt(0, hy - 0.02, 0);
  camera.fov = 22; camera.updateProjectionMatrix();
}
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (const a of avs) { a.update(dt, { speed: 0, onGround: true, mood }); a._blinkT = 99; }
  renderer.render(scene, camera);
});
