/**
 * Shared types for the morning gist generation pipeline.
 *
 * Single source of truth for UserDoc, MorningGist, and related types.
 * Used by the scheduler, delivery methods, and tests.
 */

import type { Timestamp } from 'firebase-admin/firestore';
import type { EmailCard } from './integrations/gmailInt';

/** All delivery methods supported by the scheduler. */
export type DeliveryMethod = 'web' | 'email';

export type UserPrefs = {
  timezone?: string;
  city?: string;
  /** Renamed from newsDomains in Phase 1.6. Onboarding writes prefs.topics. */
  topics?: string[];
  rhythms?: string[];
  /**
   * Important people in the user's life. Single source of truth for both the
   * prompt (grounds the People section) and email prioritization — the Gmail
   * fetch/scoring layer (gmailInt.ts) derives its VIP sender list from the
   * entries that carry an email. Edited directly in the Account UI.
   */
  importantPeople?: {
    name: string;
    relationship: string;
    /** Optional email — enables direct matching against email senders. */
    email?: string;
  }[];
  tone?: string;
  maxPages?: number;
  email?: {
    includeUnreadOnly?: boolean;
    includeInboxOnly?: boolean;
    maxCards?: number;
    lookbackHours?: number;
    maxCandidates?: number;
    enableAi?: boolean;
  };
  countdown?: {
    label: string;       // e.g. "Thesis", "Race"
    targetDate: string;  // ISO date e.g. "2026-05-07"
  };

  // ── Expanded questionnaire (issue #156) ──
  // Direct asks — specific enough that asking beats parsing from profile.context.
  /** What they're working on right now — grounds the Practice Arc. */
  majorProject?: string;
  /** Long-form: "walk me through the first 2 hours of your day". */
  morningRoutine?: string;
  worstPartOfMorning?: string;
  whatWorksPerfectly?: string;
  whatWouldMakeYouStop?: string;
  /** Self-reported executive-function challenges (e.g. ADHD). */
  executiveFunctionStatus?: 'yes' | 'no' | 'prefer-not-to-say';
  /** Free-format wake time, e.g. "6:30 most days", "varies". */
  wakingTime?: string;
};

export type UserDelivery = {
  method?: DeliveryMethod;
  schedule?: {
    hour?: number;
    minute?: number;
    weekdaysOnly?: boolean;
  };
};

export type IntegrationStatus = {
  /** 'google' for calendar, 'gmail' for email. */
  provider?: 'google' | 'gmail';
  status?: 'connected' | 'disconnected';
  /** When the integration was connected. Firestore Timestamp. */
  connectedAt?: Timestamp;
};

/**
 * A single connected Gmail inbox (issue #184). The authoritative registry of
 * which inboxes a user has connected lives in `UserDoc.emailAccounts` — never
 * scan the `integrations` subcollection, which also holds the calendar token
 * doc. Tokens themselves stay server-only in `integrations/{id}`; this metadata
 * is client-readable (no secrets).
 */
export type EmailAccount = {
  /** Integration doc id — `gmail:<email>`. Stable identity per inbox. */
  id: string;
  /** The connected inbox address. Doubles as the display label for now. */
  email: string;
  /** Reserved for a user-editable label; defaults to `email`. */
  label?: string;
  /** 'error' once a token refresh fails (revoked / expired). */
  status: 'connected' | 'error';
  /** When the inbox was connected. Firestore Timestamp. */
  connectedAt?: Timestamp;
};

export type UserDoc = {
  uid: string;
  email: string | null;
  prefs?: UserPrefs;
  delivery?: UserDelivery;
  calendarIntegration?: IntegrationStatus;
  /**
   * Overall email status — derived summary kept for backward compat
   * (`hasConnectedIntegration` / `resolveDeliveryMethod`). `connected` iff at
   * least one entry in `emailAccounts` is connected.
   */
  emailIntegration?: IntegrationStatus;
  /** Connected Gmail inboxes (issue #184). Authoritative registry. */
  emailAccounts?: EmailAccount[];
  /** Running issue count — incremented each generation. */
  gistIssueCount?: number;
  profile?: {
    name?: string;
    /** Long-form, free-text self-description — the source of truth. */
    context?: string;
    /**
     * Backend-derived structure parsed from `context` by deriveProfileContext.
     * Regenerable; the generator uses it if present, raw `context` otherwise.
     */
    contextDerived?: {
      work?: string;
      freeTime?: string;
      creative?: string;
      misc?: string;
      parsedAt?: Timestamp;
      parserVersion?: string;
    };
  };
  /** Whether the user finished onboarding. Gates the /today vs /onboarding route. */
  onboardingComplete?: boolean;
  /** Date key (YYYY-MM-DD, user's tz) of the most recent generation. */
  lastGeneratedDate?: string;
  /** UTC instant of the next scheduled delivery; drives the cron query. */
  nextDeliveryAt?: unknown;
  /** Set at signup. Firestore Timestamp. */
  createdAt?: Timestamp;
  /** Bumped on every write. Firestore Timestamp. */
  updatedAt?: Timestamp;
};

export type MorningGist = {
  id: string;
  userId: string;
  date: string;
  timezone: string;

  weatherSummary: string;
  moonPhase?: string;
  firstEvent?: string;

  dayItems: { time?: string; title: string; note?: string }[];
  worldItems: { headline: string; implication: string }[];
  emailCards: EmailCard[];
  qualityScore?: {
    editorialVoice: number;
    crossReferenceDepth: number;
    personalizationDepth: number;
  };

  /** Newspaper-format output (structured JSON from Claude). Stored for template rendering. */
  newspaper?: Record<string, unknown>;

  /**
   * Server-rendered broadsheet artifact HTML (the web/print view). Rendered from
   * the same NewspaperTemplateInput as the email, so the surfaces never drift.
   * /today renders this in an <iframe srcdoc>; Print prints the iframe.
   */
  renderedHtml?: string;

  delivery: {
    method: DeliveryMethod;
    pages: number;
    status: 'queued' | 'delivered' | 'failed';
    deliveredAt?: Timestamp;
  };

  createdAt: Timestamp;
  /** TTL field (issue #177). Firestore auto-deletes the doc after this instant. */
  expireAt?: Timestamp;
};
