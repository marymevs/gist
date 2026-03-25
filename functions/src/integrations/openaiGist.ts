import { logger } from 'firebase-functions';

import {
  OPENAI_API_KEY,
  callOpenAiJson,
  isRecord,
} from './openaiUtils';

export { OPENAI_API_KEY };

type DayItem = {
  time?: string;
  title: string;
  note?: string;
};

type WorldItem = {
  headline: string;
  implication: string;
};

export type DailyFocusGenerationInput = {
  date: string;
  timezone: string;
  weatherSummary: string;
  firstEvent?: string;
  dayItems: DayItem[];
  worldItems: WorldItem[];
};

type DailyFocusSections = {
  oneThing: string;
  gistBullets: string[];
};

const DEFAULT_MODEL = process.env.OPENAI_GIST_MODEL?.trim() || 'gpt-4.1-mini';
const MAX_ATTEMPTS = 2;
const ACTION_VERB_REGEX =
  /\b(send|ask|decide|schedule|confirm|draft|block|prepare|close|pay|submit|choose|set|turn|mute|write|review|open|create|book|call|share|finalize|start)\b/i;
const BANNED_TERMS = [
  'openai',
  'prompt',
  ' ai ',
  'lazy',
  'wasting',
  'failure',
  'you should feel',
];

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function hasBannedLanguage(text: string): boolean {
  const normalized = ` ${text.toLowerCase()} `;
  return BANNED_TERMS.some((term) => normalized.includes(term));
}

function hasOnlyKeys(value: Record<string, unknown>, expectedKeys: string[]) {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((expectedKey) => keys.includes(expectedKey))
  );
}

function validateOneThing(value: unknown): {
  valid: boolean;
  normalized?: string;
  errors: string[];
} {
  const errors: string[] = [];
  if (typeof value !== 'string') {
    return { valid: false, errors: ['oneThing must be a string.'] };
  }

  const normalized = normalizeText(value);
  if (!normalized) errors.push('oneThing cannot be empty.');

  const words = wordCount(normalized);
  if (words < 12 || words > 18) {
    errors.push('oneThing must be 12-18 words.');
  }

  if (!ACTION_VERB_REGEX.test(normalized)) {
    errors.push('oneThing must include an explicit action verb.');
  }

  const sentenceCount = normalized
    .split(/[.!?]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean).length;
  if (sentenceCount !== 1) {
    errors.push('oneThing must be exactly one sentence.');
  }

  if (hasBannedLanguage(normalized)) {
    errors.push('oneThing contains banned language.');
  }

  return { valid: errors.length === 0, normalized, errors };
}

function validateGistBullets(value: unknown): {
  valid: boolean;
  normalized?: string[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    return { valid: false, errors: ['gistBullets must be an array.'] };
  }

  if (value.length !== 3) {
    errors.push('gistBullets must contain exactly 3 bullets.');
  }

  const normalized = value.map((item) =>
    typeof item === 'string' ? normalizeText(item) : '',
  );
  const hasInvalidType = value.some((item) => typeof item !== 'string');
  if (hasInvalidType) {
    errors.push('Each gist bullet must be a string.');
  }

  const uniqueness = new Set(normalized.map((item) => item.toLowerCase()));
  if (uniqueness.size !== normalized.length) {
    errors.push('gistBullets must be distinct.');
  }

  normalized.forEach((bullet, index) => {
    const words = wordCount(bullet);
    if (!bullet) {
      errors.push(`Bullet ${index + 1} cannot be empty.`);
      return;
    }

    if (words < 8 || words > 14) {
      errors.push(`Bullet ${index + 1} must be 8-14 words.`);
    }
    if (hasBannedLanguage(bullet)) {
      errors.push(`Bullet ${index + 1} contains banned language.`);
    }
  });

  return { valid: errors.length === 0, normalized, errors };
}

function serializeInputsForPrompt(
  input: DailyFocusGenerationInput,
): Record<string, unknown> {
  return {
    date: input.date,
    timezone: input.timezone,
    firstEvent: input.firstEvent ?? null,
    dayItems: input.dayItems.slice(0, 12).map((item) => ({
      time: item.time ?? null,
      title: item.title,
      note: item.note ?? null,
    })),
    weatherSummary: input.weatherSummary,
    worldItems: input.worldItems.slice(0, 6).map((item) => ({
      headline: item.headline,
      implication: item.implication,
    })),
  };
}

async function generateOneThing(
  input: DailyFocusGenerationInput,
): Promise<string | null> {
  const systemPrompt = `
You are Gist Daily Editor, an offline-first daily briefing that protects attention.
Use only the provided inputs.
Return JSON only with exactly one key: "oneThing".
Do not include markdown, notes, or extra keys.
No moralizing, urgency language, or invented commitments.
`.trim();

  let feedback: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const userPrompt = `
Task: Generate oneThing for TODAY.

Rules:
- Output exactly one sentence, 12-18 words.
- Include an explicit action verb.
- Make it doable in <=20 minutes OR a single message/decision.
- Prefer actions that reduce uncertainty or protect a focus block.
- Do not mention AI, OpenAI, or prompts.
- Do not invent tasks, people, or commitments.

Inputs:
${JSON.stringify(serializeInputsForPrompt(input), null, 2)}
${feedback ? `\nValidation feedback from prior attempt: ${feedback}` : ''}
`.trim();

    try {
      const parsed = await callOpenAiJson({ systemPrompt, userPrompt, model: DEFAULT_MODEL, temperature: 0.5 });
      if (!isRecord(parsed) || !hasOnlyKeys(parsed, ['oneThing'])) {
        feedback = 'Return only {"oneThing":"..."} with no additional keys.';
        logger.warn('OpenAI oneThing output had unexpected JSON shape.', {
          attempt,
          keys: isRecord(parsed) ? Object.keys(parsed) : null,
        });
        continue;
      }

      const oneThing = parsed.oneThing;
      const validation = validateOneThing(oneThing);

      if (validation.valid && validation.normalized) {
        return validation.normalized;
      }

      feedback = validation.errors.join(' ');
      logger.warn('OpenAI oneThing output failed validation.', {
        attempt,
        errors: validation.errors,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      feedback = `Request failed: ${message}`;
      logger.warn('OpenAI oneThing generation failed.', { attempt, message });
    }
  }

  return null;
}

async function generateGistBullets(
  input: DailyFocusGenerationInput,
  oneThing: string,
): Promise<string[] | null> {
  const systemPrompt = `
You are Gist Daily Editor, an offline-first daily briefing that protects attention.
Use only the provided inputs.
Return JSON only with exactly one key: "gistBullets".
"gistBullets" must be an array of exactly 3 strings.
Do not include markdown, notes, or extra keys.
`.trim();

  let feedback: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const userPrompt = `
Task: Generate 3 gistBullets for TODAY.

Rules:
- Return 3 bullets, each 8-14 words.
- Bullets must be distinct:
  1) attention rule (narrow focus)
  2) boundary rule (news/notifications/checking)
  3) schedule protection tied to firstEvent or biggest time block
- Bullets must support (not contradict) oneThing.
- Use only provided inputs and do not invent commitments.
- Tone: crisp, calm, practical. No emojis.

Inputs:
${JSON.stringify(
  {
    ...serializeInputsForPrompt(input),
    oneThing,
  },
  null,
  2,
)}
${feedback ? `\nValidation feedback from prior attempt: ${feedback}` : ''}
`.trim();

    try {
      const parsed = await callOpenAiJson({ systemPrompt, userPrompt, model: DEFAULT_MODEL, temperature: 0.5 });
      if (!isRecord(parsed) || !hasOnlyKeys(parsed, ['gistBullets'])) {
        feedback =
          'Return only {"gistBullets":["...","...","..."]} with no additional keys.';
        logger.warn('OpenAI gistBullets output had unexpected JSON shape.', {
          attempt,
          keys: isRecord(parsed) ? Object.keys(parsed) : null,
        });
        continue;
      }

      const gistBullets = parsed.gistBullets;
      const validation = validateGistBullets(gistBullets);

      if (validation.valid && validation.normalized) {
        return validation.normalized;
      }

      feedback = validation.errors.join(' ');
      logger.warn('OpenAI gistBullets output failed validation.', {
        attempt,
        errors: validation.errors,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      feedback = `Request failed: ${message}`;
      logger.warn('OpenAI gistBullets generation failed.', {
        attempt,
        message,
      });
    }
  }

  return null;
}

function fallbackOneThing(input: DailyFocusGenerationInput): string {
  if (input.firstEvent) {
    return 'Send one clarifying message now so your first event starts with fewer open loops.';
  }

  if (input.dayItems.length > 0) {
    return 'Choose one concrete deliverable and block twenty minutes now to finish its first draft.';
  }

  return 'Send one message that removes uncertainty today, then stop checking for replies afterward.';
}

function fallbackGistBullets(input: DailyFocusGenerationInput): string[] {
  return [
    'Keep attention narrow: one focused block will beat constant context switching today.',
    'Check news and notifications once, then close feeds and return to your plan.',
    input.firstEvent
      ? 'Protect your first event by preparing once, then avoid reshuffling the whole day.'
      : 'Protect your first focus block before reacting to messages and small requests.',
  ];
}

export async function generateDailyFocusSections(
  input: DailyFocusGenerationInput,
): Promise<DailyFocusSections> {
  const oneThing = (await generateOneThing(input)) ?? fallbackOneThing(input);
  const gistBullets =
    (await generateGistBullets(input, oneThing)) ?? fallbackGistBullets(input);

  return {
    oneThing,
    gistBullets,
  };
}
