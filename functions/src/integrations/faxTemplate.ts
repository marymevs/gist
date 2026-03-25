/**
 * Print-first HTML template for the morning Gist fax delivery.
 *
 * Designed for Phaxio's HTML renderer (US Letter, 8.5×11 in).
 * NOT an email template — no inbox-width tables, no email-client shims.
 *
 * Layout:
 *   ┌──────────────────────────────────┐
 *   │  COVER PAGE                      │
 *   │  "GIST" wordmark  |  date        │
 *   │  Subscriber name                 │
 *   │  "Your morning briefing"         │
 *   ├──────────────────────────────────┤
 *   │  CONTENT PAGE(S)                 │
 *   │  TODAY (calendar + email cards)  │
 *   │  THE WORLD (news items)          │
 *   │  FOCUS (gist bullets)            │
 *   └──────────────────────────────────┘
 *
 * Typography: Georgia serif body, Arial sans-serif labels/captions.
 * Colour: near-black on off-white — thermal fax-friendly (high contrast).
 */

// ─── input type ──────────────────────────────────────────────────────────────

export type FaxTemplateInput = {
  /** Subscriber's display name, e.g. "Mary" */
  subscriberName: string;
  /** Formatted date string, e.g. "Wednesday, Mar 25" */
  date: string;
  weatherSummary: string;
  dayItems: { time?: string; title: string; note?: string }[];
  worldItems: { headline: string; implication: string }[];
  emailCards: {
    fromName?: string;
    subject: string;
    snippet: string;
    category: 'Action' | 'WaitingOn' | 'FYI';
    why: string;
    suggestedNextStep?: string;
  }[];
  gistBullets: string[];
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionHeader(text: string): string {
  return `
    <div style="
      font-family: Arial, sans-serif;
      font-size: 8pt;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #555;
      border-bottom: 1px solid #222;
      padding-bottom: 3px;
      margin: 18px 0 8px 0;
    ">${esc(text)}</div>`;
}

function categoryLabel(cat: 'Action' | 'WaitingOn' | 'FYI'): string {
  const labels: Record<string, string> = {
    Action: '[ ACTION ]',
    WaitingOn: '[ WAITING ]',
    FYI: '[ FYI ]',
  };
  return labels[cat] ?? `[ ${cat.toUpperCase()} ]`;
}

// ─── cover page ──────────────────────────────────────────────────────────────

function coverPage(input: FaxTemplateInput): string {
  const name = input.subscriberName.trim() || 'Subscriber';
  return `
    <div style="
      page-break-after: always;
      width: 100%;
      height: 9in;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      padding: 1in 1in;
      box-sizing: border-box;
    ">
      <!-- Wordmark -->
      <div style="
        font-family: Georgia, serif;
        font-size: 52pt;
        font-weight: bold;
        letter-spacing: -2px;
        color: #1a1a1a;
        line-height: 1;
        margin-bottom: 12px;
      ">Gist</div>

      <!-- Rule -->
      <div style="width: 80px; height: 3px; background: #1a1a1a; margin-bottom: 24px;"></div>

      <!-- Date -->
      <div style="
        font-family: Arial, sans-serif;
        font-size: 11pt;
        color: #444;
        margin-bottom: 6px;
        letter-spacing: 0.5px;
      ">${esc(input.date)}</div>

      <!-- Subscriber -->
      <div style="
        font-family: Georgia, serif;
        font-size: 16pt;
        color: #1a1a1a;
        margin-bottom: 4px;
      ">For ${esc(name)}</div>

      <!-- Tagline -->
      <div style="
        font-family: Arial, sans-serif;
        font-size: 9pt;
        color: #888;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-top: 8px;
      ">Your morning briefing</div>

      <!-- Footer -->
      <div style="
        position: absolute;
        bottom: 0.75in;
        left: 1in;
        font-family: Arial, sans-serif;
        font-size: 7pt;
        color: #bbb;
        letter-spacing: 0.5px;
      ">mygist.app</div>
    </div>`;
}

// ─── content sections ─────────────────────────────────────────────────────────

function calendarSection(items: FaxTemplateInput['dayItems']): string {
  if (!items.length) {
    return `<p style="font-family:Georgia,serif;font-size:10pt;color:#888;font-style:italic;margin:0 0 6px 0;">No events today.</p>`;
  }
  return items
    .map(
      (item) => `
      <div style="margin-bottom: 7px;">
        ${item.time ? `<span style="font-family:Arial,sans-serif;font-size:8pt;color:#555;margin-right:8px;">${esc(item.time)}</span>` : ''}
        <span style="font-family:Georgia,serif;font-size:11pt;color:#1a1a1a;">${esc(item.title)}</span>
        ${item.note ? `<span style="font-family:Arial,sans-serif;font-size:8pt;color:#888;margin-left:6px;">${esc(item.note)}</span>` : ''}
      </div>`,
    )
    .join('');
}

function emailCardsSection(
  cards: FaxTemplateInput['emailCards'],
): string {
  if (!cards.length) return '';

  return cards
    .map(
      (card) => `
      <div style="
        border-left: 3px solid #1a1a1a;
        padding: 6px 0 6px 10px;
        margin-bottom: 10px;
      ">
        <div style="font-family:Arial,sans-serif;font-size:7pt;color:#555;letter-spacing:1px;margin-bottom:2px;">
          ${categoryLabel(card.category)}${card.fromName ? ` · ${esc(card.fromName)}` : ''}
        </div>
        <div style="font-family:Georgia,serif;font-size:10pt;font-weight:bold;color:#1a1a1a;margin-bottom:2px;">${esc(card.subject)}</div>
        <div style="font-family:Georgia,serif;font-size:9pt;color:#444;margin-bottom:4px;">${esc(card.snippet)}</div>
        ${card.suggestedNextStep ? `<div style="font-family:Arial,sans-serif;font-size:8pt;color:#555;">→ ${esc(card.suggestedNextStep)}</div>` : ''}
      </div>`,
    )
    .join('');
}

function worldSection(items: FaxTemplateInput['worldItems']): string {
  if (!items.length) {
    return `<p style="font-family:Georgia,serif;font-size:10pt;color:#888;font-style:italic;margin:0;">No news today.</p>`;
  }
  return items
    .map(
      (item) => `
      <div style="margin-bottom: 9px;">
        <div style="font-family:Georgia,serif;font-size:11pt;font-weight:bold;color:#1a1a1a;margin-bottom:1px;">${esc(item.headline)}</div>
        <div style="font-family:Arial,sans-serif;font-size:8pt;color:#666;">${esc(item.implication)}</div>
      </div>`,
    )
    .join('');
}

function bulletsSection(bullets: string[]): string {
  if (!bullets.length) return '';
  return bullets
    .map(
      (b) => `
      <div style="
        font-family: Georgia, serif;
        font-size: 11pt;
        color: #1a1a1a;
        padding: 5px 0 5px 14px;
        border-left: 2px solid #1a1a1a;
        margin-bottom: 7px;
        line-height: 1.4;
      ">${esc(b)}</div>`,
    )
    .join('');
}

// ─── content page ─────────────────────────────────────────────────────────────

function contentPage(input: FaxTemplateInput): string {
  const hasEmailCards = input.emailCards.length > 0;

  return `
    <div style="
      width: 100%;
      padding: 0.75in 1in 0.75in 1in;
      box-sizing: border-box;
      font-size: 11pt;
    ">
      <!-- Page header -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        border-bottom: 2px solid #1a1a1a;
        padding-bottom: 5px;
        margin-bottom: 16px;
      ">
        <span style="font-family:Georgia,serif;font-size:14pt;font-weight:bold;color:#1a1a1a;">Gist</span>
        <span style="font-family:Arial,sans-serif;font-size:8pt;color:#888;">${esc(input.date)} · ${esc(input.weatherSummary)}</span>
      </div>

      ${sectionHeader('Today')}
      ${calendarSection(input.dayItems)}

      ${hasEmailCards ? sectionHeader('Inbox') : ''}
      ${hasEmailCards ? emailCardsSection(input.emailCards) : ''}

      ${sectionHeader('The World')}
      ${worldSection(input.worldItems)}

      ${input.gistBullets.length ? sectionHeader('Focus') : ''}
      ${bulletsSection(input.gistBullets)}

      <!-- Footer -->
      <div style="
        margin-top: 24px;
        padding-top: 8px;
        border-top: 1px solid #ccc;
        font-family: Arial, sans-serif;
        font-size: 7pt;
        color: #bbb;
        text-align: center;
      ">mygist.app · Generated ${esc(input.date)}</div>
    </div>`;
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * Build the complete fax HTML document: cover page + content page(s).
 * Phaxio renders this HTML to a US Letter fax.
 */
export function buildFaxHtml(input: FaxTemplateInput): string {
  const safeInput: FaxTemplateInput = {
    ...input,
    subscriberName: input.subscriberName?.trim() || 'Subscriber',
    dayItems: input.dayItems ?? [],
    worldItems: input.worldItems ?? [],
    emailCards: input.emailCards ?? [],
    gistBullets: input.gistBullets ?? [],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gist — ${esc(safeInput.date)}</title>
  <style>
    @page {
      size: letter;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1a1a1a;
    }
  </style>
</head>
<body>
  ${coverPage(safeInput)}
  ${contentPage(safeInput)}
</body>
</html>`;
}
