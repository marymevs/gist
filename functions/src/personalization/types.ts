/**
 * Types for the progressive personalization / memory layer.
 *
 * Firestore path: users/{uid}/memory/{auto-id}
 *
 * Memory entries are behavioral signals observed from gist generation,
 * user feedback, and interaction patterns. They're fed back into the
 * Claude prompt to improve personalization depth over time.
 */

export type MemoryType =
  | 'calendar_pattern'   // recurring meetings, busy/free patterns
  | 'topic_affinity'     // topics the user engages with
  | 'tone_feedback'      // user indicated preference for tone
  | 'email_feedback'     // thumbs up/down on email card accuracy
  | 'schedule_pattern'   // when user reads their gist, quiet days
  | 'quality_trend';     // running average of quality self-eval scores

export type MemoryEntry = {
  id?: string;
  type: MemoryType;
  signal: string;        // human-readable signal, e.g. "User has recurring 1:1 with Sarah every Tuesday"
  confidence: number;    // 0.0 to 1.0 — how confident we are in this signal
  source: string;        // what generated this signal, e.g. "calendar_connector", "email_feedback"
  observedAt: any;       // Firestore Timestamp
  expiresAt?: any;       // optional TTL — stale signals get pruned
  metadata?: Record<string, unknown>;
};

export type EmailFeedback = {
  userId: string;
  gistDate: string;      // dateKey of the gist
  emailCardId: string;   // the email message ID
  category: 'Action' | 'WaitingOn' | 'FYI';
  rating: 'up' | 'down';
  createdAt: any;
};

export type QualityTrend = {
  editorialVoice: number;
  crossReferenceDepth: number;
  personalizationDepth: number;
  sampleCount: number;
};
