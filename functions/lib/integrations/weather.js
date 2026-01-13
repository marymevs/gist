"use strict";
// import { defineSecret } from 'firebase-functions/params';
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEATHERAPI_KEY = void 0;
exports.summarizeForecast = summarizeForecast;
exports.fetchWeatherSummary = fetchWeatherSummary;
// export const OPENWEATHER_KEY = defineSecret('OPENWEATHER_KEY');
// export async function fetchWeatherSummary(
//   city: string,
//   timeZone: string
// ): Promise<string> {
//   const key = OPENWEATHER_KEY.value();
//   const summary = '';
//   // TODO: call One Call 3.0 (you’ll map the response into your short summary)
//   // Keep it short so it fits on paper.
//   return summary;
// }
// async function fetchWeatherSummary(
//   city: string,
//   timeZone: string
// ): Promise<string> {
//   // TODO: call a real weather API with secrets (OpenWeather/Apple WeatherKit/etc.)
//   // Use `defineSecret` + Secret Manager in gen2 when you wire it.
//   return `38° / 51° • light rain after 2pm`;
// }
const params_1 = require("firebase-functions/params");
exports.WEATHERAPI_KEY = (0, params_1.defineSecret)('WEATHERAPI_KEY');
/** Helpers */
function clampInt(n) {
    return Number.isFinite(n) ? Math.round(n) : 0;
}
function toHourLabel(localTime) {
    // localTime: "YYYY-MM-DD HH:mm"
    const hm = localTime.split(' ')[1] ?? '';
    const hour = Number(hm.split(':')[0] ?? '0');
    const ampm = hour >= 12 ? 'pm' : 'am';
    const hr12 = ((hour + 11) % 12) + 1;
    return `${hr12}${ampm}`;
}
function findFirstMeaningfulRainHour(hours) {
    // Find first hour where it will rain or chance is meaningfully high
    const hit = hours.find((h) => h.will_it_rain === 1 || h.chance_of_rain >= 50);
    return hit ? toHourLabel(hit.time) : null;
}
function formatAlerts(alerts) {
    const first = alerts?.alert?.[0];
    const event = first?.event?.trim();
    if (!event)
        return null;
    return event;
}
/** The actual “Gist” formatter */
function summarizeForecast(resp) {
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
async function fetchWeatherSummary(params) {
    const key = exports.WEATHERAPI_KEY.value();
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
    const data = (await res.json());
    const summary = summarizeForecast(data);
    return {
        summary,
        tzId: data.location?.tz_id,
        locationName: data.location?.name,
    };
}
//# sourceMappingURL=weather.js.map