// Dev-only gallery of avatar styles and environments: /dev/avatar-lab.html
import { AvatarRenderer } from '../src/avatar/renderer.ts';
import type { AvatarProfile } from '../src/avatar/types.ts';
import type { EnvironmentId, HairStyle, Accessory, FacialHair, Outfit } from '../shared/types.ts';

const params = new URLSearchParams(location.search);
const samples: [string, AvatarProfile['colors'], HairStyle, FacialHair, Accessory, Outfit, EnvironmentId, 'm' | 'f'][] = [
  ['Forward', ['#c8102e', '#046a38'], 'fade', 'stubble', 'none', 'jersey', 'stadium', 'm'],
  ['Playmaker', ['#75aadb', '#ffffff'], 'short', 'beard', 'none', 'jersey', 'stadium', 'm'],
  ['Fighter', ['#b71c1c', '#1b1b1b'], 'short', 'beard', 'none', 'tee', 'octagon', 'm'],
  ['Streamer', ['#ff1744', '#ffd600'], 'fade', 'none', 'headphones', 'hoodie', 'studio', 'm'],
  ['Singer', ['#ec407a', '#7e57c2'], 'long', 'none', 'none', 'jacket', 'stage', 'f'],
  ['Gulf icon', ['#006c35', '#d4af37'], 'short', 'mustache', 'ghutra', 'thobe', 'majlis', 'm'],
  ['Actor', ['#ffb300', '#212121'], 'bald', 'goatee', 'none', 'suit', 'film', 'm'],
  ['Hooper', ['#552583', '#fdb927'], 'short', 'beard', 'headband', 'jersey', 'court', 'm'],
  ['Scientist', ['#5c6bc0', '#e8eaf6'], 'wavy', 'mustache', 'none', 'jacket', 'lab', 'm'],
  ['Pharaoh', ['#d4af37', '#00695c'], 'bob', 'none', 'laurel', 'robe', 'hall', 'f'],
  ['Astronaut', ['#006c35', '#e3f2fd'], 'ponytail', 'none', 'none', 'labcoat', 'space', 'f'],
  ['Comic', ['#ff7043', '#ffd54f'], 'curly', 'stubble', 'glasses', 'jacket', 'comedy', 'm'],
  ['Afro', ['#7b1fa2', '#ffffff'], 'afro', 'none', 'none', 'tee', 'track', 'f'],
  ['Locs', ['#009b3a', '#fed100'], 'locs', 'beard', 'none', 'jacket', 'podcast', 'm'],
  ['Cap', ['#2e7d32', '#ff6f00'], 'buzz', 'none', 'cap', 'tee', 'ring', 'm'],
  ['Exec', ['#212121', '#b0bec5'], 'short', 'stubble', 'glasses', 'suit', 'office', 'm'],
  ['Mohawk', ['#e040fb', '#00e5ff'], 'mohawk', 'stubble', 'none', 'tee', 'gaming', 'm'],
  ['Hijab', ['#00897b', '#e0f2f1'], 'long', 'none', 'hijab', 'jacket', 'podcast', 'f'],
  ['Turban', ['#00695c', '#ffe0b2'], 'short', 'full', 'turban', 'robe', 'majlis', 'm'],
  ['Braids', ['#ff4081', '#ffd600'], 'braids', 'none', 'none', 'tank', 'ring', 'f'],
];

const big = document.getElementById('big') as HTMLCanvasElement;
const grid = document.getElementById('grid')!;
const pick = Number(params.get('big') ?? 0);
samples.forEach((s, i) => {
  const profile: AvatarProfile = {
    id: `lab-${i}`,
    name: s[0],
    gender: s[7],
    colors: s[1],
    look: { hair: s[2], facial: s[3], accessory: s[4], outfit: s[5], hairTone: i === 4 ? 'light' : i === 8 ? 'grey' : undefined },
    environment: s[6],
  };
  if (i === pick) {
    const r = new AvatarRenderer(big, profile, { framing: 'call' });
    r.start();
    if (params.get('talk')) {
      r.setState('speaking');
      r.setMouthSource(() => ({ open: 0.5 + 0.4 * Math.sin(performance.now() / 90), wide: 0.2, round: 0.1, teeth: 0.5 }));
    }
    r.setEmotion((params.get('emo') as never) ?? 'happy', 1e9);
  }
  const cell = document.createElement('div');
  cell.className = 'cell';
  const c = document.createElement('canvas');
  cell.append(c);
  const label = document.createElement('div');
  label.textContent = `${s[0]} · ${s[2]} / ${s[3]} / ${s[4]} / ${s[5]} · ${s[6]}`;
  cell.append(label);
  grid.append(cell);
  const r = new AvatarRenderer(c, profile, { framing: 'portrait', fps: 20 });
  r.start();
});
