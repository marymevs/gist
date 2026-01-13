import { defineSecret } from 'firebase-functions/params';

export const WEATHERAPI_KEY = defineSecret('WEATHERAPI_KEY');

/** Minimal WeatherAPI types (only fields we use) */
type WeatherApiForecastResponse = {
  location: {
    name: string;
    region: string;
    country: string;
    tz_id: string;
    localtime: string; // "2022-07-22 16:49"
  };
  current: {
    temp_f: number;
    condition: { text: string };
  };
  forecast: {
    forecastday: Array<{
      date: string; // "YYYY-MM-DD"
      day: {
        maxtemp_f: number;
        mintemp_f: number;
        condition: { text: string };
        daily_chance_of_rain?: number;
        daily_will_it_rain?: number;
      };
      hour: Array<{
        time: string; // "YYYY-MM-DD HH:mm"
        temp_f: number;
        will_it_rain: number; // 0/1
        chance_of_rain: number; // 0-100
        condition: { text: string };
      }>;
    }>;
  };
  alerts?: {
    alert?: Array<{
      event?: string; // "Heat Advisory"
      headline?: string;
      effective?: string;
      expires?: string;
    }>;
  };
};

/** Helpers */
function clampInt(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toHourLabel(localTime: string): string {
  // localTime: "YYYY-MM-DD HH:mm"
  const hm = localTime.split(' ')[1] ?? '';
  const hour = Number(hm.split(':')[0] ?? '0');
  const ampm = hour >= 12 ? 'pm' : 'am';
  const hr12 = ((hour + 11) % 12) + 1;
  return `${hr12}${ampm}`;
}

function findFirstMeaningfulRainHour(
  hours: WeatherApiForecastResponse['forecast']['forecastday'][0]['hour']
): string | null {
  // Find first hour where it will rain or chance is meaningfully high
  const hit = hours.find((h) => h.will_it_rain === 1 || h.chance_of_rain >= 50);
  return hit ? toHourLabel(hit.time) : null;
}

function formatAlerts(
  alerts?: WeatherApiForecastResponse['alerts']
): string | null {
  const first = alerts?.alert?.[0];
  const event = first?.event?.trim();
  if (!event) return null;
  return event;
}

/** The actual “Gist” formatter */
export function summarizeForecast(resp: WeatherApiForecastResponse): string {
  const today = resp.forecast.forecastday?.[0];
  if (!today)
    return `${clampInt(resp.current.temp_f)}° • ${resp.current.condition.text}`;

  const hi = clampInt(today.day.maxtemp_f);
  const lo = clampInt(today.day.mintemp_f);
  const cond = today.day.condition.text;

  // “rain after 2pm” logic
  const rainAt = findFirstMeaningfulRainHour(today.hour);
  const rainPhrase = rainAt ? ` • rain after ${rainAt}` : '';

  // Optional alert tag
  const alert = formatAlerts(resp.alerts);
  const alertPhrase = alert ? ` • ${alert}` : '';

  // Final one-liner for the paper
  return `${lo}° / ${hi}° • ${cond}${rainPhrase}${alertPhrase}`;
}

/** Fetch + summarize */
export async function fetchWeatherSummary(params: {
  q: string; // "New York, NY" OR "40.71,-74.01" OR "10001"
  days?: number; // default 1
  aqi?: boolean; // default false (saves payload)
  alerts?: boolean; // default false unless you want it
}): Promise<{ summary: string; tzId?: string; locationName?: string }> {
  const key = WEATHERAPI_KEY.value();

  const url = new URL('https://api.weatherapi.com/v1/forecast.json');
  url.searchParams.set('key', key);
  url.searchParams.set('q', params.q);
  url.searchParams.set('days', String(params.days ?? 1));
  url.searchParams.set('aqi', params.aqi ? 'yes' : 'no');
  url.searchParams.set('alerts', params.alerts ? 'yes' : 'no');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WeatherAPI error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as WeatherApiForecastResponse;
  const summary = summarizeForecast(data);

  return {
    summary,
    tzId: data.location?.tz_id,
    locationName: data.location?.name,
  };
}
