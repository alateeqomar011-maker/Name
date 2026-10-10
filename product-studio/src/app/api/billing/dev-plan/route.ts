import { z } from "zod";
import { requireAuth, requireRole } from "@/server/auth/session";
import { applyPlanChange, grantBonusCredits } from "@/server/credits";
import { env } from "@/server/env";
import { HttpError, json, parseJson, route } from "@/server/http";

const schema = z.object({ plan: z.enum(["free", "starter", "pro", "business"]).optional(), credits: z.number().int().min(1).max(5000).optional() });

/**
 * Developer-only plan switch for testing gated features without Stripe.
 * Disabled unless DEV_BILLING=1 and never available in production builds.
 */
export const POST = route(async (req) => {
  if (!env.devBilling) throw new HttpError(404, "Not found.");
  const auth = await requireAuth();
  requireRole(auth, ["owner", "admin"]);
  const body = await parseJson(req, schema);
  if (body.plan) await applyPlanChange(auth.workspace.id, body.plan, { subscriptionStatus: body.plan === "free" ? null : "dev" });
  if (body.credits) await grantBonusCredits(auth.workspace.id, body.credits, "Developer credit grant (no payment)");
  return json({ ok: true });
});
