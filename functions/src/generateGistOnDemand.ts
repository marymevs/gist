/**
 * On-demand gist generation — triggered after onboarding completes.
 * Authenticates via Firebase Auth ID token, generates a gist immediately.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from './firebaseAdmin';
import { WEATHERAPI_KEY } from './integrations/weather';
import { NYT_API_KEY } from './integrations/nytTopStories';
import { ANTHROPIC_API_KEY } from './integrations/claudeUtils';
import { RESEND_API_KEY } from './integrations/emailDelivery';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from './integrations/googleCalendarInt';
import { generateMorningGistForUser } from './generateMorningGist';
import { buildUserDoc } from './firestoreUtils';
import { Timestamp } from 'firebase-admin/firestore';
import {
  safeTimezone,
  toDateKeyISO,
  computeNextDeliveryDate,
} from './helpers';

const db = getDb();

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

    const user = buildUserDoc(uid, userSnap.data() ?? {});

    logger.info('On-demand gist generation requested.', { userId: uid });

    try {
      const now = new Date();
      await generateMorningGistForUser(user, now);

      // Seed the scheduler fields so this user enters the 15-min delivery
      // sweep. Mark today as already generated (this preview counts) so the
      // scheduler won't double-deliver, and point nextDeliveryAt at their
      // next slot in their own timezone.
      const timezone = safeTimezone(user.prefs?.timezone);
      await db.collection('users').doc(uid).update({
        lastGeneratedDate: toDateKeyISO(now, timezone),
        nextDeliveryAt: Timestamp.fromDate(
          computeNextDeliveryDate(now, timezone, user.delivery?.schedule),
        ),
      });

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
