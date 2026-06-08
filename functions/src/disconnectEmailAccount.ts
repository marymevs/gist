/**
 * Disconnect a single connected Gmail inbox (issue #184).
 *
 * OAuth token docs live in users/{uid}/integrations/* which clients cannot
 * touch (Firestore rules: `write: if false`), so removal must go through a
 * server-side callable. Deletes the token doc, removes the inbox from the
 * client-readable `emailAccounts` registry, and recomputes the derived
 * `emailIntegration` summary that drives delivery routing.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebaseAdmin';
import type { EmailAccount } from './types';

export const disconnectEmailAccount = onCall(
  { region: 'us-central1' },
  async (request): Promise<{ success: true; remaining: number }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Sign in to manage email accounts.',
      );
    }

    const accountId = (request.data as { accountId?: unknown })?.accountId;
    if (typeof accountId !== 'string' || !accountId.trim()) {
      throw new HttpsError('invalid-argument', 'accountId is required.');
    }

    const db = getDb();
    const userRef = db.collection('users').doc(uid);

    // Remove the server-only token doc first; idempotent if already gone.
    await userRef.collection('integrations').doc(accountId).delete();

    const remaining = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const existing =
        (snap.data()?.['emailAccounts'] as EmailAccount[] | undefined) ?? [];
      const next = existing.filter((account) => account?.id !== accountId);
      const anyConnected = next.some(
        (account) => account.status === 'connected',
      );
      tx.set(
        userRef,
        {
          emailAccounts: next,
          emailIntegration: {
            provider: 'gmail',
            status: anyConnected ? 'connected' : 'disconnected',
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return next.length;
    });

    logger.info('Disconnected Gmail account.', { uid, accountId, remaining });
    return { success: true, remaining };
  },
);
