// Subscription plans, limits and credit packs. Shared by server and client so
// pricing pages, gating and enforcement always agree.

export type PlanId = "free" | "starter" | "pro" | "business";
export type BillingInterval = "month" | "year";

export interface PlanLimits {
  /** Credits granted at the start of each monthly period (do not roll over). */
  monthlyCredits: number;
  /** Longest edge (px) of downloadable exports. */
  maxExportPx: number;
  /** Whether exports and previews carry the Vitrine watermark. */
  watermark: boolean;
  /** Advanced tools: AI upscaler, angle generator, mockups, bundles, campaigns. */
  advancedTools: boolean;
  /** Max photos per batch run (0 = batch processing unavailable). */
  batchMaxItems: number;
  /** Max saved brand kits (0 = unavailable, -1 = unlimited). */
  brandKits: number;
  /** Seats in the workspace including the owner. */
  seats: number;
  /** Number of variations generated per studio run. */
  maxVariations: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number; // USD
  priceYearly: number; // USD, billed annually
  limits: PlanLimits;
  highlights: string[];
  popular?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try the full studio with monthly trial credits.",
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      monthlyCredits: 30,
      maxExportPx: 1024,
      watermark: true,
      advancedTools: false,
      batchMaxItems: 0,
      brandKits: 0,
      seats: 1,
      maxVariations: 2,
    },
    highlights: [
      "30 credits every month",
      "AI background removal & studio scenes",
      "Descriptions, ad copy & captions",
      "1024px exports with watermark",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For new stores shipping their first catalog.",
    priceMonthly: 15,
    priceYearly: 144,
    limits: {
      monthlyCredits: 250,
      maxExportPx: 2048,
      watermark: false,
      advancedTools: false,
      batchMaxItems: 0,
      brandKits: 0,
      seats: 1,
      maxVariations: 4,
    },
    highlights: [
      "250 credits every month",
      "2K exports, no watermark",
      "All studio styles & AI scenes",
      "Ad designer & social creator",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For growing brands that sell everywhere.",
    priceMonthly: 39,
    priceYearly: 372,
    popular: true,
    limits: {
      monthlyCredits: 800,
      maxExportPx: 4096,
      watermark: false,
      advancedTools: true,
      batchMaxItems: 0,
      brandKits: 1,
      seats: 1,
      maxVariations: 4,
    },
    highlights: [
      "800 credits every month",
      "4K exports",
      "AI upscaler, angles, mockups & bundles",
      "Campaign generator & 1 brand kit",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "For teams producing content at scale.",
    priceMonthly: 99,
    priceYearly: 948,
    limits: {
      monthlyCredits: 2500,
      maxExportPx: 4096,
      watermark: false,
      advancedTools: true,
      batchMaxItems: 50,
      brandKits: -1,
      seats: 5,
      maxVariations: 4,
    },
    highlights: [
      "2,500 credits every month",
      "Batch processing (50 photos per run)",
      "Unlimited brand kits",
      "5 team seats with shared projects",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "business"];

export function getPlan(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "free"];
}

export function isPaidPlan(id: PlanId) {
  return id !== "free";
}

export interface CreditPack {
  id: "pack_100" | "pack_500" | "pack_1500";
  credits: number;
  price: number; // USD
  label: string;
}

/** Top-up packs. Purchased credits never expire and are used after monthly credits. */
export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_100", credits: 100, price: 9, label: "100 credits" },
  { id: "pack_500", credits: 500, price: 39, label: "500 credits" },
  { id: "pack_1500", credits: 1500, price: 99, label: "1,500 credits" },
];

export function formatPrice(usd: number) {
  return usd === 0 ? "$0" : `$${usd % 1 === 0 ? usd : usd.toFixed(2)}`;
}
