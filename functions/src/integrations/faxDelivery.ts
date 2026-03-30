/**
 * Fax delivery via iFax API.
 *
 * The HTML is base64-encoded and sent as a file attachment in the faxData array.
 *
 * Flow:
 *
 *   generateMorningGistForUser()
 *     └── sendMorningGistFax(params)
 *           ├── build JSON body  (faxNumber + faxData with base64 HTML)
 *           ├── POST /v1/customer/fax-send  (accessToken header)
 *           ├── [retry once on 5xx/timeout]
 *           └── return FaxResult { success, jobId? | error }
 *
 * Delivery confirmation comes later via the iFax webhook (faxWebhook.ts).
 * The scheduler marks status='queued' after a successful send; the webhook
 * updates it to 'delivered' or 'failed' once iFax reports back.
 */

import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

export const IFAX_API_KEY = defineSecret('IFAX_API_KEY');

const IFAX_SEND_URL = 'https://api.ifaxapp.com/v1/customer/fax-send';
const RETRY_DELAY_MS = 5_000;
const FETCH_TIMEOUT_MS = 30_000;

// ─── types ────────────────────────────────────────────────────────────────────

export type FaxResult =
  | { success: true; jobId: string }
  | { success: false; error: string };

// ─── helpers ─────────────────────────────────────────────────────────────────

function getApiKey(): string | null {
  let key = '';

  try {
    key = IFAX_API_KEY.value()?.trim() ?? '';
  } catch {
    key = process.env.IFAX_API_KEY?.trim() ?? '';
  }

  if (!key) return null;
  return key;
}

/**
 * One attempt to POST the fax to iFax.
 *
 * Returns:
 *   { ok: true, jobId }  on success (status === 1)
 *   { ok: false, permanent, message }  on any failure
 *     permanent=true  → do not retry (4xx client errors)
 *     permanent=false → may retry (5xx / network errors)
 */
async function attemptSend(
  faxNumber: string,
  html: string,
  apiKey: string,
): Promise<
  | { ok: true; jobId: string }
  | { ok: false; permanent: boolean; message: string }
> {
  const fileData = Buffer.from(html).toString('base64');

  const body = JSON.stringify({
    faxNumber,
    faxData: [
      {
        fileData,
        fileName: 'gist.html',
        fileType: 'text/html',
      },
    ],
  });

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    response = await fetch(IFAX_SEND_URL, {
      method: 'POST',
      headers: {
        accessToken: apiKey,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, permanent: false, message: `Network error: ${msg}` };
  }

  // 4xx → permanent failure (bad number, auth, etc.)
  if (response.status >= 400 && response.status < 500) {
    let text = '';
    try {
      text = await response.text();
    } catch {
      // ignore parse failure
    }
    return {
      ok: false,
      permanent: true,
      message: `iFax ${response.status}: ${text.slice(0, 200)}`,
    };
  }

  // 5xx → transient, caller will retry
  if (!response.ok) {
    return {
      ok: false,
      permanent: false,
      message: `iFax ${response.status} (server error)`,
    };
  }

  // Parse job ID from response JSON
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, permanent: true, message: 'iFax response was not valid JSON' };
  }

  // iFax returns { status: 1, message: "...", data: { jobId: "..." } }
  const parsed = data as Record<string, unknown> | null;
  const status = parsed?.status;
  const inner = parsed?.data as Record<string, unknown> | undefined;
  const jobId = inner?.jobId != null ? String(inner.jobId) : null;

  if (status !== 1 || !jobId) {
    const msg =
      typeof parsed?.message === 'string'
        ? parsed.message
        : 'iFax response missing jobId';
    return { ok: false, permanent: true, message: msg };
  }

  return { ok: true, jobId };
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Send a morning Gist as a fax via iFax.
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

  const apiKey = getApiKey();
  if (!apiKey) {
    logger.error('iFax API key not configured.', { userId });
    return { success: false, error: 'IFAX_API_KEY not configured.' };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) {
      logger.info('Retrying iFax fax send.', { userId, attempt });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    const result = await attemptSend(faxNumber, html, apiKey);

    if (result.ok) {
      logger.info('iFax fax queued.', { userId, jobId: result.jobId, attempt });
      return { success: true, jobId: result.jobId };
    }

    logger.warn('iFax fax send attempt failed.', {
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

  return { success: false, error: 'iFax fax failed after 2 attempts.' };
}
