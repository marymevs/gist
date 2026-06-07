/**
 * HMAC signing for email-feedback links (issue #177, Finding 5).
 *
 * The /emailFeedback endpoint is unauthenticated by design — the link is the
 * credential. To stop an attacker from forging feedback for an arbitrary uid
 * (which would poison that user's personalization memory), every link carries
 * an HMAC-SHA256 signature over its parameters. The endpoint recomputes the
 * signature and rejects any mismatch with a constant-time compare.
 *
 * When the email template starts rendering feedback links, it must call
 * signFeedbackParams() to produce the `sig` query param.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';

/** HMAC key for feedback-link signatures. Stored in Secret Manager. */
export const FEEDBACK_LINK_SECRET = defineSecret('FEEDBACK_LINK_SECRET');

export type FeedbackParams = {
  uid: string;
  date: string;
  card: string;
  cat: string;
  rating: string;
};

/** Canonical, order-stable message the signature is computed over. */
function canonical(p: FeedbackParams): string {
  return [p.uid, p.date, p.card, p.cat, p.rating].join('|');
}

function resolveSecret(): string {
  const secret =
    process.env.FEEDBACK_LINK_SECRET?.trim() || safeSecretValue();
  if (!secret) {
    throw new Error(
      'FEEDBACK_LINK_SECRET is not set. Generate one with ' +
        '`openssl rand -base64 32` and store it as a Firebase secret.',
    );
  }
  return secret;
}

function safeSecretValue(): string {
  try {
    return FEEDBACK_LINK_SECRET.value()?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Produce the URL-safe signature to append as the `sig` query param. */
export function signFeedbackParams(p: FeedbackParams): string {
  return createHmac('sha256', resolveSecret())
    .update(canonical(p))
    .digest('base64url');
}

/**
 * Constant-time verification of a feedback-link signature. Returns false for a
 * missing, malformed, or mismatched signature.
 */
export function verifyFeedbackSignature(
  p: FeedbackParams,
  sig: string | undefined,
): boolean {
  if (!sig) return false;
  const expected = signFeedbackParams(p);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
