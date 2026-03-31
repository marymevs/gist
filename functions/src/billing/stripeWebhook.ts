/**
 * Stripe webhook handler — processes subscription lifecycle events.
 *
 * Events handled:
 *   checkout.session.completed    → activate subscription, update plan
 *   customer.subscription.updated → sync status (active, past_due, canceled)
 *   customer.subscription.deleted → mark canceled
 *   invoice.payment_failed        → mark past_due
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { getStripe, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from './stripeUtils';

const db = getFirestore();

export const stripeWebhook = onRequest(
  {
    region: 'us-central1',
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const stripe = getStripe();
    const sig = req.headers['stripe-signature'] as string | undefined;

    if (!sig) {
      res.status(400).send('Missing Stripe signature');
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value(),
      );
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
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          logger.info('Unhandled Stripe event type.', { type: event.type });
      }

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook processing error.', {
        type: event.type,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).send('Webhook processing failed');
    }
  },
);

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const uid = session.metadata?.firebaseUid;
  const plan = session.metadata?.plan;

  if (!uid) {
    logger.warn('Checkout session missing firebaseUid metadata.', { sessionId: session.id });
    return;
  }

  const update: Record<string, unknown> = {
    stripeCustomerId: session.customer as string,
    stripeSubscriptionStatus: 'active',
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Update plan if specified in metadata
  if (plan && ['print', 'loop'].includes(plan)) {
    update.plan = plan;
  }

  // Store subscription ID for future lookups
  if (session.subscription) {
    update.stripeSubscriptionId = session.subscription as string;
  }

  await db.collection('users').doc(uid).update(update);

  logger.info('Checkout completed — subscription activated.', { userId: uid, plan });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const uid = await findUserByCustomerId(subscription.customer as string);
  if (!uid) return;

  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'past_due',
    trialing: 'active',
  };

  const status = statusMap[subscription.status] ?? subscription.status;

  await db.collection('users').doc(uid).update({
    stripeSubscriptionStatus: status,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('Subscription updated.', { userId: uid, status });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const uid = await findUserByCustomerId(subscription.customer as string);
  if (!uid) return;

  await db.collection('users').doc(uid).update({
    stripeSubscriptionStatus: 'canceled',
    plan: 'web', // Downgrade to free plan
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('Subscription canceled — downgraded to web.', { userId: uid });
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const uid = await findUserByCustomerId(customerId);
  if (!uid) return;

  await db.collection('users').doc(uid).update({
    stripeSubscriptionStatus: 'past_due',
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.warn('Payment failed — marked past_due.', { userId: uid });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findUserByCustomerId(customerId: string): Promise<string | null> {
  const snap = await db
    .collection('users')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (snap.empty) {
    logger.warn('No user found for Stripe customer.', { customerId });
    return null;
  }

  return snap.docs[0].id;
}
