import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { memberships, sessions } from "@/server/db/schema";
import { forbidden, json, parseJson, route } from "@/server/http";

const schema = z.object({ workspaceId: z.string().max(64) });

export const POST = route(async (req) => {
  const auth = await requireAuth();
  const { workspaceId } = await parseJson(req, schema);
  const db = await getDb();
  const m = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, auth.user.id)))
    .limit(1);
  if (!m[0]) throw forbidden();
  await db.update(sessions).set({ workspaceId }).where(eq(sessions.id, auth.sessionId));
  return json({ ok: true });
});
