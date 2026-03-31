/**
 * Email delivery for morning gists.
 * Builds the HTML email and sends via Resend.
 */

import { logger } from 'firebase-functions';
import {
  sendMorningGistEmail,
  resolveUserEmail,
} from '../integrations/emailDelivery';
import { buildEmailHtml, buildEmailSubject } from '../integrations/emailTemplate';
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

  const templateInput = {
    date: input.dateLabel,
    weatherSummary: input.weatherSummary,
    dayItems: input.dayItems,
    worldItems: input.worldItems,
    emailCards: input.emailCards.map((c) => ({
      id: c.id,
      fromName: c.fromName,
      fromEmail: c.fromEmail,
      subject: c.subject,
      snippet: c.snippet,
      category: c.category,
      why: c.why,
      suggestedNextStep: c.suggestedNextStep,
    })),
    gistBullets: input.gistBullets,
    userId: input.userId,
    gistDate: input.gistDate,
  };

  const html = buildEmailHtml(templateInput);
  const subject = buildEmailSubject(templateInput);
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
