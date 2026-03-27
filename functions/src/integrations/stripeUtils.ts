/**
 * Stripe billing utilities.
 *
 * Handles subscription status checks and checkout session creation.
 * The subscription status is cached in Firestore (user doc) and kept
 * fresh by the Stripe webhook. The scheduler reads the cached status
 * to avoid calling Stripe's API on every run.
 *
 * Architecture:
 *
 *   Stripe webhook  ──▶  stripeWebhook.ts  ──▶  Firestore (user doc)
 *                                                   │
 *   Scheduler  ──▶  checkSubscriptionActive()  ◀────┘
 *                    (reads cached status only)
 *
 * Fail-open policy: if the cached status read fails (Firestore error),
 * default to ALLOWING the fax. $0.07 per fax << cost of lost trust.
 */

import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';

export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Price IDs configured in Stripe dashboard
export const STRIPE_PRICE_PRINT = process.env.STRIPE_PRICE_PRINT ?? '';
export const STRIPE_PRICE_LOOP = process.env.STRIPE_PRICE_LOOP ?? '';

const db = getFirestore();

// ─── types ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'demo' | 'none';

// ─── helpers ─────────────────────────────────────────────────────────────────

function getStripeClient(): Stripe | null {
  let key = '';
  try {
    key = STRIPE_SECRET_KEY.value()?.trim() ?? '';
  } catch {
    key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  }
  if (!key) return null;
  return new Stripe(key);
}

// ─── subscription check (reads Firestore cache, not Stripe API) ─────────────

/**
 * Check if a user has an active subscription by reading the cached
 * status from Firestore. Does NOT call the Stripe API.
 *
 * Fail-open: returns true on any error (Firestore read failure, missing
 * field, etc.) — better to send one extra fax than to block a paying user.
 */
export async function checkSubscriptionActive(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      logger.warn('checkSubscriptionActive: user doc not found.', { userId });
      return true; // fail-open
    }

    const data = userDoc.data();
    const status = data?.stripeSubscriptionStatus as SubscriptionStatus | undefined;

    // Founder bypass: 'demo' status means internal user, always allow
    if (status === 'demo') return true;

    // Active subscriptions pass
    if (status === 'active') return true;

    // All other statuses (past_due, canceled, none, undefined) → blocked
    logger.info('Subscription not active — blocking fax delivery.', {
      userId,
      status: status ?? 'none',
    });
    return false;
  } catch (error) {
    // Fail-open: if we can't read the status, allow the fax
    logger.warn('checkSubscriptionActive failed — defaulting to allow (fail-open).', {
      userId,
      error: error instanceof Error ? error.message : error,
    });
    return true;
  }
}

// ─── Stripe checkout session creation ────────────────────────────────────────

/**
 * Create a Stripe Checkout session for a new subscription.
 * Returns the checkout URL for redirect.
 */
export async function createCheckoutSession(params: {
  userId: string;
  email: string;
  plan: 'print' | 'loop';
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | { error: string }> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { error: 'Stripe not configured.' };
  }

  const priceId = params.plan === 'print' ? STRIPE_PRICE_PRINT : STRIPE_PRICE_LOOP;
  if (!priceId) {
    return { error: `No Stripe price ID configured for plan: ${params.plan}` };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: params.email,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { userId: params.userId, plan: params.plan },
      },
      metadata: { userId: params.userId, plan: params.plan },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    if (!session.url) {
      return { error: 'Stripe did not return a checkout URL.' };
    }

    return { url: session.url };
  } catch (error) {
    logger.error('Failed to create Stripe checkout session.', {
      userId: params.userId,
      error: error instanceof Error ? error.message : error,
    });
    return { error: error instanceof Error ? error.message : 'Stripe checkout failed.' };
  }
}

// ─── update user subscription status in Firestore ────────────────────────────

/**
 * Update the user's subscription status and Stripe customer ID in Firestore.
 * Called by the Stripe webhook handler.
 */
export async function updateUserSubscription(
  userId: string,
  update: {
    stripeCustomerId?: string;
    stripeSubscriptionStatus: SubscriptionStatus;
    plan?: 'web' | 'print' | 'loop';
  },
): Promise<void> {
  const fields: Record<string, unknown> = {
    stripeSubscriptionStatus: update.stripeSubscriptionStatus,
  };
  if (update.stripeCustomerId) {
    fields.stripeCustomerId = update.stripeCustomerId;
  }
  if (update.plan) {
    fields.plan = update.plan;
  }

  await db.collection('users').doc(userId).update(fields);
}
