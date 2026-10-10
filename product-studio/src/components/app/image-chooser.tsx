"use client";

import { Check, ImagePlus, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { assetUrl, useApi, type AssetDto } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";
import { Dropzone, uploadWithProgress } from "./upload-dropzone";

type Item = AssetDto & { projectName?: string | null };

/** Pick one or several images from the workspace, or upload a new one. */
export function ImageChooser({
  open,
  onOpenChange,
  onPick,
  kinds = "render,cutout,enhanced,upscaled,angle,bundle,mockup,ad,social,original",
  multiple,
  title = "Choose an image",
  max = 5,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (assets: Item[]) => void;
  kinds?: string;
  multiple?: boolean;
  title?: string;
  max?: number;
}) {
  const { handleError } = useApp();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [picked, setPicked] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const { data, mutate } = useApi<{ items: Item[] }>(open ? `/api/assets?kind=${kinds}&limit=120${q ? `&q=${encodeURIComponent(q)}` : ""}` : null);

  const toggle = (a: Item) => {
    if (!multiple) {
      onPick([a]);
      onOpenChange(false);
      return;
    }
    setPicked((p) => (p.some((x) => x.id === a.id) ? p.filter((x) => x.id !== a.id) : p.length >= max ? p : [...p, a]));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked([]);
      }}
      title={title}
      size="xl"
      footer={
        multiple ? (
          <Button
            disabled={!picked.length}
            onClick={() => {
              onPick(picked);
              setPicked([]);
              onOpenChange(false);
            }}
          >
            Use {picked.length || ""} selected
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "library", label: "Your images" },
            { value: "upload", label: "Upload" },
          ]}
        />
        {tab === "library" && (
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product or style" className="h-9 w-full rounded-xl bg-subtle pr-3 pl-9 text-sm outline-none" />
          </div>
        )}
      </div>
      {tab === "upload" ? (
        <Dropzone
          compact
          disabled={uploading}
          onFiles={async (files) => {
            setUploading(true);
            try {
              const form = new FormData();
              form.append("file", files[0]);
              const res = await uploadWithProgress<{ asset: Item }>("/api/uploads", form, () => {});
              await mutate();
              toggle(res.asset);
              setTab("library");
            } catch (err) {
              handleError(err, "Upload failed");
            } finally {
              setUploading(false);
            }
          }}
        >
          {uploading ? <p className="text-sm text-muted">Uploading…</p> : undefined}
        </Dropzone>
      ) : !data ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : data.items.length ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {data.items.map((a) => {
            const on = picked.some((p) => p.id === a.id);
            return (
              <button key={a.id} onClick={() => toggle(a)} className="text-left">
                <div className={cn("relative aspect-square overflow-hidden rounded-xl border", on ? "border-transparent ring-2 ring-iris-500 ring-offset-2" : "border-line hover:border-line-strong", a.kind === "cutout" ? "bg-checker" : "bg-subtle")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(a.id, 240)} alt="" className="size-full object-contain" loading="lazy" />
                  {on && (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-iris-500 text-white">
                      <Check className="size-3" />
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-[11px] text-muted">{a.projectName ?? a.label ?? a.kind}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-muted">
          <ImagePlus className="mx-auto mb-2 size-6 text-faint" />
          No matching images yet.
        </div>
      )}
    </Dialog>
  );
}
