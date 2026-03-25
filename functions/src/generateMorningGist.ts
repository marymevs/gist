import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { WEATHERAPI_KEY, fetchWeatherSummary } from './integrations/weather';
import { NYT_API_KEY, fetchNytTopStories } from './integrations/nytTopStories';
import { fetchEmailCards, type EmailCard } from './integrations/gmailInt';
import {
  OPENAI_API_KEY,
  generateDailyFocusSections,
} from './integrations/openaiGist';
import {
  RESEND_API_KEY,
  sendMorningGistEmail,
  resolveUserEmail,
} from './integrations/emailDelivery';
import { buildEmailHtml, buildEmailSubject } from './integrations/emailTemplate';

initializeApp();

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  fetchCalendarItems,
} from './integrations/googleCalendarInt';

const db = getFirestore();

/** === Types === */

type DeliveryMethod = 'web' | 'email';

type GistPlan = 'web' | 'print' | 'loop';

type UserPrefs = {
  timezone?: string;
  city?: string;
  newsDomains?: string[];
  tone?: string;
  maxPages?: number;
  email?: {
    vipSenders?: string[];
    includeUnreadOnly?: boolean;
    includeInboxOnly?: boolean;
    maxCards?: number;
    lookbackHours?: number;
    maxCandidates?: number;
    enableAi?: boolean;
  };
};

type UserDelivery = {
  method?: DeliveryMethod;
  schedule?: {
    hour?: number;
    minute?: number;
    weekdaysOnly?: boolean;
  };
};

type IntegrationStatus = {
  status?: 'connected' | 'disconnected';
};

type UserDoc = {
  uid: string;
  email: string | null;
  plan: GistPlan;
  prefs?: UserPrefs;
  delivery?: UserDelivery;
  calendarIntegration?: IntegrationStatus;
  emailIntegration?: IntegrationStatus;
};

type MorningGist = {
  id: string;
  userId: string;
  date: string;
  timezone: string;

  weatherSummary: string;
  firstEvent?: string;

  dayItems: { time?: string; title: string; note?: string }[];
  worldItems: { headline: string; implication: string }[];
  emailCards: EmailCard[];
  gistBullets: string[];
  oneThing: string;

  delivery: {
    method: DeliveryMethod;
    pages: number;
    status: 'queued' | 'delivered' | 'failed';
    deliveredAt?: Timestamp;
  };

  createdAt: Timestamp;
};

/** === Helpers === */

function hasConnectedIntegration(user: UserDoc): boolean {
  return (
    user.calendarIntegration?.status === 'connected' ||
    user.emailIntegration?.status === 'connected'
  );
}

function toDateKeyISO(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function toEmailDateLabel(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function safeTimezone(tz?: string): string {
  if (!tz) return 'America/New_York';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'America/New_York';
  }
}

function estimatePages(maxPages?: number): number {
  if (maxPages && maxPages > 0) return Math.min(maxPages, 3);
  return 2;
}

function normalizeDayItems(
  items: Array<{ time?: string; title: string; note?: string }>,
): Array<{ time?: string; title: string; note?: string }> {
  return items.map((item) => ({
    title: item.title.trim(),
    ...(item.time?.trim() ? { time: item.time.trim() } : {}),
    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
  }));
}

function normalizeEmailCards(cards: EmailCard[]): EmailCard[] {
  return cards.map((card) => ({
    id: card.id,
    threadId: card.threadId,
    messageId: card.messageId,
    subject: card.subject,
    snippet: card.snippet,
    receivedAt: card.receivedAt,
    category: card.category,
    urgency: card.urgency,
    importance: card.importance,
    why: card.why,
    ...(card.fromName !== undefined ? { fromName: card.fromName } : {}),
    ...(card.fromEmail !== undefined ? { fromEmail: card.fromEmail } : {}),
    ...(card.suggestedNextStep !== undefined
      ? { suggestedNextStep: card.suggestedNextStep }
      : {}),
  }));
}

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

async function writeDeliveryLog(
  userId: string,
  payload: {
    type: 'morning';
    method: DeliveryMethod;
    status: string;
    pages?: number;
  },
): Promise<void> {
  await db
    .collection('users')
    .doc(userId)
    .collection('deliveryLogs')
    .doc()
    .set({
      type: payload.type,
      method: payload.method,
      status: payload.status,
      pages: payload.pages ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
}

async function updateGistDeliveryStatus(
  userId: string,
  dateKey: string,
  status: 'delivered' | 'failed',
): Promise<void> {
  const update: Record<string, unknown> = { 'delivery.status': status };
  if (status === 'delivered') {
    update['delivery.deliveredAt'] = Timestamp.now();
  }
  await db
    .collection('users')
    .doc(userId)
    .collection('morningGists')
    .doc(dateKey)
    .update(update);
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
  const method: DeliveryMethod =
    user.emailIntegration?.status === 'connected' ? 'email' : 'web';
  const city = user.prefs?.city ?? 'New York, NY';
  const pages = estimatePages(user.prefs?.maxPages);

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

  let finalStatus: 'delivered' | 'failed' = 'failed';

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

    // ── Email delivery ──────────────────────────────────────────────────────
    if (method === 'email') {
      const toEmail = await resolveUserEmail(user.uid, user.email);

      if (!toEmail) {
        logger.warn('Skipping email delivery — no email address for user.', {
          userId: user.uid,
        });
        // Gist was saved; treat as web delivery
        finalStatus = 'delivered';
      } else {
        const dateLabel = toEmailDateLabel(now, timezone);
        const templateInput = {
          date: dateLabel,
          weatherSummary: weather,
          dayItems: cleanDayItems,
          worldItems,
          emailCards: cleanEmailCards.map((c) => ({
            fromName: c.fromName,
            fromEmail: c.fromEmail,
            subject: c.subject,
            snippet: c.snippet,
            category: c.category,
            why: c.why,
            suggestedNextStep: c.suggestedNextStep,
          })),
          gistBullets: sections.gistBullets,
        };

        const html = buildEmailHtml(templateInput);
        const subject = buildEmailSubject(templateInput);
        const result = await sendMorningGistEmail({ toEmail, subject, html });

        if (result.success) {
          finalStatus = 'delivered';
          logger.info('Morning Gist email sent.', {
            userId: user.uid,
            toEmail,
            dateKey,
          });
        } else {
          finalStatus = 'failed';
          logger.warn('Morning Gist email failed.', {
            userId: user.uid,
            error: result.error,
          });
        }
      }
    } else {
      // Web delivery — gist is in Firestore, mark delivered
      finalStatus = 'delivered';
    }

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
    // Daily at 07:30 America/New_York
    schedule: '30 7 * * *',
    timeZone: 'America/New_York',
    region: 'us-central1',
    secrets: [
      WEATHERAPI_KEY,
      NYT_API_KEY,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      OPENAI_API_KEY,
      RESEND_API_KEY,
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
