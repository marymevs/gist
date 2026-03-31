/**
 * Fax delivery for morning gists.
 * Builds the newspaper HTML and sends via Phaxio.
 */

import { logger } from 'firebase-functions';
import { sendMorningGistFax } from '../integrations/faxDelivery';
import { buildFaxHtml } from '../integrations/faxTemplate';
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
};

export type FaxDeliveryResult = {
  status: 'queued' | 'failed';
  faxId?: string;
};

export async function deliverByFax(input: FaxDeliveryInput): Promise<FaxDeliveryResult> {
  const subscriberName = input.userEmail?.split('@')[0] ?? 'Subscriber';

  const html = buildFaxHtml({
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
