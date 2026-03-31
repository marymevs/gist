/**
 * Claude API utilities — replaces openaiUtils.ts.
 * Single provider: all LLM calls go through Anthropic.
 */

import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;

  let apiKey: string | undefined;
  try {
    const fromSecret = ANTHROPIC_API_KEY.value();
    if (fromSecret?.trim()) apiKey = fromSecret.trim();
  } catch {
    // Secret may be unavailable in local runs.
  }

  if (!apiKey) {
    apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  }

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  _client = new Anthropic({ apiKey });
  return _client;
}

export type ClaudeJsonParams = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

/**
 * Call Claude and parse the response as JSON.
 * Uses tool_use with a dummy tool to guarantee valid JSON output.
 */
export async function callClaudeJson<T = unknown>(
  params: ClaudeJsonParams,
): Promise<T> {
  const client = getClient();

  const response = await client.messages.create({
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.5,
    system: params.systemPrompt,
    messages: [{ role: 'user', content: params.userPrompt }],
    tools: [
      {
        name: 'json_output',
        description: 'Output structured JSON data.',
        input_schema: {
          type: 'object' as const,
          additionalProperties: true,
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'json_output' },
  });

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block.');
  }

  return toolBlock.input as T;
}
