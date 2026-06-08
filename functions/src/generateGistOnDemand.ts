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
import { FIELD_ENCRYPTION_KEY } from './crypto/fieldCrypto';
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
      FIELD_ENCRYPTION_KEY,
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

    // Point nextDeliveryAt at the user's next slot in their own timezone.
    // Computed up front so we can seed it whether or not generation succeeds —
    // the scheduler query excludes docs missing this field, so failing to seed
    // it strands the user out of the recurring loop entirely (issue #195).
    const now = new Date();
    const timezone = safeTimezone(user.prefs?.timezone);
    const nextDeliveryAt = Timestamp.fromDate(
      computeNextDeliveryDate(now, timezone, user.delivery?.schedule),
    );

    try {
      await generateMorningGistForUser(user, now);

      // Seed the scheduler fields so this user enters the 15-min delivery
      // sweep. Mark today as already generated (this preview counts) so the
      // scheduler won't double-deliver.
      await db.collection('users').doc(uid).update({
        lastGeneratedDate: toDateKeyISO(now, timezone),
        nextDeliveryAt,
      });

      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error('On-demand gist generation failed.', {
        userId: uid,
        error: error instanceof Error ? error.message : error,
      });

      // Still seed nextDeliveryAt so the user enters the recurring loop despite
      // the failed preview. Deliberately leave lastGeneratedDate unset: the
      // scheduler will then generate today's gist at the user's normal slot as
      // a recovery. Best-effort — never let this mask the original failure.
      await db
        .collection('users')
        .doc(uid)
        .update({ nextDeliveryAt })
        .catch((seedError) => {
          logger.error('Failed to seed nextDeliveryAt after generation failure.', {
            userId: uid,
            error: seedError instanceof Error ? seedError.message : seedError,
          });
        });

      res.status(500).json({ error: 'Generation failed' });
    }
  },
);
