/**
 * Stripe checkout session creation endpoint.
 *
 * Called from the frontend to create a Stripe Checkout session
 * for a new subscription. Returns the checkout URL for redirect.
 *
 * Auth required: Firebase Auth token must be present.
 */

import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { createCheckoutSession, STRIPE_SECRET_KEY } from './stripeUtils';

export const stripeCreateCheckout = onRequest(
  { secrets: [STRIPE_SECRET_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization token.' });
      return;
    }

    let uid: string;
    let email: string;
    try {
      const token = authHeader.split('Bearer ')[1];
      const decoded = await getAuth().verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email ?? '';
    } catch {
      res.status(401).json({ error: 'Invalid authorization token.' });
      return;
    }

    const { plan } = req.body as { plan?: string };
    if (plan !== 'print' && plan !== 'loop') {
      res.status(400).json({ error: 'Invalid plan. Must be "print" or "loop".' });
      return;
    }

    const origin = req.headers.origin ?? 'https://mygist.app';
    const result = await createCheckoutSession({
      userId: uid,
      email,
      plan,
      successUrl: `${origin}/today?checkout=success`,
      cancelUrl: `${origin}/account?checkout=canceled`,
    });

    if ('error' in result) {
      logger.error('Stripe checkout creation failed.', { userId: uid, error: result.error });
      res.status(500).json({ error: result.error });
      return;
    }

    res.status(200).json({ url: result.url });
  },
);
