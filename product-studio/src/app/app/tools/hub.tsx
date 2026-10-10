"use client";

import { ArrowUpRight, Boxes, CircleDashed, Expand, Layers3, LayoutGrid, Lock, Palette, PlugZap, Rocket, Rotate3d, Scissors, Sparkles, SunMedium, Wand2 } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/components/app/app-provider";
import { PageHeader } from "@/components/app/shell";
import { Badge, Card } from "@/components/ui/misc";
import type { Me } from "@/lib/client/api";
import { PLANS, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface Tool {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: typeof Wand2;
  plan: PlanId;
  requires?: keyof Me["capabilities"];
  cost: string;
}

const TOOLS: Tool[] = [
  { id: "background", name: "Background remover & replacer", description: "Precise AI cut-outs with clean edges, then 20+ studio backdrops.", href: "/app/studio", icon: Scissors, plan: "free", requires: "backgroundRemoval", cost: "1 credit" },
  { id: "enhance", name: "Photo enhancer", description: "Auto exposure, white balance, clarity and gentle noise reduction.", href: "/app/tools/enhance", icon: SunMedium, plan: "free", cost: "1 credit" },
  { id: "upscale", name: "Image upscaler", description: "2× / 4× high-quality upscaling, plus AI upscaling for extra detail.", href: "/app/tools/enhance?tab=upscale", icon: Expand, plan: "free", cost: "1–3 credits" },
  { id: "scenes", name: "AI scene generator", description: "Outdoor and lifestyle scenes generated around your untouched product.", href: "/app/studio", icon: Wand2, plan: "free", requires: "aiScenes", cost: "4 credits" },
  { id: "mockups", name: "Mockup creator", description: "Show your images in a phone feed, a story, a store page or a framed print.", href: "/app/tools/mockups", icon: LayoutGrid, plan: "pro", cost: "1 credit" },
  { id: "bundle", name: "Bundle image creator", description: "Group 2–5 products into one cohesive bundle or gift-set image.", href: "/app/tools/bundle", icon: Boxes, plan: "pro", cost: "2 credits" },
  { id: "angles", name: "Angle generator", description: "AI-reimagined views (¾, side, back) from a single photo — review before use.", href: "/app/tools/angles", icon: Rotate3d, plan: "pro", requires: "angles", cost: "5 credits / angle" },
  { id: "brand-kit", name: "AI brand kit", description: "Palette, fonts, voice, taglines and bio — applied across your designs.", href: "/app/tools/brand-kit", icon: Palette, plan: "pro", requires: "anthropic", cost: "3 credits" },
  { id: "campaign", name: "Campaign generator", description: "A coordinated multi-day campaign: big idea, schedule, posts and visuals.", href: "/app/tools/campaign", icon: Rocket, plan: "pro", requires: "anthropic", cost: "5 credits" },
  { id: "batch", name: "Batch processing", description: "Up to 50 photos per run: background removal + one studio style each.", href: "/app/tools/batch", icon: Layers3, plan: "business", cost: "2 credits / photo" },
];

const RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, business: 3 };

export function ToolsHub() {
  const { me } = useApp();
  return (
    <div>
      <PageHeader title="AI tools" description="Advanced tools built on the same product-preserving pipeline as the studio." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((t) => {
          const locked = me ? RANK[me.workspace.plan] < RANK[t.plan] : false;
          const offline = me && t.requires ? !me.capabilities[t.requires] : false;
          return (
            <Link key={t.id} href={t.href} className="group">
              <Card className={cn("flex h-full flex-col p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lift", offline && "opacity-80")}>
                <div className="flex items-start justify-between">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#efeaff,#fff1ec)] text-iris-600">
                    <t.icon className="size-5" />
                  </span>
                  {offline ? (
                    <Badge tone="warning">
                      <PlugZap className="size-3" /> Not connected
                    </Badge>
                  ) : locked ? (
                    <Badge tone="iris">
                      <Lock className="size-3" /> {PLANS[t.plan].name}
                    </Badge>
                  ) : (
                    <Badge tone="success">
                      <CircleDashed className="size-3" /> Ready
                    </Badge>
                  )}
                </div>
                <p className="mt-4 flex items-center gap-1 font-semibold">
                  {t.name}
                  <ArrowUpRight className="size-4 text-faint opacity-0 transition group-hover:opacity-100" />
                </p>
                <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{t.description}</p>
                <p className="mt-4 flex items-center gap-1 text-xs text-faint">
                  <Sparkles className="size-3" /> {t.cost}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
