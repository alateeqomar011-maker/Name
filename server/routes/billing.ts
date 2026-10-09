// Premium subscriptions through Stripe Checkout and the Billing Portal (REST calls, no SDK).

import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response, Router } from 'express';
import { ensureUser, toMe, userById } from '../auth.ts';
import { config } from '../config.ts';
import { get, run } from '../db.ts';

export const billingRouter = Router();

export function paymentsConfigured(): boolean {
  return Boolean(config.stripe.secretKey && config.stripe.priceId);
}

async function stripe(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.stripe.secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message = (data.error as { message?: string } | undefined)?.message ?? `Stripe error ${res.status}`;
    throw new Error(message);
  }
  return data;
}

billingRouter.post('/billing/checkout', ensureUser, express.json(), async (req: Request, res: Response) => {
  const user = req.user!;
  if (!paymentsConfigured()) return void res.status(501).json({ error: 'payments_disabled', message: 'Payments are not configured on this server.' });
  if (!user.email) return void res.status(401).json({ error: 'account_required', message: 'Create an account first so your subscription is saved.' });
  try {
    const params: Record<string, string> = {
      mode: 'subscription',
      'line_items[0][price]': config.stripe.priceId,
      'line_items[0][quantity]': '1',
      success_url: `${config.publicUrl}/premium?status=success`,
      cancel_url: `${config.publicUrl}/premium?status=cancelled`,
      client_reference_id: user.id,
      allow_promotion_codes: 'true',
    };
    if (user.stripe_customer) params.customer = user.stripe_customer;
    else params.customer_email = user.email;
    const session = await stripe('checkout/sessions', params);
    res.json({ url: session.url });
  } catch (err) {
    res.status(502).json({ error: 'stripe', message: err instanceof Error ? err.message : 'Checkout failed.' });
  }
});

billingRouter.post('/billing/portal', ensureUser, async (req: Request, res: Response) => {
  const user = req.user!;
  if (!paymentsConfigured() || !user.stripe_customer) return void res.status(400).json({ error: 'no_subscription', message: 'No subscription found.' });
  try {
    const session = await stripe('billing_portal/sessions', { customer: user.stripe_customer, return_url: `${config.publicUrl}/premium` });
    res.json({ url: session.url });
  } catch (err) {
    res.status(502).json({ error: 'stripe', message: err instanceof Error ? err.message : 'Could not open the billing portal.' });
  }
});

/** Verifies a Stripe-Signature header (v1 scheme, 5 minute tolerance). */
export function verifyStripeSignature(payload: Buffer, header: string, secret: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload.toString('utf8')}`).digest('hex');
  const signatures = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  return signatures.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

billingRouter.post('/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), (req: Request, res: Response) => {
  if (!config.stripe.webhookSecret) return void res.status(501).end();
  const signature = String(req.headers['stripe-signature'] ?? '');
  if (!verifyStripeSignature(req.body as Buffer, signature, config.stripe.webhookSecret)) return void res.status(400).send('Bad signature');
  const event = JSON.parse((req.body as Buffer).toString('utf8')) as StripeEvent;
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = String(obj.client_reference_id ?? '');
      if (userById(userId)) {
        run(
          "UPDATE users SET plan = 'premium', plan_until = NULL, stripe_customer = ?, stripe_subscription = ? WHERE id = ?",
          String(obj.customer ?? ''),
          String(obj.subscription ?? ''),
          userId,
        );
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const customer = String(obj.customer ?? '');
      const status = String(obj.status ?? '');
      const active = event.type === 'customer.subscription.updated' && (status === 'active' || status === 'trialing');
      const periodEnd = Number(obj.current_period_end ?? 0);
      const row = get<{ id: string }>('SELECT id FROM users WHERE stripe_customer = ?', customer);
      if (row) {
        if (active) run("UPDATE users SET plan = 'premium', plan_until = NULL WHERE id = ?", row.id);
        else run("UPDATE users SET plan = 'premium', plan_until = ? WHERE id = ?", new Date((periodEnd || Date.now() / 1000) * 1000).toISOString(), row.id);
      }
      break;
    }
    default:
      break;
  }
  res.json({ received: true });
});

billingRouter.get('/billing/status', ensureUser, (req: Request, res: Response) => {
  res.json({ configured: paymentsConfigured(), me: toMe(req.user!) });
});
