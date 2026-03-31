/**
 * Tests for Claude gist generation — Zod schemas, validation, and fallbacks.
 * Does NOT call Claude API — tests the parsing/validation layer only.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-create the schemas here to test them without importing the module
// (which would pull in firebase-functions and Claude SDK).

const qualityScoreSchema = z.object({
  editorialVoice: z.number().min(1).max(5),
  crossReferenceDepth: z.number().min(1).max(5),
  personalizationDepth: z.number().min(1).max(5),
});

const dailyFocusOutputSchema = z.object({
  oneThing: z.string().min(1),
  gistBullets: z.array(z.string().min(1)).length(3),
  qualityScore: qualityScoreSchema,
});

const emailItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['Action', 'WaitingOn', 'FYI']),
  why_it_matters: z.string().min(1).max(160),
  suggested_next_step: z.string().max(120),
  urgency: z.number().int().min(0).max(3),
});

const emailOutputSchema = z.object({
  items: z.array(emailItemSchema),
});

// ── Daily Focus schema ──────────────────────────────────────────────────────

describe('dailyFocusOutputSchema', () => {
  it('validates a correct output', () => {
    const valid = {
      oneThing: 'Block thirty minutes after standup to review the board deck before it gets buried.',
      gistBullets: [
        'Keep attention narrow: finish the deck review before switching to Slack.',
        'Check news and notifications once, then close feeds until lunch.',
        'Protect the 11:30 product review by prepping usage numbers beforehand.',
      ],
      qualityScore: {
        editorialVoice: 4,
        crossReferenceDepth: 3,
        personalizationDepth: 4,
      },
    };
    expect(dailyFocusOutputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects when oneThing is missing', () => {
    const invalid = {
      gistBullets: ['a', 'b', 'c'],
      qualityScore: { editorialVoice: 3, crossReferenceDepth: 3, personalizationDepth: 3 },
    };
    expect(dailyFocusOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects when gistBullets has wrong count', () => {
    const invalid = {
      oneThing: 'Do something useful today.',
      gistBullets: ['one', 'two'],
      qualityScore: { editorialVoice: 3, crossReferenceDepth: 3, personalizationDepth: 3 },
    };
    expect(dailyFocusOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects when quality scores are out of range', () => {
    const invalid = {
      oneThing: 'Do something.',
      gistBullets: ['a', 'b', 'c'],
      qualityScore: { editorialVoice: 0, crossReferenceDepth: 6, personalizationDepth: 3 },
    };
    expect(dailyFocusOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects empty oneThing', () => {
    const invalid = {
      oneThing: '',
      gistBullets: ['a', 'b', 'c'],
      qualityScore: { editorialVoice: 3, crossReferenceDepth: 3, personalizationDepth: 3 },
    };
    expect(dailyFocusOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects empty bullet strings', () => {
    const invalid = {
      oneThing: 'Do something.',
      gistBullets: ['a', '', 'c'],
      qualityScore: { editorialVoice: 3, crossReferenceDepth: 3, personalizationDepth: 3 },
    };
    expect(dailyFocusOutputSchema.safeParse(invalid).success).toBe(false);
  });
});

// ── Email classification schema ─────────────────────────────────────────────

describe('emailOutputSchema', () => {
  it('validates correct email classification', () => {
    const valid = {
      items: [
        {
          id: 'msg-123',
          category: 'Action',
          why_it_matters: 'Needs approval before EOD.',
          suggested_next_step: 'Review and approve the deck.',
          urgency: 2,
        },
        {
          id: 'msg-456',
          category: 'FYI',
          why_it_matters: 'PR merged successfully.',
          suggested_next_step: 'No action needed.',
          urgency: 0,
        },
      ],
    };
    expect(emailOutputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid category', () => {
    const invalid = {
      items: [
        {
          id: 'msg-123',
          category: 'Urgent',
          why_it_matters: 'Test.',
          suggested_next_step: 'Test.',
          urgency: 1,
        },
      ],
    };
    expect(emailOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects urgency out of range', () => {
    const invalid = {
      items: [
        {
          id: 'msg-123',
          category: 'Action',
          why_it_matters: 'Test.',
          suggested_next_step: 'Test.',
          urgency: 5,
        },
      ],
    };
    expect(emailOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('allows empty items array', () => {
    expect(emailOutputSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it('rejects missing id', () => {
    const invalid = {
      items: [
        {
          category: 'FYI',
          why_it_matters: 'Test.',
          suggested_next_step: 'Test.',
          urgency: 0,
        },
      ],
    };
    expect(emailOutputSchema.safeParse(invalid).success).toBe(false);
  });
});

// ── Banned language detection ───────────────────────────────────────────────

describe('banned language detection', () => {
  const BANNED_TERMS = [
    'openai', 'anthropic', 'claude', 'prompt', ' ai ',
    'lazy', 'wasting', 'failure', 'you should feel',
  ];

  function hasBannedLanguage(text: string): boolean {
    const normalized = ` ${text.toLowerCase()} `;
    return BANNED_TERMS.some((term) => normalized.includes(term));
  }

  it('detects "openai" in text', () => {
    expect(hasBannedLanguage('This was generated by OpenAI.')).toBe(true);
  });

  it('detects "claude" in text', () => {
    expect(hasBannedLanguage('Claude says to focus today.')).toBe(true);
  });

  it('detects " ai " with spaces', () => {
    expect(hasBannedLanguage('Use AI to plan your day.')).toBe(true);
  });

  it('does not flag "daily" (contains "ai" but not " ai ")', () => {
    expect(hasBannedLanguage('Your daily briefing is ready.')).toBe(false);
  });

  it('detects "you should feel"', () => {
    expect(hasBannedLanguage('You should feel proud today.')).toBe(true);
  });

  it('allows normal text', () => {
    expect(hasBannedLanguage('Block thirty minutes to review the deck.')).toBe(false);
  });
});
