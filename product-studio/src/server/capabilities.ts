import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { GenerationType } from "@/lib/generation-types";
import { env, imageProvider } from "./env";

export interface Capabilities {
  backgroundRemoval: boolean;
  anthropic: boolean;
  imageProvider: "openai" | "stability" | null;
  aiScenes: boolean;
  aiUpscale: boolean;
  angles: boolean;
  payments: boolean;
  email: boolean;
}

export function bgModelPath() {
  return path.join(env.modelsDir, `${env.bgModel}.onnx`);
}

export function getCapabilities(): Capabilities {
  const provider = imageProvider();
  return {
    backgroundRemoval: fs.existsSync(bgModelPath()),
    anthropic: Boolean(env.anthropicApiKey),
    imageProvider: provider,
    aiScenes: provider !== null,
    aiUpscale: Boolean(env.stabilityApiKey),
    angles: Boolean(env.openaiApiKey),
    payments: Boolean(env.stripeSecretKey),
    email: Boolean(env.resendApiKey),
  };
}

/** Human-readable reason a generation type can't run on this deployment, or null. */
export function unavailableReason(type: GenerationType): string | null {
  const c = getCapabilities();
  const needsCutout: GenerationType[] = ["cutout"];
  if (needsCutout.includes(type) && !c.backgroundRemoval) {
    return "Background removal model isn't installed on this server. An administrator needs to run `npm run models:download`.";
  }
  switch (type) {
    case "analyze":
    case "description":
    case "social":
    case "ad_copy":
    case "brand_kit":
    case "campaign":
      return c.anthropic
        ? null
        : "AI writing isn't connected on this server yet. An administrator needs to set ANTHROPIC_API_KEY.";
    case "scene":
      return c.aiScenes
        ? null
        : "AI scene generation isn't connected on this server yet. An administrator needs to set OPENAI_API_KEY or STABILITY_API_KEY. Procedural studio styles still work.";
    case "ai_upscale":
      return c.aiUpscale
        ? null
        : "AI upscaling isn't connected on this server yet (requires STABILITY_API_KEY). The standard upscaler is available.";
    case "angles":
      return c.angles ? null : "The angle generator needs an image-editing model. An administrator needs to set OPENAI_API_KEY.";
    default:
      return null;
  }
}
