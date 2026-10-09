// Procedural 2.5D bust: torso + outfit, neck, head, face, hair, facial hair and accessories.
// Everything is drawn in "head units": origin at the head centre, 1 unit = half the head width.
// A light 3D effect comes from projecting each point by its depth: front features shift more than
// the outline when the head turns (yaw) or nods (pitch).

import { rgba } from './color.ts';
import type { Palette } from './palette.ts';
import type { AvatarProfile, FaceParams } from './types.ts';
import type { HairStyle } from '../../shared/types.ts';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

let F: FaceParams;
let S: FaceShape;

/** Per-character facial proportions so every avatar has its own face. */
export interface FaceShape {
  jaw: number;
  chin: number;
  eyeGap: number;
  eyeSize: number;
  nose: number;
  mouth: number;
  brow: number;
  lips: number;
  female: boolean;
}

export function shapeFor(prof: AvatarProfile): FaceShape {
  let h = 2166136261;
  for (let i = 0; i < prof.id.length; i++) h = Math.imul(h ^ prof.id.charCodeAt(i), 16777619);
  const r = (k: number) => (((h >>> (k * 3)) & 1023) / 1023 - 0.5) * 2;
  const female = prof.gender === 'f';
  return {
    jaw: (female ? 0.9 : 1.03) + r(1) * 0.05,
    chin: (female ? 0.82 : 1.0) + r(2) * 0.1,
    eyeGap: 1 + r(3) * 0.05,
    eyeSize: (female ? 1.07 : 1) + r(4) * 0.06,
    nose: 1 + r(5) * 0.08,
    mouth: (female ? 0.95 : 1) + r(6) * 0.08,
    brow: (female ? 0.75 : 1.05) + r(7) * 0.15,
    lips: (female ? 1.3 : 1) + r(8) * 0.15,
    female,
  };
}

function P(x: number, y: number, z = 0.8): Pt {
  return [x * (1 - 0.1 * Math.abs(F.yaw)) + F.yaw * z * 0.3, y + F.pitch * z * 0.2];
}

class Pen {
  readonly ctx: Ctx;
  constructor(ctx: Ctx) {
    this.ctx = ctx;
  }
  begin(): this {
    this.ctx.beginPath();
    return this;
  }
  m(x: number, y: number, z = 0.8): this {
    this.ctx.moveTo(...P(x, y, z));
    return this;
  }
  l(x: number, y: number, z = 0.8): this {
    this.ctx.lineTo(...P(x, y, z));
    return this;
  }
  q(cx: number, cy: number, x: number, y: number, z = 0.8): this {
    this.ctx.quadraticCurveTo(...P(cx, cy, z), ...P(x, y, z));
    return this;
  }
  b(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number, z = 0.8): this {
    this.ctx.bezierCurveTo(...P(c1x, c1y, z), ...P(c2x, c2y, z), ...P(x, y, z));
    return this;
  }
  close(): this {
    this.ctx.closePath();
    return this;
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot = 0, z = 0.8): this {
    const [px, py] = P(x, y, z);
    this.ctx.ellipse(px, py, rx * (1 - 0.1 * Math.abs(F.yaw)), ry, rot, 0, Math.PI * 2);
    return this;
  }
}

function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][], x1 = x, y1 = y): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Head outline

function headPath(pen: Pen): void {
  const j = F.jaw * 0.06;
  const jw = 0.84 * S.jaw;
  const cw = 0.37 * S.chin;
  pen
    .begin()
    .m(0, -1.2, 0.1)
    .b(0.6, -1.2, 1.0, -0.86, 1.0, -0.3, 0.02)
    .b(1.0, 0.12, 0.97, 0.42, jw, 0.7 + j * 0.5, 0.12)
    .b(jw * 0.83, 0.98 + j, cw, 1.22 + j, 0, 1.26 + j, 0.6)
    .b(-cw, 1.22 + j, -jw * 0.83, 0.98 + j, -jw, 0.7 + j * 0.5, 0.12)
    .b(-0.97, 0.42, -1.0, 0.12, -1.0, -0.3, 0.02)
    .b(-1.0, -0.86, -0.6, -1.2, 0, -1.2, 0.1)
    .close();
}

// ---------------------------------------------------------------------------------------------
// Torso, neck and outfits

function torsoPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(-0.5, 1.42);
  ctx.bezierCurveTo(-1.0, 1.6, -2.05, 1.66, -2.5, 2.2);
  ctx.bezierCurveTo(-2.8, 2.55, -2.95, 3.4, -3.1, 5.4);
  ctx.lineTo(3.1, 5.4);
  ctx.bezierCurveTo(2.95, 3.4, 2.8, 2.55, 2.5, 2.2);
  ctx.bezierCurveTo(2.05, 1.66, 1.0, 1.6, 0.5, 1.42);
  ctx.closePath();
}

function shade(ctx: Ctx, base: string, pal: Palette): void {
  // Key light from the upper left, rim from the brand colour on the right.
  ctx.fillStyle = base;
  ctx.fill();
  ctx.fillStyle = linear(ctx, -3, 1.5, 3, 4, [
    [0, 'rgba(255,255,255,0.18)'],
    [0.45, 'rgba(255,255,255,0)'],
    [1, 'rgba(0,0,0,0.38)'],
  ]);
  ctx.fill();
  ctx.fillStyle = linear(ctx, 0, 1.5, 0, 5, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.45)'],
  ]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgba(pal.rim, 0.55);
  ctx.lineWidth = 0.08;
  ctx.shadowColor = pal.rim;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();
}

function drawTorso(ctx: Ctx, prof: AvatarProfile, pal: Palette): void {
  const outfit = prof.look.outfit;
  const breathe = F.breath * 0.028;
  ctx.save();
  ctx.translate(F.yaw * 0.07, breathe);

  const isLight = outfit === 'thobe' || outfit === 'labcoat' || outfit === 'robe';
  const base =
    outfit === 'suit'
      ? '#161a24'
      : outfit === 'jacket'
        ? pal.primaryDark
        : outfit === 'tank'
          ? pal.skinMid
          : isLight
            ? pal.cloth
            : pal.primary;

  torsoPath(ctx);
  shade(ctx, base, pal);

  ctx.save();
  torsoPath(ctx);
  ctx.clip();
  switch (outfit) {
    case 'jersey': {
      ctx.fillStyle = rgba(pal.secondary, 0.12);
      for (let x = -3; x < 3; x += 0.36) ctx.fillRect(x, 1.4, 0.07, 4);
      // Sleeve trims
      ctx.strokeStyle = pal.secondary;
      ctx.lineWidth = 0.11;
      ctx.beginPath();
      ctx.moveTo(-2.62, 2.45);
      ctx.quadraticCurveTo(-2.1, 2.2, -1.92, 1.72);
      ctx.moveTo(2.62, 2.45);
      ctx.quadraticCurveTo(2.1, 2.2, 1.92, 1.72);
      ctx.stroke();
      // Crest
      ctx.fillStyle = pal.secondary;
      ctx.beginPath();
      ctx.moveTo(0.85, 2.35);
      ctx.lineTo(1.25, 2.35);
      ctx.lineTo(1.25, 2.6);
      ctx.quadraticCurveTo(1.05, 2.85, 1.05, 2.85);
      ctx.quadraticCurveTo(0.85, 2.7, 0.85, 2.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgba(pal.primary, 0.85);
      ctx.beginPath();
      ctx.arc(1.05, 2.56, 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'tee':
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(-1.2, 2.9, 0.5, 0.9, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'hoodie': {
      ctx.strokeStyle = rgba('#ffffff', 0.75);
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(-0.24, 1.7);
      ctx.quadraticCurveTo(-0.28, 2.2, -0.22, 2.75);
      ctx.moveTo(0.24, 1.7);
      ctx.quadraticCurveTo(0.3, 2.2, 0.26, 2.7);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-0.25, 2.72, 0.06, 0.14);
      ctx.fillRect(0.23, 2.67, 0.06, 0.14);
      // Kangaroo pocket seam
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(-1.2, 4.2);
      ctx.lineTo(-0.9, 3.5);
      ctx.lineTo(0.9, 3.5);
      ctx.lineTo(1.2, 4.2);
      ctx.stroke();
      break;
    }
    case 'suit': {
      // Shirt
      ctx.fillStyle = pal.cloth;
      ctx.beginPath();
      ctx.moveTo(-0.5, 1.42);
      ctx.lineTo(0, 2.7);
      ctx.lineTo(0.5, 1.42);
      ctx.closePath();
      ctx.fill();
      // Tie
      ctx.fillStyle = pal.primary;
      ctx.beginPath();
      ctx.moveTo(-0.1, 1.6);
      ctx.lineTo(0.1, 1.6);
      ctx.lineTo(0.07, 1.78);
      ctx.lineTo(0.16, 2.6);
      ctx.lineTo(0, 2.78);
      ctx.lineTo(-0.16, 2.6);
      ctx.lineTo(-0.07, 1.78);
      ctx.closePath();
      ctx.fill();
      // Lapels
      ctx.fillStyle = '#1f2431';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.5, 1.42);
        ctx.lineTo(s * 0.06, 2.75);
        ctx.lineTo(s * 0.62, 2.35);
        ctx.lineTo(s * 0.5, 2.05);
        ctx.lineTo(s * 0.85, 1.8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(pal.rim, 0.35);
        ctx.lineWidth = 0.025;
        ctx.stroke();
      }
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(-1.35, 2.55);
      ctx.lineTo(-1.0, 2.5);
      ctx.lineTo(-1.08, 2.65);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'jacket': {
      ctx.fillStyle = pal.secondary === '#ffffff' ? pal.cloth : pal.secondary;
      ctx.beginPath();
      ctx.moveTo(-0.55, 1.42);
      ctx.lineTo(-0.62, 5.4);
      ctx.lineTo(0.62, 5.4);
      ctx.lineTo(0.55, 1.42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(-0.62, 1.42, 0.12, 4);
      ctx.fillRect(0.5, 1.42, 0.12, 4);
      ctx.strokeStyle = rgba(pal.rim, 0.4);
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(-0.62, 1.6);
      ctx.lineTo(-0.9, 2.6);
      ctx.moveTo(0.62, 1.6);
      ctx.lineTo(0.9, 2.6);
      ctx.stroke();
      break;
    }
    case 'robe': {
      ctx.fillStyle = pal.primary;
      ctx.beginPath();
      ctx.moveTo(-2.6, 2.1);
      ctx.quadraticCurveTo(-1.0, 1.7, 0.2, 2.2);
      ctx.lineTo(2.9, 5.4);
      ctx.lineTo(1.6, 5.4);
      ctx.lineTo(-0.2, 2.75);
      ctx.quadraticCurveTo(-1.4, 2.35, -2.75, 2.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.gold;
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 0.04;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0.6 + i * 0.35, 2.6 + i * 0.3);
        ctx.quadraticCurveTo(1.2 + i * 0.3, 3.6, 1.0 + i * 0.4, 5.3);
        ctx.stroke();
      }
      break;
    }
    case 'thobe': {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(0, 1.62);
      ctx.lineTo(0, 3.0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0.07, 1.85 + i * 0.3, 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.ellipse(1.6, 3.4, 0.6, 1.6, -0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'labcoat': {
      ctx.fillStyle = pal.primary;
      ctx.beginPath();
      ctx.moveTo(-0.5, 1.42);
      ctx.lineTo(-0.35, 5.4);
      ctx.lineTo(0.35, 5.4);
      ctx.lineTo(0.5, 1.42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.clothShade;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.5, 1.42);
        ctx.lineTo(s * 0.38, 3.0);
        ctx.lineTo(s * 0.85, 2.3);
        ctx.lineTo(s * 0.95, 1.75);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = pal.accent;
      ctx.fillRect(-1.45, 2.55, 0.05, 0.4);
      ctx.fillRect(-1.33, 2.6, 0.05, 0.35);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.03;
      ctx.strokeRect(-1.6, 2.8, 0.55, 0.45);
      break;
    }
    case 'tracksuit': {
      ctx.strokeStyle = pal.secondary;
      ctx.lineWidth = 0.09;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(s * (1.0 + i * 0.16), 1.66 + i * 0.02);
          ctx.quadraticCurveTo(s * (2.2 + i * 0.12), 1.85, s * (2.75 + i * 0.12), 3.4);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(0, 1.55);
      ctx.lineTo(0, 5.4);
      ctx.stroke();
      ctx.fillStyle = '#dddddd';
      ctx.fillRect(-0.04, 1.95, 0.08, 0.16);
      break;
    }
    case 'tank': {
      ctx.fillStyle = pal.primary;
      ctx.beginPath();
      ctx.moveTo(-1.05, 5.4);
      ctx.lineTo(-1.2, 2.6);
      ctx.quadraticCurveTo(-1.0, 2.0, -0.82, 1.62);
      ctx.lineTo(-0.58, 1.6);
      ctx.quadraticCurveTo(-0.45, 2.2, 0, 2.3);
      ctx.quadraticCurveTo(0.45, 2.2, 0.58, 1.6);
      ctx.lineTo(0.82, 1.62);
      ctx.quadraticCurveTo(1.0, 2.0, 1.2, 2.6);
      ctx.lineTo(1.05, 5.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(-1.75, 2.6, 0.5, 0.35, 0.4, 0, Math.PI * 2);
      ctx.ellipse(1.75, 2.6, 0.5, 0.35, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();

  drawNeck(ctx, pal);

  // Collars sit on top of the neck base.
  switch (outfit) {
    case 'jersey':
      ctx.strokeStyle = pal.secondary;
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(-0.52, 1.46);
      ctx.lineTo(0, 1.95);
      ctx.lineTo(0.52, 1.46);
      ctx.stroke();
      break;
    case 'tee':
    case 'tracksuit':
      ctx.strokeStyle = outfit === 'tracksuit' ? pal.primaryLight : 'rgba(0,0,0,0.25)';
      ctx.lineWidth = outfit === 'tracksuit' ? 0.16 : 0.08;
      ctx.beginPath();
      ctx.ellipse(0, 1.48, 0.52, outfit === 'tracksuit' ? 0.12 : 0.16, 0, 0.05, Math.PI - 0.05);
      ctx.stroke();
      break;
    case 'hoodie':
      ctx.fillStyle = pal.primaryDark;
      ctx.beginPath();
      ctx.moveTo(-1.1, 1.62);
      ctx.quadraticCurveTo(-0.9, 1.25, -0.48, 1.3);
      ctx.quadraticCurveTo(0, 1.95, 0.48, 1.3);
      ctx.quadraticCurveTo(0.9, 1.25, 1.1, 1.62);
      ctx.quadraticCurveTo(0, 2.1, -1.1, 1.62);
      ctx.fill();
      break;
    case 'thobe':
      ctx.strokeStyle = pal.clothShade;
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.ellipse(0, 1.5, 0.5, 0.13, 0, 0.1, Math.PI - 0.1);
      ctx.stroke();
      break;
    case 'suit':
    case 'labcoat':
      ctx.fillStyle = pal.cloth;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.46, 1.32);
        ctx.lineTo(s * 0.08, 1.66);
        ctx.lineTo(s * 0.52, 1.72);
        ctx.closePath();
        ctx.fill();
      }
      break;
    default:
      break;
  }
  ctx.restore();
}

function drawNeck(ctx: Ctx, pal: Palette): void {
  ctx.save();
  ctx.translate(-F.yaw * 0.02, 0);
  ctx.beginPath();
  ctx.moveTo(-0.43, 0.7);
  ctx.quadraticCurveTo(-0.4, 1.25, -0.52, 1.5);
  ctx.quadraticCurveTo(0, 1.68, 0.52, 1.5);
  ctx.quadraticCurveTo(0.4, 1.25, 0.43, 0.7);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 0.7, 0, 1.6, [
    [0, pal.skinDeep],
    [0.45, pal.skinLo],
    [1, pal.skinMid],
  ]);
  ctx.fill();
  ctx.fillStyle = linear(ctx, -0.5, 0, 0.5, 0, [
    [0, 'rgba(255,255,255,0.1)'],
    [0.6, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.25)'],
  ]);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Ears

function drawEars(ctx: Ctx, pal: Palette): void {
  const pen = new Pen(ctx);
  for (const s of [-1, 1]) {
    const exposure = 1 - Math.max(0, s * F.yaw) * 0.9;
    if (exposure < 0.15) continue;
    pen.begin().ellipse(s * 0.98 - F.yaw * 0.08, 0.06, 0.15 * exposure, 0.25, s * 0.15, -0.6);
    ctx.fillStyle = pal.skinMid;
    ctx.fill();
    pen.begin().ellipse(s * 0.99 - F.yaw * 0.08, 0.07, 0.07 * exposure, 0.15, s * 0.15, -0.6);
    ctx.fillStyle = pal.skinLo;
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------
// Skin, eyes, brows, nose, mouth

function drawHeadSkin(ctx: Ctx, pal: Palette): void {
  const pen = new Pen(ctx);
  headPath(pen);
  const [lx, ly] = P(-0.4, -0.5, 0.6);
  ctx.fillStyle = radial(ctx, lx, ly, 0.05, 2.1, [
    [0, pal.skinHi],
    [0.45, pal.skin],
    [0.8, pal.skinMid],
    [1, pal.skinLo],
  ]);
  ctx.fill();

  ctx.save();
  headPath(pen);
  ctx.clip();
  // Jaw and chin shadow, cheek contour
  ctx.fillStyle = linear(ctx, 0, 0.3, 0, 1.4, [
    [0, 'rgba(0,0,0,0)'],
    [1, rgba(pal.skinDeep, 0.35)],
  ]);
  ctx.fillRect(-1.2, -1.3, 2.4, 2.8);
  for (const s of [-1, 1]) {
    const [cx, cy] = P(s * 0.62, 0.42, 0.5);
    ctx.fillStyle = radial(ctx, cx, cy, 0, 0.45, [
      [0, rgba(pal.skinDeep, s > 0 ? 0.18 : 0.08)],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);
  }
  // Eye sockets
  for (const s of [-1, 1]) {
    const [ex, ey] = P(s * 0.36, -0.06, 0.65);
    ctx.fillStyle = radial(ctx, ex, ey, 0.02, 0.3, [
      [0, rgba(pal.skinDeep, 0.22)],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.fillRect(ex - 0.35, ey - 0.35, 0.7, 0.7);
  }
  // A touch of warmth on the cheeks keeps the hologram from looking lifeless.
  for (const s of [-1, 1]) {
    const [cx, cy] = P(s * 0.52, 0.3, 0.7);
    ctx.fillStyle = radial(ctx, cx, cy, 0, 0.3, [
      [0, 'rgba(255,170,190,0.12)'],
      [1, 'rgba(255,170,190,0)'],
    ]);
    ctx.fillRect(cx - 0.35, cy - 0.35, 0.7, 0.7);
  }
  // Smile cheeks lift
  if (F.smile > 0.2) {
    for (const s of [-1, 1]) {
      const [cx, cy] = P(s * 0.5, 0.36, 0.7);
      ctx.fillStyle = radial(ctx, cx, cy, 0, 0.22, [
        [0, rgba(pal.skinHi, 0.35 * F.smile)],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(cx - 0.3, cy - 0.3, 0.6, 0.6);
    }
  }
  // Inner rim light (fresnel)
  headPath(pen);
  ctx.strokeStyle = rgba(pal.rim, 0.65);
  ctx.lineWidth = 0.09;
  ctx.shadowColor = pal.rim;
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.restore();
}

function drawEyes(ctx: Ctx, pal: Palette): void {
  const pen = new Pen(ctx);
  const open = Math.max(0, Math.min(1, F.eyeOpen));
  for (const s of [-1, 1]) {
    const far = Math.max(0, s * F.yaw);
    const w = 0.185 * S.eyeSize * (1 - far * 0.28);
    const cx = s * 0.37 * S.eyeGap;
    const cy = -0.02 + F.squint * 0.012;
    const upper = (0.138 * S.eyeSize - F.squint * 0.03) * open;
    const lower = 0.08 - F.squint * 0.028;

    if (open < 0.12) {
      // Closed: a soft curved lash line.
      pen.begin().m(cx - w, cy).q(cx, cy + 0.04, cx + w, cy, 0.75);
      ctx.strokeStyle = pal.skinDeep;
      ctx.lineWidth = 0.028;
      ctx.lineCap = 'round';
      ctx.stroke();
      continue;
    }

    const eyeShape = () => {
      pen.begin().m(cx - w, cy, 0.75);
      pen.b(cx - w * 0.55, cy - upper * 1.25, cx + w * 0.45, cy - upper * 1.3, cx + w, cy - 0.005, 0.75);
      pen.b(cx + w * 0.5, cy + lower, cx - w * 0.5, cy + lower, cx - w, cy, 0.75);
      pen.close();
    };

    eyeShape();
    ctx.fillStyle = pal.sclera;
    ctx.fill();
    ctx.save();
    eyeShape();
    ctx.clip();
    const [ix, iy] = P(cx + F.gazeX * 0.075, cy + F.gazeY * 0.04 - 0.005, 0.8);
    const ir = 0.09 * S.eyeSize;
    ctx.fillStyle = radial(ctx, ix, iy, 0, ir, [
      [0, pal.irisRing],
      [0.55, pal.iris],
      [1, '#0b1220'],
    ]);
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#05070c';
    ctx.beginPath();
    ctx.arc(ix, iy, 0.038, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(ix - 0.028, iy - 0.03, 0.019, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(ix + 0.03, iy + 0.025, 0.009, 0, Math.PI * 2);
    ctx.fill();
    // Upper lid shadow on the eyeball
    ctx.fillStyle = linear(ctx, 0, cy - upper * 1.25, 0, cy - upper * 0.2, [
      [0, rgba(pal.skinDeep, 0.35)],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.fillRect(cx - 0.3, cy - 0.3, 0.6, 0.35);
    ctx.restore();

    // Lash line and crease
    pen.begin().m(cx - w * 1.04, cy + 0.004, 0.75);
    pen.b(cx - w * 0.55, cy - upper * 1.28, cx + w * 0.45, cy - upper * 1.33, cx + w * 1.06, cy - 0.01, 0.75);
    ctx.strokeStyle = '#0e1626';
    ctx.lineWidth = S.female ? 0.036 : 0.03;
    ctx.lineCap = 'round';
    ctx.stroke();
    if (S.female) {
      for (let k = 0; k < 3; k++) {
        const lx = cx + s * w * (0.62 + k * 0.17);
        const ly = cy - upper * (1.05 - k * 0.35);
        pen.begin().m(lx, ly, 0.75).q(lx + s * 0.03, ly - 0.03, lx + s * 0.06, ly - 0.035, 0.75);
        ctx.lineWidth = 0.014;
        ctx.stroke();
      }
    }
    pen.begin().m(cx - w * 0.85, cy - upper * 1.15 - 0.045, 0.75);
    pen.q(cx, cy - upper * 1.75 - 0.05, cx + w * 0.9, cy - upper * 1.0 - 0.04, 0.75);
    ctx.strokeStyle = rgba(pal.skinDeep, 0.35);
    ctx.lineWidth = 0.014;
    ctx.stroke();
    pen.begin().m(cx - w * 0.7, cy + lower * 0.85, 0.75).q(cx, cy + lower * 1.25, cx + w * 0.75, cy + lower * 0.7, 0.75);
    ctx.strokeStyle = rgba(pal.skinDeep, 0.22);
    ctx.lineWidth = 0.012;
    ctx.stroke();
  }
}

function drawBrows(ctx: Ctx, pal: Palette, thick: number): void {
  const pen = new Pen(ctx);
  for (const s of [-1, 1]) {
    const raise = F.browRaise * 0.09 + (s < 0 ? F.browAsym : -F.browAsym) * 0.05;
    const furrow = F.browFurrow;
    thick *= S.brow;
    const inX = s * (0.13 + 0.03 * (1 - furrow)) * S.eyeGap;
    const inY = -0.325 - raise * 0.8 + furrow * 0.06;
    const midX = s * 0.37 * S.eyeGap;
    const midY = -0.41 - raise;
    const outX = s * 0.6 * S.eyeGap;
    const outY = -0.31 - raise * 0.5;
    pen.begin().m(inX, inY + thick * 0.5, 0.75);
    pen.q(midX, midY - thick * 0.2, outX, outY, 0.75);
    pen.q(midX, midY + thick * 0.55, inX, inY - thick * 0.35, 0.75);
    pen.close();
    ctx.fillStyle = pal.hair === pal.hairHi ? pal.skinDeep : pal.hair;
    ctx.fill();
  }
}

function drawNose(ctx: Ctx, pal: Palette): void {
  const pen = new Pen(ctx);
  // Side shadow away from the key light
  pen.begin().m(0.05, -0.05, 0.9).q(0.13, 0.18 * S.nose, 0.13, 0.34 * S.nose, 0.95).q(0.06, 0.4 * S.nose, 0.0, 0.4 * S.nose, 1);
  ctx.strokeStyle = rgba(pal.skinDeep, 0.22);
  ctx.lineWidth = 0.026;
  ctx.lineCap = 'round';
  ctx.stroke();
  const [hx, hy] = P(-0.02, 0.28, 1);
  ctx.fillStyle = radial(ctx, hx, hy, 0, 0.09, [
    [0, rgba(pal.skinHi, 0.85)],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(hx - 0.1, hy - 0.1, 0.2, 0.2);
  for (const s of [-1, 1]) {
    pen.begin().ellipse(s * 0.07, 0.385 * S.nose, 0.026, 0.013, s * 0.4, 0.95);
    ctx.fillStyle = rgba(pal.skinDeep, 0.45);
    ctx.fill();
  }
  // Under-eye softness and smile lines give the face structure.
  for (const s of [-1, 1]) {
    pen.begin().m(s * 0.22, 0.47, 0.8).q(s * 0.33, 0.6, s * 0.36, 0.78, 0.8);
    ctx.strokeStyle = rgba(pal.skinDeep, Math.max(0, F.smile - 0.3) * 0.22);
    ctx.lineWidth = 0.018;
    ctx.stroke();
  }
  pen.begin().m(-0.15, 0.36, 0.9).q(0, 0.46, 0.15, 0.36, 0.9);
  ctx.strokeStyle = rgba(pal.skinDeep, 0.18);
  ctx.lineWidth = 0.02;
  ctx.stroke();
}

function drawMouth(ctx: Ctx, pal: Palette): void {
  const pen = new Pen(ctx);
  const z = 0.85;
  const smile = F.smile;
  const cy = 0.66 + F.jaw * 0.05;
  const w = 0.24 * S.mouth * (1 + F.wide * 0.22 - F.round * 0.32 + Math.max(0, smile) * 0.12);
  const lt = S.lips;
  const cornerY = cy - smile * 0.07;
  const open = Math.max(0, F.jaw * 0.18 + F.round * 0.02);
  const upperIn = cy - open * 0.32;
  const lowerIn = cy + open;

  if (open > 0.012) {
    const inner = () => {
      pen.begin().m(-w, cornerY, z);
      pen.q(-w * 0.2, upperIn - 0.01, 0, upperIn, z).q(w * 0.2, upperIn - 0.01, w, cornerY, z);
      pen.q(w * 0.25, lowerIn + 0.02, 0, lowerIn, z).q(-w * 0.25, lowerIn + 0.02, -w, cornerY, z);
      pen.close();
    };
    inner();
    ctx.fillStyle = pal.mouth;
    ctx.fill();
    ctx.save();
    inner();
    ctx.clip();
    if (F.teeth > 0.02) {
      const [tx, ty] = P(-w, upperIn - 0.02, z);
      ctx.fillStyle = pal.teeth;
      ctx.fillRect(tx, ty, w * 2.1, 0.035 + open * 0.35 * F.teeth);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(tx, ty + 0.03 + open * 0.35 * F.teeth, w * 2.1, 0.01);
    }
    pen.begin().ellipse(0, lowerIn + 0.01, w * 0.6, Math.max(0.02, open * 0.38), 0, z);
    ctx.fillStyle = 'rgba(190,80,110,0.55)';
    ctx.fill();
    ctx.restore();
  }

  // Upper lip
  pen.begin().m(-w * 1.04, cornerY, z);
  pen.b(-w * 0.6, cy - 0.06 * lt, -w * 0.22, cy - 0.075 * lt, 0, cy - 0.052 * lt, z);
  pen.b(w * 0.22, cy - 0.075 * lt, w * 0.6, cy - 0.06 * lt, w * 1.04, cornerY, z);
  if (open > 0.012) pen.q(w * 0.2, upperIn - 0.01, 0, upperIn, z).q(-w * 0.2, upperIn - 0.01, -w * 1.04, cornerY, z);
  else pen.q(0, cy + smile * 0.03 + 0.004, -w * 1.04, cornerY, z);
  pen.close();
  ctx.fillStyle = pal.lipDark;
  ctx.fill();

  // Lower lip
  const lo = open > 0.012 ? lowerIn : cy + smile * 0.03 + 0.004;
  pen.begin().m(-w, cornerY, z);
  if (open > 0.012) pen.q(-w * 0.25, lo + 0.02, 0, lo, z).q(w * 0.25, lo + 0.02, w, cornerY, z);
  else pen.q(0, lo, w, cornerY, z);
  pen.q(w * 0.55, lo + 0.08 * lt, 0, lo + 0.085 * lt, z).q(-w * 0.55, lo + 0.08 * lt, -w, cornerY, z);
  pen.close();
  ctx.fillStyle = pal.lip;
  ctx.fill();
  const [gx, gy] = P(-w * 0.15, lo + 0.035, z);
  ctx.fillStyle = radial(ctx, gx, gy, 0, w * 0.5, [
    [0, 'rgba(255,255,255,0.35)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(gx - w, gy - w, w * 2, w * 2);

  // Mouth line and corners
  if (open <= 0.012) {
    pen.begin().m(-w * 1.02, cornerY, z).q(0, cy + smile * 0.03 + 0.006, w * 1.02, cornerY, z);
    ctx.strokeStyle = rgba(pal.mouth, 0.85);
    ctx.lineWidth = 0.016;
    ctx.stroke();
  }
  if (smile > 0.25) {
    for (const s of [-1, 1]) {
      pen.begin().m(s * w * 1.02, cornerY, z).q(s * (w + 0.05), cornerY - 0.02, s * (w + 0.06), cornerY - 0.06, z);
      ctx.strokeStyle = rgba(pal.skinDeep, 0.3 * smile);
      ctx.lineWidth = 0.014;
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Facial hair

function beardPath(pen: Pen, depth: number): void {
  const j = F.jaw * 0.06;
  pen.begin().m(-0.98, -0.08, 0.05);
  pen.b(-0.99, 0.35, -0.92, 0.55, -0.84, 0.72 + j * 0.5, 0.12);
  pen.b(-0.7, 1.0 + j + depth * 0.4, -0.37, 1.24 + j + depth, 0, 1.28 + j + depth, 0.6);
  pen.b(0.37, 1.24 + j + depth, 0.7, 1.0 + j + depth * 0.4, 0.84, 0.72 + j * 0.5, 0.12);
  pen.b(0.92, 0.55, 0.99, 0.35, 0.98, -0.08, 0.05);
  pen.l(0.86, -0.08, 0.1);
  pen.b(0.84, 0.3, 0.6, 0.5, 0.38, 0.62, 0.8);
  pen.q(0.2, 0.86 + j, 0, 0.86 + j, 0.85);
  pen.q(-0.2, 0.86 + j, -0.38, 0.62, 0.85);
  pen.b(-0.6, 0.5, -0.84, 0.3, -0.86, -0.08, 0.1);
  pen.close();
}

function mustachePath(pen: Pen, thick: number): void {
  const cy = 0.6 + F.jaw * 0.02;
  pen.begin().m(-0.31, cy + 0.04, 0.85);
  pen.q(-0.2, cy - 0.06 - thick * 0.4, 0, cy - 0.07 - thick * 0.3, 0.9);
  pen.q(0.2, cy - 0.06 - thick * 0.4, 0.31, cy + 0.04, 0.85);
  pen.q(0.15, cy + 0.0, 0, cy + 0.01, 0.9);
  pen.q(-0.15, cy + 0.0, -0.31, cy + 0.04, 0.85);
  pen.close();
}

function drawFacialHairUnder(ctx: Ctx, prof: AvatarProfile, pal: Palette): void {
  const style = prof.look.facial;
  if (style === 'none' || style === 'mustache') return;
  const pen = new Pen(ctx);
  if (style === 'goatee') {
    const j = F.jaw * 0.06;
    pen.begin().m(-0.24, 0.84 + j, 0.8).q(-0.28, 1.2 + j, 0, 1.3 + j, 0.7).q(0.28, 1.2 + j, 0.24, 0.84 + j, 0.8).q(0, 0.95 + j, -0.24, 0.84 + j, 0.8).close();
    ctx.fillStyle = rgba(pal.hair, 0.9);
    ctx.fill();
    return;
  }
  const depth = style === 'full' ? 0.32 : style === 'beard' ? 0.07 : 0;
  beardPath(pen, depth);
  if (style === 'stubble') {
    ctx.fillStyle = rgba(pal.hair, 0.13);
    ctx.fill();
    ctx.save();
    beardPath(pen, 0);
    ctx.clip();
    ctx.fillStyle = rgba(pal.hair, 0.35);
    for (let i = 0; i < 140; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const rr = 0.35 + ((i * 53) % 100) / 100 * 0.95;
      const [x, y] = P(Math.cos(a) * rr * 0.95, 0.55 + Math.sin(a) * rr * 0.7, 0.6);
      ctx.fillRect(x, y, 0.012, 0.012);
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = rgba(pal.hair, 0.88);
  ctx.fill();
  ctx.save();
  beardPath(pen, depth);
  ctx.clip();
  ctx.strokeStyle = rgba(pal.hairHi, 0.25);
  ctx.lineWidth = 0.012;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 0.12, 0.3);
    ctx.quadraticCurveTo(i * 0.11, 0.9, i * 0.09, 1.6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMustache(ctx: Ctx, prof: AvatarProfile, pal: Palette): void {
  const style = prof.look.facial;
  if (style === 'none') return;
  const pen = new Pen(ctx);
  const thick = style === 'full' ? 0.06 : style === 'mustache' ? 0.05 : 0.02;
  mustachePath(pen, thick);
  ctx.fillStyle = rgba(pal.hair, style === 'stubble' ? 0.25 : 0.92);
  ctx.fill();
}

// ---------------------------------------------------------------------------------------------
// Hair

function fillHair(ctx: Ctx, pal: Palette, alpha = 1): void {
  const g = ctx.createLinearGradient(-1, -1.6, 1, 0.4);
  g.addColorStop(0, rgba(pal.hairHi, alpha));
  g.addColorStop(0.55, rgba(pal.hair, alpha));
  g.addColorStop(1, rgba(pal.hair, alpha));
  ctx.fillStyle = g;
  ctx.fill();
  // Depth: shadow toward the ends, a soft sheen across the crown.
  const d = ctx.createLinearGradient(0, -1.2, 0, 2.3);
  d.addColorStop(0, 'rgba(0,0,0,0)');
  d.addColorStop(0.5, `rgba(0,0,0,${0.12 * alpha})`);
  d.addColorStop(1, `rgba(0,0,0,${0.4 * alpha})`);
  ctx.fillStyle = d;
  ctx.fill();
  const sh = ctx.createRadialGradient(-0.35, -1.05, 0, -0.35, -1.05, 0.75);
  sh.addColorStop(0, `rgba(255,255,255,${0.16 * alpha})`);
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fill();
}

function strands(ctx: Ctx, pal: Palette, from: Pt[], to: Pt[], alpha = 0.18): void {
  ctx.strokeStyle = rgba(pal.hairHi, alpha);
  ctx.lineWidth = 0.014;
  for (let i = 0; i < from.length; i++) {
    ctx.beginPath();
    ctx.moveTo(...P(from[i][0], from[i][1], 0.3));
    ctx.quadraticCurveTo(...P((from[i][0] + to[i][0]) / 2 + 0.08, (from[i][1] + to[i][1]) / 2 - 0.05, 0.3), ...P(to[i][0], to[i][1], 0.3));
    ctx.stroke();
  }
}

/** Generic cap of hair over the skull with a configurable hairline/fringe. */
function capPath(pen: Pen, top: number, width: number, fringe: 'part' | 'straight' | 'high' | 'wavy' | 'curly' | 'spiky', sideburn = -0.05): void {
  const zt = 0.15;
  pen.begin().m(-width, sideburn, 0.05);
  if (fringe === 'spiky') {
    pen.l(-width - 0.04, -0.6, zt).l(-0.98, -1.05, zt).l(-0.78, -1.15, zt).l(-0.72, -1.5, zt).l(-0.45, -1.3, zt).l(-0.3, -1.62, zt).l(-0.08, -1.36, zt).l(0.12, -1.66, zt).l(0.28, -1.36, zt).l(0.5, -1.56, zt).l(0.62, -1.24, zt).l(0.88, -1.36, zt).l(0.9, -1.04, zt).l(width + 0.04, -0.6, zt);
  } else if (fringe === 'curly') {
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (i / steps) * Math.PI;
      const x = Math.cos(a) * (width + 0.05);
      const y = -0.35 + Math.sin(a) * (Math.abs(top) - 0.3);
      const x2 = Math.cos(a + Math.PI / steps / 2) * (width + 0.2);
      const y2 = -0.35 + Math.sin(a + Math.PI / steps / 2) * (Math.abs(top) - 0.12);
      if (i === 0) pen.l(x, y, zt);
      else pen.q(x2, y2, x, y, zt);
    }
  } else {
    pen.b(-width - 0.08, -0.85, -0.68, top - 0.02, 0, top, zt);
    pen.b(0.68, top - 0.02, width + 0.08, -0.85, width, sideburn, 0.05);
  }
  pen.l(width - 0.12, sideburn, 0.1);
  switch (fringe) {
    case 'straight':
      pen.b(width - 0.1, -0.35, 0.8, -0.48, 0.5, -0.5, 0.6).q(0, -0.47, -0.5, -0.5, 0.7).b(-0.8, -0.48, -width + 0.1, -0.35, -width + 0.12, sideburn, 0.1);
      break;
    case 'high':
      pen.b(width - 0.08, -0.5, 0.65, -0.78, 0, -0.76, 0.6).b(-0.65, -0.78, -width + 0.08, -0.5, -width + 0.12, sideburn, 0.1);
      break;
    case 'wavy':
      pen.b(width - 0.08, -0.45, 0.75, -0.55, 0.55, -0.58, 0.6).q(0.42, -0.72, 0.25, -0.6, 0.7).q(0.1, -0.7, -0.08, -0.6, 0.7).q(-0.28, -0.74, -0.45, -0.6, 0.7).b(-0.8, -0.56, -width + 0.08, -0.45, -width + 0.12, sideburn, 0.1);
      break;
    case 'curly':
      pen.b(width - 0.1, -0.45, 0.72, -0.6, 0.5, -0.6, 0.6).q(0.38, -0.72, 0.22, -0.62, 0.7).q(0.08, -0.74, -0.08, -0.62, 0.7).q(-0.24, -0.74, -0.4, -0.62, 0.7).q(-0.58, -0.72, -0.68, -0.58, 0.7).b(-0.85, -0.5, -width + 0.1, -0.4, -width + 0.12, sideburn, 0.1);
      break;
    case 'spiky':
    case 'part':
    default:
      pen.b(width - 0.1, -0.42, 0.62, -0.66, 0.2, -0.62, 0.65).q(-0.05, -0.62, -0.22, -0.76, 0.7).b(-0.55, -0.62, -width + 0.1, -0.45, -width + 0.12, sideburn, 0.1);
      break;
  }
  pen.close();
}

function drawHairBack(ctx: Ctx, prof: AvatarProfile, pal: Palette): void {
  const style = prof.look.hair;
  const acc = prof.look.accessory;
  if (acc === 'ghutra' || acc === 'hijab' || acc === 'turban') return;
  const pen = new Pen(ctx);
  switch (style) {
    case 'long':
    case 'wavy': {
      const len = style === 'long' ? 2.25 : 0.95;
      const wide = style === 'long' ? 1.38 : 1.2;
      pen.begin().m(-1.0, -0.5, 0).b(-1.25, 0.1, -1.3, len * 0.6, -wide, len, 0);
      pen.q(0, len + 0.3, wide, len, 0).b(1.3, len * 0.6, 1.25, 0.1, 1.0, -0.5, 0);
      pen.b(0.9, -1.4, -0.9, -1.4, -1.0, -0.5, 0.1).close();
      fillHair(ctx, pal);
      if (style === 'long') {
        strands(ctx, pal, [[-1.1, 0], [-1.2, 0.5], [1.1, 0], [1.2, 0.5]], [[-1.3, 2.1], [-1.1, 2.2], [1.3, 2.1], [1.1, 2.2]]);
      }
      break;
    }
    case 'bob':
      pen.begin().m(-1.05, -0.5, 0).b(-1.3, 0.2, -1.28, 0.8, -1.12, 1.02, 0).q(-0.9, 1.12, -0.75, 1.0, 0.1);
      pen.l(0.75, 1.0, 0.1).q(0.9, 1.12, 1.12, 1.02, 0).b(1.28, 0.8, 1.3, 0.2, 1.05, -0.5, 0);
      pen.b(0.95, -1.42, -0.95, -1.42, -1.05, -0.5, 0.1).close();
      fillHair(ctx, pal);
      break;
    case 'afro': {
      ctx.beginPath();
      const [ax, ay] = P(0, -0.5, 0.05);
      const bumps = 22;
      for (let i = 0; i <= bumps; i++) {
        const a = (i / bumps) * Math.PI * 2;
        const r = 1.55 + Math.sin(i * 2.7) * 0.05;
        const x = ax + Math.cos(a) * r;
        const y = ay + Math.sin(a) * r * 0.95;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const am = ((i - 0.5) / bumps) * Math.PI * 2;
          ctx.quadraticCurveTo(ax + Math.cos(am) * (r + 0.12), ay + Math.sin(am) * (r + 0.12) * 0.95, x, y);
        }
      }
      ctx.closePath();
      fillHair(ctx, pal);
      break;
    }
    case 'ponytail':
      pen.begin().m(0.55, -0.95, 0).b(1.35, -0.85, 1.45, 0.3, 1.25, 1.35, -0.2).q(1.12, 1.55, 1.05, 1.3, -0.2).b(1.15, 0.4, 1.0, -0.3, 0.5, -0.65, 0).close();
      fillHair(ctx, pal);
      pen.begin().ellipse(0.75, -0.82, 0.12, 0.08, 0.5, 0);
      ctx.fillStyle = pal.accent;
      ctx.fill();
      break;
    case 'bun':
      pen.begin().ellipse(0, -1.38, 0.38, 0.32, 0, 0);
      fillHair(ctx, pal);
      break;
    case 'locs':
    case 'braids': {
      const len = style === 'locs' ? 1.5 : 1.0;
      ctx.lineCap = 'round';
      for (let i = -6; i <= 6; i++) {
        if (Math.abs(i) < 2 && style === 'braids') continue;
        const x0 = i * 0.17;
        const side = Math.sign(i) || 1;
        ctx.beginPath();
        ctx.moveTo(...P(x0, -0.9, 0));
        ctx.quadraticCurveTo(...P(x0 * 1.6 + side * 0.4, 0, 0), ...P(x0 * 1.3 + side * 0.55, len, 0));
        ctx.strokeStyle = pal.hair;
        ctx.lineWidth = style === 'locs' ? 0.15 : 0.1;
        ctx.stroke();
        ctx.strokeStyle = rgba(pal.hairHi, 0.3);
        ctx.lineWidth = 0.03;
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

function drawHairFront(ctx: Ctx, prof: AvatarProfile, pal: Palette): void {
  const style: HairStyle = prof.look.hair;
  const acc = prof.look.accessory;
  if (acc === 'ghutra' || acc === 'hijab' || acc === 'turban') return;
  const pen = new Pen(ctx);
  const capOnly = acc === 'cap' || acc === 'beanie';
  if (capOnly) {
    // Only the sides show under a cap or beanie.
    if (style === 'bald') return;
    for (const s of [-1, 1]) {
      pen.begin().m(s * 1.04, -0.55, 0.05).l(s * 1.04, -0.02, 0.05).q(s * 0.98, -0.3, s * 0.88, -0.45, 0.1).close();
      fillHair(ctx, pal, style === 'buzz' || style === 'fade' ? 0.5 : 1);
    }
    return;
  }
  switch (style) {
    case 'bald': {
      const [x, y] = P(-0.3, -0.85, 0.2);
      ctx.fillStyle = radial(ctx, x, y, 0, 0.45, [
        [0, 'rgba(255,255,255,0.35)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      return;
    }
    case 'buzz':
      capPath(pen, -1.24, 1.03, 'high', -0.1);
      fillHair(ctx, pal, 0.62);
      return;
    case 'fade':
      capPath(pen, -1.4, 1.03, 'high', -0.25);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = linear(ctx, 0, -1.4, 0, -0.2, [
        [0, pal.hairHi],
        [0.35, pal.hair],
        [0.6, rgba(pal.hair, 0.85)],
        [1, rgba(pal.hair, 0.2)],
      ]);
      ctx.fillRect(-1.3, -1.6, 2.6, 1.5);
      ctx.restore();
      return;
    case 'short':
      capPath(pen, -1.34, 1.05, 'part');
      fillHair(ctx, pal);
      strands(ctx, pal, [[-0.6, -1.15], [-0.2, -1.28], [0.3, -1.25]], [[-0.85, -0.6], [-0.35, -0.7], [0.4, -0.66]]);
      return;
    case 'slick':
      capPath(pen, -1.38, 1.05, 'high');
      fillHair(ctx, pal);
      strands(ctx, pal, [[-0.5, -0.8], [-0.1, -0.78], [0.3, -0.8], [0.6, -0.72]], [[-0.7, -1.25], [-0.25, -1.35], [0.2, -1.36], [0.6, -1.2]], 0.3);
      return;
    case 'spiky':
      capPath(pen, -1.5, 1.05, 'spiky');
      fillHair(ctx, pal);
      return;
    case 'curly':
      capPath(pen, -1.45, 1.06, 'curly');
      fillHair(ctx, pal);
      return;
    case 'afro':
      capPath(pen, -1.3, 1.06, 'curly');
      fillHair(ctx, pal);
      return;
    case 'mohawk': {
      capPath(pen, -1.22, 1.02, 'high', -0.15);
      fillHair(ctx, pal, 0.35);
      pen.begin().m(-0.22, -0.66, 0.4).q(-0.3, -1.5, 0, -1.78, 0.2).q(0.3, -1.5, 0.22, -0.66, 0.4).q(0, -0.72, -0.22, -0.66, 0.4).close();
      fillHair(ctx, pal);
      return;
    }
    case 'long':
    case 'wavy':
    case 'bob':
      capPath(pen, -1.36, 1.07, style === 'bob' ? 'straight' : style === 'wavy' ? 'wavy' : 'part', 0.0);
      fillHair(ctx, pal);
      if (style === 'long') {
        for (const s of [-1, 1]) {
          pen.begin().m(s * 0.88, -0.45, 0.3).b(s * 1.04, 0.2, s * 1.06, 0.8, s * 1.0, 1.15, 0.1).l(s * 1.14, 1.12, 0).b(s * 1.18, 0.6, s * 1.15, -0.2, s * 1.04, -0.6, 0.05).close();
          fillHair(ctx, pal);
        }
      }
      return;
    case 'ponytail':
    case 'bun':
      capPath(pen, -1.33, 1.04, 'high');
      fillHair(ctx, pal);
      strands(ctx, pal, [[-0.55, -0.82], [0, -0.8], [0.5, -0.8]], [[-0.4, -1.28], [0.1, -1.34], [0.55, -1.2]], 0.25);
      return;
    case 'locs':
      capPath(pen, -1.38, 1.06, 'curly');
      fillHair(ctx, pal);
      ctx.lineCap = 'round';
      for (const x of [-0.95, -0.75, 0.75, 0.95]) {
        ctx.beginPath();
        ctx.moveTo(...P(x, -0.55, 0.2));
        ctx.quadraticCurveTo(...P(x * 1.1, 0.1, 0.1), ...P(x * 1.12, 0.65, 0.05));
        ctx.strokeStyle = pal.hair;
        ctx.lineWidth = 0.14;
        ctx.stroke();
      }
      return;
    case 'braids': {
      capPath(pen, -1.27, 1.04, 'high');
      fillHair(ctx, pal);
      ctx.strokeStyle = rgba(pal.hairHi, 0.45);
      ctx.lineWidth = 0.022;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(...P(i * 0.2, -0.74, 0.4));
        ctx.quadraticCurveTo(...P(i * 0.24, -1.15, 0.2), ...P(i * 0.18, -1.32, 0.1));
        ctx.stroke();
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Accessories

function drawAccessoryBack(ctx: Ctx, prof: AvatarProfile, pal: Palette): void {
  const acc = prof.look.accessory;
  const pen = new Pen(ctx);
  if (acc === 'ghutra') {
    pen.begin().m(-1.12, -0.95, 0).b(-1.5, -0.2, -1.55, 1.1, -1.85, 2.5, 0).q(-1.2, 2.85, -0.75, 2.4, 0);
    pen.b(-0.9, 1.4, -1.0, 0.6, -0.9, 0.1, 0.05).l(0.9, 0.1, 0.05).b(1.0, 0.6, 0.9, 1.4, 0.75, 2.4, 0);
    pen.q(1.2, 2.85, 1.85, 2.5, 0).b(1.55, 1.1, 1.5, -0.2, 1.12, -0.95, 0).b(0.9, -1.62, -0.9, -1.62, -1.12, -0.95, 0).close();
    ctx.fillStyle = linear(ctx, -1.8, -1.5, 1.8, 2.6, [
      [0, '#ffffff'],
      [0.6, pal.cloth],
      [1, pal.clothShade],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.03;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(...P(s * (1.1 + i * 0.12), -0.3 + i * 0.2, 0));
        ctx.quadraticCurveTo(...P(s * (1.3 + i * 0.14), 1.0, 0), ...P(s * (1.35 + i * 0.12), 2.3, 0));
        ctx.stroke();
      }
    }
  } else if (acc === 'hijab') {
    const color = pal.primary;
    pen.begin().m(-1.15, -0.6, 0).b(-1.35, 0.4, -1.5, 1.4, -2.0, 2.4, 0).q(0, 3.0, 2.0, 2.4, 0).b(1.5, 1.4, 1.35, 0.4, 1.15, -0.6, 0);
    pen.b(1.0, -1.65, -1.0, -1.65, -1.15, -0.6, 0).close();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
  } else if (acc === 'headphones') {
    pen.begin().m(-1.1, -0.15, 0).b(-1.25, -1.45, 1.25, -1.45, 1.1, -0.15, 0);
    ctx.strokeStyle = '#1b1f2a';
    ctx.lineWidth = 0.12;
    ctx.stroke();
  }
}

function drawAccessoryFront(ctx: Ctx, prof: AvatarProfile, pal: Palette, t: number): void {
  const acc = prof.look.accessory;
  const pen = new Pen(ctx);
  switch (acc) {
    case 'headband': {
      pen.begin().m(-1.04, -0.55, 0.1).b(-0.8, -0.86, 0.8, -0.86, 1.04, -0.55, 0.1).l(1.03, -0.4, 0.1).b(0.8, -0.72, -0.8, -0.72, -1.03, -0.4, 0.1).close();
      ctx.fillStyle = pal.secondary === '#ffffff' || pal.secondary === '#000000' ? pal.accent : pal.secondary;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      break;
    }
    case 'headphones': {
      for (const s of [-1, 1]) {
        const exposure = 1 - Math.max(0, s * F.yaw) * 0.6;
        pen.begin();
        const [x, y] = P(s * 1.08 - F.yaw * 0.06, 0.08, -0.4);
        ctx.roundRect(x - 0.16 * exposure, y - 0.3, 0.32 * exposure, 0.6, 0.12);
        ctx.fillStyle = '#20242f';
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 0.035;
        ctx.shadowColor = pal.accent;
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      break;
    }
    case 'cap': {
      pen.begin().m(-1.07, -0.42, 0.1).b(-1.15, -1.4, -0.6, -1.62, 0, -1.62, 0.2).b(0.6, -1.62, 1.15, -1.4, 1.07, -0.42, 0.1);
      pen.q(0, -0.66, -1.07, -0.42, 0.4).close();
      ctx.fillStyle = pal.primary;
      ctx.fill();
      ctx.fillStyle = linear(ctx, -1, -1.6, 1, -0.4, [
        [0, 'rgba(255,255,255,0.22)'],
        [1, 'rgba(0,0,0,0.3)'],
      ]);
      ctx.fill();
      pen.begin().m(-1.0, -0.52, 0.5).q(0, -0.78, 1.0, -0.52, 0.5).q(0.6, -0.18, 0, -0.16, 1.1).q(-0.6, -0.18, -1.0, -0.52, 0.5).close();
      ctx.fillStyle = pal.secondary === '#ffffff' ? pal.primaryDark : pal.secondary;
      ctx.fill();
      pen.begin().ellipse(0, -1.05, 0.16, 0.12, 0, 0.5);
      ctx.fillStyle = pal.secondary;
      ctx.fill();
      break;
    }
    case 'beanie': {
      pen.begin().m(-1.07, -0.5, 0.1).b(-1.15, -1.55, -0.6, -1.75, 0, -1.75, 0.2).b(0.6, -1.75, 1.15, -1.55, 1.07, -0.5, 0.1).q(0, -0.7, -1.07, -0.5, 0.4).close();
      ctx.fillStyle = pal.primary;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.025;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(...P(i * 0.18, -0.68, 0.3));
        ctx.lineTo(...P(i * 0.14, -1.6, 0.2));
        ctx.stroke();
      }
      pen.begin().m(-1.08, -0.45, 0.1).q(0, -0.66, 1.08, -0.45, 0.4).l(1.06, -0.75, 0.2).q(0, -0.98, -1.06, -0.75, 0.4).close();
      ctx.fillStyle = pal.primaryDark;
      ctx.fill();
      break;
    }
    case 'glasses': {
      ctx.lineWidth = 0.032;
      ctx.strokeStyle = '#121722';
      for (const s of [-1, 1]) {
        const far = Math.max(0, s * F.yaw);
        const w = 0.42 * (1 - far * 0.25);
        const [x, y] = P(s * 0.37, -0.03, 0.85);
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 0.13, w, 0.27, 0.09);
        ctx.fillStyle = rgba(pal.accent, 0.1);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 0.025;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + 0.05, y + 0.1);
        ctx.lineTo(x - w / 2 + 0.2, y - 0.14);
        ctx.stroke();
        ctx.restore();
      }
      pen.begin().m(-0.16, -0.06, 0.9).q(0, -0.12, 0.16, -0.06, 0.9);
      ctx.strokeStyle = '#121722';
      ctx.stroke();
      break;
    }
    case 'ghutra': {
      // Cloth framing the face, and the black agal cord rings.
      pen.begin().m(-1.12, 0.5, 0.05).b(-1.2, -0.4, -1.05, -1.0, -0.6, -1.32, 0.1).q(0, -1.5, 0.6, -1.32, 0.15).b(1.05, -1.0, 1.2, -0.4, 1.12, 0.5, 0.05);
      pen.l(0.94, 0.5, 0.1).b(0.98, -0.1, 0.85, -0.55, 0.55, -0.68, 0.4).q(0, -0.8, -0.55, -0.68, 0.6).b(-0.85, -0.55, -0.98, -0.1, -0.94, 0.5, 0.1).close();
      ctx.fillStyle = linear(ctx, -1, -1.5, 1, 0.5, [
        [0, '#ffffff'],
        [1, pal.clothShade],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.02;
      ctx.stroke();
      for (const off of [0, 0.13]) {
        pen.begin().m(-1.02, -0.86 + off, 0.1).b(-0.7, -1.18 + off, 0.7, -1.18 + off, 1.02, -0.86 + off, 0.1);
        ctx.strokeStyle = '#11131a';
        ctx.lineWidth = 0.075;
        ctx.stroke();
      }
      break;
    }
    case 'hijab': {
      pen.begin().m(-1.15, 1.3, 0).b(-1.2, 0, -1.15, -1.0, -0.6, -1.35, 0.1).q(0, -1.52, 0.6, -1.35, 0.15).b(1.15, -1.0, 1.2, 0, 1.15, 1.3, 0);
      pen.l(0.82, 1.15, 0.2).b(0.98, 0.4, 1.0, -0.2, 0.82, -0.55, 0.3).q(0, -0.92, -0.82, -0.55, 0.6).b(-1.0, -0.2, -0.98, 0.4, -0.82, 1.15, 0.2).close();
      ctx.fillStyle = pal.primary;
      ctx.fill();
      ctx.fillStyle = linear(ctx, -1, -1.4, 1, 1.3, [
        [0, 'rgba(255,255,255,0.18)'],
        [1, 'rgba(0,0,0,0.28)'],
      ]);
      ctx.fill();
      break;
    }
    case 'turban': {
      pen.begin().m(-1.1, -0.45, 0.1).b(-1.3, -1.2, -0.8, -1.85, 0, -1.85, 0.2).b(0.8, -1.85, 1.3, -1.2, 1.1, -0.45, 0.1).q(0, -0.72, -1.1, -0.45, 0.4).close();
      ctx.fillStyle = linear(ctx, -1, -1.8, 1, -0.5, [
        [0, '#ffffff'],
        [1, pal.clothShade],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = 0.035;
      for (let i = 0; i < 4; i++) {
        pen.begin().m(-1.05, -0.65 - i * 0.22, 0.2).q(0, -0.95 - i * 0.24 + (i % 2) * 0.12, 1.05, -0.65 - i * 0.2, 0.3);
        ctx.stroke();
      }
      break;
    }
    case 'laurel': {
      ctx.fillStyle = pal.gold;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const a = 0.25 + i * 0.17;
          const x = s * (1.02 - i * 0.12);
          const y = -0.45 - Math.sin(a) * 0.65;
          const [px, py] = P(x, y, 0.2);
          ctx.beginPath();
          ctx.ellipse(px, py, 0.12, 0.05, s * (0.9 + i * 0.14), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    default:
      break;
  }
  void t;
}

// ---------------------------------------------------------------------------------------------

export function drawFigure(ctx: Ctx, prof: AvatarProfile, pal: Palette, params: FaceParams, t: number, shape?: FaceShape): void {
  F = params;
  S = shape ?? shapeFor(prof);
  ctx.save();
  ctx.lineJoin = 'round';
  drawTorso(ctx, prof, pal);

  ctx.save();
  // Head pivots on the neck.
  ctx.translate(0, 1.0);
  ctx.rotate(params.roll);
  ctx.translate(params.yaw * 0.05, -1.0 + params.pitch * 0.05 + params.breath * 0.012);

  drawAccessoryBack(ctx, prof, pal);
  drawHairBack(ctx, prof, pal);
  if (prof.look.accessory !== 'headphones' && prof.look.accessory !== 'hijab') drawEars(ctx, pal);
  drawHeadSkin(ctx, pal);
  drawFacialHairUnder(ctx, prof, pal);
  drawNose(ctx, pal);
  drawMouth(ctx, pal);
  drawMustache(ctx, prof, pal);
  drawEyes(ctx, pal);
  drawBrows(ctx, pal, prof.gender === 'f' ? 0.05 : 0.07);
  drawHairFront(ctx, prof, pal);
  drawAccessoryFront(ctx, prof, pal, t);
  ctx.restore();
  ctx.restore();
}
