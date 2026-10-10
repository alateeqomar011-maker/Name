"use client";

import { Pencil, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, type ProjectDto } from "@/lib/client/api";
import { useApp } from "./app-provider";

type Facts = NonNullable<ProjectDto["product"]>;

const EMPTY: Required<Pick<Facts, "name" | "brand" | "category" | "price" | "currency" | "facts" | "audience" | "keywords">> = {
  name: "",
  brand: "",
  category: "",
  price: "",
  currency: "",
  facts: "",
  audience: "",
  keywords: "",
};

/** Compact summary of the seller-provided facts with an editor dialog. */
export function ProductFacts({ project, onSaved }: { project: ProjectDto; onSaved: () => void }) {
  const { handleError } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY, ...project.product });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ ...EMPTY, ...project.product }), [project.product]);
  const p = project.product;
  const factLines = (p.facts ?? "").split("\n").filter((l) => l.trim());
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <ShieldCheck className="size-3.5 text-success" /> Facts the AI may use
          </p>
          <p className="mt-1 truncate text-sm font-semibold">{p.name || project.analysis?.productName || project.name}</p>
          <p className="text-xs text-muted">
            {[p.brand, p.category, p.price && `${p.price} ${p.currency ?? ""}`].filter(Boolean).join(" · ") || "No brand, category or price yet"}
          </p>
        </div>
        <Button size="xs" variant="secondary" icon={<Pencil className="size-3" />} onClick={() => setOpen(true)}>
          Edit
        </Button>
      </div>
      {factLines.length ? (
        <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
          {factLines.slice(0, 5).map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-faint" />
              <span className="line-clamp-1">{l}</span>
            </li>
          ))}
          {factLines.length > 5 && <li className="text-xs text-muted">+{factLines.length - 5} more</li>}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
          Add key facts (size, materials, ingredients…) for richer copy. Without them, the AI writes only from what&apos;s visible in the photo.
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Product facts"
        description="Only what's true. Vitrine never invents specifications — anything missing is simply left out."
        size="lg"
        footer={
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await api(`/api/projects/${project.id}`, { method: "PATCH", json: { product: form } });
                toast.success("Facts saved");
                setOpen(false);
                onSaved();
              } catch (err) {
                handleError(err, "Couldn't save");
              } finally {
                setSaving(false);
              }
            }}
          >
            Save facts
          </Button>
        }
      >
        <div className="grid gap-3.5">
          <Field label="Product name" htmlFor="f-name">
            <Input id="f-name" value={form.name} onChange={set("name")} />
          </Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Brand" htmlFor="f-brand" optional>
              <Input id="f-brand" value={form.brand} onChange={set("brand")} />
            </Field>
            <Field label="Category" htmlFor="f-cat" optional>
              <Input id="f-cat" value={form.category} onChange={set("category")} />
            </Field>
            <Field label="Price" htmlFor="f-price" optional>
              <Input id="f-price" value={form.price} onChange={set("price")} inputMode="decimal" />
            </Field>
            <Field label="Currency" htmlFor="f-cur" optional>
              <Input id="f-cur" value={form.currency} onChange={set("currency")} placeholder="USD, SAR, AED…" />
            </Field>
          </div>
          <Field label="Key facts & specifications" htmlFor="f-facts" hint="One per line. Include sizes, materials, ingredients, what's in the box, care instructions, warranty.">
            <Textarea id="f-facts" value={form.facts} onChange={set("facts")} rows={7} />
          </Field>
          <Field label="Target audience" htmlFor="f-aud" optional>
            <Input id="f-aud" value={form.audience} onChange={set("audience")} />
          </Field>
          <Field label="SEO keywords" htmlFor="f-kw" optional>
            <Input id="f-kw" value={form.keywords} onChange={set("keywords")} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
