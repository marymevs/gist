/**
 * Create a Stripe Checkout Session for plan upgrades.
 *
 * POST /createCheckoutSession
 * Auth: Firebase ID token (Bearer)
 * Body: { plan: 'print' | 'loop' }
 *
 * Returns: { url: string } — Stripe Checkout URL to redirect to.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStripe, STRIPE_SECRET_KEY, PRICE_IDS } from './stripeUtils';
import type { GistPlan } from '../types';

const db = getFirestore();

export const createCheckoutSession = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Verify Firebase Auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization' });
      return;
    }

    let uid: string;
    try {
      const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const { plan } = req.body as { plan?: string };
    if (!plan || !['print', 'loop'].includes(plan)) {
      res.status(400).json({ error: 'Invalid plan. Must be "print" or "loop".' });
      return;
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      res.status(500).json({ error: `Price ID not configured for plan: ${plan}` });
      return;
    }

    // Load user doc
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const email = userData?.email as string | undefined;

    const stripe = getStripe();

    try {
      // Reuse existing Stripe customer if we have one
      let customerId = userData?.stripeCustomerId as string | undefined;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { firebaseUid: uid },
        });
        customerId = customer.id;

        // Save customer ID
        await db.collection('users').doc(uid).update({
          stripeCustomerId: customerId,
        });
      }

      const origin = req.headers.origin || 'https://mygist.app';

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/account?billing=success`,
        cancel_url: `${origin}/account?billing=canceled`,
        metadata: {
          firebaseUid: uid,
          plan,
        },
      });

      logger.info('Stripe Checkout session created.', {
        userId: uid,
        plan,
        sessionId: session.id,
      });

      res.status(200).json({ url: session.url });
    } catch (error) {
      logger.error('Failed to create Checkout session.', {
        userId: uid,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  },
);
