"use client";

import { AlertTriangle, Check, CreditCard, ExternalLink, FlaskConical, Lock, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { PageHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, Progress, Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, useApi } from "@/lib/client/api";
import { GENERATION_TYPES, type GenerationType } from "@/lib/generation-types";
import { PLAN_ORDER, type CreditPack, type Plan, type PlanId } from "@/lib/plans";
import { cn, formatDate } from "@/lib/utils";

interface BillingData {
  plan: PlanId;
  role: string;
  interval: "month" | "year" | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
  credits: { plan: number; bonus: number; total: number; monthly: number; resetsAt: string; periodStart: string };
  usage: { type: string; count: number; credits: number }[];
  ledger: { id: string; delta: number; bucket: string; reason: string; note: string | null; balanceAfter: number; createdAt: string }[];
  paymentsEnabled: boolean;
  devBilling: boolean;
  plans: Plan[];
  packs: CreditPack[];
}

type Purchase = { kind: "plan"; plan: Plan; interval: "month" | "year" } | { kind: "pack"; pack: CreditPack };

const REASON_LABEL: Record<string, string> = {
  generation: "Used",
  refund: "Refund",
  monthly_grant: "Monthly credits",
  purchase: "Purchase",
  plan_change: "Plan change",
  adjustment: "Adjustment",
};

export function Billing() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { handleError, refreshMe } = useApp();
  const { data, mutate } = useApi<BillingData>("/api/billing");
  const [cycle, setCycle] = useState<"month" | "year">("month");
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const status = params.get("checkout");
    if (!status) return;
    if (status === "success") {
      toast.success("Payment confirmed", "Your account will update within a few seconds.");
      // The webhook may arrive slightly after the redirect; refresh a few times.
      let n = 0;
      const t = window.setInterval(() => {
        mutate();
        refreshMe();
        if (++n >= 5) window.clearInterval(t);
      }, 2000);
      router.replace("/app/billing");
      return () => window.clearInterval(t);
    }
    if (status === "canceled") {
      toast.info("Checkout canceled", "You weren't charged.");
      router.replace("/app/billing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <Skeleton className="h-[70vh]" />;
  const current = data.plans.find((p) => p.id === data.plan)!;
  const canManage = data.role === "owner" || data.role === "admin";
  const activeSub = data.subscriptionStatus && ["active", "trialing", "past_due"].includes(data.subscriptionStatus);

  const confirm = async () => {
    if (!purchase) return;
    setRedirecting(true);
    try {
      const body = purchase.kind === "plan" ? { plan: purchase.plan.id, interval: purchase.interval, confirmed: true } : { pack: purchase.pack.id, confirmed: true };
      const res = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json: body });
      window.location.href = res.url;
    } catch (err) {
      setRedirecting(false);
      setPurchase(null);
      handleError(err, "Couldn't open checkout");
    }
  };

  const openPortal = async () => {
    try {
      const res = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      window.location.href = res.url;
    } catch (err) {
      handleError(err, "Couldn't open the billing portal");
    }
  };

  const devSwitch = async (body: { plan?: PlanId; credits?: number }) => {
    await api("/api/billing/dev-plan", { method: "POST", json: body });
    toast.success("Developer change applied", "No payment was made.");
    mutate();
    refreshMe();
  };

  const totalUsed = data.usage.reduce((s, u) => s + u.credits, 0);

  return (
    <div>
      <PageHeader title="Plans & credits" description="Credits are charged when a generation starts and refunded automatically if it fails. Monthly credits reset each period; purchased credits never expire." />

      {!data.paymentsEnabled && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            <span className="font-semibold">Payments aren&apos;t configured on this server.</span> Upgrades and credit packs are unavailable until an administrator connects Stripe (STRIPE_SECRET_KEY). No one can be charged in this state.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Current plan</p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-semibold">
                {current.name}
                {data.subscriptionStatus === "dev" && <Badge tone="warning">Developer mode</Badge>}
                {data.subscriptionStatus === "past_due" && <Badge tone="danger">Payment past due</Badge>}
              </p>
              <p className="mt-1 text-sm text-muted">
                {current.priceMonthly === 0
                  ? "Free forever"
                  : `$${data.interval === "year" ? current.priceYearly : current.priceMonthly} / ${data.interval === "year" ? "year" : "month"}`}
                {data.currentPeriodEnd && activeSub && (data.cancelAtPeriodEnd ? ` · ends ${formatDate(data.currentPeriodEnd)}` : ` · renews ${formatDate(data.currentPeriodEnd)}`)}
              </p>
            </div>
            {data.hasCustomer && data.paymentsEnabled && canManage && (
              <Button variant="secondary" icon={<CreditCard className="size-4" />} onClick={openPortal}>
                Manage billing <ExternalLink className="size-3.5" />
              </Button>
            )}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-subtle p-4">
              <p className="text-xs text-muted">Available now</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{data.credits.total.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-subtle p-4">
              <p className="text-xs text-muted">Monthly credits</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {data.credits.plan}
                <span className="text-sm font-normal text-muted">/{data.credits.monthly}</span>
              </p>
              <Progress value={(data.credits.plan / Math.max(1, data.credits.monthly)) * 100} className="mt-2" />
              <p className="mt-1.5 text-[11px] text-muted">Resets {formatDate(data.credits.resetsAt)}</p>
            </div>
            <div className="rounded-2xl bg-subtle p-4">
              <p className="text-xs text-muted">Purchased credits</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{data.credits.bonus}</p>
              <p className="mt-1.5 text-[11px] text-muted">Never expire</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold">Usage this period</p>
          <p className="text-xs text-muted">Since {formatDate(data.credits.periodStart)} · {totalUsed} credits</p>
          {data.usage.length ? (
            <ul className="mt-4 space-y-3">
              {data.usage
                .filter((u) => u.credits > 0 || u.count > 0)
                .sort((a, b) => b.credits - a.credits)
                .map((u) => (
                  <li key={u.type} className="text-[13px]">
                    <div className="mb-1 flex justify-between">
                      <span>{GENERATION_TYPES[u.type as GenerationType]?.label ?? u.type}</span>
                      <span className="tabular-nums text-muted">
                        {u.credits} cr · {u.count}×
                      </span>
                    </div>
                    <Progress value={totalUsed ? (u.credits / totalUsed) * 100 : 0} />
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">No usage yet this period.</p>
          )}
        </Card>
      </div>

      <div className="mt-10 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Plans</h2>
        <Segmented
          value={cycle}
          onChange={setCycle}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: <span>Yearly <span className="text-success">−20%</span></span> },
          ]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const p = data.plans.find((x) => x.id === id)!;
          const isCurrent = p.id === data.plan;
          const rank = PLAN_ORDER.indexOf(p.id) - PLAN_ORDER.indexOf(data.plan);
          const price = cycle === "year" ? Math.round((p.priceYearly / 12) * 100) / 100 : p.priceMonthly;
          return (
            <Card key={p.id} className={cn("relative flex flex-col p-5", p.popular && "border-iris-300 ring-1 ring-iris-200")}>
              {p.popular && <Badge tone="iris" className="absolute -top-2.5 left-5">Most popular</Badge>}
              <p className="font-semibold">{p.name}</p>
              <p className="mt-1 text-xs text-muted">{p.tagline}</p>
              <p className="mt-4">
                <span className="text-3xl font-semibold">${price}</span>
                <span className="text-sm text-muted">/mo</span>
              </p>
              {cycle === "year" && p.priceYearly > 0 && <p className="text-xs text-muted">${p.priceYearly} billed yearly</p>}
              <ul className="mt-4 flex-1 space-y-2">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-[13px]">
                    <Check className="mt-0.5 size-4 shrink-0 text-iris-600" /> {h}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : p.id === "free" ? (
                  <Button variant="ghost" className="w-full" disabled={!data.hasCustomer || !data.paymentsEnabled} onClick={openPortal}>
                    {activeSub ? "Downgrade in billing portal" : "Free plan"}
                  </Button>
                ) : (
                  <Button
                    variant={rank > 0 ? (p.popular ? "accent" : "primary") : "secondary"}
                    className="w-full"
                    disabled={!data.paymentsEnabled || !canManage}
                    icon={!data.paymentsEnabled ? <Lock className="size-4" /> : undefined}
                    onClick={() => (activeSub ? openPortal() : setPurchase({ kind: "plan", plan: p, interval: cycle }))}
                  >
                    {activeSub ? (rank > 0 ? "Upgrade in portal" : "Switch in portal") : `Get ${p.name}`}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {!canManage && <p className="mt-3 text-xs text-muted">Only workspace owners and admins can change the plan.</p>}

      <h2 className="mt-10 mb-4 text-lg font-semibold">Credit packs</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {data.packs.map((pk) => (
          <Card key={pk.id} className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="flex items-center gap-1.5 font-semibold">
                <Zap className="size-4 text-gold-400" /> {pk.label}
              </p>
              <p className="text-sm text-muted">
                ${pk.price} · ${(pk.price / pk.credits).toFixed(3)} per credit
              </p>
            </div>
            <Button size="sm" variant="secondary" disabled={!data.paymentsEnabled || !canManage} onClick={() => setPurchase({ kind: "pack", pack: pk })}>
              Buy
            </Button>
          </Card>
        ))}
      </div>

      {data.devBilling && (
        <Card className="mt-6 border-dashed p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="size-4 text-warning" /> Developer billing tools
          </p>
          <p className="mt-1 text-xs text-muted">Enabled by DEV_BILLING=1 for local testing only. These switch plans and add credits without any payment, and are disabled in production builds.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PLAN_ORDER.map((p) => (
              <Button key={p} size="sm" variant="secondary" onClick={() => devSwitch({ plan: p })}>
                Switch to {p}
              </Button>
            ))}
            <Button size="sm" variant="secondary" onClick={() => devSwitch({ credits: 100 })}>
              +100 test credits
            </Button>
          </div>
        </Card>
      )}

      <h2 className="mt-10 mb-4 text-lg font-semibold">Credit history</h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-subtle/60 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Activity</th>
                <th className="px-4 py-2.5 text-right font-medium">Credits</th>
                <th className="px-4 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{new Date(l.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{REASON_LABEL[l.reason] ?? l.reason}</span>
                    {l.note && <span className="ml-2 text-muted">{l.note}</span>}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right font-medium tabular-nums", l.delta > 0 ? "text-success" : "text-ink")}>
                    {l.delta > 0 ? `+${l.delta}` : l.delta}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{l.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={Boolean(purchase)}
        onOpenChange={(o) => !o && !redirecting && setPurchase(null)}
        title="Confirm your purchase"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPurchase(null)} disabled={redirecting}>
              Cancel
            </Button>
            <Button variant="accent" loading={redirecting} icon={<ShieldCheck className="size-4" />} onClick={confirm}>
              Continue to secure checkout
            </Button>
          </>
        }
      >
        {purchase && (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-line p-4">
              {purchase.kind === "plan" ? (
                <>
                  <p className="font-semibold">Vitrine {purchase.plan.name} · {purchase.interval === "year" ? "yearly" : "monthly"}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    ${purchase.interval === "year" ? purchase.plan.priceYearly : purchase.plan.priceMonthly}
                    <span className="text-sm font-normal text-muted"> / {purchase.interval}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {purchase.plan.limits.monthlyCredits.toLocaleString()} credits every month · renews automatically until you cancel · plus applicable taxes
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">{purchase.pack.label}</p>
                  <p className="mt-1 text-2xl font-semibold">${purchase.pack.price}</p>
                  <p className="mt-1 text-xs text-muted">One-time payment · credits never expire</p>
                </>
              )}
            </div>
            <p className="flex gap-2 text-sm text-muted">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-iris-500" />
              You&apos;ll be taken to Stripe&apos;s secure checkout to review the total and confirm. Nothing is charged until you confirm there.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
