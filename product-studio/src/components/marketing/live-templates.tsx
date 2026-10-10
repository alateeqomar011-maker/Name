"use client";

import { DesignCanvas } from "@/components/design/design-canvas";
import { buildFromTemplate } from "@/lib/design/templates";
import { FORMAT_MAP } from "@/lib/formats";
import { SAMPLES } from "@/lib/samples";

const SHOWCASE = [
  { template: "luxe", format: "ig-portrait", sample: "perfume", content: { headline: "Aura", tagline: "Eau de parfum", subheadline: "A warm, luminous signature for every evening.", cta: "Discover" } },
  { template: "sale", format: "ig-story", sample: "serum", content: { headline: "Glow week", subheadline: "Our best-selling serum, now on offer.", badge: "-25%", cta: "Shop the sale" } },
  { template: "festive", format: "ig-square", sample: "jar", content: { headline: "رمضان كريم", subheadline: "هدية تليق بمن تحب", cta: "تسوق الآن" } },
  { template: "split", format: "fb-landscape", sample: "mug", content: { headline: "Morning, upgraded", subheadline: "Stoneware mug for slow coffee rituals.", cta: "Order now", badge: "NEW" } },
  { template: "bold", format: "tt-video-cover", sample: "mug", content: { headline: "Kaffa", subheadline: "Brewed for early risers", cta: "Shop" } },
] as const;

/** Real ad templates rendered live in the browser with sample cut-outs. */
export function LiveTemplates() {
  return (
    <div className="no-scrollbar -mx-4 snap-x overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      <div className="mx-auto flex w-max items-end gap-5">
      {SHOWCASE.map((s, i) => {
        const f = FORMAT_MAP[s.format];
        const sample = SAMPLES.find((x) => x.id === s.sample)!;
        const doc = buildFromTemplate(s.template, { W: f.width, H: f.height, content: { ...s.content }, productAssetId: sample.cutout.src, rtl: /[؀-ۿ]/.test(s.content.headline) });
        const width = f.width > f.height ? 330 : f.width === f.height ? 250 : f.height / f.width > 1.5 ? 190 : 220;
        return (
          <figure key={i} className="shrink-0 snap-center">
            <div className="overflow-hidden rounded-2xl shadow-lift ring-1 ring-black/5">
              <DesignCanvas doc={doc} width={f.width} height={f.height} displayWidth={width} />
            </div>
            <figcaption className="mt-2 text-center text-xs text-muted">{f.name} · {f.width}×{f.height}</figcaption>
          </figure>
        );
      })}
      </div>
    </div>
  );
}
