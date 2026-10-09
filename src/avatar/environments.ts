// Procedural virtual sets behind the avatar, one per profession. A static layer is rendered once
// (and softly blurred for depth of field); a light animated layer adds flicker, bokeh and beams.

import type { EnvironmentId } from '../../shared/types.ts';
import { mix, rgba, seeded } from './color.ts';

type Ctx = CanvasRenderingContext2D;

export interface EnvColors {
  accent: string;
  secondary: string;
}

export const ENVIRONMENT_LABELS: Record<EnvironmentId, string> = {
  stadium: 'Stadium at night',
  octagon: 'Fight night arena',
  ring: 'Boxing ring',
  court: 'Basketball arena',
  track: 'Race track',
  studio: 'Creator studio',
  gaming: 'Gaming setup',
  film: 'Film set',
  stage: 'Concert stage',
  comedy: 'Comedy club',
  hall: 'Grand hall',
  lab: 'Research lab',
  office: 'Penthouse office',
  majlis: 'Majlis',
  space: 'Space station',
  podcast: 'Podcast studio',
};

function vgrad(ctx: Ctx, h: number, stops: [number, string][], y0 = 0): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.35, rgba(color, alpha * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function bokeh(ctx: Ctx, w: number, h: number, rng: () => number, n: number, y0: number, y1: number, colors: string[], size = 1): void {
  for (let i = 0; i < n; i++) {
    const x = rng() * w;
    const y = y0 + rng() * (y1 - y0);
    const r = (2 + rng() * 6) * size * (w / 900);
    ctx.fillStyle = rgba(colors[Math.floor(rng() * colors.length)], 0.25 + rng() * 0.45);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function crowd(ctx: Ctx, w: number, y: number, h: number, rng: () => number, tint: string): void {
  ctx.fillStyle = vgrad(ctx, y + h, [
    [0, 'rgba(0,0,0,0)'],
    [1, mix(tint, '#000000', 0.85)],
  ], y);
  ctx.fillRect(0, y, w, h);
  const scale = w / 900;
  for (let i = 0; i < 160; i++) {
    const x = rng() * w;
    const yy = y + rng() * h;
    const r = (4 + rng() * 6) * scale;
    ctx.fillStyle = `rgba(${10 + rng() * 25},${10 + rng() * 25},${18 + rng() * 30},0.85)`;
    ctx.beginPath();
    ctx.arc(x, yy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function floorPerspective(ctx: Ctx, w: number, h: number, horizon: number, color: string, lineColor: string, lines = 12): void {
  ctx.fillStyle = vgrad(ctx, h, [
    [0, mix(color, '#000000', 0.3)],
    [1, mix(color, '#000000', 0.7)],
  ], horizon);
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = Math.max(1, w / 700);
  for (let i = -lines; i <= lines; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * (w / lines) * 0.25, horizon);
    ctx.lineTo(w / 2 + i * (w / lines) * 1.6, h);
    ctx.stroke();
  }
}

export function drawEnvironmentStatic(ctx: Ctx, env: EnvironmentId, w: number, h: number, c: EnvColors, seed: number): void {
  const rng = seeded(seed);
  const A = c.accent;
  ctx.save();
  switch (env) {
    case 'stadium': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#03060f'],
        [0.45, '#0b1a33'],
        [0.62, '#13304a'],
        [1, '#06110c'],
      ]);
      ctx.fillRect(0, 0, w, h);
      // Stands
      ctx.fillStyle = '#0a1220';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.3);
      ctx.quadraticCurveTo(w / 2, h * 0.2, w, h * 0.3);
      ctx.lineTo(w, h * 0.62);
      ctx.lineTo(0, h * 0.62);
      ctx.fill();
      bokeh(ctx, w, h, rng, 320, h * 0.28, h * 0.6, ['#ffffff', A, c.secondary, '#ffd27a'], 0.6);
      // Floodlights
      for (const fx of [0.12, 0.88]) {
        ctx.fillStyle = '#05080f';
        ctx.fillRect(w * fx - w * 0.004, h * 0.05, w * 0.008, h * 0.3);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) glow(ctx, w * fx + (j - 1.5) * w * 0.012, h * 0.06 + i * h * 0.018, w * 0.02, '#fff6dd', 0.9);
        glow(ctx, w * fx, h * 0.08, w * 0.25, '#bcd7ff', 0.25);
      }
      // Pitch
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#1d6b34'],
        [1, '#0b3a1c'],
      ], h * 0.62);
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#000000';
        const y0 = h * 0.62 + (h * 0.38 * i * i) / 81;
        const y1 = h * 0.62 + (h * 0.38 * (i + 1) * (i + 1)) / 81;
        ctx.fillRect(0, y0, w, y1 - y0);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, w / 500);
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.8, w * 0.28, h * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'octagon':
    case 'ring': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#040407'],
        [0.6, '#0d0b12'],
        [1, '#050406'],
      ]);
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w / 2, -h * 0.05, w * 0.6, '#fff4e0', 0.25);
      crowd(ctx, w, h * 0.35, h * 0.3, rng, A);
      bokeh(ctx, w, h, rng, 80, h * 0.35, h * 0.62, ['#ffffff', '#9ad1ff'], 0.5);
      // Canvas floor
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#c9c4bd'],
        [1, '#57534f'],
      ], h * 0.66);
      ctx.fillRect(0, h * 0.66, w, h * 0.34);
      if (env === 'octagon') {
        ctx.strokeStyle = 'rgba(30,30,36,0.9)';
        ctx.lineWidth = Math.max(1, w / 900);
        const s = w / 40;
        for (let x = -h; x < w + h; x += s) {
          ctx.beginPath();
          ctx.moveTo(x, h * 0.2);
          ctx.lineTo(x + h * 0.48, h * 0.68);
          ctx.moveTo(x, h * 0.68);
          ctx.lineTo(x + h * 0.48, h * 0.2);
          ctx.stroke();
        }
        ctx.fillStyle = '#121216';
        ctx.fillRect(0, h * 0.18, w, h * 0.025);
        ctx.fillRect(0, h * 0.66, w, h * 0.02);
        ctx.fillStyle = rgba(A, 0.7);
        ctx.fillRect(w * 0.08, h * 0.62, w * 0.12, h * 0.04);
        ctx.fillRect(w * 0.8, h * 0.62, w * 0.12, h * 0.04);
      } else {
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = i === 1 ? '#f2f2f2' : A;
          ctx.lineWidth = Math.max(2, h * 0.012);
          ctx.beginPath();
          ctx.moveTo(0, h * (0.42 + i * 0.08));
          ctx.lineTo(w, h * (0.44 + i * 0.08));
          ctx.stroke();
        }
        ctx.fillStyle = mix(A, '#000000', 0.3);
        ctx.fillRect(w * 0.06, h * 0.38, w * 0.025, h * 0.32);
        ctx.fillRect(w * 0.915, h * 0.38, w * 0.025, h * 0.32);
      }
      break;
    }
    case 'court': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#05060c'],
        [0.55, '#141425'],
        [1, '#0a0806'],
      ]);
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w / 2, h * 0.08, w * 0.12, '#ffffff', 0.4);
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(w * 0.42, h * 0.02, w * 0.16, h * 0.12);
      ctx.fillStyle = rgba(A, 0.8);
      ctx.fillRect(w * 0.43, h * 0.04, w * 0.14, h * 0.07);
      crowd(ctx, w, h * 0.28, h * 0.32, rng, A);
      bokeh(ctx, w, h, rng, 120, h * 0.3, h * 0.6, ['#ffffff', A], 0.45);
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#c08a4c'],
        [1, '#6e4a24'],
      ], h * 0.6);
      ctx.fillRect(0, h * 0.6, w, h * 0.4);
      ctx.strokeStyle = 'rgba(80,40,10,0.35)';
      ctx.lineWidth = Math.max(1, w / 900);
      for (let i = 0; i < 40; i++) {
        const x = (i / 40) * w;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.6);
        ctx.lineTo(w / 2 + (x - w / 2) * 2.2, h);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1.5, w / 450);
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.78, w * 0.2, h * 0.07, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Hoop
      ctx.strokeStyle = '#e9edf2';
      ctx.lineWidth = Math.max(2, w / 300);
      ctx.strokeRect(w * 0.84, h * 0.2, w * 0.1, h * 0.08);
      ctx.strokeStyle = '#ff6a00';
      ctx.beginPath();
      ctx.ellipse(w * 0.89, h * 0.3, w * 0.025, h * 0.008, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'track': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#1b2440'],
        [0.4, '#d77a4d'],
        [0.5, '#f0b27a'],
        [1, '#1a1210'],
      ]);
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w * 0.7, h * 0.45, w * 0.3, '#ffd59a', 0.5);
      ctx.fillStyle = '#16131b';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.38);
      ctx.lineTo(w * 0.35, h * 0.33);
      ctx.lineTo(w, h * 0.4);
      ctx.lineTo(w, h * 0.55);
      ctx.lineTo(0, h * 0.55);
      ctx.fill();
      bokeh(ctx, w, h, rng, 90, h * 0.34, h * 0.54, ['#ffd27a', '#ffffff', A], 0.5);
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#a33d2b'],
        [1, '#4a1912'],
      ], h * 0.55);
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, w / 600);
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, h * (0.58 + i * 0.012 * (i + 1)));
        ctx.lineTo(w, h * (0.56 + i * 0.011 * (i + 1)));
        ctx.stroke();
      }
      break;
    }
    case 'studio': {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, mix(A, '#06040c', 0.65));
      g.addColorStop(0.5, '#0b0716');
      g.addColorStop(1, mix(c.secondary, '#04060c', 0.7));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // LED strips
      for (const [y, col] of [[h * 0.12, A], [h * 0.7, c.secondary]] as const) {
        ctx.fillStyle = col;
        ctx.fillRect(0, y, w, Math.max(2, h * 0.006));
        glow(ctx, w * 0.2, y, w * 0.25, col, 0.25);
        glow(ctx, w * 0.8, y, w * 0.25, col, 0.25);
      }
      // Shelves with collectibles
      for (const sx of [0.06, 0.74]) {
        for (let r = 0; r < 3; r++) {
          const y = h * (0.25 + r * 0.14);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(w * sx, y, w * 0.2, h * 0.008);
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = rgba(rng() > 0.5 ? A : c.secondary, 0.35 + rng() * 0.4);
            const bw = w * (0.015 + rng() * 0.02);
            const bh = h * (0.03 + rng() * 0.05);
            ctx.fillRect(w * (sx + 0.01 + k * 0.05), y - bh, bw, bh);
          }
        }
      }
      // Neon LIVE sign
      ctx.font = `700 ${Math.round(h * 0.06)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = A;
      ctx.shadowBlur = h * 0.04;
      ctx.fillStyle = mix(A, '#ffffff', 0.4);
      ctx.fillText('LIVE', w * 0.82, h * 0.2);
      ctx.shadowBlur = 0;
      glow(ctx, w * 0.5, h * 0.35, w * 0.3, '#ffffff', 0.06);
      break;
    }
    case 'gaming': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#03040a'],
        [1, '#07040e'],
      ]);
      ctx.fillRect(0, 0, w, h);
      for (const [mx, mw] of [[0.04, 0.26], [0.7, 0.26]] as const) {
        const y = h * 0.28;
        ctx.fillStyle = '#0c1220';
        ctx.fillRect(w * mx, y, w * mw, h * 0.26);
        const g = ctx.createLinearGradient(w * mx, y, w * (mx + mw), y + h * 0.26);
        g.addColorStop(0, rgba(A, 0.55));
        g.addColorStop(1, rgba(c.secondary, 0.4));
        ctx.fillStyle = g;
        ctx.fillRect(w * mx + 4, y + 4, w * mw - 8, h * 0.26 - 8);
        glow(ctx, w * (mx + mw / 2), y + h * 0.13, w * 0.25, A, 0.25);
      }
      ctx.fillStyle = rgba(c.secondary, 0.9);
      ctx.fillRect(0, h * 0.62, w, Math.max(2, h * 0.006));
      glow(ctx, w / 2, h * 0.62, w * 0.5, c.secondary, 0.18);
      ctx.fillStyle = '#05060a';
      ctx.fillRect(0, h * 0.64, w, h * 0.36);
      bokeh(ctx, w, h, rng, 40, 0, h * 0.25, [A, c.secondary], 0.6);
      break;
    }
    case 'film': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#0c0907'],
        [1, '#1c120b'],
      ]);
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w * 0.15, h * 0.2, w * 0.3, '#ffcf8a', 0.35);
      glow(ctx, w * 0.9, h * 0.15, w * 0.35, mix(A, '#ffd9a0', 0.5), 0.3);
      // Softbox and light stands
      ctx.fillStyle = 'rgba(255,240,215,0.85)';
      ctx.fillRect(w * 0.06, h * 0.12, w * 0.1, h * 0.16);
      ctx.fillStyle = '#16110c';
      ctx.fillRect(w * 0.105, h * 0.28, w * 0.006, h * 0.5);
      ctx.fillRect(w * 0.86, h * 0.1, w * 0.006, h * 0.6);
      ctx.beginPath();
      ctx.moveTo(w * 0.86, h * 0.1);
      ctx.lineTo(w * 0.97, h * 0.05);
      ctx.lineTo(w * 0.98, h * 0.12);
      ctx.fill();
      bokeh(ctx, w, h, rng, 70, h * 0.05, h * 0.7, ['#ffd08a', '#ffae5c', '#ffffff'], 1.2);
      ctx.fillStyle = vgrad(ctx, h, [
        [0, 'rgba(0,0,0,0)'],
        [1, 'rgba(0,0,0,0.7)'],
      ], h * 0.6);
      ctx.fillRect(0, h * 0.6, w, h * 0.4);
      break;
    }
    case 'stage': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#05020b'],
        [0.7, mix(A, '#05020b', 0.75)],
        [1, '#030206'],
      ]);
      ctx.fillRect(0, 0, w, h);
      // LED wall
      const cols = 26;
      const rows = 10;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const v = 0.5 + 0.5 * Math.sin(i * 0.5 + j * 0.7 + seed);
          ctx.fillStyle = rgba(mix(A, c.secondary, v), 0.08 + v * 0.18);
          ctx.fillRect((i / cols) * w + 1, h * 0.08 + (j / rows) * h * 0.45 + 1, w / cols - 2, (h * 0.45) / rows - 2);
        }
      }
      crowd(ctx, w, h * 0.72, h * 0.28, rng, A);
      break;
    }
    case 'comedy': {
      ctx.fillStyle = '#1d0d0a';
      ctx.fillRect(0, 0, w, h);
      const bw = w / 14;
      const bh = h / 22;
      for (let r = 0; r < 24; r++) {
        for (let k = -1; k < 16; k++) {
          const x = k * bw + (r % 2 ? bw / 2 : 0);
          const shadeV = 0.75 + rng() * 0.25;
          ctx.fillStyle = `rgb(${Math.round(120 * shadeV)},${Math.round(48 * shadeV)},${Math.round(36 * shadeV)})`;
          ctx.fillRect(x + 1, r * bh + 1, bw - 3, bh - 3);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w * 0.5, h * 0.42, w * 0.45, '#ffcf8a', 0.55);
      // Mic stand
      ctx.strokeStyle = '#0c0c0f';
      ctx.lineWidth = Math.max(3, w / 160);
      ctx.beginPath();
      ctx.moveTo(w * 0.86, h);
      ctx.lineTo(w * 0.86, h * 0.45);
      ctx.lineTo(w * 0.82, h * 0.38);
      ctx.stroke();
      ctx.fillStyle = '#1a1a20';
      ctx.beginPath();
      ctx.ellipse(w * 0.815, h * 0.37, w * 0.014, h * 0.03, -0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hall': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#120c07'],
        [1, '#2a1c10'],
      ]);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) {
        const x = w * (0.05 + i * 0.18);
        ctx.fillStyle = vgrad(ctx, h, [
          [0, '#3a2a1a'],
          [1, '#1a120a'],
        ]);
        ctx.fillRect(x, h * 0.12, w * 0.06, h * 0.75);
        ctx.fillStyle = 'rgba(255,220,160,0.12)';
        ctx.fillRect(x, h * 0.12, w * 0.015, h * 0.75);
        ctx.fillStyle = '#4a3622';
        ctx.fillRect(x - w * 0.008, h * 0.1, w * 0.076, h * 0.03);
      }
      for (const tx of [0.14, 0.86]) {
        glow(ctx, w * tx, h * 0.4, w * 0.2, '#ffb35c', 0.6);
        glow(ctx, w * tx, h * 0.4, w * 0.02, '#fff1c9', 1);
      }
      floorPerspective(ctx, w, h, h * 0.86, '#3a2a1a', 'rgba(255,220,160,0.08)', 10);
      break;
    }
    case 'lab': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#03101a'],
        [1, '#061a24'],
      ]);
      ctx.fillRect(0, 0, w, h);
      for (const [sx, sy] of [[0.05, 0.18], [0.72, 0.15], [0.76, 0.42]] as const) {
        ctx.fillStyle = rgba('#00e5ff', 0.12);
        ctx.fillRect(w * sx, h * sy, w * 0.22, h * 0.18);
        ctx.strokeStyle = rgba('#00e5ff', 0.6);
        ctx.lineWidth = Math.max(1, w / 600);
        ctx.strokeRect(w * sx, h * sy, w * 0.22, h * 0.18);
        ctx.beginPath();
        for (let k = 0; k <= 20; k++) {
          const x = w * (sx + 0.01 + (k / 20) * 0.2);
          const y = h * (sy + 0.12 - Math.abs(Math.sin(k * 0.7 + sx * 10)) * 0.08);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {
        const x = w * (0.06 + i * 0.035);
        glow(ctx, x, h * 0.6, w * 0.03, i % 2 ? '#1de9b6' : A, 0.6);
        ctx.fillStyle = rgba(i % 2 ? '#1de9b6' : A, 0.5);
        ctx.fillRect(x - w * 0.008, h * 0.56, w * 0.016, h * 0.06);
      }
      floorPerspective(ctx, w, h, h * 0.66, '#0d2a36', 'rgba(0,229,255,0.07)');
      break;
    }
    case 'office': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#050914'],
        [0.7, '#152338'],
        [1, '#0b0f17'],
      ]);
      ctx.fillRect(0, 0, w, h);
      // City skyline
      let x = 0;
      while (x < w) {
        const bw = w * (0.03 + rng() * 0.05);
        const bh = h * (0.15 + rng() * 0.35);
        const top = h * 0.68 - bh;
        ctx.fillStyle = `rgb(${12 + rng() * 10},${18 + rng() * 12},${30 + rng() * 15})`;
        ctx.fillRect(x, top, bw, bh);
        for (let wy = top + 6; wy < h * 0.66; wy += h * 0.022) {
          for (let wx = x + 3; wx < x + bw - 4; wx += w * 0.01) {
            if (rng() > 0.55) {
              ctx.fillStyle = rgba(rng() > 0.8 ? '#9fd3ff' : '#ffd69a', 0.35 + rng() * 0.5);
              ctx.fillRect(wx, wy, w * 0.004, h * 0.008);
            }
          }
        }
        x += bw + w * 0.004;
      }
      // Window mullions
      ctx.fillStyle = '#0b0d12';
      for (let i = 0; i <= 5; i++) ctx.fillRect((i / 5) * w - w * 0.006, 0, w * 0.012, h * 0.7);
      ctx.fillRect(0, h * 0.68, w, h * 0.32);
      glow(ctx, w * 0.12, h * 0.75, w * 0.18, '#ffcf8a', 0.35);
      break;
    }
    case 'majlis': {
      ctx.fillStyle = vgrad(ctx, h, [
        [0, '#1a0f08'],
        [1, '#2b1a0d'],
      ]);
      ctx.fillRect(0, 0, w, h);
      // Eight-pointed star lattice
      const s = w / 9;
      ctx.strokeStyle = 'rgba(231,196,106,0.28)';
      ctx.lineWidth = Math.max(1, w / 700);
      for (let gx = -1; gx < 11; gx++) {
        for (let gy = -1; gy < 8; gy++) {
          const cx = gx * s + (gy % 2 ? s / 2 : 0);
          const cy = gy * s * 0.9;
          for (let r = 0; r < 2; r++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((r * Math.PI) / 4);
            ctx.strokeRect(-s * 0.28, -s * 0.28, s * 0.56, s * 0.56);
            ctx.restore();
          }
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, w, h);
      for (const lx of [0.12, 0.88]) {
        ctx.strokeStyle = 'rgba(231,196,106,0.6)';
        ctx.beginPath();
        ctx.moveTo(w * lx, 0);
        ctx.lineTo(w * lx, h * 0.2);
        ctx.stroke();
        glow(ctx, w * lx, h * 0.26, w * 0.18, '#ffb347', 0.55);
        ctx.fillStyle = 'rgba(231,196,106,0.85)';
        ctx.beginPath();
        ctx.moveTo(w * lx, h * 0.2);
        ctx.lineTo(w * (lx + 0.02), h * 0.26);
        ctx.lineTo(w * lx, h * 0.32);
        ctx.lineTo(w * (lx - 0.02), h * 0.26);
        ctx.fill();
      }
      // Floor cushions
      ctx.fillStyle = '#5a1f1a';
      ctx.fillRect(0, h * 0.72, w, h * 0.12);
      ctx.fillStyle = 'rgba(231,196,106,0.5)';
      ctx.fillRect(0, h * 0.72, w, h * 0.008);
      ctx.fillStyle = '#2a0f0c';
      ctx.fillRect(0, h * 0.84, w, h * 0.16);
      break;
    }
    case 'space': {
      ctx.fillStyle = '#01030a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.8})`;
        const r = rng() * 1.4 * (w / 900);
        ctx.fillRect(rng() * w, rng() * h * 0.7, r + 0.5, r + 0.5);
      }
      // Earth limb
      const ex = w * 0.5;
      const ey = h * 1.55;
      const er = h * 1.0;
      const eg = ctx.createRadialGradient(ex, ey - er * 0.3, er * 0.2, ex, ey, er);
      eg.addColorStop(0, '#2a7bd1');
      eg.addColorStop(0.85, '#1b4f8f');
      eg.addColorStop(1, '#5fb7ff');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
      glow(ctx, ex, ey - er, w * 0.6, '#6fc3ff', 0.35);
      // Window frame
      ctx.strokeStyle = '#1d222c';
      ctx.lineWidth = w * 0.05;
      ctx.beginPath();
      ctx.roundRect(-w * 0.02, -h * 0.02, w * 1.04, h * 1.04, w * 0.12);
      ctx.stroke();
      ctx.fillStyle = '#20262f';
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
      ctx.fillStyle = rgba(A, 0.7);
      for (let i = 0; i < 8; i++) ctx.fillRect(w * (0.06 + i * 0.11), h * 0.86, w * 0.04, h * 0.012);
      break;
    }
    case 'podcast': {
      ctx.fillStyle = '#120d10';
      ctx.fillRect(0, 0, w, h);
      const tile = w / 16;
      for (let gx = 0; gx < 17; gx++) {
        for (let gy = 0; gy < 12; gy++) {
          const v = (gx + gy) % 2;
          ctx.fillStyle = v ? '#1d1418' : '#17101a';
          ctx.fillRect(gx * tile + 2, gy * tile + 2, tile - 4, tile - 4);
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          ctx.fillRect(gx * tile + 2, gy * tile + 2, tile - 4, (tile - 4) * 0.3);
        }
      }
      glow(ctx, w * 0.15, h * 0.35, w * 0.25, '#ffb26b', 0.4);
      // ON AIR sign
      ctx.fillStyle = '#2a0b0b';
      ctx.fillRect(w * 0.74, h * 0.12, w * 0.18, h * 0.08);
      ctx.font = `800 ${Math.round(h * 0.045)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff3b3b';
      ctx.shadowBlur = h * 0.03;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText('ON AIR', w * 0.83, h * 0.178);
      ctx.shadowBlur = 0;
      // Mic arm
      ctx.strokeStyle = '#08080a';
      ctx.lineWidth = Math.max(3, w / 180);
      ctx.beginPath();
      ctx.moveTo(w * 0.98, h * 0.55);
      ctx.lineTo(w * 0.86, h * 0.68);
      ctx.lineTo(w * 0.8, h * 0.62);
      ctx.stroke();
      ctx.fillStyle = '#121216';
      ctx.beginPath();
      ctx.roundRect(w * 0.765, h * 0.58, w * 0.03, h * 0.09, w * 0.012);
      ctx.fill();
      break;
    }
  }
  // Global vignette
  const v = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.5, Math.max(w, h) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Lightweight animated touches drawn every frame over the static set. */
export function drawEnvironmentLive(ctx: Ctx, env: EnvironmentId, w: number, h: number, t: number, c: EnvColors, seed: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  switch (env) {
    case 'stadium':
    case 'court':
    case 'octagon':
    case 'ring': {
      // Camera flashes in the crowd
      const rng = seeded(seed + Math.floor(t * 6));
      for (let i = 0; i < 3; i++) {
        if (rng() > 0.55) continue;
        const x = rng() * w;
        const y = h * (0.3 + rng() * 0.3);
        const g = ctx.createRadialGradient(x, y, 0, x, y, w * 0.02);
        g.addColorStop(0, 'rgba(255,255,255,0.7)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - w * 0.02, y - w * 0.02, w * 0.04, w * 0.04);
      }
      if (env === 'octagon' || env === 'ring') {
        const a = 0.12 + 0.05 * Math.sin(t * 1.3);
        const g = ctx.createLinearGradient(w / 2, 0, w / 2, h);
        g.addColorStop(0, `rgba(255,240,210,${a})`);
        g.addColorStop(1, 'rgba(255,240,210,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(w * 0.42, 0);
        ctx.lineTo(w * 0.58, 0);
        ctx.lineTo(w * 0.85, h);
        ctx.lineTo(w * 0.15, h);
        ctx.fill();
      }
      break;
    }
    case 'stage': {
      for (let i = 0; i < 4; i++) {
        const sway = Math.sin(t * 0.6 + i * 1.7) * 0.35;
        const x = w * (0.15 + i * 0.23);
        const col = i % 2 ? c.secondary : c.accent;
        const g = ctx.createLinearGradient(x, 0, x, h);
        g.addColorStop(0, rgba(col, 0.32));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.01, 0);
        ctx.lineTo(x + w * 0.01, 0);
        ctx.lineTo(x + w * (sway + 0.12), h);
        ctx.lineTo(x + w * (sway - 0.12), h);
        ctx.fill();
      }
      break;
    }
    case 'studio':
    case 'gaming': {
      const pulse = 0.08 + 0.05 * Math.sin(t * 1.4);
      ctx.fillStyle = rgba(c.accent, pulse * 0.5);
      ctx.fillRect(0, 0, w, h * 0.2);
      break;
    }
    case 'space': {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, w * 0.6);
      g.addColorStop(0, `rgba(111,195,255,${0.04 + 0.02 * Math.sin(t * 0.5)})`);
      g.addColorStop(1, 'rgba(111,195,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'hall':
    case 'majlis': {
      for (const tx of [0.13, 0.87]) {
        const flick = 0.12 + 0.06 * Math.sin(t * 9 + tx * 20) * Math.sin(t * 3.3);
        const g = ctx.createRadialGradient(w * tx, h * 0.33, 0, w * tx, h * 0.33, w * 0.16);
        g.addColorStop(0, `rgba(255,170,80,${flick})`);
        g.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = g;
        ctx.fillRect(w * tx - w * 0.16, h * 0.33 - w * 0.16, w * 0.32, w * 0.32);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
