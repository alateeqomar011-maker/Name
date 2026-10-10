import { and, eq } from "drizzle-orm";
import { requireAuth, requireRole } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { invites } from "@/server/db/schema";
import { json, route } from "@/server/http";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const auth = await requireAuth();
  requireRole(auth, ["owner", "admin"]);
  const { id } = await params;
  const db = await getDb();
  await db.delete(invites).where(and(eq(invites.id, id), eq(invites.workspaceId, auth.workspace.id)));
  return json({ ok: true });
});
