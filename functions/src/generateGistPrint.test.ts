/**
 * Tests for pure helper functions in generateGistPrint.ts.
 *
 * The Cloud Function handler itself (HTTP + Firebase Admin) is integration-tested
 * separately. We inline the pure functions here to avoid Firebase initialization
 * side effects, following the same pattern as morningGistRouting.test.ts.
 */

import { describe, it, expect } from 'vitest';

// ── inlined pure helpers (mirrors generateGistPrint.ts) ──────────────────────

function todayDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function dateLabel(dateKey: string, timezone: string): string {
  const [y, mo, d] = dateKey.split('-').map(Number);
  // noon UTC anchor — correct in all UTC-12 to UTC+11 timezones
  const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return date.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function isValidDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('isValidDateKey', () => {
  it('accepts valid YYYY-MM-DD strings', () => {
    expect(isValidDateKey('2026-03-25')).toBe(true);
    expect(isValidDateKey('2000-01-01')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isValidDateKey('2026-3-25')).toBe(false);   // single-digit month
    expect(isValidDateKey('20260325')).toBe(false);     // no dashes
    expect(isValidDateKey('2026/03/25')).toBe(false);   // wrong separator
    expect(isValidDateKey('')).toBe(false);
    expect(isValidDateKey('not-a-date')).toBe(false);
  });
});

describe('todayDateKey', () => {
  it('returns a YYYY-MM-DD string', () => {
    const key = todayDateKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the current date in America/New_York timezone', () => {
    const key = todayDateKey();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    // parts returns YYYY-MM-DD in en-CA locale
    expect(key).toBe(parts);
  });
});

describe('dateLabel', () => {
  it('formats a date key as a human-readable string', () => {
    const label = dateLabel('2026-03-25', 'America/New_York');
    // "Wednesday, Mar 25" — exact weekday name verifiable
    expect(label).toContain('Mar');
    expect(label).toContain('25');
    expect(label).toMatch(/\w+, \w+ \d+/); // e.g. "Wednesday, Mar 25"
  });

  it('uses noon UTC so the calendar day is correct for US timezones (regression: off-by-one fix)', () => {
    // America/New_York is UTC-4 or UTC-5.
    // Midnight UTC (old code) would show the PREVIOUS day for US users.
    // Noon UTC (fix) stays on the correct calendar day.
    const label = dateLabel('2026-01-01', 'America/New_York');
    expect(label).toContain('Jan');
    expect(label).toContain('1');
    // Must NOT show Dec 31 (what midnight UTC would produce for US timezones)
    expect(label).not.toContain('Dec');
    expect(label).not.toContain('31');
  });

  it('works for a timezone ahead of UTC', () => {
    const label = dateLabel('2026-03-25', 'Asia/Tokyo');
    expect(label).toContain('Mar');
    expect(label).toContain('25');
  });
});
