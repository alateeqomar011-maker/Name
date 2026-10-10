"use client";

import { ArrowRight, Check, PlugZap, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { ApiError, useMe, type Me } from "@/lib/client/api";
import { PLANS, type PlanId } from "@/lib/plans";

interface AppCtx {
  me: Me | undefined;
  refreshMe: () => Promise<unknown>;
  /** Shows the right UI for an API error: upgrade prompt, unavailable service, or a toast. */
  handleError: (err: unknown, fallbackTitle?: string) => void;
  showUpgrade: (reason: string, plan?: PlanId) => void;
}

const Ctx = createContext<AppCtx | null>(null);

function Inner({ children }: { children: ReactNode }) {
  const { data: me, mutate } = useMe();
  const toast = useToast();
  const router = useRouter();
  const [upgrade, setUpgrade] = useState<{ reason: string; plan: PlanId; credits?: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const showUpgrade = useCallback((reason: string, plan: PlanId = "pro") => setUpgrade({ reason, plan }), []);

  const handleError = useCallback(
    (err: unknown, fallbackTitle = "Something went wrong") => {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        if (err.code === "insufficient_credits") {
          setUpgrade({ reason: err.message, plan: me?.workspace.plan === "free" ? "starter" : "pro", credits: true });
          return;
        }
        if (err.code === "upgrade_required") {
          setUpgrade({ reason: err.message, plan: (err.details.requiredPlan as PlanId) ?? "pro" });
          return;
        }
        if (err.code === "service_unavailable" || err.code === "payments_unavailable") {
          setUnavailable(err.message);
          return;
        }
        toast.error(fallbackTitle, err.message);
        return;
      }
      toast.error(fallbackTitle, err instanceof Error ? err.message : undefined);
    },
    [me?.workspace.plan, router, toast],
  );

  const value = useMemo(() => ({ me, refreshMe: () => mutate(), handleError, showUpgrade }), [me, mutate, handleError, showUpgrade]);
  const target = upgrade ? PLANS[upgrade.plan] : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(upgrade)}
        onOpenChange={(o) => !o && setUpgrade(null)}
        title={upgrade?.credits ? "You're out of credits" : `Upgrade to ${target?.name}`}
        description={upgrade?.reason}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUpgrade(null)}>
              Not now
            </Button>
            <Button
              variant="accent"
              icon={<Sparkles className="size-4" />}
              onClick={() => {
                setUpgrade(null);
                router.push("/app/billing");
              }}
            >
              {upgrade?.credits ? "Get more credits" : "See plans"}
            </Button>
          </>
        }
      >
        {target && (
          <div className="rounded-2xl border border-iris-100 bg-iris-50/60 p-5">
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">{target.name}</p>
              <p className="text-sm text-muted">
                <span className="text-xl font-semibold text-ink">${target.priceMonthly}</span>/month
              </p>
            </div>
            <ul className="mt-3 space-y-2">
              {target.highlights.map((h) => (
                <li key={h} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-iris-600" /> {h}
                </li>
              ))}
            </ul>
            {upgrade?.credits && (
              <p className="mt-4 text-xs text-muted">You can also buy a one-time credit pack — purchased credits never expire.</p>
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={Boolean(unavailable)}
        onOpenChange={(o) => !o && setUnavailable(null)}
        title="Not available on this server"
        footer={
          <Button variant="secondary" onClick={() => setUnavailable(null)}>
            Got it
          </Button>
        }
      >
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
            <PlugZap className="size-5" />
          </div>
          <div className="text-sm text-ink-2">
            <p>{unavailable}</p>
            <p className="mt-2 text-muted">
              No credits were charged. Everything else in Vitrine keeps working.{" "}
              <a href="/app/help#integrations" className="inline-flex items-center gap-1 font-medium text-iris-600 hover:underline">
                Learn more <ArrowRight className="size-3" />
              </a>
            </p>
          </div>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ shouldRetryOnError: false }}>
      <ToastProvider>
        <Inner>{children}</Inner>
      </ToastProvider>
    </SWRConfig>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
