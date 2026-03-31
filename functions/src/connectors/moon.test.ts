import { describe, it, expect } from 'vitest';
import { getMoonPhase, getLunation, moonConnector } from './moon';
import type { ConnectorContext } from './types';

function makeCtx(dateStr: string): ConnectorContext {
  return {
    userId: 'test',
    dateKey: dateStr.slice(0, 10),
    timezone: 'America/New_York',
    city: 'New York, NY',
    now: new Date(dateStr),
  };
}

describe('getLunation', () => {
  it('returns ~0 for a known new moon date', () => {
    // Jan 6, 2000 was the reference new moon
    const lunation = getLunation(new Date('2000-01-06T18:14:00Z'));
    expect(lunation).toBeCloseTo(0, 1);
  });

  it('returns ~0.5 for approximately a full moon', () => {
    // ~14.77 days after new moon = full moon
    const fullMoon = new Date('2000-01-21T04:40:00Z');
    const lunation = getLunation(fullMoon);
    expect(lunation).toBeCloseTo(0.5, 1);
  });

  it('returns a value between 0 and 1', () => {
    const lunation = getLunation(new Date('2026-03-31T12:00:00Z'));
    expect(lunation).toBeGreaterThanOrEqual(0);
    expect(lunation).toBeLessThan(1);
  });
});

describe('getMoonPhase', () => {
  it('returns a phase name and emoji', () => {
    const result = getMoonPhase(new Date('2026-03-31T12:00:00Z'));
    expect(result.phase).toBeTruthy();
    expect(result.emoji).toBeTruthy();
    expect(result.illumination).toBeGreaterThanOrEqual(0);
    expect(result.illumination).toBeLessThanOrEqual(1);
  });

  it('returns New Moon near a known new moon date', () => {
    const result = getMoonPhase(new Date('2000-01-06T18:14:00Z'));
    expect(result.phase).toBe('New Moon');
    expect(result.emoji).toBe('🌑');
    expect(result.illumination).toBeCloseTo(0, 1);
  });

  it('returns Full Moon near a known full moon date', () => {
    const result = getMoonPhase(new Date('2000-01-21T04:40:00Z'));
    expect(result.phase).toBe('Full Moon');
    expect(result.emoji).toBe('🌕');
    expect(result.illumination).toBeCloseTo(1, 1);
  });

  it('returns different phases for different dates', () => {
    const a = getMoonPhase(new Date('2026-03-01T12:00:00Z'));
    const b = getMoonPhase(new Date('2026-03-15T12:00:00Z'));
    // Two weeks apart should be roughly opposite phases
    expect(a.phase).not.toBe(b.phase);
  });
});

describe('moonConnector', () => {
  it('has name "moon"', () => {
    expect(moonConnector.name).toBe('moon');
  });

  it('always returns status ok (pure computation)', async () => {
    const result = await moonConnector.pull(makeCtx('2026-03-31T12:00:00Z'));
    expect(result.status).toBe('ok');
    expect(result.data.phase).toBeTruthy();
    expect(result.data.emoji).toBeTruthy();
  });
});
