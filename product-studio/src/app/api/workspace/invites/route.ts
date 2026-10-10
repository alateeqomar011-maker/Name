import { and, count, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getPlan } from "@/lib/plans";
import { normalizeEmail } from "@/server/accounts";
import { requireAuth, requireRole } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { invites, memberships } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { env } from "@/server/env";
import { HttpError, json, parseJson, rateLimit, route } from "@/server/http";
import { newId, newToken, sha256 } from "@/server/ids";

const schema = z.object({ email: z.string().trim().email().max(200), role: z.enum(["admin", "member"]) });

export const POST = route(async (req) => {
  const auth = await requireAuth();
  requireRole(auth, ["owner", "admin"]);
  rateLimit(`invite:${auth.workspace.id}`, 30, 60 * 60 * 1000);
  const body = await parseJson(req, schema);
  const plan = getPlan(auth.workspace.plan);
  if (plan.limits.seats <= 1) {
    throw new HttpError(403, "Team collaboration is part of the Business plan.", "upgrade_required", { requiredPlan: "business" });
  }
  const db = await getDb();
  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(memberships)
    .where(eq(memberships.workspaceId, auth.workspace.id));
  const [{ value: pendingCount }] = await db
    .select({ value: count() })
    .from(invites)
    .where(and(eq(invites.workspaceId, auth.workspace.id), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  if (Number(memberCount) + Number(pendingCount) >= plan.limits.seats) {
    throw new HttpError(409, `All ${plan.limits.seats} seats are in use or invited.`, "seats_full");
  }
  const token = newToken();
  const email = normalizeEmail(body.email);
  await db.insert(invites).values({
    id: newId("inv"),
    workspaceId: auth.workspace.id,
    email,
    role: body.role,
    tokenHash: sha256(token),
    invitedBy: auth.user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  const link = `${env.appUrl}/invite/${token}`;
  const emailed = await sendEmail({
    to: email,
    subject: `${auth.user.name} invited you to ${auth.workspace.name} on Vitrine`,
    text: `${auth.user.name} invited you to collaborate in "${auth.workspace.name}" on Vitrine.\n\nAccept the invitation (valid for 7 days):\n${link}`,
  });
  return json({ ok: true, link, emailed });
});
