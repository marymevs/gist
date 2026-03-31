import { logger } from 'firebase-functions';
import { fetchWeatherSummary } from '../integrations/weather';
import type { Connector, ConnectorResult } from './types';

export type WeatherData = {
  summary: string;
};

export const weatherConnector: Connector<WeatherData> = {
  name: 'weather',
  async pull(ctx) {
    try {
      const resp = await fetchWeatherSummary({
        q: ctx.city,
        days: 1,
        aqi: false,
        alerts: true,
      });
      return { data: { summary: resp.summary }, status: 'ok' };
    } catch (error) {
      logger.warn('Weather connector failed.', { error, userId: ctx.userId });
      return {
        data: { summary: 'Weather unavailable' },
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
