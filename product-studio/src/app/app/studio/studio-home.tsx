"use client";

import { Camera, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { ProjectCard } from "@/components/app/project-card";
import { PageHeader } from "@/components/app/shell";
import { Dropzone, uploadWithProgress, validateFile } from "@/components/app/upload-dropzone";
import { EmptyState, Progress, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useApi, type ProjectDto } from "@/lib/client/api";

const TIPS = [
  "Shoot in soft daylight near a window — avoid harsh flash.",
  "Fill most of the frame with the product and keep it in focus.",
  "A plain, contrasting background gives the cleanest cut-out.",
  "Upload the highest resolution you have — it sharpens 4K exports.",
];

export function StudioHome() {
  const router = useRouter();
  const toast = useToast();
  const { refreshMe } = useApp();
  const { data, mutate, isLoading } = useApi<{ items: ProjectDto[] }>("/api/projects?limit=24");
  const [uploads, setUploads] = useState<{ name: string; pct: number }[]>([]);

  const onFiles = async (files: File[]) => {
    const valid = files.slice(0, 10).filter((f) => {
      const problem = validateFile(f);
      if (problem) toast.error("Can't upload", problem);
      return !problem;
    });
    if (!valid.length) return;
    setUploads(valid.map((f) => ({ name: f.name, pct: 0 })));
    const created: string[] = [];
    for (let i = 0; i < valid.length; i++) {
      const form = new FormData();
      form.append("file", valid[i]);
      try {
        const res = await uploadWithProgress<{ project: ProjectDto; problems: { message: string; code?: string }[] }>(
          "/api/projects",
          form,
          (pct) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, pct } : x))),
        );
        created.push(res.project.id);
        for (const p of res.problems) toast.info("Uploaded, but not processed yet", p.message);
      } catch (err) {
        toast.error(`Couldn't upload ${valid[i].name}`, (err as Error).message);
      }
    }
    setUploads([]);
    refreshMe();
    if (created.length === 1) router.push(`/app/studio/${created[0]}`);
    else if (created.length > 1) {
      toast.success(`${created.length} products uploaded`, "Backgrounds are being removed now.");
      mutate();
    }
  };

  return (
    <div>
      <PageHeader
        title="Photo Studio"
        description="Upload a product photo. Vitrine removes the background, identifies the product and stages it in professional scenes — your product's pixels stay exactly as photographed."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Dropzone onFiles={onFiles} multiple disabled={uploads.length > 0}>
          {uploads.length > 0 ? (
            <div className="w-full max-w-sm">
              <Loader2 className="mx-auto size-8 animate-spin text-iris-500" />
              <p className="mt-4 font-semibold">Uploading {uploads.length > 1 ? `${uploads.length} photos` : "your photo"}…</p>
              <div className="mt-4 grid gap-3">
                {uploads.map((u) => (
                  <div key={u.name} className="text-left">
                    <p className="mb-1 truncate text-xs text-muted">{u.name}</p>
                    <Progress value={u.pct} />
                  </div>
                ))}
              </div>
            </div>
          ) : undefined}
        </Dropzone>
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-gold-400" /> Tips for best results
          </div>
          <ul className="mt-3 space-y-3 text-[13px] text-ink-2">
            {TIPS.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-iris-400" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-2xl bg-iris-50 p-3.5 text-[13px] text-iris-700">
            <p className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="size-3.5" /> 1 credit per photo
            </p>
            <p className="mt-1 text-iris-700/80">Includes AI background removal and product detection.</p>
          </div>
        </div>
      </div>

      <h2 className="mt-12 mb-4 text-lg font-semibold">Recent products</h2>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5]" />
          ))}
        </div>
      ) : data?.items.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {data.items.map((p) => (
            <ProjectCard key={p.id} project={p} onChange={() => mutate()} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Camera className="size-6" />} title="No products yet" description="Your uploaded products and their generated images will appear here." />
      )}
    </div>
  );
}
