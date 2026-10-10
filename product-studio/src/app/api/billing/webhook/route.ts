import { handleStripeEvent, stripe } from "@/server/billing";
import { env } from "@/server/env";
import { HttpError, json, route } from "@/server/http";

/** Stripe webhook endpoint. Verifies the signature against the raw body. */
export const POST = route(
  async (req) => {
    if (!env.stripeWebhookSecret) throw new HttpError(503, "Webhook secret not configured.");
    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "Missing signature.");
    const payload = await req.text();
    let event;
    try {
      event = stripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
    } catch {
      throw new HttpError(400, "Invalid signature.");
    }
    const result = await handleStripeEvent(event);
    return json({ received: true, ...result });
  },
  { skipOriginCheck: true },
);
