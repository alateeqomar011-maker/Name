"use client";

import { renderDesignBlob } from "@/components/design/design-canvas";
import { api, downloadUrl, triggerDownload, type AssetDto } from "@/lib/client/api";
import type { DesignDoc } from "./types";

export interface SavedDesign {
  id: string;
  name: string;
  formatId: string;
  width: number;
  height: number;
  projectId: string | null;
  doc?: DesignDoc;
  thumbnailUrl: string | null;
  updatedAt: string;
}

export async function createDesign(input: {
  name: string;
  formatId: string;
  width: number;
  height: number;
  projectId: string | null;
  doc: DesignDoc;
}): Promise<SavedDesign> {
  const res = await api<{ design: SavedDesign }>("/api/designs", { method: "POST", json: input });
  return res.design;
}

/** Renders the design in the browser and stores it as a gallery asset (server applies plan rules on download). */
export async function exportDesign(
  design: { id: string; width: number; height: number },
  doc: DesignDoc,
  kind: "ad" | "social",
  opts: { thumbnail?: boolean } = {},
): Promise<AssetDto> {
  const blob = await renderDesignBlob(doc, design.width, design.height);
  const form = new FormData();
  form.append("file", new File([blob], "design.png", { type: "image/png" }));
  form.append("kind", kind);
  if (opts.thumbnail) form.append("thumbnail", "1");
  const res = await fetch(`/api/designs/${design.id}/export`, { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? "Export failed");
  return body.asset as AssetDto;
}

export async function exportAndDownload(
  design: { id: string; width: number; height: number },
  doc: DesignDoc,
  kind: "ad" | "social",
  format: "png" | "jpeg" = "png",
) {
  const asset = await exportDesign(design, doc, kind, { thumbnail: true });
  triggerDownload(downloadUrl(asset.id, format));
  return asset;
}
