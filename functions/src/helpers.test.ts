/**
 * Tests for pure helper functions extracted from generateMorningGist.ts.
 * No Firebase imports — these run without emulator.
 */

import { describe, it, expect } from 'vitest';
import {
  hasConnectedIntegration,
  resolveDeliveryMethod,
  toDateKeyISO,
  toDateLabel,
  safeTimezone,
  estimatePages,
  normalizeDayItems,
  normalizeEmailCards,
} from './helpers';
import type { UserDoc } from './types';

// ── Minimal user factories ──────────────────────────────────────────────────

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return {
    uid: 'test-user',
    email: 'test@example.com',
    plan: 'web',
    ...overrides,
  };
}

// ── resolveDeliveryMethod ───────────────────────────────────────────────────

describe('resolveDeliveryMethod', () => {
  it('returns fax for print plan regardless of integrations', () => {
    expect(resolveDeliveryMethod(makeUser({ plan: 'print' }))).toBe('fax');
  });

  it('returns fax for print plan even when Gmail is connected', () => {
    expect(
      resolveDeliveryMethod(
        makeUser({ plan: 'print', emailIntegration: { status: 'connected' } }),
      ),
    ).toBe('fax');
  });

  it('returns email for web plan when Gmail is connected', () => {
    expect(
      resolveDeliveryMethod(
        makeUser({ plan: 'web', emailIntegration: { status: 'connected' } }),
      ),
    ).toBe('email');
  });

  it('returns email for loop plan when Gmail is connected', () => {
    expect(
      resolveDeliveryMethod(
        makeUser({ plan: 'loop', emailIntegration: { status: 'connected' } }),
      ),
    ).toBe('email');
  });

  it('returns web for loop plan when Gmail is disconnected', () => {
    expect(
      resolveDeliveryMethod(
        makeUser({ plan: 'loop', emailIntegration: { status: 'disconnected' } }),
      ),
    ).toBe('web');
  });

  it('returns web for web plan with no integrations', () => {
    expect(resolveDeliveryMethod(makeUser({ plan: 'web' }))).toBe('web');
  });
});

// ── hasConnectedIntegration ─────────────────────────────────────────────────

describe('hasConnectedIntegration', () => {
  it('returns true when calendar is connected', () => {
    expect(
      hasConnectedIntegration(
        makeUser({ calendarIntegration: { status: 'connected' } }),
      ),
    ).toBe(true);
  });

  it('returns true when Gmail is connected', () => {
    expect(
      hasConnectedIntegration(
        makeUser({ emailIntegration: { status: 'connected' } }),
      ),
    ).toBe(true);
  });

  it('returns true when both are connected', () => {
    expect(
      hasConnectedIntegration(
        makeUser({
          calendarIntegration: { status: 'connected' },
          emailIntegration: { status: 'connected' },
        }),
      ),
    ).toBe(true);
  });

  it('returns false when both are disconnected', () => {
    expect(
      hasConnectedIntegration(
        makeUser({
          calendarIntegration: { status: 'disconnected' },
          emailIntegration: { status: 'disconnected' },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when no integrations are present', () => {
    expect(hasConnectedIntegration(makeUser())).toBe(false);
  });
});

// ── toDateKeyISO ────────────────────────────────────────────────────────────

describe('toDateKeyISO', () => {
  it('formats date as YYYY-MM-DD in the given timezone', () => {
    // 2026-03-15 at midnight UTC → still 2026-03-14 in New York (UTC-4 in March)
    const date = new Date('2026-03-15T03:00:00Z');
    expect(toDateKeyISO(date, 'America/New_York')).toBe('2026-03-14');
  });

  it('handles timezone crossing date boundary', () => {
    // 2026-01-01 at 01:00 UTC → still Dec 31 in Los Angeles
    const date = new Date('2026-01-01T01:00:00Z');
    expect(toDateKeyISO(date, 'America/Los_Angeles')).toBe('2025-12-31');
  });
});

// ── toDateLabel ─────────────────────────────────────────────────────────────

describe('toDateLabel', () => {
  it('formats date as human-readable label', () => {
    const date = new Date('2026-03-15T12:00:00Z');
    const label = toDateLabel(date, 'America/New_York');
    expect(label).toContain('Mar');
    expect(label).toContain('15');
  });
});

// ── safeTimezone ────────────────────────────────────────────────────────────

describe('safeTimezone', () => {
  it('returns the timezone when valid', () => {
    expect(safeTimezone('America/Chicago')).toBe('America/Chicago');
  });

  it('returns America/New_York for undefined', () => {
    expect(safeTimezone(undefined)).toBe('America/New_York');
  });

  it('returns America/New_York for invalid timezone', () => {
    expect(safeTimezone('Not/A/Timezone')).toBe('America/New_York');
  });
});

// ── estimatePages ───────────────────────────────────────────────────────────

describe('estimatePages', () => {
  it('returns 2 by default', () => {
    expect(estimatePages()).toBe(2);
    expect(estimatePages(undefined)).toBe(2);
  });

  it('returns the value when within range', () => {
    expect(estimatePages(1)).toBe(1);
    expect(estimatePages(3)).toBe(3);
  });

  it('caps at 3', () => {
    expect(estimatePages(5)).toBe(3);
    expect(estimatePages(100)).toBe(3);
  });

  it('returns 2 for zero or negative', () => {
    expect(estimatePages(0)).toBe(2);
    expect(estimatePages(-1)).toBe(2);
  });
});

// ── normalizeDayItems ───────────────────────────────────────────────────────

describe('normalizeDayItems', () => {
  it('trims whitespace from all fields', () => {
    const result = normalizeDayItems([
      { time: '  9:00 AM  ', title: ' Team standup ', note: ' Optional ' },
    ]);
    expect(result).toEqual([
      { time: '9:00 AM', title: 'Team standup', note: 'Optional' },
    ]);
  });

  it('omits empty time and note fields', () => {
    const result = normalizeDayItems([
      { time: '  ', title: 'All day event', note: '   ' },
    ]);
    expect(result).toEqual([{ title: 'All day event' }]);
  });

  it('handles items with no optional fields', () => {
    const result = normalizeDayItems([{ title: 'Focus time' }]);
    expect(result).toEqual([{ title: 'Focus time' }]);
  });
});

// ── normalizeEmailCards ─────────────────────────────────────────────────────

describe('normalizeEmailCards', () => {
  it('preserves required fields and strips undefined optional fields', () => {
    const cards = [
      {
        id: '1',
        threadId: 't1',
        messageId: 'm1',
        subject: 'Test',
        snippet: 'Hello',
        receivedAt: '2026-03-15T10:00:00Z',
        category: 'Action' as const,
        urgency: 3,
        importance: 4,
        why: 'From VIP',
      },
    ];
    const result = normalizeEmailCards(cards);
    expect(result[0].id).toBe('1');
    expect(result[0].subject).toBe('Test');
    expect(result[0]).not.toHaveProperty('fromName');
    expect(result[0]).not.toHaveProperty('fromEmail');
  });

  it('includes optional fields when present', () => {
    const cards = [
      {
        id: '2',
        threadId: 't2',
        messageId: 'm2',
        subject: 'Important',
        snippet: 'Review needed',
        receivedAt: '2026-03-15T10:00:00Z',
        category: 'Action' as const,
        urgency: 5,
        importance: 5,
        why: 'Urgent',
        fromName: 'Alice',
        fromEmail: 'alice@example.com',
        suggestedNextStep: 'Review PR',
      },
    ];
    const result = normalizeEmailCards(cards);
    expect(result[0].fromName).toBe('Alice');
    expect(result[0].fromEmail).toBe('alice@example.com');
    expect(result[0].suggestedNextStep).toBe('Review PR');
  });
});
