import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getPlan } from "@/lib/plans";
import { requireAuth, requireRole } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { invites, memberships, users, workspaces } from "@/server/db/schema";
import { json, parseJson, route } from "@/server/http";

export const GET = route(async () => {
  const auth = await requireAuth();
  const db = await getDb();
  const members = await db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, joinedAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, auth.workspace.id));
  const pending = await db
    .select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites)
    .where(and(eq(invites.workspaceId, auth.workspace.id), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
  const plan = getPlan(auth.workspace.plan);
  return json({
    workspace: { id: auth.workspace.id, name: auth.workspace.name, plan: plan.id, seats: plan.limits.seats },
    role: auth.role,
    members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    invites: pending.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
  });
});

const patchSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const PATCH = route(async (req) => {
  const auth = await requireAuth();
  requireRole(auth, ["owner", "admin"]);
  const body = await parseJson(req, patchSchema);
  const db = await getDb();
  await db.update(workspaces).set({ name: body.name, updatedAt: new Date() }).where(eq(workspaces.id, auth.workspace.id));
  return json({ ok: true });
});
