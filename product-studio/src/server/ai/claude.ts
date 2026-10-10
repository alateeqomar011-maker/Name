import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import sharp from "sharp";
import type { z } from "zod";
import { env } from "../env";
import { JobError } from "../jobs/errors";

// Claude powers product understanding (vision) and all copywriting. Responses
// are constrained to JSON schemas (structured outputs) and validated with zod.

let client: Anthropic | null = null;

function getClient() {
  if (!env.anthropicApiKey) {
    throw new JobError("AI writing isn't connected on this server (ANTHROPIC_API_KEY is not set).");
  }
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 180_000 });
  return client;
}

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  content: ContentBlock[];
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export async function generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<{ data: z.infer<S>; model: string }> {
  const anthropic = getClient();
  const model = env.anthropicModel;
  const useFallback = FALLBACK_MODELS.has(model);
  try {
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: [{ role: "user", content: req.content }],
      output_config: { effort: req.effort ?? "medium", format: betaZodOutputFormat(req.schema) },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") {
      throw new JobError(
        "The AI declined to write this content. Please review the product details and try again with different wording.",
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new JobError("The response was too long to finish. Try fewer platforms or a shorter length.");
    }
    if (!response.parsed_output) {
      throw new JobError("The AI response couldn't be read. Your credits were refunded — please try again.");
    }
    return { data: response.parsed_output as z.infer<S>, model: response.model };
  } catch (err) {
    if (err instanceof JobError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new JobError("The AI service rejected this server's credentials. Please contact the administrator.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new JobError("The AI service is busy right now. Please try again in a minute.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("[claude] bad request", err.message);
      throw new JobError("The AI service couldn't process this request. Please adjust your inputs and try again.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new JobError("Couldn't reach the AI service. Please try again shortly.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[claude] api error", err.status, err.message);
      throw new JobError("The AI service had a problem. Please try again shortly.");
    }
    throw err;
  }
}

/** Prepares a product photo for Claude vision (bounded size, JPEG). */
export async function imageBlock(image: Buffer): Promise<ContentBlock> {
  const jpeg = await sharp(image)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(1568, 1568, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } };
}
