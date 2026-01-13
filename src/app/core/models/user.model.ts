export type GistPlan = 'web' | 'print' | 'loop';

export interface CalendarIntegration {
  provider?: 'google';
  accessToken?: string | null;
  authorizationCode?: string | null;
  connectedAt?: any;
}

export interface GistUser {
  uid: string;
  email: string | null;

  plan: GistPlan;

  createdAt: any; // Firestore Timestamp
  updatedAt: any;

  // Billing (stubbed for now)
  stripeCustomerId?: string | null;
  stripeSubscriptionStatus?: 'demo' | 'active' | 'past_due' | 'canceled';
  // Calendar integration (OAuth tokens stored for backend use)

  calendarIntegration?: {
    provider?: 'google';
    accessToken?: string | null;
    authorizationCode?: string | null;
    connectedAt?: any;
  };
}
