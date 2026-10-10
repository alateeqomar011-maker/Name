"use client";

import { Download, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { downloadUrl, triggerDownload, type AssetDto } from "@/lib/client/api";
import { PLANS } from "@/lib/plans";
import { useApp } from "./app-provider";

export function DownloadMenu({
  asset,
  trigger,
  size = "sm",
}: {
  asset: Pick<AssetDto, "id" | "mime" | "kind" | "width" | "height">;
  trigger?: ReactNode;
  size?: "sm" | "md";
}) {
  const { me, showUpgrade } = useApp();
  const plan = me ? PLANS[me.workspace.plan] : PLANS.free;
  const isDesign = asset.kind === "ad" || asset.kind === "social";
  const max = isDesign ? Math.max(plan.limits.maxExportPx, Math.max(asset.width, asset.height)) : plan.limits.maxExportPx;
  const sizes = Array.from(new Set([max, 2048, 1080].filter((s) => s <= max))).sort((a, b) => b - a);
  const transparent = asset.mime === "image/png";
  const go = (format: "png" | "jpeg" | "webp", s: number) => triggerDownload(downloadUrl(asset.id, format, s));

  return (
    <Menu
      trigger={
        trigger ?? (
          <Button size={size} variant="secondary" icon={<Download className="size-4" />}>
            Download
          </Button>
        )
      }
    >
      <MenuLabel>{transparent ? "PNG keeps transparency" : "Format & size"}</MenuLabel>
      {sizes.map((s) => (
        <MenuItem key={`png-${s}`} onSelect={() => go("png", s)}>
          <span className="flex-1">PNG · {s >= 4096 ? "4K" : `${s}px`}</span>
          {s === max && <span className="text-[11px] text-faint">best</span>}
        </MenuItem>
      ))}
      <MenuItem onSelect={() => go("jpeg", sizes[0])}>JPG · {sizes[0] >= 4096 ? "4K" : `${sizes[0]}px`}</MenuItem>
      <MenuItem onSelect={() => go("webp", sizes[0])}>WebP · {sizes[0] >= 4096 ? "4K" : `${sizes[0]}px`}</MenuItem>
      {plan.limits.watermark && (
        <>
          <MenuSeparator />
          <MenuItem icon={<Lock />} onSelect={() => showUpgrade("Remove the watermark and export in 2K or 4K with a paid plan.", "starter")}>
            <span className="text-xs">Free exports include a watermark</span>
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
