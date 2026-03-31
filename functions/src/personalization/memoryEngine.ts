/**
 * Memory engine — observes gist generation context and writes
 * behavioral signals to users/{uid}/memory. These signals are
 * fed back into Claude's prompt to improve personalization.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { MemoryEntry, QualityTrend } from './types';

const db = getFirestore();

function memoryCol(userId: string) {
  return db.collection('users').doc(userId).collection('memory');
}

// ── Write helpers ─────────────────────────────────────────────────────────────

async function upsertMemory(
  userId: string,
  type: MemoryEntry['type'],
  signal: string,
  opts: {
    source: string;
    confidence?: number;
    ttlDays?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const col = memoryCol(userId);

  // Check for existing signal of same type+signal to avoid duplicates
  const existing = await col
    .where('type', '==', type)
    .where('signal', '==', signal)
    .limit(1)
    .get();

  const entry: Omit<MemoryEntry, 'id'> = {
    type,
    signal,
    confidence: opts.confidence ?? 0.7,
    source: opts.source,
    observedAt: FieldValue.serverTimestamp(),
    ...(opts.ttlDays
      ? { expiresAt: Timestamp.fromDate(new Date(Date.now() + opts.ttlDays * 86400000)) }
      : {}),
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };

  if (!existing.empty) {
    // Update existing — bump confidence and timestamp
    const docRef = existing.docs[0].ref;
    await docRef.update({
      confidence: Math.min(1.0, (opts.confidence ?? 0.7) + 0.05),
      observedAt: FieldValue.serverTimestamp(),
      ...(opts.metadata ? { metadata: opts.metadata } : {}),
    });
  } else {
    await col.add(entry);
  }
}

// ── Calendar pattern detection ────────────────────────────────────────────────

type DayItem = { time?: string; title: string; note?: string };

export async function observeCalendarPatterns(
  userId: string,
  dayItems: DayItem[],
): Promise<void> {
  if (dayItems.length === 0) return;

  // Detect meeting-heavy days
  if (dayItems.length >= 5) {
    await upsertMemory(userId, 'calendar_pattern', 'Tends to have meeting-heavy days (5+ events).', {
      source: 'calendar_connector',
      confidence: 0.6,
      ttlDays: 30,
      metadata: { eventCount: dayItems.length },
    });
  }

  // Detect early starts
  const firstTime = dayItems[0]?.time;
  if (firstTime) {
    const hour = parseInt(firstTime.split(':')[0], 10);
    if (!isNaN(hour) && hour <= 7) {
      await upsertMemory(userId, 'calendar_pattern', 'Often has early morning commitments (before 8am).', {
        source: 'calendar_connector',
        confidence: 0.6,
        ttlDays: 30,
      });
    }
  }

  // Detect recurring people from event titles (simple heuristic: "1:1 with X", "Meeting with X")
  for (const item of dayItems) {
    const match = item.title.match(/(?:1[:\-]1|meeting|sync|standup|check.?in)\s+(?:with\s+)?(.{2,25})/i);
    if (match) {
      const person = match[1].trim().replace(/[^a-zA-Z\s'-]/g, '');
      if (person.length >= 2) {
        await upsertMemory(userId, 'calendar_pattern', `Has recurring meetings with ${person}.`, {
          source: 'calendar_connector',
          confidence: 0.5,
          ttlDays: 14,
          metadata: { person },
        });
      }
    }
  }
}

// ── Topic affinity detection ──────────────────────────────────────────────────

type WorldItem = { headline: string; implication: string };

export async function observeTopicAffinities(
  userId: string,
  worldItems: WorldItem[],
  userTopics?: string[],
): Promise<void> {
  if (!userTopics || userTopics.length === 0) return;

  // Record explicitly chosen topics from onboarding as high-confidence signals
  for (const topic of userTopics) {
    await upsertMemory(userId, 'topic_affinity', `Interested in ${topic}.`, {
      source: 'onboarding_prefs',
      confidence: 0.9,
      ttlDays: 90,
    });
  }
}

// ── Quality score trending ────────────────────────────────────────────────────

export async function observeQualityScore(
  userId: string,
  score: { editorialVoice: number; crossReferenceDepth: number; personalizationDepth: number },
): Promise<void> {
  const col = memoryCol(userId);

  // Read existing trend
  const trendSnap = await col
    .where('type', '==', 'quality_trend')
    .limit(1)
    .get();

  if (trendSnap.empty) {
    await col.add({
      type: 'quality_trend',
      signal: `Quality trend: voice=${score.editorialVoice}, cross-ref=${score.crossReferenceDepth}, personal=${score.personalizationDepth}`,
      confidence: 1.0,
      source: 'quality_self_eval',
      observedAt: FieldValue.serverTimestamp(),
      metadata: {
        editorialVoice: score.editorialVoice,
        crossReferenceDepth: score.crossReferenceDepth,
        personalizationDepth: score.personalizationDepth,
        sampleCount: 1,
      } satisfies QualityTrend,
    });
  } else {
    const doc = trendSnap.docs[0];
    const prev = doc.data().metadata as QualityTrend | undefined;
    const n = (prev?.sampleCount ?? 0) + 1;

    // Running average
    const avg = (prevVal: number, newVal: number) =>
      Math.round(((prevVal * (n - 1) + newVal) / n) * 10) / 10;

    const updated: QualityTrend = {
      editorialVoice: avg(prev?.editorialVoice ?? score.editorialVoice, score.editorialVoice),
      crossReferenceDepth: avg(prev?.crossReferenceDepth ?? score.crossReferenceDepth, score.crossReferenceDepth),
      personalizationDepth: avg(prev?.personalizationDepth ?? score.personalizationDepth, score.personalizationDepth),
      sampleCount: n,
    };

    await doc.ref.update({
      signal: `Quality trend: voice=${updated.editorialVoice}, cross-ref=${updated.crossReferenceDepth}, personal=${updated.personalizationDepth} (n=${n})`,
      observedAt: FieldValue.serverTimestamp(),
      metadata: updated,
    });
  }
}

// ── Email feedback recording ──────────────────────────────────────────────────

export async function recordEmailFeedback(
  userId: string,
  gistDate: string,
  emailCardId: string,
  category: 'Action' | 'WaitingOn' | 'FYI',
  rating: 'up' | 'down',
): Promise<void> {
  // Write to feedback subcollection
  await db
    .collection('users')
    .doc(userId)
    .collection('emailFeedback')
    .add({
      userId,
      gistDate,
      emailCardId,
      category,
      rating,
      createdAt: FieldValue.serverTimestamp(),
    });

  // Also write a memory signal
  const signal = rating === 'up'
    ? `Email categorized as "${category}" was rated accurate.`
    : `Email categorized as "${category}" was rated inaccurate.`;

  await upsertMemory(userId, 'email_feedback', signal, {
    source: 'user_feedback',
    confidence: 1.0,
    ttlDays: 60,
    metadata: { gistDate, emailCardId, category, rating },
  });

  logger.info('Email feedback recorded.', { userId, gistDate, emailCardId, rating });
}

// ── Stale memory pruning ──────────────────────────────────────────────────────

export async function pruneExpiredMemory(userId: string): Promise<number> {
  const col = memoryCol(userId);
  const expired = await col
    .where('expiresAt', '<=', Timestamp.now())
    .limit(50)
    .get();

  if (expired.empty) return 0;

  const batch = db.batch();
  expired.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  logger.info('Pruned expired memory entries.', { userId, count: expired.size });
  return expired.size;
}
