/**
 * Email delivery for morning gists.
 *
 * When newspaper template input is provided, uses the editorial newspaper
 * email template (Fraunces/IBM Plex, warm amber). Otherwise falls back
 * to the legacy email template.
 */

import { logger } from 'firebase-functions';
import {
  sendMorningGistEmail,
  resolveUserEmail,
} from '../integrations/emailDelivery';
import { buildEmailHtml, buildEmailSubject } from '../integrations/emailTemplate';
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

  if (input.newspaperInput) {
    // ── Newspaper template (new editorial format) ──────────────────────
    html = buildNewspaperEmailHtml(input.newspaperInput);
    subject = buildNewspaperEmailSubject(input.newspaperInput);
    logger.info('Using newspaper email template.', { userId: input.userId });
  } else {
    // ── Legacy template ────────────────────────────────────────────────
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
    html = buildEmailHtml(templateInput);
    subject = buildEmailSubject(templateInput);
  }

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
