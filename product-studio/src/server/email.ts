import "server-only";
import { env } from "./env";

// Transactional email via Resend's HTTP API when RESEND_API_KEY is set.
// Returns false when email isn't configured so callers can tell the user.

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!env.resendApiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [msg.to], subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[email] send failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}
