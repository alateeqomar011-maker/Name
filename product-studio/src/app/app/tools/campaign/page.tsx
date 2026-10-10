"use client";

import { CalendarDays, Download, Mail, Rocket, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { GenerationStatus } from "@/components/app/ai-status";
import { useApp } from "@/components/app/app-provider";
import { CopyButton } from "@/components/app/copy-button";
import { ProjectPicker } from "@/components/app/project-picker";
import { ToolFrame } from "@/components/app/tool-frame";
import { DesignCanvas } from "@/components/design/design-canvas";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { downloadZip, useApi, type AssetDto, type ProjectDto } from "@/lib/client/api";
import { useRunner } from "@/lib/client/hooks";
import { TONES, type CampaignOutput, type Language, type Tone } from "@/lib/copy-schemas";
import { readableOn } from "@/lib/design/brand";
import { createDesign, exportDesign } from "@/lib/design/export";
import { buildFromTemplate } from "@/lib/design/templates";
import type { BrandStyle } from "@/lib/design/types";
import { FORMAT_MAP } from "@/lib/formats";
import { cn, timeAgo } from "@/lib/utils";

const CHANNELS = ["Instagram", "TikTok", "Snapchat", "Facebook", "X", "Pinterest", "LinkedIn"];

function formatFor(platform: string, format: string) {
  const p = platform.toLowerCase();
  const story = /story|reel|video|short/i.test(format);
  if (p.includes("instagram")) return story ? "ig-story" : "ig-portrait";
  if (p.includes("tiktok")) return "tt-video-cover";
  if (p.includes("snap")) return "sc-story";
  if (p.includes("facebook")) return story ? "ig-story" : "fb-feed";
  if (p === "x" || p.includes("twitter")) return "x-post";
  if (p.includes("pinterest")) return "pin-standard";
  if (p.includes("linkedin")) return "li-post";
  return "ig-square";
}

interface CopyRow { id: string; title: string; language: string; tone: string | null; data: Record<string, unknown>; createdAt: string }

export default function CampaignTool() {
  const { me, handleError } = useApp();
  const toast = useToast();
  const [projectId, setProjectId] = useState<string | null>(null);
  const { data: project } = useApi<{ project: ProjectDto; assets: AssetDto[] }>(projectId ? `/api/projects/${projectId}` : null);
  const { data: campaigns, mutate } = useApi<{ items: CopyRow[] }>(projectId ? `/api/copies?kind=campaign&projectId=${projectId}` : null);
  const [language, setLanguage] = useState<Language>(me?.user.preferences.defaultLanguage ?? "en");
  const [tone, setTone] = useState<Tone>("persuasive");
  const [goal, setGoal] = useState("Product launch");
  const [occasion, setOccasion] = useState("");
  const [days, setDays] = useState(7);
  const [channels, setChannels] = useState<string[]>(["Instagram", "TikTok", "Snapchat"]);
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { run, generation, busy } = useRunner((g) => {
    if (g.status === "succeeded") {
      mutate();
      setSelected((g.result as { copyId?: string })?.copyId ?? null);
    }
  });
  const current = campaigns?.items.find((c) => c.id === selected) ?? campaigns?.items[0];
  const plan = current?.data as CampaignOutput | undefined;
  const cutoutId = project?.project.cutoutAssetId ?? null;
  const rtl = current?.language === "ar";

  const brand: Partial<BrandStyle> | null = useMemo(() => {
    if (!plan?.palette?.length) return null;
    const [primary, accent, background] = plan.palette;
    const bg = background ?? "#f6f4f0";
    return { primary, accent: accent ?? primary, background: bg, text: readableOn(bg), secondary: readableOn(bg) === "#ffffff" ? "#e5e5ea" : "#55555f" };
  }, [plan]);
  const template = /sale|discount|friday|offer/i.test(goal + (occasion ?? "")) ? "sale" : /launch|new/i.test(goal) ? "launch" : /ramadan|eid|night/i.test(occasion) ? "festive" : "spotlight";

  const docFor = (item: CampaignOutput["schedule"][number]) => {
    const f = FORMAT_MAP[formatFor(item.platform, item.format)];
    return {
      f,
      doc: buildFromTemplate(template, {
        W: f.width,
        H: f.height,
        content: { headline: item.visualHeadline, cta: item.cta, subheadline: "" },
        brand,
        productAssetId: cutoutId,
        rtl,
      }),
    };
  };

  const exportKit = async () => {
    if (!plan) return;
    setExporting(true);
    try {
      const ids: string[] = [];
      const captions: Record<string, string> = {};
      for (const item of plan.schedule) {
        const { f, doc } = docFor(item);
        const d = await createDesign({ name: `${plan.name} · Day ${item.day} · ${item.platform}`, formatId: f.id, width: f.width, height: f.height, projectId, doc: { ...doc, templateId: template } });
        const asset = await exportDesign(d, doc, "social", { thumbnail: true });
        ids.push(asset.id);
        captions[asset.id] = `Day ${item.day} · ${item.platform} · ${item.format}\n\n${item.hook}\n\n${item.caption}\n\n${item.hashtags.join(" ")}`;
      }
      await downloadZip(ids, captions);
      toast.success("Campaign kit exported", `${ids.length} visuals with captions.`);
    } catch (err) {
      handleError(err, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ToolFrame title="Campaign generator" description="Plan a coordinated campaign — big idea, day-by-day posts for each channel, captions and matching visuals — in one go." plan="pro" requires="anthropic" requiresLabel="The campaign generator uses Claude (ANTHROPIC_API_KEY).">
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="grid gap-3.5 p-4 lg:sticky lg:top-24">
          <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />
          <Field label="Language">
            <Segmented className="w-full" value={language} onChange={setLanguage} options={[{ value: "en", label: "English" }, { value: "ar", label: <span className="font-arabic">العربية</span> }]} />
          </Field>
          <Field label="Campaign goal">
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Product launch, clearance sale…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Occasion" optional>
              <Input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Ramadan" />
            </Field>
            <Field label="Duration">
              <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
                {[3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} days</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Channels">
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => (
                <button key={c} onClick={() => setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c])} className={cn("rounded-full border px-2.5 py-1 text-xs", channels.includes(c) ? "border-ink bg-ink text-white" : "border-line")}>{c}</button>
              ))}
            </div>
          </Field>
          <Field label="Offer" optional>
            <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="15% off with code GLOW15" />
          </Field>
          <Field label="Audience" optional>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} />
          </Field>
          <Field label="Tone">
            <Select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>{TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
          </Field>
          <Button variant="accent" size="lg" icon={<Sparkles className="size-4" />} loading={busy} disabled={!projectId || !channels.length || !me?.capabilities.anthropic}
            onClick={() => run("campaign", projectId, { language, tone, goal, occasion: occasion || undefined, days, platforms: channels, offer: offer || undefined, audience: audience || undefined })}>
            Plan campaign <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">5 cr</span>
          </Button>
        </Card>

        <div className="grid min-w-0 gap-4">
          {generation && <GenerationStatus generation={generation} />}
          {campaigns && campaigns.items.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {campaigns.items.map((c) => (
                <button key={c.id} onClick={() => setSelected(c.id)} className={cn("shrink-0 rounded-xl border px-3 py-1.5 text-xs", current?.id === c.id ? "border-ink bg-surface" : "border-line")}>{c.title} · {timeAgo(c.createdAt)}</button>
              ))}
            </div>
          )}
          {plan ? (
            <>
              <Card className="overflow-hidden" dir={rtl ? "rtl" : "ltr"}>
                <div className="flex h-2">{plan.palette.map((c) => <div key={c} className="flex-1" style={{ background: c }} />)}</div>
                <div className="p-6">
                  <Badge tone="iris"><Rocket className="size-3" /> Campaign</Badge>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">{plan.name}</h2>
                  <p className="mt-1 font-display text-xl text-iris-700 italic">{plan.tagline}</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink-2">{plan.bigIdea}</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Key messages</p>
                      <ul className="space-y-1.5 text-sm">{plan.keyMessages.map((m) => <li key={m}>• {m}</li>)}</ul>
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-1 text-xs font-semibold tracking-wider text-muted uppercase"><Target className="size-3.5" /> Audience & KPIs</p>
                      <p className="text-sm">{plan.audience}</p>
                      <ul className="mt-2 space-y-1 text-xs text-muted">{plan.kpis.map((k) => <li key={k}>◦ {k}</li>)}</ul>
                    </div>
                  </div>
                  <div className="mt-5">
                    <p className="mb-2 flex items-center gap-1 text-xs font-semibold tracking-wider text-muted uppercase"><Mail className="size-3.5" /> Email subject lines</p>
                    <ul className="grid gap-1.5">{plan.emailSubjectLines.map((s) => <li key={s} className="flex items-center justify-between rounded-lg bg-subtle px-3 py-1.5 text-sm">{s}<CopyButton text={s} compact /></li>)}</ul>
                  </div>
                </div>
              </Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="size-4 text-iris-600" /> Schedule & visuals</h3>
                <Button icon={<Download className="size-4" />} loading={exporting} disabled={!cutoutId} onClick={exportKit}>Export campaign kit</Button>
              </div>
              {!cutoutId && <p className="text-sm text-muted">Remove this product&apos;s background in the studio to generate matching visuals.</p>}
              <div className="grid gap-4">
                {plan.schedule.map((item, i) => {
                  const v = cutoutId ? docFor(item) : null;
                  return (
                    <Card key={i} className="grid gap-4 p-4 sm:grid-cols-[160px_1fr]">
                      {v && (
                        <div className="flex items-center justify-center rounded-xl bg-subtle p-2">
                          <DesignCanvas doc={v.doc} width={v.f.width} height={v.f.height} displayWidth={v.f.width >= v.f.height ? 140 : Math.round((140 * v.f.width) / v.f.height)} className="rounded shadow-soft" />
                        </div>
                      )}
                      <div dir={rtl ? "rtl" : "ltr"} className={cn(!v && "sm:col-span-2")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="dark">Day {item.day}</Badge>
                          <Badge tone="neutral">{item.platform}</Badge>
                          <span className="text-xs text-muted">{item.format}</span>
                          <span className="flex-1" />
                          <CopyButton text={`${item.caption}\n\n${item.hashtags.join(" ")}`} />
                        </div>
                        <p className="mt-2 font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm font-medium text-iris-700">{item.hook}</p>
                        <p className="mt-1.5 text-sm whitespace-pre-line text-ink-2">{item.caption}</p>
                        <p className="mt-2 text-sm text-iris-600">{item.hashtags.join(" ")}</p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : (
            !generation && (
              <div className="flex aspect-[16/9] flex-col items-center justify-center rounded-3xl border border-dashed border-line-strong text-center text-sm text-muted">
                <Rocket className="mb-2 size-6 text-faint" />
                Choose a product, a goal and your channels.<br />Vitrine plans the campaign and builds matching visuals.
              </div>
            )
          )}
        </div>
      </div>
    </ToolFrame>
  );
}
