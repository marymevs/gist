/**
 * PDF download endpoint — generates a PDF from today's Gist.
 *
 * Reuses faxTemplate.ts to render the same print-first HTML template,
 * then returns it as an HTML document with print-optimized CSS.
 * The browser's print-to-PDF handles the actual PDF conversion.
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
import { buildFaxHtml } from './faxTemplate';

const db = getFirestore();

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

  // Get dateKey from query param or default to today
  const dateKey = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  // Fetch the gist
  const gistDoc = await db
    .collection('users')
    .doc(uid)
    .collection('morningGists')
    .doc(dateKey)
    .get();

  if (!gistDoc.exists) {
    res.status(404).json({ error: 'No Gist for today yet.' });
    return;
  }

  const gist = gistDoc.data()!;

  // Fetch user for subscriber name
  const userDoc = await db.collection('users').doc(uid).get();
  const subscriberName = userDoc.data()?.email?.split('@')[0] ?? 'Subscriber';

  // Build the same HTML as the fax template
  try {
    const html = buildFaxHtml({
      subscriberName,
      date: gist.date ?? dateKey,
      weatherSummary: gist.weatherSummary ?? '',
      dayItems: gist.dayItems ?? [],
      worldItems: gist.worldItems ?? [],
      emailCards: (gist.emailCards ?? []).map((c: Record<string, unknown>) => ({
        fromName: c.fromName as string,
        subject: c.subject as string,
        snippet: c.snippet as string,
        category: c.category as string,
        why: c.why as string,
        suggestedNextStep: c.suggestedNextStep as string,
      })),
      gistBullets: gist.gistBullets ?? [],
    });

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
