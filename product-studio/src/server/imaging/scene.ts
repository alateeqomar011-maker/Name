import "server-only";
import sharp from "sharp";
import { ASPECTS, type AspectId, type Layout } from "@/lib/studio-styles";
import type { SceneSize } from "../ai/images";

// Prepares inputs for generative scene creation: the product is placed on the
// generation canvas exactly where it will appear in the final render, with a
// protective mask so the model builds the scene around it.

export interface SceneInputs {
  size: SceneSize;
  gw: number;
  gh: number;
  crop: { left: number; top: number; width: number; height: number };
  /** Product box normalized to the crop region (= final canvas). */
  productBox: { left: number; top: number; width: number; height: number };
  productLayer: Buffer;
  productOnGray: Buffer;
  keepMask: Buffer;
  inpaintMask: Buffer;
}

export async function prepareSceneInputs(
  cutout: Buffer,
  cw: number,
  ch: number,
  aspect: AspectId,
  layout: Layout,
): Promise<SceneInputs> {
  const a = ASPECTS[aspect] ?? ASPECTS["1:1"];
  const ratio = a.w / a.h;
  const size: SceneSize = Math.abs(ratio - 1) < 0.01 ? "1024x1024" : ratio > 1 ? "1536x1024" : "1024x1536";
  const [gw, gh] = size.split("x").map(Number);

  // Largest centered region with the target aspect.
  let cropW = gw;
  let cropH = Math.round(gw / ratio);
  if (cropH > gh) {
    cropH = gh;
    cropW = Math.round(gh * ratio);
  }
  const crop = { left: Math.round((gw - cropW) / 2), top: Math.round((gh - cropH) / 2), width: cropW, height: cropH };

  // Leave generous room for the environment: products occupy about half the frame.
  const s = Math.min((cropH * (layout === "standing" ? 0.5 : 0.52)) / ch, (cropW * 0.52) / cw);
  const pw = Math.max(8, Math.round(cw * s));
  const ph = Math.max(8, Math.round(ch * s));
  const cx = crop.left + cropW / 2;
  const top =
    layout === "standing" ? Math.round(crop.top + cropH * 0.8 - ph) : Math.round(crop.top + cropH * 0.5 - ph / 2);
  const left = Math.round(cx - pw / 2);

  const product = await sharp(cutout).resize(pw, ph, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
  const empty = { width: gw, height: gh, channels: 4 as const, background: { r: 0, g: 0, b: 0, alpha: 0 } };
  const productLayer = await sharp({ create: empty }).composite([{ input: product, left, top }]).png().toBuffer();
  const productOnGray = await sharp({ create: { ...empty, background: { r: 127, g: 127, b: 127, alpha: 1 } } })
    .composite([{ input: product, left, top }])
    .flatten({ background: "#7f7f7f" })
    .png()
    .toBuffer();

  // Eroded product mask (blur + high threshold) so edges blend into the scene.
  const alpha = await sharp(productLayer).extractChannel(3).blur(1.5).raw().toBuffer();
  const keep = Buffer.alloc(gw * gh * 4);
  const inpaint = Buffer.alloc(gw * gh);
  for (let i = 0; i < gw * gh; i++) {
    const solid = alpha[i] > 235;
    keep[i * 4 + 3] = solid ? 255 : 0;
    inpaint[i] = solid ? 0 : 255;
  }
  const keepMask = await sharp(keep, { raw: { width: gw, height: gh, channels: 4 } }).png().toBuffer();
  const inpaintMask = await sharp(inpaint, { raw: { width: gw, height: gh, channels: 1 } }).png().toBuffer();

  return {
    size,
    gw,
    gh,
    crop,
    productBox: {
      left: (left - crop.left) / cropW,
      top: (top - crop.top) / cropH,
      width: pw / cropW,
      height: ph / cropH,
    },
    productLayer,
    productOnGray,
    keepMask,
    inpaintMask,
  };
}
