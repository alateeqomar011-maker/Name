import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { getPlan } from "@/lib/plans";
import { getAssets, readAsset } from "../assets";
import type { Asset, Workspace } from "../db/schema";
import { cacheDir } from "../storage";
import { renderRecipe, type RenderRecipe } from "./compose";
import { applyWatermark } from "./watermark";

export type OutputFormat = "png" | "jpeg" | "webp";

export const MIME: Record<OutputFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const NEVER_WATERMARK = new Set(["original", "logo"]);

export function shouldWatermark(ws: Pick<Workspace, "plan">, asset: Pick<Asset, "kind">) {
  return getPlan(ws.plan).limits.watermark && !NEVER_WATERMARK.has(asset.kind);
}

async function cached(key: string, produce: () => Promise<Buffer>): Promise<Buffer> {
  const file = path.join(cacheDir(), key);
  try {
    return (await fs.readFile(file)) as Buffer;
  } catch {
    const data = await produce();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, data);
    await fs.rename(`${file}.tmp`, file);
    return data;
  }
}

function encode(img: Sharp, format: OutputFormat, transparent: boolean) {
  if (format === "jpeg") return img.flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" });
  if (format === "webp") return img.webp({ quality: 88, alphaQuality: 95 });
  return img.png({ compressionLevel: transparent ? 9 : 7, adaptiveFiltering: true });
}

/** In-app preview (bounded width, webp), watermarked for the free plan. */
export async function previewRendition(asset: Asset, width: number, watermark: boolean): Promise<Buffer> {
  const w = Math.max(64, Math.min(2048, Math.round(width)));
  const key = `${asset.id}/preview-${w}-${watermark ? 1 : 0}.webp`;
  return cached(key, async () => {
    const src = await readAsset(asset);
    let img: Buffer = await sharp(src).resize({ width: w, withoutEnlargement: true }).png().toBuffer();
    if (watermark) img = await applyWatermark(img);
    return sharp(img).webp({ quality: 84, alphaQuality: 90 }).toBuffer();
  });
}

/**
 * Full-quality export. Studio renders are re-rendered from their recipe at the
 * requested size so backdrops stay crisp at 4K; other assets are resized down.
 */
export async function exportRendition(
  asset: Asset,
  opts: { format: OutputFormat; longEdge: number; watermark: boolean },
): Promise<{ data: Buffer; width: number; height: number }> {
  const recipe = (asset.meta as { recipe?: RenderRecipe }).recipe;
  const srcLong = Math.max(asset.width, asset.height);
  const target = Math.max(256, Math.round(opts.longEdge));
  const key = `${asset.id}/export-${target}-${opts.format}-${opts.watermark ? 1 : 0}.${opts.format === "jpeg" ? "jpg" : opts.format}`;
  const data = await cached(key, async () => {
    let base: Buffer;
    let transparent = asset.mime === "image/png";
    if (recipe && target > srcLong) {
      const ids = [recipe.cutoutAssetId, recipe.sceneAssetId, ...(recipe.extraCutoutAssetIds ?? [])].filter(Boolean) as string[];
      const found = await getAssets(asset.workspaceId, ids);
      const byId = new Map(found.map((a) => [a.id, a]));
      const cut = byId.get(recipe.cutoutAssetId);
      if (!cut) throw new Error("Source cut-out missing");
      const product = { data: await readAsset(cut), width: cut.width, height: cut.height };
      const scene = recipe.sceneAssetId && byId.get(recipe.sceneAssetId) ? await readAsset(byId.get(recipe.sceneAssetId)!) : null;
      const extras = await Promise.all(
        (recipe.extraCutoutAssetIds ?? [])
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map(async (a) => ({ data: await readAsset(a!), width: a!.width, height: a!.height })),
      );
      const out = await renderRecipe({ recipe, product, scene, extraProducts: extras, longEdge: target });
      base = out.data;
      transparent = out.transparent;
    } else {
      const src = await readAsset(asset);
      base = await sharp(src)
        .resize({ width: target, height: target, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
        .png()
        .toBuffer();
    }
    if (opts.watermark) base = await applyWatermark(base);
    return encode(sharp(base), opts.format, transparent).toBuffer();
  });
  const meta = await sharp(data).metadata();
  return { data, width: meta.width ?? 0, height: meta.height ?? 0 };
}

export async function clearRenditionCache(assetId: string) {
  await fs.rm(path.join(cacheDir(), assetId), { recursive: true, force: true });
}

export function exportFilename(label: string | null, id: string, format: OutputFormat, w: number, h: number) {
  const base = (label ?? "vitrine").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "vitrine";
  return `${base}-${w}x${h}-${id.slice(-6)}.${format === "jpeg" ? "jpg" : format}`;
}

/** Longest edge allowed for a download. Designs export at their native platform size. */
export function exportCap(plan: { limits: { maxExportPx: number } }, asset: Pick<Asset, "kind" | "width" | "height">) {
  if (asset.kind === "ad" || asset.kind === "social") return Math.max(plan.limits.maxExportPx, Math.min(4096, Math.max(asset.width, asset.height)));
  return plan.limits.maxExportPx;
}
