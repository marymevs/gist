import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import type { Request } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createHmac, timingSafeEqual } from 'node:crypto';

const GOOGLE_CLIENT_ID = defineSecret('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');
const GOOGLE_GMAIL_OAUTH_REDIRECT_URI = defineSecret(
  'GOOGLE_GMAIL_OAUTH_REDIRECT_URI',
);

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

type OAuthStatePayload = {
  uid: string;
  origin: string;
  issuedAtMs: number;
};

const GOOGLE_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return asNonEmptyString(value);
  if (Array.isArray(value) && value.length) {
    return asNonEmptyString(value[0]);
  }
  return null;
}

function parseQueryValue(value: unknown): string | null {
  if (typeof value === 'string') return asNonEmptyString(value);
  if (Array.isArray(value) && value.length && typeof value[0] === 'string') {
    return asNonEmptyString(value[0]);
  }
  return null;
}

function signState(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
}

function createStateToken(payload: OAuthStatePayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const signature = signState(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifyStateToken(
  stateToken: string,
  secret: string,
): OAuthStatePayload | null {
  const [encodedPayload, providedSignature] = stateToken.split('.');
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = signState(encodedPayload, secret);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const maybePayload = parsed as Partial<OAuthStatePayload>;
  const uid = asNonEmptyString(maybePayload.uid);
  const origin = normalizeOrigin(asNonEmptyString(maybePayload.origin));
  if (!uid || !origin || typeof maybePayload.issuedAtMs !== 'number') {
    return null;
  }

  const now = Date.now();
  const maxFutureSkewMs = 60 * 1000;
  if (maybePayload.issuedAtMs > now + maxFutureSkewMs) return null;
  if (now - maybePayload.issuedAtMs > OAUTH_STATE_MAX_AGE_MS) return null;

  return {
    uid,
    origin,
    issuedAtMs: maybePayload.issuedAtMs,
  };
}

function buildAuthorizationUrl(stateToken: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID.value());
  url.searchParams.set('redirect_uri', GOOGLE_GMAIL_OAUTH_REDIRECT_URI.value());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_GMAIL_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', stateToken);
  return url.toString();
}

async function exchangeAuthorizationCode(
  code: string,
): Promise<GoogleTokenResponse> {
  const tokenEndpoint = 'https://oauth2.googleapis.com/token';
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID.value(),
    client_secret: GOOGLE_CLIENT_SECRET.value(),
    redirect_uri: GOOGLE_GMAIL_OAUTH_REDIRECT_URI.value(),
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
    logger.error('Gmail token exchange failed', {
      status: tokenResponse.status,
      body: errorBody,
    });
    throw new Error('Failed to exchange authorization code');
  }

  const tokenJson = (await tokenResponse.json()) as GoogleTokenResponse;
  if (
    !tokenJson.access_token ||
    typeof tokenJson.expires_in !== 'number' ||
    tokenJson.expires_in <= 0
  ) {
    throw new Error('Invalid token response from Google');
  }

  return tokenJson;
}

async function persistTokensForUser(
  uid: string,
  tokens: GoogleTokenResponse,
): Promise<void> {
  const expiryDate = Date.now() + tokens.expires_in * 1000;
  const expiresAt = Timestamp.fromMillis(expiryDate);

  await db
    .collection('users')
    .doc(uid)
    .collection('integrations')
    .doc('gmail')
    .set(
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenType: tokens.token_type ?? null,
        scope: tokens.scope ?? null,
        idToken: tokens.id_token ?? null,
        expiryDate,
        expiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        emailIntegration: {
          provider: 'gmail',
          status: 'connected',
          connectedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderPopupResultHtml(params: {
  success: boolean;
  message: string;
  origin: string;
}): string {
  const payload = JSON.stringify({
    source: 'google-gmail-oauth',
    success: params.success,
    message: params.message,
  });
  const targetOrigin = JSON.stringify(params.origin);
  const safeMessage = escapeHtml(params.message);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Gmail Connection</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="font-family: sans-serif; padding: 24px; line-height: 1.5">
    <p>${safeMessage}</p>
    <script>
      (function () {
        const payload = ${payload};
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, ${targetOrigin});
          }
        } catch {}
        window.close();
      })();
    </script>
  </body>
</html>`;
}

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
    'Missing user identifier. Provide Authorization bearer token or uid.',
  );
}

export const exchangeGoogleGmailCode = onRequest(
  {
    cors: true,
    secrets: [
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_GMAIL_OAUTH_REDIRECT_URI,
    ],
  },
  async (req, res) => {
    if (req.method === 'GET') {
      const code = parseQueryValue(req.query.code);
      const stateToken = parseQueryValue(req.query.state);

      if (!code || !stateToken) {
        res.status(400).send('Missing OAuth callback parameters.');
        return;
      }

      const verifiedState = verifyStateToken(
        stateToken,
        GOOGLE_CLIENT_SECRET.value(),
      );
      if (!verifiedState) {
        res
          .status(400)
          .send('Invalid or expired OAuth state. Please retry connecting.');
        return;
      }

      try {
        const tokens = await exchangeAuthorizationCode(code);
        await persistTokensForUser(verifiedState.uid, tokens);
        res
          .status(200)
          .type('html')
          .send(
            renderPopupResultHtml({
              success: true,
              message: 'Gmail connected. You can close this window now.',
              origin: verifiedState.origin,
            }),
          );
        return;
      } catch (error) {
        logger.error('Gmail OAuth callback exchange error', { error });
        res
          .status(500)
          .type('html')
          .send(
            renderPopupResultHtml({
              success: false,
              message: 'Unable to connect Gmail right now. Please try again.',
              origin: verifiedState.origin,
            }),
          );
        return;
      }
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const body = (req.body ?? {}) as {
        action?: unknown;
        origin?: unknown;
        code?: unknown;
      };

      if (asNonEmptyString(body.action) === 'start') {
        const uid = await resolveUid(req);
        const requestOrigin = normalizeOrigin(
          asNonEmptyString(body.origin) ??
            parseHeaderValue(req.headers.origin) ??
            null,
        );
        if (!requestOrigin) {
          res.status(400).json({ error: 'Missing request origin' });
          return;
        }

        const stateToken = createStateToken(
          {
            uid,
            origin: requestOrigin,
            issuedAtMs: Date.now(),
          },
          GOOGLE_CLIENT_SECRET.value(),
        );
        const callbackOrigin = new URL(GOOGLE_GMAIL_OAUTH_REDIRECT_URI.value())
          .origin;

        res.status(200).json({
          authorizationUrl: buildAuthorizationUrl(stateToken),
          callbackOrigin,
        });
        return;
      }

      const code = asNonEmptyString(body.code);
      if (!code) {
        res.status(400).json({ error: 'Missing authorization code' });
        return;
      }

      const uid = await resolveUid(req);
      const tokenJson = await exchangeAuthorizationCode(code);
      await persistTokensForUser(uid, tokenJson);

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Gmail OAuth exchange error', error);
      res.status(500).json({ error: 'Unexpected error exchanging code' });
    }
  },
);
