import "server-only";
import sharp from "sharp";
import { rgbToHex } from "./color";

// Local, algorithmic image tools. These never invent detail — the enhancer
// corrects exposure/color/sharpness and the standard upscaler resamples with a
// Lanczos filter. (AI upscaling is a separate, provider-backed tool.)

export type EnhanceStrength = "subtle" | "balanced" | "strong";

export async function enhancePhoto(input: Buffer, strength: EnhanceStrength, denoise: boolean) {
  const k = { subtle: 0.5, balanced: 1, strong: 1.6 }[strength];
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  const hasAlpha = Boolean(meta.hasAlpha);
  const stats = await sharp(input).rotate().removeAlpha().stats();
  const [r, g, b] = stats.channels.map((c) => c.mean);
  const gray = (r + g + b) / 3;
  // Gray-world white balance, damped so intentionally colorful photos aren't neutralized.
  const damp = 0.35 * k;
  const gain = (c: number) => Math.min(1.15, Math.max(0.87, 1 + (gray / Math.max(1, c) - 1) * damp));
  let pipeline = sharp(input).rotate();
  if (denoise) pipeline = pipeline.median(3);
  pipeline = pipeline
    .linear([gain(r), gain(g), gain(b)], [0, 0, 0])
    .normalise({ lower: 0.5 * k, upper: 100 - 0.5 * k })
    .modulate({ saturation: 1 + 0.08 * k, brightness: 1 + 0.015 * k })
    .sharpen({ sigma: 0.8 + 0.4 * k, m1: 0.4, m2: 1.6 * k, x1: 2, y2: 12, y3: 20 });
  const out = hasAlpha ? await pipeline.png().toBuffer() : await pipeline.jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  return { data: out, mime: hasAlpha ? ("image/png" as const) : ("image/jpeg" as const) };
}

export async function upscaleStandard(input: Buffer, factor: 2 | 4) {
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const maxEdge = 8192;
  const f = Math.min(factor, maxEdge / Math.max(w, h));
  if (f <= 1.01) {
    const err = new Error("This image is already at the maximum supported size (8192px).") as Error & { expose: boolean };
    err.expose = true;
    throw err;
  }
  const W = Math.round(w * f);
  const H = Math.round(h * f);
  const hasAlpha = Boolean(meta.hasAlpha);
  const pipeline = sharp(input, { limitInputPixels: false })
    .resize(W, H, { kernel: "lanczos3" })
    .sharpen({ sigma: 0.6 + f * 0.25, m1: 0.3, m2: 1.2 });
  const data = hasAlpha ? await pipeline.png().toBuffer() : await pipeline.jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  return { data, mime: hasAlpha ? ("image/png" as const) : ("image/jpeg" as const), width: W, height: H };
}

/** Dominant colors (k-means on a thumbnail), ignoring transparent pixels. */
export async function extractPalette(input: Buffer, k = 5): Promise<string[]> {
  const { data, info } = await sharp(input).resize(96, 96, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px: [number, number, number][] = [];
  for (let i = 0; i < info.width * info.height; i++) {
    if (data[i * 4 + 3] < 128) continue;
    px.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }
  if (!px.length) return [];
  let centers = Array.from({ length: k }, (_, i) => px[Math.floor((i / k) * px.length)]);
  const assign = new Array(px.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < px.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = (px[i][0] - centers[c][0]) ** 2 + (px[i][1] - centers[c][1]) ** 2 + (px[i][2] - centers[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    centers = centers.map((c, ci) => {
      const members = px.filter((_, i) => assign[i] === ci);
      if (!members.length) return c;
      const sum = members.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
      return [sum[0] / members.length, sum[1] / members.length, sum[2] / members.length] as [number, number, number];
    });
  }
  const counts = centers.map((_, ci) => assign.filter((a) => a === ci).length);
  return centers
    .map((c, i) => ({ hex: rgbToHex(c[0], c[1], c[2]), n: counts[i] }))
    .filter((c) => c.n > px.length * 0.03)
    .sort((a, b) => b.n - a.n)
    .map((c) => c.hex);
}
