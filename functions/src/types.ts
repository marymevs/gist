/**
 * Shared types for the morning gist generation pipeline.
 *
 * Single source of truth for UserDoc, MorningGist, and related types.
 * Used by the scheduler, delivery methods, and tests.
 */

import type { Timestamp } from 'firebase-admin/firestore';
import type { EmailCard } from './integrations/gmailInt';

/** All delivery methods supported by the scheduler. */
export type DeliveryMethod = 'web' | 'email' | 'fax';

export type GistPlan = 'web' | 'print' | 'loop';

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
};

export type UserDelivery = {
  method?: DeliveryMethod;
  /** E.164 or 10-digit fax number, e.g. "+12125551234" */
  faxNumber?: string;
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
  plan: GistPlan;
  prefs?: UserPrefs;
  delivery?: UserDelivery;
  calendarIntegration?: IntegrationStatus;
  emailIntegration?: IntegrationStatus;
};

export type MorningGist = {
  id: string;
  userId: string;
  date: string;
  timezone: string;

  weatherSummary: string;
  firstEvent?: string;

  dayItems: { time?: string; title: string; note?: string }[];
  worldItems: { headline: string; implication: string }[];
  emailCards: EmailCard[];
  gistBullets: string[];
  oneThing: string;

  delivery: {
    method: DeliveryMethod;
    pages: number;
    status: 'queued' | 'delivered' | 'failed';
    deliveredAt?: Timestamp;
    /** Phaxio fax ID — set for fax deliveries, used by faxWebhook to correlate callbacks. */
    phaxioFaxId?: string;
  };

  createdAt: Timestamp;
};
