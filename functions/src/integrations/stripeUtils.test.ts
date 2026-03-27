/**
 * Tests for stripeUtils.ts — subscription status checks.
 *
 * Tests the Firestore-cached subscription check with fail-open behavior.
 * Stripe API is NOT called — we only test the Firestore read path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock variables (must be declared before vi.mock) ─────────────────────────
const mockGet = vi.fn();

// ── stub firebase imports ────────────────────────────────────────────────────
vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({
    value: () => { throw new Error('not available in test'); },
  }),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: mockGet }),
    }),
  }),
}));

import { checkSubscriptionActive } from './stripeUtils';

// ── tests ────────────────────────────────────────────────────────────────────

describe('checkSubscriptionActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true for active subscription', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ stripeSubscriptionStatus: 'active' }),
    });

    expect(await checkSubscriptionActive('user-1')).toBe(true);
  });

  it('returns true for demo (founder bypass)', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ stripeSubscriptionStatus: 'demo' }),
    });

    expect(await checkSubscriptionActive('user-1')).toBe(true);
  });

  it('returns false for past_due', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ stripeSubscriptionStatus: 'past_due' }),
    });

    expect(await checkSubscriptionActive('user-1')).toBe(false);
  });

  it('returns false for canceled', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ stripeSubscriptionStatus: 'canceled' }),
    });

    expect(await checkSubscriptionActive('user-1')).toBe(false);
  });

  it('returns false when no subscription status field exists', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: 'test@test.com' }),
    });

    expect(await checkSubscriptionActive('user-1')).toBe(false);
  });

  it('returns true (fail-open) when user doc not found', async () => {
    mockGet.mockResolvedValue({ exists: false });

    expect(await checkSubscriptionActive('user-1')).toBe(true);
  });

  it('returns true (fail-open) when Firestore read throws', async () => {
    mockGet.mockRejectedValue(new Error('Firestore unavailable'));

    expect(await checkSubscriptionActive('user-1')).toBe(true);
  });
});
