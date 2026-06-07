export interface CalendarIntegration {
  provider?: 'google';
  status?: 'connected' | 'disconnected';
  connectedAt?: any;
  // NB: OAuth tokens are NOT stored here. They live, server-only, in the
  // users/{uid}/integrations/{googleCalendar|gmail} subcollection. The legacy
  // accessToken/authorizationCode fields were removed (issue #55).
}

export interface EmailIntegration {
  provider?: 'gmail';
  status?: 'connected' | 'disconnected';
  connectedAt?: any;
}

export interface GistUser {
  uid: string;
  email: string | null;

  createdAt: any; // Firestore Timestamp
  updatedAt: any;

  // Onboarding profile fields
  profile?: {
    name?: string;
    context?: string; // free-text role/situation
  };

  prefs?: {
    email?: {
      /** Legacy — kept for Account UI; not passed to the prompt (importantPeople is). */
      vipSenders?: string[];
    };
    length?: 'brief' | 'standard' | 'detailed';
    tone?: 'calm' | 'detailed' | 'concise';
    topics?: string[]; // chip selections from onboarding
    rhythms?: string[]; // chip selections from onboarding
    importantPeople?: {
      name: string;
      relationship: string;
      /** Optional email for direct matching against email senders. */
      email?: string;
    }[];
    quietDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    timezone?: string;
    city?: string;
    countdown?: {
      label: string; // e.g. "Thesis", "Race"
      targetDate: string; // ISO date e.g. "2026-05-07"
    };
  };

  // Delivery schedule (per-user delivery times)
  delivery?: {
    method?: 'web' | 'email';
    schedule?: {
      hour?: number; // 0-23, default 7
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

  // Integrations
  calendarIntegration?: CalendarIntegration;
  emailIntegration?: EmailIntegration;
}
