"use client";

import { AlertTriangle, Check, Info, RefreshCw, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, type GenerationDto, type ProjectDto } from "@/lib/client/api";
import { STYLE_MAP } from "@/lib/studio-styles";

export function DetailsPanel({
  project,
  analyzeGen,
  onSaved,
  onRetryAnalysis,
  onPickStyle,
}: {
  project: ProjectDto;
  analyzeGen?: GenerationDto;
  onSaved: () => void;
  onRetryAnalysis: () => void;
  onPickStyle: (id: string) => void;
}) {
  const { me, handleError } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: project.product.name ?? "",
    brand: project.product.brand ?? "",
    category: project.product.category ?? "",
    price: project.product.price ?? "",
    currency: project.product.currency ?? "",
    facts: project.product.facts ?? "",
    audience: project.product.audience ?? "",
    keywords: project.product.keywords ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setForm({
      name: project.product.name ?? "",
      brand: project.product.brand ?? "",
      category: project.product.category ?? "",
      price: project.product.price ?? "",
      currency: project.product.currency ?? "",
      facts: project.product.facts ?? "",
      audience: project.product.audience ?? "",
      keywords: project.product.keywords ?? "",
    });
  }, [project.product, dirty]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDirty(true);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { product: form } });
      setDirty(false);
      toast.success("Product details saved");
      onSaved();
    } catch (err) {
      handleError(err, "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const a = project.analysis;
  const analyzing = analyzeGen && ["queued", "running"].includes(analyzeGen.status);

  return (
    <div className="grid gap-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ScanSearch className="size-4 text-iris-600" /> AI product detection
          </h3>
          {a && <Badge tone={a.confidence === "high" ? "success" : a.confidence === "medium" ? "iris" : "warning"}>{a.confidence} confidence</Badge>}
        </div>
        {analyzing ? (
          <div className="flex items-center gap-2 rounded-2xl bg-subtle p-4 text-[13px] text-muted">
            <RefreshCw className="size-4 animate-spin" /> Identifying your product…
          </div>
        ) : a ? (
          <div className="grid gap-3 rounded-2xl border border-line p-4 text-[13px]">
            <div>
              <p className="font-semibold">{a.productName}</p>
              <p className="text-muted">{a.category}</p>
            </div>
            {a.visibleBrandText.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Text on the product</p>
                <div className="flex flex-wrap gap-1">
                  {a.visibleBrandText.map((t) => (
                    <span key={t} className="rounded-md bg-subtle px-2 py-0.5 font-mono text-xs">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {a.colors.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {a.colors.map((c) => (
                  <span key={c.hex + c.name} className="flex items-center gap-1.5 text-xs text-ink-2">
                    <span className="size-4 rounded-full border border-black/10" style={{ background: c.hex }} /> {c.name}
                  </span>
                ))}
              </div>
            )}
            {a.photoIssues.length > 0 && (
              <div className="rounded-xl bg-warning-soft p-2.5 text-xs text-warning">
                <p className="mb-1 flex items-center gap-1 font-semibold">
                  <AlertTriangle className="size-3.5" /> Photo tips
                </p>
                <ul className="list-disc pl-4">
                  {a.photoIssues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
            {a.suggestedStyles.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Suggested styles</p>
                <div className="flex flex-wrap gap-1.5">
                  {a.suggestedStyles.map((s) => (
                    <button key={s} onClick={() => onPickStyle(s)} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-iris-300 hover:text-iris-700">
                      {STYLE_MAP[s]?.name ?? s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : !me?.capabilities.anthropic ? (
          <p className="flex gap-2 rounded-2xl bg-subtle p-4 text-[13px] text-muted">
            <Info className="mt-0.5 size-4 shrink-0" /> Product detection uses AI writing, which isn&apos;t connected on this server. Fill in the details below manually.
          </p>
        ) : (
          <div className="rounded-2xl bg-subtle p-4 text-[13px] text-muted">
            {analyzeGen?.status === "failed" ? <p className="mb-2 text-danger">{analyzeGen.error}</p> : <p className="mb-2">Not analyzed yet.</p>}
            <Button size="sm" variant="secondary" icon={<ScanSearch className="size-3.5" />} onClick={onRetryAnalysis}>
              Detect product (free)
            </Button>
          </div>
        )}
      </section>

      <section className="grid gap-3.5">
        <div>
          <h3 className="text-sm font-semibold">Product facts</h3>
          <p className="mt-1 text-xs text-muted">
            Descriptions, ads and captions only use facts you enter here plus what&apos;s visible in the photo. Vitrine never invents specifications.
          </p>
        </div>
        <Field label="Product name" htmlFor="pname">
          <Input id="pname" value={form.name} onChange={set("name")} placeholder={a?.productName ?? "e.g. Rose Glow Face Serum"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" htmlFor="pbrand" optional>
            <Input id="pbrand" value={form.brand} onChange={set("brand")} />
          </Field>
          <Field label="Category" htmlFor="pcat" optional>
            <Input id="pcat" value={form.category} onChange={set("category")} placeholder="Skincare" />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_90px] gap-3">
          <Field label="Price" htmlFor="pprice" optional>
            <Input id="pprice" value={form.price} onChange={set("price")} placeholder="149" inputMode="decimal" />
          </Field>
          <Field label="Currency" htmlFor="pcur" optional>
            <Input id="pcur" value={form.currency} onChange={set("currency")} placeholder="SAR" />
          </Field>
        </div>
        <Field label="Key facts & specifications" htmlFor="pfacts" hint="One per line — size, materials, ingredients, what's included, care, warranty…">
          <Textarea
            id="pfacts"
            value={form.facts}
            onChange={set("facts")}
            rows={6}
            placeholder={"30 ml glass bottle with dropper\nVitamin C 15% + hyaluronic acid\nFragrance-free, vegan\nMade in Korea"}
          />
        </Field>
        <Field label="Target audience" htmlFor="paud" optional>
          <Input id="paud" value={form.audience} onChange={set("audience")} placeholder="Women 25–40 interested in clean beauty" />
        </Field>
        <Field label="SEO keywords" htmlFor="pkw" optional>
          <Input id="pkw" value={form.keywords} onChange={set("keywords")} placeholder="vitamin c serum, glow serum" />
        </Field>
        <Button onClick={save} loading={saving} disabled={!dirty} icon={!dirty ? <Check className="size-4" /> : undefined}>
          {dirty ? "Save details" : "Saved"}
        </Button>
      </section>
    </div>
  );
}
