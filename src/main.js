import { Game } from './game.js';
import { loadSettings } from './config.js';

const params = new URLSearchParams(location.search);
const settings = loadSettings();
if (params.get('q')) settings.quality = params.get('q');

const loadFill = document.getElementById('load-fill');
const loadText = document.getElementById('load-text');

async function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas, settings, {});
  window.__game = game;
  await game.init((f, msg) => {
    loadFill.style.width = `${Math.round(f * 100)}%`;
    if (msg) loadText.textContent = msg;
  });
  document.getElementById('loading').classList.add('hidden');
  // test camera from URL
  if (params.has('x')) {
    const p = game.player;
    p.spawn(+params.get('x'), +params.get('z'), +(params.get('yaw') || 0));
    p.pitch = +(params.get('pitch') || 0);
    if (params.has('y')) p.pos.y = +params.get('y');
  }
  if (params.has('t')) game.sky.timeOfDay = +params.get('t');
  game.paused = false;
  game.started = true;
  if (params.has('still')) {
    // test mode: render frames on demand only
    game.clock.start();
    window.__frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(); return true; };
  } else game.start();
  canvas.addEventListener('click', () => game.input.lock());
}

boot().catch((e) => {
  console.error(e);
  loadText.textContent = 'Failed to start: ' + e.message;
});
