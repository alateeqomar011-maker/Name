import * as THREE from 'three';
import { Game } from './game.js';
import { loadSettings, saveSettings } from './config.js';
import { PLAYER_START } from './world/design.js';

const params = new URLSearchParams(location.search);
const settings = loadSettings();
if (params.get('q')) settings.quality = params.get('q');

const $ = (id) => document.getElementById(id);
const loadFill = $('load-fill');
const loadText = $('load-text');
const TIPS = [
  'Tip: Crouch (C) in tall grass to slip past predators unseen.',
  'Tip: A T. rex cannot follow you into a cave or up a cliff.',
  'Tip: Raptors hunt in packs. If you hear chirping, find high ground.',
  'Tip: Mosasaurs patrol deep water. Stay close to the shore when swimming.',
  'Tip: Cook meat at a campfire — raw meat can make you sick.',
  'Tip: Climbing picks let you scale icy slopes in the Frostfang Peaks.',
  'Tip: Four tablets, one henge. The map (M) shows where you have been.',
];
$('load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

const show = (id, v = true) => $(id).classList.toggle('hidden', !v);
let game;

async function boot() {
  const canvas = $('game');
  game = new Game(canvas, settings, {
    onPause: () => pause(),
    onDeath: (cause) => {
      game.input.unlock();
      $('death-cause').textContent = cause ? `Cause: ${cause}` : '';
      setTimeout(() => show('death'), 900);
    },
    onEnding: () => { game.input.unlock(); game.paused = true; show('ending'); },
  });
  window.__game = game;
  await game.init((f, msg) => {
    loadFill.style.width = `${Math.round(f * 100)}%`;
    if (msg) loadText.textContent = msg;
  });
  show('loading', false);

  // test hooks (?x=&z=&yaw=&pitch=&t=)
  if (params.has('x') || params.has('still') || params.has('play')) {
    const p = game.player;
    if (params.has('x')) {
      p.spawn(+params.get('x'), +params.get('z'), +(params.get('yaw') || 0));
      p.pitch = +(params.get('pitch') || 0);
      if (params.has('y')) p.pos.y = +params.get('y');
    }
    if (params.has('t')) game.sky.timeOfDay = +params.get('t');
    game.hud.show(true);
    game.paused = false;
    game.started = true;
    if (params.has('still')) {
      game.clock.start();
      window.__frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(); return true; };
    } else game.start();
    canvas.addEventListener('click', () => { if (!game.uiOpen) game.input.lock(); });
    return;
  }

  // ---- main menu with a slowly orbiting vista
  game.menuMode = true;
  game.paused = false;
  game.sky.timeOfDay = 7.4;
  let ang = 0;
  const center = new THREE.Vector3(PLAYER_START.x + 150, 0, PLAYER_START.z + 350);
  game.menuCamera = (dt) => {
    ang += dt * 0.025;
    const cam = game.camera;
    const r = 260;
    const x = center.x + Math.cos(ang) * r, z = center.z + Math.sin(ang) * r;
    cam.position.set(x, game.world.height(x, z) + 28, z);
    cam.lookAt(center.x - Math.cos(ang) * 400, game.world.height(center.x, center.z) + 40, center.z - Math.sin(ang) * 400);
    game.player.pos.set(x, game.world.height(x, z), z);
  };
  game.start();
  show('menu');
  if (game.hasSave()) show('btn-continue');
  bindMenus();
}

function begin(fromSave) {
  game.audio.init();
  if (fromSave) game.load();
  else game.newGame();
  game.menuMode = false;
  game.menuCamera = null;
  game.started = true;
  game.paused = false;
  show('menu', false);
  game.hud.show(true);
  game.input.lock();
}

function pause() {
  if (!game.started || game.paused) return;
  game.paused = true;
  game.save();
  show('pause');
}
function resume() {
  show('pause', false);
  ['settings', 'controls'].forEach((p) => show('panel-' + p, false));
  game.paused = false;
  game.input.lock();
}

function openSub(name) {
  show('panel-' + name);
}

function bindMenus() {
  let confirmNew = false;
  $('btn-new').onclick = () => {
    if (game.hasSave() && !confirmNew) {
      confirmNew = true;
      $('btn-new').textContent = 'Overwrite saved game?';
      return;
    }
    try { localStorage.removeItem('primordia-save-v1'); } catch (e) { /* ignore */ }
    begin(false);
  };
  $('btn-continue').onclick = () => begin(true);
  $('btn-settings').onclick = () => openSub('settings');
  $('btn-controls').onclick = () => openSub('controls');
  $('btn-p-settings').onclick = () => openSub('settings');
  $('btn-p-controls').onclick = () => openSub('controls');
  $('btn-resume').onclick = resume;
  $('btn-save').onclick = () => { if (game.save()) game.hud.toast('Game saved.', 'good'); };
  $('btn-quit').onclick = () => { game.save(); location.reload(); };
  $('btn-respawn').onclick = () => { show('death', false); game.respawn(); game.input.lock(); };
  $('btn-ending').onclick = () => { show('ending', false); game.paused = false; game.input.lock(); };
  document.querySelectorAll('#panel-settings [data-close], #panel-controls [data-close]').forEach((b) => b.addEventListener('click', () => { show('panel-settings', false); show('panel-controls', false); }));

  // settings
  const q = $('set-quality'), fov = $('set-fov'), sens = $('set-sens'), inv = $('set-invert'), vol = $('set-volume'), fps = $('set-fps'), dyn = $('set-dynres');
  q.value = settings.quality; fov.value = settings.fov; sens.value = settings.sensitivity; inv.checked = settings.invertY; vol.value = settings.volume; fps.checked = settings.showFps; dyn.checked = settings.dynamicRes;
  const label = () => { $('set-fov-v').textContent = fov.value + '°'; $('set-sens-v').textContent = (+sens.value).toFixed(2); };
  label();
  q.onchange = () => { settings.quality = q.value; saveSettings(settings); if (game.started) game.save(); location.reload(); };
  fov.oninput = () => { settings.fov = +fov.value; game.camera.fov = settings.fov; game.camera.updateProjectionMatrix(); label(); saveSettings(settings); };
  sens.oninput = () => { settings.sensitivity = +sens.value; game.player.sensitivity = 0.0022 * settings.sensitivity; label(); saveSettings(settings); };
  inv.onchange = () => { settings.invertY = inv.checked; game.player.invertY = inv.checked; saveSettings(settings); };
  vol.oninput = () => { settings.volume = +vol.value; game.audio.setVolume(settings.volume); saveSettings(settings); };
  fps.onchange = () => { settings.showFps = fps.checked; saveSettings(settings); };
  dyn.onchange = () => { settings.dynamicRes = dyn.checked; saveSettings(settings); if (!dyn.checked) game.setRenderScale(game.quality.pixelRatio); };

  // click to re-capture the mouse while playing
  $('game').addEventListener('click', () => { if (game.started && !game.paused && !game.uiOpen && !game.player.dead) game.input.lock(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game.paused && game.started && !$('pause').classList.contains('hidden')) resume();
  });
  window.addEventListener('beforeunload', () => { if (game.started) game.save(); });
}

boot().catch((e) => {
  console.error(e);
  loadText.textContent = 'Failed to start: ' + e.message + ' — your browser needs WebGL 2.';
});
