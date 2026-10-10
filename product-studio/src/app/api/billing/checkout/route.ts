import { z } from "zod";
import { requireAuth, requireRole } from "@/server/auth/session";
import { createPackCheckout, createSubscriptionCheckout } from "@/server/billing";
import { json, parseJson, rateLimit, route } from "@/server/http";

const schema = z.union([
  z.object({ plan: z.enum(["starter", "pro", "business"]), interval: z.enum(["month", "year"]), confirmed: z.literal(true) }),
  z.object({ pack: z.enum(["pack_100", "pack_500", "pack_1500"]), confirmed: z.literal(true) }),
]);

/** Returns a Stripe-hosted Checkout (or Billing Portal) URL. Requires explicit confirmation from the UI. */
export const POST = route(async (req) => {
  const auth = await requireAuth();
  requireRole(auth, ["owner", "admin"]);
  rateLimit(`checkout:${auth.user.id}`, 20, 60 * 60 * 1000);
  const body = await parseJson(req, schema);
  if ("pack" in body) return json(await createPackCheckout(auth, body.pack));
  return json(await createSubscriptionCheckout(auth, body.plan, body.interval));
});
