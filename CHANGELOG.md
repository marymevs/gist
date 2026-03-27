# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.0] - 2026-03-27

### Added
- **Stripe billing**: You can now subscribe via Stripe checkout. Payment lifecycle events (paid, failed, canceled) are handled automatically, with a fail-open billing gate so a Stripe outage won't interrupt your morning gist.
- **Fax delivery confirmation**: Phaxio now sends a signed webhook back when your fax is delivered. The app verifies the signature, records the result, and won't double-count the same callback.
- **PDF download**: A new "Download PDF" button on the Today page opens your morning gist as a clean, print-ready page in a new tab — same newspaper layout as the fax.
- **Onboarding flow**: New users are guided through plan selection, delivery preferences, and account setup at `/onboarding` before reaching the app.
- **Fax number in account settings**: Print plan users can now enter and save their fax number directly from the Account page.
- **Payment-failure alerts**: If a payment fails, you receive a fax + email notification. The alert fires once per failure — not every morning.
- **VERSION file**: Version tracking starts at `0.1.0.0`.

### Changed
- `generateMorningGist` marks delivery as `paused` before sending a payment-paused notification, so the same alert doesn't fire again if the scheduler re-runs that day.
- Fax notifications use the generic name "Subscriber" — your email address never appears on the physical fax.
- Email notification failures now log a warning rather than silently dropping the error.

### Fixed
- Preserved both `onSavePreferences` and `onChangePlan`/`onViewInvoices` in `account.component.ts` when merging branches.
- Download PDF button inserted correctly in the Today toolbar after an upstream redesign.
- Design tokens (`min-height: 44px`, `font-family: var(--font-body)`) from main were used over branch overrides during merge.

