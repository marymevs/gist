import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { WEATHERAPI_KEY, fetchWeatherSummary } from './integrations/weather';
import { NYT_API_KEY, fetchNytTopStories } from './integrations/nytTopStories';
import {
  OPENAI_API_KEY,
  generateDailyFocusSections,
} from './integrations/openaiGist';

initializeApp();

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  fetchCalendarItems,
} from './integrations/googleCalendarInt';

const db = getFirestore();

/** === Types (keep close to the function for now; later move to /shared) === */
type DeliveryMethod = 'web' | 'fax';

type GistPlan = 'web' | 'print' | 'loop';

type UserPrefs = {
  timezone?: string; // e.g. "America/New_York"
  city?: string; // e.g. "New York, NY"
  newsDomains?: string[]; // e.g. ["Tech","Business","Culture"]
  tone?: string; // e.g. "calm, direct"
  maxPages?: number; // e.g. 2
};

type UserDelivery = {
  method?: DeliveryMethod; // "web"|"fax"
  faxNumber?: string; // E.164 or masked storage
  schedule?: {
    hour?: number; // 7
    minute?: number; // 30
    weekdaysOnly?: boolean;
  };
};

type UserDoc = {
  uid: string;
  email: string | null;
  plan: GistPlan;
  prefs?: UserPrefs;
  delivery?: UserDelivery;
};

type MorningGist = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  timezone: string;

  weatherSummary: string;
  firstEvent?: string;

  dayItems: { time?: string; title: string; note?: string }[];
  worldItems: { headline: string; implication: string }[];
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

function toDateKeyISO(date: Date, timeZone: string): string {
  // Produces YYYY-MM-DD in the user's timezone
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

function safeTimezone(tz?: string): string {
  // Default to NY if missing/invalid
  if (!tz) return 'America/New_York';
  try {
    // Throws if invalid in some environments
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'America/New_York';
  }
}

function estimatePages(maxPages?: number): number {
  // MVP: always 2 unless user wants 1
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

async function fetchWorldItems(): Promise<
  Array<{ headline: string; implication: string }>
> {
  try {
    return await fetchNytTopStories({
      section: 'world',
      limit: 3,
    });
  } catch (error) {
    logger.warn('Failed to fetch NYT world items.', { error });
    return [];
  }
}

/** Optional: queue fax delivery (stub) */
async function queueFaxIfNeeded(params: {
  userId: string;
  faxNumber?: string;
  dateKey: string;
}): Promise<void> {
  if (!params.faxNumber) return;
  // TODO: integrate Twilio Programmable Fax / Phaxio / SRFax etc.
  // MVP: write to a queue collection that a separate worker processes.
  await db.collection('faxQueue').add({
    userId: params.userId,
    dateKey: params.dateKey,
    faxNumber: params.faxNumber,
    status: 'queued',
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Write a delivery log row */
async function writeDeliveryLog(
  userId: string,
  payload: {
    type: 'morning';
    method: DeliveryMethod;
    status: string;
    pages?: number;
  },
) {
  const ref = db
    .collection('users')
    .doc(userId)
    .collection('deliveryLogs')
    .doc();
  await ref.set({
    type: payload.type,
    method: payload.method,
    status: payload.status,
    pages: payload.pages ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** === Core generator (callable from schedule or HTTP later) === */
export async function generateMorningGistForUser(
  user: UserDoc,
  now: Date,
): Promise<void> {
  const timezone = safeTimezone(user.prefs?.timezone);
  const dateKey = toDateKeyISO(now, timezone);

  const method: DeliveryMethod = user.delivery?.method
    ? user.delivery.method
    : user.plan === 'web'
      ? 'web'
      : 'fax';

  const city = user.prefs?.city ?? 'New York, NY';
  const pages = estimatePages(user.prefs?.maxPages);

  let weather = 'Weather unavailable';
  try {
    const weatherResp = await fetchWeatherSummary({
      q: city, // e.g. "New York, NY"
      days: 1,
      aqi: false,
      alerts: true, // optional; turn on if you want “Heat Advisory”
    });
    weather = weatherResp.summary;
  } catch (error) {
    logger.warn('Failed to fetch weather summary.', {
      error,
      userId: user.uid,
    });
  }

  try {
    const [dayItems, worldItems] = await Promise.all([
      fetchCalendarItems(user.uid, dateKey, timezone),
      fetchWorldItems(),
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
    const existingSnap = await gistRef.get();
    const existingData = existingSnap.exists
      ? (existingSnap.data() as Partial<MorningGist>)
      : undefined;

    const existingDayItems = normalizeDayItems(existingData?.dayItems ?? []);
    const calendarUnchanged =
      JSON.stringify(cleanDayItems) === JSON.stringify(existingDayItems);

    const reusableOneThing =
      typeof existingData?.oneThing === 'string' ? existingData.oneThing.trim() : '';
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

    const shouldReuseSections =
      calendarUnchanged && reusableSections !== null;

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
      firstEvent,

      dayItems,
      worldItems,

      gistBullets: sections.gistBullets,
      oneThing: sections.oneThing,

      delivery: {
        method,
        pages,
        status: 'queued',
      },

      createdAt: Timestamp.now(),
    };

    logger.log({ gist });

    const gistDoc = {
      ...gist,
      dayItems: cleanDayItems,
      ...(firstEvent !== undefined ? { firstEvent } : {}),
    };

    await gistRef.set(gistDoc, { merge: true });
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Failed to build/save gist', {
        message: error.message,
        stack: error.stack,
        userId: user.uid,
      });
    } else {
      logger.error('Failed to build/save gist', { error, userId: user.uid });
    }
  }

  await writeDeliveryLog(user.uid, {
    type: 'morning',
    method,
    status: 'queued',
    pages,
  });

  if (method === 'fax') {
    await queueFaxIfNeeded({
      userId: user.uid,
      faxNumber: user.delivery?.faxNumber,
      dateKey,
    });
  }

  logger.info('Generated Morning Gist', { userId: user.uid, dateKey, method });
}

/** === Scheduled job: generates for all eligible users === */
export const generateMorningGist = onSchedule(
  {
    // Every day at 07:30 America/New_York (MVP default)
    schedule: '*/5 * * * *',
    timeZone: 'America/New_York',
    region: 'us-central1',
    secrets: [
      WEATHERAPI_KEY,
      NYT_API_KEY,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      OPENAI_API_KEY,
    ],
  },
  async () => {
    logger.info('Morning Gist scheduler started');

    // MVP selection: all users on non-web plan OR any users with delivery.method defined
    const usersSnap = await db.collection('users').get();

    const now = new Date();
    const tasks: Promise<void>[] = [];

    usersSnap.forEach((docSnap) => {
      const data = docSnap.data() as Partial<UserDoc>;
      const uid = data.uid ?? docSnap.id;
      if (!uid) return;

      const user: UserDoc = {
        uid,
        email: data.email ?? null,
        plan: (data.plan as GistPlan) ?? 'print',
        prefs: data.prefs ?? {},
        delivery: data.delivery ?? {},
      };

      // If user is web-only and hasn’t asked for delivery, you may skip.
      // For MVP, we generate for everyone so the web archive fills.
      tasks.push(generateMorningGistForUser(user, now));
    });

    await Promise.allSettled(tasks);

    logger.info('Morning Gist scheduler finished', { users: usersSnap.size });
  },
);
