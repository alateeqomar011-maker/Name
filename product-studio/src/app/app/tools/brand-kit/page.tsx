"use client";

import { Palette, Save, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { GenerationStatus } from "@/components/app/ai-status";
import { useApp } from "@/components/app/app-provider";
import { CopyButton } from "@/components/app/copy-button";
import { InputImage, ToolFrame } from "@/components/app/tool-frame";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, useApi, type AssetDto } from "@/lib/client/api";
import { useRunner } from "@/lib/client/hooks";
import type { BrandKitOutput, Language } from "@/lib/copy-schemas";
import { FONTS, fontStack } from "@/lib/fonts";
import "@/lib/design/fonts-client";

interface KitRow {
  id: string;
  name: string;
  data: BrandKitOutput & { extractedColors?: string[]; language?: string };
  createdAt: string;
}

export default function BrandKitTool() {
  const { me } = useApp();
  const { data: kits, mutate } = useApi<{ items: KitRow[] }>("/api/brand-kits");
  const [language, setLanguage] = useState<Language>(me?.user.preferences.defaultLanguage ?? "en");
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [vibe, setVibe] = useState("");
  const [source, setSource] = useState<AssetDto | null>(null);
  const { run, generation, busy } = useRunner((g) => g.status === "succeeded" && mutate());

  return (
    <ToolFrame title="AI brand kit" description="A starter identity for your store: palette, font pairing, voice, taglines and social bio — applied in the ad designer and social creator." plan="pro" requires="anthropic" requiresLabel="The brand kit generator uses Claude (ANTHROPIC_API_KEY).">
      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="grid gap-3.5 p-4">
          <Field label="Language">
            <Segmented className="w-full" value={language} onChange={setLanguage} options={[{ value: "en", label: "English" }, { value: "ar", label: <span className="font-arabic">العربية</span> }]} />
          </Field>
          <Field label="Brand name" htmlFor="bk-name">
            <Input id="bk-name" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Noor Skincare" />
          </Field>
          <Field label="What do you sell?" htmlFor="bk-cat">
            <Input id="bk-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Natural skincare for sensitive skin" />
          </Field>
          <Field label="About the brand" htmlFor="bk-desc" optional>
            <Textarea id="bk-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Values, story, what makes you different…" />
          </Field>
          <Field label="Audience" htmlFor="bk-aud" optional>
            <Input id="bk-aud" value={audience} onChange={(e) => setAudience(e.target.value)} />
          </Field>
          <Field label="Desired vibe" htmlFor="bk-vibe" optional>
            <Input id="bk-vibe" value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="calm, premium, botanical" />
          </Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Product or logo image <span className="font-normal text-faint">(optional, for colors)</span></p>
            <div className="w-32"><InputImage asset={source} onPick={setSource} label="Add image" /></div>
          </div>
          <Button variant="accent" size="lg" icon={<Sparkles className="size-4" />} loading={busy} disabled={!brandName.trim() || !category.trim() || !me?.capabilities.anthropic}
            onClick={() => run("brand_kit", null, { language, brandName, category, description: description || undefined, audience: audience || undefined, vibe: vibe || undefined, sourceAssetId: source?.id })}>
            Generate brand kit <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">3 cr</span>
          </Button>
        </Card>
        <div className="grid min-w-0 gap-4">
          {generation && <GenerationStatus generation={generation} />}
          {kits?.items.length ? kits.items.map((k) => <KitCard key={k.id} kit={k} onChange={() => mutate()} />) : (
            !generation && <EmptyState icon={<Palette className="size-6" />} title="No brand kits yet" description="Describe your brand and generate a kit. You can fine-tune colors and fonts afterwards." />
          )}
        </div>
      </div>
    </ToolFrame>
  );
}

function KitCard({ kit, onChange }: { kit: KitRow; onChange: () => void }) {
  const toast = useToast();
  const { handleError } = useApp();
  const [data, setData] = useState(kit.data);
  const [dirty, setDirty] = useState(false);
  useEffect(() => setData(kit.data), [kit.data]);
  const dir = kit.data.language === "ar" ? "rtl" : "ltr";
  const save = async () => {
    try {
      await api(`/api/brand-kits/${kit.id}`, { method: "PATCH", json: { data } });
      setDirty(false);
      toast.success("Brand kit saved");
      onChange();
    } catch (err) {
      handleError(err, "Couldn't save");
    }
  };
  return (
    <Card className="overflow-hidden">
      <div className="flex h-20">
        {data.palette.map((p) => <div key={p.hex + p.name} className="flex-1" style={{ background: p.hex }} />)}
      </div>
      <div className="grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{kit.name}</p>
            <p className="text-sm text-muted" dir={dir}>{data.elevatorPitch}</p>
          </div>
          <div className="flex gap-2">
            {dirty && <Button size="sm" icon={<Save className="size-4" />} onClick={save}>Save</Button>}
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { if (confirm("Delete this brand kit?")) { await api(`/api/brand-kits/${kit.id}`, { method: "DELETE" }); onChange(); } }}>Delete</Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {data.palette.map((p, i) => (
            <label key={i} className="rounded-xl border border-line p-2 text-xs">
              <span className="relative mb-2 block h-10 overflow-hidden rounded-lg" style={{ background: p.hex }}>
                <input type="color" value={p.hex} onChange={(e) => { setData({ ...data, palette: data.palette.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)) }); setDirty(true); }} className="absolute inset-0 size-full cursor-pointer opacity-0" />
              </span>
              <span className="block font-semibold">{p.name}</span>
              <span className="flex items-center justify-between font-mono text-muted">{p.hex}<Badge tone="neutral">{p.role}</Badge></span>
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["heading", "body"] as const).map((k) => (
            <div key={k} className="rounded-xl border border-line p-3">
              <p className="mb-1 text-xs font-medium text-muted capitalize">{k} font</p>
              <Select value={data.typography[k]} onChange={(e) => { setData({ ...data, typography: { ...data.typography, [k]: e.target.value } }); setDirty(true); }}>
                {FONTS.map((f) => <option key={f.family} value={f.family}>{f.family.replace(" Variable", "")}</option>)}
              </Select>
              <p className="mt-2 truncate text-2xl" style={{ fontFamily: fontStack(data.typography[k]), fontWeight: k === "heading" ? 700 : 400 }}>{kit.name}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2" dir={dir}>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Voice</p>
            <p className="text-sm"><span className="font-semibold">{data.voice.personality.join(" · ")}</span> — {data.voice.tone}</p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
              <ul className="space-y-1">{data.voice.do.map((d) => <li key={d} className="text-success">✓ {d}</li>)}</ul>
              <ul className="space-y-1">{data.voice.dont.map((d) => <li key={d} className="text-danger">✕ {d}</li>)}</ul>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Taglines</p>
            <ul className="space-y-1.5">{data.taglines.map((t) => <li key={t} className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-2.5 py-1.5 text-sm">{t}<CopyButton text={t} compact /></li>)}</ul>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2" dir={dir}>
          <div className="rounded-xl bg-subtle p-3 text-sm">
            <p className="mb-1 flex items-center justify-between text-xs font-semibold text-muted">Social bio <CopyButton text={data.socialBio} compact /></p>
            {data.socialBio}
          </div>
          <div className="rounded-xl bg-subtle p-3 text-sm">
            <p className="mb-1 text-xs font-semibold text-muted">Logo direction</p>
            {data.logoDirection}
          </div>
        </div>
        <p className="text-sm text-iris-600" dir={dir}>{data.hashtags.join(" ")}</p>
      </div>
    </Card>
  );
}
