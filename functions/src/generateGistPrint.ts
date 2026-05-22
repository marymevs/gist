/**
 * generateGistPrint — authenticated HTTP endpoint that returns the morning
 * Gist rendered as a print-ready HTML document.
 *
 * The frontend opens the response in a new tab. The user can then hit
 * Cmd+P (or Ctrl+P) to get a perfect US Letter PDF — or just print it.
 * The newspaper template's @page CSS makes it letter-perfect with no manual setup.
 *
 * Usage:
 *   GET /generateGistPrint?date=YYYY-MM-DD
 *   Authorization: Bearer <firebase-id-token>
 *
 * - `date` param is optional — defaults to today in America/New_York.
 * - Returns text/html on success.
 * - Returns 401 if auth is missing or invalid.
 * - Returns 404 if no gist exists for the requested date.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildNewspaperHtml } from './integrations/newspaperTemplate';
import type { NewspaperTemplateInput } from './integrations/newspaperTypes';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function dateLabel(dateKey: string, timezone: string): string {
  const [y, mo, d] = dateKey.split('-').map(Number);
  // Use noon UTC as the anchor so the calendar day is correct in all timezones
  // (UTC-12 through UTC+11). Midnight UTC would show the previous day for
  // users in negative-offset timezones like America/New_York.
  const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return date.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function isValidDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function buildTemplateInput(
  newspaper: Record<string, unknown>,
  user: Record<string, unknown>,
  dateKey: string,
  timezone: string,
  weatherSummary: string,
): NewspaperTemplateInput {
  const issueNum = (user['gistIssueCount'] as number | undefined ?? 0) + 1;

  const [y, mo, d] = dateKey.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const dateFormatted = anchor.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });

  const delivery = user['delivery'] as Record<string, unknown> | undefined;
  const schedule = delivery?.['schedule'] as Record<string, unknown> | undefined;
  const schedHour = (schedule?.['hour'] as number | undefined) ?? 7;
  const schedMin = (schedule?.['minute'] as number | undefined) ?? 0;
  const ampm = schedHour >= 12 ? 'PM' : 'AM';
  const displayHour = schedHour > 12 ? schedHour - 12 : schedHour || 12;
  const tzAbbr = timezone.includes('Pacific') ? 'PT'
    : timezone.includes('Central') ? 'CT'
    : timezone.includes('Mountain') ? 'MT'
    : timezone.includes('Eastern') ? 'ET'
    : timezone.replace(/.*\//, '');
  const deliveryTime = `${displayHour}:${String(schedMin).padStart(2, '0')} ${ampm} ${tzAbbr}`;

  const month = anchor.getUTCMonth(); // 0-indexed
  const season = month <= 1 || month === 11 ? 'Winter'
    : month <= 4 ? 'Spring'
    : month <= 7 ? 'Summer'
    : 'Autumn';
  const dayOfSeason = ((month % 3) * 30) + anchor.getUTCDate();

  const prefs = user['prefs'] as Record<string, unknown> | undefined;
  const countdownPref = prefs?.['countdown'] as Record<string, unknown> | undefined;
  let countdownRhythm: string | undefined;
  if (countdownPref?.['targetDate']) {
    const target = new Date(countdownPref['targetDate'] as string);
    const daysLeft = Math.max(0, Math.ceil((target.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24)));
    countdownRhythm = `${countdownPref['label'] ?? 'Countdown'} ${daysLeft} days`;
  }

  const profile = user['profile'] as Record<string, unknown> | undefined;

  return {
    ...(newspaper as unknown as import('./integrations/newspaperTypes').NewspaperGistOutput),
    subscriberName: (profile?.['name'] as string | undefined) ?? 'Friend',
    location: (prefs?.['city'] as string | undefined) ?? 'your city',
    dateFormatted,
    deliveryTime,
    volumeIssue: `Vol. I · No. ${issueNum}`,
    weather: {
      tempNow: weatherSummary.match(/\d+°/)?.[0] ?? '—',
      conditions: weatherSummary,
      forecast: [],
    },
    rhythms: {
      moon: '—',
      season: `${season}, Day ${dayOfSeason}`,
      light: '—',
      ...(countdownRhythm ? { countdown: countdownRhythm } : {}),
    },
    moonFooter: '—',
    seasonFooter: season,
    intentionPrompt: 'What is your one intention for today?',
  };
}

// ── Cloud Function ────────────────────────────────────────────────────────────

export const generateGistPrint = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      res.status(401).send('Unauthorized');
      return;
    }

    let uid: string;
    try {
      const decoded = await getAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      logger.warn('generateGistPrint: invalid token', { err });
      res.status(401).send('Unauthorized');
      return;
    }

    // ── Date param ──────────────────────────────────────────────────────────
    const rawDate = typeof req.query['date'] === 'string' ? req.query['date'] : '';
    const dateKey = isValidDateKey(rawDate) ? rawDate : todayDateKey();

    // ── Fetch gist from Firestore ───────────────────────────────────────────
    const db = getFirestore();
    const gistRef = db
      .collection('users')
      .doc(uid)
      .collection('morningGists')
      .doc(dateKey);

    const [gistSnap, userSnap] = await Promise.all([
      gistRef.get(),
      db.collection('users').doc(uid).get(),
    ]);

    if (!gistSnap.exists) {
      res.status(404).send('No gist found for this date.');
      return;
    }

    const gist = gistSnap.data() as Record<string, unknown>;
    const newspaper = gist['newspaper'] as Record<string, unknown> | undefined;

    if (!newspaper) {
      res.status(422).send('Gist exists but has no newspaper data. Re-generate it to get the print view.');
      return;
    }

    // ── Build template input ────────────────────────────────────────────────
    const timezone = typeof gist['timezone'] === 'string' ? gist['timezone'] : 'America/New_York';
    const weatherSummary = typeof gist['weatherSummary'] === 'string' ? gist['weatherSummary'] : 'Weather unavailable';
    const userData = (userSnap.data() ?? {}) as Record<string, unknown>;

    const input = buildTemplateInput(newspaper, userData, dateKey, timezone, weatherSummary);

    // ── Render and return ───────────────────────────────────────────────────
    const html = buildNewspaperHtml(input);

    logger.info('generateGistPrint: rendered', { uid, dateKey });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(html);
  },
);
