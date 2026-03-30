/**
 * Shared Firestore helpers used by both the morning gist scheduler and the
 * fax webhook handler. Extracted here to avoid circular imports.
 *
 * Data model:
 *
 *   users/{uid}/morningGists/{dateKey}   ← gist doc, delivery.status updated here
 *   users/{uid}/deliveryLogs/{auto-id}   ← append-only log, one entry per event
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

export type DeliveryMethod = 'web' | 'email' | 'fax';
export type DeliveryStatus = 'queued' | 'delivered' | 'failed';

// ─── updateGistDeliveryStatus ─────────────────────────────────────────────────

/**
 * Update the delivery.status (and optionally delivery.deliveredAt) on a
 * morningGists document. Called by the scheduler after email/web delivery and
 * by the fax webhook after iFax confirms the fax.
 */
export async function updateGistDeliveryStatus(
  userId: string,
  dateKey: string,
  status: 'delivered' | 'failed',
  extra?: Record<string, unknown>,
): Promise<void> {
  const update: Record<string, unknown> = {
    'delivery.status': status,
    ...extra,
  };
  if (status === 'delivered') {
    update['delivery.deliveredAt'] = Timestamp.now();
  }
  await db
    .collection('users')
    .doc(userId)
    .collection('morningGists')
    .doc(dateKey)
    .update(update);
}

// ─── writeDeliveryLog ─────────────────────────────────────────────────────────

/**
 * Append a delivery log entry. Each meaningful delivery event (queued, delivered,
 * failed) gets its own entry — the delivery page shows the latest 50.
 */
export async function writeDeliveryLog(
  userId: string,
  payload: {
    type: 'morning';
    method: DeliveryMethod;
    status: string;
    pages?: number;
    note?: string;
  },
): Promise<void> {
  await db
    .collection('users')
    .doc(userId)
    .collection('deliveryLogs')
    .doc()
    .set({
      type: payload.type,
      method: payload.method,
      status: payload.status,
      pages: payload.pages ?? null,
      note: payload.note ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
}
