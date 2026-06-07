/**
 * Pure helper functions for the morning gist pipeline.
 * No Firebase imports — safe to use in tests without mocking.
 */

import type { EmailCard } from './integrations/gmailInt';
import type { UserDoc, DeliveryMethod } from './types';

export function hasConnectedIntegration(user: UserDoc): boolean {
  return (
    user.calendarIntegration?.status === 'connected' ||
    user.emailIntegration?.status === 'connected'
  );
}

/**
 * Resolve delivery method.
 *
 *   Gmail connected → email  (primary; email-to-print is the active delivery path)
 *   otherwise       → web    (rendered at /today, no email sent)
 *
 * Note: `plan` is no longer consulted. Fax used to route here for `print`
 * plans; that path was removed in Phase 1.2 of the prune-and-realign plan.
 */
export function resolveDeliveryMethod(user: UserDoc): DeliveryMethod {
  if (user.emailIntegration?.status === 'connected') return 'email';
  return 'web';
}

export function toDateKeyISO(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function toDateLabel(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Milliseconds that `timeZone` is offset from UTC at the given instant.
 * Positive east of UTC (e.g. +3_600_000 for CET), negative west
 * (e.g. -25_200_000 for PDT). Accounts for DST via the Intl database.
 */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24, // some engines emit "24" for midnight under h23
    get('minute'),
    get('second'),
  );
  return asUTC - at.getTime();
}

/**
 * Convert a wall-clock time in a given IANA timezone to the corresponding
 * UTC instant. e.g. (2026, 6, 6, 7, 0, 'America/Los_Angeles') → the UTC
 * Date for 7:00 AM Pacific on that day.
 *
 * Treats the components as if UTC, corrects by the zone's offset, then
 * re-corrects using the offset at the *resolved* instant. The second pass
 * matters on DST-transition days: the offset at the initial guess can be the
 * pre-transition one (e.g. PST) while the real delivery time is post-transition
 * (PDT), which would otherwise put `nextDeliveryAt` an hour off.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guessUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = tzOffsetMs(timeZone, new Date(guessUTC));
  const utc1 = guessUTC - offset1;

  // Re-evaluate the offset at the resolved instant; if it changed, we crossed a
  // DST boundary, so recompute with the correct (post-transition) offset.
  const offset2 = tzOffsetMs(timeZone, new Date(utc1));
  if (offset2 === offset1) return new Date(utc1);
  return new Date(guessUTC - offset2);
}

/**
 * Compute the next delivery instant for a user, in UTC, based on their
 * schedule prefs interpreted in their own timezone. Returns today's slot if
 * it hasn't passed yet, otherwise the next calendar day's slot (DST-safe).
 *
 * Defaults to 7:00 AM in the user's timezone when no schedule is set.
 */
export function computeNextDeliveryDate(
  now: Date,
  timeZone: string,
  schedule?: { hour?: number; minute?: number },
): Date {
  const hour = schedule?.hour ?? 7;
  const minute = schedule?.minute ?? 0;

  const todayKey = toDateKeyISO(now, timeZone); // YYYY-MM-DD in the user's tz
  const [y, m, d] = todayKey.split('-').map(Number);

  const todaySlot = zonedWallTimeToUtc(y, m, d, hour, minute, timeZone);
  if (todaySlot.getTime() > now.getTime()) return todaySlot;

  // Today's window has passed → roll to the next calendar day in the user's
  // timezone. Date.UTC normalizes month/year rollover for us.
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return zonedWallTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    hour,
    minute,
    timeZone,
  );
}

export function safeTimezone(tz?: string): string {
  if (!tz) return 'America/New_York';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'America/New_York';
  }
}

export function estimatePages(maxPages?: number): number {
  if (maxPages && maxPages > 0) return Math.min(maxPages, 3);
  return 2;
}

export function normalizeDayItems(
  items: Array<{ time?: string; title: string; note?: string }>,
): Array<{ time?: string; title: string; note?: string }> {
  return items.map((item) => ({
    title: item.title.trim(),
    ...(item.time?.trim() ? { time: item.time.trim() } : {}),
    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
  }));
}

export function normalizeEmailCards(cards: EmailCard[]): EmailCard[] {
  return cards.map((card) => ({
    id: card.id,
    threadId: card.threadId,
    messageId: card.messageId,
    subject: card.subject,
    snippet: card.snippet,
    receivedAt: card.receivedAt,
    category: card.category,
    urgency: card.urgency,
    importance: card.importance,
    why: card.why,
    ...(card.fromName !== undefined ? { fromName: card.fromName } : {}),
    ...(card.fromEmail !== undefined ? { fromEmail: card.fromEmail } : {}),
    ...(card.suggestedNextStep !== undefined
      ? { suggestedNextStep: card.suggestedNextStep }
      : {}),
  }));
}
