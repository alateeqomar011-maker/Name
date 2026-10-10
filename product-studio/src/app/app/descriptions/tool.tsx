"use client";

import { AlertCircle, FileText, Lightbulb, Save, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AiUnavailableBanner, GenerationStatus } from "@/components/app/ai-status";
import { useApp } from "@/components/app/app-provider";
import { CopyButton } from "@/components/app/copy-button";
import { ProductFacts } from "@/components/app/product-facts";
import { ProjectPicker } from "@/components/app/project-picker";
import { PageHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, useApi, type ProjectDto } from "@/lib/client/api";
import { useProjectParam, useRunner } from "@/lib/client/hooks";
import { TONES, type DescriptionOutput, type Language, type Tone } from "@/lib/copy-schemas";
import { cn, timeAgo } from "@/lib/utils";

interface CopyRow {
  id: string;
  kind: string;
  title: string;
  language: string;
  tone: string | null;
  favorite: boolean;
  data: Record<string, unknown>;
  createdAt: string;
}

export function DescriptionsTool() {
  const { me } = useApp();
  const [projectId, setProjectId] = useProjectParam();
  const { data: projectData, mutate: mutateProject } = useApi<{ project: ProjectDto }>(projectId ? `/api/projects/${projectId}` : null);
  const { data: copies, mutate: mutateCopies } = useApi<{ items: CopyRow[] }>(projectId ? `/api/copies?kind=description&projectId=${projectId}` : null);
  const [language, setLanguage] = useState<Language>(me?.user.preferences.defaultLanguage ?? "en");
  const [tone, setTone] = useState<Tone>("professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [channel, setChannel] = useState("general");
  const [selected, setSelected] = useState<string | null>(null);
  const { run, generation, busy } = useRunner((g) => {
    if (g.status === "succeeded") {
      mutateCopies();
      setSelected((g.result as { copyId?: string })?.copyId ?? null);
    }
  });

  useEffect(() => {
    if (me?.user.preferences.defaultLanguage) setLanguage(me.user.preferences.defaultLanguage);
  }, [me?.user.preferences.defaultLanguage]);

  const current = useMemo(() => copies?.items.find((c) => c.id === selected) ?? copies?.items[0], [copies, selected]);

  return (
    <div>
      <PageHeader
        title="Product descriptions"
        description="Titles, persuasive descriptions, features, benefits and SEO — in English or Arabic, written only from your facts and what's visible in the photo."
      />
      <AiUnavailableBanner />
      <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid gap-4 lg:sticky lg:top-24">
          <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />
          {projectData && <ProductFacts project={projectData.project} onSaved={() => mutateProject()} />}
          <Card className="grid gap-4 p-4">
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
            <Field label="Writing style">
              <div className="grid grid-cols-3 gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-xs font-medium transition",
                      tone === t.id ? "border-ink bg-ink text-white" : "border-line hover:border-line-strong",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Length">
                <Select value={length} onChange={(e) => setLength(e.target.value as typeof length)}>
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </Select>
              </Field>
              <Field label="Optimized for">
                <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="general">Online store</option>
                  <option value="amazon">Amazon</option>
                  <option value="noon">Noon</option>
                  <option value="shopify">Shopify</option>
                  <option value="instagram">Instagram Shop</option>
                </Select>
              </Field>
            </div>
            <Button
              variant="accent"
              size="lg"
              icon={<Sparkles className="size-4" />}
              loading={busy}
              disabled={!projectId || !me?.capabilities.anthropic}
              onClick={() => run("description", projectId, { language, tone, length, channel })}
            >
              Write description <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-xs">1 cr</span>
            </Button>
          </Card>
        </div>

        <div className="min-w-0">
          {generation && <div className="mb-4"><GenerationStatus generation={generation} /></div>}
          {!projectId ? (
            <EmptyState icon={<FileText className="size-6" />} title="Choose a product" description="Pick a product to write its listing copy. Add facts first for the richest, most accurate result." />
          ) : copies?.items.length ? (
            <>
              <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
                {copies.items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition",
                      current?.id === c.id ? "border-ink bg-surface shadow-soft" : "border-line bg-surface/60 hover:border-line-strong",
                    )}
                  >
                    <Badge tone={c.language === "ar" ? "gold" : "neutral"}>{c.language === "ar" ? "AR" : "EN"}</Badge>
                    <span className="capitalize">{c.tone}</span>
                    <span className="text-faint">{timeAgo(c.createdAt)}</span>
                    {c.favorite && <Star className="size-3 fill-gold-400 text-gold-400" />}
                  </button>
                ))}
              </div>
              {current && <DescriptionDoc key={current.id} copy={current} onChange={() => mutateCopies()} />}
            </>
          ) : (
            !generation && (
              <EmptyState
                icon={<Sparkles className="size-6" />}
                title="No descriptions yet"
                description="Choose a language and writing style, then generate. Every version is saved so you can compare and reuse them."
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, copy, dir }: { title: string; children: React.ReactNode; copy?: string; dir?: "rtl" | "ltr" }) {
  return (
    <section className="border-t border-line px-5 py-5 first:border-t-0 sm:px-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h3>
        {copy && <CopyButton text={copy} />}
      </div>
      <div dir={dir}>{children}</div>
    </section>
  );
}

function DescriptionDoc({ copy, onChange }: { copy: CopyRow; onChange: () => void }) {
  const toast = useToast();
  const { handleError } = useApp();
  const [doc, setDoc] = useState(copy.data as unknown as DescriptionOutput);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleIdx, setTitleIdx] = useState(0);
  const dir = copy.language === "ar" ? "rtl" : "ltr";
  const update = (patch: Partial<DescriptionOutput>) => {
    setDoc((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/copies/${copy.id}`, { method: "PATCH", json: { data: doc } });
      setDirty(false);
      toast.success("Changes saved");
      onChange();
    } catch (err) {
      handleError(err, "Couldn't save");
    } finally {
      setSaving(false);
    }
  };
  const allText = [
    doc.titles[titleIdx],
    "",
    doc.description,
    "",
    ...doc.features.map((f) => `• ${f}`),
    "",
    ...doc.benefits.map((b) => `• ${b}`),
    ...(doc.specifications.length ? ["", ...doc.specifications.map((s) => `${s.label}: ${s.value}`)] : []),
  ].join("\n");

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle/50 px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Badge tone={copy.language === "ar" ? "gold" : "iris"}>{copy.language === "ar" ? "العربية" : "English"}</Badge>
          <span className="capitalize">{copy.tone}</span> · {timeAgo(copy.createdAt)}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              await api(`/api/copies/${copy.id}`, { method: "PATCH", json: { favorite: !copy.favorite } });
              onChange();
            }}
            className="rounded-lg p-1.5 text-muted hover:bg-white"
            aria-label="Favorite"
          >
            <Star className={cn("size-4", copy.favorite && "fill-gold-400 text-gold-400")} />
          </button>
          <CopyButton text={allText} label="Copy all" />
          {dirty && (
            <Button size="xs" icon={<Save className="size-3" />} loading={saving} onClick={save}>
              Save edits
            </Button>
          )}
        </div>
      </div>

      <Section title="Product title" copy={doc.titles[titleIdx]} dir={dir}>
        <div className="grid gap-2">
          {doc.titles.map((t, i) => (
            <label key={i} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", titleIdx === i ? "border-iris-300 bg-iris-50/50" : "border-line hover:border-line-strong")}>
              <input type="radio" className="mt-1 accent-[var(--color-iris-500)]" checked={titleIdx === i} onChange={() => setTitleIdx(i)} />
              <span className="text-[15px] font-semibold">{t}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Short description" copy={doc.shortDescription} dir={dir}>
        <Textarea value={doc.shortDescription} onChange={(e) => update({ shortDescription: e.target.value })} className="min-h-16 border-transparent bg-transparent px-0 text-[15px] shadow-none focus:bg-surface focus:px-3" />
      </Section>

      <Section title="Description" copy={doc.description} dir={dir}>
        <Textarea
          value={doc.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={Math.max(6, doc.description.split("\n").length + 2)}
          className="border-transparent bg-transparent px-0 text-[15px] leading-7 shadow-none focus:bg-surface focus:px-3"
        />
      </Section>

      <div className="grid sm:grid-cols-2">
        <Section title="Key features" copy={doc.features.map((f) => `• ${f}`).join("\n")} dir={dir}>
          <EditableList items={doc.features} onChange={(features) => update({ features })} />
        </Section>
        <Section title="Benefits" copy={doc.benefits.map((f) => `• ${f}`).join("\n")} dir={dir}>
          <EditableList items={doc.benefits} onChange={(benefits) => update({ benefits })} />
        </Section>
      </div>

      <Section title="Specifications" copy={doc.specifications.map((s) => `${s.label}: ${s.value}`).join("\n")} dir={dir}>
        {doc.specifications.length ? (
          <dl className="overflow-hidden rounded-xl border border-line">
            {doc.specifications.map((s, i) => (
              <div key={i} className="grid grid-cols-[minmax(120px,40%)_1fr] border-t border-line text-sm first:border-t-0">
                <dt className="bg-subtle/60 px-3 py-2 font-medium">{s.label}</dt>
                <dd className="px-3 py-2">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="flex items-start gap-2 text-sm text-muted">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> No specifications were provided, so none were written. Add them to the product facts to include a spec table.
          </p>
        )}
      </Section>

      <Section title="SEO">
        <div className="grid gap-4" dir={dir}>
          <Field label={<span className="flex justify-between">Meta title <span className={cn("font-normal", doc.seo.metaTitle.length > 60 ? "text-danger" : "text-faint")}>{doc.seo.metaTitle.length}/60</span></span>}>
            <div className="flex gap-2">
              <Input value={doc.seo.metaTitle} onChange={(e) => update({ seo: { ...doc.seo, metaTitle: e.target.value } })} />
              <CopyButton text={doc.seo.metaTitle} compact />
            </div>
          </Field>
          <Field label={<span className="flex justify-between">Meta description <span className={cn("font-normal", doc.seo.metaDescription.length > 155 ? "text-danger" : "text-faint")}>{doc.seo.metaDescription.length}/155</span></span>}>
            <div className="flex gap-2">
              <Textarea value={doc.seo.metaDescription} onChange={(e) => update({ seo: { ...doc.seo, metaDescription: e.target.value } })} className="min-h-16" />
              <CopyButton text={doc.seo.metaDescription} compact />
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {doc.seo.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-subtle px-2.5 py-1 text-xs">
                    {k}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-medium">URL slug</p>
              <code dir="ltr" className="block rounded-lg bg-subtle px-2.5 py-1.5 font-mono text-xs">/{doc.seo.urlSlug}</code>
            </div>
          </div>
        </div>
      </Section>

      {doc.missingInfo.length > 0 && (
        <div className="m-5 rounded-2xl border border-gold-400/40 bg-[#fdf8ee] p-4 sm:m-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#7a4f0f]">
            <Lightbulb className="size-4" /> Make this listing stronger
          </p>
          <p className="mt-1 text-xs text-[#7a4f0f]/80">These weren&apos;t provided, so they were left out rather than guessed:</p>
          <ul className="mt-2 grid gap-1 text-[13px] text-[#5d3d0b]" dir={dir}>
            {doc.missingInfo.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function EditableList({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  return (
    <ul className="grid gap-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-iris-400" />
          <Textarea
            value={it}
            rows={1}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className="min-h-0 resize-none border-transparent bg-transparent px-1 py-1 text-sm shadow-none focus:bg-surface"
          />
        </li>
      ))}
    </ul>
  );
}
