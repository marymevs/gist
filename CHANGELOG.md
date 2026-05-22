# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0.0] - 2026-05-22

Phase 1 of the prune-and-realign plan — pivoting from fax-first delivery to email-to-print as the primary delivery path. Stripe billing was also retired (no charging during the solo-dogfooding phase). The codebase is now ~200 LOC lighter in the daily generation path with no functional regression for the active delivery route.

### Removed
- Cloud Function exports for `createCheckoutSession`, `createPortalSession`, `stripeWebhook`, `stripeWebhookV2`, `stripeCreateCheckout`, `faxWebhook`, `sendTestFax` — 7 functions no longer deployed.
- Fax delivery branch in `generateMorningGistForUser` (skip-if-no-fax-number, duplicate-fax idempotency, payment-paused notification flow).
- Stripe billing gate in `generateMorningGistForUser` (no-subscription skip + Stripe-down graceful degradation).
- Legacy-users scheduler fallback — users without `nextDeliveryAt` are no longer auto-picked-up via the `onboardingComplete` query.
- `else if (method === 'fax')` delivery dispatch branch.
- `PHAXIO_API_KEY` / `PHAXIO_API_SECRET` secret bindings from all three Cloud Function entry points (`generateMorningGist`, `generateGistOnDemand`, `resendMorningGist`).
- `print → fax` routing in `resolveDeliveryMethod` — it now always returns `email` (when Gmail is connected) or `web`.

### Fixed
- Firebase Admin app is now initialized before any module-top-level `getFirestore()` call. `ensureFirebaseApp()` is called at the top of `functions/src/index.ts`, and `firestoreUtils.ts` uses the guarded `getDb()` helper. Resolves the `FirebaseAppError: default Firebase app does not exist` error that had been blocking deploys.

### Notes
- The fax/Stripe implementation files still exist on disk — they're deleted in Phase 3.
- The `DeliveryMethod` type union still includes `'fax'` and the `MorningGist.delivery.method` field still allows it — narrowing happens in Phase 5 alongside the broader schema cleanup.
- `OPENAI_API_KEY` is still wired into `resendMorningGist`'s secrets array — cleanup belongs to Phase 3 when `openai*.ts` files get deleted.

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

