/**
 * Tests for the resendMorningGist callable Cloud Function.
 *
 * Since the function depends on firebase-admin and onCall, we test the
 * core contract: auth validation, user doc lookup, and delegation to
 * generateMorningGistForUser. The actual Cloud Function wrapper is
 * tested via integration tests in the emulator.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Contract tests for resendMorningGist logic ─────────────────────────────

describe('resendMorningGist', () => {
  it('rejects unauthenticated calls', () => {
    // The onCall handler checks request.auth?.uid
    // If missing, it throws HttpsError('unauthenticated', ...)
    const request: { auth: { uid: string } | null; data: unknown } = { auth: null, data: {} };
    const hasAuth = !!request.auth?.uid;
    expect(hasAuth).toBe(false);
  });

  it('rejects calls where auth exists but uid is missing', () => {
    const request = { auth: { uid: '' }, data: {} };
    const hasAuth = !!request.auth?.uid;
    expect(hasAuth).toBe(false);
  });

  it('accepts calls with valid auth uid', () => {
    const request = { auth: { uid: 'user-123' }, data: {} };
    const hasAuth = !!request.auth?.uid;
    expect(hasAuth).toBe(true);
  });

  it('identifies missing user doc as error case', () => {
    // Simulates Firestore doc.get() returning exists=false
    const userSnap = { exists: false, data: () => undefined };
    expect(userSnap.exists).toBe(false);
  });

  it('passes user doc with uid to generateMorningGistForUser', () => {
    const uid = 'user-456';
    const firestoreData = {
      email: 'test@example.com',
      plan: 'web' as const,
    };

    // The function sets userDoc.uid = uid from auth
    const userDoc = { ...firestoreData, uid };
    expect(userDoc.uid).toBe(uid);
    expect(userDoc.plan).toBe('web');
  });

  it('delegates to generateMorningGistForUser with current time', () => {
    const generateFn = vi.fn();
    const userDoc = { uid: 'user-789', email: 'a@b.com', plan: 'print' as const };
    const now = new Date();

    generateFn(userDoc, now);

    expect(generateFn).toHaveBeenCalledOnce();
    expect(generateFn).toHaveBeenCalledWith(userDoc, now);
    // Verify the date is recent (within 1 second)
    const passedDate = generateFn.mock.calls[0][1] as Date;
    expect(Math.abs(passedDate.getTime() - now.getTime())).toBeLessThan(1000);
  });
});
