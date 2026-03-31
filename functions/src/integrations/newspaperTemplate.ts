/**
 * Newspaper-style HTML template for the morning Gist.
 *
 * 2-page broadsheet layout: Fraunces + IBM Plex Sans/Mono.
 * Replaces faxTemplate.ts for print/fax/PDF delivery.
 * For email delivery, see newspaperEmailTemplate.ts (table-based).
 *
 * Design reference: gist-sample-riley.html, gist-sample-jordan.html
 */

import type { NewspaperTemplateInput } from './newspaperTypes';

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convert straight quotes to curly in rendered text */
function smartQuotes(s: string): string {
  return s
    .replace(/(\s|^)"/g, '$1\u201c')
    .replace(/"/g, '\u201d')
    .replace(/(\s|^)'/g, '$1\u2018')
    .replace(/'/g, '\u2019')
    .replace(/--/g, '\u2014');
}

function escSmart(s: string): string {
  return smartQuotes(esc(s));
}

// ─── CSS (shared between pages) ─────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,700;0,9..144,800;1,9..144,300;1,9..144,400;1,9..144,500&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&family=IBM+Plex+Mono:wght@300;400&display=swap');

  :root {
    --ink: #1c1917;
    --mid: #57534e;
    --light: #a8a29e;
    --rule: #d6d3d1;
    --tint: #f5f0eb;
    --paper: #fffdf9;
    --warm: #92400e;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: letter; margin: 0.55in 0.65in; }

  body {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 8.5pt;
    line-height: 1.5;
    color: var(--ink);
    background: var(--paper);
    font-weight: 300;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page { width: 7in; margin: 0 auto; }
  .page + .page { page-break-before: always; }

  .mast { text-align: center; border-bottom: 2pt solid var(--ink); padding-bottom: 8pt; }
  .mast-pre { font-family: 'IBM Plex Mono', monospace; font-size: 6pt; font-weight: 300; letter-spacing: 0.18em; text-transform: uppercase; color: var(--light); margin-bottom: 1pt; }
  .mast h1 { font-family: 'Fraunces', serif; font-weight: 800; font-size: 46pt; line-height: 0.9; letter-spacing: -0.03em; }
  .mast-post { font-family: 'Fraunces', serif; font-style: italic; font-weight: 300; font-size: 9.5pt; color: var(--mid); margin-top: 2pt; }
  .mast-sub { display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 5.5pt; font-weight: 300; letter-spacing: 0.12em; text-transform: uppercase; color: var(--light); border-top: 0.5pt solid var(--rule); margin-top: 6pt; padding-top: 3pt; }

  .wx { display: flex; align-items: baseline; gap: 10pt; padding: 6pt 0 5pt; border-bottom: 0.5pt solid var(--rule); }
  .wx-temp { font-family: 'Fraunces', serif; font-weight: 500; font-size: 20pt; line-height: 1; }
  .wx-cond { font-size: 8pt; color: var(--mid); }
  .wx-week { margin-left: auto; display: flex; gap: 10pt; }
  .wx-day { text-align: center; }
  .wx-day-name { font-family: 'IBM Plex Mono', monospace; font-size: 5pt; text-transform: uppercase; letter-spacing: 0.1em; color: var(--light); }
  .wx-day-hi { font-family: 'Fraunces', serif; font-weight: 500; font-size: 9pt; }
  .wx-day-rain { font-size: 6pt; color: var(--warm); }

  .rhythms { display: flex; gap: 14pt; padding: 3pt 0 4pt; border-bottom: 0.5pt solid var(--rule); font-size: 7pt; color: var(--mid); }
  .rhythms b { font-family: 'IBM Plex Mono', monospace; font-size: 5.5pt; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; color: var(--light); }

  .lede { padding: 10pt 0; }
  .lede-kicker { font-family: 'IBM Plex Mono', monospace; font-size: 5.5pt; font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; color: var(--warm); }
  .lede h2 { font-family: 'Fraunces', serif; font-weight: 700; font-size: 16pt; line-height: 1.2; margin: 3pt 0 5pt; letter-spacing: -0.01em; }
  .lede p { font-size: 9pt; font-weight: 300; line-height: 1.6; }

  .cols { display: flex; border-top: 1.5pt solid var(--ink); padding-top: 8pt; }
  .c { flex: 1; }
  .c + .c { border-left: 0.5pt solid var(--rule); margin-left: 10pt; padding-left: 10pt; }

  .label { font-family: 'IBM Plex Mono', monospace; font-size: 5.5pt; font-weight: 400; letter-spacing: 0.16em; text-transform: uppercase; color: var(--warm); margin-bottom: 4pt; }

  .ev { display: flex; gap: 6pt; padding: 2.5pt 0; }
  .ev + .ev { border-top: 0.5pt dotted var(--rule); }
  .ev-t { font-family: 'IBM Plex Mono', monospace; font-size: 6pt; font-weight: 300; color: var(--light); min-width: 36pt; padding-top: 1.5pt; }
  .ev-name { font-weight: 500; font-size: 8pt; }
  .ev-note { font-size: 7pt; color: var(--mid); font-weight: 300; }

  .nt { display: flex; gap: 5pt; padding: 3pt 0; align-items: flex-start; }
  .nt + .nt { border-top: 0.5pt dotted var(--rule); }
  .nt-ico { font-size: 7pt; min-width: 12pt; text-align: center; padding-top: 1pt; }
  .nt-body { font-size: 7.5pt; line-height: 1.4; font-weight: 300; }
  .nt-src { font-family: 'IBM Plex Mono', monospace; font-size: 5pt; font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; color: var(--light); }

  .nw { padding: 3pt 0; }
  .nw + .nw { border-top: 0.5pt dotted var(--rule); }
  .nw h4 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 8.5pt; line-height: 1.2; margin-bottom: 1pt; }
  .nw p { font-size: 7pt; color: var(--mid); font-weight: 300; line-height: 1.35; margin: 0; }

  .hr { border: none; border-top: 0.5pt solid var(--rule); margin: 6pt 0; }

  .hi { background: var(--tint); padding: 7pt 9pt; border-left: 1.5pt solid var(--warm); margin: 5pt 0; }
  .hi-title { font-family: 'Fraunces', serif; font-weight: 700; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2pt; }

  .qt { text-align: center; padding: 6pt 12pt; }
  .qt blockquote { font-family: 'Fraunces', serif; font-style: italic; font-weight: 300; font-size: 11pt; line-height: 1.35; margin-bottom: 3pt; }
  .qt cite { font-family: 'IBM Plex Mono', monospace; font-size: 5.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: var(--light); font-style: normal; }

  .wl { border-bottom: 0.5pt solid var(--rule); height: 18pt; }

  .ft { padding-top: 5pt; border-top: 1pt solid var(--ink); display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 5pt; color: var(--light); letter-spacing: 0.1em; text-transform: uppercase; }

  .sm { font-size: 7.5pt; line-height: 1.4; font-weight: 300; }
  .xs { font-size: 6.5pt; font-weight: 300; }
  .it { font-style: italic; }
  .mt { color: var(--mid); }
  .bd { font-weight: 500; }
  h3 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 10pt; line-height: 1.2; margin-bottom: 3pt; }
  p { margin-bottom: 4pt; }
  p:last-child { margin-bottom: 0; }

  @media print { body { background: white; } }
  @media screen { body { padding: 24px; background: #e7e5e4; } .page { background: var(--paper); padding: 0.55in 0.65in; box-shadow: 0 1px 4px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04); margin-bottom: 24px; } }
`;

// ─── Page 1: The Briefing ───────────────────────────────────────────────────

function masthead(input: NewspaperTemplateInput): string {
  return `
  <div class="mast">
    <div class="mast-pre">${esc(input.location)} &nbsp;&middot;&nbsp; For ${esc(input.subscriberName)}</div>
    <h1>The Gist</h1>
    <div class="mast-post">Your morning, on paper</div>
    <div class="mast-sub">
      <span>${esc(input.dateFormatted)}</span>
      <span>${esc(input.volumeIssue)}</span>
      <span>${esc(input.deliveryTime)}</span>
    </div>
  </div>`;
}

function weatherBar(input: NewspaperTemplateInput): string {
  const forecastHtml = input.weather.forecast
    .map((d) => `
      <div class="wx-day">
        <div class="wx-day-name">${esc(d.day)}</div>
        <div class="wx-day-hi">${esc(d.high)}</div>
        ${d.condition ? `<div class="wx-day-rain">${esc(d.condition)}</div>` : ''}
      </div>`)
    .join('');

  return `
  <div class="wx">
    <span class="wx-temp">${esc(input.weather.tempNow)}</span>
    <span class="wx-cond">${escSmart(input.weather.conditions)}</span>
    <div class="wx-week">${forecastHtml}</div>
  </div>`;
}

function rhythmsBar(input: NewspaperTemplateInput): string {
  const items = [
    `<span><b>Moon</b> ${escSmart(input.rhythms.moon)}</span>`,
    `<span><b>Season</b> ${escSmart(input.rhythms.season)}</span>`,
    `<span><b>Light</b> ${escSmart(input.rhythms.light)}</span>`,
  ];
  if (input.rhythms.countdown) {
    items.push(`<span><b>${esc(input.rhythms.countdown.split(' ')[0])}</b> ${escSmart(input.rhythms.countdown.substring(input.rhythms.countdown.indexOf(' ') + 1))}</span>`);
  }
  return `<div class="rhythms">${items.join('\n')}</div>`;
}

function ledeSection(input: NewspaperTemplateInput): string {
  return `
  <div class="lede">
    <div class="lede-kicker">${escSmart(input.lede.kicker)}</div>
    <h2>${escSmart(input.lede.headline)}</h2>
    <p>${escSmart(input.lede.paragraph)}</p>
  </div>`;
}

function scheduleHtml(input: NewspaperTemplateInput): string {
  return input.schedule
    .map((ev) => `
      <div class="ev">
        <span class="ev-t">${esc(ev.time)}</span>
        <div>
          <div class="ev-name">${ev.emoji ? esc(ev.emoji) + ' ' : ''}${escSmart(ev.name)}</div>
          <div class="ev-note">${escSmart(ev.note)}</div>
        </div>
      </div>`)
    .join('');
}

function goodNewsHtml(input: NewspaperTemplateInput): string {
  return input.goodNews
    .map((item) => `
      <div class="nw">
        <h4>${escSmart(item.headline)}</h4>
        <p>${escSmart(item.summary)}</p>
      </div>`)
    .join('');
}

function notificationsHtml(input: NewspaperTemplateInput): string {
  return input.notifications
    .map((nt) => `
      <div class="nt">
        <span class="nt-ico">${esc(nt.emoji)}</span>
        <div class="nt-body"><span class="nt-src">${esc(nt.source)}</span><br>${escSmart(nt.body)}</div>
      </div>`)
    .join('');
}

function peopleHtml(input: NewspaperTemplateInput): string {
  return input.people
    .map((p) => `<p class="sm"><span class="bd">${esc(p.name)}</span> ${escSmart(p.nudge)}</p>`)
    .join('\n');
}

function quoteHtml(q: { text: string; attribution: string }, fontSize?: string): string {
  const sizeAttr = fontSize ? ` style="font-size:${fontSize};"` : '';
  return `
      <div class="qt"${fontSize ? ' style="padding:5pt 6pt;"' : ''}>
        <blockquote${sizeAttr}>&ldquo;${escSmart(q.text)}&rdquo;</blockquote>
        <cite>${esc(q.attribution)}</cite>
      </div>`;
}

function page1(input: NewspaperTemplateInput): string {
  return `
<div class="page">
  ${masthead(input)}
  ${weatherBar(input)}
  ${rhythmsBar(input)}
  ${ledeSection(input)}

  <div class="cols">
    <div class="c">
      <div class="label">Schedule</div>
      ${scheduleHtml(input)}
      <hr class="hr">
      <div class="label">Good News from the World</div>
      ${goodNewsHtml(input)}
    </div>
    <div class="c">
      <div class="label">Notifications &amp; Life</div>
      ${notificationsHtml(input)}
      <hr class="hr">
      <div class="label">People</div>
      ${peopleHtml(input)}
      <hr class="hr">
      ${quoteHtml(input.quote)}
    </div>
  </div>

  <div class="ft">
    <span>The Gist &middot; Page 1</span>
    <span>mygist.app</span>
    <span>&#9789; ${esc(input.moonFooter)}</span>
  </div>
</div>`;
}

// ─── Page 2: The Reflection ─────────────────────────────────────────────────

function bodyMindHtml(input: NewspaperTemplateInput): string {
  const paragraphs = input.bodyMind.paragraphs
    .map((p) => `<p class="sm">${escSmart(p)}</p>`)
    .join('\n');

  const coaching = input.bodyMind.coachingNote
    ? `<p class="sm mt it">${escSmart(input.bodyMind.coachingNote)}</p>`
    : '';

  return `
      <div class="label">${esc(input.bodyMind.sectionLabel)}</div>
      <h3>${escSmart(input.bodyMind.title)}</h3>
      ${paragraphs}
      ${coaching}`;
}

function practiceArcHtml(input: NewspaperTemplateInput): string {
  const items = input.practiceArc.items
    .map((item) => `<p class="sm"><span class="bd">${escSmart(item.label)}</span> ${escSmart(item.text)}</p>`)
    .join('\n');

  const closing = input.practiceArc.closingNote
    ? `<p class="sm mt">${escSmart(input.practiceArc.closingNote)}</p>`
    : '';

  return `
      <div class="label">${esc(input.practiceArc.sectionLabel)}</div>
      <h3>${escSmart(input.practiceArc.title)}</h3>
      ${items}
      ${closing}`;
}

function moonHighlightHtml(input: NewspaperTemplateInput): string {
  return `
      <div class="hi">
        <div class="hi-title">${escSmart(input.moonHighlight.title)}</div>
        <p class="sm">${escSmart(input.moonHighlight.paragraph)}</p>
      </div>`;
}

function faxBackHtml(input: NewspaperTemplateInput): string {
  const questions = input.faxBackQuestions
    .map((q) => {
      const options = q.options
        .map((o) => `<span>&#9744; ${esc(o)}</span>`)
        .join('');
      return `
      <p class="sm bd">${escSmart(q.prompt)}</p>
      <div style="display:flex;gap:12pt;margin:2pt 0 5pt;font-family:'IBM Plex Mono',monospace;font-size:7pt;font-weight:300;">
        ${options}
      </div>`;
    })
    .join('\n');

  return `
      <div class="label">End of Day &middot; Fax Back</div>
      <p class="xs mt" style="margin-bottom:5pt;">Mark this up and fax it back. Your agents process overnight.</p>
      ${questions}
      <p class="sm bd">What&rsquo;s carrying over?</p>
      <div class="wl"></div>
      <div class="wl"></div>
      <p class="sm bd" style="margin-top:3pt;">Tomorrow I&rsquo;m finishing:</p>
      <div class="wl"></div>
      <p class="sm bd" style="margin-top:3pt;">Someone I want to reach out to:</p>
      <div class="wl"></div>
      <p class="sm bd" style="margin-top:3pt;">Something I&rsquo;m grateful for:</p>
      <div class="wl"></div>
      <div class="wl"></div>`;
}

function page2(input: NewspaperTemplateInput): string {
  const closingThought = input.closingThought
    ? `<hr class="hr"><p class="sm mt">${escSmart(input.closingThought)}</p>`
    : '';

  return `
<div class="page">
  <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5pt solid var(--ink);padding-bottom:4pt;">
    <span style="font-family:'Fraunces',serif;font-weight:700;font-size:13pt;">The Gist</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-size:5.5pt;color:var(--light);letter-spacing:0.1em;text-transform:uppercase;">${esc(input.dateFormatted)} &middot; Page 2</span>
  </div>

  <div class="cols" style="padding-top:10pt;border-top:none;">
    <div class="c">
      ${bodyMindHtml(input)}
      <hr class="hr">
      ${practiceArcHtml(input)}
      <hr class="hr">
      ${moonHighlightHtml(input)}
      ${closingThought}
    </div>
    <div class="c">
      <div class="label">Morning Intention</div>
      <p class="xs it mt">${escSmart(input.intentionPrompt)}</p>
      <div class="wl"></div>
      <div class="wl"></div>
      <div class="wl"></div>
      <hr class="hr">
      ${faxBackHtml(input)}
      <hr class="hr">
      ${quoteHtml(input.personalQuote, '10pt')}
    </div>
  </div>

  <div class="ft">
    <span>The Gist &middot; Page 2</span>
    <span>&#9789; ${esc(input.seasonFooter)} &middot; ${esc(input.moonFooter)}</span>
    <span>&copy; 2026 mygist.app</span>
  </div>
</div>`;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Build the complete 2-page newspaper HTML.
 * Used for fax, print, PDF, and web preview.
 */
export function buildNewspaperHtml(input: NewspaperTemplateInput): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Gist \u2014 ${esc(input.subscriberName)} \u2014 ${esc(input.dateFormatted)}</title>
<style>${CSS}</style>
</head>
<body>
${page1(input)}
${page2(input)}
</body>
</html>`;
}
