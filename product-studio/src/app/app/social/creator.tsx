"use client";

import { Download, Hash, Info, Lightbulb, Loader2, PenLine, Share2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AiUnavailableBanner, GenerationStatus } from "@/components/app/ai-status";
import { useApp } from "@/components/app/app-provider";
import { CopyButton } from "@/components/app/copy-button";
import { ProjectPicker } from "@/components/app/project-picker";
import { PageHeader } from "@/components/app/shell";
import { ContentForm } from "@/components/design/content-form";
import { DesignCanvas } from "@/components/design/design-canvas";
import { BrandKitSelect, FormatPicker, ProjectImagePicker } from "@/components/design/pickers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, EmptyState, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { downloadZip, useApi, type AssetDto, type ProjectDto } from "@/lib/client/api";
import { useProjectParam, useRunner } from "@/lib/client/hooks";
import { TONES, type Language, type SocialOutput, type Tone } from "@/lib/copy-schemas";
import { brandStyleFromKit, type BrandKitRow } from "@/lib/design/brand";
import { createDesign, exportDesign } from "@/lib/design/export";
import { TEMPLATES, buildFromTemplate } from "@/lib/design/templates";
import type { AdContent } from "@/lib/design/types";
import { FORMAT_MAP, PLATFORMS, type PlatformId } from "@/lib/formats";
import { cn, timeAgo } from "@/lib/utils";
import { defaultContent } from "@/lib/design/content";

const PLATFORM_FOR_AI: Partial<Record<PlatformId, string>> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  facebook: "Facebook",
  x: "X",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
};

interface CopyRow {
  id: string;
  language: string;
  tone: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export function SocialCreator() {
  const router = useRouter();
  const toast = useToast();
  const { me, handleError } = useApp();
  const [projectId, setProjectId] = useProjectParam();
  const { data: project } = useApi<{ project: ProjectDto; assets: AssetDto[] }>(projectId ? `/api/projects/${projectId}` : null);
  const { data: packs, mutate: mutatePacks } = useApi<{ items: CopyRow[] }>(projectId ? `/api/copies?kind=social&projectId=${projectId}` : null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [assetKind, setAssetKind] = useState<string | null>(null);
  const [formats, setFormats] = useState<string[]>(["ig-square", "ig-story", "tt-video-cover", "fb-landscape"]);
  const [templateId, setTemplateId] = useState("spotlight");
  const [kit, setKit] = useState<BrandKitRow | null>(null);
  const [content, setContent] = useState<AdContent>(defaultContent(null));
  const [touched, setTouched] = useState(false);
  const [pickFormats, setPickFormats] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  // AI captions
  const [language, setLanguage] = useState<Language>(me?.user.preferences.defaultLanguage ?? "en");
  const [tone, setTone] = useState<Tone>("friendly");
  const [goal, setGoal] = useState<"launch" | "sale" | "engagement" | "awareness" | "seasonal">("awareness");
  const [offer, setOffer] = useState("");
  const [occasion, setOccasion] = useState("");
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const { run, generation, busy } = useRunner((g) => {
    if (g.status === "succeeded") {
      mutatePacks();
      setSelectedPack((g.result as { copyId?: string })?.copyId ?? null);
    }
  });

  useEffect(() => {
    if (!project) return;
    if (!touched) setContent(defaultContent(project.project, me?.user.preferences.defaultLanguage === "ar"));
    const pick = project.assets.find((a) => a.id === project.project.cutoutAssetId) ?? project.assets.find((a) => a.kind === "render");
    if (pick) {
      setAssetId(pick.id);
      setAssetKind(pick.kind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.project.id]);

  const brand = useMemo(() => brandStyleFromKit(kit), [kit]);
  const isCutout = assetKind === "cutout" || assetKind === "angle";
  const rtl = /[؀-ۿ]/.test(content.headline);
  const docFor = (fid: string) => {
    const f = FORMAT_MAP[fid];
    return buildFromTemplate(templateId, {
      W: f.width,
      H: f.height,
      content,
      brand,
      productAssetId: isCutout ? assetId : templateId === "photo" ? null : assetId,
      photoAssetId: !isCutout ? assetId : null,
      rtl,
    });
  };

  const pack = packs?.items.find((p) => p.id === selectedPack) ?? packs?.items[0];
  const packData = pack?.data as SocialOutput | undefined;
  const aiPlatforms = Array.from(new Set(formats.map((f) => PLATFORM_FOR_AI[FORMAT_MAP[f].platform]).filter(Boolean))) as string[];

  const makeDesign = async (fid: string) => {
    const f = FORMAT_MAP[fid];
    return createDesign({
      name: `${content.headline.slice(0, 40) || "Social post"} · ${PLATFORMS[f.platform].name} ${f.name}`,
      formatId: f.id,
      width: f.width,
      height: f.height,
      projectId,
      doc: { ...docFor(fid), templateId },
    });
  };

  const captionFor = (fid: string) => {
    if (!packData) return undefined;
    const platform = PLATFORM_FOR_AI[FORMAT_MAP[fid].platform];
    const post = packData.posts.find((p) => p.platform.toLowerCase() === platform?.toLowerCase());
    return post ? `${post.caption}\n\n${post.hashtags.join(" ")}` : undefined;
  };

  const exportAll = async () => {
    setExporting("all");
    try {
      const ids: string[] = [];
      const captions: Record<string, string> = {};
      for (const fid of formats) {
        const d = await makeDesign(fid);
        const asset = await exportDesign(d, { ...docFor(fid), templateId }, "social", { thumbnail: true });
        ids.push(asset.id);
        const cap = captionFor(fid);
        if (cap) captions[asset.id] = cap;
      }
      await downloadZip(ids, captions);
      toast.success(`${ids.length} images exported`, "Saved to your gallery and downloaded as a ZIP.");
    } catch (err) {
      handleError(err, "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const exportOne = async (fid: string) => {
    setExporting(fid);
    try {
      const d = await makeDesign(fid);
      const asset = await exportDesign(d, { ...docFor(fid), templateId }, "social", { thumbnail: true });
      const cap = captionFor(fid);
      await downloadZip([asset.id], cap ? { [asset.id]: cap } : undefined);
    } catch (err) {
      handleError(err, "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const edit = async (fid: string) => {
    try {
      const d = await makeDesign(fid);
      router.push(`/app/ads/${d.id}`);
    } catch (err) {
      handleError(err, "Couldn't open the designer");
    }
  };

  return (
    <div>
      <PageHeader
        title="Social media creator"
        description="One product, every platform: posts, stories, reels covers and ads in the right sizes — plus captions, hooks and hashtags."
        actions={
          <Button variant="accent" icon={exporting === "all" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} disabled={!assetId || !formats.length || Boolean(exporting)} onClick={exportAll}>
            Export all ({formats.length})
          </Button>
        }
      />
      <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-iris-500" />
        Vitrine prepares ready-to-post images and captions. It doesn&apos;t publish to your social accounts — download the ZIP (images + caption files) and post from each app.
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />
          {projectId && (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">Image</p>
              <ProjectImagePicker
                projectId={projectId}
                value={assetId}
                onChange={(a) => {
                  setAssetId(a.id);
                  setAssetKind(a.kind);
                }}
              />
            </Card>
          )}
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">Layout</p>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => setTemplateId(t.id)} className="text-left" title={t.description}>
                  <div className={cn("aspect-square rounded-xl border", templateId === t.id ? "ring-2 ring-iris-500 ring-offset-1" : "border-line")} style={{ background: t.preview }} />
                  <p className={cn("mt-1 truncate text-[11px]", templateId === t.id ? "font-semibold" : "text-muted")}>{t.name}</p>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <BrandKitSelect value={kit?.id ?? null} onChange={setKit} />
            </div>
          </Card>
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">Text on the images</p>
            <ContentForm
              value={content}
              onChange={(c) => {
                setTouched(true);
                setContent(c);
              }}
              projectId={projectId}
              compact
            />
          </Card>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Formats</h2>
            <Button size="sm" variant="secondary" onClick={() => setPickFormats(true)}>
              Choose formats
            </Button>
          </div>
          {!projectId ? (
            <EmptyState icon={<Share2 className="size-6" />} title="Choose a product" description="Pick a product with a removed background or studio photo to generate your social set." />
          ) : !assetId ? (
            <EmptyState title="No images yet" description="Open this product in the Photo Studio to remove its background first." />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {formats.map((fid) => {
                const f = FORMAT_MAP[fid];
                const box = 200;
                const dw = f.width >= f.height ? box : Math.round((box * f.width) / f.height);
                return (
                  <Card key={fid} className="flex flex-col p-3">
                    <div className="flex h-[210px] items-center justify-center rounded-xl bg-subtle">
                      <div className="max-w-full overflow-hidden rounded-md shadow-soft">
                        <DesignCanvas doc={docFor(fid)} width={f.width} height={f.height} displayWidth={Math.min(dw, 180)} />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: PLATFORMS[f.platform].color }} />
                      <p className="truncate text-xs font-semibold">
                        {PLATFORMS[f.platform].name} · {f.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-faint">
                      {f.width}×{f.height}
                    </p>
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      <Button size="xs" variant="secondary" icon={<PenLine className="size-3" />} onClick={() => edit(fid)}>
                        Edit
                      </Button>
                      <Button size="xs" variant="secondary" loading={exporting === fid} icon={<Download className="size-3" />} onClick={() => exportOne(fid)}>
                        Save
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Hash className="size-4 text-iris-600" /> Captions, hooks & hashtags
              </h2>
            </div>
            <AiUnavailableBanner />
            <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Language">
                <Segmented
                  className="w-full"
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: "en", label: "English" },
                    { value: "ar", label: <span className="font-arabic">العربية</span> },
                  ]}
                />
              </Field>
              <Field label="Tone">
                <Select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                  {TONES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Goal">
                <Select value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}>
                  <option value="awareness">Awareness</option>
                  <option value="engagement">Engagement</option>
                  <option value="launch">Product launch</option>
                  <option value="sale">Sale / promotion</option>
                  <option value="seasonal">Seasonal</option>
                </Select>
              </Field>
              <Field label="Offer" optional>
                <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="20% off this week" />
              </Field>
              {goal === "seasonal" && (
                <Field label="Occasion" className="sm:col-span-2">
                  <Input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Ramadan, Eid, Black Friday…" />
                </Field>
              )}
              <div className="flex items-end sm:col-span-2 lg:col-span-4">
                <Button
                  variant="primary"
                  icon={<Sparkles className="size-4" />}
                  loading={busy}
                  disabled={!projectId || !aiPlatforms.length || !me?.capabilities.anthropic}
                  onClick={() => run("social", projectId, { language, tone, goal, platforms: aiPlatforms, offer: offer || undefined, occasion: occasion || undefined })}
                >
                  Write captions for {aiPlatforms.join(", ") || "selected platforms"} · 2 cr
                </Button>
              </div>
            </Card>
            {generation && <div className="mb-4"><GenerationStatus generation={generation} /></div>}
            {packs?.items.length ? (
              <>
                {packs.items.length > 1 && (
                  <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
                    {packs.items.map((p) => (
                      <button key={p.id} onClick={() => setSelectedPack(p.id)} className={cn("shrink-0 rounded-xl border px-3 py-1.5 text-xs", pack?.id === p.id ? "border-ink bg-surface" : "border-line")}>
                        {p.language.toUpperCase()} · <span className="capitalize">{p.tone}</span> · {timeAgo(p.createdAt)}
                      </button>
                    ))}
                  </div>
                )}
                {packData && <SocialPack data={packData} rtl={pack?.language === "ar"} />}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={pickFormats} onOpenChange={setPickFormats} title="Choose formats" description="Each format gets its own layout tuned for that platform's size and safe zones." size="lg" footer={<Button onClick={() => setPickFormats(false)}>Done ({formats.length})</Button>}>
        <FormatPicker multiple value={formats} onChange={(ids) => setFormats(ids.length ? ids : formats)} />
      </Dialog>
    </div>
  );
}

function SocialPack({ data, rtl }: { data: SocialOutput; rtl?: boolean }) {
  const dir = rtl ? "rtl" : "ltr";
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {data.posts.map((p, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone="dark">{p.platform}</Badge>
                <span className="text-xs text-muted">{p.format}</span>
              </div>
              <CopyButton text={`${p.caption}\n\n${p.hashtags.join(" ")}`} label="Copy post" />
            </div>
            <div dir={dir}>
              <p className="mt-3 text-[15px] font-semibold">{p.hook}</p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-2">{p.caption}</p>
              <p className="mt-3 text-sm text-iris-600">{p.hashtags.join(" ")}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-subtle px-2.5 py-1">CTA: {p.cta}</span>
                <span className="rounded-full bg-subtle px-2.5 py-1">On image: “{p.visualHeadline}”</span>
              </div>
            </div>
            <p className="mt-3 flex gap-1.5 text-xs text-muted">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-gold-400" /> {p.tip}
            </p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-semibold">More scroll-stopping hooks</p>
          <ul className="mt-3 grid gap-2" dir={dir}>
            {data.extraHooks.map((h) => (
              <li key={h} className="flex items-start justify-between gap-2 rounded-xl bg-subtle px-3 py-2 text-sm">
                {h}
                <CopyButton text={h} compact />
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">Campaign ideas</p>
          <ul className="mt-3 grid gap-3" dir={dir}>
            {data.campaignIdeas.map((c) => (
              <li key={c.title} className="text-sm">
                <p className="font-semibold">{c.title}</p>
                <p className="mt-0.5 text-muted">{c.concept}</p>
                <p className="mt-1 text-xs text-iris-600">{c.formats.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
