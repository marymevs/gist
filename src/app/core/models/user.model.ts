export type GistPlan = 'web' | 'print' | 'loop';

export interface GistUser {
  uid: string;
  email: string | null;

  plan: GistPlan;

  createdAt: any; // Firestore Timestamp
  updatedAt: any;

  // Billing (stubbed for now)
  stripeCustomerId?: string | null;
  stripeSubscriptionStatus?: 'demo' | 'active' | 'past_due' | 'canceled';
}
