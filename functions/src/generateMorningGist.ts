import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
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
import {
  PHAXIO_API_KEY,
  PHAXIO_API_SECRET,
  sendMorningGistFax,
} from './integrations/faxDelivery';
import { buildFaxHtml } from './integrations/faxTemplate';
import {
  writeDeliveryLog,
  updateGistDeliveryStatus,
} from './firestoreUtils';

initializeApp();

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  fetchCalendarItems,
} from './integrations/googleCalendarInt';

const db = getFirestore();

/** === Types === */

/** All delivery methods supported by the scheduler. */
export type DeliveryMethod = 'web' | 'email' | 'fax';

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
  /** E.164 or 10-digit fax number, e.g. "+12125551234" */
  faxNumber?: string;
  schedule?: {
    hour?: number;
    minute?: number;
    weekdaysOnly?: boolean;
  };
};

type IntegrationStatus = {
  status?: 'connected' | 'disconnected';
};

export type UserDoc = {
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
    /** Phaxio fax ID — set for fax deliveries, used by faxWebhook to correlate callbacks. */
    phaxioFaxId?: string;
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

/**
 * Resolve delivery method using plan-first routing.
 *
 *   print plan → fax  (physical delivery)
 *   loop/web   → email if Gmail connected, otherwise web
 *
 * This is intentional: the plan controls what you get. The print plan
 * subscriber wants paper; the loop/web subscriber gets digital.
 */
function resolveDeliveryMethod(user: UserDoc): DeliveryMethod {
  if (user.plan === 'print') return 'fax';
  if (user.emailIntegration?.status === 'connected') return 'email';
  return 'web';
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

function toDateLabel(date: Date, timeZone: string): string {
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

  // Initial delivery status — fax stays 'queued' until webhook confirms
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

    // ── Email delivery ──────────────────────────────────────────────────────
    if (method === 'email') {
      const toEmail = await resolveUserEmail(user.uid, user.email);

      if (!toEmail) {
        logger.warn('Skipping email delivery — no email address for user.', {
          userId: user.uid,
        });
        finalStatus = 'delivered'; // gist is in Firestore; treat as web
      } else {
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

    // ── Fax delivery ────────────────────────────────────────────────────────
    } else if (method === 'fax') {
      const faxNumber = user.delivery!.faxNumber!.trim();
      const subscriberName = user.email?.split('@')[0] ?? 'Subscriber';

      const html = buildFaxHtml({
        subscriberName,
        date: dateLabel,
        weatherSummary: weather,
        dayItems: cleanDayItems,
        worldItems,
        emailCards: cleanEmailCards.map((c) => ({
          fromName: c.fromName,
          subject: c.subject,
          snippet: c.snippet,
          category: c.category,
          why: c.why,
          suggestedNextStep: c.suggestedNextStep,
        })),
        gistBullets: sections.gistBullets,
      });

      const result = await sendMorningGistFax({ faxNumber, html, userId: user.uid });

      if (result.success) {
        // Store the Phaxio fax ID so the webhook can correlate the callback
        await gistRef.update({ 'delivery.phaxioFaxId': result.faxId });
        // Status stays 'queued' — webhook will update to 'delivered'/'failed'
        finalStatus = 'queued';
        logger.info('Morning Gist fax queued.', {
          userId: user.uid,
          faxId: result.faxId,
          dateKey,
        });
      } else {
        finalStatus = 'failed';
        logger.warn('Morning Gist fax failed.', {
          userId: user.uid,
          error: result.error,
        });
        await updateGistDeliveryStatus(user.uid, dateKey, 'failed');
      }

    // ── Web delivery ────────────────────────────────────────────────────────
    } else {
      finalStatus = 'delivered';
      await updateGistDeliveryStatus(user.uid, dateKey, 'delivered');
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

  // Always write a delivery log entry (queued/delivered/failed)
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
    // Extended timeout: Phaxio HTML-to-fax dispatch adds ~500ms per user.
    // 180s covers up to ~30 fax users comfortably at MVP scale.
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
