"use client";

import { Check } from "lucide-react";
import { Select } from "@/components/ui/field";
import { assetUrl, useApi, type AssetDto } from "@/lib/client/api";
import type { BrandKitRow } from "@/lib/design/brand";
import { FORMATS, PLATFORMS, type Format, type PlatformId } from "@/lib/formats";
import { cn } from "@/lib/utils";

/** Grid of a project's usable images (cut-out first). */
export function ProjectImagePicker({
  projectId,
  value,
  onChange,
  kinds = ["cutout", "render", "angle", "bundle", "enhanced", "upscaled"],
}: {
  projectId: string | null;
  value: string | null;
  onChange: (asset: AssetDto) => void;
  kinds?: string[];
}) {
  const { data } = useApi<{ assets: AssetDto[] }>(projectId ? `/api/projects/${projectId}` : null);
  const items = (data?.assets ?? [])
    .filter((a) => kinds.includes(a.kind))
    .sort((a, b) => (a.kind === "cutout" ? -1 : b.kind === "cutout" ? 1 : 0));
  if (!projectId) return <p className="text-sm text-muted">Choose a product first.</p>;
  if (data && !items.length) return <p className="text-sm text-muted">This product has no processed images yet — open it in the Photo Studio first.</p>;
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {items.map((a) => (
        <button
          key={a.id}
          onClick={() => onChange(a)}
          className={cn(
            "relative aspect-square overflow-hidden rounded-xl border transition",
            value === a.id ? "border-transparent ring-2 ring-iris-500 ring-offset-2" : "border-line hover:border-line-strong",
            a.kind === "cutout" ? "bg-checker" : "bg-subtle",
          )}
          title={a.kind === "cutout" ? "Cut-out (transparent)" : (a.label ?? a.kind)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(a.id, 240)} alt="" className="size-full object-contain" />
          {a.kind === "cutout" && <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1 text-[9px] font-semibold text-white">CUT-OUT</span>}
          {value === a.id && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-iris-500 text-white">
              <Check className="size-3" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function AspectIcon({ f, active }: { f: Format; active: boolean }) {
  const max = 26;
  const w = f.width >= f.height ? max : (max * f.width) / f.height;
  const h = f.height >= f.width ? max : (max * f.height) / f.width;
  return (
    <span className="flex size-8 items-center justify-center">
      <span className={cn("rounded-[3px] border-2", active ? "border-iris-500 bg-iris-100" : "border-line-strong")} style={{ width: w, height: h }} />
    </span>
  );
}

/** Single or multi-select of platform formats. */
export function FormatPicker({
  value,
  onChange,
  multiple,
  platforms,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  platforms?: PlatformId[];
}) {
  const groups = (Object.keys(PLATFORMS) as PlatformId[]).filter((p) => !platforms || platforms.includes(p));
  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div className="grid gap-4">
      {groups.map((p) => (
        <div key={p}>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <span className="size-2 rounded-full" style={{ background: PLATFORMS[p].color }} />
            {PLATFORMS[p].name}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {FORMATS.filter((f) => f.platform === p).map((f) => {
              const active = value.includes(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggle(f.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition",
                    active ? "border-iris-300 bg-iris-50/60" : "border-line hover:border-line-strong",
                  )}
                >
                  <AspectIcon f={f} active={active} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{f.name}</span>
                    <span className="block text-[10px] text-faint">
                      {f.width}×{f.height}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrandKitSelect({ value, onChange }: { value: string | null; onChange: (kit: BrandKitRow | null) => void }) {
  const { data } = useApi<{ items: BrandKitRow[] }>("/api/brand-kits");
  if (!data?.items.length) return null;
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(data.items.find((k) => k.id === e.target.value) ?? null)}>
      <option value="">Template colors</option>
      {data.items.map((k) => (
        <option key={k.id} value={k.id}>
          Brand kit: {k.name}
        </option>
      ))}
    </Select>
  );
}
