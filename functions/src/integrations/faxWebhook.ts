/**
 * Phaxio fax delivery webhook handler.
 *
 * Phaxio calls this endpoint after attempting to deliver a fax.
 * The webhook confirms delivery status (success/failure) so the
 * user sees accurate delivery tracking in the UI.
 *
 * Flow:
 *
 *   Phaxio callback
 *     └── POST /faxWebhook
 *           ├── verify HMAC-SHA256 signature
 *           ├── extract faxId + status from payload
 *           ├── query morningGists by delivery.phaxioFaxId
 *           ├── update delivery.status → 'delivered' | 'failed'
 *           ├── write delivery log entry
 *           └── return 200 (or 403/500 on error)
 *
 * Signature validation:
 *   Phaxio signs the raw request body with HMAC-SHA256 using the
 *   webhook callback token. The signature is sent in the
 *   X-Phaxio-Signature header.
 */

import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { updateGistDeliveryStatus, writeDeliveryLog } from '../firestoreUtils';
import * as crypto from 'crypto';

const PHAXIO_WEBHOOK_TOKEN = defineSecret('PHAXIO_WEBHOOK_TOKEN');

const db = getFirestore();

// ─── types ────────────────────────────────────────────────────────────────────

/** Phaxio fax status values we handle. */
type PhaxioStatus = 'success' | 'failure' | 'partiallySent';

const KNOWN_STATUSES = new Set<string>(['success', 'failure', 'partiallySent']);

// ─── signature verification ──────────────────────────────────────────────────

/**
 * Verify the Phaxio HMAC-SHA256 signature.
 *
 * Phaxio computes HMAC-SHA256(webhook_token, url + sorted_params + files)
 * and sends it in X-Phaxio-Signature. For simplicity with JSON payloads,
 * we verify against the raw body.
 */
export function verifyPhaxioSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  webhookToken: string,
): boolean {
  if (!signature || !webhookToken) return false;

  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  const expected = crypto
    .createHmac('sha256', webhookToken)
    .update(bodyStr)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getWebhookToken(): string | null {
  try {
    return PHAXIO_WEBHOOK_TOKEN.value()?.trim() || null;
  } catch {
    return process.env.PHAXIO_WEBHOOK_TOKEN?.trim() || null;
  }
}

/**
 * Map Phaxio status to our delivery status.
 *   success       → delivered
 *   failure       → failed
 *   partiallySent → delivered (some pages got through — better than nothing)
 */
function mapPhaxioStatus(phaxioStatus: PhaxioStatus): 'delivered' | 'failed' {
  return phaxioStatus === 'failure' ? 'failed' : 'delivered';
}

/**
 * Find the user and dateKey for a given Phaxio fax ID by querying
 * across all users' morningGists collections.
 *
 * Uses the composite index on delivery.phaxioFaxId.
 */
async function findGistByFaxId(
  faxId: string,
): Promise<{ userId: string; dateKey: string } | null> {
  // The Firestore index supports collection-group queries on morningGists
  const snapshot = await db
    .collectionGroup('morningGists')
    .where('delivery.phaxioFaxId', '==', faxId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  // Path: users/{userId}/morningGists/{dateKey}
  const pathParts = doc.ref.path.split('/');
  return {
    userId: pathParts[1],
    dateKey: pathParts[3],
  };
}

// ─── Cloud Function ──────────────────────────────────────────────────────────

export const faxWebhook = onRequest(
  { secrets: [PHAXIO_WEBHOOK_TOKEN] },
  async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Verify signature
    const webhookToken = getWebhookToken();
    if (!webhookToken) {
      logger.error('PHAXIO_WEBHOOK_TOKEN not configured.');
      res.status(500).send('Webhook token not configured');
      return;
    }

    const signature = req.headers['x-phaxio-signature'] as string | undefined;
    const rawBody = req.rawBody ?? req.body;

    if (!verifyPhaxioSignature(rawBody, signature, webhookToken)) {
      logger.warn('Phaxio webhook signature verification failed.', {
        hasSignature: !!signature,
      });
      res.status(403).send('Invalid signature');
      return;
    }

    // Parse the payload
    let payload: Record<string, unknown>;
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      logger.warn('Phaxio webhook payload is not valid JSON.');
      res.status(400).send('Invalid JSON');
      return;
    }

    // Extract fax ID and status
    const faxData = payload.data as Record<string, unknown> | undefined;
    const faxId = faxData?.id ? String(faxData.id) : null;
    const faxStatus = faxData?.status as string | undefined;

    if (!faxId) {
      logger.warn('Phaxio webhook missing fax ID.', { payload });
      res.status(200).send('OK — no fax ID');
      return;
    }

    if (!faxStatus || !KNOWN_STATUSES.has(faxStatus)) {
      logger.warn('Phaxio webhook unknown status.', { faxId, faxStatus });
      // Return 200 — don't make Phaxio retry for unknown statuses
      res.status(200).send('OK — unknown status');
      return;
    }

    // Find the matching gist
    const gistMatch = await findGistByFaxId(faxId);
    if (!gistMatch) {
      logger.warn('Phaxio webhook: no matching gist for fax ID.', { faxId });
      res.status(200).send('OK — no matching gist');
      return;
    }

    const { userId, dateKey } = gistMatch;
    const deliveryStatus = mapPhaxioStatus(faxStatus as PhaxioStatus);

    // Update the gist delivery status
    try {
      await updateGistDeliveryStatus(userId, dateKey, deliveryStatus);

      await writeDeliveryLog(userId, {
        type: 'morning',
        method: 'fax',
        status: deliveryStatus,
        note: `Phaxio callback: ${faxStatus}`,
      });

      logger.info('Fax delivery status updated via webhook.', {
        userId,
        dateKey,
        faxId,
        phaxioStatus: faxStatus,
        deliveryStatus,
      });

      res.status(200).send('OK');
    } catch (error) {
      // Return 500 so Phaxio retries the webhook
      logger.error('Failed to update fax delivery status.', {
        userId,
        dateKey,
        faxId,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).send('Internal error — please retry');
    }
  },
);
