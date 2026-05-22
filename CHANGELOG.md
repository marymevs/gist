# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0.0] - 2026-05-22

Phase 4 (newspaper template prune). Fax-back questions are fully removed from the generation pipeline. Page 2's right column is now a pure reflection space — morning intention prompt followed by ruled writing lines, then the personal quote. The two-page editorial weight stays. Newspaper generation no longer has a silent fallback — failures throw.

### Removed
- `faxBackQuestionSchema` and `faxBackQuestions` field from `newspaperTypes.ts` — Claude no longer generates end-of-day checkbox questions.
- `faxBackQuestions` from `claudeNewspaper.ts` — prompt JSON example, schema rules, fallback object, and header comment.
- `faxBackHtml()` function from `newspaperTemplate.ts` and its call site in Page 2.
- "Newspaper generation failed, falling back to legacy format" try/catch in `generateMorningGist.ts` — failures now surface immediately rather than silently producing a partial gist.

### Changed
- Page 2 right column: fax-back checkboxes replaced with a continuous reflection space — morning intention prompt + 3 writing lines, then a horizontal rule, then 6 blank ruled writing lines, then the personal quote.
- `newspaperData` in `generateMorningGist.ts` is now `const` (was `let`/`undefined`-typed) since it's no longer conditionally assigned.

### Notes
- Ticket 4.6 (snapshot test for Page 2 reflection layout) was closed without implementation — the proposed assertions were paranoid rather than structural and would have aged poorly. A codebase grep is the right tool for the regression fear.
- The intention-prompt + writing-lines layout has visual unevenness in the rendered output. Tracked in #122.

## [0.3.0.0] - 2026-05-22

Phase 2 (frontend prune) and Phase 3 (backend file deletion) land together. The Angular app no longer shows any fax/Stripe UI. All fax and Stripe implementation files are deleted from the functions codebase. Claude is the sole LLM. The newspaper template is the sole email renderer. The codebase now reflects what actually runs.

### Removed (Phase 2 — frontend)
- Evening gist feature (`/evening` route and component) — YAGNI; revive later.
- Fax number form and "Update fax" button from Account page.
- Stripe portal / upgrade section from Account page.
- Fax delivery card from Delivery settings page.
- Plan picker grid from Signup page.
- Fax-back questions rendering from Today page.
- "Fax + Web" delivery label from Today, Landing, Privacy, and Terms pages.
- "Billing lives here" subtitle from Account page.
- Subscriptions and Billing section from Terms of Service.
- `user-profile.service.ts` — confirmed zero importers.

### Removed (Phase 3 — backend)
- `faxDelivery.ts`, `faxWebhook.ts`, `faxTemplate.ts`, `testFax.ts`, `delivery/fax.ts` — fax delivery implementation.
- `billing/` directory, `stripeWebhook.ts`, `stripeCheckout.ts`, `stripeUtils.ts` — Stripe billing implementation.
- `openaiGist.ts`, `openaiEmail.ts`, `openaiUtils.ts` — OpenAI integration (Claude is the sole LLM).
- `emailTemplate.ts` — legacy email template, superseded by `newspaperEmailTemplate.ts`.
- `morningGistRouting.test.ts` — stale test with an inlined copy of `resolveDeliveryMethod`.
- `deliverByFax` re-export from `delivery/index.ts`.

### Changed (Phase 3 — backend)
- `generateGistPrint.ts` and `integrations/generatePdf.ts` ported from `buildFaxHtml` to `buildNewspaperHtml`. Both now read `gist.newspaper` from Firestore and return 422 loudly if the field is missing.
- `delivery/email.ts`: legacy flat-field `else` branch removed. Throws if `newspaperInput` is absent — no silent fallback.
- `firestoreUtils.ts`: `DeliveryMethod` narrowed to `'web' | 'email'`; JSDoc references to the deleted fax webhook removed.
- `types.ts`: `DeliveryMethod` narrowed to match.
- `resendMorningGist.ts`: `OPENAI_API_KEY` import and secret binding removed.
- `firestore.rules`: stale "Stripe webhook" comment removed from `plan`-field update rule. `TODO(phase-5)` marker added.

### Added
- "Generate on demand" button on `/today` toolbar — calls `generateGistOnDemand` directly against the deployed function, updates the page via the Firestore real-time listener.

### Notes
- `claudeEmail.ts` was NOT deleted — still imported by `gmailInt.ts` for email classification.
- Residual `stripeCustomerId` / `stripeSubscriptionStatus` field reads in `generateMorningGist.ts` and `generateGistOnDemand.ts` are data-model leftovers addressed in Phase 5.
- The `plan` guard in `firestore.rules` stays until Phase 5 removes the field from the schema.

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

