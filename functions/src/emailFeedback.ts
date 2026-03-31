/**
 * Email feedback endpoint — records thumbs up/down on email card accuracy.
 *
 * Called from a link in the email template footer. Each email card gets
 * a feedback link: /emailFeedback?uid=X&date=Y&card=Z&cat=Action&r=up
 *
 * No auth required (link is the secret). Writes to:
 * - users/{uid}/emailFeedback/{auto-id}
 * - users/{uid}/memory (via memoryEngine)
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { recordEmailFeedback } from './personalization/memoryEngine';

const VALID_CATEGORIES = ['Action', 'WaitingOn', 'FYI'] as const;
type Category = typeof VALID_CATEGORIES[number];

export const emailFeedback = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    const uid = req.query.uid as string | undefined;
    const date = req.query.date as string | undefined;
    const card = req.query.card as string | undefined;
    const cat = req.query.cat as string | undefined;
    const rating = req.query.r as string | undefined;

    // Validate params
    if (!uid || !date || !card || !cat || !rating) {
      res.status(400).send(thanksPage('Missing parameters.'));
      return;
    }

    if (rating !== 'up' && rating !== 'down') {
      res.status(400).send(thanksPage('Invalid rating.'));
      return;
    }

    if (!VALID_CATEGORIES.includes(cat as Category)) {
      res.status(400).send(thanksPage('Invalid category.'));
      return;
    }

    try {
      await recordEmailFeedback(uid, date, card, cat as Category, rating);

      logger.info('Email feedback recorded via link.', { uid, date, card, rating });
      res.status(200).send(thanksPage(
        rating === 'up'
          ? 'Thanks! Glad that was accurate.'
          : 'Thanks for the feedback \u2014 we\u2019ll improve.',
      ));
    } catch (error) {
      logger.error('Email feedback write failed.', {
        uid,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).send(thanksPage('Something went wrong. Thanks for trying.'));
    }
  },
);

function thanksPage(message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gist — Feedback</title>
  <style>
    body {
      font-family: 'Georgia', serif;
      background: #f5f4f0;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: #fff;
      border: 1px solid #d4d0c8;
      border-radius: 8px;
      padding: 32px 40px;
      max-width: 400px;
      text-align: center;
    }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { font-size: 15px; color: #666; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Gist</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
