"use client";

import {
  Aperture,
  Building2,
  Check,
  ChevronsUpDown,
  CreditCard,
  FileText,
  Images,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  Plus,
  Settings,
  Share2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Badge, Progress } from "@/components/ui/misc";
import { api } from "@/lib/client/api";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/studio", label: "Photo Studio", icon: Aperture },
  { href: "/app/descriptions", label: "Descriptions", icon: FileText },
  { href: "/app/ads", label: "Ad Designer", icon: Megaphone },
  { href: "/app/social", label: "Social Creator", icon: Share2 },
  { href: "/app/tools", label: "AI Tools", icon: Wand2 },
  { href: "/app/gallery", label: "Gallery", icon: Images },
];

const NAV_BOTTOM = [
  { href: "/app/billing", label: "Plans & credits", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
  { href: "/app/help", label: "Help center", icon: LifeBuoy },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, onClick }: { item: (typeof NAV)[number]; pathname: string; onClick?: () => void }) {
  const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition",
        active ? "bg-surface text-ink shadow-soft" : "text-muted hover:bg-white/60 hover:text-ink",
      )}
    >
      <Icon className={cn("size-[18px] transition", active ? "text-iris-600" : "text-faint group-hover:text-ink-2")} />
      {item.label}
    </Link>
  );
}

function CreditMeter() {
  const { me } = useApp();
  if (!me) return <div className="skeleton h-[92px] rounded-2xl" />;
  const ws = me.workspace;
  const plan = PLANS[ws.plan];
  const pct = ws.monthlyCredits ? (ws.planCredits / ws.monthlyCredits) * 100 : 0;
  const resets = new Date(ws.creditsResetAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Credits</span>
        <Badge tone={ws.plan === "free" ? "neutral" : "iris"}>{plan.name}</Badge>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {ws.credits.toLocaleString()}
        <span className="ml-1 text-xs font-normal text-muted">available</span>
      </p>
      <Progress value={pct} className="mt-2" />
      <p className="mt-2 text-[11px] text-muted">
        {ws.planCredits}/{ws.monthlyCredits} monthly · resets {resets}
        {ws.bonusCredits > 0 && ` · +${ws.bonusCredits} bonus`}
      </p>
      {ws.plan !== "business" && (
        <Link href="/app/billing" className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-iris-600 hover:text-iris-700">
          <Sparkles className="size-3.5" /> {ws.plan === "free" ? "Upgrade for more" : "Get more credits"}
        </Link>
      )}
    </div>
  );
}

function WorkspaceSwitcher() {
  const { me } = useApp();
  if (!me) return <div className="skeleton h-12 rounded-xl" />;
  const switchTo = async (id: string) => {
    await api("/api/workspace/switch", { method: "POST", json: { workspaceId: id } });
    window.location.href = "/app";
  };
  return (
    <Menu
      align="start"
      trigger={
        <button className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/60">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#ece9ff,#ffe9e2)] text-sm font-semibold text-iris-700">
            {me.workspace.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{me.workspace.name}</span>
            <span className="block text-[11px] text-muted capitalize">{me.workspace.role}</span>
          </span>
          <ChevronsUpDown className="size-4 text-faint" />
        </button>
      }
    >
      <MenuLabel>Workspaces</MenuLabel>
      {me.workspaces.map((w) => (
        <MenuItem key={w.id} icon={<Building2 />} onSelect={() => w.id !== me.workspace.id && switchTo(w.id)}>
          <span className="flex-1 truncate">{w.name}</span>
          {w.id === me.workspace.id && <Check className="size-4 text-iris-600" />}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<Settings />} onSelect={() => (window.location.href = "/app/settings?tab=team")}>
        Workspace settings
      </MenuItem>
    </Menu>
  );
}

function UserMenu() {
  const { me } = useApp();
  const router = useRouter();
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
  const initials = (me?.user.name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Menu
      trigger={
        <button className="flex size-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white ring-2 ring-white transition hover:ring-iris-200" aria-label="Account menu">
          {initials}
        </button>
      }
    >
      {me && (
        <div className="px-2.5 py-2">
          <p className="text-sm font-semibold">{me.user.name}</p>
          <p className="text-xs text-muted">{me.user.email}</p>
        </div>
      )}
      <MenuSeparator />
      <MenuItem icon={<Settings />} onSelect={() => router.push("/app/settings")}>
        Account settings
      </MenuItem>
      <MenuItem icon={<CreditCard />} onSelect={() => router.push("/app/billing")}>
        Plans & credits
      </MenuItem>
      <MenuItem icon={<LifeBuoy />} onSelect={() => router.push("/app/help")}>
        Help center
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<LogOut />} onSelect={logout}>
        Sign out
      </MenuItem>
    </Menu>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-2 px-2 pt-1">
        <LogoMark />
        <span className="font-display text-2xl leading-none">Vitrine</span>
      </div>
      <WorkspaceSwitcher />
      <LinkButton href="/app/studio" variant="primary" className="w-full" icon={<Plus className="size-4" />} onClick={onNavigate}>
        Upload product
      </LinkButton>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onClick={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <CreditMeter />
        <nav className="flex flex-col gap-0.5" aria-label="Account">
          {NAV_BOTTOM.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onClick={onNavigate} />
          ))}
        </nav>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { me } = useApp();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-line/70 bg-[#f1f0ec] lg:block">
        <SidebarContent pathname={pathname} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[284px] animate-rise overflow-y-auto bg-[#f1f0ec] shadow-lift">
            <button className="absolute top-4 right-3 rounded-lg p-1.5 text-muted hover:bg-white" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            <SidebarContent pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line/70 bg-canvas/85 px-4 backdrop-blur-md sm:px-6 lg:h-16">
        <button className="-ml-1 rounded-lg p-2 text-ink-2 hover:bg-subtle lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <MenuIcon className="size-5" />
        </button>
        <Link href="/app" className="flex items-center gap-2 lg:hidden">
          <LogoMark className="size-6" />
          <span className="font-display text-xl">Vitrine</span>
        </Link>
        <div className="flex-1" />
        {me && (
          <Link
            href="/app/billing"
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold tabular-nums shadow-soft transition hover:border-iris-200"
            title="Credits available"
          >
            <Sparkles className="size-3.5 text-iris-500" />
            {me.workspace.credits.toLocaleString()}
            <span className="hidden font-normal text-muted sm:inline">credits</span>
          </Link>
        )}
        <LinkButton href="/app/studio" size="sm" variant="accent" className="hidden sm:inline-flex" icon={<Plus className="size-4" />}>
          New product
        </LinkButton>
        <UserMenu />
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
