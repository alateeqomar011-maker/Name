"use client";

import { AlertTriangle, Rotate3d, Sparkles } from "lucide-react";
import { useState } from "react";
import { GenerationStatus } from "@/components/app/ai-status";
import { AssetTile } from "@/components/app/asset-tile";
import { ProjectPicker } from "@/components/app/project-picker";
import { ToolFrame } from "@/components/app/tool-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { assetUrl, useApi, type AssetDto, type ProjectDto } from "@/lib/client/api";
import { useRunner } from "@/lib/client/hooks";
import { cn } from "@/lib/utils";

const ANGLES = ["three-quarter left view", "three-quarter right view", "side profile view", "back view", "top-down view", "low hero angle"];

export default function AnglesTool() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const { data, mutate } = useApi<{ project: ProjectDto; assets: AssetDto[] }>(projectId ? `/api/projects/${projectId}` : null);
  const [angles, setAngles] = useState<string[]>(["three-quarter left view"]);
  const { run, generation, busy } = useRunner((g) => g.status === "succeeded" && mutate());
  const cutoutId = data?.project.cutoutAssetId;
  const results = (data?.assets ?? []).filter((a) => a.kind === "angle");
  return (
    <ToolFrame
      title="Angle generator"
      description="Generate additional viewpoints of your product from a single photo using an image-editing model."
      plan="pro"
      requires="angles"
      requiresLabel="The angle generator needs an image-editing model (OPENAI_API_KEY)."
    >
      <div className="mb-6 flex gap-3 rounded-2xl border border-gold-400/40 bg-[#fdf8ee] p-4 text-sm text-[#7a4f0f]">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <p>
          New angles are <strong>AI-reimagined</strong>: the model has never seen the hidden sides of your product, so labels, textures or details may differ. Always compare with the real product before publishing. Studio renders, by contrast, keep your original pixels.
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="grid gap-4 p-4">
          <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />
          {cutoutId && (
            <div className="bg-checker flex aspect-square items-center justify-center rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(cutoutId, 600)} alt="" className="max-h-full max-w-full object-contain p-4" />
            </div>
          )}
          {projectId && data && !cutoutId && <p className="text-sm text-muted">Remove this product&apos;s background in the Photo Studio first.</p>}
          <div>
            <p className="mb-2 text-sm font-semibold">Angles (up to 4)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ANGLES.map((a) => {
                const on = angles.includes(a);
                return (
                  <button key={a} onClick={() => setAngles(on ? angles.filter((x) => x !== a) : angles.length < 4 ? [...angles, a] : angles)} className={cn("rounded-xl border px-2.5 py-2 text-left text-xs capitalize", on ? "border-iris-300 bg-iris-50/60 font-semibold" : "border-line")}>
                    {a}
                  </button>
                );
              })}
            </div>
          </div>
          <Button variant="accent" size="lg" icon={<Sparkles className="size-4" />} loading={busy} disabled={!cutoutId || !angles.length} onClick={() => run("angles", projectId, { cutoutAssetId: cutoutId, angles })}>
            Generate {angles.length} {angles.length === 1 ? "angle" : "angles"} <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">{angles.length * 5} cr</span>
          </Button>
        </Card>
        <div className="min-w-0">
          {generation && <div className="mb-4"><GenerationStatus generation={generation} /></div>}
          {results.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {results.map((a) => <AssetTile key={a.id} asset={a} onChange={() => mutate()} />)}
            </div>
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-3xl border border-dashed border-line-strong text-sm text-muted">
              <Rotate3d className="mb-2 size-6 text-faint" /> Generated angles appear here as cut-outs you can stage in the studio.
            </div>
          )}
        </div>
      </div>
    </ToolFrame>
  );
}
