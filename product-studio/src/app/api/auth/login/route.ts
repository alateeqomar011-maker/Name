import { z } from "zod";
import { findUserByEmail } from "@/server/accounts";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { HttpError, clientIp, json, parseJson, rateLimit, route } from "@/server/http";

const schema = z.object({ email: z.string().trim().max(200), password: z.string().max(200) });

// A fixed hash so unknown emails take the same time as wrong passwords.
const DUMMY = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export const POST = route(async (req) => {
  const body = await parseJson(req, schema);
  const ip = clientIp(req);
  rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
  rateLimit(`login:${body.email.toLowerCase()}`, 8, 15 * 60 * 1000);
  const user = await findUserByEmail(body.email);
  const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY);
  if (!user || !ok) throw new HttpError(401, "That email and password don't match.", "invalid_credentials");
  await createSession(user.id, user.defaultWorkspaceId, req);
  return json({ ok: true });
});
