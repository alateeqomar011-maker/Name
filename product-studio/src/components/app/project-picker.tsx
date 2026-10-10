"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, ImageIcon, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi, type ProjectDto } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export function ProjectPicker({
  value,
  onChange,
  className,
  placeholder = "Choose a product",
}: {
  value: string | null;
  onChange: (id: string, project: ProjectDto) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data } = useApi<{ items: ProjectDto[] }>("/api/projects?limit=100");
  const items = useMemo(
    () => (data?.items ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  const current = data?.items.find((p) => p.id === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "flex h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-2.5 text-left shadow-soft transition hover:border-line-strong",
            className,
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-subtle">
            {current?.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-4 text-faint" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium text-muted">Product</span>
            <span className={cn("block truncate text-sm font-semibold", !current && "text-faint")}>{current?.name ?? placeholder}</span>
          </span>
          <ChevronDown className="mr-1 size-4 text-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-72 rounded-2xl border border-line bg-surface p-2 shadow-lift data-[state=open]:animate-fade-in"
        >
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products"
              className="h-9 w-full rounded-xl bg-subtle pr-3 pl-9 text-sm outline-none"
            />
          </div>
          <div className="scrollbar-thin max-h-72 overflow-y-auto">
            {items.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onChange(p.id, p);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-subtle"
              >
                <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-subtle">
                  {p.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt="" className="size-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                {p.id === value && <Check className="size-4 text-iris-600" />}
              </button>
            ))}
            {data && !items.length && <p className="px-2 py-4 text-center text-sm text-muted">No products found.</p>}
          </div>
          <Link href="/app/studio" className="mt-1 flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-iris-600 hover:bg-iris-50">
            <Plus className="size-4" /> Upload a new product
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
