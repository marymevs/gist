/**
 * Email body for the morning Gist — responsive, single-column, email-safe.
 *
 * Table-based with inline styles for Gmail/Outlook/Apple Mail. One fluid column
 * (max-width 600, width 100%) that reads cleanly on phones — no fixed-width
 * multi-column grid, so there's no "random whitespace" and no horizontal scroll.
 * No @page / page-break logic: the inbox copy is for reading. The paginated,
 * printable broadsheet is the web/print artifact (see newspaperTemplate.ts),
 * shown on /today and printed from there.
 *
 * Fonts: web-safe fallbacks (Georgia, Arial, Courier New) since Gmail strips
 * @import and <link> in <head>.
 */

import type { NewspaperTemplateInput } from './newspaperTypes';

// ─── Color tokens (inline — no CSS vars in email) ──────────────────────────

const C = {
  ink: '#1c1917',
  mid: '#57534e',
  light: '#a8a29e',
  rule: '#d6d3d1',
  tint: '#f5f0eb',
  paper: '#fffdf9',
  warm: '#92400e',
  white: '#ffffff',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A full-width row holding one stacked section. */
function row(inner: string): string {
  return `<tr><td style="padding:0;">${inner}</td></tr>`;
}

/** Thin divider row between sections. */
function divider(): string {
  return `<tr><td style="padding:0;"><div style="border-top:1px solid ${C.rule};margin:14px 0;"></div></td></tr>`;
}

/** Heavy section break (mirrors the broadsheet's 2pt ink rules). */
function heavyBreak(): string {
  return `<tr><td style="padding:0;"><div style="border-top:2px solid ${C.ink};margin:16px 0 12px;"></div></td></tr>`;
}

function sectionLabel(text: string): string {
  return `<div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.warm};margin-bottom:6px;">${esc(text)}</div>`;
}

// ─── sections ────────────────────────────────────────────────────────────────

function mastheadEmail(input: NewspaperTemplateInput): string {
  return `
    <tr><td style="padding:0 0 10px 0;border-bottom:2px solid ${C.ink};text-align:center;">
      <div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${C.light};margin-bottom:2px;">${esc(input.location)} &middot; For ${esc(input.subscriberName)}</div>
      <div style="font-family:Georgia,serif;font-weight:bold;font-size:38px;line-height:0.9;letter-spacing:-1px;color:${C.ink};">The Gist</div>
      <div style="font-family:Georgia,serif;font-style:italic;font-size:13px;color:${C.mid};margin-top:3px;">Your morning, on paper</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-top:1px solid ${C.rule};padding-top:4px;">
        <tr>
          <td style="font-family:Courier New,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.light};text-align:left;">${esc(input.dateFormatted)}</td>
          <td style="font-family:Courier New,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.light};text-align:center;">${esc(input.volumeIssue)}</td>
          <td style="font-family:Courier New,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.light};text-align:right;">${esc(input.deliveryTime)}</td>
        </tr>
      </table>
    </td></tr>`;
}

function weatherEmail(input: NewspaperTemplateInput): string {
  const forecastCells = input.weather.forecast
    .map(
      (d) => `
      <td style="text-align:center;padding:0 6px;">
        <div style="font-family:Courier New,monospace;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:${C.light};">${esc(d.day)}</div>
        <div style="font-family:Georgia,serif;font-size:13px;">${esc(d.high)}</div>
        ${d.condition ? `<div style="font-size:10px;color:${C.warm};">${esc(d.condition)}</div>` : ''}
      </td>`,
    )
    .join('');

  const forecast = forecastCells
    ? `<td style="text-align:right;vertical-align:baseline;"><table cellpadding="0" cellspacing="0" border="0"><tr>${forecastCells}</tr></table></td>`
    : '';

  return `
    <tr><td style="padding:8px 0 6px;border-bottom:1px solid ${C.rule};">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:Georgia,serif;font-size:24px;color:${C.ink};vertical-align:baseline;white-space:nowrap;">${esc(input.weather.tempNow)}</td>
          <td style="font-size:12px;color:${C.mid};vertical-align:baseline;padding-left:10px;width:100%;">${esc(input.weather.conditions)}</td>
          ${forecast}
        </tr>
      </table>
    </td></tr>`;
}

function rhythmsEmail(input: NewspaperTemplateInput): string {
  const label = (t: string) =>
    `<b style="font-family:Courier New,monospace;font-size:9px;font-weight:normal;letter-spacing:1px;text-transform:uppercase;color:${C.light};">${esc(t)}</b>`;
  const items = [
    `${label('Moon')} ${esc(input.rhythms.moon)}`,
    `${label('Season')} ${esc(input.rhythms.season)}`,
    `${label('Light')} ${esc(input.rhythms.light)}`,
  ];
  if (input.rhythms.countdown) {
    const parts = input.rhythms.countdown.split(' ');
    items.push(`${label(parts[0])} ${esc(parts.slice(1).join(' '))}`);
  }
  return `
    <tr><td style="padding:6px 0;border-bottom:1px solid ${C.rule};font-size:11px;color:${C.mid};line-height:1.8;">
      ${items.join(' &nbsp;&nbsp;&middot;&nbsp;&nbsp; ')}
    </td></tr>`;
}

function ledeEmail(input: NewspaperTemplateInput): string {
  return `
    <tr><td style="padding:14px 0;">
      <div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.warm};">${esc(input.lede.kicker)}</div>
      <div style="font-family:Georgia,serif;font-weight:bold;font-size:22px;line-height:1.2;margin:4px 0 6px;color:${C.ink};">${esc(input.lede.headline)}</div>
      <div style="font-size:14px;line-height:1.65;color:${C.ink};">${esc(input.lede.paragraph)}</div>
    </td></tr>`;
}

function scheduleEmail(input: NewspaperTemplateInput): string {
  const events = input.schedule
    .map((ev, i) => {
      const border = i > 0 ? `border-top:1px dotted ${C.rule};` : '';
      return `
      <tr>
        <td style="font-family:Courier New,monospace;font-size:11px;color:${C.light};vertical-align:top;padding:5px 10px 5px 0;white-space:nowrap;${border}">${esc(ev.time)}</td>
        <td style="vertical-align:top;padding:5px 0;${border}">
          <div style="font-weight:500;font-size:13px;color:${C.ink};">${ev.emoji ? esc(ev.emoji) + ' ' : ''}${esc(ev.name)}</div>
          <div style="font-size:12px;color:${C.mid};line-height:1.4;">${esc(ev.note)}</div>
        </td>
      </tr>`;
    })
    .join('');

  return `${sectionLabel('Schedule')}<table width="100%" cellpadding="0" cellspacing="0" border="0">${events}</table>`;
}

function goodNewsEmail(input: NewspaperTemplateInput): string {
  const items = input.goodNews
    .map((item, i) => {
      const border = i > 0 ? `border-top:1px dotted ${C.rule};` : '';
      return `<div style="padding:6px 0;${border}">
        <div style="font-family:Georgia,serif;font-size:15px;line-height:1.25;margin-bottom:2px;">${esc(item.headline)}</div>
        <div style="font-size:12px;color:${C.mid};line-height:1.45;">${esc(item.summary)}</div>
      </div>`;
    })
    .join('');

  return `${sectionLabel('Good News from the World')}${items}`;
}

function notificationsEmail(input: NewspaperTemplateInput): string {
  const items = input.notifications
    .map((nt, i) => {
      const border = i > 0 ? `border-top:1px dotted ${C.rule};` : '';
      return `<div style="padding:6px 0;${border}">
        <span style="font-family:Courier New,monospace;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:${C.light};">${esc(nt.source)}</span><br>
        <span style="font-size:12px;line-height:1.45;">${esc(nt.body)}</span>
      </div>`;
    })
    .join('');

  return `${sectionLabel('Notifications & Life')}${items}`;
}

function peopleEmail(input: NewspaperTemplateInput): string {
  const items = input.people
    .map(
      (p) =>
        `<div style="font-size:12px;line-height:1.45;margin-bottom:5px;"><strong>${esc(p.name)}</strong> ${esc(p.nudge)}</div>`,
    )
    .join('');

  return `${sectionLabel('People')}${items}`;
}

function quoteEmail(q: { text: string; attribution: string }): string {
  return `
    <div style="text-align:center;padding:8px 14px;">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:16px;line-height:1.4;margin-bottom:4px;color:${C.ink};">&ldquo;${esc(q.text)}&rdquo;</div>
      <div style="font-family:Courier New,monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${C.light};">${esc(q.attribution)}</div>
    </div>`;
}

// ─── Reflection sections ──────────────────────────────────────────────────────

function bodyMindEmail(input: NewspaperTemplateInput): string {
  const paragraphs = input.bodyMind.paragraphs
    .map(
      (p) =>
        `<p style="font-size:13px;line-height:1.55;margin:0 0 6px;">${esc(p)}</p>`,
    )
    .join('');

  const coaching = input.bodyMind.coachingNote
    ? `<p style="font-size:12px;font-style:italic;color:${C.mid};margin:6px 0 0;">${esc(input.bodyMind.coachingNote)}</p>`
    : '';

  return `${sectionLabel(input.bodyMind.sectionLabel)}
    <div style="font-family:Georgia,serif;font-weight:bold;font-size:16px;margin-bottom:5px;color:${C.ink};">${esc(input.bodyMind.title)}</div>
    ${paragraphs}
    ${coaching}`;
}

function practiceArcEmail(input: NewspaperTemplateInput): string {
  const items = input.practiceArc.items
    .map(
      (item) =>
        `<p style="font-size:13px;line-height:1.55;margin:0 0 5px;"><strong>${esc(item.label)}</strong> ${esc(item.text)}</p>`,
    )
    .join('');

  const closing = input.practiceArc.closingNote
    ? `<p style="font-size:12px;color:${C.mid};margin:6px 0 0;">${esc(input.practiceArc.closingNote)}</p>`
    : '';

  return `${sectionLabel(input.practiceArc.sectionLabel)}
    <div style="font-family:Georgia,serif;font-weight:bold;font-size:16px;margin-bottom:5px;color:${C.ink};">${esc(input.practiceArc.title)}</div>
    ${items}
    ${closing}`;
}

function moonHighlightEmail(input: NewspaperTemplateInput): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.tint};margin:8px 0;">
      <tr>
        <td width="3" style="background:${C.warm};">&nbsp;</td>
        <td style="padding:10px 12px;">
          <div style="font-family:Georgia,serif;font-weight:bold;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;color:${C.ink};">${esc(input.moonHighlight.title)}</div>
          <p style="font-size:13px;line-height:1.5;margin:0;color:${C.ink};">${esc(input.moonHighlight.paragraph)}</p>
        </td>
      </tr>
    </table>`;
}

function writingLine(): string {
  // Email-safe writing line: a row with bottom border + non-breaking space for height.
  return `<tr><td style="border-bottom:1px solid ${C.rule};height:26px;line-height:26px;">&nbsp;</td></tr>`;
}

function intentionEmail(input: NewspaperTemplateInput): string {
  return `${sectionLabel('Morning Intention')}
    <p style="font-size:12px;font-style:italic;color:${C.mid};margin:0 0 8px;line-height:1.45;">${esc(input.intentionPrompt)}</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${writingLine()}${writingLine()}${writingLine()}
    </table>`;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Build the email body — a single fluid column, all sections stacked, no page
 * breaks. Same NewspaperTemplateInput as the web/print artifact, so the inbox
 * and /today never drift in content.
 */
export function buildNewspaperEmailHtml(input: NewspaperTemplateInput): string {
  const closingThought = input.closingThought
    ? divider() +
      row(
        `<p style="font-size:13px;line-height:1.55;color:${C.mid};font-style:italic;margin:0;">${esc(input.closingThought)}</p>`,
      )
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>The Gist &mdash; ${esc(input.dateFormatted)}</title>
  <style>
    /* Progressive enhancement for clients that keep <style> (Apple Mail, web
       iframes). Gmail/Outlook strip this and fall back to the inline single
       column, which is the intended baseline. */
    body { margin:0; padding:0; }
    @media (min-width:600px) {
      .gist-card { padding-left:8px; padding-right:8px; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.ink};">

<!-- wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};padding:20px 0;">
<tr><td align="center" style="padding:0 14px;">

<!-- card (single fluid column) -->
<table class="gist-card" width="600" cellpadding="0" cellspacing="0" border="0" style="background:${C.white};max-width:600px;width:100%;">

  ${mastheadEmail(input)}
  ${weatherEmail(input)}
  ${rhythmsEmail(input)}
  ${ledeEmail(input)}

  ${heavyBreak()}
  ${row(scheduleEmail(input))}
  ${divider()}
  ${row(goodNewsEmail(input))}
  ${divider()}
  ${row(notificationsEmail(input))}
  ${divider()}
  ${row(peopleEmail(input))}
  ${divider()}
  ${row(quoteEmail(input.quote))}

  ${heavyBreak()}
  ${row(bodyMindEmail(input))}
  ${divider()}
  ${row(practiceArcEmail(input))}
  ${divider()}
  ${row(moonHighlightEmail(input))}
  ${closingThought}
  ${divider()}
  ${row(intentionEmail(input))}
  ${divider()}
  ${row(quoteEmail(input.personalQuote))}

  <!-- Footer -->
  <tr><td style="padding:14px 0 0;border-top:1px solid ${C.ink};text-align:center;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:Courier New,monospace;font-size:9px;color:${C.light};letter-spacing:1px;text-transform:uppercase;text-align:left;">The Gist &middot; ${esc(input.dateFormatted)}</td>
        <td style="font-family:Courier New,monospace;font-size:9px;color:${C.light};letter-spacing:1px;text-transform:uppercase;text-align:right;">&#9789; ${esc(input.moonFooter)}</td>
      </tr>
    </table>
  </td></tr>

</table>
<!-- /card -->

</td></tr>
</table>
<!-- /wrapper -->

</body>
</html>`;
}

export function buildNewspaperEmailSubject(
  input: NewspaperTemplateInput,
): string {
  return `The Gist — ${input.dateFormatted}`;
}
