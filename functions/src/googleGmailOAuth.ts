import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import type { Request } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from './firebaseAdmin';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { encryptTokenRecord, FIELD_ENCRYPTION_KEY } from './crypto/fieldCrypto';

const GOOGLE_CLIENT_ID = defineSecret('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');
const GOOGLE_GMAIL_OAUTH_REDIRECT_URI = defineSecret(
  'GOOGLE_GMAIL_OAUTH_REDIRECT_URI',
);

const db = getDb();

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

/**
 * Stored shape of an EmailAccount registry entry. Mirrors the `EmailAccount`
 * type in types.ts but allows `connectedAt` to be a FieldValue sentinel at
 * write time.
 */
type EmailAccountDoc = {
  id: string;
  email: string;
  label?: string;
  status: 'connected' | 'error';
  connectedAt?: unknown;
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
  // 'select_account' lets a user connecting a second inbox pick a different
  // account; 'consent' keeps Google returning a refresh_token each time.
  url.searchParams.set('prompt', 'select_account consent');
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

/**
 * Look up the email address of the inbox these tokens belong to. The OAuth
 * scope is `gmail.readonly`, so we can't rely on an `id_token.email` claim
 * (no `openid email` scope requested); `users/me/profile` works under
 * `gmail.readonly` and returns the canonical `emailAddress`. This address is
 * the stable identity for a connected inbox (issue #184).
 */
async function fetchGmailAddress(accessToken: string): Promise<string> {
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('Gmail getProfile failed', {
      status: response.status,
      body: body.slice(0, 300),
    });
    throw new Error('Failed to resolve Gmail account address');
  }
  const data = (await response.json()) as { emailAddress?: string };
  const email = asNonEmptyString(data.emailAddress)?.toLowerCase();
  if (!email) throw new Error('Gmail profile returned no email address');
  return email;
}

/** Integration doc id (and EmailAccount id) for a connected inbox. */
function emailAccountId(email: string): string {
  return `gmail:${email.toLowerCase()}`;
}

async function persistTokensForUser(
  uid: string,
  tokens: GoogleTokenResponse,
): Promise<void> {
  const expiryDate = Date.now() + tokens.expires_in * 1000;
  const expiresAt = Timestamp.fromMillis(expiryDate);

  const email = await fetchGmailAddress(tokens.access_token);
  const accountId = emailAccountId(email);

  // Only write token fields that are present. A re-consent for an already-
  // connected inbox may omit the refresh_token; with merge:true, writing a
  // null would clobber the good refresh token we already hold.
  const tokenFields: Record<string, unknown> = { accessToken: tokens.access_token };
  if (tokens.refresh_token) tokenFields['refreshToken'] = tokens.refresh_token;
  if (tokens.id_token) tokenFields['idToken'] = tokens.id_token;

  await db
    .collection('users')
    .doc(uid)
    .collection('integrations')
    .doc(accountId)
    .set(
      {
        ...encryptTokenRecord(tokenFields),
        provider: 'gmail',
        accountEmail: email,
        tokenType: tokens.token_type ?? null,
        scope: tokens.scope ?? null,
        expiryDate,
        expiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  // Upsert the inbox into the client-readable registry and recompute the
  // derived emailIntegration summary — transactionally so two concurrent
  // connects don't lose each other's entry.
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const existing = (snap.data()?.['emailAccounts'] as EmailAccountDoc[]) ?? [];
    const others = existing.filter((a) => a?.id !== accountId);
    const prior = existing.find((a) => a?.id === accountId);
    const entry: EmailAccountDoc = {
      id: accountId,
      email,
      status: 'connected',
      connectedAt: prior?.connectedAt ?? FieldValue.serverTimestamp(),
    };
    tx.set(
      userRef,
      {
        emailAccounts: [...others, entry],
        emailIntegration: {
          provider: 'gmail',
          status: 'connected',
          connectedAt: prior?.connectedAt ?? FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
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
      FIELD_ENCRYPTION_KEY,
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
