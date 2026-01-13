"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeGoogleCalendarCode = void 0;
const firebase_functions_1 = require("firebase-functions");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const GOOGLE_OAUTH_CLIENT_ID = (0, params_1.defineSecret)('GOOGLE_OAUTH_CLIENT_ID');
const GOOGLE_OAUTH_CLIENT_SECRET = (0, params_1.defineSecret)('GOOGLE_OAUTH_CLIENT_SECRET');
const GOOGLE_OAUTH_REDIRECT_URI = (0, params_1.defineSecret)('GOOGLE_OAUTH_REDIRECT_URI');
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
async function resolveUid(req) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.replace('Bearer ', '').trim();
        const decoded = await (0, auth_1.getAuth)().verifyIdToken(idToken);
        return decoded.uid;
    }
    const uid = req.body?.uid;
    if (typeof uid === 'string' && uid.trim()) {
        return uid.trim();
    }
    throw new Error('Missing user identifier. Provide Authorization bearer token or uid.');
}
exports.exchangeGoogleCalendarCode = (0, https_1.onRequest)({
    cors: true,
    secrets: [
        GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET,
        GOOGLE_OAUTH_REDIRECT_URI,
    ],
}, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const code = req.body?.code;
        if (typeof code !== 'string' || !code.trim()) {
            res.status(400).json({ error: 'Missing authorization code' });
            return;
        }
        const uid = await resolveUid(req);
        const tokenEndpoint = 'https://oauth2.googleapis.com/token';
        const body = new URLSearchParams({
            code: code.trim(),
            client_id: GOOGLE_OAUTH_CLIENT_ID.value(),
            client_secret: GOOGLE_OAUTH_CLIENT_SECRET.value(),
            redirect_uri: GOOGLE_OAUTH_REDIRECT_URI.value(),
            grant_type: 'authorization_code',
        });
        const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });
        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text();
            firebase_functions_1.logger.error('Google token exchange failed', {
                status: tokenResponse.status,
                body: errorBody,
            });
            res
                .status(502)
                .json({ error: 'Failed to exchange authorization code' });
            return;
        }
        const tokenJson = (await tokenResponse.json());
        const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() + tokenJson.expires_in * 1000);
        await db
            .collection('users')
            .doc(uid)
            .collection('integrations')
            .doc('googleCalendar')
            .set({
            accessToken: tokenJson.access_token,
            refreshToken: tokenJson.refresh_token ?? null,
            tokenType: tokenJson.token_type ?? null,
            scope: tokenJson.scope ?? null,
            expiresAt,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        res.status(200).json({ success: true });
    }
    catch (error) {
        firebase_functions_1.logger.error('Google OAuth exchange error', error);
        res.status(500).json({ error: 'Unexpected error exchanging code' });
    }
});
//# sourceMappingURL=googleCalendarOAuth.js.map