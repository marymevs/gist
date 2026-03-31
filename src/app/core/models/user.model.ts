export type GistPlan = 'web' | 'print' | 'loop';

export interface CalendarIntegration {
  provider?: 'google';
  status?: 'connected' | 'disconnected';
  accessToken?: string | null;
  authorizationCode?: string | null;
  connectedAt?: any;
}

export interface EmailIntegration {
  provider?: 'gmail';
  status?: 'connected' | 'disconnected';
  connectedAt?: any;
}

export interface GistUser {
  uid: string;
  email: string | null;

  plan: GistPlan;

  createdAt: any; // Firestore Timestamp
  updatedAt: any;

  // Onboarding profile fields
  profile?: {
    name?: string;
    context?: string; // free-text role/situation
  };

  prefs?: {
    email?: {
      vipSenders?: string[];
    };
    length?: 'brief' | 'standard' | 'detailed';
    tone?: 'calm' | 'detailed' | 'concise';
    topics?: string[];     // chip selections from onboarding
    rhythms?: string[];    // chip selections from onboarding
    quietDays?: number[];  // 0=Sun, 1=Mon, ..., 6=Sat
    timezone?: string;
    city?: string;
    countdown?: {
      label: string;       // e.g. "Thesis", "Race"
      targetDate: string;  // ISO date e.g. "2026-05-07"
    };
  };

  // Delivery schedule (per-user delivery times)
  delivery?: {
    method?: 'web' | 'email' | 'fax';
    /** E.164 or 10-digit fax number, e.g. "+12125551234" */
    faxNumber?: string;
    schedule?: {
      hour?: number;   // 0-23, default 7
      minute?: number; // 0-59, default 30
    };
  };

  /** ISO timestamp of next scheduled delivery, set by scheduler/onboarding. */
  nextDeliveryAt?: any;
  /** ISO date string of last generated gist, prevents double-generation. */
  lastGeneratedDate?: string;

  /** Running issue count — incremented each generation. Masthead: "Vol. I · No. {count}" */
  gistIssueCount?: number;

  // Onboarding state
  onboardingComplete?: boolean;

  // Billing
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: 'demo' | 'active' | 'past_due' | 'canceled';

  calendarIntegration?: CalendarIntegration;
  emailIntegration?: EmailIntegration;
}
