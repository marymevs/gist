/**
 * Email delivery for morning gists.
 *
 * Uses the newspaper email template (Fraunces/IBM Plex, warm amber).
 * Throws if newspaper template input is missing — no silent fallback.
 */

import { logger } from 'firebase-functions';
import {
  sendMorningGistEmail,
  resolveUserEmail,
} from '../integrations/emailDelivery';
import {
  buildNewspaperEmailHtml,
  buildNewspaperEmailSubject,
} from '../integrations/newspaperEmailTemplate';
import type { NewspaperTemplateInput } from '../integrations/newspaperTypes';
import type { EmailCard } from '../integrations/gmailInt';

export type EmailDeliveryInput = {
  userId: string;
  userEmail: string | null;
  dateLabel: string;
  gistDate?: string; // dateKey for feedback links, e.g. "2026-03-31"
  weatherSummary: string;
  dayItems: Array<{ time?: string; title: string; note?: string }>;
  worldItems: Array<{ headline: string; implication: string }>;
  emailCards: EmailCard[];
  gistBullets: string[];
  /** When present, use the newspaper email template instead of the legacy template. */
  newspaperInput?: NewspaperTemplateInput;
};

export type DeliveryResult = {
  status: 'delivered' | 'failed';
};

export async function deliverByEmail(input: EmailDeliveryInput): Promise<DeliveryResult> {
  const toEmail = await resolveUserEmail(input.userId, input.userEmail);

  if (!toEmail) {
    logger.warn('Skipping email delivery — no email address for user.', {
      userId: input.userId,
    });
    // Gist is in Firestore; treat as web delivery
    return { status: 'delivered' };
  }

  let html: string;
  let subject: string;

  if (!input.newspaperInput) {
    throw new Error(`deliverByEmail: newspaperInput is required (userId=${input.userId})`);
  }

  html = buildNewspaperEmailHtml(input.newspaperInput);
  subject = buildNewspaperEmailSubject(input.newspaperInput);
  logger.info('Sending newspaper email.', { userId: input.userId });

  const result = await sendMorningGistEmail({ toEmail, subject, html });

  if (result.success) {
    logger.info('Morning Gist email sent.', {
      userId: input.userId,
      toEmail,
    });
    return { status: 'delivered' };
  }

  logger.warn('Morning Gist email failed.', {
    userId: input.userId,
    error: result.error,
  });
  return { status: 'failed' };
}
