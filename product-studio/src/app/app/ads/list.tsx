"use client";

import { Megaphone, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/shell";
import { DesignCanvas } from "@/components/design/design-canvas";
import { LinkButton } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { api, useApi } from "@/lib/client/api";
import type { SavedDesign } from "@/lib/design/export";
import { TEMPLATES } from "@/lib/design/templates";
import { FORMAT_MAP, PLATFORMS } from "@/lib/formats";
import { timeAgo } from "@/lib/utils";

export function AdsList() {
  const { data, mutate, isLoading } = useApi<{ items: SavedDesign[] }>("/api/designs");
  return (
    <div>
      <PageHeader
        title="Ad designer"
        description="Promotional posters, sale banners, launch campaigns and seasonal ads — with editable headlines, prices, discount labels and calls to action."
        actions={
          <LinkButton href="/app/ads/new" variant="accent" icon={<Plus className="size-4" />}>
            New ad
          </LinkButton>
        }
      />
      <h2 className="mb-3 text-sm font-semibold text-muted">Start from a layout</h2>
      <div className="no-scrollbar -mx-1 mb-10 flex gap-3 overflow-x-auto px-1 pb-2">
        {TEMPLATES.map((t) => (
          <Link key={t.id} href={`/app/ads/new?template=${t.id}`} className="group w-40 shrink-0">
            <div className="aspect-[4/5] rounded-2xl border border-line shadow-soft transition group-hover:-translate-y-0.5 group-hover:shadow-lift" style={{ background: t.preview }} />
            <p className="mt-2 text-sm font-semibold">{t.name}</p>
            <p className="line-clamp-2 text-xs text-muted">{t.description}</p>
          </Link>
        ))}
      </div>
      <h2 className="mb-3 text-lg font-semibold">Your designs</h2>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : data?.items.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data.items.map((d) => {
            const f = FORMAT_MAP[d.formatId];
            return (
              <div key={d.id} className="group relative">
                <Link href={`/app/ads/${d.id}`} className="block overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-soft transition hover:shadow-lift">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-subtle">
                    {d.doc ? (
                      <DesignCanvas doc={d.doc} width={d.width} height={d.height} displayWidth={d.width >= d.height ? 200 : (200 * d.width) / d.height} className="rounded-md shadow-soft" />
                    ) : null}
                  </div>
                  <p className="mt-2.5 truncate text-sm font-semibold">{d.name}</p>
                  <p className="text-xs text-muted">
                    {f ? `${PLATFORMS[f.platform].name} · ${f.name}` : `${d.width}×${d.height}`} · {timeAgo(d.updatedAt)}
                  </p>
                </Link>
                <div className="absolute top-5 right-5 opacity-0 transition group-hover:opacity-100">
                  <Menu trigger={<button className="flex size-7 items-center justify-center rounded-full bg-white/90 shadow-soft" aria-label="Design actions"><MoreHorizontal className="size-4" /></button>}>
                    <MenuItem
                      icon={<Trash2 />}
                      danger
                      onSelect={async () => {
                        if (!confirm("Delete this design?")) return;
                        await api(`/api/designs/${d.id}`, { method: "DELETE" });
                        mutate();
                      }}
                    >
                      Delete
                    </MenuItem>
                  </Menu>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Megaphone className="size-6" />} title="No ads yet" description="Pick a layout above or create a new ad from any product photo." action={<LinkButton href="/app/ads/new">Create your first ad</LinkButton>} />
      )}
    </div>
  );
}
