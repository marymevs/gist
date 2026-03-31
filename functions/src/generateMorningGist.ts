import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { WEATHERAPI_KEY } from './integrations/weather';
import { NYT_API_KEY } from './integrations/nytTopStories';
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
      moonPhase: `${moon.emoji} ${moon.phase}`,
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
