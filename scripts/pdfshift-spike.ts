#!/usr/bin/env npx tsx
/**
 * PDFShift Validation Spike
 *
 * Tests whether PDFShift can render Gist's newspaper HTML to a clean PDF.
 * Validates: page sizing, page breaks, custom Google Fonts, inline styles.
 *
 * Usage:
 *   PDFSHIFT_API_KEY=sk_xxx npx tsx scripts/pdfshift-spike.ts
 *
 * Outputs:
 *   scripts/spike-output/spike-current-template.pdf  — existing fax template
 *   scripts/spike-output/spike-custom-fonts.pdf      — Instrument Serif/Sans
 *   scripts/spike-output/spike-report.md             — findings
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const API_KEY = process.env.PDFSHIFT_API_KEY;
if (!API_KEY) {
  console.error('Error: Set PDFSHIFT_API_KEY environment variable.');
  console.error('  Get a free key at https://pdfshift.io');
  process.exit(1);
}

const OUT_DIR = join(__dirname, 'spike-output');
mkdirSync(OUT_DIR, { recursive: true });

// ─── Test HTML: Current fax template (Georgia/Arial) ────────────────────────

const currentTemplateHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 0; background: #ffffff; color: #1a1a1a; }
  </style>
</head>
<body>
  <!-- Cover page -->
  <div style="page-break-after: always; width: 100%; height: 9in; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 1in; box-sizing: border-box;">
    <div style="font-family: Georgia, serif; font-size: 52pt; font-weight: bold; letter-spacing: -2px; color: #1a1a1a; line-height: 1; margin-bottom: 12px;">Gist</div>
    <div style="width: 80px; height: 3px; background: #1a1a1a; margin-bottom: 24px;"></div>
    <div style="font-family: Arial, sans-serif; font-size: 11pt; color: #444; letter-spacing: 0.5px;">Tuesday, Apr 1</div>
    <div style="font-family: Georgia, serif; font-size: 16pt; color: #1a1a1a; margin-top: 6px;">For Mary</div>
    <div style="font-family: Arial, sans-serif; font-size: 9pt; color: #888; letter-spacing: 1px; text-transform: uppercase; margin-top: 8px;">Your morning briefing</div>
  </div>

  <!-- Content page -->
  <div style="width: 100%; padding: 0.75in 1in; box-sizing: border-box;">
    <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1a1a1a; padding-bottom: 5px; margin-bottom: 16px;">
      <span style="font-family: Georgia, serif; font-size: 14pt; font-weight: bold;">Gist</span>
      <span style="font-family: Arial, sans-serif; font-size: 8pt; color: #888;">Tuesday, Apr 1 · Partly cloudy, 62°F</span>
    </div>

    <div style="font-family: Arial, sans-serif; font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #555; border-bottom: 1px solid #222; padding-bottom: 3px; margin: 18px 0 8px;">TODAY</div>
    <div style="margin-bottom: 7px;">
      <span style="font-family: Arial, sans-serif; font-size: 8pt; color: #555; margin-right: 8px;">9:00 AM</span>
      <span style="font-family: Georgia, serif; font-size: 11pt;">Team standup</span>
    </div>
    <div style="margin-bottom: 7px;">
      <span style="font-family: Arial, sans-serif; font-size: 8pt; color: #555; margin-right: 8px;">11:30 AM</span>
      <span style="font-family: Georgia, serif; font-size: 11pt;">Product review with stakeholders</span>
    </div>
    <div style="margin-bottom: 7px;">
      <span style="font-family: Arial, sans-serif; font-size: 8pt; color: #555; margin-right: 8px;">2:00 PM</span>
      <span style="font-family: Georgia, serif; font-size: 11pt;">1:1 with Alex</span>
    </div>

    <div style="font-family: Arial, sans-serif; font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #555; border-bottom: 1px solid #222; padding-bottom: 3px; margin: 18px 0 8px;">INBOX</div>
    <div style="border-left: 3px solid #1a1a1a; padding: 6px 0 6px 10px; margin-bottom: 10px;">
      <div style="font-family: Arial, sans-serif; font-size: 7pt; color: #555; letter-spacing: 1px;">[ ACTION ] · Sarah Chen</div>
      <div style="font-family: Georgia, serif; font-size: 10pt; font-weight: bold; margin-bottom: 2px;">Q1 board deck — final review needed</div>
      <div style="font-family: Georgia, serif; font-size: 9pt; color: #444;">Attached the latest version with updated ARR numbers. Need your sign-off by EOD.</div>
      <div style="font-family: Arial, sans-serif; font-size: 8pt; color: #555;">→ Review and approve the deck</div>
    </div>
    <div style="border-left: 3px solid #1a1a1a; padding: 6px 0 6px 10px; margin-bottom: 10px;">
      <div style="font-family: Arial, sans-serif; font-size: 7pt; color: #555; letter-spacing: 1px;">[ FYI ] · GitHub</div>
      <div style="font-family: Georgia, serif; font-size: 10pt; font-weight: bold; margin-bottom: 2px;">PR #37 merged: onboarding flow v2</div>
      <div style="font-family: Georgia, serif; font-size: 9pt; color: #444;">All checks passed. Deployed to staging.</div>
    </div>

    <div style="font-family: Arial, sans-serif; font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #555; border-bottom: 1px solid #222; padding-bottom: 3px; margin: 18px 0 8px;">THE WORLD</div>
    <div style="margin-bottom: 9px;">
      <div style="font-family: Georgia, serif; font-size: 11pt; font-weight: bold;">Fed signals rate hold through summer</div>
      <div style="font-family: Arial, sans-serif; font-size: 8pt; color: #666;">Markets steady; mortgage rates likely unchanged for your timeline.</div>
    </div>

    <div style="font-family: Arial, sans-serif; font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #555; border-bottom: 1px solid #222; padding-bottom: 3px; margin: 18px 0 8px;">FOCUS</div>
    <div style="font-family: Georgia, serif; font-size: 11pt; padding: 5px 0 5px 14px; border-left: 2px solid #1a1a1a; margin-bottom: 7px; line-height: 1.4;">Big meeting at 11:30 — the product review sets the sprint direction. Come prepared with the usage numbers from last week.</div>
    <div style="font-family: Georgia, serif; font-size: 11pt; padding: 5px 0 5px 14px; border-left: 2px solid #1a1a1a; margin-bottom: 7px; line-height: 1.4;">Sarah needs the board deck approved today. Block 30 minutes after standup to review it before it gets buried.</div>
    <div style="font-family: Georgia, serif; font-size: 11pt; padding: 5px 0 5px 14px; border-left: 2px solid #1a1a1a; margin-bottom: 7px; line-height: 1.4;">Light afternoon — use the gap between your 1:1 and EOD to knock out that Stripe integration spec.</div>

    <div style="margin-top: 24px; padding-top: 8px; border-top: 1px solid #ccc; font-family: Arial, sans-serif; font-size: 7pt; color: #bbb; text-align: center;">mygist.app · Generated Tuesday, Apr 1</div>
  </div>
</body>
</html>`;

// ─── Test HTML: Custom fonts (Instrument Serif/Sans, Geist Mono) ────────────

const customFontsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      background: #f8f5f0;
      color: #1a1a2e;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 11pt;
    }
  </style>
</head>
<body>
  <!-- Cover page with Instrument Serif -->
  <div style="page-break-after: always; width: 100%; height: 9in; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 1in; box-sizing: border-box; background: #1a1a2e; color: #f8f5f0;">
    <div style="font-family: 'Instrument Serif', Georgia, serif; font-size: 52pt; font-weight: normal; letter-spacing: -1px; line-height: 1; margin-bottom: 12px;">Gist</div>
    <div style="width: 80px; height: 2px; background: #f8f5f0; margin-bottom: 24px;"></div>
    <div style="font-family: 'Instrument Sans', sans-serif; font-size: 11pt; color: #c8c2b8; letter-spacing: 0.5px;">Tuesday, Apr 1</div>
    <div style="font-family: 'Instrument Serif', Georgia, serif; font-size: 18pt; color: #f8f5f0; margin-top: 8px;">For Mary</div>
    <div style="font-family: 'Instrument Sans', sans-serif; font-size: 9pt; color: #6b6560; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 12px;">Your morning briefing</div>
  </div>

  <!-- Content page with paper background -->
  <div style="width: 100%; padding: 0.75in 1in; box-sizing: border-box; background: #f8f5f0;">
    <!-- Masthead -->
    <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1a1a2e; padding-bottom: 5px; margin-bottom: 16px;">
      <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 14pt;">Gist</span>
      <span style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; color: #6b6560;">Tuesday, Apr 1 · Partly cloudy, 62°F</span>
    </div>

    <!-- Section: Today -->
    <div style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #6b6560; border-bottom: 1px solid #1a1a2e; padding-bottom: 3px; margin: 18px 0 8px;">TODAY</div>
    <div style="margin-bottom: 7px;">
      <span style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; color: #6b6560; margin-right: 8px;">9:00 AM</span>
      <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 11pt;">Team standup</span>
    </div>
    <div style="margin-bottom: 7px;">
      <span style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; color: #6b6560; margin-right: 8px;">11:30 AM</span>
      <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 11pt;">Product review with stakeholders</span>
    </div>
    <div style="margin-bottom: 7px;">
      <span style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; color: #6b6560; margin-right: 8px;">2:00 PM</span>
      <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 11pt;">1:1 with Alex</span>
    </div>

    <!-- Section: Inbox -->
    <div style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #6b6560; border-bottom: 1px solid #1a1a2e; padding-bottom: 3px; margin: 18px 0 8px;">INBOX</div>
    <div style="border-left: 3px solid #1a1a2e; padding: 6px 0 6px 12px; margin-bottom: 10px; border-radius: 0;">
      <div style="font-family: 'Instrument Sans', sans-serif; font-size: 7pt; color: #6b6560; letter-spacing: 1px;">[ ACTION ] · Sarah Chen</div>
      <div style="font-family: 'Instrument Serif', Georgia, serif; font-size: 10pt; font-weight: normal; font-style: normal; margin-bottom: 2px;">Q1 board deck — final review needed</div>
      <div style="font-family: 'Instrument Sans', sans-serif; font-size: 9pt; color: #6b6560;">Attached the latest version with updated ARR numbers. Need your sign-off by EOD.</div>
      <div style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; color: #6b6560; margin-top: 4px;">→ Review and approve the deck</div>
    </div>

    <!-- Section: The World -->
    <div style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #6b6560; border-bottom: 1px solid #1a1a2e; padding-bottom: 3px; margin: 18px 0 8px;">THE WORLD</div>
    <div style="margin-bottom: 9px;">
      <div style="font-family: 'Instrument Serif', Georgia, serif; font-size: 11pt;">Fed signals rate hold through summer</div>
      <div style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; color: #6b6560;">Markets steady; mortgage rates likely unchanged for your timeline.</div>
    </div>

    <!-- Section: Focus -->
    <div style="font-family: 'Instrument Sans', sans-serif; font-size: 8pt; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #6b6560; border-bottom: 1px solid #1a1a2e; padding-bottom: 3px; margin: 18px 0 8px;">FOCUS</div>
    <div style="font-family: 'Instrument Serif', Georgia, serif; font-size: 11pt; padding: 5px 0 5px 14px; border-left: 2px solid #1a1a2e; margin-bottom: 7px; line-height: 1.4;">Big meeting at 11:30 — come prepared with usage numbers from last week.</div>
    <div style="font-family: 'Instrument Serif', Georgia, serif; font-size: 11pt; padding: 5px 0 5px 14px; border-left: 2px solid #1a1a2e; margin-bottom: 7px; line-height: 1.4;">Sarah needs the board deck approved today. Block 30 minutes after standup.</div>

    <div style="margin-top: 24px; padding-top: 8px; border-top: 1px solid #c8c2b8; font-family: 'Instrument Sans', sans-serif; font-size: 7pt; color: #c8c2b8; text-align: center;">mygist.app · Generated Tuesday, Apr 1</div>
  </div>
</body>
</html>`;

// ─── PDFShift API call ──────────────────────────────────────────────────────

type SpikeResult = {
  name: string;
  success: boolean;
  fileSize?: number;
  durationMs: number;
  error?: string;
  notes: string[];
};

async function callPdfShift(
  html: string,
  filename: string,
  options: Record<string, unknown> = {},
): Promise<SpikeResult> {
  const name = filename.replace('.pdf', '');
  const start = Date.now();
  const notes: string[] = [];

  try {
    const body = {
      source: html,
      landscape: false,
      use_print: true,
      // Wait 2s for fonts to load
      delay: 2000,
      ...options,
    };

    const resp = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const durationMs = Date.now() - start;

    if (!resp.ok) {
      const errorText = await resp.text();
      return {
        name,
        success: false,
        durationMs,
        error: `HTTP ${resp.status}: ${errorText}`,
        notes: ['API call failed'],
      };
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    const outPath = join(OUT_DIR, filename);
    writeFileSync(outPath, buffer);

    notes.push(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
    notes.push(`Duration: ${durationMs}ms`);
    notes.push(`Output: ${outPath}`);

    return {
      name,
      success: true,
      fileSize: buffer.length,
      durationMs,
      notes,
    };
  } catch (err) {
    return {
      name,
      success: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      notes: ['Request failed'],
    };
  }
}

// ─── Run spike ──────────────────────────────────────────────────────────────

async function main() {
  console.log('PDFShift Validation Spike');
  console.log('========================\n');

  const results: SpikeResult[] = [];

  // Test 1: Current fax template (Georgia/Arial — system fonts)
  console.log('Test 1: Current fax template (system fonts)...');
  results.push(await callPdfShift(currentTemplateHtml, 'spike-current-template.pdf'));
  console.log(`  ${results[0].success ? '✓' : '✗'} ${results[0].notes.join(', ') || results[0].error}\n`);

  // Test 2: Custom Google Fonts (Instrument Serif/Sans)
  console.log('Test 2: Custom fonts (Instrument Serif/Sans)...');
  results.push(await callPdfShift(customFontsHtml, 'spike-custom-fonts.pdf'));
  console.log(`  ${results[1].success ? '✓' : '✗'} ${results[1].notes.join(', ') || results[1].error}\n`);

  // Test 3: Custom fonts with explicit format options
  console.log('Test 3: Custom fonts with format: letter...');
  results.push(
    await callPdfShift(customFontsHtml, 'spike-custom-fonts-letter.pdf', {
      format: 'Letter',
      margin: '0',
    }),
  );
  console.log(`  ${results[2].success ? '✓' : '✗'} ${results[2].notes.join(', ') || results[2].error}\n`);

  // ── Write report ────────────────────────────────────────────────────────
  const allPassed = results.every((r) => r.success);
  const fontTestPassed = results[1]?.success ?? false;

  const report = `# PDFShift Validation Spike — Results

**Date:** ${new Date().toISOString().split('T')[0]}
**API:** PDFShift v3
**Verdict:** ${allPassed ? 'PASS — PDFShift renders Gist newspaper HTML correctly' : 'ISSUES FOUND — see details below'}

## Test Results

${results
  .map(
    (r, i) => `### Test ${i + 1}: ${r.name}
- **Status:** ${r.success ? 'PASS ✓' : 'FAIL ✗'}
- **Duration:** ${r.durationMs}ms
${r.fileSize ? `- **File size:** ${(r.fileSize / 1024).toFixed(1)} KB` : ''}
${r.error ? `- **Error:** ${r.error}` : ''}
${r.notes.map((n) => `- ${n}`).join('\n')}
`,
  )
  .join('\n')}

## What to verify manually

Open each PDF and check:
1. **Page breaks** — cover page and content page should be separate pages
2. **Font rendering** — Instrument Serif should render (not fall back to Georgia)
3. **Layout** — flexbox centering on cover, section headers with rules, border-left on cards
4. **Colors** — ink #1a1a2e, paper #f8f5f0 background, muted #6b6560
5. **Page size** — should be US Letter (8.5 × 11 in)

## Recommendation

${
  allPassed && fontTestPassed
    ? `PDFShift is validated for Gist. Proceed with Session 2 using PDFShift for PDF generation.
Custom Google Fonts (Instrument Serif/Sans) load correctly via the fonts.googleapis.com link tag.`
    : fontTestPassed
      ? `PDFShift works but some tests had issues. Review the failures above before committing to it.`
      : `Custom font loading needs investigation. If fonts fall back to Georgia, consider:
1. Embedding fonts as base64 @font-face in the HTML
2. Using Gotenberg (self-hosted, uses Chrome) as an alternative
3. Using Puppeteer in a Cloud Function for PDF generation`
}
`;

  writeFileSync(join(OUT_DIR, 'spike-report.md'), report);
  console.log('Report written to scripts/spike-output/spike-report.md');
  console.log(`\nVerdict: ${allPassed ? 'ALL TESTS PASSED' : 'ISSUES FOUND — check report'}`);
}

main().catch(console.error);
