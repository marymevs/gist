import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { WEATHERAPI_KEY } from './integrations/weather';
import { NYT_API_KEY } from './integrations/nytTopStories';
import {
  ANTHROPIC_API_KEY,
  generateDailyFocusSections,
} from './integrations/claudeGist';
import { RESEND_API_KEY } from './integrations/emailDelivery';
import {
  PHAXIO_API_KEY,
  PHAXIO_API_SECRET,
} from './integrations/faxDelivery';
import {
  writeDeliveryLog,
  updateGistDeliveryStatus,
} from './firestoreUtils';
import { checkSubscriptionActive } from './integrations/stripeUtils';

initializeApp();

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from './integrations/googleCalendarInt';

import type { UserDoc, MorningGist, GistPlan, IntegrationStatus } from './types';
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
import { deliverByFax } from './delivery/fax';
import { deliverByWeb } from './delivery/web';

import type { ConnectorContext } from './connectors/types';
import { weatherConnector } from './connectors/weather';
import { calendarConnector } from './connectors/calendar';
import { gmailConnector } from './connectors/gmail';
import { newsConnector } from './connectors/news';
import { moonConnector } from './connectors/moon';

import { readMemoryContext, formatMemoryForPrompt } from './personalization/memoryReader';
import { isSubscriptionActive } from './billing/stripeUtils';
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

  // Fax guard: skip early if plan=print but no fax number configured
  if (method === 'fax') {
    const faxNumber = user.delivery?.faxNumber?.trim();
    if (!faxNumber) {
      logger.warn('Skipping fax delivery — print plan user has no fax number.', {
        userId: user.uid,
      });
      return;
    }

    // Idempotency guard: skip if fax already sent for today (prevents duplicates
    // on Cloud Scheduler re-runs)
    const existingGist = await db
      .collection('users')
      .doc(user.uid)
      .collection('morningGists')
      .doc(dateKey)
      .get();
    const existingStatus = existingGist.data()?.delivery?.status as string | undefined;
    const nonRetryableStatuses = ['queued', 'delivered', 'received', 'paused'];
    if (existingGist.exists && existingStatus && nonRetryableStatuses.includes(existingStatus)) {
      logger.info('Skipping duplicate fax delivery — gist already has non-retryable status.', {
        userId: user.uid,
        dateKey,
        existingStatus,
      });
      return;
    }

    // Stripe billing gate: check cached subscription status (fail-open)
    const isActive = await checkSubscriptionActive(user.uid);
    if (!isActive) {
      logger.info('Skipping fax delivery — subscription not active.', {
        userId: user.uid,
      });
      // Write paused status to gist doc so the idempotency guard catches same-day re-runs.
      await db
        .collection('users')
        .doc(user.uid)
        .collection('morningGists')
        .doc(dateKey)
        .set({ delivery: { status: 'paused' }, userId: user.uid, date: dateKey }, { merge: true })
        .catch((err) => logger.warn('Failed to write paused status to gist doc.', { err }));

      // Notify the user via fax + email (screenless-safe)
      const toEmail = await resolveUserEmail(user.uid, user.email);
      if (toEmail) {
        await sendMorningGistEmail({
          toEmail,
          subject: 'Your Gist fax is paused',
          html: '<p>Your morning Gist fax was paused because your payment didn\'t go through. Update your payment at <a href="https://mygist.app/account">mygist.app/account</a> to resume delivery.</p>',
        }).catch((err) => logger.warn('Failed to send payment-paused email.', { userId: user.uid, err }));
      }
      // Also send a one-page notification fax (primary channel for screenless users)
      const notifyHtml = buildFaxHtml({
        subscriberName: 'Subscriber',
        date: toDateLabel(now, timezone),
        weatherSummary: '',
        dayItems: [],
        worldItems: [],
        emailCards: [],
        gistBullets: ['Your Gist fax is paused because your payment didn\'t go through.', 'Update your payment at mygist.app/account to resume delivery.', 'If you need help, reply to this fax or email morning@mygist.app.'],
      });
      await sendMorningGistFax({
        faxNumber: user.delivery!.faxNumber!.trim(),
        html: notifyHtml,
        userId: user.uid,
      }).catch((err) => logger.warn('Failed to send payment-paused notification fax.', { userId: user.uid, err }));
      return;
    }
  }

  // Billing gate: verify active subscription for paid plans
  if (user.plan !== 'web') {
    try {
      const active = await isSubscriptionActive(user.stripeCustomerId, user.plan);
      if (!active) {
        logger.warn('Skipping gist generation — no active subscription for paid plan.', {
          userId: user.uid,
          plan: user.plan,
          status: user.stripeSubscriptionStatus ?? 'none',
        });
        return;
      }
    } catch (err) {
      // If Stripe is down, log but continue (graceful degradation)
      logger.warn('Stripe subscription check failed, proceeding anyway.', {
        userId: user.uid,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

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
      delivery: {
        method,
        pages,
        status: 'queued',
      },
      createdAt: Timestamp.now(),
    };

    await gistRef.set({ ...gist, dayItems: cleanDayItems }, { merge: true });

    const dateLabel = toDateLabel(now, timezone);

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
      });
      finalStatus = result.status;

    } else if (method === 'fax') {
      const faxNumber = user.delivery!.faxNumber!.trim();
      const result = await deliverByFax({
        userId: user.uid,
        userEmail: user.email,
        faxNumber,
        dateLabel,
        weatherSummary: weather,
        dayItems: cleanDayItems,
        worldItems,
        emailCards: cleanEmailCards,
        gistBullets: sections.gistBullets,
      });
      finalStatus = result.status;

      if (result.status === 'queued' && result.faxId) {
        await gistRef.update({ 'delivery.phaxioFaxId': result.faxId });
      } else if (result.status === 'failed') {
        await updateGistDeliveryStatus(user.uid, dateKey, 'failed');
      }

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
      PHAXIO_API_KEY,
      PHAXIO_API_SECRET,
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

    if (dueSnap.empty) {
      // Fallback: also pick up legacy users with no nextDeliveryAt set
      // (users who existed before the scheduler refactor)
      const legacySnap = await db
        .collection('users')
        .where('onboardingComplete', '==', true)
        .get();

      const legacyTasks: Promise<void>[] = [];
      legacySnap.forEach((docSnap) => {
        const data = docSnap.data();
        // Skip users that already have nextDeliveryAt (they're not due)
        if (data.nextDeliveryAt) return;

        const uid = data.uid ?? docSnap.id;
        if (!uid) return;

        const timezone = safeTimezone(data.prefs?.timezone);
        const todayKey = toDateKeyISO(now, timezone);

        // Idempotency: skip if already generated today
        if (data.lastGeneratedDate === todayKey) return;

        const user = buildUserDoc(uid, data);
        legacyTasks.push(generateAndUpdateSchedule(user, now, todayKey, timezone));
      });

      if (legacyTasks.length > 0) {
        await Promise.allSettled(legacyTasks);
        logger.info('Processed legacy users without nextDeliveryAt.', { count: legacyTasks.length });
      } else {
        logger.info('No users due for delivery.');
      }
      return;
    }

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
    plan: (data.plan as GistPlan) ?? 'web',
    prefs: data.prefs ?? {},
    delivery: data.delivery ?? {},
    calendarIntegration: data.calendarIntegration,
    emailIntegration: data.emailIntegration,
    stripeCustomerId: data.stripeCustomerId ?? null,
    stripeSubscriptionStatus: data.stripeSubscriptionStatus ?? 'demo',
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
