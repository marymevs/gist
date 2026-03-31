/**
 * Moon phase connector — pure computation, no external API.
 *
 * Uses a simplified lunation algorithm to determine the current moon phase.
 * Accurate to ~1 day, which is sufficient for a daily briefing.
 */

import type { Connector } from './types';

export type MoonData = {
  phase: string;
  emoji: string;
  illumination: number;
};

const PHASES = [
  { name: 'New Moon', emoji: '🌑' },
  { name: 'Waxing Crescent', emoji: '🌒' },
  { name: 'First Quarter', emoji: '🌓' },
  { name: 'Waxing Gibbous', emoji: '🌔' },
  { name: 'Full Moon', emoji: '🌕' },
  { name: 'Waning Gibbous', emoji: '🌖' },
  { name: 'Last Quarter', emoji: '🌗' },
  { name: 'Waning Crescent', emoji: '🌘' },
] as const;

/** Synodic month in days (new moon to new moon). */
const SYNODIC_MONTH = 29.53058770576;

/** Known new moon: January 6, 2000 at 18:14 UTC. */
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();

/**
 * Calculate the moon phase for a given date.
 * Returns a value 0-1 representing the lunation cycle (0 = new moon, 0.5 = full moon).
 */
export function getLunation(date: Date): number {
  const daysSinceKnown = (date.getTime() - KNOWN_NEW_MOON) / (1000 * 60 * 60 * 24);
  const lunation = daysSinceKnown / SYNODIC_MONTH;
  return lunation - Math.floor(lunation);
}

export function getMoonPhase(date: Date): MoonData {
  const lunation = getLunation(date);
  const phaseIndex = Math.round(lunation * 8) % 8;
  const phase = PHASES[phaseIndex];

  // Approximate illumination: 0 at new moon, 1 at full moon
  const illumination = Math.round((1 - Math.cos(lunation * 2 * Math.PI)) / 2 * 100) / 100;

  return {
    phase: phase.name,
    emoji: phase.emoji,
    illumination,
  };
}

export const moonConnector: Connector<MoonData> = {
  name: 'moon',
  async pull(ctx) {
    const data = getMoonPhase(ctx.now);
    return { data, status: 'ok' };
  },
};
