import "server-only";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { CREDIT_PACKS, PLANS, type BillingInterval, type PlanId } from "@/lib/plans";
import type { AuthContext } from "./auth/session";
import { applyPlanChange, grantBonusCredits } from "./credits";
import { getDb } from "./db";
import { billingEvents, workspaces, type Workspace } from "./db/schema";
import { env } from "./env";
import { HttpError } from "./http";

// Subscriptions and credit packs through Stripe. Users are always sent to
// Stripe-hosted Checkout / Billing Portal, where they review the amount and
// explicitly confirm — this server never charges a card on its own.

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  if (!env.stripeSecretKey) {
    throw new HttpError(503, "Payments aren't configured on this server yet.", "payments_unavailable");
  }
  if (!stripeClient) stripeClient = new Stripe(env.stripeSecretKey, { appInfo: { name: "Vitrine" }, maxNetworkRetries: 2 });
  return stripeClient;
}

/** Stable lookup keys created by `npm run stripe:setup`. */
export function lookupKey(item: string) {
  return `vitrine_${item}`;
}

const priceCache = new Map<string, string>();

async function priceFor(item: string): Promise<string> {
  const configured = env.stripePrices[item];
  if (configured) return configured;
  if (priceCache.has(item)) return priceCache.get(item)!;
  const res = await stripe().prices.list({ lookup_keys: [lookupKey(item)], active: true, limit: 1 });
  const price = res.data[0]?.id;
  if (!price) {
    throw new HttpError(503, "This plan isn't available for purchase yet. Please contact support.", "price_missing");
  }
  priceCache.set(item, price);
  return price;
}

/** Maps a Stripe price back to our plan + interval. */
async function planForPrice(priceId: string): Promise<{ plan: PlanId; interval: BillingInterval } | null> {
  for (const [item, configured] of Object.entries(env.stripePrices)) {
    if (configured && configured === priceId && !item.startsWith("pack_")) {
      const [plan, interval] = item.split("_") as [PlanId, BillingInterval];
      return { plan, interval };
    }
  }
  const price = await stripe().prices.retrieve(priceId);
  const key = price.lookup_key?.replace(/^vitrine_/, "");
  if (key && !key.startsWith("pack_")) {
    const [plan, interval] = key.split("_") as [PlanId, BillingInterval];
    if (plan in PLANS) return { plan, interval };
  }
  const metaPlan = price.metadata?.plan as PlanId | undefined;
  if (metaPlan && metaPlan in PLANS) return { plan: metaPlan, interval: (price.recurring?.interval as BillingInterval) ?? "month" };
  return null;
}

async function ensureCustomer(auth: AuthContext): Promise<string> {
  if (auth.workspace.stripeCustomerId) return auth.workspace.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: auth.user.email,
    name: auth.workspace.name,
    metadata: { workspaceId: auth.workspace.id, ownerId: auth.workspace.ownerId },
  });
  const db = await getDb();
  await db.update(workspaces).set({ stripeCustomerId: customer.id }).where(eq(workspaces.id, auth.workspace.id));
  return customer.id;
}

function hasActiveSubscription(ws: Workspace) {
  return Boolean(ws.stripeSubscriptionId) && ["active", "trialing", "past_due"].includes(ws.subscriptionStatus ?? "");
}

export async function createSubscriptionCheckout(auth: AuthContext, plan: PlanId, interval: BillingInterval) {
  if (plan === "free") throw new HttpError(400, "The Free plan doesn't need checkout.");
  if (hasActiveSubscription(auth.workspace)) {
    // Plan changes for existing subscribers go through the Billing Portal, which
    // shows the prorated amount and asks for confirmation.
    return { url: await createPortalSession(auth), mode: "portal" as const };
  }
  const customer = await ensureCustomer(auth);
  const price = await priceFor(`${plan}_${interval}`);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: auth.workspace.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    metadata: { workspaceId: auth.workspace.id, plan, interval },
    subscription_data: { metadata: { workspaceId: auth.workspace.id, plan, interval } },
    success_url: `${env.appUrl}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/app/billing?checkout=canceled`,
  });
  if (!session.url) throw new HttpError(502, "Stripe didn't return a checkout link. Please try again.");
  return { url: session.url, mode: "checkout" as const };
}

export async function createPackCheckout(auth: AuthContext, packId: string) {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new HttpError(400, "Unknown credit pack.");
  const customer = await ensureCustomer(auth);
  const price = await priceFor(pack.id);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    client_reference_id: auth.workspace.id,
    line_items: [{ price, quantity: 1 }],
    metadata: { workspaceId: auth.workspace.id, pack: pack.id, credits: String(pack.credits) },
    payment_intent_data: { metadata: { workspaceId: auth.workspace.id, pack: pack.id } },
    success_url: `${env.appUrl}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/app/billing?checkout=canceled`,
  });
  if (!session.url) throw new HttpError(502, "Stripe didn't return a checkout link. Please try again.");
  return { url: session.url };
}

export async function createPortalSession(auth: AuthContext) {
  const customer = await ensureCustomer(auth);
  const session = await stripe().billingPortal.sessions.create({
    customer,
    return_url: `${env.appUrl}/app/billing`,
  });
  return session.url;
}

// ── Webhooks ─────────────────────────────────────────────────────────────

function periodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

async function workspaceFor(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.workspaceId) return sub.metadata.workspaceId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const db = await getDb();
  const rows = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.stripeCustomerId, customerId)).limit(1);
  return rows[0]?.id ?? null;
}

async function syncSubscription(sub: Stripe.Subscription) {
  const workspaceId = await workspaceFor(sub);
  if (!workspaceId) {
    console.warn(`[billing] no workspace for subscription ${sub.id}`);
    return;
  }
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const priceId = sub.items.data[0]?.price?.id;
  const mapped = priceId ? await planForPrice(priceId) : null;
  const fields: Partial<Workspace> = {
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: periodEnd(sub),
    billingInterval: mapped?.interval ?? null,
  };
  if (active && mapped) {
    const db = await getDb();
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (ws && ws.plan !== mapped.plan) {
      await applyPlanChange(workspaceId, mapped.plan, fields);
    } else {
      await db.update(workspaces).set({ ...fields, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
    }
  } else if (!active) {
    await applyPlanChange(workspaceId, "free", { ...fields, billingInterval: null });
  }
}

export async function handleStripeEvent(event: Stripe.Event) {
  const db = await getDb();
  // Idempotency: each Stripe event is processed once.
  const inserted = await db
    .insert(billingEvents)
    .values({ id: event.id, type: event.type, data: { created: event.created } })
    .onConflictDoNothing()
    .returning({ id: billingEvents.id });
  if (!inserted.length) return { duplicate: true };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id;
        if (!workspaceId) break;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe().subscriptions.retrieve(subId));
        } else if (session.mode === "payment" && session.payment_status === "paid") {
          const credits = Number(session.metadata?.credits ?? 0);
          if (credits > 0) await grantBonusCredits(workspaceId, credits, `Purchased ${credits} credits`);
        }
        await db.update(billingEvents).set({ workspaceId }).where(eq(billingEvents.id, event.id));
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id;
        const credits = Number(session.metadata?.credits ?? 0);
        if (workspaceId && session.mode === "payment" && credits > 0) {
          await grantBonusCredits(workspaceId, credits, `Purchased ${credits} credits`);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    // Allow Stripe to retry: forget the event so the retry isn't treated as a duplicate.
    await db.delete(billingEvents).where(eq(billingEvents.id, event.id));
    throw err;
  }
  return { duplicate: false };
}
