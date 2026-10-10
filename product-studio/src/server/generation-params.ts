import "server-only";
import { z } from "zod";
import { GENERATION_TYPES, studioCost, type GenerationType } from "@/lib/generation-types";
import { getPlan } from "@/lib/plans";
import { ASPECTS, STYLE_MAP, type AspectId } from "@/lib/studio-styles";
import { MOCKUP_TEMPLATES } from "./imaging/mockups";
import type { AuthContext } from "./auth/session";
import { HttpError } from "./http";

// Validates the parameters of each generation type and prices it.

const aspect = z.enum(Object.keys(ASPECTS) as [AspectId, ...AspectId[]]);
const layout = z.enum(["standing", "floating", "flatlay"]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const language = z.enum(["en", "ar"]);
const tone = z.enum(["professional", "luxury", "friendly", "persuasive", "minimal", "playful"]);
const id = z.string().min(3).max(64);
const shortText = (max: number) => z.string().trim().max(max).optional();

const schemas = {
  cutout: z.object({ originalAssetId: id.optional() }),
  analyze: z.object({}),
  studio: z.object({
    styleId: z.string().refine((s) => STYLE_MAP[s]?.kind === "procedural", "Unknown studio style"),
    aspect,
    layout,
    variations: z.number().int().min(1).max(4),
    startVariation: z.number().int().min(0).max(1000).optional(),
    palette: z.array(hex).min(1).max(5).optional(),
    scale: z.number().min(0.4).max(1.6).optional(),
    offsetX: z.number().min(-0.3).max(0.3).optional(),
    shadow: z.enum(["contact", "soft", "drop", "hard", "none"]).optional(),
    shadowStrength: z.number().min(0).max(1.6).optional(),
    reflection: z.boolean().optional(),
    lightSide: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    cutoutAssetId: id,
  }),
  scene: z
    .object({
      styleId: z.string().refine((s) => STYLE_MAP[s]?.kind === "ai", "Unknown AI scene").optional(),
      customPrompt: shortText(400),
      aspect,
      layout,
      variations: z.number().int().min(1).max(2),
      cutoutAssetId: id,
    })
    .refine((v) => v.styleId || v.customPrompt, "Choose an AI scene or describe one"),
  enhance: z.object({ assetId: id, strength: z.enum(["subtle", "balanced", "strong"]), denoise: z.boolean().optional() }),
  upscale: z.object({ assetId: id, factor: z.union([z.literal(2), z.literal(4)]) }),
  ai_upscale: z.object({ assetId: id }),
  angles: z.object({
    cutoutAssetId: id,
    angles: z
      .array(z.enum(["three-quarter left view", "three-quarter right view", "side profile view", "back view", "top-down view", "low hero angle"]))
      .min(1)
      .max(4),
  }),
  mockup: z.object({ assetId: id, template: z.enum(MOCKUP_TEMPLATES.map((m) => m.id) as [string, ...string[]]) }),
  bundle: z.object({
    cutoutAssetIds: z.array(id).min(2).max(5),
    styleId: z.string().refine((s) => STYLE_MAP[s]?.kind === "procedural", "Unknown studio style"),
    aspect,
    variation: z.number().int().min(0).max(100).optional(),
  }),
  description: z.object({
    language,
    tone,
    length: z.enum(["short", "medium", "long"]),
    channel: z.enum(["general", "amazon", "shopify", "instagram", "noon"]),
  }),
  social: z.object({
    language,
    tone,
    platforms: z.array(z.enum(["Instagram", "TikTok", "Snapchat", "Facebook", "X", "Pinterest", "LinkedIn"])).min(1).max(7),
    goal: z.enum(["launch", "sale", "engagement", "awareness", "seasonal"]),
    offer: shortText(300),
    occasion: shortText(80),
  }),
  ad_copy: z.object({
    language,
    tone,
    adType: z.enum(["promo", "sale", "launch", "seasonal"]),
    offer: shortText(300),
    occasion: shortText(80),
  }),
  brand_kit: z.object({
    language,
    brandName: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(120),
    description: shortText(1000),
    audience: shortText(300),
    vibe: shortText(200),
    sourceAssetId: id.optional(),
  }),
  campaign: z.object({
    language,
    tone,
    goal: z.string().trim().min(2).max(120),
    occasion: shortText(80),
    days: z.number().int().min(3).max(14),
    platforms: z.array(z.string().max(30)).min(1).max(7),
    offer: shortText(300),
    audience: shortText(300),
    brandVoice: shortText(400),
  }),
} satisfies Partial<Record<GenerationType, z.ZodType>>;

export type ValidatedType = keyof typeof schemas;

export function validateGeneration(auth: AuthContext, type: string, raw: unknown) {
  if (!(type in schemas)) throw new HttpError(400, "Unknown tool.");
  const t = type as ValidatedType;
  const params = (schemas[t] as z.ZodType).parse(raw ?? {}) as Record<string, unknown>;
  const plan = getPlan(auth.workspace.plan);
  let cost = GENERATION_TYPES[t].cost;

  if (t === "studio") {
    const v = params.variations as number;
    if (v > plan.limits.maxVariations) {
      throw new HttpError(403, `Your plan renders up to ${plan.limits.maxVariations} variations at a time.`, "upgrade_required", {
        requiredPlan: "starter",
      });
    }
    cost = studioCost(v);
  }
  if (t === "scene") cost = GENERATION_TYPES.scene.cost * (params.variations as number);
  if (t === "angles") cost = GENERATION_TYPES.angles.cost * (params.angles as string[]).length;
  return { type: t as GenerationType, params, cost };
}
