import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getDb } from './firebaseAdmin';
import { WEATHERAPI_KEY } from './integrations/weather';
import { NYT_API_KEY } from './integrations/nytTopStories';
import { OPENAI_API_KEY } from './integrations/openaiGist';
import { RESEND_API_KEY } from './integrations/emailDelivery';
import { PHAXIO_API_KEY, PHAXIO_API_SECRET } from './integrations/faxDelivery';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from './integrations/googleCalendarInt';
import { generateMorningGistForUser, type UserDoc } from './generateMorningGist';

/**
 * Callable Cloud Function that regenerates and re-delivers
 * the morning gist for the authenticated user.
 *
 * Used by the "Resend" and "Retry" buttons on the delivery page.
 */
export const resendMorningGist = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    secrets: [
      WEATHERAPI_KEY,
      NYT_API_KEY,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      OPENAI_API_KEY,
      RESEND_API_KEY,
      PHAXIO_API_KEY,
      PHAXIO_API_SECRET,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to resend your gist.');
    }

    const uid = request.auth.uid;
    const db = getDb();

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User profile not found.');
    }

    const userDoc = userSnap.data() as UserDoc;
    // Ensure uid is set (Firestore doc ID may not be in the data)
    userDoc.uid = uid;

    logger.info('Resend requested', { uid });

    await generateMorningGistForUser(userDoc, new Date());

    return { success: true };
  },
);
