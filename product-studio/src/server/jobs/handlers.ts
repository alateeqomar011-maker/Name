import "server-only";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import {
  adCopySchema,
  analysisSchema,
  brandKitSchema,
  campaignSchema,
  descriptionSchema,
  socialSchema,
  type Language,
} from "@/lib/copy-schemas";
import type { GenerationType } from "@/lib/generation-types";
import { getStyle, STYLE_MAP, type AspectId, type Layout, type ShadowKind } from "@/lib/studio-styles";
import { generateStructured, imageBlock } from "../ai/claude";
import { generateAngle, generateScenes, scenePrompt, stabilityUpscaleFast } from "../ai/images";
import {
  adCopyPrompt,
  analysisPrompt,
  brandKitPrompt,
  campaignPrompt,
  descriptionPrompt,
  offerBlock,
  productContext,
  socialPrompt,
  type AdCopyParams,
  type CampaignParams,
  type DescriptionParams,
  type SocialParams,
} from "../ai/prompts";
import { getAsset, getAssets, readAsset, saveAsset } from "../assets";
import { refundPartialCredits } from "../credits";
import { getDb } from "../db";
import { brandKits, copies, projects, type Asset, type Generation, type Project } from "../db/schema";
import { newId } from "../ids";
import { renderRecipe, type RenderRecipe } from "../imaging/compose";
import { renderMockup, type MockupTemplate } from "../imaging/mockups";
import { prepareSceneInputs } from "../imaging/scene";
import { removeBackground } from "../imaging/segment";
import { enhancePhoto, extractPalette, upscaleStandard, type EnhanceStrength } from "../imaging/tools";
import { JobError } from "./errors";
import type { JobContext, JobHandler, JobOutput } from "./queue";

const PREVIEW_EDGE = 2048;

async function loadProject(gen: Generation): Promise<Project> {
  if (!gen.projectId) throw new JobError("This tool needs a product project.");
  const db = await getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, gen.projectId), eq(projects.workspaceId, gen.workspaceId)))
    .limit(1);
  if (!rows[0]) throw new JobError("The project was deleted.");
  return rows[0];
}

async function updateProject(id: string, values: Partial<Project>) {
  const db = await getDb();
  await db
    .update(projects)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(projects.id, id));
}

async function setCoverIfMissing(project: Project, assetId: string) {
  if (!project.coverAssetId || project.coverAssetId === project.originalAssetId) {
    await updateProject(project.id, { coverAssetId: assetId });
  }
}

async function encodeRender(png: Buffer, transparent: boolean) {
  if (transparent) return { data: png, mime: "image/png" as const };
  return { data: await sharp(png).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer(), mime: "image/jpeg" as const };
}

async function productSource(a: Asset) {
  return { data: await readAsset(a), width: a.width, height: a.height };
}

// ── Image jobs ───────────────────────────────────────────────────────────

const cutout: JobHandler = async ({ generation, params, progress }) => {
  const project = await loadProject(generation);
  const original = await getAsset(generation.workspaceId, String(params.originalAssetId ?? project.originalAssetId));
  const result = await removeBackground(await readAsset(original), progress);
  const asset = await saveAsset({
    workspaceId: generation.workspaceId,
    projectId: project.id,
    createdBy: generation.userId,
    kind: "cutout",
    label: "Background removed",
    data: result.png,
    mime: "image/png",
    width: result.width,
    height: result.height,
    parentId: original.id,
    generationId: generation.id,
    meta: { bbox: result.bbox, source: result.source, coverage: result.coverage, method: result.method },
  });
  await updateProject(project.id, { cutoutAssetId: asset.id });
  return { result: { assetIds: [asset.id], cutoutAssetId: asset.id, method: result.method }, provider: "local:isnet" };
};

interface StudioParams {
  styleId: string;
  aspect: AspectId;
  layout: Layout;
  variations: number;
  startVariation?: number;
  palette?: string[];
  scale?: number;
  offsetX?: number;
  shadow?: ShadowKind;
  shadowStrength?: number;
  reflection?: boolean;
  lightSide?: -1 | 0 | 1;
  cutoutAssetId: string;
}

const studio: JobHandler = async ({ generation, params, progress }) => {
  const p = params as unknown as StudioParams;
  const project = await loadProject(generation);
  const cut = await getAsset(generation.workspaceId, p.cutoutAssetId);
  const product = await productSource(cut);
  const style = getStyle(p.styleId);
  if (!style || style.kind !== "procedural") throw new JobError("Unknown studio style.");
  const ids: string[] = [];
  const start = p.startVariation ?? 0;
  for (let i = 0; i < p.variations; i++) {
    await progress(10 + (i / p.variations) * 85, `Rendering variation ${i + 1} of ${p.variations}`);
    const recipe: RenderRecipe = {
      version: 1,
      styleId: p.styleId,
      aspect: p.aspect,
      layout: p.layout,
      variation: start + i,
      palette: p.palette,
      scale: p.scale,
      offsetX: p.offsetX,
      shadow: p.shadow,
      shadowStrength: p.shadowStrength,
      reflection: p.reflection,
      lightSide: p.lightSide,
      cutoutAssetId: cut.id,
    };
    const out = await renderRecipe({ recipe, product, longEdge: PREVIEW_EDGE });
    const enc = await encodeRender(out.data, out.transparent);
    const asset = await saveAsset({
      workspaceId: generation.workspaceId,
      projectId: project.id,
      createdBy: generation.userId,
      kind: "render",
      label: `${style.name}${p.variations > 1 ? ` · v${start + i + 1}` : ""}`,
      data: enc.data,
      mime: enc.mime,
      width: out.width,
      height: out.height,
      parentId: cut.id,
      generationId: generation.id,
      meta: { recipe, styleId: p.styleId, styleName: style.name, category: style.category, aspect: p.aspect, variation: start + i },
    });
    ids.push(asset.id);
  }
  await setCoverIfMissing(project, ids[0]);
  return { result: { assetIds: ids }, provider: "local:compositor" };
};

interface SceneParams {
  styleId?: string;
  customPrompt?: string;
  aspect: AspectId;
  layout: Layout;
  variations: number;
  cutoutAssetId: string;
}

const scene: JobHandler = async ({ generation, params, progress }) => {
  const p = params as unknown as SceneParams;
  const project = await loadProject(generation);
  const cut = await getAsset(generation.workspaceId, p.cutoutAssetId);
  const cutData = await readAsset(cut);
  const style = p.styleId ? STYLE_MAP[p.styleId] : undefined;
  if (!style?.prompt && !p.customPrompt?.trim()) throw new JobError("Choose an AI scene or describe one.");
  await progress(8, "Placing product");
  const inputs = await prepareSceneInputs(cutData, cut.width, cut.height, p.aspect, p.layout);
  await progress(18, "Generating scene with AI (this can take up to a minute)");
  const { images, provider } = await generateScenes({
    productLayer: inputs.productLayer,
    productOnGray: inputs.productOnGray,
    keepMaskTransparentElsewhere: inputs.keepMask,
    inpaintMask: inputs.inpaintMask,
    prompt: scenePrompt(style?.prompt ?? "", p.customPrompt),
    size: inputs.size,
    n: p.variations,
  });
  const ids: string[] = [];
  for (let i = 0; i < images.length; i++) {
    await progress(75 + (i / images.length) * 20, "Compositing your original product");
    const sceneImg = await sharp(images[i])
      .resize(inputs.gw, inputs.gh, { fit: "fill" })
      .extract(inputs.crop)
      .png()
      .toBuffer();
    const sceneAsset = await saveAsset({
      workspaceId: generation.workspaceId,
      projectId: project.id,
      createdBy: generation.userId,
      kind: "scene",
      label: "AI scene background",
      data: await sharp(sceneImg).jpeg({ quality: 94 }).toBuffer(),
      mime: "image/jpeg",
      generationId: generation.id,
      meta: { provider, prompt: p.customPrompt || style?.prompt },
    });
    const recipe: RenderRecipe = {
      version: 1,
      styleId: style?.id ?? "custom-scene",
      aspect: p.aspect,
      layout: p.layout,
      variation: i,
      cutoutAssetId: cut.id,
      sceneAssetId: sceneAsset.id,
      productBox: inputs.productBox,
    };
    const out = await renderRecipe({ recipe, product: { data: cutData, width: cut.width, height: cut.height }, scene: sceneImg, longEdge: PREVIEW_EDGE });
    const enc = await encodeRender(out.data, false);
    const asset = await saveAsset({
      workspaceId: generation.workspaceId,
      projectId: project.id,
      createdBy: generation.userId,
      kind: "render",
      label: `${style?.name ?? "Custom AI scene"}${images.length > 1 ? ` · v${i + 1}` : ""}`,
      data: enc.data,
      mime: enc.mime,
      width: out.width,
      height: out.height,
      parentId: cut.id,
      generationId: generation.id,
      meta: {
        recipe,
        styleId: recipe.styleId,
        styleName: style?.name ?? "Custom AI scene",
        category: style?.category ?? "ai",
        aspect: p.aspect,
        aiScene: true,
        provider,
      },
    });
    ids.push(asset.id);
  }
  await setCoverIfMissing(project, ids[0]);
  return { result: { assetIds: ids }, provider };
};

const enhance: JobHandler = async ({ generation, params, progress }) => {
  const src = await getAsset(generation.workspaceId, String(params.assetId));
  await progress(30, "Enhancing");
  const out = await enhancePhoto(await readAsset(src), (params.strength as EnhanceStrength) ?? "balanced", Boolean(params.denoise));
  const asset = await saveAsset({
    workspaceId: generation.workspaceId,
    projectId: src.projectId,
    createdBy: generation.userId,
    kind: "enhanced",
    label: `Enhanced (${params.strength ?? "balanced"})`,
    data: out.data,
    mime: out.mime,
    parentId: src.id,
    generationId: generation.id,
    meta: { strength: params.strength, denoise: Boolean(params.denoise) },
  });
  return { result: { assetIds: [asset.id] }, provider: "local:enhancer" };
};

const upscale: JobHandler = async ({ generation, params, progress }) => {
  const src = await getAsset(generation.workspaceId, String(params.assetId));
  const factor = Number(params.factor) === 4 ? 4 : 2;
  await progress(30, `Upscaling ${factor}×`);
  const out = await upscaleStandard(await readAsset(src), factor);
  const asset = await saveAsset({
    workspaceId: generation.workspaceId,
    projectId: src.projectId,
    createdBy: generation.userId,
    kind: "upscaled",
    label: `Upscaled ${factor}× (standard)`,
    data: out.data,
    mime: out.mime,
    width: out.width,
    height: out.height,
    parentId: src.id,
    generationId: generation.id,
    meta: { factor, method: "lanczos" },
  });
  return { result: { assetIds: [asset.id] }, provider: "local:lanczos" };
};

const aiUpscale: JobHandler = async ({ generation, params, progress }) => {
  const src = await getAsset(generation.workspaceId, String(params.assetId));
  const raw = await readAsset(src);
  const meta = await sharp(raw).metadata();
  // Provider limit: inputs up to ~1 megapixel.
  const px = (meta.width ?? 0) * (meta.height ?? 0);
  const scale = px > 1_048_576 ? Math.sqrt(1_000_000 / px) : 1;
  const input = await sharp(raw)
    .resize(Math.round((meta.width ?? 0) * scale), Math.round((meta.height ?? 0) * scale))
    .png()
    .toBuffer();
  await progress(25, "AI upscaling (Stability AI)");
  const result = await stabilityUpscaleFast(input);
  const hasAlpha = Boolean(meta.hasAlpha);
  let data: Buffer = result;
  if (hasAlpha) {
    // Re-apply the original transparency at the new size.
    const um = await sharp(result).metadata();
    const alpha = await sharp(raw).extractChannel(3).resize(um.width, um.height).toBuffer();
    data = await sharp(result).removeAlpha().joinChannel(alpha).png().toBuffer();
  } else {
    data = await sharp(result).jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  }
  const asset = await saveAsset({
    workspaceId: generation.workspaceId,
    projectId: src.projectId,
    createdBy: generation.userId,
    kind: "upscaled",
    label: "AI upscaled 4×",
    data,
    mime: hasAlpha ? "image/png" : "image/jpeg",
    parentId: src.id,
    generationId: generation.id,
    meta: { factor: 4, method: "stability-fast", aiGenerated: true },
  });
  return { result: { assetIds: [asset.id] }, provider: "stability" };
};

const angles: JobHandler = async ({ generation, params, progress }) => {
  const project = await loadProject(generation);
  const cut = await getAsset(generation.workspaceId, String(params.cutoutAssetId));
  const list = (params.angles as string[]) ?? [];
  const cutData = await readAsset(cut);
  const S = 1024;
  const fitted = await sharp(cutData).resize(Math.round(S * 0.78), Math.round(S * 0.78), { fit: "inside" }).png().toBuffer();
  const fm = await sharp(fitted).metadata();
  const onWhite = await sharp({ create: { width: S, height: S, channels: 4, background: "#ffffff" } })
    .composite([{ input: fitted, left: Math.round((S - (fm.width ?? 0)) / 2), top: Math.round((S - (fm.height ?? 0)) / 2) }])
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  const ids: string[] = [];
  for (let i = 0; i < list.length; i++) {
    await progress(10 + (i / list.length) * 80, `Generating ${list[i]}`);
    const img = await generateAngle(onWhite, list[i]);
    const cutout = await removeBackground(img);
    const asset = await saveAsset({
      workspaceId: generation.workspaceId,
      projectId: project.id,
      createdBy: generation.userId,
      kind: "angle",
      label: `AI angle: ${list[i]}`,
      data: cutout.png,
      mime: "image/png",
      width: cutout.width,
      height: cutout.height,
      parentId: cut.id,
      generationId: generation.id,
      meta: { angle: list[i], aiGenerated: true, warning: "AI-reimagined view — verify details before publishing." },
    });
    ids.push(asset.id);
  }
  return { result: { assetIds: ids }, provider: "openai" };
};

const mockup: JobHandler = async ({ generation, params, progress }) => {
  const src = await getAsset(generation.workspaceId, String(params.assetId));
  await progress(30, "Building mockup");
  const out = await renderMockup(params.template as MockupTemplate, await readAsset(src));
  const asset = await saveAsset({
    workspaceId: generation.workspaceId,
    projectId: src.projectId,
    createdBy: generation.userId,
    kind: "mockup",
    label: `Mockup · ${params.template}`,
    data: await sharp(out).jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
    mime: "image/jpeg",
    parentId: src.id,
    generationId: generation.id,
    meta: { template: params.template },
  });
  return { result: { assetIds: [asset.id] }, provider: "local:mockups" };
};

const bundle: JobHandler = async ({ generation, params, progress }) => {
  const ids = (params.cutoutAssetIds as string[]) ?? [];
  const found = await getAssets(generation.workspaceId, ids);
  const ordered = ids.map((id) => found.find((a) => a.id === id)).filter(Boolean) as Asset[];
  if (ordered.length < 2) throw new JobError("Pick at least two products with removed backgrounds.");
  await progress(30, "Arranging products");
  const recipe: RenderRecipe = {
    version: 1,
    styleId: String(params.styleId ?? "studio-white"),
    aspect: (params.aspect as AspectId) ?? "1:1",
    layout: "standing",
    variation: Number(params.variation ?? 0),
    cutoutAssetId: ordered[0].id,
    extraCutoutAssetIds: ordered.slice(1).map((a) => a.id),
    scale: 1.05,
  };
  const out = await renderRecipe({
    recipe,
    product: await productSource(ordered[0]),
    extraProducts: await Promise.all(ordered.slice(1).map(productSource)),
    longEdge: PREVIEW_EDGE,
  });
  const enc = await encodeRender(out.data, out.transparent);
  const asset = await saveAsset({
    workspaceId: generation.workspaceId,
    projectId: generation.projectId ?? ordered[0].projectId,
    createdBy: generation.userId,
    kind: "bundle",
    label: `Bundle · ${ordered.length} products`,
    data: enc.data,
    mime: enc.mime,
    width: out.width,
    height: out.height,
    generationId: generation.id,
    meta: { recipe, styleId: recipe.styleId, styleName: getStyle(recipe.styleId)?.name },
  });
  return { result: { assetIds: [asset.id] }, provider: "local:compositor" };
};

// ── Copy jobs (Claude) ───────────────────────────────────────────────────

async function saveCopy(
  gen: Generation,
  kind: "description" | "social" | "ad_copy" | "campaign" | "brand_kit",
  title: string,
  language: string,
  tone: string | undefined,
  data: Record<string, unknown>,
) {
  const db = await getDb();
  const id = newId("cpy");
  await db.insert(copies).values({
    id,
    workspaceId: gen.workspaceId,
    projectId: gen.projectId,
    generationId: gen.id,
    createdBy: gen.userId,
    kind,
    language,
    tone: tone ?? null,
    title,
    data,
  });
  return id;
}

async function productImageBlocks(project: Project) {
  const assetId = project.cutoutAssetId ?? project.originalAssetId;
  if (!assetId) return [];
  try {
    const a = await getAsset(project.workspaceId, assetId);
    return [await imageBlock(await readAsset(a))];
  } catch {
    return [];
  }
}

const analyze: JobHandler = async ({ generation, progress }) => {
  const project = await loadProject(generation);
  if (!project.originalAssetId) throw new JobError("Upload a product photo first.");
  const original = await getAsset(generation.workspaceId, project.originalAssetId);
  await progress(20, "Identifying your product");
  const prompt = analysisPrompt();
  const { data, model } = await generateStructured({
    system: prompt.system,
    content: [await imageBlock(await readAsset(original)), { type: "text", text: prompt.text }],
    schema: analysisSchema,
    effort: "low",
    maxTokens: 4000,
  });
  data.suggestedStyles = data.suggestedStyles.filter((s) => STYLE_MAP[s]);
  const product = { ...project.product };
  if (!product.category) product.category = data.category;
  const name = /^untitled/i.test(project.name) || !project.name.trim() ? data.productName : project.name;
  await updateProject(project.id, { analysis: data, product, name });
  return { result: { analysis: data }, provider: model };
};

const description: JobHandler = async ({ generation, params, progress }) => {
  const project = await loadProject(generation);
  const p = params as unknown as DescriptionParams;
  await progress(15, "Writing your product copy");
  const { data, model } = await generateStructured({
    system: descriptionPrompt(p),
    content: [
      ...(await productImageBlocks(project)),
      { type: "text", text: `${productContext(project.product, project.analysis)}\n\nWrite the product listing copy.` },
    ],
    schema: descriptionSchema,
  });
  const copyId = await saveCopy(generation, "description", data.titles[0] ?? project.name, p.language, p.tone, data);
  return { result: { copyId, output: data }, provider: model };
};

const social: JobHandler = async ({ generation, params, progress }) => {
  const project = await loadProject(generation);
  const p = params as unknown as SocialParams;
  await progress(15, "Writing captions, hooks and hashtags");
  const { data, model } = await generateStructured({
    system: socialPrompt(p),
    content: [
      ...(await productImageBlocks(project)),
      { type: "text", text: `${productContext(project.product, project.analysis)}${offerBlock(p.offer)}\n\nCreate the social media content.` },
    ],
    schema: socialSchema,
  });
  const copyId = await saveCopy(generation, "social", `Social pack · ${project.name}`, p.language, p.tone, data);
  return { result: { copyId, output: data }, provider: model };
};

const adCopy: JobHandler = async ({ generation, params, progress }) => {
  const project = await loadProject(generation);
  const p = params as unknown as AdCopyParams;
  await progress(15, "Writing ad headlines");
  const { data, model } = await generateStructured({
    system: adCopyPrompt(p),
    content: [{ type: "text", text: `${productContext(project.product, project.analysis)}${offerBlock(p.offer)}\n\nWrite the ad copy variants.` }],
    schema: adCopySchema,
    effort: "low",
    maxTokens: 6000,
  });
  const copyId = await saveCopy(generation, "ad_copy", `Ad copy · ${project.name}`, p.language, p.tone, data);
  return { result: { copyId, output: data }, provider: model };
};

const brandKit: JobHandler = async ({ generation, params, progress }) => {
  const db = await getDb();
  let extracted: string[] = [];
  if (params.sourceAssetId) {
    try {
      const a = await getAsset(generation.workspaceId, String(params.sourceAssetId));
      extracted = await extractPalette(await readAsset(a), 5);
    } catch {
      extracted = [];
    }
  }
  await progress(20, "Designing your brand kit");
  const prompt = brandKitPrompt({
    language: (params.language as Language) ?? "en",
    brandName: String(params.brandName),
    category: String(params.category ?? ""),
    description: params.description as string | undefined,
    audience: params.audience as string | undefined,
    vibe: params.vibe as string | undefined,
    extractedColors: extracted,
  });
  const { data, model } = await generateStructured({
    system: prompt.system,
    content: [{ type: "text", text: prompt.user }],
    schema: brandKitSchema,
  });
  const id = newId("bk");
  await db.insert(brandKits).values({
    id,
    workspaceId: generation.workspaceId,
    name: String(params.brandName),
    data: { ...data, extractedColors: extracted, language: params.language ?? "en" },
    logoAssetId: (params.sourceAssetId as string) ?? null,
    createdBy: generation.userId,
  });
  return { result: { brandKitId: id, output: data }, provider: model };
};

const campaign: JobHandler = async ({ generation, params, progress }) => {
  const project = await loadProject(generation);
  const p = params as unknown as CampaignParams;
  await progress(12, "Planning your campaign");
  const { data, model } = await generateStructured({
    system: campaignPrompt(p),
    content: [
      ...(await productImageBlocks(project)),
      {
        type: "text",
        text: `${productContext(project.product, project.analysis)}${offerBlock(p.offer)}${p.audience ? `\n<audience>${p.audience}</audience>` : ""}\n\nPlan the campaign.`,
      },
    ],
    schema: campaignSchema,
    effort: "medium",
  });
  const copyId = await saveCopy(generation, "campaign", data.name, p.language, p.tone, data);
  return { result: { copyId, output: data }, provider: model };
};

// ── Batch ────────────────────────────────────────────────────────────────

const batch: JobHandler = async ({ generation, params, progress }) => {
  const items = (params.items as { projectId: string; originalAssetId: string }[]) ?? [];
  const perItem = Number(params.perItemCost ?? 2);
  const out: { projectId: string; status: "succeeded" | "failed"; renderAssetId?: string; cutoutAssetId?: string; error?: string }[] = [];
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await progress(5 + (i / items.length) * 92, `Processing photo ${i + 1} of ${items.length}`);
    try {
      const fake = { ...generation, projectId: it.projectId };
      const noop = async () => {};
      const c = await cutout({ generation: fake, params: { originalAssetId: it.originalAssetId }, progress: noop } as JobContext);
      const cutoutAssetId = String(c.result.cutoutAssetId);
      const s = await studio({
        generation: fake,
        params: {
          styleId: params.styleId,
          aspect: params.aspect,
          layout: params.layout ?? "standing",
          variations: 1,
          cutoutAssetId,
        },
        progress: noop,
      } as JobContext);
      out.push({ projectId: it.projectId, status: "succeeded", cutoutAssetId, renderAssetId: (s.result.assetIds as string[])[0] });
    } catch (err) {
      failed++;
      out.push({
        projectId: it.projectId,
        status: "failed",
        error: err instanceof JobError || (err as { expose?: boolean })?.expose ? (err as Error).message : "Processing failed",
      });
    }
  }
  if (failed) {
    await refundPartialCredits(generation.workspaceId, generation.id, failed * perItem, `Refund for ${failed} failed batch item(s)`);
  }
  if (failed === items.length) throw new JobError("None of the photos could be processed.");
  return { result: { items: out, succeeded: items.length - failed, failed } };
};

export const handlers: Partial<Record<GenerationType, JobHandler>> = {
  cutout,
  studio,
  scene,
  enhance,
  upscale,
  ai_upscale: aiUpscale,
  angles,
  mockup,
  bundle,
  analyze,
  description,
  social,
  ad_copy: adCopy,
  brand_kit: brandKit,
  campaign,
  batch,
};

export type { JobOutput };
