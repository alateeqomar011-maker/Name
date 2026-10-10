import { containsArabic, fontStack } from "@/lib/fonts";
import type { DesignDoc, ImageLayer, Layer, ShapeLayer, TextLayer } from "./types";

// Canvas 2D renderer for design documents. The same function draws the editor
// preview and the full-resolution export, so what you see is what you export.

export type ImageMap = Map<string, CanvasImageSource & { width: number; height: number }>;

type Ctx = CanvasRenderingContext2D;

function parseFill(ctx: Ctx, fill: string, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (!fill.startsWith("linear:")) return fill;
  const [, angleStr, c1, c2] = fill.split(":");
  const angle = (Number(angleStr) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const len = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle));
  const dx = (Math.sin(angle) * len) / 2;
  const dy = (-Math.cos(angle) * len) / 2;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function burstPath(ctx: Ctx, cx: number, cy: number, r: number, points = 18, depth = 0.12) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * (1 - depth);
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawBackground(ctx: Ctx, doc: DesignDoc, W: number, H: number, images: ImageMap) {
  const bg = doc.background;
  if (bg.type === "image" && bg.assetId && images.get(bg.assetId)) {
    const img = images.get(bg.assetId)!;
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
    const s = Math.max(W / img.width, H / img.height);
    const iw = img.width * s;
    const ih = img.height * s;
    ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
    if (bg.overlay && bg.overlay.opacity > 0) {
      ctx.globalAlpha = bg.overlay.opacity;
      ctx.fillStyle = bg.overlay.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    return;
  }
  if (bg.type === "gradient" && bg.color2) {
    ctx.fillStyle = parseFill(ctx, `linear:${bg.angle ?? 180}:${bg.color}:${bg.color2}`, 0, 0, W, H);
  } else {
    ctx.fillStyle = bg.color;
  }
  ctx.fillRect(0, 0, W, H);
}

function drawImage(ctx: Ctx, l: ImageLayer, x: number, y: number, w: number, h: number, images: ImageMap, W: number) {
  const img = images.get(l.assetId);
  if (!img) {
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(x, y, w, h);
    return;
  }
  const s = l.fit === "cover" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  const ix = x + (w - iw) / 2;
  const iy = l.fit === "contain" && l.role === "product" ? y + (h - ih) : y + (h - ih) / 2;
  ctx.save();
  if (l.radius) {
    roundRect(ctx, x, y, w, h, l.radius * W);
    ctx.clip();
  } else if (l.fit === "cover") {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }
  if (l.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = W * 0.035;
    ctx.shadowOffsetY = W * 0.018;
  }
  ctx.drawImage(img, ix, iy, iw, ih);
  ctx.restore();
}

function drawShape(ctx: Ctx, l: ShapeLayer, x: number, y: number, w: number, h: number, W: number) {
  ctx.fillStyle = parseFill(ctx, l.fill, x, y, w, h);
  if (l.shape === "rect") {
    roundRect(ctx, x, y, w, h, (l.radius ?? 0) * W);
    ctx.fill();
  } else if (l.shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (l.shape === "line") {
    ctx.fillRect(x, y, w, Math.max(1, h));
  } else if (l.shape === "burst") {
    burstPath(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2);
    ctx.fill();
  } else if (l.shape === "arch") {
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  }
  if (l.stroke && l.strokeWidth) {
    ctx.strokeStyle = l.stroke;
    ctx.lineWidth = l.strokeWidth * W;
    ctx.stroke();
  }
}

function fontString(l: TextLayer, px: number) {
  return `${l.italic ? "italic " : ""}${l.weight} ${px}px ${fontStack(l.font)}`;
}

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

/** Lays out a text layer: returns font size, lines and measured block size. */
export function layoutText(ctx: Ctx, l: TextLayer, W: number, boxW: number, boxH: number) {
  const value = l.uppercase ? l.text.toUpperCase() : l.text;
  const padX = l.bg && l.bg.shape !== "burst" && l.bg.shape !== "circle" ? l.bg.padX : 0;
  const padY = l.bg && l.bg.shape !== "burst" && l.bg.shape !== "circle" ? l.bg.padY : 0;
  const round = l.bg?.shape === "burst" || l.bg?.shape === "circle";
  const innerW = round ? Math.min(boxW, boxH) * 0.66 : boxW;
  const innerH = round ? Math.min(boxW, boxH) * 0.6 : boxH;
  let px = Math.max(6, l.size * W);
  let lines: string[] = [];
  for (let i = 0; i < 40; i++) {
    ctx.font = fontString(l, px);
    if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${(l.letterSpacing ?? 0) * px}px`;
    const avail = innerW - padX * px * 2;
    lines = wrap(ctx, value, Math.max(10, avail));
    const widest = Math.max(...lines.map((s) => ctx.measureText(s).width));
    const height = lines.length * px * l.lineHeight + padY * px * 2;
    if (!l.autoFit || (height <= innerH && widest <= avail + 0.5)) break;
    px *= 0.93;
  }
  const widths = lines.map((s) => ctx.measureText(s).width);
  return { px, lines, widths, blockH: lines.length * px * l.lineHeight, padX: padX * px, padY: padY * px };
}

function drawText(ctx: Ctx, l: TextLayer, x: number, y: number, w: number, h: number, W: number) {
  const { px, lines, widths, blockH, padX, padY } = layoutText(ctx, l, W, w, h);
  const rtl = containsArabic(l.text);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textBaseline = "alphabetic";
  const round = l.bg?.shape === "burst" || l.bg?.shape === "circle";
  const maxW = Math.max(...widths, 0);
  const totalH = blockH + padY * 2;
  let top = y;
  const valign = round ? "middle" : (l.valign ?? "top");
  if (valign === "middle") top = y + (h - totalH) / 2;
  if (valign === "bottom") top = y + h - totalH;

  if (l.bg) {
    ctx.fillStyle = l.bg.color;
    if (round) {
      const r = Math.min(w, h) / 2;
      if (l.bg.shape === "burst") burstPath(ctx, x + w / 2, y + h / 2, r);
      else {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      }
      ctx.fill();
    } else {
      const bw = Math.min(w, maxW + padX * 2);
      const bx = l.align === "left" ? x : l.align === "right" ? x + w - bw : x + (w - bw) / 2;
      roundRect(ctx, bx, top, bw, totalH, Math.min(l.bg.radius * px, totalH / 2));
      ctx.fill();
    }
  }

  if (l.shadow) {
    ctx.shadowColor = l.shadow.color;
    ctx.shadowBlur = l.shadow.blur * W;
    ctx.shadowOffsetY = l.shadow.y * W;
  }
  ctx.fillStyle = l.color;
  ctx.font = fontString(l, px);
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${(l.letterSpacing ?? 0) * px}px`;
  const ascent = px * 0.8;
  const lineGap = px * l.lineHeight;
  lines.forEach((line, i) => {
    const lw = widths[i];
    let lx = x + (w - lw) / 2;
    if (!round && l.align === "left") lx = x + (l.bg ? padX : 0);
    if (!round && l.align === "right") lx = x + w - lw - (l.bg ? padX : 0);
    const ly = top + padY + i * lineGap + ascent + (lineGap - px) / 2;
    ctx.textAlign = "left";
    // In RTL mode canvas measures from the right edge; draw from the line's right side.
    if (rtl) {
      ctx.textAlign = "right";
      ctx.fillText(line, lx + lw, ly);
    } else {
      ctx.fillText(line, lx, ly);
    }
    if (l.strike) {
      ctx.fillRect(lx, ly - px * 0.3, lw, Math.max(1, px * 0.07));
    }
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = "0px";
}

export function drawLayer(ctx: Ctx, l: Layer, W: number, H: number, images: ImageMap) {
  if (l.hidden) return;
  const x = l.x * W;
  const y = l.y * H;
  const w = l.w * W;
  const h = l.h * H;
  ctx.save();
  ctx.globalAlpha = l.opacity ?? 1;
  if (l.rotation) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  if (l.type === "image") drawImage(ctx, l, x, y, w, h, images, W);
  else if (l.type === "shape") drawShape(ctx, l, x, y, w, h, W);
  else drawText(ctx, l, x, y, w, h, W);
  ctx.restore();
}

export function renderDesign(ctx: Ctx, doc: DesignDoc, W: number, H: number, images: ImageMap) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";
  drawBackground(ctx, doc, W, H, images);
  for (const l of doc.layers) drawLayer(ctx, l, W, H, images);
  ctx.restore();
}

/** All asset ids referenced by a design. */
export function designAssetIds(doc: DesignDoc): string[] {
  const ids = new Set<string>();
  if (doc.background.type === "image" && doc.background.assetId) ids.add(doc.background.assetId);
  for (const l of doc.layers) if (l.type === "image") ids.add(l.assetId);
  return [...ids];
}

/** All font families (+ sample text) used by a design, for preloading. */
export function designFonts(doc: DesignDoc): { family: string; weight: number; sample: string }[] {
  return doc.layers
    .filter((l): l is TextLayer => l.type === "text")
    .map((l) => ({ family: l.font, weight: l.weight, sample: l.text.slice(0, 40) || "Aa" }));
}
