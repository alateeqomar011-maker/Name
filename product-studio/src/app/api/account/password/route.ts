import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { destroyOtherSessions, requireAuth } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { HttpError, json, parseJson, rateLimit, route } from "@/server/http";

const schema = z.object({ current: z.string().max(200), next: z.string().max(200) });

export const POST = route(async (req) => {
  const auth = await requireAuth();
  rateLimit(`pw:${auth.user.id}`, 10, 60 * 60 * 1000);
  const body = await parseJson(req, schema);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!user || !(await verifyPassword(body.current, user.passwordHash))) {
    throw new HttpError(401, "Current password is incorrect.", "invalid_credentials");
  }
  const problem = passwordProblem(body.next);
  if (problem) throw new HttpError(422, problem, "weak_password");
  await db.update(users).set({ passwordHash: await hashPassword(body.next), updatedAt: new Date() }).where(eq(users.id, user.id));
  await destroyOtherSessions(user.id, auth.sessionId);
  return json({ ok: true });
});
