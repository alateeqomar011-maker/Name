"use client";

import {
  AlertCircle,
  ArrowLeft,
  Columns2,
  FileText,
  ImageIcon,
  Layers,
  Megaphone,
  RefreshCw,
  Scissors,
  Share2,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { AssetTile } from "@/components/app/asset-tile";
import { BeforeAfter } from "@/components/app/before-after";
import { DownloadMenu } from "@/components/app/download-menu";
import { Button, IconButton, LinkButton } from "@/components/ui/button";
import { Badge, Card, EmptyState, Progress, Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, assetUrl, startGeneration, useApi, type AssetDto, type GenerationDto, type ProjectDto } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { DetailsPanel } from "./details-panel";
import { StylePanel, type StudioRequest } from "./style-panel";

interface ProjectDetail {
  project: ProjectDto;
  assets: AssetDto[];
  generations: GenerationDto[];
  copies: { id: string; kind: string; title: string; createdAt: string }[];
}

const OUTPUT_KINDS = new Set(["render", "bundle", "enhanced", "upscaled", "angle", "mockup", "ad", "social"]);
const ACTIVE = new Set(["queued", "running"]);

export function ProjectWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { handleError, refreshMe } = useApp();
  const [polling, setPolling] = useState(true);
  const { data, mutate, error } = useApi<ProjectDetail>(`/api/projects/${id}`, {
    refreshInterval: polling ? 1200 : 0,
    onSuccess: (d: ProjectDetail) => {
      const active = d.generations.some((g: GenerationDto) => ACTIVE.has(g.status));
      if (!active && polling) {
        setPolling(false);
        refreshMe();
      }
      if (active && !polling) setPolling(true);
    },
  });
  const [panel, setPanel] = useState<"style" | "details">("style");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"result" | "compare">("result");
  const [submitting, setSubmitting] = useState(false);
  const [pickedStyle, setPickedStyle] = useState<string | undefined>();
  const [editingName, setEditingName] = useState(false);

  const assets = useMemo(() => data?.assets ?? [], [data]);
  const outputs = useMemo(() => assets.filter((a) => OUTPUT_KINDS.has(a.kind)), [assets]);
  const original = assets.find((a) => a.id === data?.project.originalAssetId);
  const cutout = assets.find((a) => a.id === data?.project.cutoutAssetId);
  const gens = data?.generations ?? [];
  const cutoutGen = gens.find((g) => g.type === "cutout");
  const analyzeGen = gens.find((g) => g.type === "analyze");
  const activeRenders = gens.filter((g) => ["studio", "scene", "enhance", "upscale", "ai_upscale", "angles", "mockup"].includes(g.type) && ACTIVE.has(g.status));
  const current = selected === "__none" ? undefined : (outputs.find((a) => a.id === selected) ?? outputs[0]);

  const run = async (type: string, params: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await startGeneration(type, id, params);
      setPolling(true);
      await mutate();
      refreshMe();
    } catch (err) {
      handleError(err, "Couldn't start");
    } finally {
      setSubmitting(false);
    }
  };

  const onGenerate = async (req: StudioRequest) => {
    await run(req.type, req.params);
    setSelected(null);
    setView("result");
  };

  if (error) {
    return <EmptyState icon={<AlertCircle className="size-6" />} title="Project not found" description="It may have been deleted." action={<LinkButton href="/app/studio">Back to studio</LinkButton>} />;
  }
  if (!data) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Skeleton className="aspect-square" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  const { project } = data;
  const cutoutRunning = cutoutGen && ACTIVE.has(cutoutGen.status);
  const cutoutFailed = !cutout && cutoutGen?.status === "failed";
  const previewAspect = current ? current.width / current.height : original ? original.width / original.height : 1;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton label="Back to studio" onClick={() => router.push("/app/studio")}>
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0">
            {editingName ? (
              <input
                autoFocus
                defaultValue={project.name}
                maxLength={120}
                className="w-full rounded-lg border border-iris-300 bg-surface px-2 py-1 text-xl font-semibold outline-none"
                onBlur={async (e) => {
                  setEditingName(false);
                  if (e.target.value.trim() && e.target.value !== project.name) {
                    await api(`/api/projects/${id}`, { method: "PATCH", json: { name: e.target.value.trim() } });
                    mutate();
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="max-w-full truncate text-left text-xl font-semibold tracking-tight hover:text-iris-700 sm:text-2xl" title="Rename">
                {project.name}
              </button>
            )}
            <p className="text-xs text-muted">
              {outputs.length} images · {data.copies.length} texts
            </p>
          </div>
          <IconButton
            label={project.favorite ? "Unfavorite" : "Favorite"}
            onClick={async () => {
              await api(`/api/projects/${id}`, { method: "PATCH", json: { favorite: !project.favorite } });
              mutate();
            }}
          >
            <Star className={cn("size-5", project.favorite && "fill-gold-400 text-gold-400")} />
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/app/descriptions?project=${id}`} variant="secondary" size="sm" icon={<FileText className="size-4" />}>
            Description
          </LinkButton>
          <LinkButton href={`/app/ads/new?project=${id}${current ? `&asset=${current.id}` : ""}`} variant="secondary" size="sm" icon={<Megaphone className="size-4" />}>
            Create ad
          </LinkButton>
          <LinkButton href={`/app/social?project=${id}`} variant="secondary" size="sm" icon={<Share2 className="size-4" />}>
            Social posts
          </LinkButton>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Card className="overflow-hidden p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              {current ? (
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "result", label: <span className="flex items-center gap-1.5"><ImageIcon className="size-3.5" /> Result</span> },
                    { value: "compare", label: <span className="flex items-center gap-1.5"><Columns2 className="size-3.5" /> Before / after</span> },
                  ]}
                />
              ) : (
                <span className="text-sm font-medium text-muted">{cutout ? "Background removed" : "Original photo"}</span>
              )}
              <div className="flex items-center gap-1.5">
                {current && (
                  <>
                    {(current.meta as { styleName?: string }).styleName && <Badge tone="neutral">{(current.meta as { styleName?: string }).styleName}</Badge>}
                    <span className="hidden text-xs text-faint sm:inline">
                      {current.width}×{current.height}
                    </span>
                    <IconButton
                      label="Use as project cover"
                      onClick={async () => {
                        await api(`/api/projects/${id}`, { method: "PATCH", json: { coverAssetId: current.id } });
                        toast.success("Cover updated");
                        mutate();
                      }}
                    >
                      <Layers className="size-4" />
                    </IconButton>
                    <DownloadMenu asset={current} />
                  </>
                )}
                {!current && cutout && <DownloadMenu asset={cutout} />}
              </div>
            </div>

            <div className="relative">
              {current && view === "compare" && original ? (
                <BeforeAfter before={assetUrl(original.id, 1600)} after={assetUrl(current.id, 1600)} aspect={previewAspect} className="mx-auto max-h-[72vh]" style={{ maxWidth: `calc(72vh * ${previewAspect})` }} />
              ) : current ? (
                <div className="mx-auto flex w-full justify-center overflow-hidden rounded-2xl bg-subtle" style={{ aspectRatio: previewAspect, maxHeight: "72vh", maxWidth: `calc(72vh * ${previewAspect})` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img key={current.id} src={assetUrl(current.id, 1600)} alt={current.label ?? "Result"} className="size-full animate-fade-in object-contain" />
                </div>
              ) : cutout ? (
                <div className="bg-checker mx-auto flex w-full items-center justify-center overflow-hidden rounded-2xl" style={{ aspectRatio: original ? original.width / original.height : 1, maxHeight: "72vh", maxWidth: `calc(72vh * ${original ? original.width / original.height : 1})` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(cutout.id, 1600)} alt="Cut-out" className="max-h-full max-w-full animate-fade-in object-contain p-6" />
                </div>
              ) : original ? (
                <div className="relative mx-auto w-full overflow-hidden rounded-2xl bg-subtle" style={{ aspectRatio: original.width / original.height, maxHeight: "72vh", maxWidth: `calc(72vh * ${original.width / original.height})` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(original.id, 1600)} alt="Original" className={cn("size-full object-contain", cutoutRunning && "opacity-70")} />
                  {cutoutRunning && <ScanOverlay progress={cutoutGen!.progress} stage={cutoutGen!.stage} />}
                </div>
              ) : null}

              {activeRenders.length > 0 && (
                <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/90 p-3 shadow-lift backdrop-blur">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-medium">
                      <RefreshCw className="size-3.5 animate-spin text-iris-500" />
                      {activeRenders[0].stage ?? "Working"}
                    </span>
                    <span className="tabular-nums text-muted">{activeRenders[0].progress}%</span>
                  </div>
                  <Progress value={activeRenders[0].progress} />
                </div>
              )}
            </div>

            {cutoutFailed && (
              <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger sm:flex-row sm:items-center sm:justify-between">
                <span className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" /> {cutoutGen?.error}
                </span>
                <Button size="sm" variant="secondary" onClick={() => run("cutout", { originalAssetId: original?.id })} loading={submitting}>
                  Try again
                </Button>
              </div>
            )}
            {!cutout && !cutoutGen && original && (
              <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-iris-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-iris-700">Remove the background to start staging this product.</span>
                <Button size="sm" icon={<Scissors className="size-4" />} onClick={() => run("cutout", { originalAssetId: original.id })} loading={submitting}>
                  Remove background · 1 credit
                </Button>
              </div>
            )}
          </Card>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Your images</h2>
              {cutout && (
                <button className={cn("text-xs font-medium", !current ? "text-iris-600" : "text-muted hover:text-ink")} onClick={() => setSelected("__none")}>
                  View cut-out
                </button>
              )}
            </div>
            {outputs.length === 0 && activeRenders.length === 0 ? (
              <EmptyState
                className="py-10"
                icon={<Wand2 className="size-6" />}
                title={cutout ? "Pick a style and generate" : "Preparing your product"}
                description={cutout ? "Studio styles render in seconds. Every variation is saved here." : "Background removal usually takes a few seconds."}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {activeRenders.flatMap((g) =>
                  Array.from({ length: Number((g.params as { variations?: number }).variations ?? 1) }).map((_, i) => (
                    <div key={`${g.id}-${i}`} className="overflow-hidden rounded-2xl border border-line bg-surface">
                      <div className="skeleton flex aspect-square items-end p-3">
                        <Progress value={g.progress} />
                      </div>
                      <p className="px-2.5 py-2 text-xs text-muted">Rendering…</p>
                    </div>
                  )),
                )}
                {outputs.map((a) => (
                  <AssetTile
                    key={a.id}
                    asset={a}
                    selected={current?.id === a.id}
                    onSelect={() => {
                      setSelected(a.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    onChange={() => mutate()}
                  />
                ))}
              </div>
            )}
            {gens.some((g) => g.status === "failed" && g.type !== "cutout" && g.type !== "analyze") && (
              <FailedList gens={gens.filter((g) => g.status === "failed" && !["cutout", "analyze"].includes(g.type)).slice(0, 3)} />
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24">
          <Card className="p-4 sm:p-5">
            <Segmented
              value={panel}
              onChange={setPanel}
              className="mb-5 w-full"
              options={[
                { value: "style", label: "Create" },
                { value: "details", label: "Product details" },
              ]}
            />
            {panel === "style" ? (
              <StylePanel
                key={pickedStyle}
                cutoutId={cutout?.id ?? null}
                defaultLayout={project.analysis?.suggestedLayout ?? "standing"}
                suggested={project.analysis?.suggestedStyles ?? []}
                busy={submitting}
                onGenerate={onGenerate}
                initialStyle={pickedStyle}
              />
            ) : (
              <DetailsPanel
                project={project}
                analyzeGen={analyzeGen}
                onSaved={() => mutate()}
                onRetryAnalysis={() => run("analyze", {})}
                onPickStyle={(s) => {
                  setPickedStyle(s);
                  setPanel("style");
                }}
              />
            )}
          </Card>
          <div className="mt-4 flex justify-end">
            <button
              className="flex items-center gap-1.5 text-xs text-faint hover:text-danger"
              onClick={async () => {
                if (!confirm("Delete this project and all of its images and texts?")) return;
                await api(`/api/projects/${id}`, { method: "DELETE" });
                router.push("/app/studio");
              }}
            >
              <Trash2 className="size-3.5" /> Delete project
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScanOverlay({ progress, stage }: { progress: number; stage: string | null }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div className="absolute inset-x-0 h-24 animate-[scan_2.2s_ease-in-out_infinite] bg-[linear-gradient(180deg,transparent,rgba(109,91,255,0.28),transparent)]" />
      <div className="relative rounded-2xl bg-white/90 px-5 py-4 text-center shadow-lift backdrop-blur">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Scissors className="size-4 text-iris-600" /> {stage ?? "Removing background"}
        </p>
        <Progress value={progress} className="mt-3 w-48" />
      </div>
      <style>{`@keyframes scan { 0% { top: -10% } 50% { top: 85% } 100% { top: -10% } }`}</style>
    </div>
  );
}

function FailedList({ gens }: { gens: GenerationDto[] }) {
  return (
    <div className="mt-4 grid gap-2">
      {gens.map((g) => (
        <div key={g.id} className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            {g.error}
            {g.refunded && <span className="ml-1 text-danger/70">({g.creditsCharged} credits refunded)</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
