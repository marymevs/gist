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
   * Important people in the user's life. Single source of truth for the prompt —
   * used to ground the People section AND to prioritize email signals in the
   * generated brief. The legacy email.vipSenders field below is retained for the
   * Gmail fetch/scoring layer (gmailInt.ts) and the Account UI until those are
   * migrated to derive from importantPeople in a follow-up PR.
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
    /**
     * Legacy field consumed by gmailInt.ts email scoring and the Account UI.
     * Not passed to the prompt — the prompt uses importantPeople instead.
     * Will be derived from importantPeople in a future PR.
     */
    vipSenders?: string[];
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

export type UserDoc = {
  uid: string;
  email: string | null;
  prefs?: UserPrefs;
  delivery?: UserDelivery;
  calendarIntegration?: IntegrationStatus;
  emailIntegration?: IntegrationStatus;
  /** Running issue count — incremented each generation. */
  gistIssueCount?: number;
  profile?: {
    name?: string;
    context?: string;
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

  delivery: {
    method: DeliveryMethod;
    pages: number;
    status: 'queued' | 'delivered' | 'failed';
    deliveredAt?: Timestamp;
  };

  createdAt: Timestamp;
};
