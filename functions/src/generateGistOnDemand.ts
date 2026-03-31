/**
 * On-demand gist generation — triggered after onboarding completes.
 * Authenticates via Firebase Auth ID token, generates a gist immediately.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { WEATHERAPI_KEY } from './integrations/weather';
import { NYT_API_KEY } from './integrations/nytTopStories';
import {
  ANTHROPIC_API_KEY,
} from './integrations/claudeGist';
import { RESEND_API_KEY } from './integrations/emailDelivery';
import {
  PHAXIO_API_KEY,
  PHAXIO_API_SECRET,
} from './integrations/faxDelivery';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from './integrations/googleCalendarInt';
import { generateMorningGistForUser } from './generateMorningGist';
import type { UserDoc, GistPlan, IntegrationStatus } from './types';

const db = getFirestore();

export const generateGistOnDemand = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    cors: true,
    secrets: [
      WEATHERAPI_KEY,
      NYT_API_KEY,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      ANTHROPIC_API_KEY,
      RESEND_API_KEY,
      PHAXIO_API_KEY,
      PHAXIO_API_SECRET,
    ],
  },
  async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const idToken = authHeader.slice(7);
    let uid: string;
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: 'Invalid ID token' });
      return;
    }

    // Load user doc
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const data = userSnap.data() as Partial<
      UserDoc & {
        calendarIntegration?: IntegrationStatus;
        emailIntegration?: IntegrationStatus;
      }
    >;

    const user: UserDoc = {
      uid,
      email: data.email ?? null,
      plan: (data.plan as GistPlan) ?? 'web',
      prefs: data.prefs ?? {},
      delivery: data.delivery ?? {},
      calendarIntegration: data.calendarIntegration,
      emailIntegration: data.emailIntegration,
      stripeCustomerId: data.stripeCustomerId ?? null,
      stripeSubscriptionStatus: data.stripeSubscriptionStatus ?? 'demo',
    };

    logger.info('On-demand gist generation requested.', { userId: uid });

    try {
      await generateMorningGistForUser(user, new Date());
      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error('On-demand gist generation failed.', {
        userId: uid,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Generation failed' });
    }
  },
);
