import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { WEATHERAPI_KEY } from './integrations/weather';
import { NYT_API_KEY } from './integrations/nytTopStories';
import {
  ANTHROPIC_API_KEY,
  generateDailyFocusSections,
} from './integrations/claudeGist';
import { generateNewspaperGist } from './integrations/claudeNewspaper';
import { buildNewspaperHtml } from './integrations/newspaperTemplate';
import { buildNewspaperEmailHtml, buildNewspaperEmailSubject } from './integrations/newspaperEmailTemplate';
import type { NewspaperTemplateInput } from './integrations/newspaperTypes';
import { RESEND_API_KEY } from './integrations/emailDelivery';
import {
  writeDeliveryLog,
} from './firestoreUtils';

if (!getApps().length) initializeApp();

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
  observeTopicAffinities,
  observeQualityScore,
  pruneExpiredMemory,
} from './personalization/memoryEngine';

const db = getFirestore();

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

    const reusableOneThing =
      typeof existingData?.oneThing === 'string'
        ? existingData.oneThing.trim()
        : '';
    const reusableBullets = Array.isArray(existingData?.gistBullets)
      ? existingData.gistBullets
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

    const reusableQualityScore = existingData?.qualityScore ?? undefined;

    const reusableSections =
      reusableOneThing && reusableBullets.length === 3
        ? { oneThing: reusableOneThing, gistBullets: reusableBullets, qualityScore: reusableQualityScore }
        : null;

    const shouldReuseSections = calendarUnchanged && reusableSections !== null;

    // Read memory context for personalization
    let memoryPrompt = '';
    if (!shouldReuseSections) {
      try {
        const memory = await readMemoryContext(user.uid);
        memoryPrompt = formatMemoryForPrompt(memory);
      } catch (err) {
        logger.warn('Failed to read memory context, proceeding without.', {
          userId: user.uid,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    const sections = shouldReuseSections
      ? reusableSections
      : await generateDailyFocusSections({
          date: dateKey,
          timezone,
          weatherSummary: weather,
          moonPhase: `${moon.emoji} ${moon.phase}`,
          firstEvent,
          dayItems,
          worldItems,
          memoryContext: memoryPrompt || undefined,
        });

    if (shouldReuseSections) {
      logger.info('Reusing existing daily focus sections (calendar unchanged).', {
        userId: user.uid,
        dateKey,
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
      topics: user.prefs?.newsDomains,
      tone: user.prefs?.tone,
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
      observeTopicAffinities(user.uid, worldItems, user.prefs?.newsDomains),
      sections.qualityScore
        ? observeQualityScore(user.uid, sections.qualityScore)
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
      gistBullets: sections.gistBullets,
      oneThing: sections.oneThing,
      qualityScore: sections.qualityScore,
      ...(newspaperData ? { newspaper: newspaperData } : {}),
      delivery: {
        method,
        pages,
        status: 'queued',
      },
      createdAt: Timestamp.now(),
    };

    await gistRef.set({ ...gist, dayItems: cleanDayItems }, { merge: true });

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

        // Season estimate from month
        const month = now.getMonth(); // 0-indexed
        const season = month <= 1 || month === 11 ? 'Winter'
          : month <= 4 ? 'Spring'
          : month <= 7 ? 'Summer'
          : 'Autumn';
        const dayOfSeason = ((month % 3) * 30) + now.getDate();

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
        gistBullets: sections.gistBullets,
        newspaperInput: newspaperTemplateInput,
      });
      finalStatus = result.status;

    } else {
      const result = await deliverByWeb({ userId: user.uid, dateKey });
      finalStatus = result.status;
    }

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
  }

  await writeDeliveryLog(user.uid, {
    type: 'morning',
    method,
    status: finalStatus,
    pages,
  });

  logger.info('generateMorningGistForUser complete.', {
    userId: user.uid,
    dateKey,
    method,
    status: finalStatus,
  });
}

/**
 * Compute the next delivery Timestamp for a user based on their schedule prefs.
 * Returns a Timestamp for tomorrow at the specified hour:minute in the user's timezone.
 */
function computeNextDelivery(
  now: Date,
  timezone: string,
  schedule?: { hour?: number; minute?: number },
): Timestamp {
  const hour = schedule?.hour ?? 7;
  const minute = schedule?.minute ?? 30;

  // Get "today" in the user's timezone
  const todayStr = toDateKeyISO(now, timezone);
  // Build a Date for today at delivery time in the user's timezone
  const deliveryToday = new Date(`${todayStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);

  // Use tomorrow if today's delivery time has passed
  const target = deliveryToday.getTime() > now.getTime()
    ? deliveryToday
    : new Date(deliveryToday.getTime() + 24 * 60 * 60 * 1000);

  return Timestamp.fromDate(target);
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

function buildUserDoc(uid: string, data: Record<string, any>): UserDoc {
  return {
    uid,
    email: data.email ?? null,
    prefs: data.prefs ?? {},
    delivery: data.delivery ?? {},
    calendarIntegration: data.calendarIntegration,
    emailIntegration: data.emailIntegration,
    gistIssueCount: data.gistIssueCount ?? 0,
    profile: data.profile ?? {},
  };
}

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
