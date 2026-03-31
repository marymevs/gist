/**
 * Memory reader — fetches recent memory signals for a user
 * and formats them as context for the Claude prompt.
 *
 * Returns a compact text block injected into the system prompt
 * to improve personalization depth over time.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { MemoryEntry } from './types';

const db = getFirestore();

const MAX_SIGNALS = 15;

export type MemoryContext = {
  signals: string[];
  qualityTrend?: {
    editorialVoice: number;
    crossReferenceDepth: number;
    personalizationDepth: number;
    sampleCount: number;
  };
};

/**
 * Fetch recent, non-expired memory signals for a user.
 * Returns formatted signals ready for prompt injection.
 */
export async function readMemoryContext(userId: string): Promise<MemoryContext> {
  const col = db.collection('users').doc(userId).collection('memory');
  const now = Timestamp.now();

  // Fetch recent signals, ordered by observedAt desc
  const snap = await col
    .orderBy('observedAt', 'desc')
    .limit(MAX_SIGNALS + 5) // fetch a few extra to filter expired
    .get();

  if (snap.empty) {
    return { signals: [] };
  }

  const signals: string[] = [];
  let qualityTrend: MemoryContext['qualityTrend'] | undefined;

  for (const doc of snap.docs) {
    const entry = doc.data() as MemoryEntry;

    // Skip expired entries (they'll be pruned async)
    if (entry.expiresAt && entry.expiresAt.toMillis() <= now.toMillis()) {
      continue;
    }

    // Extract quality trend separately
    if (entry.type === 'quality_trend' && entry.metadata) {
      qualityTrend = entry.metadata as MemoryContext['qualityTrend'];
      continue;
    }

    // Only include signals above confidence threshold
    if (entry.confidence >= 0.4) {
      signals.push(entry.signal);
    }

    if (signals.length >= MAX_SIGNALS) break;
  }

  return { signals, qualityTrend };
}

/**
 * Format memory context as a prompt section for Claude.
 * Returns empty string if no signals available.
 */
export function formatMemoryForPrompt(memory: MemoryContext): string {
  if (memory.signals.length === 0 && !memory.qualityTrend) {
    return '';
  }

  const parts: string[] = ['<memory label="personalization_context">'];

  if (memory.signals.length > 0) {
    parts.push('Known patterns about this user:');
    memory.signals.forEach((s) => parts.push(`- ${s}`));
  }

  if (memory.qualityTrend) {
    const qt = memory.qualityTrend;
    parts.push('');
    parts.push(`Quality trend over ${qt.sampleCount} gists:`);
    parts.push(`- Editorial voice: ${qt.editorialVoice}/5`);
    parts.push(`- Cross-reference depth: ${qt.crossReferenceDepth}/5`);
    parts.push(`- Personalization depth: ${qt.personalizationDepth}/5`);

    // Give Claude a nudge on its weakest dimension
    const scores = [
      { name: 'editorial voice', val: qt.editorialVoice },
      { name: 'cross-reference depth', val: qt.crossReferenceDepth },
      { name: 'personalization depth', val: qt.personalizationDepth },
    ];
    const weakest = scores.reduce((a, b) => (a.val < b.val ? a : b));
    if (weakest.val < 4 && qt.sampleCount >= 3) {
      parts.push(`Focus on improving ${weakest.name} in today's output.`);
    }
  }

  parts.push('</memory>');
  return parts.join('\n');
}
