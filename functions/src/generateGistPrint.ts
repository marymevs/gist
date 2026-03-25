/**
 * generateGistPrint — authenticated HTTP endpoint that returns the morning
 * Gist rendered as a print-ready HTML document.
 *
 * The frontend opens the response in a new tab. The user can then hit
 * Cmd+P (or Ctrl+P) to get a perfect US Letter PDF — or just print it.
 * The fax template's @page CSS makes it letter-perfect with no manual setup.
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
import { buildFaxHtml, type FaxTemplateInput } from './integrations/faxTemplate';
import type { EmailCard } from './integrations/gmailInt';

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
    let userEmail: string | null;
    try {
      const decoded = await getAuth().verifyIdToken(token);
      uid = decoded.uid;
      userEmail = decoded.email ?? null;
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

    const snap = await gistRef.get();
    if (!snap.exists) {
      res.status(404).send('No gist found for this date.');
      return;
    }

    const gist = snap.data() as {
      weatherSummary?: string;
      timezone?: string;
      dayItems?: FaxTemplateInput['dayItems'];
      worldItems?: FaxTemplateInput['worldItems'];
      emailCards?: EmailCard[];
      gistBullets?: string[];
    };

    // ── Derive subscriber name ──────────────────────────────────────────────
    // Try the user doc first, fall back to email prefix.
    let subscriberName = userEmail?.split('@')[0] ?? 'Subscriber';
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      const userData = userSnap.data();
      if (typeof userData?.['email'] === 'string' && userData['email'].includes('@')) {
        subscriberName = userData['email'].split('@')[0];
      }
    } catch {
      // non-fatal — keep the email-derived name
    }

    // ── Build template input ────────────────────────────────────────────────
    const timezone = typeof gist.timezone === 'string' ? gist.timezone : 'America/New_York';

    const emailCards: FaxTemplateInput['emailCards'] = (gist.emailCards ?? []).map((c) => ({
      fromName: c.fromName,
      subject: c.subject,
      snippet: c.snippet,
      category: c.category,
      why: c.why,
      suggestedNextStep: c.suggestedNextStep,
    }));

    const input: FaxTemplateInput = {
      subscriberName,
      date: dateLabel(dateKey, timezone),
      weatherSummary: gist.weatherSummary ?? 'Weather unavailable',
      dayItems: gist.dayItems ?? [],
      worldItems: gist.worldItems ?? [],
      emailCards,
      gistBullets: gist.gistBullets ?? [],
    };

    // ── Render and return ───────────────────────────────────────────────────
    const html = buildFaxHtml(input);

    logger.info('generateGistPrint: rendered', { uid, dateKey });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(html);
  },
);
