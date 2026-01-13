import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  fetchCalendarItems,
} from './integrations/googleCalendar';
import { WEATHERAPI_KEY, fetchWeatherSummary } from './integrations/weather';

initializeApp();
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

/** === Stub integrations (replace later) === */

async function fetchWorldItems(
  domains: string[]
): Promise<Array<{ headline: string; implication: string }>> {
  // TODO: wire real news sources; avoid doomscrolling by summarizing 1 line + why it matters
  return [
    {
      headline: 'Headline placeholder — one-line implication.',
      implication:
        'Why it matters: a plain-language takeaway that prevents doomscrolling.',
    },
    {
      headline: 'Headline placeholder — one-line implication.',
      implication: 'Why it matters: signal vs noise in one sentence.',
    },
  ];
}

function synthesizeGistBullets(input: {
  weather: string;
  firstEvent?: string;
  domains: string[];
}): string[] {
  // TODO: replace with LLM call (OpenAI) via HTTPS function if you want
  return [
    'Keep your attention narrow: one high-leverage block beats five scattered tasks.',
    'You’re allowed to ignore the noise—check the world once, then close it.',
    `Start clean: ${
      input.firstEvent
        ? `protect ${input.firstEvent}`
        : 'protect your first block'
    }.`,
  ];
}

function computeOneThing(): string {
  return 'Send one message that removes uncertainty today (then stop checking for replies).';
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
  }
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
  now: Date
): Promise<void> {
  const timezone = safeTimezone(user.prefs?.timezone);
  const dateKey = toDateKeyISO(now, timezone);

  const method: DeliveryMethod = user.delivery?.method
    ? user.delivery.method
    : user.plan === 'web'
    ? 'web'
    : 'fax';

  const city = user.prefs?.city ?? 'New York, NY';
  const domains = user.prefs?.newsDomains ?? ['Tech', 'Business', 'Culture'];
  const pages = estimatePages(user.prefs?.maxPages);

  const weatherResp = await fetchWeatherSummary({
    q: city, // e.g. "New York, NY"
    days: 1,
    aqi: false,
    alerts: true, // optional; turn on if you want “Heat Advisory”
  });

  const weather = weatherResp.summary;

  const [dayItems, worldItems] = await Promise.all([
    fetchCalendarItems(user.uid, dateKey, timezone),
    fetchWorldItems(domains),
  ]);

  const firstEvent = dayItems[0]?.time
    ? `${dayItems[0].time} — ${dayItems[0].title}`
    : dayItems[0]?.title;

  const gistBullets = synthesizeGistBullets({
    weather,
    firstEvent,
    domains,
  });

  const gist: MorningGist = {
    id: crypto.randomUUID(),
    userId: user.uid,
    date: dateKey,
    timezone,

    weatherSummary: weather,
    firstEvent,

    dayItems,
    worldItems,

    gistBullets,
    oneThing: computeOneThing(),

    delivery: {
      method,
      pages,
      status: 'queued',
    },

    createdAt: Timestamp.now(),
  };

  const gistRef = db
    .collection('users')
    .doc(user.uid)
    .collection('morningGists')
    .doc(dateKey);

  await gistRef.set(gist, { merge: true });

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
    schedule: '30 7 * * * *',
    timeZone: 'America/New_York',
    region: 'us-central1',
    secrets: [
      WEATHERAPI_KEY,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
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
      if (!data.uid) return;

      const user: UserDoc = {
        uid: data.uid,
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
  }
);
