import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { WEATHERAPI_KEY, fetchWeatherSummary } from './integrations/weather';
import { NYT_API_KEY, fetchNytTopStories } from './integrations/nytTopStories';
import { fetchEmailCards } from './integrations/gmailInt';
import {
  OPENAI_API_KEY,
  generateDailyFocusSections,
} from './integrations/openaiGist';
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
  fetchCalendarItems,
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

const db = getFirestore();

async function fetchWorldItems(): Promise<
  Array<{ headline: string; implication: string }>
> {
  try {
    return await fetchNytTopStories({ section: 'world', limit: 3 });
  } catch (error) {
    logger.warn('Failed to fetch NYT world items.', { error });
    return [];
  }
}

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

  let weather = 'Weather unavailable';
  try {
    const weatherResp = await fetchWeatherSummary({
      q: city,
      days: 1,
      aqi: false,
      alerts: true,
    });
    weather = weatherResp.summary;
  } catch (error) {
    logger.warn('Failed to fetch weather summary.', {
      error,
      userId: user.uid,
    });
  }

  let finalStatus: 'queued' | 'delivered' | 'failed' = 'failed';

  try {
    const [dayItems, worldItems, emailCards] = await Promise.all([
      fetchCalendarItems(user.uid, dateKey, timezone),
      fetchWorldItems(),
      fetchEmailCards({
        userId: user.uid,
        userEmail: user.email ?? undefined,
        prefs: user.prefs?.email,
        now,
      }),
    ]);

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

    const reusableSections =
      reusableOneThing && reusableBullets.length === 3
        ? { oneThing: reusableOneThing, gistBullets: reusableBullets }
        : null;

    const shouldReuseSections = calendarUnchanged && reusableSections !== null;

    const sections = shouldReuseSections
      ? reusableSections
      : await generateDailyFocusSections({
          date: dateKey,
          timezone,
          weatherSummary: weather,
          firstEvent,
          dayItems,
          worldItems,
        });

    if (shouldReuseSections) {
      logger.info('Reusing existing daily focus sections (calendar unchanged).', {
        userId: user.uid,
        dateKey,
      });
    }

    const gist: MorningGist = {
      id: crypto.randomUUID(),
      userId: user.uid,
      date: dateKey,
      timezone,
      weatherSummary: weather,
      ...(firstEvent !== undefined ? { firstEvent } : {}),
      dayItems,
      worldItems,
      emailCards: cleanEmailCards,
      gistBullets: sections.gistBullets,
      oneThing: sections.oneThing,
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

/** === Scheduled job === */
export const generateMorningGist = onSchedule(
  {
    schedule: '30 7 * * *',
    timeZone: 'America/New_York',
    region: 'us-central1',
    timeoutSeconds: 180,
    secrets: [
      WEATHERAPI_KEY,
      NYT_API_KEY,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      OPENAI_API_KEY,
      RESEND_API_KEY,
      PHAXIO_API_KEY,
      PHAXIO_API_SECRET,
    ],
  },
  async () => {
    logger.info('Morning Gist scheduler started');

    const usersSnap = await db.collection('users').get();
    const now = new Date();
    const tasks: Promise<void>[] = [];

    usersSnap.forEach((docSnap) => {
      const data = docSnap.data() as Partial<
        UserDoc & {
          calendarIntegration?: IntegrationStatus;
          emailIntegration?: IntegrationStatus;
        }
      >;
      const uid = data.uid ?? docSnap.id;
      if (!uid) return;

      const user: UserDoc = {
        uid,
        email: data.email ?? null,
        plan: (data.plan as GistPlan) ?? 'web',
        prefs: data.prefs ?? {},
        delivery: data.delivery ?? {},
        calendarIntegration: data.calendarIntegration,
        emailIntegration: data.emailIntegration,
      };

      tasks.push(generateMorningGistForUser(user, now));
    });

    await Promise.allSettled(tasks);

    logger.info('Morning Gist scheduler finished', { users: usersSnap.size });
  },
);
