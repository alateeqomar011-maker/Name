import { orientationOf, type Orientation } from "@/lib/formats";
import type { AdContent, BrandStyle, DesignDoc, Layer, TextLayer } from "./types";

// Layout templates. Each template places the same content slots differently
// for square, portrait, tall (stories), landscape and wide (banner) canvases.

export interface TemplateInput {
  W: number;
  H: number;
  content: AdContent;
  brand?: Partial<BrandStyle> | null;
  productAssetId: string | null;
  photoAssetId?: string | null;
  rtl?: boolean;
}

export interface AdTemplate {
  id: string;
  name: string;
  description: string;
  /** CSS background for the template thumbnail. */
  preview: string;
  palette: BrandStyle;
  build: (input: TemplateInput) => DesignDoc;
}

type Box = [x: number, y: number, w: number, h: number];
type ByOrientation<T> = Record<Orientation, T>;

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

function pick<T>(o: Orientation, v: ByOrientation<T>): T {
  return v[o];
}

function merge(palette: BrandStyle, brand?: Partial<BrandStyle> | null): BrandStyle {
  return { ...palette, ...Object.fromEntries(Object.entries(brand ?? {}).filter(([, v]) => Boolean(v))) } as BrandStyle;
}

function text(
  role: TextLayer["role"],
  value: string | undefined,
  box: Box,
  o: Partial<TextLayer> & { font: string; size: number; color: string },
): TextLayer | null {
  if (!value?.trim()) return null;
  return {
    id: uid("t"),
    type: "text",
    role,
    text: value,
    x: box[0],
    y: box[1],
    w: box[2],
    h: box[3],
    weight: 700,
    align: "center",
    valign: "middle",
    lineHeight: 1.08,
    autoFit: true,
    ...o,
  };
}

function product(id: string | null, box: Box, shadow = true): Layer | null {
  if (!id) return null;
  return { id: uid("i"), type: "image", role: "product", assetId: id, fit: "contain", shadow, x: box[0], y: box[1], w: box[2], h: box[3] };
}

function cta(value: string | undefined, box: Box, b: BrandStyle, color = "#ffffff", bg = b.primary): TextLayer | null {
  return text("cta", value, box, {
    font: b.bodyFont,
    size: 0.032,
    weight: 700,
    color,
    autoFit: true,
    lineHeight: 1,
    bg: { color: bg, radius: 999, padX: 0.9, padY: 0.55 },
  });
}

function compact(layers: (Layer | null)[]): Layer[] {
  return layers.filter(Boolean) as Layer[];
}

const ALIGN = (rtl?: boolean) => (rtl ? "right" : "left") as "left" | "right";

// ── Templates ────────────────────────────────────────────────────────────

const spotlight: AdTemplate = {
  id: "spotlight",
  name: "Spotlight",
  description: "Product hero with a centered headline and button.",
  preview: "linear-gradient(180deg,#f6f1ea,#e6dccd)",
  palette: { primary: "#141414", secondary: "#6b5e4f", accent: "#ff6b4a", background: "#f4eee6", text: "#141414", headingFont: "Poppins", bodyFont: "Inter Variable" },
  build: ({ W, H, content, brand, productAssetId }) => {
    const b = merge(spotlight.palette, brand);
    const o = orientationOf(W, H);
    const L = pick<{ head: Box; sub: Box; prod: Box; cta: Box; badge: Box }>(o, {
      square: { head: [0.08, 0.06, 0.84, 0.14], sub: [0.12, 0.2, 0.76, 0.06], prod: [0.14, 0.28, 0.72, 0.55], cta: [0.3, 0.86, 0.4, 0.075], badge: [0.76, 0.27, 0.17, 0.17] },
      portrait: { head: [0.08, 0.06, 0.84, 0.13], sub: [0.12, 0.19, 0.76, 0.055], prod: [0.12, 0.27, 0.76, 0.58], cta: [0.3, 0.875, 0.4, 0.065], badge: [0.76, 0.26, 0.18, 0.144] },
      tall: { head: [0.08, 0.13, 0.84, 0.11], sub: [0.12, 0.24, 0.76, 0.05], prod: [0.1, 0.31, 0.8, 0.43], cta: [0.28, 0.76, 0.44, 0.05], badge: [0.74, 0.3, 0.2, 0.11] },
      landscape: { head: [0.52, 0.2, 0.43, 0.24], sub: [0.52, 0.45, 0.43, 0.12], prod: [0.04, 0.08, 0.44, 0.84], cta: [0.52, 0.64, 0.24, 0.12], badge: [0.36, 0.06, 0.13, 0.22] },
      wide: { head: [0.38, 0.14, 0.56, 0.36], sub: [0.38, 0.5, 0.56, 0.16], prod: [0.04, 0.06, 0.3, 0.88], cta: [0.38, 0.72, 0.16, 0.18], badge: [0.27, 0.05, 0.08, 0.26] },
    });
    const side = o === "landscape" || o === "wide";
    return {
      version: 1,
      templateId: "spotlight",
      background: { type: "gradient", color: b.background, color2: shadeHex(b.background, -0.08), angle: 180 },
      layers: compact([
        product(productAssetId, L.prod),
        text("headline", content.headline, L.head, { font: b.headingFont, size: side ? 0.06 : 0.085, color: b.text, weight: 800, align: side ? "left" : "center" }),
        text("subheadline", content.subheadline, L.sub, { font: b.bodyFont, size: side ? 0.024 : 0.034, color: b.secondary, weight: 500, align: side ? "left" : "center", lineHeight: 1.25 }),
        cta(content.cta, L.cta, b),
        content.badge
          ? text("badge", content.badge, L.badge, { font: b.headingFont, size: 0.045, color: "#ffffff", weight: 800, bg: { color: b.accent, radius: 999, padX: 0.4, padY: 0.4, shape: "burst" } })
          : null,
      ]),
    };
  },
};

const split: AdTemplate = {
  id: "split",
  name: "Split panel",
  description: "Bold color panel for the message, product on the other side.",
  preview: "linear-gradient(90deg,#1b2a4a 0 48%,#eef1f6 48%)",
  palette: { primary: "#1b2a4a", secondary: "#c9d4ea", accent: "#ffc65c", background: "#eef1f6", text: "#ffffff", headingFont: "Montserrat", bodyFont: "Inter Variable" },
  build: ({ W, H, content, brand, productAssetId, rtl }) => {
    const b = merge(split.palette, brand);
    const o = orientationOf(W, H);
    const side = o === "landscape" || o === "wide" || o === "square";
    const panel: Box = side ? (rtl ? [0.52, 0, 0.48, 1] : [0, 0, 0.48, 1]) : [0, 0, 1, o === "tall" ? 0.44 : 0.42];
    const tx = side ? panel[0] + 0.05 : 0.08;
    const tw = side ? panel[2] - 0.1 : 0.84;
    const L = pick<{ head: Box; sub: Box; cta: Box; prod: Box; badge: Box }>(o, {
      square: { head: [tx, 0.24, tw, 0.28], sub: [tx, 0.53, tw, 0.12], cta: [tx, 0.7, 0.3, 0.075], prod: rtl ? [0.04, 0.12, 0.46, 0.76] : [0.5, 0.12, 0.46, 0.76], badge: [tx, 0.1, 0.18, 0.08] },
      portrait: { head: [tx, 0.07, tw, 0.18], sub: [tx, 0.26, tw, 0.07], cta: [0.3, 0.88, 0.4, 0.06], prod: [0.14, 0.44, 0.72, 0.42], badge: [0.74, 0.37, 0.18, 0.06] },
      tall: { head: [tx, 0.13, tw, 0.17], sub: [tx, 0.3, tw, 0.07], cta: [0.28, 0.77, 0.44, 0.05], prod: [0.12, 0.47, 0.76, 0.28], badge: [0.72, 0.4, 0.2, 0.05] },
      landscape: { head: [tx, 0.2, tw, 0.3], sub: [tx, 0.52, tw, 0.14], cta: [tx, 0.72, 0.22, 0.12], prod: rtl ? [0.04, 0.08, 0.44, 0.84] : [0.52, 0.08, 0.44, 0.84], badge: [tx, 0.07, 0.12, 0.1] },
      wide: { head: [tx, 0.14, tw, 0.38], sub: [tx, 0.52, tw, 0.16], cta: [tx, 0.72, 0.16, 0.18], prod: rtl ? [0.06, 0.06, 0.4, 0.88] : [0.54, 0.06, 0.4, 0.88], badge: [tx + tw - 0.1, 0.06, 0.1, 0.16] },
    });
    const align = side ? ALIGN(rtl) : "center";
    return {
      version: 1,
      templateId: "split",
      background: { type: "solid", color: b.background },
      layers: compact([
        { id: uid("s"), type: "shape", shape: "rect", fill: b.primary, x: panel[0], y: panel[1], w: panel[2], h: panel[3] },
        product(productAssetId, L.prod),
        content.badge ? text("badge", content.badge, L.badge, { font: b.bodyFont, size: 0.026, color: b.primary, weight: 800, bg: { color: b.accent, radius: 999, padX: 0.7, padY: 0.45 }, align }) : null,
        text("headline", content.headline, L.head, { font: b.headingFont, size: 0.075, color: b.text, weight: 800, align, valign: side ? "bottom" : "middle" }),
        text("subheadline", content.subheadline, L.sub, { font: b.bodyFont, size: 0.03, color: b.secondary, weight: 500, align, lineHeight: 1.3, valign: "top" }),
        cta(content.cta, L.cta, b, b.primary, b.accent),
      ]).map((l) => (l.type === "text" && l.role === "cta" ? { ...l, align } : l)),
    };
  },
};

const sale: AdTemplate = {
  id: "sale",
  name: "Mega sale",
  description: "Loud color, giant discount burst — built for promotions.",
  preview: "radial-gradient(circle at 75% 25%,#ffe14d 0 14%,transparent 15%),linear-gradient(135deg,#ff3d3d,#ff8a3d)",
  palette: { primary: "#ff3d3d", secondary: "#ffe6d6", accent: "#ffe14d", background: "#ff4d3d", text: "#ffffff", headingFont: "Bebas Neue", bodyFont: "Poppins" },
  build: ({ W, H, content, brand, productAssetId }) => {
    const b = merge(sale.palette, brand);
    const o = orientationOf(W, H);
    const L = pick<{ head: Box; sub: Box; prod: Box; badge: Box; cta: Box }>(o, {
      square: { head: [0.06, 0.05, 0.6, 0.2], sub: [0.06, 0.25, 0.55, 0.08], badge: [0.66, 0.05, 0.28, 0.28], prod: [0.12, 0.34, 0.76, 0.5], cta: [0.3, 0.87, 0.4, 0.075] },
      portrait: { head: [0.06, 0.05, 0.6, 0.17], sub: [0.06, 0.22, 0.55, 0.07], badge: [0.66, 0.05, 0.28, 0.224], prod: [0.1, 0.32, 0.8, 0.52], cta: [0.3, 0.875, 0.4, 0.065] },
      tall: { head: [0.06, 0.13, 0.6, 0.12], sub: [0.06, 0.25, 0.56, 0.05], badge: [0.64, 0.12, 0.3, 0.17], prod: [0.08, 0.33, 0.84, 0.4], cta: [0.28, 0.76, 0.44, 0.05] },
      landscape: { head: [0.05, 0.12, 0.45, 0.32], sub: [0.05, 0.46, 0.42, 0.14], badge: [0.38, 0.55, 0.16, 0.3], prod: [0.52, 0.06, 0.44, 0.88], cta: [0.05, 0.7, 0.24, 0.13] },
      wide: { head: [0.04, 0.1, 0.36, 0.5], sub: [0.04, 0.6, 0.34, 0.16], badge: [0.4, 0.12, 0.13, 0.76], prod: [0.58, 0.04, 0.36, 0.92], cta: [0.04, 0.78, 0.16, 0.16] },
    });
    const side = o === "landscape" || o === "wide";
    return {
      version: 1,
      templateId: "sale",
      background: { type: "gradient", color: b.background, color2: shadeHex(b.background, 0.25), angle: 135 },
      layers: compact([
        product(productAssetId, L.prod),
        text("headline", content.headline, L.head, { font: b.headingFont, size: side ? 0.1 : 0.13, color: b.text, weight: 400, align: "left", lineHeight: 0.95, uppercase: true }),
        text("subheadline", content.subheadline, L.sub, { font: b.bodyFont, size: 0.032, color: b.secondary, weight: 600, align: "left", lineHeight: 1.25, valign: "top" }),
        text("badge", content.badge || content.price, L.badge, { font: b.headingFont, size: 0.1, color: "#111111", weight: 400, bg: { color: b.accent, radius: 999, padX: 0.3, padY: 0.3, shape: "burst" } }),
        cta(content.cta, L.cta, b, "#111111", "#ffffff"),
      ]).map((l) => (side && l.type === "text" && l.role === "cta" ? { ...l, align: "left" as const } : l)),
    };
  },
};

const luxe: AdTemplate = {
  id: "luxe",
  name: "Minimal luxe",
  description: "Dark, elegant serif typography with a fine gold accent.",
  preview: "radial-gradient(circle at 50% 45%,#2a2622,#0f0e0d 70%)",
  palette: { primary: "#c9a45c", secondary: "#a69a8a", accent: "#c9a45c", background: "#0f0e0d", text: "#f5efe6", headingFont: "Playfair Display", bodyFont: "Inter Variable" },
  build: ({ W, H, content, brand, productAssetId }) => {
    const b = merge(luxe.palette, brand);
    const o = orientationOf(W, H);
    const L = pick<{ tag: Box; head: Box; line: Box; sub: Box; prod: Box; cta: Box }>(o, {
      square: { tag: [0.2, 0.07, 0.6, 0.04], head: [0.1, 0.11, 0.8, 0.13], line: [0.46, 0.255, 0.08, 0.003], sub: [0.15, 0.27, 0.7, 0.05], prod: [0.18, 0.34, 0.64, 0.5], cta: [0.3, 0.87, 0.4, 0.06] },
      portrait: { tag: [0.2, 0.07, 0.6, 0.035], head: [0.1, 0.105, 0.8, 0.11], line: [0.46, 0.225, 0.08, 0.0025], sub: [0.15, 0.235, 0.7, 0.045], prod: [0.15, 0.3, 0.7, 0.55], cta: [0.3, 0.88, 0.4, 0.05] },
      tall: { tag: [0.2, 0.14, 0.6, 0.025], head: [0.1, 0.17, 0.8, 0.09], line: [0.46, 0.27, 0.08, 0.002], sub: [0.15, 0.28, 0.7, 0.04], prod: [0.12, 0.34, 0.76, 0.4], cta: [0.3, 0.77, 0.4, 0.04] },
      landscape: { tag: [0.52, 0.2, 0.42, 0.06], head: [0.52, 0.27, 0.42, 0.22], line: [0.52, 0.52, 0.06, 0.005], sub: [0.52, 0.55, 0.42, 0.1], prod: [0.06, 0.08, 0.4, 0.84], cta: [0.52, 0.7, 0.2, 0.08] },
      wide: { tag: [0.42, 0.14, 0.5, 0.1], head: [0.42, 0.25, 0.5, 0.32], line: [0.42, 0.6, 0.05, 0.008], sub: [0.42, 0.64, 0.5, 0.14], prod: [0.08, 0.06, 0.28, 0.88], cta: [0.42, 0.8, 0.16, 0.12] },
    });
    const side = o === "landscape" || o === "wide";
    const align = side ? "left" : "center";
    return {
      version: 1,
      templateId: "luxe",
      background: { type: "gradient", color: shadeHex(b.background, 0.12), color2: b.background, angle: 180 },
      layers: compact([
        { id: uid("s"), type: "shape", shape: "circle", fill: shadeHex(b.background, 0.1), x: L.prod[0] + L.prod[2] * 0.1, y: L.prod[1] + L.prod[3] * 0.08, w: L.prod[2] * 0.8, h: L.prod[3] * 0.84, opacity: 0.7 },
        product(productAssetId, L.prod),
        text("tagline", content.tagline || content.brand, L.tag, { font: b.bodyFont, size: 0.018, color: b.accent, weight: 600, align, uppercase: true, letterSpacing: 0.25 }),
        text("headline", content.headline, L.head, { font: b.headingFont, size: side ? 0.055 : 0.07, color: b.text, weight: 600, align, italic: false }),
        { id: uid("s"), type: "shape", shape: "line", fill: b.accent, x: L.line[0], y: L.line[1], w: L.line[2], h: L.line[3] },
        text("subheadline", content.subheadline, L.sub, { font: b.bodyFont, size: 0.024, color: b.secondary, weight: 400, align, lineHeight: 1.4 }),
        text("cta", content.cta, L.cta, { font: b.bodyFont, size: 0.022, color: b.text, weight: 600, align, uppercase: true, letterSpacing: 0.18, bg: { color: "rgba(255,255,255,0.0)", radius: 0, padX: 0, padY: 0.4 } }),
      ]),
    };
  },
};

const launch: AdTemplate = {
  id: "launch",
  name: "New arrival",
  description: "Fresh gradient with a NEW badge for product launches.",
  preview: "linear-gradient(160deg,#ece8ff,#ffffff 60%,#ffe9e2)",
  palette: { primary: "#6d5bff", secondary: "#4c4675", accent: "#ff7a59", background: "#ece8ff", text: "#16123a", headingFont: "Outfit", bodyFont: "Inter Variable" },
  build: ({ W, H, content, brand, productAssetId, rtl }) => {
    const b = merge(launch.palette, brand);
    const o = orientationOf(W, H);
    const align = ALIGN(rtl);
    const L = pick<{ badge: Box; head: Box; sub: Box; prod: Box; cta: Box }>(o, {
      square: { badge: [0.07, 0.07, 0.2, 0.06], head: [0.07, 0.15, 0.62, 0.22], sub: [0.07, 0.38, 0.5, 0.1], prod: [0.36, 0.3, 0.6, 0.66], cta: [0.07, 0.52, 0.3, 0.075] },
      portrait: { badge: [0.07, 0.06, 0.2, 0.05], head: [0.07, 0.12, 0.8, 0.16], sub: [0.07, 0.29, 0.7, 0.07], prod: [0.14, 0.38, 0.78, 0.56], cta: [0.07, 0.38, 0.32, 0.06] },
      tall: { badge: [0.07, 0.13, 0.22, 0.035], head: [0.07, 0.17, 0.84, 0.13], sub: [0.07, 0.3, 0.8, 0.06], prod: [0.1, 0.38, 0.82, 0.38], cta: [0.07, 0.77, 0.4, 0.05] },
      landscape: { badge: [0.06, 0.12, 0.12, 0.09], head: [0.06, 0.24, 0.48, 0.3], sub: [0.06, 0.55, 0.44, 0.13], prod: [0.52, 0.04, 0.44, 0.92], cta: [0.06, 0.73, 0.22, 0.12] },
      wide: { badge: [0.05, 0.1, 0.08, 0.16], head: [0.05, 0.28, 0.5, 0.36], sub: [0.05, 0.64, 0.44, 0.14], prod: [0.6, 0.04, 0.34, 0.92], cta: [0.36, 0.66, 0.16, 0.18] },
    });
    const mirror = (bx: Box): Box => (rtl ? [1 - bx[0] - bx[2], bx[1], bx[2], bx[3]] : bx);
    return {
      version: 1,
      templateId: "launch",
      background: { type: "gradient", color: b.background, color2: "#ffffff", angle: 160 },
      layers: compact([
        { id: uid("s"), type: "shape", shape: "circle", fill: b.accent, opacity: 0.18, ...boxObj(mirror([L.prod[0] + L.prod[2] * 0.15, L.prod[1] + L.prod[3] * 0.12, L.prod[2] * 0.75, L.prod[3] * 0.75])) },
        product(productAssetId, mirror(L.prod)),
        text("badge", content.badge || "NEW", mirror(L.badge), { font: b.bodyFont, size: 0.024, color: "#ffffff", weight: 800, uppercase: true, letterSpacing: 0.12, align, bg: { color: b.primary, radius: 999, padX: 0.8, padY: 0.5 } }),
        text("headline", content.headline, mirror(L.head), { font: b.headingFont, size: 0.08, color: b.text, weight: 800, align, valign: "bottom" }),
        text("subheadline", content.subheadline, mirror(L.sub), { font: b.bodyFont, size: 0.03, color: b.secondary, weight: 500, align, lineHeight: 1.3, valign: "top" }),
        { ...(cta(content.cta, mirror(L.cta), b) as TextLayer), align } as TextLayer,
      ]).filter((l) => !(l.type === "text" && l.role === "cta" && !content.cta)),
    };
  },
};

const photo: AdTemplate = {
  id: "photo",
  name: "Photo overlay",
  description: "Full-bleed studio photo with text over a soft gradient.",
  preview: "linear-gradient(180deg,#c9b8a6 0%,#7a6b5e 55%,#1d1916 100%)",
  palette: { primary: "#ffffff", secondary: "#e8e2da", accent: "#ff7a59", background: "#1d1916", text: "#ffffff", headingFont: "DM Serif Display", bodyFont: "Inter Variable" },
  build: ({ W, H, content, brand, productAssetId, photoAssetId, rtl }) => {
    const b = merge(photo.palette, brand);
    const o = orientationOf(W, H);
    const side = o === "landscape" || o === "wide";
    const align = side ? ALIGN(rtl) : "center";
    const L = pick<{ head: Box; sub: Box; cta: Box }>(o, {
      square: { head: [0.08, 0.6, 0.84, 0.16], sub: [0.12, 0.76, 0.76, 0.06], cta: [0.32, 0.86, 0.36, 0.07] },
      portrait: { head: [0.08, 0.62, 0.84, 0.14], sub: [0.12, 0.76, 0.76, 0.05], cta: [0.32, 0.86, 0.36, 0.06] },
      tall: { head: [0.08, 0.56, 0.84, 0.11], sub: [0.12, 0.67, 0.76, 0.05], cta: [0.3, 0.74, 0.4, 0.045] },
      landscape: { head: [0.05, 0.42, 0.5, 0.22], sub: [0.05, 0.64, 0.46, 0.1], cta: [0.05, 0.78, 0.2, 0.1] },
      wide: { head: [0.04, 0.2, 0.42, 0.38], sub: [0.04, 0.58, 0.4, 0.14], cta: [0.04, 0.76, 0.14, 0.16] },
    });
    const bg = photoAssetId ?? null;
    return {
      version: 1,
      templateId: "photo",
      background: bg
        ? { type: "image", color: b.background, assetId: bg, overlay: { color: "#000000", opacity: 0.0 } }
        : { type: "gradient", color: "#d8cbbd", color2: "#8c7b6b", angle: 180 },
      layers: compact([
        bg ? null : product(productAssetId, side ? [0.5, 0.08, 0.46, 0.84] : [0.15, 0.08, 0.7, 0.5]),
        {
          id: uid("s"),
          type: "shape",
          shape: "rect",
          fill: side ? "linear:90:#000000cc:#00000000" : "linear:180:#00000000:#000000d9",
          x: 0,
          y: side ? 0 : 0.42,
          w: side ? 0.62 : 1,
          h: side ? 1 : 0.58,
        },
        text("headline", content.headline, L.head, { font: b.headingFont, size: side ? 0.055 : 0.08, color: b.text, weight: 400, align, valign: "bottom" }),
        text("subheadline", content.subheadline, L.sub, { font: b.bodyFont, size: 0.028, color: b.secondary, weight: 500, align, lineHeight: 1.3 }),
        { ...(cta(content.cta, L.cta, b, "#111111", "#ffffff") as TextLayer), align } as TextLayer,
      ]).filter((l) => !(l.type === "text" && l.role === "cta" && !content.cta)),
    };
  },
};

const priceTag: AdTemplate = {
  id: "price",
  name: "Price tag",
  description: "Clean product shot with a bold price card.",
  preview: "linear-gradient(180deg,#f7f7f5 0 70%,#111 70%)",
  palette: { primary: "#111111", secondary: "#6b6b6b", accent: "#e6463c", background: "#f7f7f5", text: "#111111", headingFont: "Space Grotesk", bodyFont: "Inter Variable" },
  build: ({ W, H, content, brand, productAssetId, rtl }) => {
    const b = merge(priceTag.palette, brand);
    const o = orientationOf(W, H);
    const side = o === "landscape" || o === "wide";
    const align = side ? ALIGN(rtl) : "center";
    const L = pick<{ head: Box; sub: Box; prod: Box; card: Box; price: Box; old: Box; cta: Box }>(o, {
      square: { head: [0.08, 0.06, 0.84, 0.11], sub: [0.12, 0.17, 0.76, 0.05], prod: [0.16, 0.24, 0.68, 0.5], card: [0.25, 0.76, 0.5, 0.17], price: [0.27, 0.77, 0.46, 0.1], old: [0.27, 0.865, 0.46, 0.05], cta: [0.32, 0.94, 0.36, 0.0] },
      portrait: { head: [0.08, 0.05, 0.84, 0.1], sub: [0.12, 0.15, 0.76, 0.045], prod: [0.14, 0.22, 0.72, 0.52], card: [0.25, 0.77, 0.5, 0.15], price: [0.27, 0.78, 0.46, 0.085], old: [0.27, 0.86, 0.46, 0.045], cta: [0.32, 0.94, 0.36, 0.0] },
      tall: { head: [0.08, 0.13, 0.84, 0.08], sub: [0.12, 0.21, 0.76, 0.04], prod: [0.12, 0.27, 0.76, 0.4], card: [0.22, 0.69, 0.56, 0.11], price: [0.24, 0.7, 0.52, 0.06], old: [0.24, 0.76, 0.52, 0.035], cta: [0.3, 0.82, 0.4, 0.0] },
      landscape: { head: [0.52, 0.12, 0.42, 0.2], sub: [0.52, 0.33, 0.42, 0.1], prod: [0.04, 0.06, 0.44, 0.88], card: [0.52, 0.5, 0.32, 0.32], price: [0.54, 0.52, 0.28, 0.18], old: [0.54, 0.7, 0.28, 0.09], cta: [0.52, 0.86, 0.2, 0.0] },
      wide: { head: [0.38, 0.12, 0.34, 0.34], sub: [0.38, 0.5, 0.34, 0.16], prod: [0.04, 0.05, 0.3, 0.9], card: [0.74, 0.18, 0.22, 0.64], price: [0.75, 0.24, 0.2, 0.32], old: [0.75, 0.56, 0.2, 0.16], cta: [0.38, 0.74, 0.14, 0.0] },
    });
    return {
      version: 1,
      templateId: "price",
      background: { type: "solid", color: b.background },
      layers: compact([
        { id: uid("s"), type: "shape", shape: "circle", fill: shadeHex(b.background, -0.05), ...boxObj([L.prod[0] + L.prod[2] * 0.1, L.prod[1] + L.prod[3] * 0.1, L.prod[2] * 0.8, L.prod[3] * 0.8]) },
        product(productAssetId, L.prod),
        text("headline", content.headline, L.head, { font: b.headingFont, size: side ? 0.05 : 0.07, color: b.text, weight: 700, align }),
        text("subheadline", content.subheadline, L.sub, { font: b.bodyFont, size: 0.026, color: b.secondary, weight: 500, align, lineHeight: 1.3 }),
        content.price ? { id: uid("s"), type: "shape", shape: "rect", fill: b.primary, radius: 0.04, ...boxObj(L.card) } : null,
        text("price", content.price, L.price, { font: b.headingFont, size: 0.09, color: "#ffffff", weight: 700 }),
        text("oldPrice", content.oldPrice, L.old, { font: b.bodyFont, size: 0.03, color: "#bdbdbd", weight: 500, strike: true }),
        content.badge
          ? text("badge", content.badge, [L.card[0] + L.card[2] - 0.08, L.card[1] - 0.06, 0.14, 0.12], { font: b.headingFont, size: 0.03, color: "#ffffff", weight: 800, bg: { color: b.accent, radius: 999, padX: 0.3, padY: 0.3, shape: "circle" } })
          : null,
      ]),
    };
  },
};

const bold: AdTemplate = {
  id: "bold",
  name: "Bold type",
  description: "Oversized headline behind the product — editorial and loud.",
  preview: "linear-gradient(180deg,#ffd84d,#ffc61a)",
  palette: { primary: "#111111", secondary: "#3d3416", accent: "#ffffff", background: "#ffd84d", text: "#111111", headingFont: "Archivo Black", bodyFont: "Inter Variable" },
  build: ({ W, H, content, brand, productAssetId }) => {
    const b = merge(bold.palette, brand);
    const o = orientationOf(W, H);
    const side = o === "landscape" || o === "wide";
    const L = pick<{ big: Box; prod: Box; sub: Box; cta: Box }>(o, {
      square: { big: [0.04, 0.08, 0.92, 0.5], prod: [0.17, 0.22, 0.66, 0.6], sub: [0.1, 0.83, 0.5, 0.08], cta: [0.62, 0.83, 0.32, 0.08] },
      portrait: { big: [0.04, 0.08, 0.92, 0.46], prod: [0.14, 0.24, 0.72, 0.58], sub: [0.08, 0.86, 0.5, 0.07], cta: [0.62, 0.86, 0.32, 0.065] },
      tall: { big: [0.04, 0.14, 0.92, 0.36], prod: [0.1, 0.28, 0.8, 0.44], sub: [0.08, 0.74, 0.84, 0.04], cta: [0.3, 0.79, 0.4, 0.045] },
      landscape: { big: [0.03, 0.08, 0.94, 0.6], prod: [0.3, 0.12, 0.4, 0.8], sub: [0.04, 0.8, 0.4, 0.12], cta: [0.74, 0.8, 0.22, 0.12] },
      wide: { big: [0.03, 0.06, 0.94, 0.7], prod: [0.36, 0.06, 0.28, 0.9], sub: [0.04, 0.74, 0.3, 0.18], cta: [0.78, 0.74, 0.18, 0.18] },
    });
    return {
      version: 1,
      templateId: "bold",
      background: { type: "solid", color: b.background },
      layers: compact([
        text("headline", content.headline, L.big, { font: b.headingFont, size: side ? 0.16 : 0.2, color: b.text, weight: 400, uppercase: true, lineHeight: 0.92 }),
        product(productAssetId, L.prod),
        text("subheadline", content.subheadline, L.sub, { font: b.bodyFont, size: 0.026, color: b.secondary, weight: 600, align: o === "tall" ? "center" : "left", lineHeight: 1.25 }),
        cta(content.cta, L.cta, b, b.background, b.primary),
      ]),
    };
  },
};

const festive: AdTemplate = {
  id: "festive",
  name: "Festive night",
  description: "Crescent, stars and gold — for Ramadan, Eid and evening campaigns.",
  preview: "radial-gradient(circle at 78% 22%,#e9c46a 0 7%,transparent 8%),linear-gradient(180deg,#14204a,#0a1230)",
  palette: { primary: "#e9c46a", secondary: "#c9cfe6", accent: "#e9c46a", background: "#0f1a42", text: "#f7f1e1", headingFont: "El Messiri", bodyFont: "Cairo" },
  build: ({ W, H, content, brand, productAssetId }) => {
    const b = merge(festive.palette, brand);
    const o = orientationOf(W, H);
    const side = o === "landscape" || o === "wide";
    const L = pick<{ head: Box; sub: Box; prod: Box; cta: Box; moon: Box }>(o, {
      square: { head: [0.08, 0.08, 0.84, 0.13], sub: [0.12, 0.21, 0.76, 0.06], prod: [0.17, 0.3, 0.66, 0.52], cta: [0.3, 0.86, 0.4, 0.075], moon: [0.8, 0.05, 0.12, 0.12] },
      portrait: { head: [0.08, 0.08, 0.84, 0.12], sub: [0.12, 0.2, 0.76, 0.05], prod: [0.14, 0.28, 0.72, 0.56], cta: [0.3, 0.875, 0.4, 0.065], moon: [0.8, 0.04, 0.12, 0.096] },
      tall: { head: [0.08, 0.14, 0.84, 0.1], sub: [0.12, 0.24, 0.76, 0.045], prod: [0.1, 0.31, 0.8, 0.42], cta: [0.28, 0.76, 0.44, 0.05], moon: [0.78, 0.06, 0.14, 0.079] },
      landscape: { head: [0.52, 0.2, 0.42, 0.24], sub: [0.52, 0.46, 0.42, 0.12], prod: [0.06, 0.08, 0.42, 0.84], cta: [0.52, 0.66, 0.24, 0.12], moon: [0.86, 0.06, 0.08, 0.14] },
      wide: { head: [0.4, 0.16, 0.5, 0.36], sub: [0.4, 0.54, 0.5, 0.16], prod: [0.06, 0.06, 0.28, 0.88], cta: [0.4, 0.74, 0.16, 0.18], moon: [0.9, 0.08, 0.06, 0.2] },
    });
    const align = side ? "left" : "center";
    const stars: Layer[] = Array.from({ length: 14 }, (_, i) => {
      const r = 0.004 + ((i * 37) % 7) * 0.0012;
      return { id: uid("st"), type: "shape", shape: "circle", fill: "#ffffff", opacity: 0.35 + ((i * 13) % 5) * 0.12, x: ((i * 0.137 + 0.05) % 0.95), y: ((i * 0.071 + 0.02) % 0.3), w: r, h: (r * W) / H };
    });
    const moonX = L.moon[0];
    return {
      version: 1,
      templateId: "festive",
      background: { type: "gradient", color: shadeHex(b.background, -0.3), color2: b.background, angle: 180 },
      layers: compact([
        ...stars,
        { id: uid("s"), type: "shape", shape: "circle", fill: b.accent, x: moonX, y: L.moon[1], w: L.moon[2], h: L.moon[3] },
        { id: uid("s"), type: "shape", shape: "circle", fill: shadeHex(b.background, -0.25), x: moonX + L.moon[2] * 0.32, y: L.moon[1] - L.moon[3] * 0.1, w: L.moon[2] * 0.9, h: L.moon[3] * 0.9 },
        { id: uid("s"), type: "shape", shape: "circle", fill: b.accent, opacity: 0.12, ...boxObj([L.prod[0] + L.prod[2] * 0.1, L.prod[1] + L.prod[3] * 0.1, L.prod[2] * 0.8, L.prod[3] * 0.8]) },
        product(productAssetId, L.prod),
        text("headline", content.headline, L.head, { font: b.headingFont, size: side ? 0.055 : 0.075, color: b.text, weight: 700, align }),
        text("subheadline", content.subheadline, L.sub, { font: b.bodyFont, size: 0.028, color: b.secondary, weight: 500, align, lineHeight: 1.35 }),
        { ...(cta(content.cta, L.cta, b, "#14204a", b.accent) as TextLayer), align } as TextLayer,
      ]).filter((l) => !(l.type === "text" && l.role === "cta" && !content.cta)),
    };
  },
};

export const TEMPLATES: AdTemplate[] = [spotlight, split, sale, luxe, launch, photo, priceTag, bold, festive];
export const TEMPLATE_MAP = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

export function buildFromTemplate(templateId: string, input: TemplateInput): DesignDoc {
  return (TEMPLATE_MAP[templateId] ?? spotlight).build(input);
}

function boxObj(b: Box) {
  return { x: b[0], y: b[1], w: b[2], h: b[3] };
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex color. */
export function shadeHex(hex: string, amount: number) {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;
  const n = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const t = amount >= 0 ? 255 : 0;
  const a = Math.abs(amount);
  return `#${n.map((v) => Math.round(v + (t - v) * a).toString(16).padStart(2, "0")).join("")}`;
}

/** Updates the text of every layer with a matching role (used when applying AI copy). */
export function applyContent(doc: DesignDoc, content: Partial<AdContent>): DesignDoc {
  const map: Record<string, string | undefined> = {
    headline: content.headline,
    subheadline: content.subheadline,
    cta: content.cta,
    badge: content.badge,
    price: content.price,
    oldPrice: content.oldPrice,
    tagline: content.tagline,
    brand: content.brand,
  };
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.type === "text" && l.role && map[l.role] !== undefined && map[l.role] !== "" ? { ...l, text: map[l.role]! } : l)),
  };
}

/** Extracts the current text content of a design by role. */
export function contentOf(doc: DesignDoc): AdContent {
  const get = (role: string) => (doc.layers.find((l) => l.type === "text" && l.role === role) as TextLayer | undefined)?.text;
  return {
    headline: get("headline") ?? "",
    subheadline: get("subheadline"),
    cta: get("cta"),
    badge: get("badge"),
    price: get("price"),
    oldPrice: get("oldPrice"),
    tagline: get("tagline"),
    brand: get("brand"),
  };
}
