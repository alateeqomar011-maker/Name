"use client";

import { PlugZap, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/misc";
import type { GenerationDto } from "@/lib/client/api";
import { useApp } from "./app-provider";

export function AiUnavailableBanner({ what = "AI writing" }: { what?: string }) {
  const { me } = useApp();
  if (!me || me.capabilities.anthropic) return null;
  return (
    <div className="mb-6 flex gap-3 rounded-2xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
      <PlugZap className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">{what} isn&apos;t connected on this server</p>
        <p className="mt-0.5 text-warning/90">
          This tool needs the Claude API. An administrator can enable it by setting <code className="rounded bg-white/60 px-1 font-mono text-xs">ANTHROPIC_API_KEY</code>. Nothing will be generated or charged until then.
        </p>
      </div>
    </div>
  );
}

export function GenerationStatus({ generation }: { generation: GenerationDto }) {
  if (!["queued", "running"].includes(generation.status)) return null;
  return (
    <div className="rounded-2xl border border-iris-100 bg-iris-50/60 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-iris-700">
        <RefreshCw className="size-4 animate-spin" /> {generation.stage ?? "Working"}
      </p>
      <Progress value={generation.progress} className="mt-3" />
      <p className="mt-2 text-xs text-iris-700/70">Usually takes 10–40 seconds. You can leave this page — results are saved automatically.</p>
    </div>
  );
}
