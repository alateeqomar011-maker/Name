"use client";

import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/misc";
import { useRunner } from "@/lib/client/hooks";
import type { AdCopyOutput, Language, Tone } from "@/lib/copy-schemas";
import { TONES } from "@/lib/copy-schemas";
import type { AdContent } from "@/lib/design/types";
import { cn } from "@/lib/utils";

/** Editable ad text (headline, CTA, badge, price) with an AI copywriter. */
export function ContentForm({
  value,
  onChange,
  projectId,
  compact,
}: {
  value: AdContent;
  onChange: (c: AdContent) => void;
  projectId: string | null;
  compact?: boolean;
}) {
  const { me } = useApp();
  const [language, setLanguage] = useState<Language>(me?.user.preferences.defaultLanguage ?? "en");
  const [tone, setTone] = useState<Tone>("persuasive");
  const [adType, setAdType] = useState<"promo" | "sale" | "launch" | "seasonal">("promo");
  const [offer, setOffer] = useState("");
  const [occasion, setOccasion] = useState("");
  const [variants, setVariants] = useState<AdCopyOutput["variants"]>([]);
  const [applied, setApplied] = useState<number | null>(null);
  const { run, busy } = useRunner((g) => {
    if (g.status === "succeeded") {
      const out = (g.result as { output?: AdCopyOutput })?.output;
      if (out?.variants.length) {
        setVariants(out.variants);
        apply(out.variants[0], 0);
      }
    }
  });
  const set = (k: keyof AdContent) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const apply = (v: AdCopyOutput["variants"][number], i: number) => {
    onChange({ ...value, headline: v.headline, subheadline: v.subheadline, cta: v.cta, badge: v.badge || value.badge, tagline: v.tagline });
    setApplied(i);
  };

  return (
    <div className="grid gap-3">
      <Field label="Headline">
        <Input value={value.headline} onChange={set("headline")} maxLength={120} dir="auto" />
      </Field>
      <Field label="Subheadline" optional>
        <Input value={value.subheadline ?? ""} onChange={set("subheadline")} maxLength={200} dir="auto" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Button" optional>
          <Input value={value.cta ?? ""} onChange={set("cta")} maxLength={40} dir="auto" />
        </Field>
        <Field label="Badge" optional>
          <Input value={value.badge ?? ""} onChange={set("badge")} maxLength={20} placeholder="-30%" dir="auto" />
        </Field>
        <Field label="Price" optional>
          <Input value={value.price ?? ""} onChange={set("price")} maxLength={30} placeholder="$49" dir="auto" />
        </Field>
        <Field label="Old price" optional>
          <Input value={value.oldPrice ?? ""} onChange={set("oldPrice")} maxLength={30} placeholder="$69" dir="auto" />
        </Field>
      </div>

      {projectId && (
        <div className={cn("rounded-2xl border border-iris-100 bg-iris-50/40 p-3.5", compact && "p-3")}>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-iris-700">
            <Sparkles className="size-3.5" /> AI copywriter
          </p>
          <div className="mt-3 grid gap-2.5">
            <Segmented
              size="sm"
              className="w-full"
              value={language}
              onChange={setLanguage}
              options={[
                { value: "en", label: "English" },
                { value: "ar", label: <span className="font-arabic">العربية</span> },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={adType} onChange={(e) => setAdType(e.target.value as typeof adType)} className="h-9 text-[13px]">
                <option value="promo">Promotion</option>
                <option value="sale">Sale</option>
                <option value="launch">Launch</option>
                <option value="seasonal">Seasonal</option>
              </Select>
              <Select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className="h-9 text-[13px]">
                {TONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Offer (e.g. 30% off until Friday)" className="h-9 text-[13px]" />
            {adType === "seasonal" && (
              <Input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Occasion (e.g. Ramadan, Black Friday)" className="h-9 text-[13px]" />
            )}
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              disabled={!me?.capabilities.anthropic}
              onClick={() => run("ad_copy", projectId, { language, tone, adType, offer: offer || undefined, occasion: occasion || undefined })}
              icon={<Sparkles className="size-3.5" />}
            >
              Write 4 variants · 1 cr
            </Button>
            {!me?.capabilities.anthropic && <p className="text-xs text-muted">AI writing isn&apos;t connected on this server — type your copy above.</p>}
          </div>
          {variants.length > 0 && (
            <div className="mt-3 grid gap-2">
              {variants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => apply(v, i)}
                  dir="auto"
                  className={cn(
                    "rounded-xl border bg-surface p-2.5 text-left text-xs transition",
                    applied === i ? "border-iris-400 ring-2 ring-iris-100" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{v.headline}</span>
                    {applied === i && <Check className="size-3.5 shrink-0 text-iris-600" />}
                  </span>
                  <span className="mt-0.5 block text-muted">{v.subheadline}</span>
                  <span className="mt-1 block font-medium text-iris-700">{v.cta}{v.badge ? ` · ${v.badge}` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
