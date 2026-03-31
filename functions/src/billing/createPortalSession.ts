/**
 * Create a Stripe Customer Portal session (manage subscription, invoices).
 *
 * POST /createPortalSession
 * Auth: Firebase ID token (Bearer)
 * Returns: { url: string }
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStripe, STRIPE_SECRET_KEY } from './stripeUtils';

const db = getFirestore();

export const createPortalSession = onRequest(
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

    const userSnap = await db.collection('users').doc(uid).get();
    const customerId = userSnap.data()?.stripeCustomerId as string | undefined;

    if (!customerId) {
      res.status(400).json({ error: 'No Stripe customer found. Subscribe to a plan first.' });
      return;
    }

    const stripe = getStripe();
    const origin = req.headers.origin || 'https://mygist.app';

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/account`,
      });

      logger.info('Stripe Portal session created.', { userId: uid });
      res.status(200).json({ url: session.url });
    } catch (error) {
      logger.error('Failed to create Portal session.', {
        userId: uid,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  },
);
