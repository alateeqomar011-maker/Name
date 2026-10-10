import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getPlan, type PlanId } from "@/lib/plans";
import { getDb, type DB } from "./db";
import { creditLedger, workspaces, type Workspace } from "./db/schema";
import { HttpError } from "./http";
import { newId } from "./ids";

// Credits come in two buckets:
//  • plan  – the monthly allowance, reset (not accumulated) every month
//  • bonus – purchased packs, never expire, spent after plan credits
// Every change is written to the append-only credit_ledger with the balance
// after the change, so usage history is auditable.

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0); // clamp e.g. Jan 31 → Feb 28
  return d;
}

export function balanceOf(ws: Pick<Workspace, "planCredits" | "bonusCredits">) {
  return ws.planCredits + ws.bonusCredits;
}

async function lockWorkspace(tx: Tx, workspaceId: string): Promise<Workspace> {
  const rows = await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).for("update");
  if (!rows[0]) throw new HttpError(404, "Workspace not found.");
  return rows[0];
}

/** Applies monthly resets that are due. Safe to call on every request. */
export async function ensureCreditPeriod(ws: Workspace): Promise<Workspace> {
  if (ws.creditsResetAt.getTime() > Date.now()) return ws;
  const db = await getDb();
  return db.transaction(async (tx) => {
    const cur = await lockWorkspace(tx, ws.id);
    return applyPeriodReset(tx, cur);
  });
}

async function applyPeriodReset(tx: Tx, cur: Workspace): Promise<Workspace> {
  const now = Date.now();
  if (cur.creditsResetAt.getTime() > now) return cur;
  let next = cur.creditsResetAt;
  while (next.getTime() <= now) next = addMonths(next, 1);
  const allowance = getPlan(cur.plan).limits.monthlyCredits;
  const [updated] = await tx
    .update(workspaces)
    .set({ planCredits: allowance, creditsResetAt: next, updatedAt: new Date() })
    .where(eq(workspaces.id, cur.id))
    .returning();
  await tx.insert(creditLedger).values({
    id: newId("led"),
    workspaceId: cur.id,
    delta: allowance - cur.planCredits,
    bucket: "plan",
    reason: "monthly_grant",
    note: `Monthly ${getPlan(cur.plan).name} allowance (${allowance} credits)`,
    balanceAfter: balanceOf(updated),
  });
  return updated;
}

export interface ChargeInput {
  workspaceId: string;
  userId: string;
  amount: number;
  generationId: string;
  note?: string;
}

/** Atomically deducts credits or throws 402 when the balance is insufficient. */
export async function chargeCredits(input: ChargeInput, txArg?: Tx): Promise<Workspace> {
  const run = async (tx: Tx) => {
    let ws = await lockWorkspace(tx, input.workspaceId);
    ws = await applyPeriodReset(tx, ws);
    if (input.amount <= 0) return ws;
    const balance = balanceOf(ws);
    if (balance < input.amount) {
      throw new HttpError(402, `This needs ${input.amount} credits but you have ${balance}.`, "insufficient_credits", {
        required: input.amount,
        balance,
      });
    }
    const fromPlan = Math.min(ws.planCredits, input.amount);
    const fromBonus = input.amount - fromPlan;
    const [updated] = await tx
      .update(workspaces)
      .set({
        planCredits: ws.planCredits - fromPlan,
        bonusCredits: ws.bonusCredits - fromBonus,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, ws.id))
      .returning();
    let running = balance;
    for (const [bucket, amt] of [
      ["plan", fromPlan],
      ["bonus", fromBonus],
    ] as const) {
      if (amt <= 0) continue;
      running -= amt;
      await tx.insert(creditLedger).values({
        id: newId("led"),
        workspaceId: ws.id,
        userId: input.userId,
        delta: -amt,
        bucket,
        reason: "generation",
        generationId: input.generationId,
        note: input.note,
        balanceAfter: running,
      });
    }
    return updated;
  };
  if (txArg) return run(txArg);
  const db = await getDb();
  return db.transaction(run);
}

/** Returns the credits charged for a generation to their original buckets (idempotent per call site). */
export async function refundGenerationCredits(workspaceId: string, generationId: string, tx: Tx) {
  const spent = await tx
    .select({ bucket: creditLedger.bucket, total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(and(eq(creditLedger.workspaceId, workspaceId), eq(creditLedger.generationId, generationId)))
    .groupBy(creditLedger.bucket);
  const ws = await lockWorkspace(tx, workspaceId);
  let plan = ws.planCredits;
  let bonus = ws.bonusCredits;
  const entries: { bucket: string; amount: number }[] = [];
  for (const row of spent) {
    const owed = -Number(row.total); // net amount still charged for this generation
    if (owed <= 0) continue;
    if (row.bucket === "plan") plan += owed;
    else bonus += owed;
    entries.push({ bucket: row.bucket, amount: owed });
  }
  if (!entries.length) return 0;
  await tx
    .update(workspaces)
    .set({ planCredits: plan, bonusCredits: bonus, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  let running = ws.planCredits + ws.bonusCredits;
  let total = 0;
  for (const e of entries) {
    running += e.amount;
    total += e.amount;
    await tx.insert(creditLedger).values({
      id: newId("led"),
      workspaceId,
      delta: e.amount,
      bucket: e.bucket,
      reason: "refund",
      generationId,
      note: "Automatic refund for a failed generation",
      balanceAfter: running,
    });
  }
  return total;
}

export async function grantBonusCredits(workspaceId: string, amount: number, note: string, txArg?: Tx) {
  const run = async (tx: Tx) => {
    const ws = await lockWorkspace(tx, workspaceId);
    const [updated] = await tx
      .update(workspaces)
      .set({ bonusCredits: ws.bonusCredits + amount, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    await tx.insert(creditLedger).values({
      id: newId("led"),
      workspaceId,
      delta: amount,
      bucket: "bonus",
      reason: "purchase",
      note,
      balanceAfter: balanceOf(updated),
    });
    return updated;
  };
  if (txArg) return run(txArg);
  const db = await getDb();
  return db.transaction(run);
}

/**
 * Switches a workspace's plan. Upgrades start a fresh monthly period with the
 * new allowance; downgrades keep the remaining plan credits up to the new cap.
 */
export async function applyPlanChange(
  workspaceId: string,
  plan: PlanId,
  fields: Partial<Workspace>,
  txArg?: Tx,
): Promise<Workspace> {
  const run = async (tx: Tx) => {
    const ws = await lockWorkspace(tx, workspaceId);
    const oldAllowance = getPlan(ws.plan).limits.monthlyCredits;
    const newAllowance = getPlan(plan).limits.monthlyCredits;
    const isUpgrade = newAllowance > oldAllowance;
    const planCredits = isUpgrade ? newAllowance : Math.min(ws.planCredits, newAllowance);
    const [updated] = await tx
      .update(workspaces)
      .set({
        ...fields,
        plan,
        planCredits,
        creditsResetAt: isUpgrade ? addMonths(new Date(), 1) : ws.creditsResetAt,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    if (planCredits !== ws.planCredits) {
      await tx.insert(creditLedger).values({
        id: newId("led"),
        workspaceId,
        delta: planCredits - ws.planCredits,
        bucket: "plan",
        reason: "plan_change",
        note: `Plan changed to ${getPlan(plan).name}`,
        balanceAfter: balanceOf(updated),
      });
    }
    return updated;
  };
  if (txArg) return run(txArg);
  const db = await getDb();
  return db.transaction(run);
}

/** Refunds part of a generation's charge (e.g. failed items in a batch), bonus credits first. */
export async function refundPartialCredits(workspaceId: string, generationId: string, amount: number, note: string) {
  if (amount <= 0) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    const spent = await tx
      .select({ bucket: creditLedger.bucket, total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)` })
      .from(creditLedger)
      .where(and(eq(creditLedger.workspaceId, workspaceId), eq(creditLedger.generationId, generationId)))
      .groupBy(creditLedger.bucket);
    const owed = Object.fromEntries(spent.map((r) => [r.bucket, -Number(r.total)])) as Record<string, number>;
    const ws = await lockWorkspace(tx, workspaceId);
    let remaining = amount;
    const fromBonus = Math.min(remaining, Math.max(0, owed.bonus ?? 0));
    remaining -= fromBonus;
    const fromPlan = Math.min(remaining, Math.max(0, owed.plan ?? 0));
    if (fromBonus + fromPlan <= 0) return;
    await tx
      .update(workspaces)
      .set({ planCredits: ws.planCredits + fromPlan, bonusCredits: ws.bonusCredits + fromBonus, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
    let running = ws.planCredits + ws.bonusCredits;
    for (const [bucket, amt] of [
      ["bonus", fromBonus],
      ["plan", fromPlan],
    ] as const) {
      if (amt <= 0) continue;
      running += amt;
      await tx.insert(creditLedger).values({
        id: newId("led"),
        workspaceId,
        delta: amt,
        bucket,
        reason: "refund",
        generationId,
        note,
        balanceAfter: running,
      });
    }
  });
}
