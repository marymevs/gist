/**
 * Test fax endpoint — sends a branded welcome fax during onboarding.
 *
 * Validates the user's fax number by sending a one-page welcome document
 * via Phaxio. The welcome page uses the same Georgia serif newspaper
 * aesthetic as the daily briefing — this is the user's first physical
 * touchpoint with Gist.
 *
 * Auth required: Firebase Auth token must be present.
 * Rate limited: 1 test fax per user per 24 hours.
 */

import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  PHAXIO_API_KEY,
  PHAXIO_API_SECRET,
  sendMorningGistFax,
} from './faxDelivery';

const db = getFirestore();

// ─── welcome fax template ────────────────────────────────────────────────────

/**
 * Build the HTML for the welcome/test fax page.
 * Same Georgia serif newspaper aesthetic as the daily briefing.
 */
export function buildWelcomeFaxHtml(subscriberName: string, deliveryTime: string): string {
  const safeName = subscriberName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Welcome to Gist</title>
<style>
  @page { size: letter; margin: 0.75in; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #1a1a1a;
    background: #fefefe;
    max-width: 7in;
    margin: 0 auto;
    padding: 0.75in;
    line-height: 1.6;
  }
  .masthead {
    text-align: center;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 12px;
    margin-bottom: 32px;
  }
  .masthead h1 {
    font-size: 36px;
    letter-spacing: 0.15em;
    margin: 0;
  }
  .masthead .tagline {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #666;
    margin-top: 4px;
  }
  .greeting {
    font-size: 20px;
    margin-bottom: 24px;
  }
  .body-text {
    font-size: 14px;
    margin-bottom: 16px;
  }
  .highlight {
    font-weight: bold;
  }
  .footer {
    margin-top: 48px;
    padding-top: 12px;
    border-top: 1px solid #ccc;
    font-size: 11px;
    color: #888;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="masthead">
    <h1>GIST</h1>
    <div class="tagline">Your morning, on paper</div>
  </div>

  <p class="greeting">Welcome, ${safeName}.</p>

  <p class="body-text">
    If you're reading this, your fax is working. Your first morning
    briefing arrives tomorrow at <span class="highlight">${deliveryTime}</span>.
  </p>

  <p class="body-text">
    Each morning, Gist pulls together your calendar, your most important
    emails, and a handful of world headlines — then delivers it all on
    paper. One or two pages. Readable in 90 seconds over coffee.
  </p>

  <p class="body-text">
    Then you put it down and start your day.
  </p>

  <div class="footer">
    mygist.app &middot; Your morning, on paper
  </div>
</body>
</html>`;
}

// ─── rate limiting ───────────────────────────────────────────────────────────

const RATE_LIMIT_HOURS = 24;

async function checkRateLimit(userId: string): Promise<boolean> {
  const doc = await db.collection('users').doc(userId).collection('config').doc('testFax').get();
  if (!doc.exists) return true; // no prior test fax

  const lastSent = doc.data()?.lastSent;
  if (!lastSent) return true;

  const lastSentDate = lastSent instanceof Timestamp
    ? lastSent.toDate()
    : new Date(lastSent);

  const hoursSince = (Date.now() - lastSentDate.getTime()) / (1000 * 60 * 60);
  return hoursSince >= RATE_LIMIT_HOURS;
}

async function recordTestFax(userId: string): Promise<void> {
  await db
    .collection('users')
    .doc(userId)
    .collection('config')
    .doc('testFax')
    .set({ lastSent: FieldValue.serverTimestamp() }, { merge: true });
}

// ─── Cloud Function ──────────────────────────────────────────────────────────

export const sendTestFax = onRequest(
  { secrets: [PHAXIO_API_KEY, PHAXIO_API_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
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

    const { faxNumber, deliveryTime } = req.body as {
      faxNumber?: string;
      deliveryTime?: string;
    };

    if (!faxNumber?.trim()) {
      res.status(400).json({ error: 'Fax number is required.' });
      return;
    }

    // Rate limit: 1 test fax per 24 hours
    const allowed = await checkRateLimit(uid);
    if (!allowed) {
      res.status(429).json({ error: 'Test fax limit reached. Try again in 24 hours.' });
      return;
    }

    // Build and send the welcome fax
    const subscriberName = req.body.name?.trim() || 'Subscriber';
    const timeLabel = deliveryTime?.trim() || '6:00 AM';
    const html = buildWelcomeFaxHtml(subscriberName, timeLabel);

    const result = await sendMorningGistFax({
      faxNumber: faxNumber.trim(),
      html,
      userId: uid,
    });

    if (result.success) {
      await recordTestFax(uid);
      logger.info('Welcome test fax sent.', { userId: uid, faxNumber: faxNumber.trim() });
      res.status(200).json({ success: true, faxId: result.faxId });
    } else {
      logger.warn('Welcome test fax failed.', { userId: uid, error: result.error });
      res.status(400).json({ success: false, error: result.error });
    }
  },
);
