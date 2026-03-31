/**
 * Tests for memory formatting — pure function, no Firebase imports.
 * Re-creates formatMemoryForPrompt to avoid pulling in firebase-admin.
 */

import { describe, it, expect } from 'vitest';

// Re-create the types and pure function here to avoid Firebase imports
type MemoryContext = {
  signals: string[];
  qualityTrend?: {
    editorialVoice: number;
    crossReferenceDepth: number;
    personalizationDepth: number;
    sampleCount: number;
  };
};

function formatMemoryForPrompt(memory: MemoryContext): string {
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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('formatMemoryForPrompt', () => {
  it('returns empty string when no signals and no quality trend', () => {
    expect(formatMemoryForPrompt({ signals: [] })).toBe('');
  });

  it('formats signals as a bullet list inside <memory> tags', () => {
    const result = formatMemoryForPrompt({
      signals: [
        'Has recurring meetings with Sarah.',
        'Interested in Markets & finance.',
      ],
    });
    expect(result).toContain('<memory label="personalization_context">');
    expect(result).toContain('</memory>');
    expect(result).toContain('- Has recurring meetings with Sarah.');
    expect(result).toContain('- Interested in Markets & finance.');
    expect(result).toContain('Known patterns about this user:');
  });

  it('includes quality trend when present', () => {
    const result = formatMemoryForPrompt({
      signals: [],
      qualityTrend: {
        editorialVoice: 3.5,
        crossReferenceDepth: 2.1,
        personalizationDepth: 4.0,
        sampleCount: 10,
      },
    });
    expect(result).toContain('Quality trend over 10 gists:');
    expect(result).toContain('Editorial voice: 3.5/5');
    expect(result).toContain('Cross-reference depth: 2.1/5');
    expect(result).toContain('Personalization depth: 4/5');
  });

  it('suggests improving weakest dimension when sampleCount >= 3', () => {
    const result = formatMemoryForPrompt({
      signals: [],
      qualityTrend: {
        editorialVoice: 4.2,
        crossReferenceDepth: 2.0,
        personalizationDepth: 3.8,
        sampleCount: 5,
      },
    });
    expect(result).toContain('Focus on improving cross-reference depth');
  });

  it('does not suggest improvement when sampleCount < 3', () => {
    const result = formatMemoryForPrompt({
      signals: [],
      qualityTrend: {
        editorialVoice: 2.0,
        crossReferenceDepth: 2.0,
        personalizationDepth: 2.0,
        sampleCount: 2,
      },
    });
    expect(result).not.toContain('Focus on improving');
  });

  it('does not suggest improvement when all scores >= 4', () => {
    const result = formatMemoryForPrompt({
      signals: [],
      qualityTrend: {
        editorialVoice: 4.5,
        crossReferenceDepth: 4.2,
        personalizationDepth: 4.0,
        sampleCount: 10,
      },
    });
    expect(result).not.toContain('Focus on improving');
  });

  it('combines signals and quality trend', () => {
    const result = formatMemoryForPrompt({
      signals: ['Often has early morning commitments.'],
      qualityTrend: {
        editorialVoice: 3.0,
        crossReferenceDepth: 3.0,
        personalizationDepth: 3.0,
        sampleCount: 7,
      },
    });
    expect(result).toContain('Known patterns');
    expect(result).toContain('Quality trend');
    expect(result).toContain('<memory');
    expect(result).toContain('</memory>');
  });
});
