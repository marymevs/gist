import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

export const GOOGLE_CLIENT_ID = defineSecret('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');

type CalendarItem = { time?: string; title: string; note?: string };

type StoredGoogleTokens = {
  accessToken?: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiryDate?: number;
  idToken?: string;
};

type TokenStorageLocation =
  | { kind: 'integration'; refPath: string }
  | { kind: 'user'; userId: string };

const db = getFirestore();

function getSecretValue(
  secret: ReturnType<typeof defineSecret>
): string | null {
  try {
    const value = secret.value();
    return value ? value : null;
  } catch {
    return null;
  }
}

function getOAuthConfig(): {
  clientId: string | null;
  clientSecret: string | null;
} {
  const clientId =
    getSecretValue(GOOGLE_CLIENT_ID) ?? process.env.GOOGLE_CLIENT_ID ?? null;
  const clientSecret =
    getSecretValue(GOOGLE_CLIENT_SECRET) ??
    process.env.GOOGLE_CLIENT_SECRET ??
    null;
  return { clientId, clientSecret };
}

async function loadStoredTokens(userId: string): Promise<{
  tokens: StoredGoogleTokens | null;
  location: TokenStorageLocation | null;
}> {
  const integrationRef = db
    .collection('users')
    .doc(userId)
    .collection('integrations')
    .doc('googleCalendar');
  const integrationSnap = await integrationRef.get();
  if (integrationSnap.exists) {
    const data = integrationSnap.data() as StoredGoogleTokens | undefined;
    if (data?.accessToken || data?.refreshToken) {
      return {
        tokens: data,
        location: { kind: 'integration', refPath: integrationRef.path },
      };
    }
  }

  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data() as
    | { integrations?: { googleCalendar?: StoredGoogleTokens } }
    | undefined;
  const nested = userData?.integrations?.googleCalendar;
  if (nested?.accessToken || nested?.refreshToken) {
    return { tokens: nested, location: { kind: 'user', userId } };
  }

  return { tokens: null, location: null };
}

async function persistTokens(
  location: TokenStorageLocation | null,
  tokens: StoredGoogleTokens
): Promise<void> {
  if (!location) return;
  const payload = {
    accessToken: tokens.accessToken ?? null,
    refreshToken: tokens.refreshToken ?? null,
    scope: tokens.scope ?? null,
    tokenType: tokens.tokenType ?? null,
    expiryDate: tokens.expiryDate ?? null,
    idToken: tokens.idToken ?? null,
    updatedAt: new Date().toISOString(),
  };

  if (location.kind === 'integration') {
    await db.doc(location.refPath).set(payload, { merge: true });
    return;
  }

  await db
    .collection('users')
    .doc(location.userId)
    .set({ integrations: { googleCalendar: payload } }, { merge: true });
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  const formatted = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`;
  const tzDate = new Date(formatted);
  return tzDate.getTime() - date.getTime();
}

function buildTimeBounds(
  dateKey: string,
  timeZone: string
): {
  timeMin: string;
  timeMax: string;
} {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  if (!year || !month || !day) {
    const now = new Date();
    return {
      timeMin: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(),
      timeMax: new Date(now.getTime() + 1000 * 60 * 60 * 12).toISOString(),
    };
  }

  const startBase = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const startOffset = getTimeZoneOffset(startBase, timeZone);
  const timeMin = new Date(startBase.getTime() - startOffset).toISOString();

  const nextDayBase = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const nextOffset = getTimeZoneOffset(nextDayBase, timeZone);
  const timeMax = new Date(nextDayBase.getTime() - nextOffset).toISOString();

  return { timeMin, timeMax };
}

function formatTimeLabel(
  start: Date,
  end: Date | null,
  timeZone: string
): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const startLabel = formatter.format(start);
  if (!end) return startLabel;
  const endLabel = formatter.format(end);
  return `${startLabel}–${endLabel}`;
}

function cleanNote(
  location?: string | null,
  description?: string | null
): string | undefined {
  const notes: string[] = [];
  if (location?.trim()) notes.push(location.trim());
  if (description?.trim()) {
    const firstLine = description
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    if (firstLine) notes.push(firstLine);
  }
  if (!notes.length) return undefined;
  return notes.join(' • ');
}

async function refreshAccessToken(
  tokens: StoredGoogleTokens,
  oauth: { clientId: string; clientSecret: string }
): Promise<StoredGoogleTokens | null> {
  if (!tokens.refreshToken) return null;

  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.warn('Google OAuth token refresh failed.', {
      status: response.status,
      text,
    });
    return null;
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };

  if (!data.access_token) return null;

  return {
    accessToken: data.access_token,
    refreshToken: tokens.refreshToken,
    scope: data.scope ?? tokens.scope,
    tokenType: data.token_type ?? tokens.tokenType,
    expiryDate: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : tokens.expiryDate,
    idToken: data.id_token ?? tokens.idToken,
  };
}

async function ensureFreshAccessToken(
  tokens: StoredGoogleTokens,
  oauth: { clientId: string; clientSecret: string },
  location: TokenStorageLocation | null
): Promise<StoredGoogleTokens | null> {
  if (!tokens.accessToken) {
    const refreshed = await refreshAccessToken(tokens, oauth);
    if (refreshed) await persistTokens(location, refreshed);
    return refreshed;
  }

  if (!tokens.expiryDate || tokens.expiryDate > Date.now() + 60_000) {
    return tokens;
  }

  const refreshed = await refreshAccessToken(tokens, oauth);
  if (refreshed) await persistTokens(location, refreshed);
  return refreshed;
}

async function listCalendarEvents(params: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
  timeZone: string;
}): Promise<{
  items: Array<{
    summary?: string | null;
    location?: string | null;
    description?: string | null;
    start?: { date?: string | null; dateTime?: string | null } | null;
    end?: { date?: string | null; dateTime?: string | null } | null;
  }>;
}> {
  const url = new URL(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events'
  );
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', params.timeMin);
  url.searchParams.set('timeMax', params.timeMax);
  url.searchParams.set('timeZone', params.timeZone);
  url.searchParams.set('maxResults', '250');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Calendar API ${response.status}: ${text.slice(0, 200)}`);
  }

  return (await response.json()) as {
    items: Array<{
      summary?: string | null;
      location?: string | null;
      description?: string | null;
      start?: { date?: string | null; dateTime?: string | null } | null;
      end?: { date?: string | null; dateTime?: string | null } | null;
    }>;
  };
}

export async function fetchCalendarItems(
  userId: string,
  dateKey: string,
  timeZone: string
): Promise<CalendarItem[]> {
  const { clientId, clientSecret } = getOAuthConfig();
  if (!clientId || !clientSecret) {
    logger.warn('Google Calendar OAuth client configuration missing.');
    return [];
  }

  const { tokens, location } = await loadStoredTokens(userId);
  if (!tokens) {
    logger.info('No Google Calendar tokens available for user.', { userId });
    return [];
  }

  try {
    const refreshedTokens = await ensureFreshAccessToken(
      tokens,
      { clientId, clientSecret },
      location
    );
    if (!refreshedTokens?.accessToken) {
      logger.warn('No valid Google Calendar access token.', { userId });
      return [];
    }

    const { timeMin, timeMax } = buildTimeBounds(dateKey, timeZone);
    let data: {
      items: Array<{
        summary?: string | null;
        location?: string | null;
        description?: string | null;
        start?: { date?: string | null; dateTime?: string | null } | null;
        end?: { date?: string | null; dateTime?: string | null } | null;
      }>;
    };

    try {
      data = await listCalendarEvents({
        accessToken: refreshedTokens.accessToken,
        timeMin,
        timeMax,
        timeZone,
      });
    } catch (error) {
      if (tokens.refreshToken) {
        const retryTokens = await refreshAccessToken(refreshedTokens, {
          clientId,
          clientSecret,
        });
        if (retryTokens?.accessToken) {
          await persistTokens(location, retryTokens);
          data = await listCalendarEvents({
            accessToken: retryTokens.accessToken,
            timeMin,
            timeMax,
            timeZone,
          });
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const items = data.items ?? [];
    return items.map((event) => {
      const title = event.summary?.trim() || 'Untitled event';
      const startDateTime = event.start?.dateTime ?? null;
      const endDateTime = event.end?.dateTime ?? null;
      const allDay = Boolean(event.start?.date && !startDateTime);

      let time: string | undefined;
      if (startDateTime) {
        const start = new Date(startDateTime);
        const end = endDateTime ? new Date(endDateTime) : null;
        time = formatTimeLabel(start, end, timeZone);
      } else if (allDay) {
        time = 'All day';
      }

      const note = cleanNote(event.location ?? null, event.description ?? null);

      return {
        time,
        title,
        note,
      };
    });
  } catch (error) {
    logger.warn('Failed to fetch Google Calendar events.', { error, userId });
    return [];
  }
}
