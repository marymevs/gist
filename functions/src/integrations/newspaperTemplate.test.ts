/**
 * Tests for the newspaper HTML template.
 *
 * Locks in the Page 2 reflection-column layout so a future change that
 * accidentally reintroduces fax-back checkboxes or drops the writing lines
 * surfaces as a test failure.
 */

import { describe, it, expect } from 'vitest';
import { buildNewspaperHtml } from './newspaperTemplate';
import type { NewspaperTemplateInput } from './newspaperTypes';

function makeFixture(): NewspaperTemplateInput {
  return {
    // Metadata
    subscriberName: 'Riley',
    location: 'Southeast Portland, Oregon',
    dateFormatted: 'Monday, March 30, 2026',
    deliveryTime: '7:00 AM PT',
    volumeIssue: 'Vol. I · No. 12',
    weather: {
      tempNow: '48°',
      conditions: 'Partly cloudy · High 58°',
      forecast: [
        { day: 'Tue', high: '61°' },
        { day: 'Wed', high: '64°' },
      ],
    },
    rhythms: {
      moon: 'Waxing Gibbous 91% · Full Wed',
      season: 'Early Spring, Day 10',
      light: '12h 48m · Sunset 7:34',
    },
    moonFooter: 'Waxing Gibbous in Virgo',
    seasonFooter: 'Early Spring',
    intentionPrompt: 'What needs your attention today, even if it scares you a little?',

    // Page 1
    lede: {
      kicker: 'Good Morning, Riley',
      headline: 'Sun Breaks Today.',
      paragraph: 'A short editorial paragraph for testing.',
    },
    schedule: [
      { time: '8:00a', emoji: '📝', name: 'Writing block', note: 'Aim for 800 words.' },
    ],
    notifications: [
      { emoji: '📧', source: 'Dr. Kaur', body: 'Advisor wrote back.' },
    ],
    goodNews: [
      { headline: 'Good news headline', summary: 'A one-line summary.' },
    ],
    people: [
      { name: 'Dad', nudge: 'You owe him a call.' },
    ],
    quote: { text: 'Hold fast to dreams.', attribution: 'Langston Hughes' },

    // Page 2
    bodyMind: {
      sectionLabel: 'Body & Mind',
      title: 'The Light Is Coming Back',
      paragraphs: ['A paragraph about wellbeing.'],
    },
    practiceArc: {
      sectionLabel: 'Thesis Arc',
      title: '38 Days to Defense',
      items: [{ label: 'Chapter 3:', text: 'Revisions due Friday.' }],
    },
    moonHighlight: {
      title: 'The Moon Is Almost Full',
      paragraph: 'Metaphorical moon paragraph.',
    },
    personalQuote: {
      text: 'You showed up today. That counts.',
      attribution: 'The Gist, for Riley',
    },

    qualityScore: {
      editorialVoice: 4,
      crossReferenceDepth: 4,
      personalizationDepth: 4,
    },
  };
}

describe('buildNewspaperHtml — Page 2 reflection layout', () => {
  const html = buildNewspaperHtml(makeFixture());

  it('renders writing lines (class="wl")', () => {
    expect(html).toContain('class="wl"');
  });

  it('renders at least the 9 reflection lines on Page 2', () => {
    const wlCount = (html.match(/class="wl"/g) ?? []).length;
    expect(wlCount).toBeGreaterThanOrEqual(9);
  });

  it('renders the morning intention prompt text', () => {
    expect(html).toContain('What needs your attention today');
  });

  it('does NOT contain any fax-back references', () => {
    expect(html.toLowerCase()).not.toContain('faxback');
    expect(html.toLowerCase()).not.toContain('fax back');
    expect(html.toLowerCase()).not.toContain('fax it back');
  });

  it('does NOT contain checkbox glyphs (would indicate fax-back checkboxes returned)', () => {
    // &#9744; is ☐ (BALLOT BOX), used in the old faxBackHtml options.
    expect(html).not.toContain('&#9744;');
    expect(html).not.toContain('☐');
  });

  it('renders the personal quote in the reflection column', () => {
    expect(html).toContain('You showed up today');
    expect(html).toContain('The Gist, for Riley');
  });

  it('emits both Page 1 and Page 2', () => {
    expect(html).toContain('Page 2');
    expect(html).toMatch(/class="page"/);
    // Two .page divs (Page 1 + Page 2)
    const pageCount = (html.match(/class="page"/g) ?? []).length;
    expect(pageCount).toBe(2);
  });
});
