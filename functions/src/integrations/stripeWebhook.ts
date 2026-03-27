/**
 * Stripe subscription webhook handler.
 *
 * Keeps the user's subscription status in Firestore in sync with Stripe.
 * The scheduler reads this cached status (not Stripe's API) to gate
 * fax delivery.
 *
 * Events handled:
 *   checkout.session.completed → set plan + status to 'active'
 *   invoice.payment_failed    → set status to 'past_due'
 *   customer.subscription.deleted → set status to 'canceled', plan to 'web'
 *   customer.subscription.updated → sync status (active/past_due)
 *
 * On Firestore write failure → return 500 so Stripe retries (up to 3x/24h).
 */

import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';
import { updateUserSubscription, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from './stripeUtils';

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

function getWebhookSecret(): string | null {
  try {
    return STRIPE_WEBHOOK_SECRET.value()?.trim() || null;
  } catch {
    return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  }
}

// ─── Cloud Function ──────────────────────────────────────────────────────────

export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      logger.error('Stripe secret key not configured.');
      res.status(500).send('Stripe not configured');
      return;
    }

    const webhookSecret = getWebhookSecret();
    if (!webhookSecret) {
      logger.error('Stripe webhook secret not configured.');
      res.status(500).send('Webhook secret not configured');
      return;
    }

    // Verify Stripe signature
    const signature = req.headers['stripe-signature'] as string | undefined;
    if (!signature) {
      res.status(400).send('Missing stripe-signature header');
      return;
    }

    let event: Stripe.Event;
    try {
      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed.', {
        error: err instanceof Error ? err.message : err,
      });
      res.status(400).send('Invalid signature');
      return;
    }

    logger.info('Stripe webhook received.', { type: event.type, id: event.id });

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          const plan = session.metadata?.plan as 'print' | 'loop' | undefined;

          if (!userId) {
            logger.warn('Stripe checkout.session.completed missing userId metadata.');
            break;
          }

          await updateUserSubscription(userId, {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionStatus: 'active',
            plan: plan ?? 'print',
          });

          logger.info('User subscription activated via checkout.', { userId, plan });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          // Find user by stripeCustomerId
          const userId = await findUserByCustomerId(customerId);
          if (!userId) {
            logger.warn('Stripe invoice.payment_failed: no user found.', { customerId });
            break;
          }

          await updateUserSubscription(userId, {
            stripeSubscriptionStatus: 'past_due',
          });

          logger.info('User subscription marked past_due.', { userId, customerId });
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          const userId = await findUserByCustomerId(customerId);
          if (!userId) {
            logger.warn('Stripe subscription.deleted: no user found.', { customerId });
            break;
          }

          await updateUserSubscription(userId, {
            stripeSubscriptionStatus: 'canceled',
            plan: 'web', // Downgrade to free web plan
          });

          logger.info('User subscription canceled.', { userId, customerId });
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          const userId = await findUserByCustomerId(customerId);
          if (!userId) {
            logger.warn('Stripe subscription.updated: no user found.', { customerId });
            break;
          }

          const status = subscription.status === 'active' ? 'active' :
                         subscription.status === 'past_due' ? 'past_due' :
                         subscription.status === 'canceled' ? 'canceled' : 'active';

          await updateUserSubscription(userId, {
            stripeSubscriptionStatus: status,
          });

          logger.info('User subscription updated.', { userId, customerId, status });
          break;
        }

        default:
          // Unknown event type — acknowledge without processing
          logger.info('Stripe webhook: unhandled event type.', { type: event.type });
      }

      res.status(200).send('OK');
    } catch (error) {
      // Return 500 so Stripe retries
      logger.error('Stripe webhook processing failed.', {
        eventType: event.type,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).send('Internal error — please retry');
    }
  },
);

// ─── user lookup ─────────────────────────────────────────────────────────────

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Find a user by their Stripe customer ID.
 * Returns the user's UID or null if not found.
 */
async function findUserByCustomerId(customerId: string): Promise<string | null> {
  const snapshot = await db
    .collection('users')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0].id;
}
