import { z } from "zod";
import { findUserByEmail } from "@/server/accounts";
import { getDb } from "@/server/db";
import { passwordResets } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { env } from "@/server/env";
import { clientIp, json, parseJson, rateLimit, route } from "@/server/http";
import { newToken, sha256 } from "@/server/ids";

const schema = z.object({ email: z.string().trim().email().max(200) });

export const POST = route(async (req) => {
  rateLimit(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000);
  const { email } = await parseJson(req, schema);
  const user = await findUserByEmail(email);
  let delivered = false;
  if (user) {
    const token = newToken();
    const db = await getDb();
    await db.insert(passwordResets).values({
      id: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const link = `${env.appUrl}/reset-password?token=${token}`;
    delivered = await sendEmail({
      to: user.email,
      subject: "Reset your Vitrine password",
      text: `Hi ${user.name},\n\nUse this link to set a new password (valid for 1 hour):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
    if (!delivered && !env.isProd) console.log(`[auth] password reset link for ${user.email}: ${link}`);
  }
  // Same response whether or not the account exists.
  return json({ ok: true, emailConfigured: Boolean(env.resendApiKey), delivered: user ? delivered : undefined });
});
