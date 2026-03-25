/**
 * Newspaper-style HTML email template for the morning Gist briefing.
 *
 * Design: Georgia serif, two-column (calendar+email left | world right),
 * dark header, intentionally not-app-looking. Table-based for email client compat.
 */

export type EmailTemplateInput = {
  date: string; // e.g. "Wednesday, Mar 25"
  weatherSummary: string;
  dayItems: { time?: string; title: string; note?: string }[];
  worldItems: { headline: string; implication: string }[];
  emailCards: {
    fromName?: string;
    fromEmail?: string;
    subject: string;
    snippet: string;
    category: 'Action' | 'WaitingOn' | 'FYI';
    why: string;
    suggestedNextStep?: string;
  }[];
  gistBullets: string[];
};

// ─── colour tokens ────────────────────────────────────────────────────────────
const C = {
  black: '#1a1a1a',
  white: '#ffffff',
  paper: '#f5f4f0',
  rule: '#d4d0c8',
  mutedText: '#888888',
  actionBg: '#fff8f0',
  actionBorder: '#c0622a',
  waitingBg: '#fffbf0',
  waitingBorder: '#b8960a',
  fyiBg: '#f8f8f8',
  fyiBorder: '#888888',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionLabel(text: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:2px;
    color:${C.mutedText};text-transform:uppercase;margin:0 0 10px 0;
    padding-bottom:5px;border-bottom:1px solid ${C.rule};">${esc(text)}</div>`;
}

function dayItemsHtml(items: EmailTemplateInput['dayItems']): string {
  if (!items.length) {
    return `<p style="font-size:13px;color:${C.mutedText};margin:0 0 8px 0;font-style:italic;">No events today.</p>`;
  }
  return items
    .map((item) => {
      const time = item.time
        ? `<span style="font-family:Arial,sans-serif;font-size:11px;color:${C.mutedText};display:block;margin-bottom:1px;">${esc(item.time)}</span>`
        : '';
      const note = item.note
        ? `<span style="font-family:Arial,sans-serif;font-size:11px;color:${C.mutedText};display:block;margin-top:2px;">${esc(item.note)}</span>`
        : '';
      return `<div style="margin-bottom:10px;">${time}<span style="font-size:13px;color:${C.black};">${esc(item.title)}</span>${note}</div>`;
    })
    .join('');
}

function emailCardHtml(card: EmailTemplateInput['emailCards'][number]): string {
  const borders: Record<string, string> = {
    Action: C.actionBorder,
    WaitingOn: C.waitingBorder,
    FYI: C.fyiBorder,
  };
  const bgs: Record<string, string> = {
    Action: C.actionBg,
    WaitingOn: C.waitingBg,
    FYI: C.fyiBg,
  };

  const border = borders[card.category] ?? C.fyiBorder;
  const bg = bgs[card.category] ?? C.fyiBg;

  const from = card.fromName ?? card.fromEmail ?? '';
  const fromHtml = from
    ? `<div style="font-family:Arial,sans-serif;font-size:10px;color:${C.mutedText};margin-bottom:2px;">${esc(from)}</div>`
    : '';

  const step = card.suggestedNextStep
    ? `<div style="font-family:Arial,sans-serif;font-size:11px;color:${C.black};margin-top:4px;font-style:italic;">${esc(card.suggestedNextStep)}</div>`
    : '';

  return `<div style="border-left:3px solid ${border};background:${bg};
    padding:8px 10px;margin-bottom:8px;">
    ${fromHtml}
    <div style="font-size:13px;font-weight:bold;color:${C.black};margin-bottom:3px;">${esc(card.subject)}</div>
    <div style="font-family:Arial,sans-serif;font-size:11px;color:#555;margin-bottom:3px;">${esc(card.why)}</div>
    ${step}
  </div>`;
}

function emailCardsByCategory(cards: EmailTemplateInput['emailCards']): string {
  const categories: Array<{ key: 'Action' | 'WaitingOn' | 'FYI'; label: string }> = [
    { key: 'Action', label: 'Action needed' },
    { key: 'WaitingOn', label: 'Waiting on' },
    { key: 'FYI', label: 'FYI' },
  ];

  const parts: string[] = [];

  for (const { key, label } of categories) {
    const group = cards.filter((c) => c.category === key);
    if (!group.length) continue;
    parts.push(sectionLabel(label));
    parts.push(group.map((c) => emailCardHtml(c)).join(''));
  }

  if (!parts.length) {
    return `<p style="font-family:Arial,sans-serif;font-size:12px;color:${C.mutedText};margin:0;font-style:italic;">No email signals today.</p>`;
  }

  return parts.join('');
}

function worldItemsHtml(items: EmailTemplateInput['worldItems']): string {
  if (!items.length) {
    return `<p style="font-family:Arial,sans-serif;font-size:12px;color:${C.mutedText};margin:0;font-style:italic;">No news today.</p>`;
  }
  return items
    .map(
      (item) => `
    <div style="margin-bottom:14px;">
      <div style="font-size:13px;font-weight:bold;color:${C.black};line-height:1.4;margin-bottom:3px;">${esc(item.headline)}</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#555;line-height:1.5;">${esc(item.implication)}</div>
    </div>`,
    )
    .join('');
}

function bulletsHtml(bullets: string[]): string {
  return bullets
    .map(
      (b) => `<div style="margin-bottom:8px;padding-left:14px;position:relative;">
      <span style="position:absolute;left:0;color:${C.mutedText};">—</span>
      <span style="font-size:13px;color:${C.black};line-height:1.5;">${esc(b)}</span>
    </div>`,
    )
    .join('');
}

// ─── main export ──────────────────────────────────────────────────────────────

export function buildEmailHtml(input: EmailTemplateInput): string {
  const actionCards = input.emailCards.filter((c) => c.category === 'Action');
  const hasEmailCards = input.emailCards.length > 0;
  const subjectSuffix = actionCards.length
    ? ` — ${actionCards.length} action${actionCards.length > 1 ? 's' : ''}`
    : '';

  // Expose a subject line the caller can use
  void subjectSuffix; // used by caller via buildEmailSubject

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Your Gist — ${esc(input.date)}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;">

<!-- wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:${C.paper};padding:24px 0;">
<tr><td align="center">

<!-- card -->
<table width="600" cellpadding="0" cellspacing="0" border="0"
  style="background:${C.white};border:1px solid ${C.rule};max-width:600px;">

  <!-- ── HEADER ── -->
  <tr>
    <td colspan="3"
      style="background:${C.black};padding:20px 28px;text-align:center;">
      <div style="font-family:Georgia,serif;font-size:30px;letter-spacing:6px;
        color:${C.white};font-weight:bold;text-transform:uppercase;margin-bottom:6px;">GIST</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#aaaaaa;
        letter-spacing:1px;">${esc(input.date)}</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#888888;
        margin-top:4px;">${esc(input.weatherSummary)}</div>
    </td>
  </tr>

  <!-- ── BODY: two columns ── -->
  <tr>

    <!-- LEFT: calendar + email -->
    <td width="310" valign="top"
      style="padding:20px 20px 20px 24px;border-right:1px solid ${C.rule};">

      ${sectionLabel('Today')}
      ${dayItemsHtml(input.dayItems)}

      ${hasEmailCards ? `<div style="margin-top:18px;">${emailCardsByCategory(input.emailCards)}</div>` : ''}

    </td>

    <!-- RIGHT: world news -->
    <td width="250" valign="top" style="padding:20px 20px 20px 18px;">

      ${sectionLabel('World')}
      ${worldItemsHtml(input.worldItems)}

    </td>

  </tr>

  <!-- ── GIST BULLETS ── -->
  <tr>
    <td colspan="2"
      style="background:${C.paper};padding:18px 24px;border-top:2px solid ${C.black};">
      <div style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:2px;
        color:${C.mutedText};text-transform:uppercase;margin-bottom:12px;">Your gist</div>
      ${bulletsHtml(input.gistBullets)}
    </td>
  </tr>

  <!-- ── FOOTER ── -->
  <tr>
    <td colspan="2"
      style="padding:12px 24px;border-top:1px solid ${C.rule};">
      <p style="font-family:Arial,sans-serif;font-size:10px;color:${C.mutedText};
        margin:0;text-align:center;">
        Gist — your morning briefing
      </p>
    </td>
  </tr>

</table>
<!-- /card -->

</td></tr>
</table>
<!-- /wrapper -->

</body>
</html>`;
}

export function buildEmailSubject(input: Pick<EmailTemplateInput, 'date' | 'emailCards'>): string {
  const actionCards = input.emailCards.filter((c) => c.category === 'Action');
  if (actionCards.length) {
    return `Your Gist — ${input.date} (${actionCards.length} action${actionCards.length > 1 ? 's' : ''})`;
  }
  return `Your Gist — ${input.date}`;
}
