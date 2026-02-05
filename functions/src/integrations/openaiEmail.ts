import { logger } from 'firebase-functions';
import { OPENAI_API_KEY } from './openaiGist';

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

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

const OPENAI_CHAT_COMPLETIONS_URL =
  'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENAI_EMAIL_MODEL?.trim() || 'gpt-4.1-mini';

function getApiKey(): string | null {
  try {
    const fromSecret = OPENAI_API_KEY.value();
    if (fromSecret?.trim()) return fromSecret.trim();
  } catch {
    // Secret may be unavailable in local runs without secret injection.
  }

  const fromEnv = process.env.OPENAI_API_KEY;
  return fromEnv?.trim() ? fromEnv.trim() : null;
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

async function callOpenAiJson(params: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `OpenAI request failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  const payload = (await response.json()) as OpenAiChatCompletionResponse;
  if (payload.error?.message) {
    throw new Error(`OpenAI API error: ${payload.error.message}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI returned an empty completion payload.');
  }

  const parsed = safeJsonParse(content);
  if (!parsed) {
    throw new Error('OpenAI completion content is not valid JSON.');
  }

  return parsed;
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

    const payload = await callOpenAiJson({ systemPrompt, userPrompt });
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
