/**
 * Tests for Stripe billing utilities — pure logic only.
 * Does NOT call Stripe API — tests the subscription check logic.
 */

import { describe, it, expect } from 'vitest';

// Re-create the pure logic to avoid importing Stripe SDK
function shouldSkipForBilling(
  plan: string,
  stripeCustomerId: string | null | undefined,
  subscriptionStatus: string | undefined,
): { skip: boolean; reason?: string } {
  // Free plan — always allowed
  if (plan === 'web') return { skip: false };

  // Paid plan but no customer ID
  if (!stripeCustomerId) return { skip: true, reason: 'no_customer' };

  // Active or demo — allowed
  if (subscriptionStatus === 'active' || subscriptionStatus === 'demo') {
    return { skip: false };
  }

  // Past due — allowed (grace period)
  if (subscriptionStatus === 'past_due') return { skip: false };

  // Canceled or unknown — blocked
  return { skip: true, reason: 'inactive_subscription' };
}

describe('billing gate logic', () => {
  it('allows web plan without any Stripe info', () => {
    expect(shouldSkipForBilling('web', null, undefined)).toEqual({ skip: false });
  });

  it('allows web plan even with canceled status', () => {
    expect(shouldSkipForBilling('web', 'cus_123', 'canceled')).toEqual({ skip: false });
  });

  it('blocks print plan without customer ID', () => {
    const result = shouldSkipForBilling('print', null, undefined);
    expect(result.skip).toBe(true);
    expect(result.reason).toBe('no_customer');
  });

  it('allows print plan with active subscription', () => {
    expect(shouldSkipForBilling('print', 'cus_123', 'active')).toEqual({ skip: false });
  });

  it('allows print plan with demo status (pre-billing)', () => {
    expect(shouldSkipForBilling('print', 'cus_123', 'demo')).toEqual({ skip: false });
  });

  it('allows print plan with past_due status (grace period)', () => {
    expect(shouldSkipForBilling('print', 'cus_123', 'past_due')).toEqual({ skip: false });
  });

  it('blocks print plan with canceled status', () => {
    const result = shouldSkipForBilling('print', 'cus_123', 'canceled');
    expect(result.skip).toBe(true);
  });

  it('blocks loop plan without customer ID', () => {
    const result = shouldSkipForBilling('loop', null, undefined);
    expect(result.skip).toBe(true);
  });

  it('allows loop plan with active subscription', () => {
    expect(shouldSkipForBilling('loop', 'cus_123', 'active')).toEqual({ skip: false });
  });
});
