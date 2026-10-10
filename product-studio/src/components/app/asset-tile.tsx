"use client";

import { Download, Megaphone, MoreHorizontal, Star, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Badge } from "@/components/ui/misc";
import { api, assetUrl, downloadUrl, triggerDownload, type AssetDto } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  render: "Studio",
  cutout: "Cut-out",
  enhanced: "Enhanced",
  upscaled: "Upscaled",
  angle: "AI angle",
  mockup: "Mockup",
  bundle: "Bundle",
  ad: "Ad",
  social: "Social",
  original: "Original",
  scene: "Scene",
};

export function AssetTile({
  asset,
  selected,
  onSelect,
  onChange,
  showProject,
  className,
}: {
  asset: AssetDto & { projectName?: string | null };
  selected?: boolean;
  onSelect?: () => void;
  onChange?: () => void;
  showProject?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const meta = asset.meta as { styleName?: string; aiScene?: boolean; aiGenerated?: boolean };
  const transparent = asset.mime === "image/png" && ["cutout", "angle"].includes(asset.kind);
  const toggleFav = async () => {
    await api(`/api/assets/${asset.id}`, { method: "PATCH", json: { favorite: !asset.favorite } });
    onChange?.();
  };
  const remove = async () => {
    if (!confirm("Delete this image permanently?")) return;
    await api(`/api/assets/${asset.id}`, { method: "DELETE" });
    onChange?.();
  };
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-surface transition",
        selected ? "border-iris-400 ring-2 ring-iris-200" : "border-line hover:border-line-strong hover:shadow-soft",
        className,
      )}
    >
      <button onClick={onSelect} className="block w-full text-left" aria-label={`Open ${asset.label ?? "image"}`}>
        <div className={cn("relative aspect-square overflow-hidden", transparent ? "bg-checker" : "bg-subtle")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(asset.id, 480)} alt={asset.label ?? ""} loading="lazy" className="size-full object-contain" />
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          <p className="min-w-0 flex-1 truncate text-xs font-medium">{showProject && asset.projectName ? asset.projectName : (meta.styleName ?? asset.label ?? KIND_LABEL[asset.kind])}</p>
          {(meta.aiScene || meta.aiGenerated) && <Badge tone="iris">AI</Badge>}
        </div>
      </button>
      <div className="absolute top-2 left-2">
        <Badge tone="neutral" className="bg-white/90 backdrop-blur">
          {KIND_LABEL[asset.kind] ?? asset.kind}
        </Badge>
      </div>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
        <button
          onClick={toggleFav}
          className={cn("flex size-7 items-center justify-center rounded-full bg-white/90 shadow-soft backdrop-blur", asset.favorite ? "text-gold-400" : "text-muted hover:text-ink")}
          aria-label="Favorite"
        >
          <Star className={cn("size-3.5", asset.favorite && "fill-current")} />
        </button>
        <Menu
          trigger={
            <button className="flex size-7 items-center justify-center rounded-full bg-white/90 text-ink-2 shadow-soft backdrop-blur" aria-label="Image actions">
              <MoreHorizontal className="size-3.5" />
            </button>
          }
        >
          <MenuItem icon={<Download />} onSelect={() => triggerDownload(downloadUrl(asset.id))}>
            Download
          </MenuItem>
          <MenuItem icon={<Megaphone />} onSelect={() => router.push(`/app/ads/new?asset=${asset.id}${asset.projectId ? `&project=${asset.projectId}` : ""}`)}>
            Use in an ad
          </MenuItem>
          <MenuItem icon={<Wand2 />} onSelect={() => router.push(`/app/tools/enhance?asset=${asset.id}`)}>
            Enhance / upscale
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={remove}>
            Delete
          </MenuItem>
        </Menu>
      </div>
      {asset.favorite && (
        <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-white/90 text-gold-400 shadow-soft group-hover:hidden max-sm:hidden">
          <Star className="size-3.5 fill-current" />
        </span>
      )}
    </div>
  );
}
