import { z } from "zod";
import { createUserWithWorkspace } from "@/server/accounts";
import { passwordProblem } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { HttpError, clientIp, json, parseJson, rateLimit, route } from "@/server/http";

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80),
  email: z.string().trim().email("Please enter a valid email").max(200),
  password: z.string().max(200),
});

export const POST = route(async (req) => {
  rateLimit(`signup:${clientIp(req)}`, 8, 60 * 60 * 1000);
  const body = await parseJson(req, schema);
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(422, problem, "weak_password");
  const { userId, workspaceId } = await createUserWithWorkspace(body);
  await createSession(userId, workspaceId, req);
  return json({ ok: true });
});
