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
import type { UserDoc } from './types';

const db = getDb();

export type DeliveryStatus = 'queued' | 'delivered' | 'failed';

// ─── buildUserDoc ─────────────────────────────────────────────────────────────

/**
 * Construct a UserDoc from a raw Firestore document. Single source of truth for
 * how stored user data maps onto the UserDoc shape — used by both the scheduled
 * morning gist path and the on-demand generation path so neither can silently
 * drop a field as new ones are added.
 */
export function buildUserDoc(uid: string, data: Record<string, any>): UserDoc {
  return {
    uid,
    email: data.email ?? null,
    prefs: data.prefs ?? {},
    delivery: data.delivery ?? {},
    calendarIntegration: data.calendarIntegration,
    emailIntegration: data.emailIntegration,
    gistIssueCount: data.gistIssueCount ?? 0,
    profile: data.profile ?? {},
  };
}

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
