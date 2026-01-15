"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOOGLE_CLIENT_SECRET = exports.GOOGLE_CLIENT_ID = void 0;
exports.fetchCalendarItems = fetchCalendarItems;
const firebase_functions_1 = require("firebase-functions");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
exports.GOOGLE_CLIENT_ID = (0, params_1.defineSecret)('GOOGLE_CLIENT_ID');
exports.GOOGLE_CLIENT_SECRET = (0, params_1.defineSecret)('GOOGLE_CLIENT_SECRET');
const db = (0, firestore_1.getFirestore)();
function getSecretValue(secret) {
    try {
        const value = secret.value();
        return value ? value : null;
    }
    catch {
        return null;
    }
}
function getOAuthConfig() {
    const clientId = getSecretValue(exports.GOOGLE_CLIENT_ID) ?? process.env.GOOGLE_CLIENT_ID ?? null;
    const clientSecret = getSecretValue(exports.GOOGLE_CLIENT_SECRET) ??
        process.env.GOOGLE_CLIENT_SECRET ??
        null;
    return { clientId, clientSecret };
}
async function loadStoredTokens(userId) {
    const integrationRef = db
        .collection('users')
        .doc(userId)
        .collection('integrations')
        .doc('googleCalendar');
    const integrationSnap = await integrationRef.get();
    if (integrationSnap.exists) {
        const data = integrationSnap.data();
        if (data?.accessToken || data?.refreshToken) {
            return {
                tokens: data,
                location: { kind: 'integration', refPath: integrationRef.path },
            };
        }
    }
    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data();
    const nested = userData?.integrations?.googleCalendar;
    if (nested?.accessToken || nested?.refreshToken) {
        return { tokens: nested, location: { kind: 'user', userId } };
    }
    const legacy = userData?.calendarIntegration;
    if (legacy?.accessToken || legacy?.refreshToken) {
        return { tokens: legacy, location: { kind: 'user', userId } };
    }
    return { tokens: null, location: null };
}
async function persistTokens(location, tokens) {
    if (!location)
        return;
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
function getTimeZoneOffset(date, timeZone) {
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
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const formatted = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`;
    const tzDate = new Date(formatted);
    return tzDate.getTime() - date.getTime();
}
function buildTimeBounds(dateKey, timeZone) {
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
function formatTimeLabel(start, end, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
    });
    const startLabel = formatter.format(start);
    if (!end)
        return startLabel;
    const endLabel = formatter.format(end);
    return `${startLabel}–${endLabel}`;
}
function cleanNote(location, description) {
    const notes = [];
    if (location?.trim())
        notes.push(location.trim());
    if (description?.trim()) {
        const firstLine = description
            .split('\n')
            .map((line) => line.trim())
            .find(Boolean);
        if (firstLine)
            notes.push(firstLine);
    }
    if (!notes.length)
        return undefined;
    return notes.join(' • ');
}
const MAX_ERROR_BODY_LENGTH = 1000;
async function extractGoogleApiError(response) {
    const headers = {};
    const headerNames = [
        'www-authenticate',
        'x-request-id',
        'x-goog-request-id',
        'x-guploader-uploadid',
    ];
    for (const name of headerNames) {
        const value = response.headers.get(name);
        if (value)
            headers[name] = value;
    }
    let bodyText;
    let bodyJson;
    try {
        bodyJson = await response.clone().json();
    }
    catch {
        bodyJson = undefined;
    }
    try {
        const text = await response.text();
        if (text)
            bodyText = text.slice(0, MAX_ERROR_BODY_LENGTH);
    }
    catch {
        bodyText = undefined;
    }
    return {
        status: response.status,
        statusText: response.statusText,
        bodyText,
        bodyJson,
        headers,
    };
}
async function refreshAccessToken(tokens, oauth) {
    if (!tokens.refreshToken)
        return null;
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
        const errorDetails = await extractGoogleApiError(response);
        firebase_functions_1.logger.warn('Google OAuth token refresh failed.', {
            ...errorDetails,
            grantType: 'refresh_token',
        });
        return null;
    }
    const data = (await response.json());
    if (!data.access_token)
        return null;
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
async function ensureFreshAccessToken(tokens, oauth, location) {
    if (!tokens.accessToken) {
        const refreshed = await refreshAccessToken(tokens, oauth);
        if (refreshed)
            await persistTokens(location, refreshed);
        return refreshed;
    }
    if (!tokens.expiryDate || tokens.expiryDate > Date.now() + 60000) {
        return tokens;
    }
    const refreshed = await refreshAccessToken(tokens, oauth);
    if (refreshed)
        await persistTokens(location, refreshed);
    return refreshed;
}
async function listCalendarEvents(params) {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
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
        const errorDetails = await extractGoogleApiError(response);
        firebase_functions_1.logger.warn('Google Calendar API request failed.', {
            ...errorDetails,
            userId: params.userId,
            timeMin: params.timeMin,
            timeMax: params.timeMax,
            timeZone: params.timeZone,
        });
        const error = new Error(`Calendar API ${response.status}: ${response.statusText}`);
        error.details = errorDetails;
        throw error;
    }
    return (await response.json());
}
async function fetchCalendarItems(userId, dateKey, timeZone) {
    const { clientId, clientSecret } = getOAuthConfig();
    if (!clientId || !clientSecret) {
        firebase_functions_1.logger.warn('Google Calendar OAuth client configuration missing.');
        return [];
    }
    const { tokens, location } = await loadStoredTokens(userId);
    if (!tokens) {
        firebase_functions_1.logger.info('No Google Calendar tokens available for user.', { userId });
        return [];
    }
    try {
        const refreshedTokens = await ensureFreshAccessToken(tokens, { clientId, clientSecret }, location);
        if (!refreshedTokens?.accessToken) {
            firebase_functions_1.logger.warn('No valid Google Calendar access token.', { userId });
            return [];
        }
        const { timeMin, timeMax } = buildTimeBounds(dateKey, timeZone);
        let data;
        try {
            data = await listCalendarEvents({
                accessToken: refreshedTokens.accessToken,
                timeMin,
                timeMax,
                timeZone,
                userId,
            });
        }
        catch (error) {
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
                        userId,
                    });
                }
                else {
                    throw error;
                }
            }
            else {
                throw error;
            }
        }
        const items = data.items ?? [];
        return items.map((event) => {
            const title = event.summary?.trim() || 'Untitled event';
            const startDateTime = event.start?.dateTime ?? null;
            const endDateTime = event.end?.dateTime ?? null;
            const allDay = Boolean(event.start?.date && !startDateTime);
            let time;
            if (startDateTime) {
                const start = new Date(startDateTime);
                const end = endDateTime ? new Date(endDateTime) : null;
                time = formatTimeLabel(start, end, timeZone);
            }
            else if (allDay) {
                time = 'All day';
            }
            const note = cleanNote(event.location ?? null, event.description ?? null);
            return {
                time,
                title,
                note,
            };
        });
    }
    catch (error) {
        const errorDetails = error instanceof Error ? error.details : undefined;
        firebase_functions_1.logger.warn('Failed to fetch Google Calendar events.', {
            error,
            errorDetails,
            userId,
        });
        return [];
    }
}
//# sourceMappingURL=googleCalendarInt.js.map
