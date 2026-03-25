import { defineSecret } from 'firebase-functions/params';

export const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

export const OPENAI_CHAT_COMPLETIONS_URL =
  'https://api.openai.com/v1/chat/completions';

export type OpenAiChatCompletionResponse = {
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

export function getApiKey(): string | null {
  try {
    const fromSecret = OPENAI_API_KEY.value();
    if (fromSecret?.trim()) return fromSecret.trim();
  } catch {
    // Secret may be unavailable in local runs without secret injection.
  }

  const fromEnv = process.env.OPENAI_API_KEY;
  return fromEnv?.trim() ? fromEnv.trim() : null;
}

export function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function callOpenAiJson(params: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
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
      model: params.model,
      temperature: params.temperature,
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
