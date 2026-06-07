import { describe, it, expect } from 'vitest';
import { buildNewspaperHtml } from './newspaperTemplate';
import type { NewspaperTemplateInput } from './newspaperTypes';

// Minimal fixture — every required field, one item per section.
const base: NewspaperTemplateInput = {
  subscriberName: 'Riley',
  location: 'Portland, OR',
  dateFormatted: 'Monday, June 7, 2026',
  deliveryTime: '7:00 AM PT',
  volumeIssue: 'Vol. I · No. 12',
  weather: { tempNow: '61°', conditions: 'Sun breaks this afternoon', forecast: [] },
  rhythms: { moon: 'Waxing Gibbous 91%', season: 'Spring, Day 79', light: '15h' },
  moonFooter: 'Waxing Gibbous',
  seasonFooter: 'Spring',
  intentionPrompt: 'What is your one intention for today?',
  lede: { kicker: 'Good Morning, Riley', headline: 'The Long Days Are Here', paragraph: 'A short lede.' },
  schedule: [{ time: '8:00a', name: 'Writing', note: 'Aim for 800 words.' }],
  notifications: [{ emoji: '📧', source: 'Advisor', body: 'Draft due Friday.' }],
  goodNews: [{ headline: 'Ocean reserve created', summary: 'Bigger than Nigeria.' }],
  people: [{ name: 'Dad', nudge: 'texted twice; reply today.' }],
  quote: { text: 'Get started.', attribution: 'Mark Twain' },
  bodyMind: { sectionLabel: 'Body & Mind', title: 'Light Returns', paragraphs: ['Move today.'] },
  practiceArc: { sectionLabel: 'Thesis Arc', title: '38 Days', items: [{ label: 'Ch 3:', text: 'Revise.' }] },
  moonHighlight: { title: 'Almost Full', paragraph: 'It keeps showing up. So do you.' },
  personalQuote: { text: 'You showed up.', attribution: 'The Gist, for Riley' },
  qualityScore: { editorialVoice: 4, crossReferenceDepth: 4, personalizationDepth: 4 },
};

const pageCount = (html: string) => (html.match(/class="page"/g) ?? []).length;

describe('buildNewspaperHtml — tone-driven page count', () => {
  it('renders the full two-page broadsheet for calm', () => {
    const html = buildNewspaperHtml({ ...base, tone: 'calm' });
    expect(pageCount(html)).toBe(2);
    expect(html).toContain('Page 2');
    expect(html).toContain('Body &amp; Mind');
    expect(html).toContain('class="wl"'); // intention writing lines
  });

  it('renders two pages for detailed and for an unset tone', () => {
    expect(pageCount(buildNewspaperHtml({ ...base, tone: 'detailed' }))).toBe(2);
    expect(pageCount(buildNewspaperHtml({ ...base }))).toBe(2);
  });

  it('collapses to a single page for concise — no reflection spread or writing lines', () => {
    const html = buildNewspaperHtml({ ...base, tone: 'concise' });
    expect(pageCount(html)).toBe(1);
    expect(html).not.toContain('Page 2');
    expect(html).not.toContain('Body &amp; Mind');
    expect(html).not.toContain('class="wl"');
  });

  it('drops the "Page 1" footer label when concise (no second page to imply)', () => {
    expect(buildNewspaperHtml({ ...base, tone: 'concise' })).not.toContain('&middot; Page 1');
    expect(buildNewspaperHtml({ ...base, tone: 'calm' })).toContain('&middot; Page 1');
  });
});
