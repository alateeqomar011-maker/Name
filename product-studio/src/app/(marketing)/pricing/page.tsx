import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { PricingTable } from "@/components/marketing/pricing-table";
import { CREDIT_PACKS, PLANS, PLAN_ORDER } from "@/lib/plans";
import { GENERATION_TYPES } from "@/lib/generation-types";

export const metadata: Metadata = { title: "Pricing", description: "Simple, credit-based plans for online sellers, growing brands and teams." };

const ROWS: { label: string; value: (id: (typeof PLAN_ORDER)[number]) => string | boolean }[] = [
  { label: "Monthly credits", value: (id) => PLANS[id].limits.monthlyCredits.toLocaleString() },
  { label: "Max export size", value: (id) => `${PLANS[id].limits.maxExportPx}px` },
  { label: "Watermark-free exports", value: (id) => !PLANS[id].limits.watermark },
  { label: "Variations per run", value: (id) => String(PLANS[id].limits.maxVariations) },
  { label: "Studio styles & AI scenes", value: () => true },
  { label: "Descriptions, ad copy & captions (EN/AR)", value: () => true },
  { label: "Ad designer & social creator", value: () => true },
  { label: "AI upscaler, angles, mockups, bundles", value: (id) => PLANS[id].limits.advancedTools },
  { label: "Campaign generator", value: (id) => PLANS[id].limits.advancedTools },
  { label: "Brand kits", value: (id) => (PLANS[id].limits.brandKits === -1 ? "Unlimited" : PLANS[id].limits.brandKits === 0 ? false : String(PLANS[id].limits.brandKits)) },
  { label: "Batch processing", value: (id) => (PLANS[id].limits.batchMaxItems ? `${PLANS[id].limits.batchMaxItems} photos/run` : false) },
  { label: "Team seats", value: (id) => String(PLANS[id].limits.seats) },
];

const COSTS = ["cutout", "studio", "scene", "enhance", "upscale", "ai_upscale", "description", "social", "ad_copy", "brand_kit", "campaign", "mockup", "bundle", "angles"] as const;

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-5xl tracking-tight sm:text-7xl">Pricing that grows with you</h1>
        <p className="mt-4 text-lg text-muted">Every plan includes the full studio. Pay for more credits, higher resolution and advanced tools as you grow.</p>
      </div>
      <div className="mt-12">
        <PricingTable />
      </div>

      <h2 className="mt-24 mb-6 text-2xl font-semibold">Compare plans</h2>
      <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-5 py-4 font-medium text-muted">Feature</th>
              {PLAN_ORDER.map((id) => (
                <th key={id} className="px-5 py-4 font-semibold">{PLANS[id].name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <td className="px-5 py-3.5 text-ink-2">{r.label}</td>
                {PLAN_ORDER.map((id) => {
                  const v = r.value(id);
                  return (
                    <td key={id} className="px-5 py-3.5">
                      {v === true ? <Check className="size-4 text-success" /> : v === false ? <Minus className="size-4 text-faint" /> : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-16 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-2xl font-semibold">What things cost</h2>
          <div className="overflow-hidden rounded-3xl border border-line bg-surface">
            <table className="w-full text-sm">
              <tbody>
                {COSTS.map((t) => (
                  <tr key={t} className="border-t border-line first:border-t-0">
                    <td className="px-5 py-3">{GENERATION_TYPES[t].label}</td>
                    <td className="px-5 py-3 text-right text-muted">
                      {t === "studio" ? "1 credit per 2 variations" : `${GENERATION_TYPES[t].cost} credit${GENERATION_TYPES[t].cost === 1 ? "" : "s"}${t === "scene" || t === "angles" ? " per image" : ""}`}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <td className="px-5 py-3">Product detection, downloads, editing</td>
                  <td className="px-5 py-3 text-right font-medium text-success">Free</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Credits are refunded automatically when a generation fails.</p>
        </div>
        <div>
          <h2 className="mb-4 text-2xl font-semibold">Credit packs</h2>
          <div className="grid gap-3">
            {CREDIT_PACKS.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4">
                <span className="font-semibold">{p.label}</span>
                <span className="text-muted">${p.price} · one-time</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Pack credits never expire and are used after your monthly credits. Prices in USD; taxes may apply at checkout.</p>
          <div className="mt-8 rounded-3xl bg-ink p-6 text-white">
            <p className="font-semibold">Payments you control</p>
            <p className="mt-1 text-sm text-white/70">Checkout is handled by Stripe. You always see and confirm the total before paying, and you can cancel your subscription anytime from your billing page.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
