import "server-only";
import type { Layout } from "@/lib/studio-styles";
import { hashString, isDark, mix, seededRandom, shade } from "./color";

// Procedural studio backdrops rendered as SVG (librsvg via sharp). Every style
// is resolution-independent so a render can be re-created at 4K for export.

export interface Podium {
  cx: number;
  topY: number;
  rx: number;
  ry: number;
  bottomY: number;
}

export interface Placement {
  W: number;
  H: number;
  layout: Layout;
  /** Product center x and bottom edge y (standing) in px. */
  cx: number;
  baseline: number;
  left: number;
  top: number;
  pw: number;
  ph: number;
  /** Where the wall meets the floor (px). */
  horizon: number;
  podium?: Podium;
}

export interface RenderCtx extends Placement {
  p: string[];
  v: number;
  rand: () => number;
  /** Scale unit: 1 at 1000px short edge. */
  u: number;
  standing: boolean;
}

export interface StyleSpec {
  /** Horizon (wall/floor seam) as a fraction of height, for standing layouts. */
  horizon?: number;
  /** Product bottom as a fraction of height (when not on a podium). */
  baseline?: number;
  /** Max product height / width as fractions of the canvas. */
  fillH?: number;
  fillW?: number;
  podium?: "cylinder" | "marble";
  /** Floor color used to tint shadows. */
  floor: (p: string[]) => string;
  render: (c: RenderCtx) => string;
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();

function stops(list: [number, string, number?][]) {
  return list
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? "" : ` stop-opacity="${a}"`}/>`)
    .join("");
}

function vGrad(id: string, list: [number, string, number?][]) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops(list)}</linearGradient>`;
}

function hGrad(id: string, list: [number, string, number?][]) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops(list)}</linearGradient>`;
}

function rGrad(id: string, cx: number, cy: number, r: number, list: [number, string, number?][]) {
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stops(list)}</radialGradient>`;
}

function blur(id: string, std: number) {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(std)}"/></filter>`;
}

function vignette(c: RenderCtx, strength: number, color = "#000") {
  const r = Math.hypot(c.W, c.H) * 0.62;
  return `<defs>${rGrad("vig", c.W / 2, c.H * 0.46, r, [
    [0.45, color, 0],
    [1, color, strength],
  ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#vig)"/>`;
}

function spotlight(c: RenderCtx, color: string, opacity: number, cy = c.horizon - c.H * 0.16, radius = 0.6) {
  const r = Math.max(c.W, c.H) * radius;
  return `<defs>${rGrad("spot", c.cx, cy, r, [
    [0, color, opacity],
    [0.5, color, opacity * 0.35],
    [1, color, 0],
  ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#spot)"/>`;
}

function floorPool(c: RenderCtx, color: string, opacity: number) {
  if (!c.standing) return "";
  const rx = Math.max(c.pw * 1.1, c.W * 0.32);
  const ry = Math.max(c.H * 0.05, (c.H - c.horizon) * 0.35);
  return `<defs>${blur("pool", ry * 0.6)}</defs><ellipse cx="${n(c.cx)}" cy="${n(c.baseline)}" rx="${n(rx)}" ry="${n(ry)}" fill="${color}" opacity="${opacity}" filter="url(#pool)"/>`;
}

/** Seamless studio sweep (cyclorama): wall fades into floor without a seam. */
function sweep(c: RenderCtx, wallTop: string, wallMid: string, floorNear: string, floorFront: string) {
  const W = c.W;
  const H = c.H;
  if (!c.standing) {
    return `<defs>${rGrad("flat", c.cx, c.H * 0.45, Math.max(W, H) * 0.8, [
      [0, floorNear],
      [0.55, wallMid],
      [1, floorFront],
    ])}</defs><rect width="${W}" height="${H}" fill="url(#flat)"/>`;
  }
  const hz = c.horizon / H;
  return `<defs>${vGrad("sweep", [
    [0, wallTop],
    [Math.max(0.05, hz - 0.18), wallMid],
    [hz, mix(wallMid, floorNear, 0.5)],
    [Math.min(0.98, hz + 0.08), floorNear],
    [1, floorFront],
  ])}</defs><rect width="${W}" height="${H}" fill="url(#sweep)"/>`;
}

function glossLine(c: RenderCtx, color: string, opacity: number) {
  if (!c.standing) return "";
  const h = Math.max(2, c.H * 0.006);
  return `<defs>${blur("gl", h * 1.2)}${hGrad("glg", [
    [0, color, 0],
    [0.5, color, 1],
    [1, color, 0],
  ])}</defs><rect x="0" y="${n(c.horizon - h / 2)}" width="${c.W}" height="${n(h)}" fill="url(#glg)" opacity="${opacity}" filter="url(#gl)"/>`;
}

function grainFilter(id: string, c: RenderCtx, freq: number, octaves: number, color: string, alpha: number) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${(freq / c.u).toFixed(5)}" numOctaves="${octaves}" seed="${Math.floor(c.rand() * 1000)}"/>
<feColorMatrix type="matrix" values="0 0 0 0 ${r.toFixed(3)}  0 0 0 0 ${g.toFixed(3)}  0 0 0 0 ${b.toFixed(3)}  ${(alpha * 3).toFixed(3)} 0 0 0 ${(-alpha * 1.2).toFixed(3)}"/>
</filter>`;
}

function textureLayer(id: string, c: RenderCtx, freq: number, octaves: number, color: string, alpha: number, y = 0, h = c.H) {
  return `<defs>${grainFilter(id, c, freq, octaves, color, alpha)}</defs><rect x="0" y="${n(y)}" width="${c.W}" height="${n(h)}" filter="url(#${id})"/>`;
}

function bokeh(
  c: RenderCtx,
  count: number,
  color: string,
  opts: { minR: number; maxR: number; yMin: number; yMax: number; minO: number; maxO: number; blurK?: number },
) {
  let out = "";
  let defs = "";
  for (let i = 0; i < count; i++) {
    const r = (opts.minR + c.rand() * (opts.maxR - opts.minR)) * Math.min(c.W, c.H);
    const x = c.rand() * c.W;
    const y = (opts.yMin + c.rand() * (opts.yMax - opts.yMin)) * c.H;
    const o = opts.minO + c.rand() * (opts.maxO - opts.minO);
    const b = r * (opts.blurK ?? 0.25) * (0.4 + c.rand());
    defs += blur(`bk${i}`, b);
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color}" opacity="${o.toFixed(2)}" filter="url(#bk${i})"/>`;
  }
  return `<defs>${defs}</defs>${out}`;
}

function cylinder(c: RenderCtx, body: [string, string, string], top: string, extraTop = "") {
  const pd = c.podium!;
  const { cx, topY, rx, ry, bottomY } = pd;
  const path = `M ${n(cx - rx)} ${n(topY)} L ${n(cx - rx)} ${n(bottomY)} A ${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(bottomY)} L ${n(cx + rx)} ${n(topY)} Z`;
  return `<defs>${hGrad("cyl", [
    [0, body[0]],
    [0.35, body[1]],
    [0.75, body[2]],
    [1, shade(body[2], -0.08)],
  ])}${blur("cylsh", ry * 0.8)}</defs>
<ellipse cx="${n(cx)}" cy="${n(bottomY + ry * 0.15)}" rx="${n(rx * 1.08)}" ry="${n(ry * 1.1)}" fill="#000" opacity="0.22" filter="url(#cylsh)"/>
<path d="${path}" fill="url(#cyl)"/>
<ellipse cx="${n(cx)}" cy="${n(topY)}" rx="${n(rx)}" ry="${n(ry)}" fill="${top}"/>${extraTop}`;
}

function heart(x: number, y: number, s: number) {
  return `M ${n(x)} ${n(y + s * 0.3)} C ${n(x)} ${n(y)} ${n(x - s * 0.5)} ${n(y)} ${n(x - s * 0.5)} ${n(y + s * 0.3)} C ${n(x - s * 0.5)} ${n(y + s * 0.6)} ${n(x)} ${n(y + s * 0.75)} ${n(x)} ${n(y + s)} C ${n(x)} ${n(y + s * 0.75)} ${n(x + s * 0.5)} ${n(y + s * 0.6)} ${n(x + s * 0.5)} ${n(y + s * 0.3)} C ${n(x + s * 0.5)} ${n(y)} ${n(x)} ${n(y)} ${n(x)} ${n(y + s * 0.3)} Z`;
}

// ── Style definitions ────────────────────────────────────────────────────

export const STYLE_SPECS: Record<string, StyleSpec> = {
  "marketplace-white": {
    fillH: 0.85,
    fillW: 0.85,
    baseline: 0.925,
    floor: () => "#ffffff",
    render: (c) => `<rect width="${c.W}" height="${c.H}" fill="#ffffff"/>`,
  },
  transparent: {
    fillH: 0.88,
    fillW: 0.88,
    baseline: 0.94,
    floor: () => "#ffffff",
    render: () => "",
  },
  "studio-white": {
    horizon: 0.66,
    floor: (p) => p[1],
    render: (c) =>
      sweep(c, shade(c.p[1], 0.15), c.p[0], shade(c.p[0], 0.2), c.p[1]) +
      spotlight(c, "#ffffff", 0.55) +
      floorPool(c, "#ffffff", 0.45) +
      vignette(c, 0.1),
  },
  "soft-gray": {
    horizon: 0.66,
    floor: (p) => p[1],
    render: (c) =>
      sweep(c, shade(c.p[1], -0.08), c.p[0], shade(c.p[0], 0.06), shade(c.p[1], -0.04)) +
      spotlight(c, "#ffffff", 0.5, c.horizon - c.H * 0.2, 0.5) +
      floorPool(c, "#ffffff", 0.3) +
      vignette(c, 0.28),
  },
  "paper-sand": {
    horizon: 0.67,
    floor: (p) => p[1],
    render: (c) =>
      sweep(c, shade(c.p[1], 0.05), c.p[0], shade(c.p[0], 0.1), c.p[1]) +
      spotlight(c, "#fff8ee", 0.45) +
      textureLayer("paper", c, 0.9, 3, shade(c.p[1], -0.45), 0.09) +
      floorPool(c, "#fffaf2", 0.3) +
      vignette(c, 0.14, "#3a2a14"),
  },
  "noir-gloss": {
    horizon: 0.7,
    floor: (p) => shade(p[0], 0.05),
    render: (c) => {
      const accent = c.p[1];
      return (
        `<rect width="${c.W}" height="${c.H}" fill="${c.p[0]}"/>` +
        spotlight(c, accent, 0.34, c.H * 0.38, 0.55) +
        (c.standing
          ? `<defs>${vGrad("nf", [
              [0, shade(c.p[0], 0.06)],
              [1, shade(c.p[0], -0.4)],
            ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#nf)" opacity="0.92"/>`
          : "") +
        glossLine(c, accent, 0.35) +
        floorPool(c, accent, 0.16) +
        vignette(c, 0.55)
      );
    },
  },
  champagne: {
    horizon: 0.7,
    floor: (p) => mix(p[0], p[1], 0.6),
    render: (c) =>
      `<defs>${rGrad("ch", c.cx, c.H * 0.4, Math.max(c.W, c.H) * 0.85, [
        [0, shade(c.p[0], 0.45)],
        [0.45, c.p[0]],
        [1, c.p[1]],
      ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#ch)"/>` +
      bokeh(c, 9, "#ffffff", { minR: 0.02, maxR: 0.07, yMin: 0.05, yMax: 0.6, minO: 0.08, maxO: 0.25, blurK: 0.2 }) +
      (c.standing
        ? `<defs>${vGrad("chf", [
            [0, c.p[1], 0.05],
            [1, shade(c.p[1], -0.3), 0.45],
          ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#chf)"/>`
        : "") +
      glossLine(c, "#fff6e0", 0.5) +
      floorPool(c, "#fff3d6", 0.35) +
      vignette(c, 0.22, "#3b2a10"),
  },
  marble: {
    horizon: 0.74,
    podium: "marble",
    floor: (p) => p[1],
    render: (c) => {
      const wall = c.p[0];
      const stone = c.p[1];
      const vein = c.p[2];
      const pd = c.podium;
      const marbleTexture = (id: string) => `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="turbulence" baseFrequency="${(0.0028 / c.u).toFixed(5)} ${(0.0075 / c.u).toFixed(5)}" numOctaves="4" seed="${Math.floor(c.rand() * 999)}"/>
<feColorMatrix type="matrix" values="0 0 0 0 ${(parseInt(vein.slice(1, 3), 16) / 255).toFixed(3)}  0 0 0 0 ${(parseInt(vein.slice(3, 5), 16) / 255).toFixed(3)}  0 0 0 0 ${(parseInt(vein.slice(5, 7), 16) / 255).toFixed(3)}  -7 0 0 0 1.05"/>
</filter>`;
      let pedestal = "";
      if (pd) {
        const body = `M ${n(pd.cx - pd.rx)} ${n(pd.topY)} L ${n(pd.cx - pd.rx)} ${n(pd.bottomY)} A ${n(pd.rx)} ${n(pd.ry)} 0 0 0 ${n(pd.cx + pd.rx)} ${n(pd.bottomY)} L ${n(pd.cx + pd.rx)} ${n(pd.topY)} Z`;
        pedestal = `<defs>${marbleTexture("mt")}${hGrad("ms", [
          [0, "#000", 0.08],
          [0.3, "#fff", 0.18],
          [0.7, "#000", 0.06],
          [1, "#000", 0.28],
        ])}<clipPath id="pc"><path d="${body}"/></clipPath><clipPath id="tc"><ellipse cx="${n(pd.cx)}" cy="${n(pd.topY)}" rx="${n(pd.rx)}" ry="${n(pd.ry)}"/></clipPath>${blur("psh", pd.ry)}</defs>
<ellipse cx="${n(pd.cx)}" cy="${n(pd.bottomY + pd.ry * 0.2)}" rx="${n(pd.rx * 1.12)}" ry="${n(pd.ry * 1.2)}" fill="#000" opacity="0.2" filter="url(#psh)"/>
<g clip-path="url(#pc)"><rect x="${n(pd.cx - pd.rx)}" y="${n(pd.topY - pd.ry)}" width="${n(pd.rx * 2)}" height="${n(pd.bottomY - pd.topY + pd.ry * 2)}" fill="${stone}"/><rect x="${n(pd.cx - pd.rx)}" y="${n(pd.topY - pd.ry)}" width="${n(pd.rx * 2)}" height="${n(pd.bottomY - pd.topY + pd.ry * 2)}" filter="url(#mt)" opacity="0.55"/><rect x="${n(pd.cx - pd.rx)}" y="${n(pd.topY)}" width="${n(pd.rx * 2)}" height="${n(pd.bottomY - pd.topY + pd.ry)}" fill="url(#ms)"/></g>
<g clip-path="url(#tc)"><rect x="${n(pd.cx - pd.rx)}" y="${n(pd.topY - pd.ry)}" width="${n(pd.rx * 2)}" height="${n(pd.ry * 2)}" fill="${shade(stone, 0.35)}"/><rect x="${n(pd.cx - pd.rx)}" y="${n(pd.topY - pd.ry)}" width="${n(pd.rx * 2)}" height="${n(pd.ry * 2)}" filter="url(#mt)" opacity="0.4"/></g>`;
      }
      return (
        sweep(c, shade(wall, 0.06), wall, shade(wall, -0.02), shade(wall, -0.1)) +
        spotlight(c, "#ffffff", 0.4, c.H * 0.4, 0.55) +
        (c.standing ? "" : textureLayer("mfl", c, 0.004, 4, vein, 0.12)) +
        pedestal +
        vignette(c, 0.16)
      );
    },
  },
  velvet: {
    horizon: 0.7,
    floor: (p) => shade(p[0], -0.2),
    render: (c) =>
      `<defs>${rGrad("vv", c.cx, c.H * 0.42, Math.max(c.W, c.H) * 0.75, [
        [0, c.p[1]],
        [0.45, c.p[0]],
        [1, shade(c.p[0], -0.55)],
      ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#vv)"/>` +
      textureLayer("vel", c, 0.7, 2, "#000000", 0.08) +
      (c.standing
        ? `<defs>${vGrad("vf", [
            [0, "#000", 0.15],
            [1, "#000", 0.5],
          ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#vf)"/>`
        : "") +
      glossLine(c, shade(c.p[1], 0.4), 0.3) +
      floorPool(c, shade(c.p[1], 0.3), 0.18) +
      vignette(c, 0.45),
  },
  "pastel-podium": {
    horizon: 0.72,
    podium: "cylinder",
    floor: (p) => shade(p[1], 0.18),
    render: (c) => {
      const [wall, accent, light] = c.p;
      const archW = Math.min(c.W * 0.5, Math.max(c.pw * 1.9, c.W * 0.34));
      const archTop = c.H * 0.14;
      const ax = c.cx - archW / 2;
      const arch =
        c.v % 2 === 0
          ? `<path d="M ${n(ax)} ${n(c.horizon)} L ${n(ax)} ${n(archTop + archW / 2)} A ${n(archW / 2)} ${n(archW / 2)} 0 0 1 ${n(ax + archW)} ${n(archTop + archW / 2)} L ${n(ax + archW)} ${n(c.horizon)} Z" fill="url(#arch)"/>`
          : `<circle cx="${n(c.cx)}" cy="${n(c.horizon - archW * 0.55)}" r="${n(archW * 0.55)}" fill="url(#arch)"/>`;
      const pd = c.podium;
      const sphereR = Math.min(c.W, c.H) * 0.055;
      const sx = pd ? Math.min(c.W - sphereR * 1.5, pd.cx + pd.rx + sphereR * 1.6) : c.W * 0.8;
      const sy = (pd ? pd.bottomY : c.H * 0.9) - sphereR * 0.9;
      return (
        `<defs>${vGrad("pw", [
          [0, shade(wall, 0.12)],
          [1, shade(wall, -0.04)],
        ])}${vGrad("arch", [
          [0, shade(light, 0.2)],
          [1, light],
        ])}${vGrad("pf", [
          [0, shade(accent, 0.1)],
          [1, shade(accent, 0.28)],
        ])}${rGrad("sph", sx - sphereR * 0.35, sy - sphereR * 0.4, sphereR * 1.4, [
          [0, shade(light, 0.4)],
          [0.6, accent],
          [1, shade(accent, -0.2)],
        ])}${blur("sphsh", sphereR * 0.35)}</defs>
<rect width="${c.W}" height="${c.H}" fill="url(#pw)"/>` +
        (c.standing ? arch : "") +
        (c.standing
          ? `<rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#pf)"/>`
          : "") +
        (pd ? cylinder(c, [shade(accent, 0.18), shade(accent, 0.05), shade(accent, -0.12)], shade(accent, 0.3)) : "") +
        (c.standing
          ? `<ellipse cx="${n(sx)}" cy="${n(sy + sphereR * 0.9)}" rx="${n(sphereR * 1.1)}" ry="${n(sphereR * 0.22)}" fill="#000" opacity="0.18" filter="url(#sphsh)"/><circle cx="${n(sx)}" cy="${n(sy)}" r="${n(sphereR)}" fill="url(#sph)"/>`
          : "") +
        vignette(c, 0.08)
      );
    },
  },
  "color-pop": {
    horizon: 0.76,
    fillH: 0.6,
    floor: (p) => shade(mix(p[0], p[1], 0.5), -0.15),
    render: (c) => {
      const glowR = Math.max(c.pw, c.ph) * 0.95;
      const ring =
        c.v % 2 === 1
          ? `<circle cx="${n(c.cx)}" cy="${n(c.top + c.ph * 0.5)}" r="${n(glowR * 0.82)}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${n(c.u * 6)}"/>`
          : "";
      return (
        `<defs><linearGradient id="cp" x1="0" y1="0" x2="1" y2="1">${stops([
          [0, c.p[0]],
          [1, c.p[1]],
        ])}</linearGradient>${rGrad("halo", c.cx, c.top + c.ph * 0.5, glowR, [
          [0, "#ffffff", 0.55],
          [0.5, "#ffffff", 0.18],
          [1, "#ffffff", 0],
        ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#cp)"/><rect width="${c.W}" height="${c.H}" fill="url(#halo)"/>` +
        ring +
        (c.standing
          ? `<defs>${vGrad("cpf", [
              [0, "#000", 0.08],
              [1, "#000", 0.22],
            ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#cpf)"/>`
          : "") +
        glossLine(c, "#ffffff", 0.45) +
        vignette(c, 0.12)
      );
    },
  },
  "sunlit-shadows": {
    horizon: 0.72,
    floor: (p) => p[1],
    render: (c) => {
      const wall = c.p[0];
      const light = shade(wall, 0.55);
      const paneW = c.W * 0.16;
      const paneH = c.H * 0.24;
      const gap = c.W * 0.022;
      const ox = c.cx - paneW * 1.6 + (c.v % 3) * c.W * 0.05;
      const oy = c.H * 0.08;
      let panes = "";
      for (let r = 0; r < 2; r++) {
        for (let col = 0; col < 2; col++) {
          panes += `<rect x="${n(ox + col * (paneW + gap))}" y="${n(oy + r * (paneH + gap))}" width="${n(paneW)}" height="${n(paneH)}" fill="${light}"/>`;
        }
      }
      let leaves = "";
      for (let i = 0; i < 7; i++) {
        const lx = ox + c.rand() * paneW * 2.2;
        const ly = oy + c.rand() * paneH * 2.2;
        const rx = c.W * (0.02 + c.rand() * 0.025);
        leaves += `<ellipse cx="${n(lx)}" cy="${n(ly)}" rx="${n(rx)}" ry="${n(rx * 0.38)}" transform="rotate(${Math.round(c.rand() * 180)} ${n(lx)} ${n(ly)})" fill="${shade(wall, -0.25)}"/>`;
      }
      return (
        `<defs>${vGrad("sw", [
          [0, shade(wall, -0.04)],
          [1, shade(wall, -0.1)],
        ])}${vGrad("sf", [
          [0, shade(c.p[1], -0.05)],
          [1, shade(c.p[1], 0.08)],
        ])}${blur("win", c.u * 14)}${blur("leaf", c.u * 9)}</defs>
<rect width="${c.W}" height="${c.H}" fill="url(#sw)"/>
${c.standing ? `<rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#sf)"/>` : ""}
<g transform="skewX(-22) translate(${n(c.H * 0.18)} 0)" opacity="0.62" filter="url(#win)">${panes}</g>
<g transform="skewX(-22) translate(${n(c.H * 0.18)} 0)" opacity="0.22" filter="url(#leaf)">${leaves}</g>` +
        spotlight(c, "#fff1d6", 0.25, c.H * 0.25, 0.7) +
        vignette(c, 0.12, "#3a2410")
      );
    },
  },
  geometric: {
    horizon: 0.7,
    floor: (p) => p[3],
    render: (c) => {
      const [wall, big, block, floor] = c.p;
      const R = Math.min(c.W, c.H) * 0.26;
      const bx = c.cx + c.W * (c.v % 2 === 0 ? 0.16 : -0.16);
      const blockW = c.W * 0.14;
      const blockH = c.H * 0.2;
      const blockX = c.cx + (c.v % 2 === 0 ? -1 : 1) * c.W * 0.3 - blockW / 2;
      return (
        `<rect width="${c.W}" height="${c.H}" fill="${wall}"/>` +
        `<circle cx="${n(bx)}" cy="${n(c.horizon - R * 0.85)}" r="${n(R)}" fill="${big}"/>` +
        `<circle cx="${n(c.cx - c.W * 0.3)}" cy="${n(c.H * 0.2)}" r="${n(R * 0.22)}" fill="${block}" opacity="0.9"/>` +
        (c.standing
          ? `<rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="${floor}"/>
<rect x="${n(blockX)}" y="${n(c.horizon - blockH * 0.6)}" width="${n(blockW)}" height="${n(blockH)}" rx="${n(c.u * 4)}" fill="${block}"/>
<rect x="${n(blockX + blockW * 0.72)}" y="${n(c.horizon - blockH * 0.6)}" width="${n(blockW * 0.28)}" height="${n(blockH)}" fill="#000" opacity="0.08"/>`
          : "") +
        vignette(c, 0.06)
      );
    },
  },
  concrete: {
    horizon: 0.68,
    floor: (p) => p[0],
    render: (c) =>
      sweep(c, shade(c.p[1], -0.05), c.p[1], c.p[0], shade(c.p[0], -0.08)) +
      textureLayer("cfine", c, 0.75, 3, "#2a2a2a", 0.16) +
      textureLayer("cblot", c, 0.006, 4, "#3a3a3a", 0.1) +
      spotlight(c, "#ffffff", 0.22, c.H * 0.3, 0.6) +
      vignette(c, 0.3),
  },
  "wood-table": {
    horizon: 0.6,
    baseline: 0.82,
    floor: (p) => p[1],
    render: (c) => {
      const [wall, wood, dark] = c.p;
      const grain = `<filter id="wg" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${(0.0016 / c.u).toFixed(5)} ${(0.045 / c.u).toFixed(5)}" numOctaves="4" seed="${Math.floor(c.rand() * 999)}"/>
<feColorMatrix type="matrix" values="0 0 0 0 ${(parseInt(dark.slice(1, 3), 16) / 255).toFixed(3)}  0 0 0 0 ${(parseInt(dark.slice(3, 5), 16) / 255).toFixed(3)}  0 0 0 0 ${(parseInt(dark.slice(5, 7), 16) / 255).toFixed(3)}  3.2 0 0 0 -1.35"/>
</filter>`;
      const top = c.standing ? c.horizon : 0;
      return (
        `<defs>${vGrad("ww", [
          [0, shade(wall, 0.04)],
          [1, shade(wall, -0.07)],
        ])}${grain}${vGrad("wshade", [
          [0, "#000", 0.32],
          [0.35, "#000", 0.08],
          [1, "#000", 0.0],
        ])}${blur("edge", c.u * 10)}</defs>
<rect width="${c.W}" height="${c.H}" fill="url(#ww)"/>
<rect x="0" y="${n(top)}" width="${c.W}" height="${n(c.H - top)}" fill="${wood}"/>
<rect x="0" y="${n(top)}" width="${c.W}" height="${n(c.H - top)}" filter="url(#wg)" opacity="0.75"/>
${c.standing ? `<rect x="0" y="${n(top)}" width="${c.W}" height="${n(c.H - top)}" fill="url(#wshade)"/><rect x="0" y="${n(top - c.u * 10)}" width="${c.W}" height="${n(c.u * 12)}" fill="#000" opacity="0.18" filter="url(#edge)"/>` : ""}` +
        spotlight(c, "#fff4e2", 0.28, c.H * 0.35, 0.6) +
        vignette(c, 0.22, "#2a1a0a")
      );
    },
  },
  linen: {
    horizon: 0.68,
    floor: (p) => p[1],
    render: (c) => {
      const thread = (id: string, fx: number, fy: number, alpha: number, color: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
        return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${(fx / c.u).toFixed(5)} ${(fy / c.u).toFixed(5)}" numOctaves="2" seed="${Math.floor(c.rand() * 999)}"/><feColorMatrix type="matrix" values="0 0 0 0 ${r.toFixed(3)}  0 0 0 0 ${g.toFixed(3)}  0 0 0 0 ${b.toFixed(3)}  ${(alpha * 4).toFixed(2)} 0 0 0 ${(-alpha * 1.6).toFixed(2)}"/></filter>`;
      };
      return (
        sweep(c, shade(c.p[1], -0.03), c.p[0], shade(c.p[0], 0.05), c.p[1]) +
        `<defs>${thread("lv", 0.9, 0.012, 0.12, shade(c.p[1], -0.35))}${thread("lh", 0.012, 0.9, 0.12, shade(c.p[1], -0.35))}</defs>
<rect width="${c.W}" height="${c.H}" filter="url(#lv)"/><rect width="${c.W}" height="${c.H}" filter="url(#lh)"/>` +
        spotlight(c, "#ffffff", 0.35) +
        vignette(c, 0.14)
      );
    },
  },
  "ramadan-nights": {
    horizon: 0.72,
    floor: (p) => shade(p[0], -0.4),
    render: (c) => {
      const [night, gold] = c.p;
      let stars = "";
      for (let i = 0; i < 90; i++) {
        const r = c.u * (0.8 + c.rand() * 1.8);
        stars += `<circle cx="${n(c.rand() * c.W)}" cy="${n(c.rand() * c.H * 0.62)}" r="${n(r)}" fill="#fff" opacity="${(0.25 + c.rand() * 0.7).toFixed(2)}"/>`;
      }
      const R = Math.min(c.W, c.H) * 0.065;
      const mx = c.W * (c.v % 2 === 0 ? 0.8 : 0.2);
      const my = c.H * 0.17;
      const starPattern =
        c.v % 3 === 2
          ? (() => {
              const s = Math.min(c.W, c.H) * 0.3;
              return `<g opacity="0.1" stroke="${gold}" stroke-width="${n(c.u * 3)}" fill="none"><rect x="${n(c.cx - s / 2)}" y="${n(c.H * 0.36 - s / 2)}" width="${n(s)}" height="${n(s)}"/><rect x="${n(c.cx - s / 2)}" y="${n(c.H * 0.36 - s / 2)}" width="${n(s)}" height="${n(s)}" transform="rotate(45 ${n(c.cx)} ${n(c.H * 0.36)})"/></g>`;
            })()
          : "";
      return (
        `<defs>${vGrad("sky", [
          [0, shade(night, -0.35)],
          [0.7, night],
          [1, shade(night, -0.2)],
        ])}${blur("moonglow", R * 0.9)}<mask id="cres"><rect width="${c.W}" height="${c.H}" fill="#000"/><circle cx="${n(mx)}" cy="${n(my)}" r="${n(R)}" fill="#fff"/><circle cx="${n(mx + R * 0.42)}" cy="${n(my - R * 0.18)}" r="${n(R * 0.86)}" fill="#000"/></mask></defs>
<rect width="${c.W}" height="${c.H}" fill="url(#sky)"/>${stars}${starPattern}
<circle cx="${n(mx)}" cy="${n(my)}" r="${n(R * 1.3)}" fill="${gold}" opacity="0.28" filter="url(#moonglow)"/>
<rect width="${c.W}" height="${c.H}" fill="${gold}" mask="url(#cres)"/>` +
        bokeh(c, 8, gold, { minR: 0.015, maxR: 0.045, yMin: 0.42, yMax: 0.72, minO: 0.2, maxO: 0.55, blurK: 0.35 }) +
        spotlight(c, gold, 0.16, c.H * 0.45, 0.45) +
        (c.standing
          ? `<defs>${vGrad("rf", [
              [0, shade(night, -0.3)],
              [1, shade(night, -0.6)],
            ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#rf)" opacity="0.95"/>`
          : "") +
        glossLine(c, gold, 0.25) +
        floorPool(c, gold, 0.1) +
        vignette(c, 0.35)
      );
    },
  },
  "holiday-glow": {
    horizon: 0.72,
    floor: (p) => shade(p[0], -0.35),
    render: (c) =>
      `<defs>${rGrad("hg", c.cx, c.H * 0.42, Math.max(c.W, c.H) * 0.8, [
        [0, shade(c.p[0], 0.18)],
        [0.5, c.p[0]],
        [1, shade(c.p[0], -0.45)],
      ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#hg)"/>` +
      bokeh(c, 26, c.p[1], { minR: 0.01, maxR: 0.055, yMin: 0.02, yMax: 0.68, minO: 0.15, maxO: 0.6, blurK: 0.3 }) +
      bokeh(c, 14, "#ffffff", { minR: 0.003, maxR: 0.008, yMin: 0.02, yMax: 0.65, minO: 0.4, maxO: 0.9, blurK: 0.5 }) +
      (c.standing
        ? `<defs>${vGrad("hf", [
            [0, "#000", 0.25],
            [1, "#000", 0.55],
          ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#hf)"/>`
        : "") +
      glossLine(c, c.p[1], 0.3) +
      floorPool(c, c.p[1], 0.12) +
      vignette(c, 0.4),
  },
  "winter-frost": {
    horizon: 0.72,
    floor: (p) => shade(p[0], 0.3),
    render: (c) =>
      `<defs>${vGrad("wf", [
        [0, c.p[1]],
        [0.72, c.p[0]],
        [1, shade(c.p[0], 0.4)],
      ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#wf)"/>` +
      bokeh(c, 18, "#ffffff", { minR: 0.02, maxR: 0.06, yMin: 0.0, yMax: 0.7, minO: 0.12, maxO: 0.35, blurK: 0.45 }) +
      bokeh(c, 70, "#ffffff", { minR: 0.002, maxR: 0.007, yMin: 0.0, yMax: 0.95, minO: 0.5, maxO: 0.95, blurK: 0.3 }) +
      (c.standing
        ? `<defs>${vGrad("snow", [
            [0, "#ffffff", 0.45],
            [1, "#ffffff", 0.9],
          ])}${blur("sedge", c.u * 12)}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#snow)" filter="url(#sedge)"/>`
        : "") +
      spotlight(c, "#ffffff", 0.3) +
      vignette(c, 0.12, "#1a3050"),
  },
  "summer-sun": {
    horizon: 0.74,
    floor: (p) => shade(p[1], 0.25),
    render: (c) => {
      const R = Math.min(c.W, c.H) * 0.09;
      const sx = c.W * (c.v % 2 === 0 ? 0.78 : 0.22);
      const sy = c.H * 0.2;
      return (
        `<defs>${vGrad("ss", [
          [0, c.p[0]],
          [1, c.p[1]],
        ])}${blur("sun", R * 0.8)}</defs><rect width="${c.W}" height="${c.H}" fill="url(#ss)"/>
<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(R * 1.8)}" fill="${c.p[2]}" opacity="0.45" filter="url(#sun)"/>
<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(R)}" fill="${c.p[2]}"/>` +
        (c.standing
          ? `<defs>${vGrad("sand", [
              [0, shade(c.p[1], 0.2)],
              [1, shade(c.p[1], 0.35)],
            ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#sand)"/>`
          : "") +
        vignette(c, 0.1, "#5a2010")
      );
    },
  },
  "autumn-amber": {
    horizon: 0.72,
    floor: (p) => shade(p[0], -0.3),
    render: (c) =>
      `<defs>${rGrad("aa", c.cx, c.H * 0.4, Math.max(c.W, c.H) * 0.8, [
        [0, c.p[1]],
        [0.5, c.p[0]],
        [1, shade(c.p[0], -0.45)],
      ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#aa)"/>` +
      bokeh(c, 14, shade(c.p[1], 0.3), { minR: 0.01, maxR: 0.04, yMin: 0.05, yMax: 0.65, minO: 0.15, maxO: 0.45, blurK: 0.35 }) +
      (c.standing
        ? `<defs>${vGrad("af", [
            [0, "#000", 0.18],
            [1, "#000", 0.42],
          ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#af)"/>`
        : "") +
      glossLine(c, c.p[1], 0.25) +
      vignette(c, 0.35, "#1f0a03"),
  },
  "spring-bloom": {
    horizon: 0.74,
    floor: (p) => shade(p[0], 0.2),
    render: (c) =>
      `<defs>${vGrad("sb", [
        [0, c.p[0]],
        [1, shade(c.p[0], -0.03)],
      ])}</defs><rect width="${c.W}" height="${c.H}" fill="url(#sb)"/>` +
      bokeh(c, 7, c.p[1], { minR: 0.06, maxR: 0.18, yMin: 0.0, yMax: 0.75, minO: 0.35, maxO: 0.65, blurK: 0.25 }) +
      bokeh(c, 6, c.p[2], { minR: 0.05, maxR: 0.15, yMin: 0.05, yMax: 0.75, minO: 0.35, maxO: 0.65, blurK: 0.25 }) +
      (c.standing
        ? `<defs>${vGrad("sbf", [
            [0, "#ffffff", 0.45],
            [1, "#ffffff", 0.7],
          ])}${blur("sbe", c.u * 10)}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#sbf)" filter="url(#sbe)"/>`
        : "") +
      spotlight(c, "#ffffff", 0.35) +
      vignette(c, 0.06),
  },
  "black-friday": {
    horizon: 0.72,
    floor: () => "#0a0a0a",
    render: (c) => {
      const accent = c.p[1];
      let streaks = "";
      for (let i = 0; i < 6; i++) {
        const x = c.rand() * c.W;
        const w = c.u * (6 + c.rand() * 22);
        streaks += `<rect x="${n(x)}" y="${n(-c.H * 0.2)}" width="${n(w)}" height="${n(c.H * 1.4)}" fill="${accent}" opacity="${(0.08 + c.rand() * 0.18).toFixed(2)}" transform="rotate(28 ${n(x)} ${n(c.H / 2)})"/>`;
      }
      return (
        `<defs>${blur("bfs", c.u * 6)}</defs><rect width="${c.W}" height="${c.H}" fill="#000"/><g filter="url(#bfs)">${streaks}</g>` +
        spotlight(c, accent, 0.5, c.top + c.ph * 0.45, 0.42) +
        (c.standing
          ? `<defs>${vGrad("bff", [
              [0, "#111", 0.9],
              [1, "#000", 1],
            ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#bff)"/>`
          : "") +
        glossLine(c, accent, 0.55) +
        floorPool(c, accent, 0.14) +
        vignette(c, 0.4)
      );
    },
  },
  valentine: {
    horizon: 0.74,
    floor: (p) => shade(p[1], 0.1),
    render: (c) => {
      let hearts = "";
      for (let i = 0; i < 12; i++) {
        const s = Math.min(c.W, c.H) * (0.04 + c.rand() * 0.09);
        hearts += `<path d="${heart(c.rand() * c.W, c.rand() * c.H * 0.68, s)}" fill="${c.rand() > 0.5 ? "#ffffff" : shade(c.p[1], -0.1)}" opacity="${(0.15 + c.rand() * 0.3).toFixed(2)}"/>`;
      }
      return (
        `<defs>${vGrad("vl", [
          [0, c.p[0]],
          [1, c.p[1]],
        ])}${blur("hb", c.u * 5)}</defs><rect width="${c.W}" height="${c.H}" fill="url(#vl)"/><g filter="url(#hb)">${hearts}</g>` +
        (c.standing
          ? `<defs>${vGrad("vfl", [
              [0, "#ffffff", 0.2],
              [1, "#ffffff", 0.35],
            ])}</defs><rect x="0" y="${n(c.horizon)}" width="${c.W}" height="${n(c.H - c.horizon)}" fill="url(#vfl)"/>`
          : "") +
        spotlight(c, "#ffffff", 0.35) +
        vignette(c, 0.12, "#5a0a20")
      );
    },
  },
};

export function getStyleSpec(styleId: string): StyleSpec {
  return STYLE_SPECS[styleId] ?? STYLE_SPECS["studio-white"];
}

export function buildBackdropSvg(styleId: string, placement: Placement, palette: string[], variation: number) {
  const spec = getStyleSpec(styleId);
  const ctx: RenderCtx = {
    ...placement,
    p: palette,
    v: variation,
    rand: seededRandom(hashString(styleId) + variation * 7919),
    u: Math.min(placement.W, placement.H) / 1000,
    standing: placement.layout === "standing",
  };
  const body = spec.render(ctx);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${placement.W}" height="${placement.H}" viewBox="0 0 ${placement.W} ${placement.H}">${body}</svg>`;
}

export function shadowTintFor(styleId: string, palette: string[]) {
  const floor = getStyleSpec(styleId).floor(palette);
  return { tint: mix(floor, "#000000", 0.8), darkFloor: isDark(floor) };
}
