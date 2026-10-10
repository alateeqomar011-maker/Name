"use client";

import { ArrowLeft, ImagePlus, Lock, PlugZap, Replace } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { assetUrl, useApi, type AssetDto, type Me } from "@/lib/client/api";
import { PLANS, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";
import { BeforeAfter } from "./before-after";
import { DownloadMenu } from "./download-menu";
import { ImageChooser } from "./image-chooser";

const RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, business: 3 };

export function ToolFrame({
  title,
  description,
  plan = "free",
  requires,
  requiresLabel,
  children,
}: {
  title: string;
  description: string;
  plan?: PlanId;
  requires?: keyof Me["capabilities"];
  requiresLabel?: string;
  children: ReactNode;
}) {
  const { me } = useApp();
  const locked = me ? RANK[me.workspace.plan] < RANK[plan] : false;
  const offline = me && requires ? !me.capabilities[requires] : false;
  return (
    <div>
      <Link href="/app/tools" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> AI tools
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">{description}</p>
      </div>
      {offline && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
          <PlugZap className="mt-0.5 size-5 shrink-0" />
          <p>
            <span className="font-semibold">Not connected on this server.</span> {requiresLabel ?? "This tool needs an AI provider that hasn't been configured."} Nothing will be charged.
          </p>
        </div>
      )}
      {locked && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-iris-100 bg-iris-50/70 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-iris-700">
            <Lock className="size-4" /> This tool is included in the {PLANS[plan].name}
            {plan === "pro" ? " and Business" : ""} plan.
          </p>
          <LinkButton href="/app/billing" size="sm" variant="accent">
            See plans
          </LinkButton>
        </div>
      )}
      {children}
    </div>
  );
}

/** Shows the chosen input image with a button to change it. */
export function InputImage({
  asset,
  onPick,
  kinds,
  label = "Choose an image",
}: {
  asset: AssetDto | null;
  onPick: (a: AssetDto) => void;
  kinds?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {asset ? (
        <div className="group relative overflow-hidden rounded-2xl border border-line">
          <div className={cn("flex aspect-square items-center justify-center", asset.mime === "image/png" ? "bg-checker" : "bg-subtle")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(asset.id, 800)} alt="" className="max-h-full max-w-full object-contain" />
          </div>
          <Button size="sm" variant="secondary" className="absolute right-3 bottom-3" icon={<Replace className="size-4" />} onClick={() => setOpen(true)}>
            Change
          </Button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="flex aspect-square w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong bg-surface/70 text-sm text-muted transition hover:border-iris-300 hover:text-ink">
          <ImagePlus className="mb-2 size-7 text-iris-500" />
          {label}
        </button>
      )}
      <ImageChooser open={open} onOpenChange={setOpen} kinds={kinds} onPick={(a) => onPick(a[0])} />
    </>
  );
}

export function useAsset(id: string | null) {
  return useApi<{ asset: AssetDto }>(id ? `/api/assets/${id}` : null);
}

/** Result view: before/after against the source plus download. */
export function ResultView({ source, resultId }: { source: AssetDto | null; resultId: string }) {
  const { data } = useAsset(resultId);
  const result = data?.asset;
  if (!result) return <div className="skeleton aspect-square rounded-2xl" />;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{result.label ?? "Result"}</p>
          <p className="text-xs text-muted">
            {result.width}×{result.height}
            {source ? ` · from ${source.width}×${source.height}` : ""}
          </p>
        </div>
        <DownloadMenu asset={result} />
      </div>
      {source ? (
        <BeforeAfter before={assetUrl(source.id, 1600)} after={assetUrl(result.id, 1600)} aspect={result.width / result.height} checker={result.mime === "image/png"} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(result.id, 1600)} alt="" className="w-full rounded-2xl" />
      )}
    </Card>
  );
}
