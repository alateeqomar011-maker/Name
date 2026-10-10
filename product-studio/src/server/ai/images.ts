import "server-only";
import { env, imageProvider, type ImageProvider } from "../env";
import { JobError } from "../jobs/errors";

// Generative image providers. Used for AI scenes (inpainting around the product),
// AI-reimagined angles and AI upscaling. Product pixels in final renders always
// come from the original photo — providers only create the surrounding scene.

const TIMEOUT_MS = 180_000;

export type SceneSize = "1024x1024" | "1536x1024" | "1024x1536";

async function providerError(provider: string, res: Response): Promise<JobError> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.errors?.join?.("; ") ?? body?.message ?? "";
  } catch {
    // ignore non-JSON bodies
  }
  console.error(`[${provider}] HTTP ${res.status}: ${detail}`);
  if (res.status === 401 || res.status === 403) {
    return new JobError(`The ${provider} image service rejected this server's credentials. Please contact the administrator.`);
  }
  if (res.status === 402) return new JobError(`The ${provider} account used by this server is out of credits. Please contact the administrator.`);
  if (res.status === 429) return new JobError(`The ${provider} image service is busy. Please try again in a minute.`);
  if (res.status === 400 && /safety|moderation|policy|flagged|content/i.test(detail)) {
    return new JobError("The image service declined this request under its content policy. Try a different scene description.");
  }
  return new JobError(`The ${provider} image service returned an error (${res.status}). Please try again.`);
}

function blob(data: Buffer, type = "image/png") {
  return new Blob([new Uint8Array(data)], { type });
}

// ── OpenAI ───────────────────────────────────────────────────────────────

async function openaiEdit(opts: {
  image: Buffer;
  mask?: Buffer;
  prompt: string;
  size: SceneSize;
  n: number;
}): Promise<Buffer[]> {
  const form = new FormData();
  form.append("model", env.openaiImageModel);
  form.append("prompt", opts.prompt);
  form.append("image", blob(opts.image), "image.png");
  if (opts.mask) form.append("mask", blob(opts.mask), "mask.png");
  form.append("size", opts.size);
  form.append("n", String(opts.n));
  if (env.openaiImageModel.startsWith("gpt-image")) {
    form.append("quality", "high");
    form.append("input_fidelity", "high");
  }
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.openaiApiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new JobError("Couldn't reach the OpenAI image service. Please try again shortly.");
  }
  if (!res.ok) throw await providerError("OpenAI", res);
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const images = (json.data ?? []).map((d) => d.b64_json).filter(Boolean) as string[];
  if (!images.length) throw new JobError("The image service returned no image. Please try again.");
  return images.map((b) => Buffer.from(b, "base64"));
}

// ── Stability AI ─────────────────────────────────────────────────────────

async function stabilityRequest(path: string, form: FormData): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(`https://api.stability.ai${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.stabilityApiKey}`, Accept: "image/*" },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new JobError("Couldn't reach the Stability AI service. Please try again shortly.");
  }
  if (!res.ok) throw await providerError("Stability AI", res);
  return Buffer.from(await res.arrayBuffer());
}

async function stabilityInpaint(opts: { image: Buffer; mask: Buffer; prompt: string; seed: number }) {
  const form = new FormData();
  form.append("image", blob(opts.image), "image.png");
  form.append("mask", blob(opts.mask), "mask.png");
  form.append("prompt", opts.prompt);
  form.append(
    "negative_prompt",
    "text, watermark, logo, letters, extra products, duplicate product, distorted, deformed, blurry, low quality, people, hands",
  );
  form.append("grow_mask", "3");
  form.append("seed", String(opts.seed));
  form.append("output_format", "png");
  return stabilityRequest("/v2beta/stable-image/edit/inpaint", form);
}

export async function stabilityUpscaleFast(image: Buffer) {
  const form = new FormData();
  form.append("image", blob(image), "image.png");
  form.append("output_format", "png");
  return stabilityRequest("/v2beta/stable-image/upscale/fast", form);
}

// ── Public API ───────────────────────────────────────────────────────────

export interface SceneRequest {
  /** Canvas with the product placed on a transparent background. */
  productLayer: Buffer;
  /** Same canvas with the product on neutral gray (for providers that need opaque input). */
  productOnGray: Buffer;
  /** Alpha mask: opaque where the product must be kept. */
  keepMaskTransparentElsewhere: Buffer;
  /** White where the scene should be generated, black where the product is. */
  inpaintMask: Buffer;
  prompt: string;
  size: SceneSize;
  n: number;
}

export async function generateScenes(req: SceneRequest): Promise<{ images: Buffer[]; provider: ImageProvider }> {
  const provider = imageProvider();
  if (!provider) throw new JobError("AI scene generation isn't connected on this server.");
  if (provider === "openai") {
    const images = await openaiEdit({
      image: req.productLayer,
      mask: req.keepMaskTransparentElsewhere,
      prompt: req.prompt,
      size: req.size,
      n: req.n,
    });
    return { images, provider };
  }
  const images: Buffer[] = [];
  for (let i = 0; i < req.n; i++) {
    images.push(
      await stabilityInpaint({
        image: req.productOnGray,
        mask: req.inpaintMask,
        prompt: req.prompt,
        seed: Math.floor(Math.random() * 4_000_000_000),
      }),
    );
  }
  return { images, provider };
}

export async function generateAngle(productOnWhite: Buffer, angle: string): Promise<Buffer> {
  if (!env.openaiApiKey) throw new JobError("The angle generator needs OPENAI_API_KEY on this server.");
  const prompt = `Show this exact same product from a ${angle}. Keep the product identical: same shape, proportions, colors, materials, finish, label layout, logo and printed text. Do not add, remove or redesign anything. Plain seamless pure white studio background, soft even lighting, the full product visible and centered, no props, no text, no watermark.`;
  const [img] = await openaiEdit({ image: productOnWhite, prompt, size: "1024x1024", n: 1 });
  return img;
}

export function scenePrompt(base: string, custom?: string) {
  const scene = custom?.trim() ? custom.trim() : base;
  return `Professional commercial product photograph. Scene: ${scene}. The product already in the image stays exactly as it is and sits naturally in the scene with physically correct contact shadows, reflections and lighting that match the environment. Eye-level camera, 85mm lens, shallow depth of field, photorealistic, high detail. Do not change, cover, duplicate or redesign the product. No text, no logos, no watermarks, no people.`;
}
