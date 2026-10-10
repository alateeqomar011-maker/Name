"use client";

import { CheckCircle2, Download, Layers3, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { GenerationStatus } from "@/components/app/ai-status";
import { useApp } from "@/components/app/app-provider";
import { ToolFrame } from "@/components/app/tool-frame";
import { Dropzone, uploadWithProgress, validateFile } from "@/components/app/upload-dropzone";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Card, Progress, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, assetUrl, downloadZip, useGeneration, type GenerationDto, type ProjectDto } from "@/lib/client/api";
import { PLANS } from "@/lib/plans";
import { STUDIO_STYLES, type AspectId, type Layout } from "@/lib/studio-styles";

interface Item { projectId: string; status: "succeeded" | "failed"; renderAssetId?: string; cutoutAssetId?: string; error?: string }

export default function BatchTool() {
  const { me, handleError, refreshMe } = useApp();
  const toast = useToast();
  const max = me ? PLANS[me.workspace.plan].limits.batchMaxItems : 0;
  const [files, setFiles] = useState<File[]>([]);
  const [styleId, setStyleId] = useState("marketplace-white");
  const [aspect, setAspect] = useState<AspectId>("1:1");
  const [layout, setLayout] = useState<Layout>("standing");
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [genId, setGenId] = useState<string | null>(null);
  const { data } = useGeneration(genId, () => refreshMe());
  const gen: GenerationDto | undefined = data?.generation;
  const items = ((gen?.result as { items?: Item[] } | null)?.items ?? []) as Item[];

  const start = async () => {
    const ids: string[] = [];
    setUploading({ done: 0, total: files.length });
    for (const f of files) {
      const form = new FormData();
      form.append("file", f);
      form.append("autoProcess", "0");
      try {
        const res = await uploadWithProgress<{ project: ProjectDto }>("/api/projects", form, () => {});
        ids.push(res.project.id);
      } catch (err) {
        toast.error(`Skipped ${f.name}`, (err as Error).message);
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    if (!ids.length) return;
    try {
      const res = await api<{ generation: GenerationDto }>("/api/batch", { method: "POST", json: { projectIds: ids, styleId, aspect, layout } });
      setGenId(res.generation.id);
      setFiles([]);
      refreshMe();
    } catch (err) {
      handleError(err, "Couldn't start the batch");
    }
  };

  return (
    <ToolFrame title="Batch processing" description="Drop a whole catalog: each photo gets AI background removal and the same studio style, ready for your store." plan="business">
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="grid gap-4 p-4">
          <Field label="Studio style">
            <Select value={styleId} onChange={(e) => setStyleId(e.target.value)}>
              {STUDIO_STYLES.filter((s) => s.kind === "procedural").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Format">
            <Segmented className="w-full" size="sm" value={aspect} onChange={setAspect} options={[{ value: "1:1", label: "1:1" }, { value: "4:5", label: "4:5" }, { value: "3:4", label: "3:4" }, { value: "16:9", label: "16:9" }]} />
          </Field>
          <Field label="Placement">
            <Segmented className="w-full" size="sm" value={layout} onChange={setLayout} options={[{ value: "standing", label: "Standing" }, { value: "floating", label: "Floating" }, { value: "flatlay", label: "Flat lay" }]} />
          </Field>
          <p className="text-xs text-muted">2 credits per photo (background removal + render). Failed photos are refunded automatically.</p>
          <Button variant="accent" size="lg" icon={<Sparkles className="size-4" />} disabled={!files.length || Boolean(uploading) || !max} loading={Boolean(uploading)} onClick={start}>
            Process {files.length || ""} photos <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">{files.length * 2} cr</span>
          </Button>
        </Card>
        <div className="min-w-0 grid gap-4">
          {!genId && (
            <Dropzone
              multiple
              disabled={!max || Boolean(uploading)}
              onFiles={(list) => {
                const ok = list.filter((f) => !validateFile(f));
                setFiles((prev) => [...prev, ...ok].slice(0, Math.max(1, max)));
              }}
            >
              {files.length ? (
                <div className="w-full">
                  <p className="font-semibold">{files.length} photos ready{max ? ` (max ${max})` : ""}</p>
                  <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-8">
                    {files.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={URL.createObjectURL(f)} alt="" className="aspect-square w-full rounded-lg object-cover" />
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">Click or drop to add more</p>
                </div>
              ) : undefined}
            </Dropzone>
          )}
          {uploading && (
            <Card className="p-4">
              <p className="text-sm font-semibold">Uploading {uploading.done}/{uploading.total}</p>
              <Progress value={(uploading.done / uploading.total) * 100} className="mt-2" />
            </Card>
          )}
          {gen && <GenerationStatus generation={gen} />}
          {gen?.status === "failed" && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{gen.error}</p>}
          {items.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {items.filter((i) => i.status === "succeeded").length} of {items.length} done
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setGenId(null); }}>New batch</Button>
                  <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadZip(items.filter((i) => i.renderAssetId).map((i) => i.renderAssetId!)).catch((e) => handleError(e, "Download failed"))}>
                    Download all
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {items.map((it) => (
                  <a key={it.projectId} href={`/app/studio/${it.projectId}`} className="group relative block overflow-hidden rounded-xl border border-line bg-subtle">
                    {it.renderAssetId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={assetUrl(it.renderAssetId, 320)} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="flex aspect-square items-center justify-center p-2 text-center text-[11px] text-danger">{it.error}</div>
                    )}
                    <span className="absolute top-1.5 right-1.5">{it.status === "succeeded" ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-danger" />}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}
          {!genId && !files.length && (
            <p className="flex items-center gap-2 text-sm text-muted"><Layers3 className="size-4" /> Each photo becomes its own product, so you can refine any of them later in the studio.</p>
          )}
        </div>
      </div>
    </ToolFrame>
  );
}
