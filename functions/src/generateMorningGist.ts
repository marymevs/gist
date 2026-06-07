import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from './firebaseAdmin';
import { WEATHERAPI_KEY } from './integrations/weather';
import { NYT_API_KEY } from './integrations/nytTopStories';
import { ANTHROPIC_API_KEY } from './integrations/claudeUtils';
import { generateNewspaperGist } from './integrations/claudeNewspaper';
import { buildNewspaperHtml } from './integrations/newspaperTemplate';
import { buildNewspaperEmailHtml, buildNewspaperEmailSubject } from './integrations/newspaperEmailTemplate';
import type { NewspaperTemplateInput } from './integrations/newspaperTypes';
import { RESEND_API_KEY } from './integrations/emailDelivery';
import { updateGistDeliveryStatus, buildUserDoc } from './firestoreUtils';
import { FIELD_ENCRYPTION_KEY, encryptJson } from './crypto/fieldCrypto';

/** Retention window for stored gists. Drives the `expireAt` TTL field. */
const GIST_RETENTION_DAYS = 7;

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from './integrations/googleCalendarInt';

import type { UserDoc, MorningGist, IntegrationStatus } from './types';
export type { DeliveryMethod, UserDoc } from './types';

import {
  hasConnectedIntegration,
  resolveDeliveryMethod,
  toDateKeyISO,
  toDateLabel,
  safeTimezone,
  estimatePages,
  normalizeDayItems,
  normalizeEmailCards,
  computeNextDeliveryDate,
} from './helpers';

import { deliverByEmail } from './delivery/email';
import { deliverByWeb } from './delivery/web';

import type { ConnectorContext } from './connectors/types';
import { weatherConnector } from './connectors/weather';
import { calendarConnector } from './connectors/calendar';
import { gmailConnector } from './connectors/gmail';
import { newsConnector } from './connectors/news';
import { moonConnector } from './connectors/moon';

import { readMemoryContext, formatMemoryForPrompt } from './personalization/memoryReader';
import {
  observeCalendarPatterns,
  observeQualityScore,
  pruneExpiredMemory,
} from './personalization/memoryEngine';

const db = getDb();

/** === Core generator === */
export async function generateMorningGistForUser(
  user: UserDoc,
  now: Date,
): Promise<void> {
  if (!hasConnectedIntegration(user)) {
    logger.info('Skipping user — no connected integrations.', {
      userId: user.uid,
    });
    return;
  }

  const timezone = safeTimezone(user.prefs?.timezone);
  const dateKey = toDateKeyISO(now, timezone);
  const method = resolveDeliveryMethod(user);
  const city = user.prefs?.city ?? 'New York, NY';
  const pages = estimatePages(user.prefs?.maxPages);

  // Build connector context
  const connectorCtx: ConnectorContext = {
    userId: user.uid,
    userEmail: user.email ?? undefined,
    dateKey,
    timezone,
    city,
    prefs: user.prefs,
    now,
  };

  let finalStatus: 'queued' | 'delivered' | 'failed' = 'failed';

  try {
    // Pull all data sources in parallel via connectors
    const [weatherResult, calendarResult, newsResult, emailResult, moonResult] =
      await Promise.all([
        weatherConnector.pull(connectorCtx),
        calendarConnector.pull(connectorCtx),
        newsConnector.pull(connectorCtx),
        gmailConnector.pull(connectorCtx),
        moonConnector.pull(connectorCtx),
      ]);

    // Log any connector failures
    for (const r of [weatherResult, calendarResult, newsResult, emailResult, moonResult]) {
      if (r.status === 'failed') {
        logger.warn('Connector returned failed status.', {
          userId: user.uid,
          error: r.error,
        });
      }
    }

    const weather = weatherResult.data.summary;
    const dayItems = calendarResult.data;
    const worldItems = newsResult.data;
    const emailCards = emailResult.data;
    const moon = moonResult.data;

    const gistRef = db
      .collection('users')
      .doc(user.uid)
      .collection('morningGists')
      .doc(dateKey);

    const firstEvent = dayItems[0]?.time
      ? `${dayItems[0].time} — ${dayItems[0].title}`
      : dayItems[0]?.title;

    const cleanDayItems = normalizeDayItems(dayItems);
    const cleanEmailCards = normalizeEmailCards(emailCards);

    const existingSnap = await gistRef.get();
    const existingData = existingSnap.exists
      ? (existingSnap.data() as Partial<MorningGist>)
      : undefined;

    const existingDayItems = normalizeDayItems(existingData?.dayItems ?? []);
    const calendarUnchanged =
      JSON.stringify(cleanDayItems) === JSON.stringify(existingDayItems);

    // Track whether the calendar is unchanged from yesterday (informational; no longer
    // gates section reuse — the newspaper is regenerated each morning regardless).
    if (calendarUnchanged) {
      logger.info('Calendar unchanged from existing doc.', { userId: user.uid, dateKey });
    }

    // Read memory context for personalization
    let memoryPrompt = '';
    try {
      const memory = await readMemoryContext(user.uid);
      memoryPrompt = formatMemoryForPrompt(memory);
    } catch (err) {
      logger.warn('Failed to read memory context, proceeding without.', {
        userId: user.uid,
        error: err instanceof Error ? err.message : err,
      });
    }

    // Generate newspaper-format output — throws on failure (no silent fallback)
    const countdownPref = user.prefs?.countdown;
    let countdownInput: { label: string; daysRemaining: number; targetDescription: string } | undefined;
    if (countdownPref?.targetDate) {
      const target = new Date(countdownPref.targetDate);
      const daysRemaining = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      countdownInput = {
        label: countdownPref.label,
        daysRemaining,
        targetDescription: `${countdownPref.label} in ${daysRemaining} days`,
      };
    }

    const newspaperOutput = await generateNewspaperGist({
      date: dateKey,
      timezone,
      subscriberName: user.profile?.name ?? 'Friend',
      userContext: user.profile?.context,
      // Pass only the text fields — drop parsedAt/parserVersion metadata.
      profileDerived: user.profile?.contextDerived
        ? {
            work: user.profile.contextDerived.work,
            freeTime: user.profile.contextDerived.freeTime,
            creative: user.profile.contextDerived.creative,
            misc: user.profile.contextDerived.misc,
          }
        : undefined,
      weatherSummary: weather,
      moonPhase: `${moon.emoji} ${moon.phase}`,
      dayItems,
      worldItems,
      emailCards: cleanEmailCards.map((c) => ({
        fromName: c.fromName,
        subject: c.subject,
        snippet: c.snippet,
        category: c.category,
        why: c.why,
      })),
      memoryContext: memoryPrompt || undefined,
      countdown: countdownInput,
      topics: user.prefs?.topics,
      tone: user.prefs?.tone,
      location: user.prefs?.city,
      rhythms: user.prefs?.rhythms,
      importantPeople: user.prefs?.importantPeople,
      // Expanded questionnaire direct asks (issue #156).
      majorProject: user.prefs?.majorProject,
      morningRoutine: user.prefs?.morningRoutine,
      wakingTime: user.prefs?.wakingTime,
      worstPartOfMorning: user.prefs?.worstPartOfMorning,
      whatWorksPerfectly: user.prefs?.whatWorksPerfectly,
      whatWouldMakeYouStop: user.prefs?.whatWouldMakeYouStop,
      // Only forward an affirmative ADHD signal; withhold 'no'/'prefer-not-to-say'.
      executiveFunctionStatus:
        user.prefs?.executiveFunctionStatus === 'yes' ? 'yes' : undefined,
    });

    const newspaperData: Record<string, unknown> = newspaperOutput as unknown as Record<string, unknown>;

    // Increment issue count
    await db.collection('users').doc(user.uid).update({
      gistIssueCount: (user.gistIssueCount ?? 0) + 1,
    }).catch(() => {});

    logger.info('Newspaper gist generated.', { userId: user.uid, dateKey });

    // Write behavioral signals to memory (fire-and-forget)
    Promise.allSettled([
      observeCalendarPatterns(user.uid, dayItems),
      newspaperOutput.qualityScore
        ? observeQualityScore(user.uid, newspaperOutput.qualityScore)
        : Promise.resolve(),
      pruneExpiredMemory(user.uid),
    ]).catch(() => {});

    const gist: MorningGist = {
      id: crypto.randomUUID(),
      userId: user.uid,
      date: dateKey,
      timezone,
      weatherSummary: weather,
      moonPhase: `${moon.emoji} ${moon.phase}`,
      ...(firstEvent !== undefined ? { firstEvent } : {}),
      dayItems,
      worldItems,
      emailCards: cleanEmailCards,
      qualityScore: newspaperOutput.qualityScore,
      ...(newspaperData ? { newspaper: newspaperData } : {}),
      delivery: {
        method,
        pages,
        status: 'queued',
      },
      createdAt: Timestamp.now(),
      // Data minimization (issue #177): gists hold personal data and only need
      // to live as long as the user reads today's brief. A Firestore TTL policy
      // on `expireAt` auto-deletes them after the retention window.
      expireAt: Timestamp.fromMillis(Date.now() + GIST_RETENTION_DAYS * 86_400_000),
    };

    // Encrypt the personal-data fields at rest (issue #177): dayItems (calendar)
    // and emailCards (inbox). These are server-only — the browser renders the
    // gist from renderedHtml, never these — so encrypting them is invisible to
    // the UI. The in-memory `gist`/cleanDayItems/cleanEmailCards stay plaintext
    // for email delivery below. News (worldItems) and weather are public; left
    // as-is.
    await gistRef.set(
      {
        ...gist,
        dayItems: encryptJson(cleanDayItems),
        emailCards: encryptJson(cleanEmailCards),
      },
      { merge: true },
    );

    const dateLabel = toDateLabel(now, timezone);

    // ── Build newspaper template input (if newspaper data available) ───
    let newspaperTemplateInput: NewspaperTemplateInput | undefined;
    if (newspaperData) {
      try {
        const issueNum = (user.gistIssueCount ?? 0) + 1;
        const countdownPref = user.prefs?.countdown;
        let countdownRhythm: string | undefined;
        if (countdownPref?.targetDate) {
          const target = new Date(countdownPref.targetDate);
          const daysLeft = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          countdownRhythm = `${countdownPref.label} ${daysLeft} days`;
        }

        // Format date for masthead
        const dateFormatted = now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: timezone,
        });

        // Delivery time from user schedule or default
        const schedHour = user.delivery?.schedule?.hour ?? 7;
        const schedMin = user.delivery?.schedule?.minute ?? 0;
        const ampm = schedHour >= 12 ? 'PM' : 'AM';
        const displayHour = schedHour > 12 ? schedHour - 12 : schedHour || 12;
        const tzAbbr = timezone.includes('Pacific') ? 'PT'
          : timezone.includes('Central') ? 'CT'
          : timezone.includes('Mountain') ? 'MT'
          : timezone.includes('Eastern') ? 'ET'
          : timezone.replace(/.*\//, '');
        const deliveryTime = `${displayHour}:${String(schedMin).padStart(2, '0')} ${ampm} ${tzAbbr}`;

        // Astronomical seasons (Northern Hemisphere): summer begins at the June
        // solstice, not Jun 1. Boundary dates are the typical solstice/equinox
        // days — they drift ±1 day year to year, which is close enough for the
        // rhythms bar. `season` is the name; `dayOfSeason` counts days since the
        // season began (day 1 on the solstice/equinox itself).
        const yr = now.getFullYear();
        const today = new Date(yr, now.getMonth(), now.getDate());
        const springStart = new Date(yr, 2, 20); // ~Mar 20 equinox
        const summerStart = new Date(yr, 5, 21); // ~Jun 21 solstice
        const autumnStart = new Date(yr, 8, 22); // ~Sep 22 equinox
        const winterStart = new Date(yr, 11, 21); // ~Dec 21 solstice
        let season: string;
        let seasonStart: Date;
        if (today >= winterStart) { season = 'Winter'; seasonStart = winterStart; }
        else if (today >= autumnStart) { season = 'Autumn'; seasonStart = autumnStart; }
        else if (today >= summerStart) { season = 'Summer'; seasonStart = summerStart; }
        else if (today >= springStart) { season = 'Spring'; seasonStart = springStart; }
        else { season = 'Winter'; seasonStart = new Date(yr - 1, 11, 21); } // Jan–Mar → last Dec solstice
        const dayOfSeason =
          Math.floor((today.getTime() - seasonStart.getTime()) / 86_400_000) + 1;

        newspaperTemplateInput = {
          ...(newspaperData as unknown as import('./integrations/newspaperTypes').NewspaperGistOutput),
          subscriberName: user.profile?.name ?? 'Friend',
          location: user.prefs?.city ?? 'your city',
          dateFormatted,
          deliveryTime,
          volumeIssue: `Vol. I · No. ${issueNum}`,
          weather: {
            tempNow: weather.match(/\d+°/)?.[0] ?? '—',
            conditions: weather,
            forecast: [],
          },
          rhythms: {
            moon: `${moon.phase} ${Math.round(moon.illumination * 100)}%`,
            season: `${season}, Day ${dayOfSeason}`,
            light: '—',
            ...(countdownRhythm ? { countdown: countdownRhythm } : {}),
          },
          moonFooter: moon.phase,
          seasonFooter: season,
          intentionPrompt: 'What is your one intention for today?',
        };
      } catch (err) {
        logger.warn('Failed to build newspaper template input.', {
          userId: user.uid,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    // ── Render + persist the broadsheet artifact (web/print view) ───────────
    // Same input drives the email body, so /today and the inbox never drift.
    // /today renders this string in an <iframe srcdoc>; Print prints the iframe.
    if (newspaperTemplateInput) {
      try {
        const renderedHtml = buildNewspaperHtml(newspaperTemplateInput);
        await gistRef.set({ renderedHtml }, { merge: true });
      } catch (err) {
        logger.warn('Failed to render/persist gist artifact HTML.', {
          userId: user.uid,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    // ── Delivery routing ───────────────────────────────────────────────────
    if (method === 'email') {
      const result = await deliverByEmail({
        userId: user.uid,
        userEmail: user.email,
        dateLabel,
        gistDate: dateKey,
        weatherSummary: weather,
        dayItems: cleanDayItems,
        worldItems,
        emailCards: cleanEmailCards,
        newspaperInput: newspaperTemplateInput,
      });
      finalStatus = result.status;

    } else {
      const result = await deliverByWeb({ userId: user.uid, dateKey });
      finalStatus = result.status;
    }

    // Sync the gist doc's delivery.status for BOTH methods. The gist doc is the
    // single source of truth for delivery outcome.
    await updateGistDeliveryStatus(user.uid, dateKey, finalStatus);

  } catch (error) {
    finalStatus = 'failed';
    if (error instanceof Error) {
      logger.error('Failed to build/save gist.', {
        message: error.message,
        stack: error.stack,
        userId: user.uid,
      });
    } else {
      logger.error('Failed to build/save gist.', { error, userId: user.uid });
    }

    // Best-effort: if the gist doc was already written before the throw (e.g. a
    // delivery exception), mark it failed so /today and admin stats don't report
    // it as still queued. No-ops (NOT_FOUND) when the failure happened before the
    // gist was created — we avoid creating a stub doc that would break rendering.
    await updateGistDeliveryStatus(user.uid, dateKey, 'failed').catch(() => {});
  }

  logger.info('generateMorningGistForUser complete.', {
    userId: user.uid,
    dateKey,
    method,
    status: finalStatus,
  });
}

/**
 * Compute the next delivery Timestamp for a user based on their schedule prefs.
 * Thin Firestore wrapper around the pure, tz-aware helper.
 */
function computeNextDelivery(
  now: Date,
  timezone: string,
  schedule?: { hour?: number; minute?: number },
): Timestamp {
  return Timestamp.fromDate(computeNextDeliveryDate(now, timezone, schedule));
}

/** === Scheduled job (15-min cron, per-user delivery times) === */
export const generateMorningGist = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'us-central1',
    timeoutSeconds: 180,
    secrets: [
      WEATHERAPI_KEY,
      NYT_API_KEY,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      ANTHROPIC_API_KEY,
      RESEND_API_KEY,
      FIELD_ENCRYPTION_KEY,
    ],
  },
  async () => {
    const now = new Date();
    logger.info('Morning Gist scheduler tick', { now: now.toISOString() });

    // Query users whose nextDeliveryAt is in the past (due for delivery)
    const dueSnap = await db
      .collection('users')
      .where('nextDeliveryAt', '<=', Timestamp.fromDate(now))
      .get();

    const tasks: Promise<void>[] = [];

    dueSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = data.uid ?? docSnap.id;
      if (!uid) return;

      const timezone = safeTimezone(data.prefs?.timezone);
      const todayKey = toDateKeyISO(now, timezone);

      // Idempotency: skip if already generated today
      if (data.lastGeneratedDate === todayKey) {
        // Still update nextDeliveryAt so we don't re-query this user
        db.collection('users').doc(uid).update({
          nextDeliveryAt: computeNextDelivery(now, timezone, data.delivery?.schedule),
        }).catch(() => {});
        return;
      }

      const user = buildUserDoc(uid, data);
      tasks.push(generateAndUpdateSchedule(user, now, todayKey, timezone));
    });

    await Promise.allSettled(tasks);

    logger.info('Morning Gist scheduler tick finished', {
      due: dueSnap.size,
      processed: tasks.length,
    });
  },
);

async function generateAndUpdateSchedule(
  user: UserDoc,
  now: Date,
  todayKey: string,
  timezone: string,
): Promise<void> {
  await generateMorningGistForUser(user, now);

  // Mark today as generated + set next delivery time
  const schedule = user.delivery?.schedule;
  await db.collection('users').doc(user.uid).update({
    lastGeneratedDate: todayKey,
    nextDeliveryAt: computeNextDelivery(now, timezone, schedule),
  });
}
