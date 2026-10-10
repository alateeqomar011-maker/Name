import { and, desc, eq, gte, sql } from "drizzle-orm";
import { CREDIT_PACKS, PLANS, getPlan } from "@/lib/plans";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { creditLedger, generations } from "@/server/db/schema";
import { env } from "@/server/env";
import { addMonths } from "@/server/credits";
import { json, route } from "@/server/http";

export const GET = route(async () => {
  const auth = await requireAuth();
  const ws = auth.workspace;
  const db = await getDb();
  const periodStart = addMonths(ws.creditsResetAt, -1);
  const [ledger, usage] = await Promise.all([
    db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.workspaceId, ws.id))
      .orderBy(desc(creditLedger.createdAt))
      .limit(60),
    db
      .select({ type: generations.type, n: sql<number>`count(*)`, credits: sql<number>`coalesce(sum(${generations.creditsCharged}), 0)` })
      .from(generations)
      .where(and(eq(generations.workspaceId, ws.id), gte(generations.createdAt, periodStart), eq(generations.refunded, false)))
      .groupBy(generations.type),
  ]);
  const plan = getPlan(ws.plan);
  return json({
    plan: plan.id,
    role: auth.role,
    interval: ws.billingInterval,
    subscriptionStatus: ws.subscriptionStatus,
    cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
    currentPeriodEnd: ws.currentPeriodEnd?.toISOString() ?? null,
    hasCustomer: Boolean(ws.stripeCustomerId),
    credits: {
      plan: ws.planCredits,
      bonus: ws.bonusCredits,
      total: ws.planCredits + ws.bonusCredits,
      monthly: plan.limits.monthlyCredits,
      resetsAt: ws.creditsResetAt.toISOString(),
      periodStart: periodStart.toISOString(),
    },
    usage: usage.map((u) => ({ type: u.type, count: Number(u.n), credits: Number(u.credits) })),
    ledger: ledger.map((l) => ({
      id: l.id,
      delta: l.delta,
      bucket: l.bucket,
      reason: l.reason,
      note: l.note,
      balanceAfter: l.balanceAfter,
      createdAt: l.createdAt.toISOString(),
    })),
    paymentsEnabled: Boolean(env.stripeSecretKey),
    devBilling: env.devBilling,
    plans: Object.values(PLANS),
    packs: CREDIT_PACKS,
  });
});
