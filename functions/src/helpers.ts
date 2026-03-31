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
 * Resolve delivery method using plan-first routing.
 *
 *   print plan → fax  (physical delivery)
 *   loop/web   → email if Gmail connected, otherwise web
 */
export function resolveDeliveryMethod(user: UserDoc): DeliveryMethod {
  if (user.plan === 'print') return 'fax';
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
