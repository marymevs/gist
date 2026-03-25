/**
 * Tests for faxTemplate.ts — print-first HTML template builder.
 *
 * Verifies structural HTML correctness, escaping, and defensive defaults.
 * No DOM renderer required — tests against raw HTML string output.
 */

import { describe, it, expect } from 'vitest';
import { buildFaxHtml, type FaxTemplateInput } from './faxTemplate';

// ── fixtures ──────────────────────────────────────────────────────────────────

const minimal: FaxTemplateInput = {
  subscriberName: 'Mary',
  date: 'Wednesday, Mar 25',
  weatherSummary: 'Mostly sunny, 72°F',
  dayItems: [],
  worldItems: [],
  emailCards: [],
  gistBullets: [],
};

const full: FaxTemplateInput = {
  subscriberName: 'Mary',
  date: 'Wednesday, Mar 25',
  weatherSummary: 'Mostly sunny, 72°F',
  dayItems: [
    { time: '9:00 AM', title: 'Team standup', note: 'Zoom link in invite' },
    { title: 'Lunch with investor' },
  ],
  worldItems: [
    { headline: 'Markets rally on Fed comments', implication: 'Rates may hold steady.' },
  ],
  emailCards: [
    {
      fromName: 'Alice Chen',
      subject: 'Q2 contract renewal',
      snippet: 'Please review by Friday.',
      category: 'Action',
      why: 'Deadline this week.',
      suggestedNextStep: 'Reply to Alice by Thursday.',
    },
  ],
  gistBullets: [
    'Review the Q2 contract before lunch.',
    'Markets look calm — no morning headlines require action.',
    'Three calendar items today, heaviest at 9 AM.',
  ],
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('buildFaxHtml', () => {
  it('returns a complete HTML document', () => {
    const html = buildFaxHtml(minimal);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('includes the subscriber name on the cover page', () => {
    const html = buildFaxHtml(full);
    expect(html).toContain('For Mary');
  });

  it('falls back to "Subscriber" when name is blank', () => {
    const html = buildFaxHtml({ ...minimal, subscriberName: '   ' });
    expect(html).toContain('For Subscriber');
  });

  it('includes the date in the document', () => {
    const html = buildFaxHtml(full);
    expect(html).toContain('Wednesday, Mar 25');
  });

  it('renders calendar items with time and title', () => {
    const html = buildFaxHtml(full);
    expect(html).toContain('9:00 AM');
    expect(html).toContain('Team standup');
    expect(html).toContain('Zoom link in invite');
  });

  it('renders world items with headline and implication', () => {
    const html = buildFaxHtml(full);
    expect(html).toContain('Markets rally on Fed comments');
    expect(html).toContain('Rates may hold steady.');
  });

  it('renders email cards with category label', () => {
    const html = buildFaxHtml(full);
    expect(html).toContain('[ ACTION ]');
    expect(html).toContain('Q2 contract renewal');
    expect(html).toContain('Reply to Alice by Thursday.');
  });

  it('renders gist bullets', () => {
    const html = buildFaxHtml(full);
    expect(html).toContain('Review the Q2 contract before lunch.');
  });

  it('escapes HTML special characters in user content', () => {
    const html = buildFaxHtml({
      ...minimal,
      subscriberName: 'Alice & Bob <CEO>',
      dayItems: [{ title: 'Meeting with "the team"' }],
    });
    expect(html).not.toContain('<CEO>');
    expect(html).toContain('&lt;CEO&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });

  it('shows "No events today" when dayItems is empty', () => {
    const html = buildFaxHtml(minimal);
    expect(html).toContain('No events today.');
  });

  it('does not render Inbox section when emailCards is empty', () => {
    const html = buildFaxHtml(minimal);
    // Category labels only appear when cards are present
    expect(html).not.toContain('[ ACTION ]');
    expect(html).not.toContain('[ WAITING ]');
    expect(html).not.toContain('[ FYI ]');
  });

  it('includes @page size:letter in the stylesheet', () => {
    const html = buildFaxHtml(minimal);
    expect(html).toContain('size: letter');
  });

  it('escapes HTML in unknown email card category fallback (regression: XSS fix)', () => {
    // If Firestore has a category value outside the known union, the fallback
    // label must be HTML-escaped to prevent injection into the print document.
    const html = buildFaxHtml({
      ...minimal,
      emailCards: [{
        subject: 'Test',
        snippet: 'Test snippet',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category: '<script>alert(1)</script>' as any,
        why: 'Test why',
      }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;SCRIPT&gt;');
  });
});
