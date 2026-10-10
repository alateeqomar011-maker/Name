"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { LinkButton } from "@/components/ui/button";
import { Badge, Segmented } from "@/components/ui/misc";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function PricingTable() {
  const [cycle, setCycle] = useState<"month" | "year">("month");
  return (
    <div>
      <div className="mb-8 flex justify-center">
        <Segmented
          value={cycle}
          onChange={setCycle}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: <span>Yearly <span className="text-success">save 20%</span></span> },
          ]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const price = cycle === "year" ? Math.round((p.priceYearly / 12) * 100) / 100 : p.priceMonthly;
          return (
            <div key={id} className={cn("relative flex flex-col rounded-3xl border bg-surface p-6 shadow-soft", p.popular ? "border-iris-300 ring-1 ring-iris-200 lg:-translate-y-2" : "border-line")}>
              {p.popular && <Badge tone="iris" className="absolute -top-2.5 left-6">Most popular</Badge>}
              <p className="text-lg font-semibold">{p.name}</p>
              <p className="mt-1 min-h-10 text-sm text-muted">{p.tagline}</p>
              <p className="mt-5">
                <span className="text-4xl font-semibold tracking-tight">${price}</span>
                <span className="text-sm text-muted"> / month</span>
              </p>
              <p className="mt-1 h-4 text-xs text-muted">{cycle === "year" && p.priceYearly > 0 ? `$${p.priceYearly} billed yearly` : p.priceMonthly === 0 ? "No card required" : "Billed monthly"}</p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-iris-600" /> {h}
                  </li>
                ))}
              </ul>
              <LinkButton href={id === "free" ? "/signup" : `/signup?plan=${id}`} variant={p.popular ? "accent" : id === "free" ? "secondary" : "primary"} className="mt-7 w-full">
                {id === "free" ? "Start free" : `Choose ${p.name}`}
              </LinkButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}
