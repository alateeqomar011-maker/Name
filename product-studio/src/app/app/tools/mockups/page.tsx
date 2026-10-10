"use client";

import { LayoutGrid, Smartphone, Sparkles, Store, Frame, Clapperboard } from "lucide-react";
import { useState } from "react";
import { GenerationStatus } from "@/components/app/ai-status";
import { AssetTile } from "@/components/app/asset-tile";
import { InputImage, ResultView, ToolFrame } from "@/components/app/tool-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { useApi, type AssetDto } from "@/lib/client/api";
import { useRunner } from "@/lib/client/hooks";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  { id: "phone-post", name: "Phone · feed post", icon: Smartphone, text: "Your image as a social feed post on a phone." },
  { id: "phone-story", name: "Phone · story", icon: Clapperboard, text: "Full-screen story preview on a phone." },
  { id: "browser-pdp", name: "Online store page", icon: Store, text: "A clean product page layout in a browser window." },
  { id: "poster-frame", name: "Framed print", icon: Frame, text: "Your image as a framed print on a wall." },
];

export default function MockupsTool() {
  const [source, setSource] = useState<AssetDto | null>(null);
  const [template, setTemplate] = useState("phone-post");
  const [resultId, setResultId] = useState<string | null>(null);
  const { data: history, mutate } = useApi<{ items: AssetDto[] }>("/api/assets?kind=mockup&limit=12");
  const { run, generation, busy } = useRunner((g) => {
    if (g.status === "succeeded") {
      setResultId(((g.result as { assetIds?: string[] })?.assetIds ?? [])[0] ?? null);
      mutate();
    }
  });
  return (
    <ToolFrame title="Mockup creator" description="Present your product images and ads in realistic contexts for clients, store listings and pitch decks." plan="pro">
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <InputImage asset={source} onPick={setSource} kinds="render,ad,social,bundle,enhanced,upscaled,original" />
          <Card className="grid gap-2 p-4">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => setTemplate(t.id)} className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", template === t.id ? "border-iris-300 bg-iris-50/60" : "border-line hover:border-line-strong")}>
                <t.icon className="mt-0.5 size-5 text-iris-600" />
                <span>
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted">{t.text}</span>
                </span>
              </button>
            ))}
            <Button className="mt-2" variant="accent" size="lg" icon={<Sparkles className="size-4" />} loading={busy} disabled={!source} onClick={() => { setResultId(null); run("mockup", source?.projectId ?? null, { assetId: source!.id, template }); }}>
              Create mockup <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">1 cr</span>
            </Button>
          </Card>
        </div>
        <div className="min-w-0">
          {generation && <div className="mb-4"><GenerationStatus generation={generation} /></div>}
          {resultId ? <ResultView source={null} resultId={resultId} /> : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-3xl border border-dashed border-line-strong text-sm text-muted">
              <LayoutGrid className="mb-2 size-6 text-faint" /> Choose an image and a mockup.
            </div>
          )}
          {history?.items.length ? (
            <div className="mt-8">
              <p className="mb-3 text-sm font-semibold">Recent mockups</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {history.items.map((a) => <AssetTile key={a.id} asset={a} onSelect={() => setResultId(a.id)} onChange={() => mutate()} />)}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ToolFrame>
  );
}
