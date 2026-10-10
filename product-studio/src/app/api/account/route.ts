import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { verifyPassword } from "@/server/auth/password";
import { destroySession, requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { memberships, users, workspaces } from "@/server/db/schema";
import { HttpError, json, parseJson, route } from "@/server/http";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  preferences: z
    .object({
      defaultLanguage: z.enum(["en", "ar"]).optional(),
      defaultTone: z.string().max(30).optional(),
      emailUpdates: z.boolean().optional(),
    })
    .optional(),
});

export const PATCH = route(async (req) => {
  const auth = await requireAuth();
  const body = await parseJson(req, patchSchema);
  const db = await getDb();
  await db
    .update(users)
    .set({
      ...(body.name ? { name: body.name } : {}),
      ...(body.preferences ? { preferences: { ...auth.user.preferences, ...body.preferences } } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, auth.user.id));
  return json({ ok: true });
});

const deleteSchema = z.object({ password: z.string().max(200), confirm: z.literal("DELETE") });

export const DELETE = route(async (req) => {
  const auth = await requireAuth();
  const body = await parseJson(req, deleteSchema);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new HttpError(401, "Password is incorrect.", "invalid_credentials");
  }
  const owned = await db.select().from(workspaces).where(eq(workspaces.ownerId, user.id));
  for (const ws of owned) {
    const others = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, ws.id), ne(memberships.userId, user.id)));
    if (others.length) {
      throw new HttpError(409, `Transfer or remove the other members of "${ws.name}" before deleting your account.`, "has_members");
    }
    if (ws.stripeSubscriptionId && ws.subscriptionStatus && !["canceled", "incomplete_expired"].includes(ws.subscriptionStatus)) {
      throw new HttpError(409, `Cancel the subscription for "${ws.name}" in Billing before deleting your account.`, "active_subscription");
    }
  }
  await db.transaction(async (tx) => {
    for (const ws of owned) await tx.delete(workspaces).where(eq(workspaces.id, ws.id));
    await tx.delete(users).where(eq(users.id, user.id));
  });
  await destroySession();
  return json({ ok: true });
});
