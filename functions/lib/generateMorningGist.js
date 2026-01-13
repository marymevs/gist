"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMorningGist = void 0;
exports.generateMorningGistForUser = generateMorningGistForUser;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_functions_1 = require("firebase-functions");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const weather_1 = require("./integrations/weather");
(0, app_1.initializeApp)();
const googleCalendarInt_1 = require("./integrations/googleCalendarInt");
const db = (0, firestore_1.getFirestore)();
/** === Helpers === */
function toDateKeyISO(date, timeZone) {
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
function safeTimezone(tz) {
    // Default to NY if missing/invalid
    if (!tz)
        return 'America/New_York';
    try {
        // Throws if invalid in some environments
        Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
        return tz;
    }
    catch {
        return 'America/New_York';
    }
}
function estimatePages(maxPages) {
    // MVP: always 2 unless user wants 1
    if (maxPages && maxPages > 0)
        return Math.min(maxPages, 3);
    return 2;
}
/** === Stub integrations (replace later) === */
async function fetchWorldItems(domains) {
    // TODO: wire real news sources; avoid doomscrolling by summarizing 1 line + why it matters
    return [
        {
            headline: 'Headline placeholder — one-line implication.',
            implication: 'Why it matters: a plain-language takeaway that prevents doomscrolling.',
        },
        {
            headline: 'Headline placeholder — one-line implication.',
            implication: 'Why it matters: signal vs noise in one sentence.',
        },
    ];
}
function synthesizeGistBullets(input) {
    // TODO: replace with LLM call (OpenAI) via HTTPS function if you want
    return [
        'Keep your attention narrow: one high-leverage block beats five scattered tasks.',
        'You’re allowed to ignore the noise—check the world once, then close it.',
        `Start clean: ${input.firstEvent
            ? `protect ${input.firstEvent}`
            : 'protect your first block'}.`,
    ];
}
function computeOneThing() {
    return 'Send one message that removes uncertainty today (then stop checking for replies).';
}
/** Optional: queue fax delivery (stub) */
async function queueFaxIfNeeded(params) {
    if (!params.faxNumber)
        return;
    // TODO: integrate Twilio Programmable Fax / Phaxio / SRFax etc.
    // MVP: write to a queue collection that a separate worker processes.
    await db.collection('faxQueue').add({
        userId: params.userId,
        dateKey: params.dateKey,
        faxNumber: params.faxNumber,
        status: 'queued',
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
/** Write a delivery log row */
async function writeDeliveryLog(userId, payload) {
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
/** === Core generator (callable from schedule or HTTP later) === */
async function generateMorningGistForUser(user, now) {
    const timezone = safeTimezone(user.prefs?.timezone);
    const dateKey = toDateKeyISO(now, timezone);
    const method = user.delivery?.method
        ? user.delivery.method
        : user.plan === 'web'
            ? 'web'
            : 'fax';
    const city = user.prefs?.city ?? 'New York, NY';
    const domains = user.prefs?.newsDomains ?? ['Tech', 'Business', 'Culture'];
    const pages = estimatePages(user.prefs?.maxPages);
    const weatherResp = await (0, weather_1.fetchWeatherSummary)({
        q: city, // e.g. "New York, NY"
        days: 1,
        aqi: false,
        alerts: true, // optional; turn on if you want “Heat Advisory”
    });
    const weather = weatherResp.summary;
    const [dayItems, worldItems] = await Promise.all([
        (0, googleCalendarInt_1.fetchCalendarItems)(user.uid, dateKey, timezone),
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
    const gist = {
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
        createdAt: firestore_1.Timestamp.now(),
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
    firebase_functions_1.logger.info('Generated Morning Gist', { userId: user.uid, dateKey, method });
}
/** === Scheduled job: generates for all eligible users === */
exports.generateMorningGist = (0, scheduler_1.onSchedule)({
    // Every day at 07:30 America/New_York (MVP default)
    schedule: '*/5 * * * *',
    timeZone: 'America/New_York',
    region: 'us-central1',
    secrets: [weather_1.WEATHERAPI_KEY, googleCalendarInt_1.GOOGLE_CLIENT_ID, googleCalendarInt_1.GOOGLE_CLIENT_SECRET],
}, async () => {
    firebase_functions_1.logger.info('Morning Gist scheduler started');
    // MVP selection: all users on non-web plan OR any users with delivery.method defined
    const usersSnap = await db.collection('users').get();
    const now = new Date();
    const tasks = [];
    usersSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.uid)
            return;
        const user = {
            uid: data.uid,
            email: data.email ?? null,
            plan: data.plan ?? 'print',
            prefs: data.prefs ?? {},
            delivery: data.delivery ?? {},
        };
        // If user is web-only and hasn’t asked for delivery, you may skip.
        // For MVP, we generate for everyone so the web archive fills.
        tasks.push(generateMorningGistForUser(user, now));
    });
    await Promise.allSettled(tasks);
    firebase_functions_1.logger.info('Morning Gist scheduler finished', { users: usersSnap.size });
});
//# sourceMappingURL=generateMorningGist.js.map