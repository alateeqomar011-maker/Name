import "server-only";
import sharp, { type OverlayOptions, type Sharp } from "sharp";
import {
  canvasSize,
  getStyle,
  type AspectId,
  type Layout,
  type ShadowKind,
} from "@/lib/studio-styles";
import { buildBackdropSvg, getStyleSpec, shadowTintFor, type Placement } from "./backdrops";
import { hexToRgb, seededRandom } from "./color";

// The compositing engine. The product's pixels are never regenerated: the
// cut-out is scaled with a high-quality Lanczos filter and layered over the
// scene, with physically-motivated contact shadows, cast shadows and floor
// reflections built from the product's own silhouette.

export interface RenderRecipe {
  version: 1;
  styleId: string;
  aspect: AspectId;
  layout: Layout;
  variation: number;
  palette?: string[];
  /** Product size multiplier (1 = style default). */
  scale?: number;
  /** Horizontal shift as a fraction of canvas width (-0.3..0.3). */
  offsetX?: number;
  shadow?: ShadowKind;
  shadowStrength?: number;
  reflection?: boolean;
  /** Light comes from the left (-1), front (0) or right (1). */
  lightSide?: -1 | 0 | 1;
  cutoutAssetId: string;
  /** For AI scenes: the generated background and the product box used to create it. */
  sceneAssetId?: string;
  productBox?: { left: number; top: number; width: number; height: number };
  /** Additional products (bundle images). */
  extraCutoutAssetIds?: string[];
}

export interface ProductSource {
  data: Buffer;
  width: number;
  height: number;
}

const VARIATION_SCALE = [1, 0.9, 1.06, 0.95];

export function resolvePalette(styleId: string, variation: number, override?: string[]) {
  if (override?.length) return override;
  const style = getStyle(styleId);
  const palettes = style?.palettes?.length ? style.palettes : [["#f5f5f3", "#e6e6e2"]];
  return palettes[variation % palettes.length];
}

/** Computes where the product sits on the canvas for a given style and layout. */
export function computePlacement(
  recipe: Pick<RenderRecipe, "styleId" | "layout" | "variation" | "scale" | "offsetX">,
  W: number,
  H: number,
  cw: number,
  ch: number,
): Placement {
  const spec = getStyleSpec(recipe.styleId);
  const layout = recipe.layout;
  const marketplace = recipe.styleId === "marketplace-white" || recipe.styleId === "transparent";
  const vScale = (marketplace ? 1 : VARIATION_SCALE[recipe.variation % VARIATION_SCALE.length]) * (recipe.scale ?? 1);

  let fillH = spec.fillH ?? (layout === "standing" ? 0.62 : layout === "floating" ? 0.64 : 0.72);
  let fillW = spec.fillW ?? (layout === "standing" ? 0.7 : 0.74);
  if (marketplace) {
    fillH = spec.fillH ?? 0.85;
    fillW = spec.fillW ?? 0.85;
  }
  const horizon = H * (spec.horizon ?? 0.7);
  const cxBase = W * (0.5 + (recipe.offsetX ?? 0));

  // Podium styles: the product stands on a pedestal whose size follows the product.
  if (spec.podium && layout === "standing") {
    const topY = H * 0.71;
    const maxPh = (topY - H * 0.1) * Math.min(1, vScale);
    let s = Math.min(maxPh / ch, (W * 0.56 * vScale) / cw);
    s = Math.min(s, (H * fillH * vScale) / ch);
    const pw = cw * s;
    const ph = ch * s;
    const rx = Math.min(W * 0.4, Math.max(pw * 0.82, W * 0.2));
    const ry = rx * 0.16;
    const bottomY = Math.min(H * 0.95, topY + H * 0.2);
    return {
      W,
      H,
      layout,
      cx: cxBase,
      baseline: topY + ry * 0.15,
      left: cxBase - pw / 2,
      top: topY + ry * 0.15 - ph,
      pw,
      ph,
      horizon,
      podium: { cx: cxBase, topY, rx, ry, bottomY },
    };
  }

  const s = Math.min((H * fillH * vScale) / ch, (W * fillW * vScale) / cw);
  const pw = cw * s;
  const ph = ch * s;
  if (layout === "standing") {
    let baseline = H * (spec.baseline ?? (marketplace ? 0.925 : 0.8));
    if (marketplace) baseline = H / 2 + ph / 2; // exact centering for listings
    baseline = Math.max(baseline, Math.min(H * 0.97, ph + H * 0.04));
    return { W, H, layout, cx: cxBase, baseline, left: cxBase - pw / 2, top: baseline - ph, pw, ph, horizon };
  }
  // Floating / flat lay: centered (slightly above center when floating).
  const cy = H * (layout === "floating" ? 0.47 : 0.5);
  return {
    W,
    H,
    layout,
    cx: cxBase,
    baseline: cy + ph / 2,
    left: cxBase - pw / 2,
    top: cy - ph / 2,
    pw,
    ph,
    horizon,
  };
}

function solidRgba(width: number, height: number, color: string, alpha: Uint8Array | Buffer, opacity: number) {
  const [r, g, b] = hexToRgb(color);
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = Math.round(alpha[i] * opacity);
  }
  return buf;
}

async function productAlpha(product: Buffer) {
  return sharp(product).extractChannel(3).raw().toBuffer();
}

interface ShadowOptions {
  kind: ShadowKind;
  strength: number;
  tint: string;
  darkFloor: boolean;
  lightSide: -1 | 0 | 1;
}

/** Soft elliptical contact shadow plus a tight ambient-occlusion core. */
function contactShadowSvg(pl: Placement, o: ShadowOptions) {
  const rx = pl.pw * 0.46;
  const ry = Math.max(3, Math.min(pl.pw * 0.05, pl.H * 0.03));
  const cy = pl.baseline - ry * 0.25;
  const op = Math.min(0.9, (o.darkFloor ? 0.75 : 0.5) * o.strength);
  const pad = Math.ceil(ry * 4 + rx * 0.2);
  const w = Math.ceil(rx * 2 + pad * 2);
  const h = Math.ceil(ry * 2 + pad * 2);
  const left = Math.round(pl.cx - rx - pad);
  const top = Math.round(cy - ry - pad);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><filter id="a" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(ry * 1.1).toFixed(1)}"/></filter>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(ry * 0.35).toFixed(1)}"/></filter></defs>
<ellipse cx="${w / 2}" cy="${h / 2}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${o.tint}" opacity="${op.toFixed(2)}" filter="url(#a)"/>
<ellipse cx="${w / 2}" cy="${(h / 2 + ry * 0.1).toFixed(1)}" rx="${(rx * 0.78).toFixed(1)}" ry="${(ry * 0.42).toFixed(1)}" fill="${o.tint}" opacity="${Math.min(0.95, op * 1.1).toFixed(2)}" filter="url(#b)"/>
</svg>`;
  return { input: Buffer.from(svg), left, top, blend: "multiply" as const };
}

/** Cast shadow: the product silhouette projected onto the floor behind it. */
async function castShadow(product: Buffer, pl: Placement, o: ShadowOptions, hard: boolean): Promise<OverlayOptions> {
  const pw = Math.round(pl.pw);
  const ph = Math.round(pl.ph);
  const k = hard ? 0.42 : 0.24; // vertical foreshortening of the projected silhouette
  const hs = Math.max(2, Math.round(ph * k));
  const alpha = await sharp(product)
    .resize(pw, hs, { fit: "fill" })
    .extractChannel(3)
    .raw()
    .toBuffer();
  // Fade with distance from the contact point.
  const faded = Buffer.alloc(alpha.length);
  for (let y = 0; y < hs; y++) {
    const t = y / Math.max(1, hs - 1); // 0 top (far) … 1 bottom (contact)
    const f = hard ? 0.35 + 0.65 * t : 0.15 + 0.85 * t * t;
    for (let x = 0; x < pw; x++) faded[y * pw + x] = alpha[y * pw + x] * f;
  }
  const op = (hard ? (o.darkFloor ? 0.6 : 0.42) : o.darkFloor ? 0.45 : 0.28) * o.strength;
  const rgba = solidRgba(pw, hs, o.tint, faded, Math.min(1, op));
  const lean = o.lightSide === 0 ? (hard ? 0.9 : 0.55) : -o.lightSide * (hard ? 1.4 : 0.8); // shear factor
  const sigma = Math.max(0.6, (hard ? 0.006 : 0.02) * Math.max(pw, ph));
  // Shear so the far end of the shadow leans away from the light; keep the base fixed.
  const sheared = await sharp(rgba, { raw: { width: pw, height: hs, channels: 4 } })
    .affine([1, -lean, 0, 1], { background: { r: 0, g: 0, b: 0, alpha: 0 }, interpolator: "bilinear" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const blurred = await sharp(sheared.data).blur(sigma).png().toBuffer({ resolveWithObject: true });
  // With x' = x - lean*y the base row (y = hs) starts at x = -lean*hs (if lean > 0)
  const baseOffset = lean > 0 ? 0 : Math.round(-lean * hs);
  const pad = Math.round((blurred.info.width - sheared.info.width) / 2);
  return {
    input: blurred.data,
    left: Math.round(pl.left - baseOffset - pad),
    top: Math.round(pl.baseline - hs - (blurred.info.height - hs) / 2 + hs * 0.02),
    blend: "multiply",
  };
}

async function dropShadow(product: Buffer, pl: Placement, o: ShadowOptions): Promise<OverlayOptions> {
  const pw = Math.round(pl.pw);
  const ph = Math.round(pl.ph);
  const alpha = await productAlpha(product);
  const flat = pl.layout === "flatlay";
  const op = (o.darkFloor ? 0.55 : flat ? 0.32 : 0.28) * o.strength;
  const rgba = solidRgba(pw, ph, o.tint, alpha, Math.min(1, op));
  const sigma = Math.max(1, (flat ? 0.014 : 0.035) * Math.max(pw, ph));
  const blurred = await sharp(rgba, { raw: { width: pw, height: ph, channels: 4 } })
    .blur(sigma)
    .png()
    .toBuffer({ resolveWithObject: true });
  const pad = Math.round((blurred.info.width - pw) / 2);
  const dx = flat ? pw * 0.012 : 0;
  const dy = flat ? ph * 0.018 : ph * 0.06;
  return {
    input: blurred.data,
    left: Math.round(pl.left + dx - pad),
    top: Math.round(pl.top + dy - pad),
    blend: "multiply",
  };
}

async function reflectionLayer(product: Buffer, pl: Placement, strength: number, darkFloor: boolean) {
  const pw = Math.round(pl.pw);
  const ph = Math.round(pl.ph);
  const rh = Math.max(2, Math.min(Math.round(ph * 0.5), Math.round(pl.H - pl.baseline)));
  if (rh < 4) return null;
  const flipped = await sharp(product)
    .flip()
    .extract({ left: 0, top: 0, width: pw, height: rh })
    .raw()
    .toBuffer();
  const top = (darkFloor ? 0.34 : 0.22) * strength;
  for (let y = 0; y < rh; y++) {
    const t = y / rh;
    const f = top * (1 - t) ** 2.2;
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4 + 3;
      flipped[i] = Math.round(flipped[i] * f);
    }
  }
  const out = await sharp(flipped, { raw: { width: pw, height: rh, channels: 4 } })
    .blur(Math.max(0.5, pw * 0.002))
    .png()
    .toBuffer({ resolveWithObject: true });
  const pad = Math.round((out.info.width - pw) / 2);
  return { input: out.data, left: Math.round(pl.left - pad), top: Math.round(pl.baseline - 1 - pad) };
}

const grainCache = new Map<number, Buffer>();

/** Fine film grain on the backdrop only — hides gradient banding, never touches the product. */
async function grainTile(seed: number) {
  if (grainCache.has(seed)) return grainCache.get(seed)!;
  const S = 256;
  const rand = seededRandom(seed);
  const buf = Buffer.alloc(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const v = Math.round(128 + (rand() + rand() + rand() - 1.5) * 60);
    buf[i * 4] = v;
    buf[i * 4 + 1] = v;
    buf[i * 4 + 2] = v;
    buf[i * 4 + 3] = 34;
  }
  const png = await sharp(buf, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();
  grainCache.set(seed, png);
  return png;
}

export interface RenderInput {
  recipe: RenderRecipe;
  product: ProductSource;
  scene?: Buffer | null;
  extraProducts?: ProductSource[];
  longEdge: number;
}

export interface RenderOutput {
  data: Buffer;
  width: number;
  height: number;
  transparent: boolean;
  placement: Placement;
}

/** Renders a recipe at the requested resolution, returning a raw-quality PNG. */
export async function renderRecipe({ recipe, product, scene, extraProducts, longEdge }: RenderInput): Promise<RenderOutput> {
  const { width: W, height: H } = canvasSize(recipe.aspect, longEdge);
  const style = getStyle(recipe.styleId);
  const palette = resolvePalette(recipe.styleId, recipe.variation, recipe.palette);
  const transparent = recipe.styleId === "transparent";

  // Group products (bundles) are laid out as one combined silhouette.
  const group = extraProducts?.length ? await buildGroup(product, extraProducts) : product;
  let pl = computePlacement(recipe, W, H, group.width, group.height);
  if (recipe.productBox && scene) {
    const b = recipe.productBox;
    pl = {
      ...pl,
      left: b.left * W,
      top: b.top * H,
      pw: b.width * W,
      ph: b.height * H,
      cx: (b.left + b.width / 2) * W,
      baseline: (b.top + b.height) * H,
    };
  }
  const pw = Math.max(1, Math.round(pl.pw));
  const ph = Math.max(1, Math.round(pl.ph));
  const productPx = await sharp(group.data).resize(pw, ph, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();

  const layers: OverlayOptions[] = [];
  let base: Sharp;

  if (scene) {
    base = sharp(await sharp(scene).resize(W, H, { fit: "cover", kernel: "lanczos3" }).png().toBuffer());
  } else if (transparent) {
    base = sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  } else {
    const svg = buildBackdropSvg(recipe.styleId, pl, palette, recipe.variation);
    const backdrop = await sharp(Buffer.from(svg), { density: 72, limitInputPixels: false })
      .resize(W, H, { fit: "fill" })
      .png()
      .toBuffer();
    base = sharp(backdrop);
    if (recipe.styleId !== "marketplace-white") {
      layers.push({ input: await grainTile(recipe.variation + 1), tile: true, blend: "overlay" });
    }
  }

  if (!transparent) {
    const { tint, darkFloor } = shadowTintFor(recipe.styleId, palette);
    const kind: ShadowKind = recipe.shadow ?? (scene ? "none" : style?.shadow ?? "contact");
    const o: ShadowOptions = {
      kind,
      strength: recipe.shadowStrength ?? 1,
      tint,
      darkFloor,
      lightSide: recipe.lightSide ?? 0,
    };
    const standing = pl.layout === "standing";
    if (kind !== "none") {
      if (standing && (kind === "soft" || kind === "hard")) layers.push(await castShadow(productPx, pl, o, kind === "hard"));
      if (kind === "drop" || !standing) layers.push(await dropShadow(productPx, pl, o));
      if (standing) layers.push(contactShadowSvg(pl, o));
    }
    const reflect = recipe.reflection ?? Boolean(style?.reflection);
    if (reflect && standing && !pl.podium && !scene) {
      const r = await reflectionLayer(productPx, pl, recipe.shadowStrength ?? 1, darkFloor);
      if (r) layers.push(r);
    }
  }

  layers.push({ input: productPx, left: Math.round(pl.left), top: Math.round(pl.top) });

  const fitted = (await Promise.all(layers.map((l) => cropToCanvas(l, W, H)))).filter(Boolean) as OverlayOptions[];
  const data = await base
    .composite(fitted)
    .png({ compressionLevel: 6 })
    .toBuffer();
  return { data, width: W, height: H, transparent, placement: pl };
}

/** Crops an overlay to the canvas so partially off-canvas layers never error. */
async function cropToCanvas(l: OverlayOptions, W: number, H: number): Promise<OverlayOptions | null> {
  if (l.tile || l.left === undefined || l.top === undefined || !Buffer.isBuffer(l.input)) return l;
  const meta = await sharp(l.input).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const x0 = Math.max(0, l.left);
  const y0 = Math.max(0, l.top);
  const x1 = Math.min(W, l.left + w);
  const y1 = Math.min(H, l.top + h);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === l.left && y0 === l.top && x1 - x0 === w && y1 - y0 === h) return l;
  const input = await sharp(l.input)
    .extract({ left: x0 - l.left, top: y0 - l.top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { ...l, input, left: x0, top: y0 };
}

/** Arranges several products side by side into one silhouette (for bundle images). */
async function buildGroup(main: ProductSource, extras: ProductSource[]): Promise<ProductSource> {
  const items = [main, ...extras];
  const targetH = Math.max(...items.map((p) => p.height));
  const scaled = await Promise.all(
    items.map(async (p, i) => {
      // Hero product largest; others at 82% height, arranged around it.
      const h = Math.round(targetH * (i === 0 ? 1 : 0.82));
      const w = Math.round((p.width / p.height) * h);
      const data = await sharp(p.data).resize(w, h, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
      return { data, w, h };
    }),
  );
  // Order: extras alternate left/right of the hero.
  const order: number[] = [];
  const rest = scaled.map((_, i) => i).slice(1);
  rest.forEach((idx, k) => (k % 2 === 0 ? order.unshift(idx) : order.push(idx)));
  order.splice(Math.floor(order.length / 2), 0, 0);
  const overlap = 0.12;
  let x = 0;
  const positions: { idx: number; x: number }[] = [];
  for (const idx of order) {
    positions.push({ idx, x });
    x += scaled[idx].w * (1 - overlap);
  }
  const totalW = Math.round(x + scaled[order[order.length - 1]].w * overlap);
  const canvas = sharp({ create: { width: totalW, height: targetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  // Draw back items first (smaller ones), hero last so it sits in front.
  const drawOrder = [...positions].sort((a, b) => (a.idx === 0 ? 1 : b.idx === 0 ? -1 : 0));
  const data = await canvas
    .composite(
      drawOrder.map((p) => ({
        input: scaled[p.idx].data,
        left: Math.round(p.x),
        top: targetH - scaled[p.idx].h,
      })),
    )
    .png()
    .toBuffer();
  return { data, width: totalW, height: targetH };
}
