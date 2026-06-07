# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Removed
- **`generateGistPrint` Cloud Function** deleted (and its `generateGistPrint.test.ts`). The endpoint had no callers — the UI "Print" button uses `window.print()` on the rendered page, and nothing linked to the server-rendered print URL. Dropped its `index.ts` export.
- **Historical-rendering `date` query param** on `generateGistPdf`. The only caller (`today.component.ts`) never passed a date, so the param was dead; `generateGistPdf` now always renders today's gist. This also dissolves the latent `volumeIssue` regression (issue #101 P2) — that bug was only reachable via the unused historical path.

### Notes
- The hardcoded-moon regression in `generatePdf`'s `buildTemplateInput` (issue #101 P2) is still live and tracked separately — to be fixed in its own change.

## [0.7.0.0] - 2026-06-07

Phase 1 of the ship plan — generation-quality compression + Danny's ship via email-to-print. The first external user receives a personalized morning newspaper on paper. The system is doing the work, not the founder.

### Added
- **Email delivery from `mygist.app`** — SPF/DKIM verified in Resend, so Gist sends from the real domain rather than the Resend onboarding sender (1.2).
- **`importantPeople` field on `UserPrefs`** — structured people-who-matter context (name, relationship, optional email). `vipSenders` was collapsed into it at the prompt level, and it reads as context rather than a sender filter (1.6).
- **Expanded questionnaire baked into onboarding** — the free-text self-description inputs are captured at signup (1.10, #156).
- **Profile-context derivation (`profile.contextDerived`)** — a Firestore trigger parses each user's free-text self-description into a light `{ work, freeTime, creative, misc }` structure via Claude, fed into the generation prompt to scaffold personalization. The untrusted description is sandboxed in `<self_description>` tags with prompt-injection guards; a `parserVersion` lets stale derivations be re-run later (#156).
- **First external user (Danny)** onboarded and receiving Gist daily via email-to-print (1.11).

### Changed
- Rewrote the Claude system prompt for visible personalization + a helper voice (1.7).
- Wired existing onboarding inputs (`topics`, `rhythms`, `city`, `importantPeople`) through to the prompt context, fixing several years-old data-flow bugs — these inputs were collected at signup but never reached generation (1.6).
- Wired `tone` into the system prompt — previously dead data (1.5).

### Fixed
- `memoryContext` now properly wrapped in `<memory>` tags per the system-prompt contract (1.4).
- Page 2 (reflection) now renders in the email template — was missing entirely (Issue #119).

### Removed
- `oneThing` field removed from types, schema, prompt, and UI everywhere (Issue #148).

### Notes
- Danny is the first user not named Mary to use Gist daily.
- Print is the experience from Day 1 — Gmail filter → printer's email-to-print address. The SBC daemon, for users without an email-to-print printer, is future work (Phase 8 of `SHIP_PLAN.md`).

## [0.6.0.0] - 2026-05-23

Phase 6 (onboarding slim-down + docs rewrite). Closes out the prune-and-realign plan. The product story now matches the code — every sentence in DESIGN.md and README describes what's actually running. Onboarding's last commerce remnant is gone; delivery time picker no longer pretends mornings are the only valid choice.

### Changed
- **Onboarding step 4** reworked: dropped the Paper / \$25-per-month vs Web+Email Free pricing chooser; replaced with informational copy describing the email + web delivery model. Time picker lifted the morning-only constraint (was 5–11 AM hardcode) — now a standard `[1–12] : [00/15/30/45] [AM/PM]` shape, full 24-hour range. The 4-page onboarding structure stays — each page is a coherent input chunk and the integrations page is meant to grow.
- `deliveryMethod` state field dropped from onboarding; runtime `resolveDeliveryMethod()` is the source of truth (\`'email'\` if Gmail connected, \`'web'\` otherwise). `user.delivery.method` had zero readers in either functions or src.
- **DESIGN.md** thesis rewritten for email-to-print primary, SBC daemon future. Page 2 reflection note: "Fax Back checkboxes/write lines" → "reflection writing space". Output channel list, anti-patterns, and Decisions Log entry for the two-page structure all updated. Added a new Delivery Infrastructure section documenting the email-to-print primary path and the future SBC daemon path. Aesthetic system (typography, color, spacing, motion, paper grain, production marks) intentionally untouched — those still describe the product accurately.
- **README.md** rewritten from Angular CLI boilerplate + outdated punch list into a one-screen description of what Gist is, the stack, doc pointers, and the dev/deploy commands that actually matter.
- **TODOS.md** pruned to forward-looking items only — per-user delivery time, email feedback loop, domain setup for email delivery. The Completed section dropped entirely; CHANGELOG.md is the canonical record.

### Added
- **DESIGN.md** Decisions Log entry (2026-05-21): "Pruned fax + Stripe; realigned to email-to-print primary + SBC daemon future."
- `deliveryHour24` getter on the onboarding component to derive the 24-hour value from the displayed 12-hour selector + AM/PM meridiem.

### Removed
- TODOS items now N/A: onboarding → Stripe checkout redirect; Phaxio webhook no-callback timeout; Anthropic vs OpenAI evaluation; Tier 2 fax cost modeling; evening gist MVP; referral invite system.
- TODOS Completed section (Phaxio webhook validation, Stripe billing gate, fax idempotency, completed PDF download with fax-template framing) — preserved historically in earlier CHANGELOG entries instead.
- README broken link to deleted `gist-v1-launch-spec.md`. README "Next Steps" / "Doing" punch list referencing `plan.model`, `evening`, `user-profile.service` and other deleted artifacts.
- "Old fax template had a cover page" archaeology note from DESIGN.md anti-patterns.

### Notes
- Phase 6 closes the prune-and-realign plan. Phase 7 (lock email-to-print for daily delivery — real sender domain, printer testing, 7-day self-validation) and Phase 8 (SBC daemon design) are future work, out of scope here.
- The audit (#139) surfaced two scope changes from the original plan: onboarding's "Plan Selection" and "Stripe checkout stub" were already gone (some earlier sweep removed them); `gist-v1-launch-spec.md` is also already gone; \`CLAUDE.md\` was already clean. The plan was written from an older snapshot than what the code actually looked like.

## [0.5.0.0] - 2026-05-23

Phase 5 (schema + types cleanup). The data model now matches what the app actually uses. `GistPlan`, the `plan` field, Stripe subscription fields, and `faxNumber` are gone from both the functions `UserDoc` and the Angular `GistUser`. The live Firestore user doc was migrated locally to match. The `UserDoc` type now describes what a user actually has: identity, prefs, delivery, integrations, profile, gistIssueCount. Nothing commerce, nothing fax.

### Removed
- `GistPlan` type — deleted from `functions/src/types.ts` and `src/app/core/models/user.model.ts`.
- `src/app/core/models/plan.model.ts` — whole file (it only re-declared `GistPlan`).
- `plan` field from `UserDoc` (functions) and `GistUser` (Angular).
- `stripeCustomerId` and `stripeSubscriptionStatus` fields from `UserDoc`.
- `faxNumber` field from `UserDelivery`.
- `'received'` status from `DeliveryLog.status` union — Phaxio webhook concept, no longer reachable.
- Residual `buildUserDoc` reads of `data.plan`, `data.stripeCustomerId`, `data.stripeSubscriptionStatus` in `generateMorningGist.ts` and `generateGistOnDemand.ts`.
- `plan`-field update guard from `firestore.rules` — the field no longer exists, so the rule was vestigial.
- Plans breakdown admin UI in `admin.component.ts` + `admin.component.html` (`planBreakdown` field, plan-counting loop, `planKeys()` helper, and the corresponding card markup). With `plan` gone from `GistUser`, the entire section was dead.
- `'received'` from the runtime `status → CSS class` arrays in `delivery.component.ts` and `today.component.ts`.

### Changed
- `resolveDeliveryMethod` test suite consolidated: seven repetitive cases (varying `plan` to prove plan was ignored) collapsed into three concise cases. The "never returns fax" paranoia test was deleted — `DeliveryMethod` is already narrowed to `'web' | 'email'` at the type level, so the assertion was type-impossible.
- Live Firestore user doc migrated to match the new schema — `plan`, `stripeCustomerId`, `stripeSubscriptionStatus`, and `delivery.faxNumber` removed via a local one-off script (not committed; lives in untracked `scripts/`).

### Notes
- `printerEmail` env config (originally planned for Phase 5) deferred to Phase 7 where the actual printer testing happens. Adding plumbing without a real consumer would be dead code.
- `scripts/.env` was created during the migration setup. The `/scripts` wholesale gitignore covers it; no additional `.env` rules were added (YAGNI — would only matter if `/scripts` is ever narrowed).
- The migration script stays on disk locally as a personal one-off — not project-shared knowledge worth tracking in git long-term.

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
- The intention-prompt + writing-lines layout had visual unevenness in the rendered output (#122). Fixed: the internal `<hr>` that broke the 18pt line grid was removed, the two line groups consolidated into a single continuous block of 9 evenly spaced ruled lines, and the intention prompt given a controlled 6pt gap above the lines.

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

