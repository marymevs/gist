import { logger } from 'firebase-functions';
import { fetchEmailCards, type EmailCard } from '../integrations/gmailInt';
import type { Connector } from './types';

export type { EmailCard };

export const gmailConnector: Connector<EmailCard[]> = {
  name: 'gmail',
  async pull(ctx) {
    try {
      const cards = await fetchEmailCards({
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        prefs: ctx.prefs?.email,
        now: ctx.now,
      });
      return { data: cards, status: 'ok' };
    } catch (error) {
      logger.warn('Gmail connector failed.', { error, userId: ctx.userId });
      return {
        data: [],
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
