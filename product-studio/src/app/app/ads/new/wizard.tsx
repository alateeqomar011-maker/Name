"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { ProjectPicker } from "@/components/app/project-picker";
import { PageHeader } from "@/components/app/shell";
import { ContentForm } from "@/components/design/content-form";
import { DesignCanvas } from "@/components/design/design-canvas";
import { BrandKitSelect, FormatPicker, ProjectImagePicker } from "@/components/design/pickers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { useApi, type AssetDto, type ProjectDto } from "@/lib/client/api";
import { brandStyleFromKit, type BrandKitRow } from "@/lib/design/brand";
import { defaultContent } from "@/lib/design/content";
import { createDesign } from "@/lib/design/export";
import { TEMPLATES, buildFromTemplate } from "@/lib/design/templates";
import type { AdContent } from "@/lib/design/types";
import { getFormat } from "@/lib/formats";
import { cn } from "@/lib/utils";

export function NewAdWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { me, handleError } = useApp();
  const [projectId, setProjectId] = useState<string | null>(params.get("project"));
  const [assetId, setAssetId] = useState<string | null>(params.get("asset"));
  const [assetKind, setAssetKind] = useState<string | null>(null);
  const [formatId, setFormatId] = useState("ig-portrait");
  const [templateId, setTemplateId] = useState(params.get("template") ?? "spotlight");
  const [kit, setKit] = useState<BrandKitRow | null>(null);
  const { data: project } = useApi<{ project: ProjectDto; assets: AssetDto[] }>(projectId ? `/api/projects/${projectId}` : null);
  const [content, setContent] = useState<AdContent>(defaultContent(null, me?.user.preferences.defaultLanguage === "ar"));
  const [touched, setTouched] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!project) return;
    if (!touched) setContent(defaultContent(project.project, me?.user.preferences.defaultLanguage === "ar"));
    if (!assetId || !project.assets.some((a) => a.id === assetId)) {
      const pick = project.assets.find((a) => a.id === project.project.cutoutAssetId) ?? project.assets.find((a) => a.kind === "render");
      if (pick) {
        setAssetId(pick.id);
        setAssetKind(pick.kind);
      }
    } else {
      setAssetKind(project.assets.find((a) => a.id === assetId)?.kind ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const format = getFormat(formatId);
  const brand = useMemo(() => brandStyleFromKit(kit), [kit]);
  const isCutout = assetKind === "cutout" || assetKind === "angle";
  const rtl = /[؀-ۿ]/.test(content.headline);
  const docFor = (tid: string, w: number, h: number) =>
    buildFromTemplate(tid, {
      W: w,
      H: h,
      content,
      brand,
      productAssetId: isCutout ? assetId : tid === "photo" ? null : assetId,
      photoAssetId: !isCutout ? assetId : null,
      rtl,
    });

  const create = async () => {
    setCreating(true);
    try {
      const d = await createDesign({
        name: content.headline.slice(0, 60) || "Untitled ad",
        formatId: format.id,
        width: format.width,
        height: format.height,
        projectId,
        doc: { ...docFor(templateId, format.width, format.height), templateId },
      });
      router.push(`/app/ads/${d.id}`);
    } catch (err) {
      handleError(err, "Couldn't create the design");
      setCreating(false);
    }
  };

  const previewW = format.width >= format.height ? 128 : Math.round((128 * format.width) / format.height);

  return (
    <div>
      <PageHeader title="New ad" description="Choose a product, a format and a layout. Everything stays editable in the designer." />
      <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Card className="grid gap-4 p-4">
            <p className="text-sm font-semibold">1 · Product</p>
            <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />
            <ProjectImagePicker
              projectId={projectId}
              value={assetId}
              onChange={(a) => {
                setAssetId(a.id);
                setAssetKind(a.kind);
              }}
            />
            <p className="text-xs text-muted">Tip: cut-outs blend with any layout; studio renders work great in the Photo overlay layout.</p>
          </Card>
          <Card className="grid gap-4 p-4">
            <p className="text-sm font-semibold">2 · Text</p>
            <ContentForm
              value={content}
              onChange={(c) => {
                setTouched(true);
                setContent(c);
              }}
              projectId={projectId}
            />
          </Card>
          <Card className="grid gap-3 p-4">
            <p className="text-sm font-semibold">3 · Format</p>
            <FormatPicker value={[formatId]} onChange={(ids) => setFormatId(ids[0])} />
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold">4 · Layout</p>
              <div className="w-60">
                <BrandKitSelect value={kit?.id ?? null} onChange={setKit} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => setTemplateId(t.id)} className="group text-left">
                  <div
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-2xl border bg-subtle p-3 transition",
                      templateId === t.id ? "border-transparent ring-2 ring-iris-500 ring-offset-2" : "border-line group-hover:border-line-strong",
                    )}
                  >
                    <DesignCanvas doc={docFor(t.id, format.width, format.height)} width={format.width} height={format.height} displayWidth={previewW} className="rounded-md shadow-soft" />
                  </div>
                  <p className={cn("mt-2 text-sm", templateId === t.id ? "font-semibold" : "text-ink-2")}>{t.name}</p>
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
              <p className="text-sm text-muted">
                {format.name} · {format.width}×{format.height}
              </p>
              <Button variant="accent" size="lg" loading={creating} disabled={!assetId} onClick={create} icon={<ArrowRight className="size-4" />}>
                Open in designer
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
