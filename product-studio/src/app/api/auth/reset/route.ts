import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { passwordResets, sessions, users } from "@/server/db/schema";
import { HttpError, clientIp, json, parseJson, rateLimit, route } from "@/server/http";
import { sha256 } from "@/server/ids";

const schema = z.object({ token: z.string().min(10).max(200), password: z.string().max(200) });

export const POST = route(async (req) => {
  rateLimit(`reset:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const body = await parseJson(req, schema);
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(422, problem, "weak_password");
  const db = await getDb();
  const id = sha256(body.token);
  const rows = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  const reset = rows[0];
  if (!reset) throw new HttpError(400, "This reset link is invalid or has expired. Please request a new one.", "invalid_token");
  const passwordHash = await hashPassword(body.password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, reset.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, id));
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
  });
  return json({ ok: true });
});
