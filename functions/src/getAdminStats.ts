import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getDb } from './firebaseAdmin';
import type { UserDoc, MorningGist } from './types';

/**
 * Owner UIDs allowed to read the admin dashboard. A Firebase UID is not a
 * credential (it grants nothing without authenticating *as* that user), so it
 * lives as a plain constant rather than a Secret Manager secret. Override at
 * deploy time with the OWNER_UID env var (comma-separated for multiple owners).
 *
 * Default: mimevbore14@gmail.com (Mary's primary account).
 */
const OWNER_UIDS = (process.env.OWNER_UID ?? '5i0kd7vb5mfEiCFF7QRoASHbVx72')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Number of most-recent gists scanned for delivery + quality aggregates. */
const RECENT_GIST_WINDOW = 50;
/** Number of recent gists returned for the dashboard table. */
const RECENT_GIST_DISPLAY = 20;

type DeliveryBucket = { total: number; delivered: number; failed: number; queued: number };

export type AdminStats = {
  generatedAt: string;
  totals: {
    users: number;
    onboarded: number;
    active7d: number;
    active30d: number;
    gistsAllTime: number;
  };
  delivery: {
    windowSize: number;
    successRate: number | null; // delivered / (delivered + failed), null if no attempts
    byMethod: Record<string, DeliveryBucket>;
    failed: number;
  };
  quality: {
    sampleCount: number;
    editorialVoice: number;
    crossReferenceDepth: number;
    personalizationDepth: number;
  };
  users: AdminUserRow[];
  recentGists: AdminGistRow[];
};

type AdminUserRow = {
  uid: string;
  email: string | null;
  onboardingComplete: boolean;
  deliveryMethod: string | null;
  calendarConnected: boolean;
  gmailConnected: boolean;
  lastGeneratedDate: string | null;
  gistIssueCount: number;
  createdAt: number | null; // epoch ms
  daysSinceActive: number | null;
};

type AdminGistRow = {
  userId: string;
  email: string | null;
  date: string;
  method: string | null;
  status: string | null;
  createdAt: number | null; // epoch ms
  editorialVoice: number | null;
  crossReferenceDepth: number | null;
  personalizationDepth: number | null;
};

/** Convert a Firestore Timestamp-ish value to epoch ms, tolerating shapes. */
function toMillis(ts: unknown): number | null {
  if (!ts) return null;
  const t = ts as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  const seconds = t._seconds ?? t.seconds;
  if (typeof seconds === 'number') return seconds * 1000;
  return null;
}

/** YYYY-MM-DD (UTC) for the instant `daysAgo` before now. */
function dateKeyDaysAgo(now: number, daysAgo: number): string {
  return new Date(now - daysAgo * DAY_MS).toISOString().split('T')[0];
}

/**
 * Callable Cloud Function backing the owner-only admin dashboard. Runs with the
 * Admin SDK, which bypasses Firestore security rules — so it can aggregate
 * across every user without exposing that data to the client. Access is gated
 * server-side to OWNER_UIDS; everyone else gets permission-denied.
 *
 * Only unencrypted gist fields are read (qualityScore, delivery, date,
 * createdAt) — the encrypted brief/firstEvent/cards are never touched.
 */
export const getAdminStats = onCall(
  { region: 'us-central1', timeoutSeconds: 60 },
  async (request): Promise<AdminStats> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to view admin stats.');
    }
    if (!OWNER_UIDS.includes(request.auth.uid)) {
      logger.warn('Admin stats denied', { uid: request.auth.uid });
      throw new HttpsError('permission-denied', 'Not authorized.');
    }

    const db = getDb();
    const now = Date.now();
    const day7 = dateKeyDaysAgo(now, 7);
    const day30 = dateKeyDaysAgo(now, 30);

    // --- Users ---
    const usersSnap = await db.collection('users').get();
    const emailByUid: Record<string, string | null> = {};

    let onboarded = 0;
    let active7d = 0;
    let active30d = 0;
    let gistsAllTime = 0;
    const userRows: AdminUserRow[] = [];

    usersSnap.forEach((doc) => {
      const u = doc.data() as UserDoc;
      const uid = doc.id;
      emailByUid[uid] = u.email ?? null;

      if (u.onboardingComplete) onboarded++;
      if (u.lastGeneratedDate && u.lastGeneratedDate >= day7) active7d++;
      if (u.lastGeneratedDate && u.lastGeneratedDate >= day30) active30d++;
      gistsAllTime += u.gistIssueCount ?? 0;

      let daysSinceActive: number | null = null;
      if (u.lastGeneratedDate) {
        const last = Date.parse(`${u.lastGeneratedDate}T00:00:00Z`);
        if (!Number.isNaN(last)) {
          daysSinceActive = Math.max(0, Math.floor((now - last) / DAY_MS));
        }
      }

      userRows.push({
        uid,
        email: u.email ?? null,
        onboardingComplete: !!u.onboardingComplete,
        deliveryMethod: u.delivery?.method ?? null,
        calendarConnected: u.calendarIntegration?.status === 'connected',
        gmailConnected: u.emailIntegration?.status === 'connected',
        lastGeneratedDate: u.lastGeneratedDate ?? null,
        gistIssueCount: u.gistIssueCount ?? 0,
        createdAt: toMillis(u.createdAt),
        daysSinceActive,
      });
    });

    // Most recently active first; never-active users sink to the bottom.
    userRows.sort((a, b) => {
      const av = a.lastGeneratedDate ?? '';
      const bv = b.lastGeneratedDate ?? '';
      return bv.localeCompare(av);
    });

    // --- Recent gists (delivery + quality aggregates) ---
    const gistsSnap = await db
      .collectionGroup('morningGists')
      .orderBy('createdAt', 'desc')
      .limit(RECENT_GIST_WINDOW)
      .get();

    const byMethod: Record<string, DeliveryBucket> = {};
    let totalFailed = 0;
    let totalDelivered = 0;
    let totalAttempted = 0; // delivered + failed (queued excluded — not yet attempted)

    let qCount = 0;
    let qVoice = 0;
    let qCross = 0;
    let qPersonal = 0;

    const recentGists: AdminGistRow[] = [];

    gistsSnap.forEach((doc) => {
      const g = doc.data() as MorningGist;
      const method = g.delivery?.method ?? 'web';
      const status = g.delivery?.status ?? null;

      const bucket = (byMethod[method] ??= { total: 0, delivered: 0, failed: 0, queued: 0 });
      bucket.total++;
      if (status === 'delivered') {
        bucket.delivered++;
        totalDelivered++;
        totalAttempted++;
      } else if (status === 'failed') {
        bucket.failed++;
        totalFailed++;
        totalAttempted++;
      } else if (status === 'queued') {
        bucket.queued++;
      }

      if (g.qualityScore) {
        qVoice += g.qualityScore.editorialVoice ?? 0;
        qCross += g.qualityScore.crossReferenceDepth ?? 0;
        qPersonal += g.qualityScore.personalizationDepth ?? 0;
        qCount++;
      }

      if (recentGists.length < RECENT_GIST_DISPLAY) {
        recentGists.push({
          userId: g.userId,
          email: emailByUid[g.userId] ?? null,
          date: g.date,
          method,
          status,
          createdAt: toMillis(g.createdAt),
          editorialVoice: g.qualityScore?.editorialVoice ?? null,
          crossReferenceDepth: g.qualityScore?.crossReferenceDepth ?? null,
          personalizationDepth: g.qualityScore?.personalizationDepth ?? null,
        });
      }
    });

    const round1 = (n: number) => Math.round(n * 10) / 10;

    logger.info('Admin stats served', {
      uid: request.auth.uid,
      users: usersSnap.size,
      gistWindow: gistsSnap.size,
    });

    return {
      generatedAt: new Date(now).toISOString(),
      totals: {
        users: usersSnap.size,
        onboarded,
        active7d,
        active30d,
        gistsAllTime,
      },
      delivery: {
        windowSize: gistsSnap.size,
        successRate: totalAttempted > 0 ? round1((totalDelivered / totalAttempted) * 100) : null,
        byMethod,
        failed: totalFailed,
      },
      quality: {
        sampleCount: qCount,
        editorialVoice: qCount > 0 ? round1(qVoice / qCount) : 0,
        crossReferenceDepth: qCount > 0 ? round1(qCross / qCount) : 0,
        personalizationDepth: qCount > 0 ? round1(qPersonal / qCount) : 0,
      },
      users: userRows,
      recentGists,
    };
  },
);
