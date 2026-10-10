"use client";

import { Boxes, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { GenerationStatus } from "@/components/app/ai-status";
import { ImageChooser } from "@/components/app/image-chooser";
import { ResultView, ToolFrame } from "@/components/app/tool-frame";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Card, Segmented } from "@/components/ui/misc";
import { assetUrl, type AssetDto } from "@/lib/client/api";
import { useRunner } from "@/lib/client/hooks";
import { STUDIO_STYLES, type AspectId } from "@/lib/studio-styles";

export default function BundleTool() {
  const [items, setItems] = useState<AssetDto[]>([]);
  const [open, setOpen] = useState(false);
  const [styleId, setStyleId] = useState("studio-white");
  const [aspect, setAspect] = useState<AspectId>("1:1");
  const [resultId, setResultId] = useState<string | null>(null);
  const { run, generation, busy } = useRunner((g) => {
    if (g.status === "succeeded") setResultId(((g.result as { assetIds?: string[] })?.assetIds ?? [])[0] ?? null);
  });
  return (
    <ToolFrame title="Bundle image creator" description="Combine 2–5 products into one cohesive bundle, kit or gift-set image with shared lighting and shadows." plan="pro">
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="grid gap-4 p-4">
          <div>
            <p className="mb-2 text-sm font-semibold">Products (hero first)</p>
            <div className="grid grid-cols-3 gap-2">
              {items.map((a, i) => (
                <div key={a.id} className="bg-checker relative aspect-square overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(a.id, 240)} alt="" className="size-full object-contain p-1" />
                  {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-ink px-1 text-[9px] font-semibold text-white">HERO</span>}
                  <button onClick={() => setItems(items.filter((x) => x.id !== a.id))} className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5" aria-label="Remove"><X className="size-3" /></button>
                </div>
              ))}
              {items.length < 5 && (
                <button onClick={() => setOpen(true)} className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong text-xs text-muted hover:border-iris-300">
                  <Plus className="mb-1 size-5" /> Add
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">Uses background-removed cut-outs from your products.</p>
          </div>
          <Field label="Studio style">
            <Select value={styleId} onChange={(e) => setStyleId(e.target.value)}>
              {STUDIO_STYLES.filter((s) => s.kind === "procedural" && s.id !== "transparent").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Format">
            <Segmented className="w-full" size="sm" value={aspect} onChange={setAspect} options={[{ value: "1:1", label: "1:1" }, { value: "4:5", label: "4:5" }, { value: "16:9", label: "16:9" }, { value: "3:2", label: "3:2" }]} />
          </Field>
          <Button variant="accent" size="lg" icon={<Sparkles className="size-4" />} loading={busy} disabled={items.length < 2} onClick={() => { setResultId(null); run("bundle", items[0].projectId, { cutoutAssetIds: items.map((i) => i.id), styleId, aspect }); }}>
            Create bundle <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">2 cr</span>
          </Button>
        </Card>
        <div className="min-w-0">
          {generation && <div className="mb-4"><GenerationStatus generation={generation} /></div>}
          {resultId ? <ResultView source={null} resultId={resultId} /> : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-3xl border border-dashed border-line-strong text-sm text-muted">
              <Boxes className="mb-2 size-6 text-faint" /> Add at least two products.
            </div>
          )}
        </div>
      </div>
      <ImageChooser open={open} onOpenChange={setOpen} kinds="cutout,angle" multiple max={5 - items.length} title="Choose products" onPick={(a) => setItems([...items, ...a.filter((x) => !items.some((i) => i.id === x.id))].slice(0, 5))} />
    </ToolFrame>
  );
}
