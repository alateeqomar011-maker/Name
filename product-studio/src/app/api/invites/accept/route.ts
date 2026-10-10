import { and, count, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getPlan } from "@/lib/plans";
import { requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { invites, memberships, sessions, workspaces } from "@/server/db/schema";
import { HttpError, json, parseJson, route } from "@/server/http";
import { sha256 } from "@/server/ids";

const schema = z.object({ token: z.string().min(10).max(200) });

export const POST = route(async (req) => {
  const auth = await requireAuth();
  const { token } = await parseJson(req, schema);
  const db = await getDb();
  const rows = await db
    .select({ invite: invites, ws: workspaces })
    .from(invites)
    .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
    .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(400, "This invitation is invalid, expired or already used.", "invalid_invite");
  if (row.invite.email !== auth.user.email) {
    throw new HttpError(403, `This invitation was sent to ${row.invite.email}. Sign in with that email to accept it.`, "wrong_account");
  }
  const existing = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, row.ws.id), eq(memberships.userId, auth.user.id)))
    .limit(1);
  if (!existing[0]) {
    const [{ value }] = await db.select({ value: count() }).from(memberships).where(eq(memberships.workspaceId, row.ws.id));
    if (Number(value) >= getPlan(row.ws.plan).limits.seats) {
      throw new HttpError(409, "This workspace has no free seats. Ask the owner to free one up.", "seats_full");
    }
    await db.insert(memberships).values({ workspaceId: row.ws.id, userId: auth.user.id, role: row.invite.role });
  }
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, row.invite.id));
  await db.update(sessions).set({ workspaceId: row.ws.id }).where(eq(sessions.id, auth.sessionId));
  return json({ ok: true, workspaceId: row.ws.id, workspaceName: row.ws.name });
});
