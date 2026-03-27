# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.0] - 2026-03-27

### Added
- **Stripe billing integration**: subscription checkout via `/api/stripeCreateCheckout`, webhook handler for payment lifecycle events (paid, failed, canceled), fail-open billing gate cached in Firestore
- **Phaxio fax webhook**: HMAC-SHA256 signature verification, idempotency guard (status written to Firestore), fax status written to `deliveryLogs` sub-collection
- **PDF download**: `/api/generateGistPdf` Cloud Function renders today's Morning Gist as print-ready HTML in a new tab
- **Onboarding flow**: multi-step onboarding component at `/onboarding`, collects plan selection, delivery preferences, and account setup
- **Fax number input**: account UI now shows fax number field for Print plan users, persisted to Firestore
- **Payment-failure notifications**: screenless-safe billing alert sent via fax + email when Stripe payment fails, with idempotency guard to prevent daily re-notifications
- **Billing utilities**: `stripeUtils.ts` with shared Stripe client, plan validation, and Firestore billing status helpers
- **VERSION file**: initial version tracking at `0.1.0.0`

### Changed
- `generateMorningGist`: writes `delivery.status: 'paused'` before sending payment-paused notifications to prevent re-notification on same-day re-runs
- Notification fax uses generic `'Subscriber'` display name (avoids leaking email local-part on physical fax)
- Silent email notification failure now logs a warning instead of swallowing the error

### Fixed
- Merge conflict in `account.component.ts`: both `onSavePreferences` (upstream) and `onChangePlan`/`onViewInvoices` (feature branch) preserved
- Merge conflict in `today.component.html`: upstream toolbar redesign preserved; Download PDF button inserted correctly
- Merge conflict in `styles.css`: upstream design tokens (`min-height: 44px`, `font-family: var(--font-body)`) used over branch overrides

