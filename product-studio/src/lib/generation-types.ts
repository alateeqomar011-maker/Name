// Every AI/processing operation is a "generation" job. Costs are in credits and
// are charged up-front, then refunded automatically if the job fails.

export type GenerationType =
  | "cutout" // AI background removal (local IS-Net model)
  | "studio" // studio scene compositing (procedural backdrops, shadows, reflections)
  | "scene" // generative AI scene around the product (OpenAI / Stability)
  | "enhance" // photo enhancer
  | "upscale" // standard (local) upscaler
  | "ai_upscale" // AI upscaler (Stability)
  | "angles" // AI-reimagined angles (OpenAI image edit)
  | "mockup" // mockup creator
  | "bundle" // multi-product bundle image
  | "analyze" // product identification with Claude vision
  | "description" // product titles, descriptions, features, SEO
  | "social" // captions, hashtags, hooks, campaign ideas
  | "ad_copy" // headlines, CTAs for ads
  | "brand_kit" // AI brand kit
  | "campaign" // coordinated campaign plan
  | "batch"; // batch processing parent job

export interface GenerationTypeInfo {
  label: string;
  /** Credits per unit (unit = image for image jobs, request for text jobs). */
  cost: number;
  /** Which external service the job depends on, if any. */
  requires?: "anthropic" | "image_gen" | "image_edit" | "ai_upscale";
  /** Queue the job runs on: CPU-heavy local work or network-bound API calls. */
  queue: "cpu" | "net";
  advanced?: boolean;
}

export const GENERATION_TYPES: Record<GenerationType, GenerationTypeInfo> = {
  cutout: { label: "Background removal", cost: 1, queue: "cpu" },
  studio: { label: "Studio scene", cost: 1, queue: "cpu" },
  scene: { label: "AI scene", cost: 4, requires: "image_edit", queue: "net" },
  enhance: { label: "Photo enhancer", cost: 1, queue: "cpu" },
  upscale: { label: "Upscaler", cost: 1, queue: "cpu" },
  ai_upscale: { label: "AI upscaler", cost: 3, requires: "ai_upscale", queue: "net", advanced: true },
  angles: { label: "Angle generator", cost: 5, requires: "image_edit", queue: "net", advanced: true },
  mockup: { label: "Mockup", cost: 1, queue: "cpu", advanced: true },
  bundle: { label: "Bundle image", cost: 2, queue: "cpu", advanced: true },
  analyze: { label: "Product detection", cost: 0, requires: "anthropic", queue: "net" },
  description: { label: "Product description", cost: 1, requires: "anthropic", queue: "net" },
  social: { label: "Social content pack", cost: 2, requires: "anthropic", queue: "net" },
  ad_copy: { label: "Ad copy", cost: 1, requires: "anthropic", queue: "net" },
  brand_kit: { label: "Brand kit", cost: 3, requires: "anthropic", queue: "net" },
  campaign: { label: "Campaign plan", cost: 5, requires: "anthropic", queue: "net", advanced: true },
  batch: { label: "Batch run", cost: 0, queue: "cpu" },
};

/** Studio runs are priced per pair of variations so the free plan can still explore. */
export function studioCost(variations: number) {
  return Math.max(1, Math.ceil(variations / 2)) * GENERATION_TYPES.studio.cost;
}
