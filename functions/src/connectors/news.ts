import { logger } from 'firebase-functions';
import { fetchNytTopStories } from '../integrations/nytTopStories';
import type { Connector } from './types';

export type WorldItem = {
  headline: string;
  implication: string;
};

export const newsConnector: Connector<WorldItem[]> = {
  name: 'news',
  async pull(ctx) {
    try {
      const items = await fetchNytTopStories({ section: 'world', limit: 3 });
      return { data: items, status: 'ok' };
    } catch (error) {
      logger.warn('News connector failed.', { error, userId: ctx.userId });
      return {
        data: [],
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
