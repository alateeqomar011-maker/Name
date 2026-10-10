"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { startGeneration, useGeneration, type GenerationDto } from "./api";

/** Keeps the selected product in the URL (?project=...) so pages are linkable. */
export function useProjectParam(): [string | null, (id: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get("project");
  const set = useCallback(
    (id: string) => {
      const q = new URLSearchParams(params.toString());
      q.set("project", id);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return [value, set];
}

/** Starts a generation and tracks it until it finishes. */
export function useRunner(onDone?: (g: GenerationDto) => void) {
  const { handleError, refreshMe } = useApp();
  const [id, setId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { data } = useGeneration(id, (g) => {
    refreshMe();
    if (g.status === "failed") handleError(new Error(g.error ?? "Generation failed"), "Generation failed");
    onDone?.(g);
  });
  const run = useCallback(
    async (type: string, projectId: string | null, params: Record<string, unknown>) => {
      setStarting(true);
      try {
        const g = await startGeneration(type, projectId, params);
        setId(g.id);
        refreshMe();
        return g;
      } catch (err) {
        handleError(err, "Couldn't start");
        return null;
      } finally {
        setStarting(false);
      }
    },
    [handleError, refreshMe],
  );
  const generation = data?.generation ?? null;
  const busy = starting || (generation ? ["queued", "running"].includes(generation.status) : false);
  return { run, generation, busy, reset: () => setId(null) };
}
