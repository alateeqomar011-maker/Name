"use client";

import { ChevronDown, LifeBuoy, Mail, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { HELP_SECTIONS } from "./content";

export function HelpCenter({ supportEmail }: { supportEmail: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const sections = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return HELP_SECTIONS;
    return HELP_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => `${i.q} ${i.text}`.toLowerCase().includes(term)) })).filter((s) => s.items.length);
  }, [q]);

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="hidden content-start gap-1 lg:grid">
        {HELP_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-white/60 hover:text-ink">
            {s.title}
          </a>
        ))}
      </nav>
      <div className="min-w-0">
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help articles"
            className="h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-12 text-[15px] shadow-soft outline-none focus:border-iris-300 focus:ring-4 focus:ring-iris-100"
          />
        </div>
        {sections.length === 0 && <p className="text-sm text-muted">No articles match “{q}”. Try other words or contact support below.</p>}
        <div className="grid gap-8">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="mb-3 text-lg font-semibold">{s.title}</h2>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
                {s.items.map((item) => {
                  const key = `${s.id}:${item.q}`;
                  const isOpen = open === key || Boolean(q.trim());
                  return (
                    <div key={key} className="border-t border-line first:border-t-0">
                      <button onClick={() => setOpen(isOpen && !q ? null : key)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium" aria-expanded={isOpen}>
                        {item.q}
                        <ChevronDown className={cn("size-4 shrink-0 text-faint transition", isOpen && "rotate-180")} />
                      </button>
                      {isOpen && <div className="px-5 pb-5 text-sm leading-relaxed text-ink-2">{item.a}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start gap-4 rounded-3xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <LifeBuoy className="size-6 text-iris-300" />
            <div>
              <p className="font-semibold">Still need help?</p>
              <p className="text-sm text-white/70">Our team usually replies within one business day.</p>
            </div>
          </div>
          <a href={`mailto:${supportEmail}`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink">
            <Mail className="size-4" /> {supportEmail}
          </a>
        </div>
      </div>
    </div>
  );
}
