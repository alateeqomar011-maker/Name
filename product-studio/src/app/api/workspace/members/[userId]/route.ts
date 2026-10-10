import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { memberships, sessions } from "@/server/db/schema";
import { HttpError, json, parseJson, route } from "@/server/http";

type Ctx = { params: Promise<{ userId: string }> };

const schema = z.object({ role: z.enum(["admin", "member"]) });

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth();
  requireRole(auth, ["owner"]);
  const { userId } = await params;
  if (userId === auth.workspace.ownerId) throw new HttpError(400, "The owner's role can't be changed.");
  const body = await parseJson(req, schema);
  const db = await getDb();
  await db
    .update(memberships)
    .set({ role: body.role })
    .where(and(eq(memberships.workspaceId, auth.workspace.id), eq(memberships.userId, userId)));
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const auth = await requireAuth();
  const { userId } = await params;
  const leaving = userId === auth.user.id;
  if (!leaving) requireRole(auth, ["owner", "admin"]);
  if (userId === auth.workspace.ownerId) throw new HttpError(400, "The workspace owner can't be removed.");
  const db = await getDb();
  await db.delete(memberships).where(and(eq(memberships.workspaceId, auth.workspace.id), eq(memberships.userId, userId)));
  // Sessions pointing at this workspace fall back to the user's own workspace.
  await db
    .update(sessions)
    .set({ workspaceId: null })
    .where(and(eq(sessions.userId, userId), eq(sessions.workspaceId, auth.workspace.id)));
  return json({ ok: true });
});
