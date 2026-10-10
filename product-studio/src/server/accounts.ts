import "server-only";
import { eq } from "drizzle-orm";
import { getPlan } from "@/lib/plans";
import { getDb } from "./db";
import { creditLedger, memberships, users, workspaces } from "./db/schema";
import { addMonths } from "./credits";
import { hashPassword } from "./auth/password";
import { HttpError } from "./http";
import { newId } from "./ids";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string) {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return rows[0] ?? null;
}

/** Creates a user with a personal workspace on the Free plan (with trial credits). */
export async function createUserWithWorkspace(input: { email: string; name: string; password: string }) {
  const db = await getDb();
  const email = normalizeEmail(input.email);
  if (await findUserByEmail(email)) {
    throw new HttpError(409, "An account with this email already exists. Try signing in.", "email_taken");
  }
  const passwordHash = await hashPassword(input.password);
  const userId = newId("usr");
  const workspaceId = newId("ws");
  const free = getPlan("free");
  const firstName = input.name.trim().split(/\s+/)[0] || "My";

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email,
      name: input.name.trim(),
      passwordHash,
      defaultWorkspaceId: workspaceId,
    });
    await tx.insert(workspaces).values({
      id: workspaceId,
      name: `${firstName}'s Studio`,
      ownerId: userId,
      plan: "free",
      planCredits: free.limits.monthlyCredits,
      bonusCredits: 0,
      creditsResetAt: addMonths(new Date(), 1),
    });
    await tx.insert(memberships).values({ workspaceId, userId, role: "owner" });
    await tx.insert(creditLedger).values({
      id: newId("led"),
      workspaceId,
      userId,
      delta: free.limits.monthlyCredits,
      bucket: "plan",
      reason: "monthly_grant",
      note: "Welcome! Free plan trial credits",
      balanceAfter: free.limits.monthlyCredits,
    });
  });
  return { userId, workspaceId };
}
