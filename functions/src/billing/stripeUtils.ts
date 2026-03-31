/**
 * Stripe utilities — shared Stripe client, secret, and helpers.
 *
 * Products/prices:
 *   web   → free (no Stripe subscription)
 *   print → $25/mo (Stripe subscription required)
 *   loop  → $45/mo (Stripe subscription required)
 */

import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';

export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
      apiVersion: '2026-03-25.dahlia',
    });
  }
  return _stripe;
}

/** Plan → Stripe Price ID mapping. Set these in Firebase env/secrets config. */
export const PRICE_IDS: Record<string, string | undefined> = {
  print: process.env.STRIPE_PRICE_PRINT ?? undefined,
  loop: process.env.STRIPE_PRICE_LOOP ?? undefined,
};

/**
 * Check if a user's Stripe subscription is active.
 * Returns true for free plans (no subscription needed).
 */
export async function isSubscriptionActive(
  stripeCustomerId: string | null | undefined,
  plan: string,
): Promise<boolean> {
  // Free plan — always active
  if (plan === 'web') return true;

  // No customer ID means no subscription
  if (!stripeCustomerId) return false;

  const stripe = getStripe();
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    limit: 1,
  });

  return subscriptions.data.length > 0;
}
