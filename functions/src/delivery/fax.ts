/**
 * Fax delivery for morning gists.
 *
 * When newspaper template input is provided, uses the editorial 2-page
 * broadsheet layout (Fraunces/IBM Plex, warm amber). Otherwise falls
 * back to the legacy fax template.
 */

import { logger } from 'firebase-functions';
import { sendMorningGistFax } from '../integrations/faxDelivery';
import { buildFaxHtml } from '../integrations/faxTemplate';
import { buildNewspaperHtml } from '../integrations/newspaperTemplate';
import type { NewspaperTemplateInput } from '../integrations/newspaperTypes';
import type { EmailCard } from '../integrations/gmailInt';

export type FaxDeliveryInput = {
  userId: string;
  userEmail: string | null;
  faxNumber: string;
  dateLabel: string;
  weatherSummary: string;
  dayItems: Array<{ time?: string; title: string; note?: string }>;
  worldItems: Array<{ headline: string; implication: string }>;
  emailCards: EmailCard[];
  gistBullets: string[];
  /** When present, use the newspaper broadsheet template instead of the legacy fax template. */
  newspaperInput?: NewspaperTemplateInput;
};

export type FaxDeliveryResult = {
  status: 'queued' | 'failed';
  faxId?: string;
};

export async function deliverByFax(input: FaxDeliveryInput): Promise<FaxDeliveryResult> {
  let html: string;

  if (input.newspaperInput) {
    // ── Newspaper broadsheet (2-page editorial layout) ─────────────────
    html = buildNewspaperHtml(input.newspaperInput);
    logger.info('Using newspaper fax template.', { userId: input.userId });
  } else {
    // ── Legacy fax template ────────────────────────────────────────────
    const subscriberName = input.userEmail?.split('@')[0] ?? 'Subscriber';
    html = buildFaxHtml({
      subscriberName,
      date: input.dateLabel,
      weatherSummary: input.weatherSummary,
      dayItems: input.dayItems,
      worldItems: input.worldItems,
      emailCards: input.emailCards.map((c) => ({
        fromName: c.fromName,
        subject: c.subject,
        snippet: c.snippet,
        category: c.category,
        why: c.why,
        suggestedNextStep: c.suggestedNextStep,
      })),
      gistBullets: input.gistBullets,
    });
  }

  const result = await sendMorningGistFax({
    faxNumber: input.faxNumber,
    html,
    userId: input.userId,
  });

  if (result.success) {
    logger.info('Morning Gist fax queued.', {
      userId: input.userId,
      faxId: result.faxId,
    });
    return { status: 'queued', faxId: result.faxId };
  }

  logger.warn('Morning Gist fax failed.', {
    userId: input.userId,
    error: result.error,
  });
  return { status: 'failed' };
}
