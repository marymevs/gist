import { logger } from 'firebase-functions';
import { getDb } from '../firebaseAdmin';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './googleCalendarInt';
import {
  decryptTokenRecord,
  encryptTokenRecord,
} from '../crypto/fieldCrypto';
import {
  classifyEmailCandidates,
  type EmailAiInput,
  type EmailAiResult,
} from './claudeEmail';
// Type-only import — erased at compile, so no runtime cycle with types.ts
// (which imports EmailCard from this file).
import type { EmailAccount } from '../types';

export type EmailCategory = 'Action' | 'WaitingOn' | 'FYI';

export type EmailCard = {
  id: string;
  threadId: string;
  messageId: string;
  fromName?: string;
  fromEmail?: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  category: EmailCategory;
  urgency: number;
  importance: number;
  why: string;
  suggestedNextStep?: string;
  /** Which connected inbox this card came from (issue #184). */
  accountId?: string;
  /** Display label for the source inbox — the account's email address. */
  accountLabel?: string;
};

type EmailPrefs = {
  includeUnreadOnly?: boolean;
  includeInboxOnly?: boolean;
  maxCards?: number;
  lookbackHours?: number;
  maxCandidates?: number;
  enableAi?: boolean;
};

type StoredGoogleTokens = {
  accessToken?: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiryDate?: number;
  idToken?: string;
};

type TokenStorageLocation = { kind: 'integration'; refPath: string };

/** A connected Gmail inbox with its decrypted tokens, ready to fetch from. */
type GmailAccount = {
  accountId: string;
  /** The inbox's email address — also the card's accountLabel. */
  accountLabel: string;
  /** Current registry status, used to self-heal a stale 'error' flag. */
  status: 'connected' | 'error';
  tokens: StoredGoogleTokens;
  location: TokenStorageLocation;
};

/** Thrown when an account's token can't be refreshed (likely revoked). */
class GmailAuthError extends Error {}

type GmailMessageListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
};

type GmailHeader = { name?: string; value?: string };

type GmailPayload = {
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    attachmentId?: string;
    size?: number;
  };
  parts?: GmailPayload[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
};

/** Exported for unit tests of the global selection pass (selectEmailCards). */
export type EmailCandidate = {
  accountId: string;
  accountLabel: string;
  messageId: string;
  threadId: string;
  fromName?: string;
  fromEmail?: string;
  subject: string;
  snippet: string;
  receivedAtMs: number;
  isUnread: boolean;
  isImportant: boolean;
  isStarred: boolean;
  isDirect: boolean;
  isCc: boolean;
  isList: boolean;
  isAutomated: boolean;
  hasAttachment: boolean;
  hasDocLink: boolean;
  hasAsk: boolean;
  hasUrgent: boolean;
  hasWaitingOn: boolean;
  hasQuestion: boolean;
  isNewsletterish: boolean;
  fromVip: boolean;
  senderDomain: string | null;
  categoryHint: EmailCategory;
  urgencyHint: number;
  reasons: string[];
  baseScore: number;
};

type ScoredCandidate = EmailCandidate & {
  category: EmailCategory;
  urgency: number;
  importance: number;
  why: string;
  suggestedNextStep?: string;
};

const db = getDb();

const DEFAULT_MAX_CARDS = 5;
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_MAX_CANDIDATES = 120;
/** Hard cap on candidates fetched across ALL inboxes in one run (issue #184). */
const GLOBAL_CANDIDATE_CEILING = 240;
const AI_MAX_CANDIDATES = 30;
const FETCH_CONCURRENCY = 10;

const BASE_QUERY =
  'newer_than:1d -category:social -category:promotions -category:forums';

const METADATA_HEADERS = [
  'From',
  'To',
  'Cc',
  'Subject',
  'Date',
  'List-Id',
  'List-Unsubscribe',
  'Precedence',
  'Auto-Submitted',
  'X-Autoreply',
  'X-Auto-Response-Suppress',
];

const URGENT_PHRASES = [
  'urgent',
  'asap',
  'today',
  'tomorrow',
  'eod',
  'end of day',
  'deadline',
  'overdue',
  'time-sensitive',
  'immediately',
];

const ACTION_PHRASES = [
  'can you',
  'could you',
  'please',
  'need your',
  'need you to',
  'review',
  'approve',
  'sign',
  'send',
  'confirm',
  'schedule',
  'rsvp',
  'action required',
  'follow up',
  'reply',
];

const WAITING_ON_PHRASES = [
  'following up',
  'checking in',
  'circling back',
  'just checking',
  'just bumping',
  'bump',
  'pinging',
  'any update',
  'status update',
  'still waiting',
];

const NEWSLETTER_PHRASES = [
  'newsletter',
  'digest',
  'roundup',
  'weekly update',
  'monthly update',
  'announcement',
];

const DOC_LINK_REGEX =
  /\b(docs\.google\.com|drive\.google\.com|notion\.so|figma\.com|dropbox\.com|box\.com)\b/i;

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'icloud.com',
  'hotmail.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
]);

function getSecretValue(secret: { value: () => string }): string | null {
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

/**
 * Load every connected Gmail inbox for a user, with decrypted tokens.
 *
 * Driven by the `emailAccounts` registry on the user doc — we never scan the
 * `integrations` subcollection, which also holds the calendar token doc. Falls
 * back to the pre-#184 single `gmail` doc when no registry exists yet (the lazy
 * migration safety net), deriving the label from the user's own address.
 */
async function loadGmailAccounts(userId: string): Promise<GmailAccount[]> {
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const userData = userSnap.data() as
    | { emailAccounts?: EmailAccount[]; email?: string | null }
    | undefined;
  const registry = userData?.emailAccounts ?? [];

  const accounts: GmailAccount[] = [];

  if (registry.length) {
    for (const entry of registry) {
      if (!entry?.id) continue;
      const ref = userRef.collection('integrations').doc(entry.id);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = snap.data() as StoredGoogleTokens | undefined;
      if (!data?.accessToken && !data?.refreshToken) continue;
      accounts.push({
        accountId: entry.id,
        accountLabel: entry.email ?? entry.id,
        status: entry.status ?? 'connected',
        tokens: decryptTokenRecord(data),
        location: { kind: 'integration', refPath: ref.path },
      });
    }
    return accounts;
  }

  // Legacy fallback: the single hardcoded `gmail` doc from before #184.
  const legacyRef = userRef.collection('integrations').doc('gmail');
  const legacySnap = await legacyRef.get();
  if (legacySnap.exists) {
    const data = legacySnap.data() as StoredGoogleTokens | undefined;
    if (data?.accessToken || data?.refreshToken) {
      accounts.push({
        accountId: 'gmail',
        accountLabel: userData?.email ?? 'gmail',
        status: 'connected',
        tokens: decryptTokenRecord(data),
        location: { kind: 'integration', refPath: legacyRef.path },
      });
    }
  }

  return accounts;
}

/**
 * Best-effort write-back of changed per-account statuses after a fetch. Only
 * called when a status actually changed (a fetch failed → 'error', or a
 * previously-failing account recovered → 'connected'), so generation stays a
 * read path in the common case. Also recomputes the derived emailIntegration
 * summary. Swallows errors — a status write must never fail a gist.
 */
async function applyAccountStatusUpdates(
  userId: string,
  updates: Map<string, 'connected' | 'error'>,
): Promise<void> {
  if (!updates.size) return;
  const userRef = db.collection('users').doc(userId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const existing =
        (snap.data()?.['emailAccounts'] as EmailAccount[] | undefined) ?? [];
      if (!existing.length) return;
      const next = existing.map((a) =>
        updates.has(a.id) ? { ...a, status: updates.get(a.id)! } : a,
      );
      const anyConnected = next.some((a) => a.status === 'connected');
      tx.set(
        userRef,
        {
          emailAccounts: next,
          emailIntegration: {
            provider: 'gmail',
            status: anyConnected ? 'connected' : 'disconnected',
          },
        },
        { merge: true },
      );
    });
  } catch (error) {
    logger.warn('Failed to write back Gmail account statuses.', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function persistTokens(
  location: TokenStorageLocation | null,
  tokens: StoredGoogleTokens,
): Promise<void> {
  if (!location) return;
  const payload = {
    ...encryptTokenRecord({
      accessToken: tokens.accessToken ?? null,
      refreshToken: tokens.refreshToken ?? null,
      idToken: tokens.idToken ?? null,
    }),
    scope: tokens.scope ?? null,
    tokenType: tokens.tokenType ?? null,
    expiryDate: tokens.expiryDate ?? null,
    updatedAt: new Date().toISOString(),
  };

  await db.doc(location.refPath).set(payload, { merge: true });
}

async function refreshAccessToken(
  tokens: StoredGoogleTokens,
  oauth: { clientId: string; clientSecret: string },
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
    const errorText = await response.text().catch(() => '');
    logger.warn('Gmail OAuth token refresh failed.', {
      status: response.status,
      body: errorText.slice(0, 400),
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
  location: TokenStorageLocation | null,
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

async function listMessageIds(params: {
  accessToken: string;
  query: string;
  maxResults: number;
  userId: string;
}): Promise<Array<{ id: string; threadId: string }>> {
  const url = new URL(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages',
  );
  url.searchParams.set('q', params.query);
  url.searchParams.set('maxResults', String(params.maxResults));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.warn('Gmail list messages failed.', {
      status: response.status,
      body: text.slice(0, 400),
      userId: params.userId,
    });
    return [];
  }

  const data = (await response.json()) as GmailMessageListResponse;
  return data.messages ?? [];
}

async function fetchMessageMetadata(params: {
  accessToken: string;
  messageId: string;
}): Promise<GmailMessage | null> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.messageId}`,
  );
  url.searchParams.set('format', 'metadata');
  METADATA_HEADERS.forEach((header) =>
    url.searchParams.append('metadataHeaders', header),
  );

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.warn('Gmail message fetch failed.', {
      status: response.status,
      body: text.slice(0, 400),
      messageId: params.messageId,
    });
    return null;
  }

  return (await response.json()) as GmailMessage;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        results[current] = await mapper(items[current]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function normalizeText(value: string | undefined | null): string {
  return value ? value.replace(/\s+/g, ' ').trim() : '';
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const hit = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return hit?.value?.trim() ?? '';
}

function extractEmails(raw: string): string[] {
  if (!raw) return [];
  const matches = raw.match(EMAIL_REGEX);
  if (!matches) return [];
  return matches.map((email) => email.toLowerCase());
}

function parseFrom(raw: string): { name?: string; email?: string } {
  if (!raw) return {};
  const match = raw.match(/^(.*)<([^>]+)>$/);
  if (match) {
    const name = normalizeText(match[1]).replace(/^"|"$|^'|'$/g, '');
    const email = normalizeText(match[2]).toLowerCase();
    return {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    };
  }

  const email = extractEmails(raw)[0];
  return {
    ...(email ? { email } : {}),
    ...(email ? {} : { name: normalizeText(raw) }),
  };
}

function hasAttachment(payload?: GmailPayload): boolean {
  if (!payload) return false;
  if (payload.filename && payload.filename.trim()) return true;
  if (payload.body?.attachmentId) return true;
  return payload.parts?.some((part) => hasAttachment(part)) ?? false;
}

function textHasAny(text: string, phrases: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return phrases.some((phrase) => lower.includes(phrase));
}

function computeUrgency(text: string): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  if (URGENT_PHRASES.some((phrase) => lower.includes(phrase))) return 3;
  if (lower.includes('today') || lower.includes('tomorrow')) return 2;
  if (lower.includes('this week') || lower.includes('soon')) return 1;
  return 0;
}

function categoryBonus(category: EmailCategory): number {
  if (category === 'Action') return 4;
  if (category === 'WaitingOn') return 3;
  return 1;
}

function formatWhy(reasons: string[]): string {
  const positive = reasons.filter(
    (reason) => !reason.toLowerCase().includes('mailing list'),
  );
  const picks = (positive.length ? positive : reasons).slice(0, 2);
  return picks.join(' • ') || 'High-signal update';
}

function suggestedNextStepFor(category: EmailCategory): string {
  if (category === 'Action') return 'Reply with the next step.';
  if (category === 'WaitingOn') return 'Send a quick status check-in.';
  return 'Save or archive if no action is needed.';
}

function buildBaseQuery(prefs: EmailPrefs): string {
  const query = [BASE_QUERY];
  if (prefs.includeInboxOnly ?? true) query.push('in:inbox');
  if (prefs.includeUnreadOnly) query.push('is:unread');
  return query.join(' ');
}

function isPersonalDomain(domain: string | null): boolean {
  if (!domain) return false;
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Fetch and heuristically score candidate emails from a single connected inbox.
 * Throws GmailAuthError if the account's token can't be refreshed, so the
 * orchestrator can flag that inbox as needing reconnect. Selection (AI
 * classify, quotas, dedup) is global and happens later in selectEmailCards.
 */
async function fetchScoredCandidatesForAccount(params: {
  account: GmailAccount;
  prefs: EmailPrefs;
  vipEmails: string[];
  /** All of the user's own addresses — every connected inbox counts as "you". */
  youEmails: Set<string>;
  now: Date;
  maxCandidates: number;
  lookbackHours: number;
  oauth: { clientId: string; clientSecret: string };
}): Promise<EmailCandidate[]> {
  const { account, prefs, vipEmails, youEmails } = params;

  const refreshedTokens = await ensureFreshAccessToken(
    account.tokens,
    params.oauth,
    account.location,
  );
  if (!refreshedTokens?.accessToken) {
    throw new GmailAuthError(
      `Gmail token refresh failed for ${account.accountId}`,
    );
  }

  const query = buildBaseQuery(prefs);
  const messageIds = await listMessageIds({
    accessToken: refreshedTokens.accessToken,
    query,
    maxResults: params.maxCandidates,
    userId: account.accountId,
  });

  if (!messageIds.length) return [];

  const rawMessages = await mapWithConcurrency(
    messageIds,
    FETCH_CONCURRENCY,
    async (message) =>
      fetchMessageMetadata({
        accessToken: refreshedTokens.accessToken as string,
        messageId: message.id,
      }),
  );

  const nowMs = params.now.getTime();
  const lookbackMs = params.lookbackHours * 60 * 60 * 1000;

  const candidates: EmailCandidate[] = [];

  for (const message of rawMessages) {
    if (!message) continue;
    const headers = message.payload?.headers ?? [];

    const subject =
      normalizeText(headerValue(headers, 'Subject')) || 'No subject';
    const snippet = normalizeText(message.snippet ?? '');
    const fromRaw = headerValue(headers, 'From');
    const toRaw = headerValue(headers, 'To');
    const ccRaw = headerValue(headers, 'Cc');

    const from = parseFrom(fromRaw);
    const toEmails = extractEmails(toRaw);
    const ccEmails = extractEmails(ccRaw);

    const receivedAtMs = message.internalDate
      ? Number(message.internalDate)
      : Date.parse(headerValue(headers, 'Date'));
    if (!Number.isFinite(receivedAtMs)) continue;
    if (nowMs - receivedAtMs > lookbackMs) continue;

    const labelIds = message.labelIds ?? [];
    const isUnread = labelIds.includes('UNREAD');
    const isImportant = labelIds.includes('IMPORTANT');
    const isStarred = labelIds.includes('STARRED');

    const listId = headerValue(headers, 'List-Id');
    const listUnsubscribe = headerValue(headers, 'List-Unsubscribe');
    const precedence = headerValue(headers, 'Precedence');
    const autoSubmitted = headerValue(headers, 'Auto-Submitted');
    const xAutoReply = headerValue(headers, 'X-Autoreply');
    const xAutoSuppress = headerValue(headers, 'X-Auto-Response-Suppress');

    const isList =
      Boolean(listId) ||
      Boolean(listUnsubscribe) ||
      precedence.toLowerCase().includes('bulk');

    const isAutomated =
      /no-?reply|do-?not-?reply|auto@/i.test(from.email ?? '') ||
      /no-?reply|do-?not-?reply/i.test(fromRaw) ||
      autoSubmitted.toLowerCase() === 'auto-generated' ||
      Boolean(xAutoReply) ||
      Boolean(xAutoSuppress);

    const attachmentPresent = hasAttachment(message.payload);
    const hasDocLink = DOC_LINK_REGEX.test(`${subject} ${snippet}`);

    const combinedText = `${subject} ${snippet}`;
    const hasAsk = textHasAny(combinedText, ACTION_PHRASES);
    const hasUrgent = textHasAny(combinedText, URGENT_PHRASES);
    const hasWaitingOn = textHasAny(combinedText, WAITING_ON_PHRASES);
    const hasQuestion = combinedText.includes('?');
    const isNewsletterish =
      isList || textHasAny(combinedText, NEWSLETTER_PHRASES);

    const isDirect = toEmails.some((email) => youEmails.has(email));
    const isCc = ccEmails.some((email) => youEmails.has(email));

    const senderEmail = from.email ?? null;
    const senderDomain = senderEmail
      ? (senderEmail.split('@')[1] ?? null)
      : null;
    const fromVip = senderEmail ? vipEmails.includes(senderEmail) : false;

    let categoryHint: EmailCategory = 'FYI';
    if (hasWaitingOn) categoryHint = 'WaitingOn';
    else if (hasAsk || hasUrgent || (isDirect && hasQuestion))
      categoryHint = 'Action';

    const urgencyHint = computeUrgency(combinedText);

    const reasons: string[] = [];
    let baseScore = 0;

    if (fromVip) {
      baseScore += 6;
      reasons.push('VIP sender');
    }
    if (isDirect) {
      baseScore += 4;
      reasons.push('Direct to you');
    } else if (isCc) {
      baseScore += 1;
      reasons.push('You were CC’d');
    }
    if (isImportant) {
      baseScore += 4;
      reasons.push('Marked important');
    }
    if (isStarred) {
      baseScore += 2;
      reasons.push('Starred');
    }
    if (isUnread) {
      baseScore += 2;
      reasons.push('Unread');
    }
    if (hasAsk) {
      baseScore += 3;
      reasons.push('Clear ask');
    }
    if (hasUrgent) {
      baseScore += 3;
      reasons.push('Urgent language');
    }
    if (attachmentPresent) {
      baseScore += 2;
      reasons.push('Attachment');
    }
    if (hasDocLink) {
      baseScore += 2;
      reasons.push('Doc link');
    }

    if (isList) {
      baseScore -= 6;
      reasons.push('Mailing list');
    }
    if (isAutomated) {
      baseScore -= 4;
      reasons.push('Automated sender');
    }
    if ((subject.match(/\bre:\b/gi) ?? []).length >= 3) {
      baseScore -= 2;
      reasons.push('Long thread');
    }

    const hoursAgo = (nowMs - receivedAtMs) / (1000 * 60 * 60);
    if (hoursAgo <= 2) {
      baseScore += 2;
      reasons.push('Very recent');
    } else if (hoursAgo <= 6) {
      baseScore += 1;
      reasons.push('Recent');
    }

    candidates.push({
      accountId: account.accountId,
      accountLabel: account.accountLabel,
      messageId: message.id,
      threadId: message.threadId,
      fromName: from.name,
      fromEmail: senderEmail ?? undefined,
      subject,
      snippet,
      receivedAtMs,
      isUnread,
      isImportant,
      isStarred,
      isDirect,
      isCc,
      isList,
      isAutomated,
      hasAttachment: attachmentPresent,
      hasDocLink,
      hasAsk,
      hasUrgent,
      hasWaitingOn,
      hasQuestion,
      isNewsletterish,
      fromVip,
      senderDomain,
      categoryHint,
      urgencyHint,
      reasons,
      baseScore,
    });
  }

  return candidates;
}

/**
 * Select the final cards from a candidate pool merged across all inboxes
 * (issue #184). The single global merit pass: repeated-sender penalty, optional
 * AI classification, importance scoring, category quotas, and the personal-
 * email guarantee — all applied across accounts together. Dedup and AI keys are
 * namespaced by account because Gmail message/thread ids are unique only within
 * a single inbox.
 */
export async function selectEmailCards(
  candidates: EmailCandidate[],
  prefs: EmailPrefs,
  maxCards: number,
): Promise<EmailCard[]> {
  if (!candidates.length) return [];

  const candKey = (c: EmailCandidate): string =>
    `${c.accountId}:${c.messageId}`;
  const threadKey = (c: EmailCandidate): string =>
    `${c.accountId}:${c.threadId}`;

  const senderCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const sender = candidate.fromEmail ?? '';
    if (!sender) continue;
    senderCounts.set(sender, (senderCounts.get(sender) ?? 0) + 1);
  }

  for (const candidate of candidates) {
    if (!candidate.fromEmail) continue;
    const count = senderCounts.get(candidate.fromEmail) ?? 0;
    if (count > 1) {
      candidate.baseScore -= Math.min(3, count - 1);
      candidate.reasons.push('Repeated sender');
    }
  }

  const enableAi =
    prefs.enableAi ??
    (process.env.GIST_EMAIL_AI?.toLowerCase() === 'true' ||
      process.env.GIST_EMAIL_AI === '1');

  let aiResults: EmailAiResult[] = [];
  if (enableAi) {
    const topForAi = [...candidates]
      .sort((a, b) => b.baseScore - a.baseScore)
      .slice(0, AI_MAX_CANDIDATES);

    const aiInputs: EmailAiInput[] = topForAi.map((candidate) => ({
      id: candKey(candidate),
      from: candidate.fromEmail ?? candidate.fromName ?? 'Unknown sender',
      subject: candidate.subject,
      snippet: candidate.snippet,
    }));

    aiResults = await classifyEmailCandidates(aiInputs);
  }

  const aiById = new Map(aiResults.map((result) => [result.id, result]));

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const ai = aiById.get(candKey(candidate));
    const category = ai?.category ?? candidate.categoryHint;
    const urgency = ai?.urgency ?? candidate.urgencyHint;

    const importance =
      candidate.baseScore + 2 * urgency + categoryBonus(category);

    return {
      ...candidate,
      category,
      urgency,
      importance,
      why: ai?.why_it_matters ?? formatWhy(candidate.reasons),
      suggestedNextStep:
        ai?.suggested_next_step || suggestedNextStepFor(category),
    };
  });

  const sorted = scored.sort((a, b) => b.importance - a.importance);
  const selections: ScoredCandidate[] = [];
  const usedSenders = new Set<string>();
  const usedThreads = new Set<string>();
  let newsletterUsed = false;

  const perCategoryCount = {
    Action: 0,
    WaitingOn: 0,
    FYI: 0,
  };

  const quotas: Record<EmailCategory, number> = {
    Action: 2,
    WaitingOn: 1,
    FYI: 2,
  };

  const canTake = (candidate: ScoredCandidate): boolean => {
    if (usedThreads.has(threadKey(candidate))) return false;
    if (candidate.fromEmail && usedSenders.has(candidate.fromEmail))
      return false;
    if (candidate.isNewsletterish && newsletterUsed) return false;
    return true;
  };

  const take = (candidate: ScoredCandidate): void => {
    selections.push(candidate);
    if (candidate.fromEmail) usedSenders.add(candidate.fromEmail);
    usedThreads.add(threadKey(candidate));
    if (candidate.isNewsletterish) newsletterUsed = true;
    perCategoryCount[candidate.category] += 1;
  };

  (['Action', 'WaitingOn', 'FYI'] as EmailCategory[]).forEach((category) => {
    for (const candidate of sorted) {
      if (selections.length >= maxCards) return;
      if (candidate.category !== category) continue;
      if (perCategoryCount[category] >= quotas[category]) continue;
      if (!canTake(candidate)) continue;
      take(candidate);
    }
  });

  for (const candidate of sorted) {
    if (selections.length >= maxCards) break;
    if (selections.includes(candidate)) continue;
    if (!canTake(candidate)) continue;
    take(candidate);
  }

  const hasPersonal = selections.some((candidate) =>
    isPersonalDomain(candidate.senderDomain),
  );
  if (!hasPersonal && selections.length === maxCards) {
    const personalCandidate = sorted.find(
      (candidate) =>
        isPersonalDomain(candidate.senderDomain) &&
        !selections.includes(candidate) &&
        canTake(candidate),
    );
    if (personalCandidate) {
      const lowestIndex = selections.reduce((lowest, candidate, index) => {
        if (!selections[lowest]) return index;
        return selections[lowest].importance <= candidate.importance
          ? lowest
          : index;
      }, 0);
      selections[lowestIndex] = personalCandidate;
    }
  }

  return selections.map((candidate) => ({
    id: candKey(candidate),
    threadId: candidate.threadId,
    messageId: candidate.messageId,
    fromName: candidate.fromName,
    fromEmail: candidate.fromEmail,
    subject: candidate.subject,
    snippet: candidate.snippet.slice(0, 200),
    receivedAt: new Date(candidate.receivedAtMs).toISOString(),
    category: candidate.category,
    urgency: candidate.urgency,
    importance: Math.round(candidate.importance * 10) / 10,
    why: candidate.why,
    suggestedNextStep: candidate.suggestedNextStep,
    accountId: candidate.accountId,
    accountLabel: candidate.accountLabel,
  }));
}

/**
 * Orchestrate the email pull across all of a user's connected Gmail inboxes
 * (issue #184). Fans out per-account candidate fetching with failures isolated
 * (one revoked inbox can't zero the gist), merges the pools, and runs a single
 * global selection. Self-heals a stale 'error' status when an inbox recovers.
 */
export async function fetchEmailCards(params: {
  userId: string;
  userEmail?: string | null;
  prefs?: EmailPrefs;
  /**
   * Single source of truth for VIP senders. The VIP list is derived from the
   * entries that carry an email — see importantPeople in UserPrefs.
   */
  importantPeople?: { name: string; relationship: string; email?: string }[];
  now: Date;
}): Promise<EmailCard[]> {
  const prefs: EmailPrefs = params.prefs ?? {};
  const maxCards = Math.max(1, Math.min(prefs.maxCards ?? DEFAULT_MAX_CARDS, 7));
  const lookbackHours = Math.max(
    1,
    Math.min(prefs.lookbackHours ?? DEFAULT_LOOKBACK_HOURS, 72),
  );
  const requestedMaxCandidates = Math.max(
    20,
    Math.min(prefs.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 200),
  );

  const { clientId, clientSecret } = getOAuthConfig();
  if (!clientId || !clientSecret) {
    logger.warn('Google OAuth client configuration missing for Gmail.');
    return [];
  }

  const accounts = await loadGmailAccounts(params.userId);
  if (!accounts.length) {
    logger.info('No Gmail accounts connected for user.', {
      userId: params.userId,
    });
    return [];
  }

  // Divide a global fetch budget across inboxes so a many-account user can't
  // blow the function timeout pulling metadata for every message.
  const maxCandidates = Math.max(
    20,
    Math.min(
      requestedMaxCandidates,
      Math.floor(GLOBAL_CANDIDATE_CEILING / accounts.length),
    ),
  );

  const vipEmails = (params.importantPeople ?? [])
    .map((person) => person.email)
    .filter((email): email is string => !!email)
    .map((email) => email.toLowerCase());

  // Every connected inbox address counts as "you" for direct/cc detection.
  const youEmails = new Set<string>();
  if (params.userEmail) youEmails.add(params.userEmail.toLowerCase());
  for (const account of accounts) {
    youEmails.add(account.accountLabel.toLowerCase());
  }

  const results = await Promise.allSettled(
    accounts.map((account) =>
      fetchScoredCandidatesForAccount({
        account,
        prefs,
        vipEmails,
        youEmails,
        now: params.now,
        maxCandidates,
        lookbackHours,
        oauth: { clientId, clientSecret },
      }),
    ),
  );

  const merged: EmailCandidate[] = [];
  const statusUpdates = new Map<string, 'connected' | 'error'>();

  results.forEach((result, index) => {
    const account = accounts[index];
    if (result.status === 'fulfilled') {
      merged.push(...result.value);
      // Recovered: a previously-failing inbox fetched cleanly this run.
      if (account.status === 'error') {
        statusUpdates.set(account.accountId, 'connected');
      }
    } else {
      logger.warn('Gmail account fetch failed.', {
        userId: params.userId,
        accountId: account.accountId,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
      // Only a genuine auth failure flips an inbox to 'error'; transient list/
      // fetch errors are left alone and self-heal on the next run.
      if (
        result.reason instanceof GmailAuthError &&
        account.status !== 'error'
      ) {
        statusUpdates.set(account.accountId, 'error');
      }
    }
  });

  if (statusUpdates.size) {
    await applyAccountStatusUpdates(params.userId, statusUpdates);
  }

  return selectEmailCards(merged, prefs, maxCards);
}
