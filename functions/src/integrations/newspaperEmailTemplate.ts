/**
 * Email-safe newspaper template for the morning Gist.
 *
 * Table-based layout with inline styles for Gmail/Outlook/Apple Mail.
 * No CSS variables, no flexbox, no grid, no @import.
 * Fonts: web-safe fallbacks (Georgia, Arial, Courier New) since
 * Gmail strips @import and <link> in <head>.
 *
 * Design: preserves the editorial feel of the newspaper template
 * within email-client constraints.
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
    .map((d) => `
      <td style="text-align:center;padding:0 6px;">
        <div style="font-family:Courier New,monospace;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:${C.light};">${esc(d.day)}</div>
        <div style="font-family:Georgia,serif;font-size:13px;">${esc(d.high)}</div>
        ${d.condition ? `<div style="font-size:10px;color:${C.warm};">${esc(d.condition)}</div>` : ''}
      </td>`)
    .join('');

  return `
    <tr><td style="padding:8px 0 6px;border-bottom:1px solid ${C.rule};">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:Georgia,serif;font-size:24px;color:${C.ink};vertical-align:baseline;">${esc(input.weather.tempNow)}</td>
          <td style="font-size:12px;color:${C.mid};vertical-align:baseline;padding-left:10px;">${esc(input.weather.conditions)}</td>
          <td style="text-align:right;vertical-align:baseline;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>${forecastCells}</tr></table>
          </td>
        </tr>
      </table>
    </td></tr>`;
}

function rhythmsEmail(input: NewspaperTemplateInput): string {
  const items = [
    `<b style="font-family:Courier New,monospace;font-size:9px;font-weight:normal;letter-spacing:1px;text-transform:uppercase;color:${C.light};">Moon</b> ${esc(input.rhythms.moon)}`,
    `<b style="font-family:Courier New,monospace;font-size:9px;font-weight:normal;letter-spacing:1px;text-transform:uppercase;color:${C.light};">Season</b> ${esc(input.rhythms.season)}`,
    `<b style="font-family:Courier New,monospace;font-size:9px;font-weight:normal;letter-spacing:1px;text-transform:uppercase;color:${C.light};">Light</b> ${esc(input.rhythms.light)}`,
  ];
  if (input.rhythms.countdown) {
    const parts = input.rhythms.countdown.split(' ');
    items.push(`<b style="font-family:Courier New,monospace;font-size:9px;font-weight:normal;letter-spacing:1px;text-transform:uppercase;color:${C.light};">${esc(parts[0])}</b> ${esc(parts.slice(1).join(' '))}`);
  }
  return `
    <tr><td style="padding:4px 0;border-bottom:1px solid ${C.rule};font-size:11px;color:${C.mid};line-height:1.6;">
      ${items.join(' &nbsp;&nbsp;&middot;&nbsp;&nbsp; ')}
    </td></tr>`;
}

function ledeEmail(input: NewspaperTemplateInput): string {
  return `
    <tr><td style="padding:14px 0;">
      <div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.warm};">${esc(input.lede.kicker)}</div>
      <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;line-height:1.2;margin:4px 0 6px;color:${C.ink};">${esc(input.lede.headline)}</div>
      <div style="font-size:13px;line-height:1.6;color:${C.ink};">${esc(input.lede.paragraph)}</div>
    </td></tr>`;
}

function sectionLabel(text: string): string {
  return `<div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.warm};margin-bottom:6px;">${esc(text)}</div>`;
}

function scheduleEmail(input: NewspaperTemplateInput): string {
  const events = input.schedule
    .map((ev, i) => {
      const border = i > 0 ? `border-top:1px dotted ${C.rule};` : '';
      return `
      <tr>
        <td style="font-family:Courier New,monospace;font-size:10px;color:${C.light};vertical-align:top;padding:4px 8px 4px 0;white-space:nowrap;${border}">${esc(ev.time)}</td>
        <td style="vertical-align:top;padding:4px 0;${border}">
          <div style="font-weight:500;font-size:12px;color:${C.ink};">${ev.emoji ? esc(ev.emoji) + ' ' : ''}${esc(ev.name)}</div>
          <div style="font-size:11px;color:${C.mid};">${esc(ev.note)}</div>
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
      return `<div style="padding:4px 0;${border}">
        <div style="font-family:Georgia,serif;font-size:13px;line-height:1.2;margin-bottom:2px;">${esc(item.headline)}</div>
        <div style="font-size:11px;color:${C.mid};line-height:1.35;">${esc(item.summary)}</div>
      </div>`;
    })
    .join('');

  return `${sectionLabel('Good News from the World')}${items}`;
}

function notificationsEmail(input: NewspaperTemplateInput): string {
  const items = input.notifications
    .map((nt, i) => {
      const border = i > 0 ? `border-top:1px dotted ${C.rule};` : '';
      return `<div style="padding:4px 0;${border}">
        <span style="font-family:Courier New,monospace;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:${C.light};">${esc(nt.source)}</span><br>
        <span style="font-size:11px;line-height:1.4;">${esc(nt.body)}</span>
      </div>`;
    })
    .join('');

  return `${sectionLabel('Notifications & Life')}${items}`;
}

function peopleEmail(input: NewspaperTemplateInput): string {
  const items = input.people
    .map((p) => `<div style="font-size:11px;line-height:1.4;margin-bottom:4px;"><strong>${esc(p.name)}</strong> ${esc(p.nudge)}</div>`)
    .join('');

  return `${sectionLabel('People')}${items}`;
}

function quoteEmail(q: { text: string; attribution: string }): string {
  return `
    <div style="text-align:center;padding:8px 14px;">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:15px;line-height:1.35;margin-bottom:4px;color:${C.ink};">&ldquo;${esc(q.text)}&rdquo;</div>
      <div style="font-family:Courier New,monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${C.light};">${esc(q.attribution)}</div>
    </div>`;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Build the email-safe newspaper HTML.
 * Table-based, inline styles, Gmail/Outlook compatible.
 * Only renders Page 1 content (email doesn't include fax-back).
 */
export function buildNewspaperEmailHtml(input: NewspaperTemplateInput): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>The Gist &mdash; ${esc(input.dateFormatted)}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${C.ink};">

<!-- wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};padding:20px 0;">
<tr><td align="center">

<!-- card -->
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:${C.white};max-width:600px;width:100%;">

  ${mastheadEmail(input)}
  ${weatherEmail(input)}
  ${rhythmsEmail(input)}
  ${ledeEmail(input)}

  <!-- Two columns -->
  <tr><td style="padding:0;border-top:2px solid ${C.ink};">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <!-- Left column -->
        <td width="55%" valign="top" style="padding:12px 12px 12px 0;border-right:1px solid ${C.rule};">
          ${scheduleEmail(input)}
          <div style="border-top:1px solid ${C.rule};margin:10px 0;"></div>
          ${goodNewsEmail(input)}
        </td>
        <!-- Right column -->
        <td width="45%" valign="top" style="padding:12px 0 12px 12px;">
          ${notificationsEmail(input)}
          <div style="border-top:1px solid ${C.rule};margin:10px 0;"></div>
          ${peopleEmail(input)}
          <div style="border-top:1px solid ${C.rule};margin:10px 0;"></div>
          ${quoteEmail(input.quote)}
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:10px 0;border-top:1px solid ${C.ink};text-align:center;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:Courier New,monospace;font-size:9px;color:${C.light};letter-spacing:1px;text-transform:uppercase;text-align:left;">The Gist &middot; ${esc(input.dateFormatted)}</td>
        <td style="font-family:Courier New,monospace;font-size:9px;color:${C.light};letter-spacing:1px;text-transform:uppercase;text-align:center;">mygist.app</td>
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

export function buildNewspaperEmailSubject(input: NewspaperTemplateInput): string {
  return `The Gist \u2014 ${input.dateFormatted}`;
}
