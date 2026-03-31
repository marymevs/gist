# PDFShift Validation Spike — Results

**Date:** 2026-03-31
**API:** PDFShift v3
**Verdict:** PASS — PDFShift renders Gist newspaper HTML correctly

## Test Results

| Test | Description | Status | Duration | Size |
|------|-------------|--------|----------|------|
| 1 | Current fax template (Georgia/Arial) | PASS | 3948ms | 70.8 KB |
| 2 | Custom fonts (Instrument Serif/Sans) | PASS | 3679ms | 62.7 KB |
| 3 | Custom fonts with format: Letter | PASS | 3433ms | 62.7 KB |

## Visual Verification (manual check of output PDFs)

1. **Page breaks** — PASS. Cover page and content page render as separate pages in all 3 tests.
2. **Font rendering** — PASS. Instrument Serif renders correctly on cover ("Gist" wordmark, "For Mary") and content page (event titles, headlines, focus bullets). Clearly distinct from Georgia fallback.
3. **Layout** — PASS. Flexbox centering on cover page works. Section headers with border-bottom rules, border-left on inbox cards and focus bullets all render.
4. **Colors** — PASS. Ink (#1a1a2e) cover page background, paper (#f8f5f0) content background, muted (#6b6560) secondary text all render correctly.
5. **Page size** — PASS. US Letter dimensions.

## Key Findings

- **Google Fonts load via `<link>` tag** — no need for base64 @font-face embedding. The `delay: 2000` parameter gives fonts time to load.
- **Latency is ~3.5s per conversion** — acceptable for async delivery pipeline (not blocking user).
- **`format: Letter` and `@page { size: letter }` both work** — either approach produces correct page sizing.
- **Flexbox is fully supported** — cover page vertical centering works.
- **`-webkit-print-color-adjust: exact`** respected — background colors render.

## API Notes

- `wait_for` expects a CSS selector, not a number. Use `delay` (milliseconds) for timed waits.
- Auth: Basic auth with `api:YOUR_KEY` base64-encoded.
- Free tier: 50 conversions/month (sufficient for development + low-volume MVP).

## Recommendation

PDFShift is validated for Gist. Use it in Session 2 for PDF generation in the delivery pipeline.
No need to evaluate Gotenberg or Puppeteer alternatives.
