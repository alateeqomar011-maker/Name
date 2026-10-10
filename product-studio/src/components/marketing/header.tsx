"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#studio", label: "Photo studio" },
  { href: "/#create", label: "Ads & social" },
  { href: "/#copy", label: "Descriptions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
];

export function MarketingHeader({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cn("sticky top-0 z-40 transition", scrolled ? "border-b border-line/70 bg-canvas/85 backdrop-blur-md" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link href="/" aria-label="Vitrine home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-ink-2 transition hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="hidden items-center gap-2 sm:flex">
          {signedIn ? (
            <LinkButton href="/app" size="sm">
              Open studio
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/login" size="sm" variant="ghost">
                Sign in
              </LinkButton>
              <LinkButton href="/signup" size="sm">
                Start free
              </LinkButton>
            </>
          )}
        </div>
        <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-canvas px-4 pb-5 md:hidden">
          <nav className="grid gap-1 py-3">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 text-[15px]">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="grid grid-cols-2 gap-2">
            {signedIn ? (
              <LinkButton href="/app" className="col-span-2">
                Open studio
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/login" variant="secondary">
                  Sign in
                </LinkButton>
                <LinkButton href="/signup">Start free</LinkButton>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
