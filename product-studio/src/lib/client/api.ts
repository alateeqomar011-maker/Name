"use client";

import useSWR, { type SWRConfiguration } from "swr";
import type { AssetDto } from "@/server/assets";
import type { GenerationDto } from "@/server/generations";
import type { ProjectDto } from "@/server/projects";
import type { PlanId, PlanLimits } from "@/lib/plans";

export type { AssetDto, GenerationDto, ProjectDto };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function parse(res: Response) {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: string } } | null)?.error;
    const { message, code, ...rest } = (err ?? {}) as Record<string, unknown>;
    throw new ApiError(
      (message as string) ?? (res.status === 413 ? "That file is too large." : `Request failed (${res.status})`),
      res.status,
      code as string | undefined,
      rest,
    );
  }
  return body;
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  return (await parse(res)) as T;
}

export const fetcher = (url: string) => api(url);

export function useApi<T>(url: string | null, config?: SWRConfiguration) {
  return useSWR<T>(url, fetcher as (u: string) => Promise<T>, { revalidateOnFocus: false, ...config });
}

export interface Me {
  user: { id: string; name: string; email: string; preferences: { defaultLanguage?: "en" | "ar"; defaultTone?: string; emailUpdates?: boolean } };
  workspace: {
    id: string;
    name: string;
    plan: PlanId;
    role: "owner" | "admin" | "member";
    planCredits: number;
    bonusCredits: number;
    credits: number;
    monthlyCredits: number;
    creditsResetAt: string;
    limits: PlanLimits;
  };
  workspaces: { id: string; name: string; plan: string; role: string }[];
  capabilities: {
    backgroundRemoval: boolean;
    anthropic: boolean;
    imageProvider: "openai" | "stability" | null;
    aiScenes: boolean;
    aiUpscale: boolean;
    angles: boolean;
    payments: boolean;
    email: boolean;
  };
}

export function useMe() {
  return useApi<Me>("/api/me", { revalidateOnFocus: true });
}

const TERMINAL = new Set(["succeeded", "failed", "canceled"]);

export function isTerminal(status: string) {
  return TERMINAL.has(status);
}

/** Polls a generation until it finishes. */
export function useGeneration(id: string | null, onDone?: (g: GenerationDto) => void) {
  return useSWR<{ generation: GenerationDto }>(id ? `/api/generations/${id}` : null, fetcher as never, {
    refreshInterval: (data) => (data && isTerminal(data.generation.status) ? 0 : 900),
    revalidateOnFocus: false,
    onSuccess: (data) => {
      if (isTerminal(data.generation.status)) onDone?.(data.generation);
    },
  });
}

export async function startGeneration(type: string, projectId: string | null, params: Record<string, unknown>) {
  const res = await api<{ generation: GenerationDto }>("/api/generations", { method: "POST", json: { type, projectId, params } });
  return res.generation;
}

/** Waits for a generation to finish (for flows that chain steps). */
export async function waitForGeneration(id: string, onProgress?: (g: GenerationDto) => void): Promise<GenerationDto> {
  for (;;) {
    const { generation } = await api<{ generation: GenerationDto }>(`/api/generations/${id}`);
    onProgress?.(generation);
    if (isTerminal(generation.status)) return generation;
    await new Promise((r) => setTimeout(r, 900));
  }
}

export function assetUrl(id: string, w = 1024) {
  return `/api/assets/${id}/file?w=${w}`;
}

export function downloadUrl(id: string, format?: "png" | "jpeg" | "webp", size?: number) {
  const q = new URLSearchParams();
  if (format) q.set("format", format);
  if (size) q.set("size", String(size));
  return `/api/assets/${id}/download${q.size ? `?${q}` : ""}`;
}

export async function downloadZip(assetIds: string[], captions?: Record<string, string>, format?: "png" | "jpeg") {
  const res = await fetch("/api/exports/zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetIds, captions, format }),
  });
  if (!res.ok) await parse(res);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "vitrine-export.zip";
  triggerDownload(URL.createObjectURL(blob), name);
}

export function triggerDownload(href: string, filename?: string) {
  const a = document.createElement("a");
  a.href = href;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
