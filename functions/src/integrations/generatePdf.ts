/**
 * PDF download endpoint — generates a PDF from today's Gist.
 *
 * Renders the newspaper HTML template and returns it as a print-optimized
 * HTML document. The browser's print-to-PDF handles the actual PDF conversion.
 *
 * Note: We return HTML with @page CSS rather than server-side PDF
 * generation to avoid adding a Puppeteer/Chromium dependency. The
 * browser's "Save as PDF" from print preview produces identical output.
 *
 * Auth required: Firebase Auth token must be present.
 */

import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildNewspaperHtml } from './newspaperTemplate';
import type { NewspaperTemplateInput } from './newspaperTypes';

const db = getFirestore();

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
    ...(newspaper as unknown as import('./newspaperTypes').NewspaperGistOutput),
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

export const generateGistPdf = onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  // Verify Firebase Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token.' });
    return;
  }

  let uid: string;
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    res.status(401).json({ error: 'Invalid authorization token.' });
    return;
  }

  // Always render today's gist — historical rendering is intentionally not supported.
  const dateKey = new Date().toISOString().slice(0, 10);

  // Fetch the gist and user doc in parallel
  const [gistDoc, userDoc] = await Promise.all([
    db.collection('users').doc(uid).collection('morningGists').doc(dateKey).get(),
    db.collection('users').doc(uid).get(),
  ]);

  if (!gistDoc.exists) {
    res.status(404).json({ error: 'No Gist for today yet.' });
    return;
  }

  const gist = gistDoc.data() as Record<string, unknown>;
  const newspaper = gist['newspaper'] as Record<string, unknown> | undefined;

  if (!newspaper) {
    res.status(422).json({ error: 'Gist exists but has no newspaper data. Re-generate it to get the PDF view.' });
    return;
  }

  const timezone = typeof gist['timezone'] === 'string' ? gist['timezone'] : 'America/New_York';
  const weatherSummary = typeof gist['weatherSummary'] === 'string' ? gist['weatherSummary'] : 'Weather unavailable';
  const userData = (userDoc.data() ?? {}) as Record<string, unknown>;

  try {
    const input = buildTemplateInput(newspaper, userData, dateKey, timezone, weatherSummary);
    const html = buildNewspaperHtml(input);

    // Return as HTML with print-ready headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="gist-${dateKey}.html"`);
    res.status(200).send(html);

    logger.info('Gist PDF/print page generated.', { userId: uid, dateKey });
  } catch (error) {
    logger.error('Failed to generate Gist PDF.', {
      userId: uid,
      dateKey,
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Failed to generate PDF.' });
  }
});
