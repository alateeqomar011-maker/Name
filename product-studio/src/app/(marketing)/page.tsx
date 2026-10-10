import {
  Aperture,
  ArrowRight,
  Boxes,
  Check,
  Expand,
  FileText,
  Globe2,
  Languages,
  Layers3,
  LayoutGrid,
  Megaphone,
  Palette,
  Rocket,
  Rotate3d,
  ScanSearch,
  Scissors,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Upload,
  Wand2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { HELP_SECTIONS } from "@/components/help/content";
import { LiveTemplates } from "@/components/marketing/live-templates";
import { PricingTable } from "@/components/marketing/pricing-table";
import { TransformationShowcase } from "@/components/marketing/showcase";
import { PLANS } from "@/lib/plans";
import { SAMPLES } from "@/lib/samples";

export const metadata: Metadata = {
  title: "Vitrine — AI Product Studio for online sellers",
  description: "Turn ordinary product photos into studio-quality images, ads, product descriptions and social media content in minutes. English & Arabic.",
};

const FAQ_IDS = ["Will my product be changed or redrawn?", "Will the AI invent specifications?", "Does Vitrine post to my social accounts?", "How do credits work?", "Which languages are supported?"];

export default function LandingPage() {
  const faqs = HELP_SECTIONS.flatMap((s) => s.items).filter((i) => FAQ_IDS.includes(i.q));
  const gallery = SAMPLES.flatMap((s) => s.renders.slice(0, 4).map((r) => ({ ...r, product: s.name })));

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(109,91,255,0.10),transparent_60%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16 lg:pb-28">
          <div className="animate-rise">
            <Badge tone="iris" className="mb-6 px-3 py-1 text-xs">
              <Sparkles className="size-3.5" /> AI product studio for online sellers
            </Badge>
            <h1 className="font-display text-[52px] leading-[0.98] tracking-tight sm:text-7xl xl:text-[84px]">
              Ordinary photos.
              <br />
              <span className="text-gradient italic">Extraordinary</span> listings.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Upload one product photo. Get studio-quality images, scroll-stopping ads, persuasive descriptions in English and Arabic, and posts sized for every platform — in minutes.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/signup" size="lg" variant="accent" icon={<Upload className="size-4" />}>
                Start free — {PLANS.free.limits.monthlyCredits} credits/month
              </LinkButton>
              <LinkButton href="/pricing" size="lg" variant="secondary">
                See pricing
              </LinkButton>
            </div>
            <ul className="mt-8 grid gap-2.5 text-sm text-ink-2 sm:grid-cols-2">
              {["No card required", "Your product stays pixel-perfect", "English & Arabic copy", "Every platform size, ready to post"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-success" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-[460px] lg:max-w-none">
            <TransformationShowcase />
            <p className="mt-3 text-center text-[11px] text-faint">
              Every “after” is real Vitrine output. Sample products are 3D-rendered stand-ins plus one real photo.
            </p>
          </div>
        </div>
      </section>

      {/* ── Preservation promise ───────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Your product, untouched", text: "Studio styles never redraw your product. Original pixels are cut out and staged — logos, labels and colors stay exactly as photographed." },
            { icon: Scissors, title: "Precise AI cut-outs", text: "Edge-aware background removal with color decontamination, so products sit naturally on any backdrop — even fine edges." },
            { icon: ScanSearch, title: "Honest AI", text: "Copy is written only from your facts and what's visible. If an AI service isn't connected, Vitrine says so — it never fakes a result." },
          ].map((f) => (
            <div key={f.title}>
              <span className="flex size-11 items-center justify-center rounded-2xl bg-iris-50 text-iris-600">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Studio gallery ─────────────────────────────────── */}
      <section id="studio" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="neutral">
            <Aperture className="size-3.5" /> Photo studio
          </Badge>
          <h2 className="mt-4 font-display text-5xl tracking-tight sm:text-6xl">A studio for every product</h2>
          <p className="mt-4 text-muted">
            Marketplace white, minimal sweeps, luxury, pastel podiums, textures and seasonal sets — with soft contact shadows, cast shadows and floor reflections built from your product&apos;s own silhouette. Add AI-generated outdoor and lifestyle scenes when you need them.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {gallery.map((g, i) => (
            <figure key={`${g.src}-${i}`} className="group relative overflow-hidden rounded-2xl bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.src} alt={`${g.product} — ${g.name}`} loading="lazy" className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
              <figcaption className="absolute inset-x-2 bottom-2 rounded-lg bg-white/85 px-2 py-1 text-[11px] font-medium opacity-0 backdrop-blur transition group-hover:opacity-100">
                {g.name}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { icon: Layers3, title: "Variations in one click", text: "Generate up to four variations of a style — different palettes, scale and composition." },
            { icon: Expand, title: "Export up to 4K", text: "Renders are re-created at full resolution for download — crisp backdrops at any size." },
            { icon: Wand2, title: "AI scenes, product preserved", text: "Outdoor and lifestyle scenes are generated around your product, then your original pixels go back on top." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface p-5">
              <f.icon className="size-5 text-iris-600" />
              <p className="mt-3 font-semibold">{f.title}</p>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ads & social ───────────────────────────────────── */}
      <section id="create" className="scroll-mt-20 bg-ink py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-end gap-8 lg:grid-cols-2">
            <div>
              <Badge tone="dark" className="bg-white/10">
                <Megaphone className="size-3.5" /> Ad designer & social creator
              </Badge>
              <h2 className="mt-4 font-display text-5xl tracking-tight sm:text-6xl">One product. Every platform.</h2>
            </div>
            <p className="text-white/70">
              Promotional posters, sale banners, launches and seasonal campaigns with editable headlines, prices, discount badges and calls to action. Instagram, TikTok, Snapchat, Facebook, X, Pinterest, LinkedIn and your store — each in its exact size, with Arabic typography that renders right-to-left.
            </p>
          </div>
          <div className="mt-14">
            <LiveTemplates />
          </div>
          <p className="mt-4 text-center text-xs text-white/50">These are Vitrine&apos;s real templates, rendered live in your browser.</p>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { icon: LayoutGrid, title: "9 pro layouts", text: "Spotlight, split panel, mega sale, minimal luxe, festive night and more." },
              { icon: Palette, title: "Brand kits", text: "Apply your palette and fonts to any layout in one click." },
              { icon: Globe2, title: "Captions & hashtags", text: "Platform-specific captions, hooks and hashtags — copy or download with images." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <f.icon className="size-5 text-iris-300" />
                <p className="mt-3 font-semibold">{f.title}</p>
                <p className="mt-1 text-sm text-white/60">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Copy ───────────────────────────────────────────── */}
      <section id="copy" className="mx-auto grid max-w-7xl scroll-mt-20 items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div>
          <Badge tone="neutral">
            <FileText className="size-3.5" /> Product descriptions
          </Badge>
          <h2 className="mt-4 font-display text-5xl tracking-tight sm:text-6xl">Listings that sell — and stay true</h2>
          <p className="mt-4 text-muted">
            Titles, persuasive descriptions, features, benefits, specifications and SEO metadata in six writing styles. Vitrine writes only from the facts you provide and what&apos;s visible in your photo, and tells you what to add instead of inventing it.
          </p>
          <ul className="mt-6 grid gap-3 text-sm">
            {[
              { icon: Languages, t: "Native English and Arabic — written, not translated" },
              { icon: ShieldCheck, t: "Never invents specs, certifications or claims" },
              { icon: Rocket, t: "Optimized for Amazon, Noon, Shopify and Instagram Shop" },
            ].map((x) => (
              <li key={x.t} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-xl bg-iris-50 text-iris-600">
                  <x.icon className="size-4" />
                </span>
                {x.t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-lift">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Badge tone="iris">Luxury</Badge>
              <Badge tone="neutral">Amazon</Badge>
            </div>
            <span className="text-[11px] text-faint">Layout preview</span>
          </div>
          <div className="mt-5 space-y-4">
            {[
              ["Product title", "3 options, each from a different angle"],
              ["Description", "Short paragraphs in your chosen tone and length"],
              ["Key features & benefits", "Grounded in your facts and visible details"],
              ["Specifications", "Only what you provided — never guessed"],
              ["SEO", "Meta title (60), meta description (155), keywords, URL slug"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-subtle p-4">
                <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{k}</p>
                <p className="mt-1 text-sm">{v}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-gold-400/40 bg-[#fdf8ee] p-4 text-sm text-[#7a4f0f]">
              <p className="font-semibold">Make this listing stronger</p>
              <p className="mt-1 text-[13px]">Missing details — like dimensions or care instructions — are listed for you to add, instead of being made up.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tools ──────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center font-display text-5xl tracking-tight sm:text-6xl">Advanced AI tools</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted">Built on the same product-preserving pipeline, for everything else your catalog needs.</p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Scissors, t: "Background remover & replacer" },
              { icon: SunMedium, t: "Photo enhancer" },
              { icon: Expand, t: "Image upscaler (standard & AI)" },
              { icon: Wand2, t: "AI scene generator" },
              { icon: LayoutGrid, t: "Mockup creator" },
              { icon: Boxes, t: "Bundle image creator" },
              { icon: Rotate3d, t: "Angle generator (AI-reimagined)" },
              { icon: Palette, t: "AI brand kit" },
              { icon: Layers3, t: "Batch processing (50 per run)" },
              { icon: Rocket, t: "Campaign generator" },
              { icon: Languages, t: "Arabic & English everywhere" },
              { icon: Megaphone, t: "Platform-perfect exports" },
            ].map((x) => (
              <div key={x.t} className="flex items-center gap-3 rounded-2xl border border-line p-4">
                <x.icon className="size-5 text-iris-600" />
                <span className="text-sm font-medium">{x.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <h2 className="text-center font-display text-5xl tracking-tight sm:text-6xl">From photo to campaign in three steps</h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", t: "Upload a product photo", d: "Any photo, even from your phone. Vitrine removes the background and identifies the product." },
            { n: "02", t: "Pick a style", d: "Stage it in studio scenes or AI environments. Generate variations and compare before/after." },
            { n: "03", t: "Create & export", d: "Write descriptions, design ads and social posts in every size — then download everything." },
          ].map((s) => (
            <div key={s.n} className="rounded-3xl border border-line bg-surface p-7 shadow-soft">
              <p className="font-display text-5xl text-iris-500">{s.n}</p>
              <p className="mt-4 text-lg font-semibold">{s.t}</p>
              <p className="mt-1.5 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-20 bg-[#efede8] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center font-display text-5xl tracking-tight sm:text-6xl">Simple, credit-based pricing</h2>
          <p className="mx-auto mt-4 mb-10 max-w-xl text-center text-muted">Start free with {PLANS.free.limits.monthlyCredits} credits every month. Upgrade when you need more — cancel anytime.</p>
          <PricingTable />
          <p className="mt-8 text-center text-sm text-muted">
            Need more? One-time credit packs never expire.{" "}
            <Link href="/pricing" className="font-semibold text-ink underline-offset-4 hover:underline">
              Compare plans in detail
            </Link>
          </p>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <h2 className="text-center font-display text-5xl tracking-tight">Questions, answered</h2>
        <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface">
          {faqs.map((f) => (
            <details key={f.q} className="group border-t border-line first:border-t-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15px] font-medium">
                {f.q}
                <span className="text-xl text-faint transition group-open:rotate-45">+</span>
              </summary>
              <div className="px-6 pb-6 text-sm leading-relaxed text-ink-2">{f.a}</div>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          More in the{" "}
          <Link href="/help" className="font-semibold text-ink hover:underline">
            help center
          </Link>
          .
        </p>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="grain relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-ink px-6 py-16 text-center text-white sm:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(109,91,255,0.5),transparent_50%),radial-gradient(circle_at_85%_90%,rgba(255,122,89,0.4),transparent_45%)]" />
          <div className="relative">
            <h2 className="font-display text-5xl tracking-tight sm:text-6xl">Your next bestseller deserves better photos.</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">Create your free studio in under a minute. No card required.</p>
            <LinkButton href="/signup" size="lg" className="mt-8 bg-white text-ink hover:bg-white/90" icon={<ArrowRight className="size-4" />}>
              Start creating for free
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
