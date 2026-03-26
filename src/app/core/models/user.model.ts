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

  prefs?: {
    email?: {
      vipSenders?: string[];
    };
    length?: 'brief' | 'standard' | 'detailed';
    tone?: 'calm' | 'detailed' | 'concise';
    quietDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  };

  // Billing (stubbed for now)
  stripeCustomerId?: string | null;
  stripeSubscriptionStatus?: 'demo' | 'active' | 'past_due' | 'canceled';
  // Calendar integration (OAuth tokens stored for backend use)

  calendarIntegration?: {
    provider?: 'google';
    status?: 'connected' | 'disconnected';
    accessToken?: string | null;
    authorizationCode?: string | null;
    connectedAt?: any;
  };

  emailIntegration?: EmailIntegration;

  /** Delivery preferences — fax number required for print plan users. */
  delivery?: {
    /** E.164 or 10-digit fax number, e.g. "+12125551234" */
    faxNumber?: string;
  };
}
