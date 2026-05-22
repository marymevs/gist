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
  newsDomains?: string[];
  tone?: string;
  maxPages?: number;
  email?: {
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
  status?: 'connected' | 'disconnected';
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
  gistBullets: string[];
  oneThing: string;
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
