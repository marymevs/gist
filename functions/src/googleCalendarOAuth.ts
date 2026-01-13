import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import type { Request } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const GOOGLE_OAUTH_CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
const GOOGLE_OAUTH_REDIRECT_URI = defineSecret('GOOGLE_OAUTH_REDIRECT_URI');

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

async function resolveUid(req: Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.replace('Bearer ', '').trim();
    const decoded = await getAuth().verifyIdToken(idToken);
    return decoded.uid;
  }

  const uid = req.body?.uid;
  if (typeof uid === 'string' && uid.trim()) {
    return uid.trim();
  }

  throw new Error(
    'Missing user identifier. Provide Authorization bearer token or uid.'
  );
}

export const exchangeGoogleCalendarCode = onRequest(
  {
    cors: true,
    secrets: [
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REDIRECT_URI,
    ],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const code = req.body?.code;
      if (typeof code !== 'string' || !code.trim()) {
        res.status(400).json({ error: 'Missing authorization code' });
        return;
      }

      const uid = await resolveUid(req);
      const tokenEndpoint = 'https://oauth2.googleapis.com/token';
      const body = new URLSearchParams({
        code: code.trim(),
        client_id: GOOGLE_OAUTH_CLIENT_ID.value(),
        client_secret: GOOGLE_OAUTH_CLIENT_SECRET.value(),
        redirect_uri: GOOGLE_OAUTH_REDIRECT_URI.value(),
        grant_type: 'authorization_code',
      });

      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        logger.error('Google token exchange failed', {
          status: tokenResponse.status,
          body: errorBody,
        });
        res
          .status(502)
          .json({ error: 'Failed to exchange authorization code' });
        return;
      }

      const tokenJson = (await tokenResponse.json()) as GoogleTokenResponse;
      const expiresAt = Timestamp.fromMillis(
        Date.now() + tokenJson.expires_in * 1000
      );

      await db
        .collection('users')
        .doc(uid)
        .collection('integrations')
        .doc('googleCalendar')
        .set(
          {
            accessToken: tokenJson.access_token,
            refreshToken: tokenJson.refresh_token ?? null,
            tokenType: tokenJson.token_type ?? null,
            scope: tokenJson.scope ?? null,
            expiresAt,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Google OAuth exchange error', error);
      res.status(500).json({ error: 'Unexpected error exchanging code' });
    }
  }
);
