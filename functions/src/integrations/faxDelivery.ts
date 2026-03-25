/**
 * Fax delivery via Phaxio HTML-to-fax API.
 *
 * Phaxio renders the HTML server-side — no Puppeteer, no PDF generation.
 * The HTML is uploaded as a multipart/form-data file.
 *
 * Flow:
 *
 *   generateMorningGistForUser()
 *     └── sendMorningGistFax(params)
 *           ├── build FormData  (html blob + fax number)
 *           ├── POST /v2.1/faxes  (Phaxio basic-auth)
 *           ├── [retry once on 5xx/timeout]
 *           └── return FaxResult { success, faxId? | error }
 *
 * Delivery confirmation comes later via the Phaxio webhook (faxWebhook.ts).
 * The scheduler marks status='queued' after a successful send; the webhook
 * updates it to 'delivered' or 'failed' once Phaxio reports back.
 *
 * Sandbox mode: set PHAXIO_TEST_MODE=true to use Phaxio's test credentials
 * against the real API endpoint — faxes are simulated, not dialled.
 */

import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

export const PHAXIO_API_KEY = defineSecret('PHAXIO_API_KEY');
export const PHAXIO_API_SECRET = defineSecret('PHAXIO_API_SECRET');

const PHAXIO_FAX_URL = 'https://api.phaxio.com/v2.1/faxes';
const RETRY_DELAY_MS = 5_000;
const FETCH_TIMEOUT_MS = 30_000;

// ─── types ────────────────────────────────────────────────────────────────────

export type FaxResult =
  | { success: true; faxId: string }
  | { success: false; error: string };

// ─── helpers ─────────────────────────────────────────────────────────────────

function getApiCredentials(): { key: string; secret: string } | null {
  let key = '';
  let secret = '';

  try {
    key = PHAXIO_API_KEY.value()?.trim() ?? '';
  } catch {
    key = process.env.PHAXIO_API_KEY?.trim() ?? '';
  }

  try {
    secret = PHAXIO_API_SECRET.value()?.trim() ?? '';
  } catch {
    secret = process.env.PHAXIO_API_SECRET?.trim() ?? '';
  }

  if (!key || !secret) return null;
  return { key, secret };
}

/** Encode key:secret as HTTP Basic Auth header value. */
function basicAuth(key: string, secret: string): string {
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

/**
 * One attempt to POST the fax to Phaxio.
 *
 * Returns:
 *   { ok: true, faxId }  on HTTP 200 / 201 with a valid fax object
 *   { ok: false, permanent, message }  on any failure
 *     permanent=true  → do not retry (4xx client errors)
 *     permanent=false → may retry (5xx / network errors)
 */
async function attemptSend(
  faxNumber: string,
  html: string,
  credentials: { key: string; secret: string },
): Promise<
  | { ok: true; faxId: string }
  | { ok: false; permanent: boolean; message: string }
> {
  const form = new FormData();
  form.append('to', faxNumber);
  form.append(
    'file[]',
    new Blob([html], { type: 'text/html' }),
    'gist.html',
  );

  // In test mode Phaxio simulates the send without dialling.
  if (process.env.PHAXIO_TEST_MODE === 'true') {
    form.append('test_fail', 'false'); // explicitly succeed in test mode
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    response = await fetch(PHAXIO_FAX_URL, {
      method: 'POST',
      headers: { Authorization: basicAuth(credentials.key, credentials.secret) },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, permanent: false, message: `Network error: ${msg}` };
  }

  // 4xx → permanent failure (bad number, auth, etc.)
  if (response.status >= 400 && response.status < 500) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // ignore parse failure
    }
    return {
      ok: false,
      permanent: true,
      message: `Phaxio ${response.status}: ${body.slice(0, 200)}`,
    };
  }

  // 5xx → transient, caller will retry
  if (!response.ok) {
    return {
      ok: false,
      permanent: false,
      message: `Phaxio ${response.status} (server error)`,
    };
  }

  // Parse fax ID from response JSON
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, permanent: true, message: 'Phaxio response was not valid JSON' };
  }

  const faxId =
    typeof data === 'object' &&
    data !== null &&
    'data' in data &&
    typeof (data as Record<string, unknown>).data === 'object' &&
    (data as Record<string, unknown>).data !== null &&
    'id' in ((data as Record<string, unknown>).data as Record<string, unknown>)
      ? String(
          (
            (data as Record<string, unknown>).data as Record<string, unknown>
          ).id,
        )
      : null;

  if (!faxId) {
    return { ok: false, permanent: true, message: 'Phaxio response missing fax ID' };
  }

  return { ok: true, faxId };
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Send a morning Gist as a fax via Phaxio.
 *
 * Retries once on transient (5xx / network) errors.
 * Returns immediately on permanent (4xx) errors.
 */
export async function sendMorningGistFax(params: {
  faxNumber: string;
  html: string;
  userId: string; // for logging only
}): Promise<FaxResult> {
  const { faxNumber, html, userId } = params;

  if (!faxNumber.trim()) {
    return { success: false, error: 'No fax number provided.' };
  }

  const credentials = getApiCredentials();
  if (!credentials) {
    logger.error('Phaxio credentials not configured.', { userId });
    return { success: false, error: 'PHAXIO_API_KEY / PHAXIO_API_SECRET not configured.' };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) {
      logger.info('Retrying Phaxio fax send.', { userId, attempt });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    const result = await attemptSend(faxNumber, html, credentials);

    if (result.ok) {
      logger.info('Phaxio fax queued.', { userId, faxId: result.faxId, attempt });
      return { success: true, faxId: result.faxId };
    }

    logger.warn('Phaxio fax send attempt failed.', {
      userId,
      attempt,
      permanent: result.permanent,
      message: result.message,
    });

    if (result.permanent) {
      // Don't retry 4xx errors — they won't recover
      return { success: false, error: result.message };
    }
  }

  return { success: false, error: 'Phaxio fax failed after 2 attempts.' };
}
