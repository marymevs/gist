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

/**
 * A single connected Gmail inbox (issue #184). Client-readable metadata only —
 * tokens stay server-only in users/{uid}/integrations/{id}. The `emailAccounts`
 * array on the user doc is the authoritative registry of connected inboxes;
 * `emailIntegration` is a derived "≥1 connected" summary kept for compat.
 */
export interface EmailAccount {
  /** Integration doc id — `gmail:<email>`. */
  id: string;
  /** The connected inbox address. Doubles as the display label. */
  email: string;
  /** Reserved user-editable label; defaults to `email`. */
  label?: string;
  /** 'error' once a token refresh fails (revoked / expired). */
  status: 'connected' | 'error';
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
    /**
     * Long-form, free-text self-description (the source of truth). The user
     * describes themselves in their own words; we never overwrite this.
     */
    context?: string;
    /**
     * Backend-derived structure parsed from `context` by the deriveProfileContext
     * Cloud Function. Regenerable — re-derived whenever `context` changes or the
     * parser improves. The first Gist uses this if ready, raw `context` if not.
     */
    contextDerived?: {
      work?: string;
      freeTime?: string;
      creative?: string;
      misc?: string;
      parsedAt?: any; // Firestore Timestamp
      parserVersion?: string;
    };
  };

  prefs?: {
    tone?: 'calm' | 'detailed' | 'concise';
    topics?: string[]; // chip selections from onboarding
    rhythms?: string[]; // chip selections from onboarding
    /**
     * Important people — single source of truth for both the prompt's People
     * section and email VIP prioritization. Entries with an email are treated
     * as VIP senders by the Gmail fetch layer.
     */
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

    // ── Expanded questionnaire (issue #156) ──
    // Direct asks — kept as distinct questions because they're specific enough
    // that asking beats parsing them out of the free-text `profile.context`.
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
  /** Derived "≥1 inbox connected" summary. See emailAccounts for the registry. */
  emailIntegration?: EmailIntegration;
  /** Connected Gmail inboxes (issue #184). */
  emailAccounts?: EmailAccount[];
}
