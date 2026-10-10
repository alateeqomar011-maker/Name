import "server-only";
import path from "node:path";

// Central server configuration. Every external integration is optional: when a
// key is missing the related feature reports itself as unavailable instead of
// pretending to work.

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

const dataDir = path.resolve(str("DATA_DIR", "./data"));

export const env = {
  appUrl: str("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  isProd: process.env.NODE_ENV === "production",
  dataDir,
  databaseUrl: str("DATABASE_URL"),
  storageDir: path.resolve(str("STORAGE_DIR", path.join(dataDir, "storage"))),
  modelsDir: path.resolve(str("MODELS_DIR", path.join(dataDir, "models"))),
  bgModel: str("BG_REMOVAL_MODEL", "isnet-general-use"),

  anthropicApiKey: str("ANTHROPIC_API_KEY"),
  anthropicModel: str("ANTHROPIC_MODEL", "claude-opus-5-5"),

  openaiApiKey: str("OPENAI_API_KEY"),
  openaiImageModel: str("OPENAI_IMAGE_MODEL", "gpt-image-1"),
  stabilityApiKey: str("STABILITY_API_KEY"),
  imageProvider: str("IMAGE_PROVIDER", "auto"), // auto | openai | stability

  stripeSecretKey: str("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: str("STRIPE_WEBHOOK_SECRET"),
  stripePrices: {
    starter_month: str("STRIPE_PRICE_STARTER_MONTHLY"),
    starter_year: str("STRIPE_PRICE_STARTER_YEARLY"),
    pro_month: str("STRIPE_PRICE_PRO_MONTHLY"),
    pro_year: str("STRIPE_PRICE_PRO_YEARLY"),
    business_month: str("STRIPE_PRICE_BUSINESS_MONTHLY"),
    business_year: str("STRIPE_PRICE_BUSINESS_YEARLY"),
    pack_100: str("STRIPE_PRICE_PACK_100"),
    pack_500: str("STRIPE_PRICE_PACK_500"),
    pack_1500: str("STRIPE_PRICE_PACK_1500"),
  } as Record<string, string>,

  resendApiKey: str("RESEND_API_KEY"),
  emailFrom: str("EMAIL_FROM", "Vitrine <hello@example.com>"),
  supportEmail: str("SUPPORT_EMAIL", "support@example.com"),

  /** Allow the in-app "dev upgrade" switch. Never enable in production. */
  devBilling: str("DEV_BILLING") === "1" && process.env.NODE_ENV !== "production",
};

export type ImageProvider = "openai" | "stability";

export function imageProvider(): ImageProvider | null {
  const pref = env.imageProvider;
  if (pref === "openai") return env.openaiApiKey ? "openai" : null;
  if (pref === "stability") return env.stabilityApiKey ? "stability" : null;
  if (env.openaiApiKey) return "openai";
  if (env.stabilityApiKey) return "stability";
  return null;
}
