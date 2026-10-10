import "server-only";
import sharp from "sharp";
import { bgModelPath } from "../capabilities";

// Local AI background removal using the IS-Net (DIS) general-use segmentation
// model running on onnxruntime-node. No image leaves the server.
//
// Pipeline: normalize → 1024² inference → mask upscaling → guided-filter edge
// refinement against the full-resolution photo → alpha curve → foreground color
// decontamination (removes background color fringing) → trim to the product.

const MODEL_SIZE = 1024;
const MAX_EDGE = 4096;

type OrtModule = typeof import("onnxruntime-node");
type Session = import("onnxruntime-node").InferenceSession;

const g = globalThis as unknown as { __vitrineSeg?: Promise<{ ort: OrtModule; session: Session }> };

async function getSession() {
  if (!g.__vitrineSeg) {
    g.__vitrineSeg = (async () => {
      const ort = await import("onnxruntime-node");
      const session = await ort.InferenceSession.create(bgModelPath(), {
        graphOptimizationLevel: "all",
        intraOpNumThreads: Math.max(1, Math.min(4, (await import("node:os")).cpus().length)),
      });
      return { ort, session };
    })().catch((err) => {
      g.__vitrineSeg = undefined;
      throw err;
    });
  }
  return g.__vitrineSeg;
}

export interface CutoutResult {
  /** Trimmed RGBA PNG of the product. */
  png: Buffer;
  width: number;
  height: number;
  /** Bounding box of the product inside the normalized source photo. */
  bbox: { left: number; top: number; width: number; height: number };
  source: { width: number; height: number };
  /** Fraction of the photo covered by the product (0-1). */
  coverage: number;
  method: "model" | "existing-alpha";
}

/** Auto-orients and bounds the photo; returns raw RGB(A) pixels. */
export async function normalizePhoto(input: Buffer) {
  const meta = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image");
  const { data, info } = await sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: data, width: info.width, height: info.height, hadAlpha: Boolean(meta.hasAlpha) };
}

function alphaIsMeaningful(rgba: Buffer, n: number) {
  let transparent = 0;
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 16) transparent++;
  return transparent / n > 0.03;
}

async function predictMask(rgba: Buffer, width: number, height: number): Promise<Float32Array> {
  const { ort, session } = await getSession();
  const S = MODEL_SIZE;
  const resized = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .removeAlpha()
    .resize(S, S, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  const plane = S * S;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = resized[i * 3] / 255 - 0.5;
    input[plane + i] = resized[i * 3 + 1] / 255 - 0.5;
    input[2 * plane + i] = resized[i * 3 + 2] / 255 - 0.5;
  }
  const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, S, S]) };
  const out = await session.run(feeds);
  const raw = out[session.outputNames[0]].data as Float32Array;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < plane; i++) {
    const v = raw[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const range = mx - mn || 1;
  const small = Buffer.alloc(plane);
  for (let i = 0; i < plane; i++) small[i] = Math.round(((raw[i] - mn) / range) * 255);
  const up = await sharp(small, { raw: { width: S, height: S, channels: 1 } })
    .resize(width, height, { fit: "fill", kernel: "cubic" })
    .extractChannel(0)
    .raw()
    .toBuffer();
  const mask = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = up[i] / 255;
  return mask;
}

// ── Guided filter (He et al.) for edge-aware mask refinement ─────────────

function boxFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  // Separable running-sum box filter with edge normalization.
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / (2 * r + 1);
      const add = Math.min(w - 1, x + r + 1);
      const sub = Math.max(0, x - r);
      sum += src[row + add] - src[row + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (2 * r + 1);
      const add = Math.min(h - 1, y + r + 1);
      const sub = Math.max(0, y - r);
      sum += tmp[add * w + x] - tmp[sub * w + x];
    }
  }
  return out;
}

export function guidedFilter(guide: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number) {
  const n = w * h;
  const meanI = boxFilter(guide, w, h, r);
  const meanP = boxFilter(p, w, h, r);
  const ip = new Float32Array(n);
  const ii = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ip[i] = guide[i] * p[i];
    ii[i] = guide[i] * guide[i];
  }
  const meanIP = boxFilter(ip, w, h, r);
  const meanII = boxFilter(ii, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = meanIP[i] - meanI[i] * meanP[i];
    const variance = meanII[i] - meanI[i] * meanI[i];
    a[i] = cov / (variance + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }
  const meanA = boxFilter(a, w, h, r);
  const meanB = boxFilter(b, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = meanA[i] * guide[i] + meanB[i];
  return q;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Refines a soft mask: edge-aware filtering, then a gentle S-curve that removes haze. */
export function refineMask(rgba: Buffer, mask: Float32Array, w: number, h: number): Float32Array {
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  }
  const r = Math.max(2, Math.round(Math.max(w, h) / 700));
  const refined = guidedFilter(gray, mask, w, h, r, 1e-4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Blend: trust the model in flat areas, the guided result near edges.
    const m = mask[i];
    const q = Math.min(1, Math.max(0, refined[i]));
    const edge = m > 0.02 && m < 0.98 ? 1 : 0;
    const v = edge ? q * 0.7 + m * 0.3 : m;
    out[i] = smoothstep(0.08, 0.92, v);
  }
  return out;
}

/**
 * Re-estimates the true foreground color of semi-transparent edge pixels so the
 * old background doesn't bleed into new scenes (e.g. a brown wood fringe).
 */
async function decontaminate(rgba: Buffer, alpha: Float32Array, w: number, h: number) {
  const n = w * h;
  // Premultiply by a "solid foreground" weight, blur colors and weights
  // separately (as plain channels), then divide.
  const premul = Buffer.alloc(n * 3);
  const weight = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const wgt = alpha[i] > 0.85 ? 1 : 0;
    premul[i * 3] = rgba[i * 4] * wgt;
    premul[i * 3 + 1] = rgba[i * 4 + 1] * wgt;
    premul[i * 3 + 2] = rgba[i * 4 + 2] * wgt;
    weight[i] = wgt * 255;
  }
  const sigma = Math.max(2, Math.max(w, h) / 400);
  const blurredRgb = await sharp(premul, { raw: { width: w, height: h, channels: 3 } }).blur(sigma).raw().toBuffer();
  const blurredW = await sharp(weight, { raw: { width: w, height: h, channels: 1 } })
    .blur(sigma)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const out = Buffer.from(rgba);
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    out[i * 4 + 3] = Math.round(a * 255);
    if (a <= 0.01 || a >= 0.97) continue;
    const bw = blurredW[i] / 255;
    if (bw < 0.02) continue;
    const fr = blurredRgb[i * 3] / bw;
    const fg = blurredRgb[i * 3 + 1] / bw;
    const fb = blurredRgb[i * 3 + 2] / bw;
    // The more transparent the pixel, the more we trust the estimate.
    const t = Math.min(1, (1 - a) * 1.6);
    out[i * 4] = Math.round(rgba[i * 4] * (1 - t) + Math.min(255, fr) * t);
    out[i * 4 + 1] = Math.round(rgba[i * 4 + 1] * (1 - t) + Math.min(255, fg) * t);
    out[i * 4 + 2] = Math.round(rgba[i * 4 + 2] * (1 - t) + Math.min(255, fb) * t);
  }
  return out;
}

function bboxOf(rgba: Buffer, w: number, h: number, threshold = 10) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > threshold) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1, count };
}

export async function removeBackground(
  input: Buffer,
  onProgress?: (pct: number, stage: string) => Promise<void> | void,
): Promise<CutoutResult> {
  await onProgress?.(8, "Preparing photo");
  const { rgba, width, height, hadAlpha } = await normalizePhoto(input);
  const n = width * height;
  let out: Buffer;
  let method: CutoutResult["method"] = "model";

  if (hadAlpha && alphaIsMeaningful(rgba, n)) {
    // Already a cut-out (transparent PNG): keep the seller's own mask.
    method = "existing-alpha";
    out = Buffer.from(rgba);
    await onProgress?.(70, "Using existing transparency");
  } else {
    await onProgress?.(20, "Detecting the product");
    const mask = await predictMask(rgba, width, height);
    await onProgress?.(60, "Refining edges");
    const refined = refineMask(rgba, mask, width, height);
    await onProgress?.(75, "Cleaning color fringes");
    out = await decontaminate(rgba, refined, width, height);
  }

  const bbox = bboxOf(out, width, height);
  if (!bbox || bbox.count < n * 0.002) {
    const err = new Error(
      "We couldn't find a clear product in this photo. Try a photo where the product is in focus and takes up more of the frame.",
    ) as Error & { expose: boolean };
    err.expose = true;
    throw err;
  }
  await onProgress?.(88, "Saving cut-out");
  const pad = Math.round(Math.max(bbox.width, bbox.height) * 0.01);
  const left = Math.max(0, bbox.left - pad);
  const top = Math.max(0, bbox.top - pad);
  const right = Math.min(width, bbox.left + bbox.width + pad);
  const bottom = Math.min(height, bbox.top + bbox.height + pad);
  const crop = { left, top, width: right - left, height: bottom - top };
  const png = await sharp(out, { raw: { width, height, channels: 4 } })
    .extract(crop)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return {
    png,
    width: crop.width,
    height: crop.height,
    bbox: crop,
    source: { width, height },
    coverage: bbox.count / n,
    method,
  };
}
