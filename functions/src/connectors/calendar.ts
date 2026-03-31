import { logger } from 'firebase-functions';
import { fetchCalendarItems } from '../integrations/googleCalendarInt';
import type { Connector } from './types';

export type CalendarItem = {
  time?: string;
  title: string;
  note?: string;
};

export const calendarConnector: Connector<CalendarItem[]> = {
  name: 'calendar',
  async pull(ctx) {
    try {
      const items = await fetchCalendarItems(ctx.userId, ctx.dateKey, ctx.timezone);
      return { data: items, status: 'ok' };
    } catch (error) {
      logger.warn('Calendar connector failed.', { error, userId: ctx.userId });
      return {
        data: [],
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
