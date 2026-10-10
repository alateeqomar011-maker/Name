"use client";

import { Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GenerationStatus } from "@/components/app/ai-status";
import { useApp } from "@/components/app/app-provider";
import { InputImage, ResultView, ToolFrame, useAsset } from "@/components/app/tool-frame";
import { Button } from "@/components/ui/button";
import { Badge, Card, Segmented, Switch } from "@/components/ui/misc";
import type { AssetDto } from "@/lib/client/api";
import { useRunner } from "@/lib/client/hooks";
import { PLANS } from "@/lib/plans";

export function EnhanceTool() {
  const params = useSearchParams();
  const { me, showUpgrade } = useApp();
  const [assetId, setAssetId] = useState<string | null>(params.get("asset"));
  const { data } = useAsset(assetId);
  const [source, setSource] = useState<AssetDto | null>(null);
  const [tab, setTab] = useState<"enhance" | "upscale" | "ai">(params.get("tab") === "upscale" ? "upscale" : "enhance");
  const [strength, setStrength] = useState<"subtle" | "balanced" | "strong">("balanced");
  const [denoise, setDenoise] = useState(false);
  const [factor, setFactor] = useState<"2" | "4">("2");
  const [resultId, setResultId] = useState<string | null>(null);
  const { run, generation, busy } = useRunner((g) => {
    if (g.status === "succeeded") setResultId(((g.result as { assetIds?: string[] })?.assetIds ?? [])[0] ?? null);
  });
  useEffect(() => {
    if (data?.asset) setSource(data.asset);
  }, [data]);

  const proPlus = me ? PLANS[me.workspace.plan].limits.advancedTools : false;
  const cost = tab === "enhance" ? 1 : tab === "upscale" ? 1 : 3;
  const go = () => {
    if (!source) return;
    setResultId(null);
    if (tab === "enhance") run("enhance", source.projectId, { assetId: source.id, strength, denoise });
    else if (tab === "upscale") run("upscale", source.projectId, { assetId: source.id, factor: Number(factor) });
    else {
      if (!proPlus) return showUpgrade("AI upscaling is part of the Pro and Business plans.", "pro");
      run("ai_upscale", source.projectId, { assetId: source.id });
    }
  };

  return (
    <ToolFrame title="Enhance & upscale" description="Correct exposure, color and sharpness, or enlarge an image for large prints and 4K exports.">
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <InputImage
            asset={source}
            onPick={(a) => {
              setSource(a);
              setAssetId(a.id);
              setResultId(null);
            }}
          />
          <Card className="grid gap-4 p-4">
            <Segmented
              className="w-full"
              value={tab}
              onChange={setTab}
              options={[
                { value: "enhance", label: "Enhance" },
                { value: "upscale", label: "Upscale" },
                { value: "ai", label: <span className="flex items-center justify-center gap-1">AI upscale {!proPlus && <Badge tone="iris">Pro</Badge>}</span> },
              ]}
            />
            {tab === "enhance" && (
              <>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium">Strength</p>
                  <Segmented className="w-full" size="sm" value={strength} onChange={setStrength} options={[{ value: "subtle", label: "Subtle" }, { value: "balanced", label: "Balanced" }, { value: "strong", label: "Strong" }]} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px]">Reduce noise</span>
                  <Switch checked={denoise} onCheckedChange={setDenoise} />
                </div>
                <p className="text-xs text-muted">Automatic levels, white balance, color and clarity. Algorithmic — it corrects your photo without inventing detail.</p>
              </>
            )}
            {tab === "upscale" && (
              <>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium">Scale</p>
                  <Segmented className="w-full" size="sm" value={factor} onChange={setFactor} options={[{ value: "2", label: "2×" }, { value: "4", label: "4×" }]} />
                </div>
                {source && (
                  <p className="text-xs text-muted">
                    Output: {source.width * Number(factor)}×{source.height * Number(factor)} (max 8192px). High-quality Lanczos resampling with light sharpening.
                  </p>
                )}
              </>
            )}
            {tab === "ai" && (
              <p className="text-xs text-muted">
                4× AI upscaling by Stability AI adds plausible fine detail. Inputs above 1 megapixel are first reduced to the provider&apos;s limit. Review results — AI may alter tiny details.
                {!me?.capabilities.aiUpscale && <span className="mt-2 block font-medium text-warning">Not connected on this server (requires STABILITY_API_KEY).</span>}
              </p>
            )}
            <Button variant="accent" size="lg" icon={<Sparkles className="size-4" />} loading={busy} disabled={!source || (tab === "ai" && !me?.capabilities.aiUpscale)} onClick={go}>
              {tab === "enhance" ? "Enhance photo" : "Upscale image"} <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">{cost} cr</span>
            </Button>
          </Card>
        </div>
        <div className="min-w-0">
          {generation && <div className="mb-4"><GenerationStatus generation={generation} /></div>}
          {resultId ? (
            <ResultView source={source} resultId={resultId} />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-3xl border border-dashed border-line-strong text-sm text-muted">Your result will appear here with a before/after comparison.</div>
          )}
        </div>
      </div>
    </ToolFrame>
  );
}
