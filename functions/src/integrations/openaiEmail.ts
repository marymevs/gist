import { logger } from 'firebase-functions';

import { callOpenAiJson, isRecord } from './openaiUtils';

export type EmailAiInput = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
};

export type EmailAiResult = {
  id: string;
  category: 'Action' | 'WaitingOn' | 'FYI';
  why_it_matters: string;
  suggested_next_step: string;
  urgency: number;
};

const DEFAULT_MODEL = process.env.OPENAI_EMAIL_MODEL?.trim() || 'gpt-4.1-mini';

function normalizeCategory(value: unknown): EmailAiResult['category'] | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized === 'Action') return 'Action';
  if (normalized === 'WaitingOn') return 'WaitingOn';
  if (normalized === 'FYI') return 'FYI';
  return null;
}

function clampUrgency(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > 3) return 3;
  return rounded;
}

export async function classifyEmailCandidates(
  inputs: EmailAiInput[],
): Promise<EmailAiResult[]> {
  if (!inputs.length) return [];

  try {
    const systemPrompt = [
      'You are classifying email signals for a daily summary.',
      'Return JSON with a top-level "items" array.',
      'Each item must include: id, category (Action | WaitingOn | FYI),',
      'why_it_matters (<=140 chars), suggested_next_step (<=80 chars), urgency (0-3).',
      'Be concise, no markdown, no extra keys.',
    ].join(' ');

    const userPrompt = JSON.stringify({
      instruction:
        'Classify each email. Use snippets only; do not invent details.',
      items: inputs.map((item) => ({
        id: item.id,
        from: item.from,
        subject: item.subject,
        snippet: item.snippet,
      })),
    });

    const payload = await callOpenAiJson({ systemPrompt, userPrompt, model: DEFAULT_MODEL, temperature: 0.2 });
    if (!isRecord(payload) || !Array.isArray(payload.items)) {
      throw new Error('OpenAI response missing items array.');
    }

    const results: EmailAiResult[] = [];
    for (const raw of payload.items) {
      if (!isRecord(raw)) continue;

      const id = typeof raw.id === 'string' ? raw.id.trim() : '';
      const category = normalizeCategory(raw.category);
      const why = typeof raw.why_it_matters === 'string' ? raw.why_it_matters.trim() : '';
      const next =
        typeof raw.suggested_next_step === 'string'
          ? raw.suggested_next_step.trim()
          : '';
      const urgency = clampUrgency(raw.urgency);

      if (!id || !category || !why || urgency === null) continue;

      results.push({
        id,
        category,
        why_it_matters: why.slice(0, 160),
        suggested_next_step: next.slice(0, 120),
        urgency,
      });
    }

    return results;
  } catch (error) {
    logger.warn('OpenAI email classification failed.', { error });
    return [];
  }
}
