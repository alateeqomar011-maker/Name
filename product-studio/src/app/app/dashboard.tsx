"use client";

import { ArrowRight, Aperture, CheckCircle2, FileText, Megaphone, PlugZap, Share2, Sparkles, Upload, Wand2 } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/components/app/app-provider";
import { ProjectCard } from "@/components/app/project-card";
import { PageHeader } from "@/components/app/shell";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/misc";
import { useApi, type GenerationDto, type ProjectDto } from "@/lib/client/api";
import { GENERATION_TYPES, type GenerationType } from "@/lib/generation-types";
import { PLANS } from "@/lib/plans";
import { cn, timeAgo } from "@/lib/utils";

const ACTIONS = [
  { href: "/app/studio", title: "Product photos", text: "Studio scenes, shadows & reflections", icon: Aperture, tone: "from-[#efeaff] to-[#f7f4ff] text-iris-600" },
  { href: "/app/descriptions", title: "Descriptions", text: "Titles, features & SEO in EN / AR", icon: FileText, tone: "from-[#fff0ea] to-[#fff8f4] text-coral-500" },
  { href: "/app/ads", title: "Ad designer", text: "Posters, sale banners, launches", icon: Megaphone, tone: "from-[#eaf6ff] to-[#f5fbff] text-[#1a7fd1]" },
  { href: "/app/social", title: "Social content", text: "Every size + captions & hashtags", icon: Share2, tone: "from-[#eafaf1] to-[#f5fdf8] text-success" },
];

export function Dashboard() {
  const { me } = useApp();
  const { data: projects, mutate, isLoading } = useApi<{ items: ProjectDto[] }>("/api/projects?limit=8");
  const { data: activity } = useApi<{ items: GenerationDto[] }>("/api/generations?limit=8");
  const firstName = me?.user.name.split(" ")[0];
  const caps = me?.capabilities;
  const services = caps
    ? [
        { label: "AI background removal", ok: caps.backgroundRemoval, note: "Runs locally on this server" },
        { label: "AI writing & product detection", ok: caps.anthropic, note: "Claude" },
        { label: "AI scene generation", ok: caps.aiScenes, note: caps.imageProvider === "openai" ? "OpenAI" : caps.imageProvider === "stability" ? "Stability AI" : "Not connected" },
        { label: "Payments", ok: caps.payments, note: "Stripe" },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Turn a product photo into a full set of marketing content."
        actions={
          <LinkButton href="/app/studio" variant="accent" icon={<Upload className="size-4" />}>
            Upload product
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="group">
            <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
              <span className={cn("flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br", a.tone)}>
                <a.icon className="size-5" />
              </span>
              <p className="mt-4 font-semibold">{a.title}</p>
              <p className="mt-0.5 text-[13px] text-muted">{a.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-ink-2 transition group-hover:gap-2">
                Open <ArrowRight className="size-3.5" />
              </span>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent products</h2>
            <Link href="/app/gallery" className="text-sm font-medium text-iris-600 hover:underline">
              View gallery
            </Link>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5]" />
              ))}
            </div>
          ) : projects?.items.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {projects.items.map((p) => (
                <ProjectCard key={p.id} project={p} onChange={() => mutate()} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Sparkles className="size-6" />}
              title="Create your first product shot"
              description="Upload any product photo — even from your phone. We'll remove the background and stage it in a professional studio scene."
              action={
                <LinkButton href="/app/studio" variant="accent" icon={<Upload className="size-4" />}>
                  Upload a photo
                </LinkButton>
              }
            />
          )}
        </section>

        <aside className="grid content-start gap-6">
          {me && (
            <Card className="p-5">
              <p className="text-sm text-muted">Credits this month</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {me.workspace.credits}
                <span className="ml-1 text-sm font-normal text-muted">available</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {PLANS[me.workspace.plan].name} plan · {me.workspace.monthlyCredits} monthly credits
              </p>
              <LinkButton href="/app/billing" variant="secondary" size="sm" className="mt-4 w-full">
                Manage plan & credits
              </LinkButton>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            {activity?.items.length ? (
              <ul className="mt-3 space-y-3">
                {activity.items.slice(0, 6).map((g) => (
                  <li key={g.id} className="flex items-center gap-3 text-[13px]">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        g.status === "succeeded" ? "bg-success" : g.status === "failed" ? "bg-danger" : "animate-pulse bg-iris-500",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{GENERATION_TYPES[g.type as GenerationType]?.label ?? g.type}</span>
                    <span className="text-xs text-faint">{timeAgo(g.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-muted">Your generations will show up here.</p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Wand2 className="size-4 text-iris-600" /> AI services
            </h3>
            <ul className="mt-3 space-y-2.5">
              {services.map((s) => (
                <li key={s.label} className="flex items-start gap-2.5 text-[13px]">
                  {s.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <PlugZap className="mt-0.5 size-4 shrink-0 text-warning" />}
                  <span>
                    <span className="block">{s.label}</span>
                    <span className="block text-xs text-muted">{s.ok ? s.note : "Not connected on this server"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
