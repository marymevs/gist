/**
 * Shared Firestore helpers used by the morning gist scheduler.
 * Extracted here to avoid circular imports.
 *
 * Data model:
 *
 *   users/{uid}/morningGists/{dateKey}   ← gist doc, delivery.status updated here
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from './firebaseAdmin';

const db = getDb();

export type DeliveryStatus = 'queued' | 'delivered' | 'failed';

// ─── updateGistDeliveryStatus ─────────────────────────────────────────────────

/**
 * Update the delivery.status (and optionally delivery.deliveredAt) on a
 * morningGists document. Called by the scheduler after email/web delivery.
 */
export async function updateGistDeliveryStatus(
  userId: string,
  dateKey: string,
  status: DeliveryStatus,
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
